// api/ai-analyze.js
// MuniBot con contexto real de datos de la DB
// Cuando el usuario pregunta algo, este endpoint:
//   1. Detecta el módulo relevante
//   2. Consulta los datos reales en Neon
//   3. Construye un prompt rico con datos reales
//   4. Llama al LLM y devuelve respuesta inteligente

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Keywords para detectar módulo desde la pregunta
const MODULE_KEYWORDS = {
  rrhh:         ['empleado','personal','sueldo','salario','rrhh','legajo','hora extra','ausentismo','planilla','nomina','nómina','licencia'],
  hacienda:     ['gasto','ingreso','egreso','recaudacion','recaudación','hacienda','caja','tesorería','tesoreria','balance','financiero'],
  presupuesto:  ['presupuesto','partida','ejecutado','disponible','ejecucion','ejecución'],
  obras:        ['obra','infraestructura','construccion','construcción','proyecto','avance','licitacion','pavimento'],
  licitaciones: ['licitacion','licitación','contrato','proveedor','adjudicacion','adjudicación','compra','pliego'],
  vecinos:      ['reclamo','vecino','denuncia','311','barrio','queja','servicio','luminaria','bache','residuo'],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.MUNI_HF_TOKEN;
  if (!token) return res.status(500).json({ error: 'AI no configurado' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message requerido' });

  const lowerMsg = message.toLowerCase();
  const period = getCurrentPeriod();

  try {
    // 1. Detect relevant modules from question
    const relevantModules = Object.entries(MODULE_KEYWORDS)
      .filter(([, keywords]) => keywords.some(k => lowerMsg.includes(k)))
      .map(([mod]) => mod);

    // 2. Fetch real data from Neon for relevant modules
    let dataContext = '';
    let hasRealData = false;

    for (const mod of relevantModules.slice(0, 3)) {
      try {
        // Get latest dataset info
        const [datasetInfo] = await sql`
          SELECT id, filename, row_count, period, created_at
          FROM datasets
          WHERE module = ${mod}
          ORDER BY created_at DESC
          LIMIT 1
        `;

        if (datasetInfo) {
          hasRealData = true;
          // Get a sample of data points
          const dataPoints = await sql`
            SELECT data FROM data_points
            WHERE module = ${mod}
            ORDER BY created_at DESC
            LIMIT 50
          `;

          const rows = dataPoints.map(d => d.data);
          const summary = buildDataSummary(mod, rows, datasetInfo);
          dataContext += `\n## Datos reales de ${mod.toUpperCase()} (${datasetInfo.period}):\n${summary}\n`;
        }
      } catch (dbErr) {
        console.warn(`DB query error for ${mod}:`, dbErr.message);
      }
    }

    // Also get latest intelligence reports if available
    try {
      const reports = await sql`
        SELECT type, result, ai_summary, alert_level, created_at
        FROM intelligence_reports
        WHERE created_at > NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT 5
      `;

      if (reports.length > 0) {
        dataContext += '\n## Análisis cruzados recientes:\n';
        reports.forEach(r => {
          dataContext += `- ${r.type} (${r.alert_level}): ${r.ai_summary || JSON.stringify(r.result).substring(0, 100)}\n`;
        });
        hasRealData = true;
      }
    } catch (e) { /* ignore */ }

    // 3. Build rich system prompt with real data
    const SYSTEM = buildSystemPrompt(dataContext, hasRealData);

    // 4. Call LLM with real data context
    const MODELS = [
      'Qwen/Qwen2.5-72B-Instruct',
      'meta-llama/Llama-3.3-70B-Instruct',
    ];

    let response = null;

    for (const modelId of MODELS) {
      try {
        const hfRes = await fetch(
          `https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: message }
              ],
              max_tokens: 700,
              temperature: 0.6,
              stream: false,
            }),
          }
        );

        if (!hfRes.ok) { continue; }
        const data = await hfRes.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) { response = text; break; }
      } catch (e) { continue; }
    }

    if (!response) {
      return res.status(502).json({ error: 'No se pudo conectar con el servicio de IA. Intentá de nuevo.' });
    }

    return res.status(200).json({
      response,
      hasRealData,
      modulesUsed: relevantModules,
      period,
    });

  } catch (err) {
    console.error('AI analyze error:', err);
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}

// ── HELPERS ──────────────────────────────────────────────────────

function buildDataSummary(module, rows, datasetInfo) {
  if (!rows.length) return 'Sin filas de datos.';

  const summary = [];
  summary.push(`Archivo: ${datasetInfo.filename} | Período: ${datasetInfo.period} | Registros: ${datasetInfo.row_count}`);

  if (module === 'rrhh') {
    const totalSueldo = rows.reduce((s, r) => s + Number(r.sueldo || r.salario || r.remuneracion || 0), 0);
    const hsExtra = rows.reduce((s, r) => s + Number(r.horas_extra || r.horasExtra || 0), 0);
    summary.push(`Empleados en muestra: ${rows.length}`);
    if (totalSueldo > 0) summary.push(`Gasto salarial muestra: $${totalSueldo.toLocaleString('es-AR')}`);
    if (hsExtra > 0) summary.push(`Horas extra muestra: ${hsExtra.toLocaleString('es-AR')}h`);
    // First few rows
    rows.slice(0, 3).forEach(r => {
      const name = r.nombre || r.apellido || r.empleado || '';
      const area = r.area || r.secretaria || r.departamento || '';
      const sueldo = r.sueldo || r.salario || '';
      if (name || area) summary.push(`  • ${name} ${area ? '(' + area + ')' : ''} ${sueldo ? '- $' + Number(sueldo).toLocaleString('es-AR') : ''}`);
    });

  } else if (module === 'hacienda') {
    const totalIngresos = rows.filter(r => String(r.tipo||'').toLowerCase()==='ingreso').reduce((s,r)=>s+Number(r.monto||0),0);
    const totalEgresos = rows.filter(r => String(r.tipo||'').toLowerCase()==='egreso').reduce((s,r)=>s+Number(r.monto||0),0);
    if (totalIngresos) summary.push(`Ingresos muestra: $${totalIngresos.toLocaleString('es-AR')}`);
    if (totalEgresos) summary.push(`Egresos muestra: $${totalEgresos.toLocaleString('es-AR')}`);

  } else if (module === 'obras') {
    const avgAvance = rows.length > 0 ? rows.reduce((s,r)=>s+Number(r.avance||r.progreso||0),0)/rows.length : 0;
    summary.push(`Avance promedio: ${avgAvance.toFixed(0)}%`);
    rows.slice(0, 5).forEach(r => {
      const nombre = r.nombre || r.obra || r.descripcion || '';
      const avance = r.avance || r.progreso || '';
      if (nombre) summary.push(`  • ${nombre}: ${avance}%`);
    });

  } else {
    // Generic: show first row keys as structure
    if (rows[0]) {
      summary.push(`Campos: ${Object.keys(rows[0]).join(', ')}`);
      summary.push(`Primeros registros: ${JSON.stringify(rows.slice(0,2))}`);
    }
  }

  return summary.join('\n');
}

function buildSystemPrompt(dataContext, hasRealData) {
  const baseCtx = `
CONTEXTO DEL SISTEMA (referencia si no hay datos reales cargados):
- Municipio: Junín, Mendoza, Argentina
- Empleados totales aprox: 1.247
- Presupuesto mensual aprox: $420M
- Secretarías: Intendencia, Hacienda, RRHH, Obras Públicas, Servicios, Cultura, Salud
- Reclamos vecinos activos: ~318
- Obras en ejecución: ~8
`;

  return `Sos MuniBot, el asistente inteligente del Municipio de Junín, Mendoza.
Respondés en español rioplatense, de forma clara, concisa y profesional.
Ayudás a funcionarios municipales con análisis de datos, consultas y decisiones.

${hasRealData
    ? `TENÉS ACCESO A DATOS REALES CARGADOS EN EL SISTEMA:\n${dataContext}\n\nBASÁTE EN ESTOS DATOS REALES para responder. Si la pregunta no se puede responder con los datos disponibles, decilo claramente y sugeri qué archivo habría que cargar.`
    : `NO HAY DATOS REALES CARGADOS AÚN para este período.\n${baseCtx}\nUsá el contexto de referencia. Recordá al usuario que puede cargar archivos en el Hub de Datos (/importar) para obtener respuestas basadas en datos reales.`
  }

Siempre:
- Sé específico con números cuando tenés datos
- Indicá el período de los datos que usás
- Si detectás algo preocupante, marcalo con ⚠️
- Terminá con una recomendación accionable cuando sea relevante`;
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
