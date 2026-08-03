import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const period = (req.method === 'POST' ? req.body.period : req.query.period) || getCurrentPeriod();

  try {
    // We will do similar calculations to intelligence.js or we can call our own functions
    // Let's implement all in one go using Promise.all on db queries

    const queries = await Promise.all([
      pool.query("SELECT data FROM data_points WHERE module='rrhh' AND period=$1", [period]),
      pool.query("SELECT data FROM data_points WHERE module='hacienda' AND period=$1", [period]),
      pool.query("SELECT data FROM data_points WHERE module='obras' AND period=$1", [period]),
      pool.query("SELECT data FROM data_points WHERE module='licitaciones' AND period=$1", [period]),
      pool.query("SELECT data FROM data_points WHERE module='vecinos' AND period=$1", [period]),
      pool.query("SELECT module, COUNT(*) as files, SUM(row_count) as rows FROM datasets WHERE period=$1 GROUP BY module", [period]),
    ]);

    const [rrhhRes, haciendaRes, obrasRes, licsRes, vecinosRes, datasetsRes] = queries;
    
    const rrhhData = rrhhRes.rows.map(r => r.data);
    const haciendaData = haciendaRes.rows.map(r => r.data);
    const obrasData = obrasRes.rows.map(r => r.data);
    const licsData = licsRes.rows.map(r => r.data);
    const vecinosData = vecinosRes.rows.map(r => r.data);
    const modules = datasetsRes.rows.map(r => r.module);

    // 1. salary_vs_budget & rrhh_ausentismo
    const totalSalary = rrhhData.reduce((sum, emp) => sum + Number(emp.sueldo || emp.salario || emp.remuneracion || emp.total || 0), 0);
    const personalBudget = haciendaData.find(b => String(b.partida || b.area || '').toLowerCase().includes('personal'));
    const budgetAmount = Number(personalBudget?.monto || personalBudget?.presupuesto || 0);
    const executionPct = budgetAmount > 0 ? (totalSalary / budgetAmount * 100).toFixed(1) : 0;
    
    const ausentes = rrhhData.filter(d => String(d.estado || '').toLowerCase() === 'ausente').length;
    const ausentismoPct = rrhhData.length ? (ausentes / rrhhData.length * 100).toFixed(1) : 0;

    // 2. obra_efficiency
    const avgProgress = obrasData.length > 0 ? obrasData.reduce((s, o) => s + Number(o.avance || o.progreso || o.progress || 0), 0) / obrasData.length : 0;
    const delayedObras = obrasData.filter(o => new Date(o.fecha_fin || o.fechaFin || o.end_date || '') < new Date() && Number(o.avance || 0) < 100);

    // 3. licitacion_concentration
    let totalMontoLics = 0;
    const byProvider = {};
    licsData.forEach(l => {
      const prov = l.proveedor || l.adjudicatario || l.empresa || 'Desconocido';
      const monto = Number(l.monto || l.importe || l.valor || 0);
      byProvider[prov] = (byProvider[prov] || 0) + monto;
      totalMontoLics += monto;
    });
    const sortedProv = Object.entries(byProvider).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top3Pct = totalMontoLics > 0 ? sortedProv.reduce((s, [, m]) => s + m, 0) / totalMontoLics * 100 : 0;

    // 4. reclamos_vs_obras
    const recByBarrio = {};
    vecinosData.forEach(r => {
      const barrio = r.barrio || r.zona || r.sector || 'Sin clasificar';
      recByBarrio[barrio] = (recByBarrio[barrio] || 0) + 1;
    });
    const bariosConObras = new Set(obrasData.map(o => o.barrio || o.zona || ''));
    const hotspots = Object.entries(recByBarrio)
      .sort((a, b) => b[1] - a[1])
      .map(([barrio, count]) => ({ barrio, reclamos: count, tieneObra: bariosConObras.has(barrio) }));

    // 5. cashflow_projection
    const ingresos = haciendaData.filter(d => String(d.tipo || '').toLowerCase() === 'ingreso').reduce((s, d) => s + Number(d.monto || 0), 0);
    const egresos = haciendaData.filter(d => String(d.tipo || '').toLowerCase() === 'egreso').reduce((s, d) => s + Number(d.monto || 0), 0);
    
    // Cross Analysis 
    const crossAnalysis = [
      {
        name: 'Ejecución Salarial',
        insight: budgetAmount ? \`Ejecución del \${executionPct}% sobre presupuesto.\` : 'Faltan datos de presupuesto.'
      },
      {
        name: 'Zonas Críticas',
        insight: \`\${hotspots.filter(h => !h.tieneObra && h.reclamos > 5).length} zonas con alta demanda sin obra planificada.\`
      }
    ];

    const alerts = [];
    if (executionPct > 90) alerts.push({ type: 'warning', message: 'Ejecución salarial excede 90%' });
    if (delayedObras.length > 3) alerts.push({ type: 'critical', message: 'Más de 3 obras demoradas' });
    if (top3Pct > 70) alerts.push({ type: 'critical', message: 'Alta concentración de licitaciones en pocos proveedores' });
    if (ausentismoPct > 10) alerts.push({ type: 'warning', message: 'Ausentismo superior al 10%' });
    if (ingresos < egresos) alerts.push({ type: 'warning', message: 'Déficit proyectado en flujo de caja' });

    // AI Narrative
    let aiNarrative = "Resumen automático generado por reglas heurísticas.";
    const token = process.env.MUNI_HF_TOKEN;
    if (token) {
      try {
        const ctx = \`Período: \${period}. RRHH: \${rrhhData.length} emp, \${ausentismoPct}% ausentismo. Hacienda: Ingresos \${ingresos}, Egresos \${egresos}. Obras: \${obrasData.length} activas. Licitaciones: \${top3Pct}% conc en top 3.\`;
        const resp = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions', {
          method: 'POST', headers: { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'Qwen/Qwen2.5-72B-Instruct', messages: [{ role: 'system', content: 'Sos analista del Municipio de Junín. Escribí un resumen ejecutivo de 4 oraciones.' }, { role: 'user', content: ctx }], max_tokens: 300, temperature: 0.5 })
        });
        const data = await resp.json();
        if (data?.choices?.[0]?.message?.content) {
          aiNarrative = data.choices[0].message.content.trim();
        }
      } catch (e) {
        console.warn('AI Narrative failed', e);
      }
    }

    const report = {
      period,
      generatedAt: new Date().toISOString(),
      modules,
      kpis: {
        totalEmpleados: rrhhData.length,
        ausentismoPct,
        ingresos,
        egresos,
        obrasActivas: obrasData.length,
        avancePromedioObras: avgProgress.toFixed(1)
      },
      alerts,
      aiNarrative,
      crossAnalysis
    };

    try {
      await pool.query(
        "INSERT INTO intelligence_reports (type, period, result, ai_summary, alert_level) VALUES ($1, $2, $3, $4, $5)",
        ['full_report', period, JSON.stringify(report), aiNarrative, alerts.some(a => a.type === 'critical') ? 'critical' : alerts.length ? 'warning' : 'normal']
      );
    } catch (e) {
      console.warn('Could not insert report', e.message);
    }

    return res.status(200).json(report);
  } catch (err) {
    console.error('Reports error:', err);
    return res.status(500).json({ error: 'Error generando reporte: ' + err.message });
  }
}

function getCurrentPeriod() {
  const d = new Date();
  return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}\`;
}
