// api/intelligence.js
// Motor de cruzamiento de datos e inteligencia municipal
// Consulta Neon PostgreSQL y genera KPIs derivados + narrativa IA

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { analysis, period, modules } = req.method === 'POST' ? req.body : req.query;

  try {
    let result = {};

    switch (analysis) {

      // ── 1. Ejecución salarial vs presupuesto ─────────────────
      case 'salary_vs_budget': {
        const [rrhh, budget] = await Promise.all([
          sql`SELECT data FROM data_points WHERE module='rrhh' AND period=${period} LIMIT 5000`,
          sql`SELECT data FROM data_points WHERE module='hacienda' AND period=${period} LIMIT 1000`,
        ]);

        const salaryData = rrhh.map(r => r.data);
        const totalSalary = salaryData.reduce((sum, emp) => {
          const s = Number(emp.sueldo || emp.salario || emp.remuneracion || emp.total || 0);
          return sum + s;
        }, 0);

        const budgetData = budget.map(r => r.data);
        const personalBudget = budgetData.find(b =>
          String(b.partida || b.area || '').toLowerCase().includes('personal')
        );
        const budgetAmount = Number(personalBudget?.monto || personalBudget?.presupuesto || 0);

        const executionPct = budgetAmount > 0 ? (totalSalary / budgetAmount * 100).toFixed(1) : null;
        const deviation = budgetAmount > 0 ? totalSalary - budgetAmount : null;

        result = {
          analysis: 'salary_vs_budget',
          period,
          totalSalary,
          budgetAmount,
          executionPct: executionPct ? Number(executionPct) : null,
          deviation,
          employeeCount: salaryData.length,
          alertLevel: executionPct > 100 ? 'critical' : executionPct > 90 ? 'warning' : 'normal',
          insight: executionPct
            ? `Ejecución salarial ${executionPct}% del presupuesto. ${deviation > 0 ? `Superávit de $${Math.abs(deviation).toLocaleString('es-AR')} disponible.` : `Déficit de $${Math.abs(deviation).toLocaleString('es-AR')}.`}`
            : 'Datos insuficientes para calcular ejecución salarial.',
        };
        break;
      }

      // ── 2. Eficiencia de obras ────────────────────────────────
      case 'obra_efficiency': {
        const obras = await sql`
          SELECT data FROM data_points WHERE module='obras' AND period=${period} LIMIT 200
        `;
        const presup = await sql`
          SELECT data FROM data_points WHERE module='presupuesto' AND period=${period} LIMIT 200
        `;

        const obrasData = obras.map(r => r.data);
        const avgProgress = obrasData.length > 0
          ? obrasData.reduce((s, o) => s + Number(o.avance || o.progreso || o.progress || 0), 0) / obrasData.length
          : 0;

        const delayed = obrasData.filter(o => {
          const fechaFin = new Date(o.fecha_fin || o.fechaFin || o.end_date || '');
          return fechaFin < new Date() && Number(o.avance || 0) < 100;
        });

        result = {
          analysis: 'obra_efficiency',
          period,
          totalObras: obrasData.length,
          avgProgress: avgProgress.toFixed(1),
          delayedCount: delayed.length,
          delayedObras: delayed.slice(0, 5).map(o => o.nombre || o.name || 'Sin nombre'),
          alertLevel: delayed.length > 3 ? 'critical' : delayed.length > 0 ? 'warning' : 'normal',
          insight: `${obrasData.length} obras registradas. Avance promedio: ${avgProgress.toFixed(0)}%. ${delayed.length} obras con demora.`,
        };
        break;
      }

      // ── 3. Concentración de licitaciones ─────────────────────
      case 'licitacion_concentration': {
        const lics = await sql`
          SELECT data FROM data_points WHERE module='licitaciones' AND period=${period} LIMIT 500
        `;

        const licsData = lics.map(r => r.data);
        const byProvider = {};
        let totalMonto = 0;

        licsData.forEach(l => {
          const prov = l.proveedor || l.adjudicatario || l.empresa || 'Desconocido';
          const monto = Number(l.monto || l.importe || l.valor || 0);
          byProvider[prov] = (byProvider[prov] || 0) + monto;
          totalMonto += monto;
        });

        const sorted = Object.entries(byProvider)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        const top3Pct = totalMonto > 0
          ? sorted.slice(0, 3).reduce((s, [, m]) => s + m, 0) / totalMonto * 100
          : 0;

        result = {
          analysis: 'licitacion_concentration',
          period,
          totalLicitaciones: licsData.length,
          totalMonto,
          top10Providers: sorted.map(([name, monto]) => ({ name, monto, pct: totalMonto > 0 ? (monto/totalMonto*100).toFixed(1) : 0 })),
          top3ConcentrationPct: top3Pct.toFixed(1),
          alertLevel: top3Pct > 70 ? 'critical' : top3Pct > 50 ? 'warning' : 'normal',
          insight: `Top 3 proveedores concentran ${top3Pct.toFixed(0)}% del gasto en licitaciones. ${top3Pct > 60 ? 'Alta concentración: riesgo de dependencia.' : 'Distribución saludable.'}`,
        };
        break;
      }

      // ── 4. Resumen ejecutivo completo ─────────────────────────
      case 'executive_summary': {
        // Run all analyses in parallel
        const currentPeriod = period || getCurrentPeriod();

        const [datasets, latestPoints] = await Promise.all([
          sql`SELECT module, COUNT(*) as files, SUM(row_count) as rows 
              FROM datasets WHERE period=${currentPeriod}
              GROUP BY module`,
          sql`SELECT module, data FROM data_points 
              WHERE period=${currentPeriod}
              ORDER BY created_at DESC LIMIT 100`,
        ]);

        // Build module summaries
        const moduleSummary = {};
        datasets.forEach(d => {
          moduleSummary[d.module] = { files: d.files, rows: d.rows };
        });

        // Get aggregated metrics per module
        const metricsRRHH = computeRRHHMetrics(latestPoints.filter(p => p.module === 'rrhh').map(p => p.data));
        const metricsHacienda = computeHaciendaMetrics(latestPoints.filter(p => p.module === 'hacienda').map(p => p.data));

        // Generate AI narrative
        const aiNarrative = await generateExecutiveNarrative(currentPeriod, metricsRRHH, metricsHacienda, moduleSummary);

        result = {
          analysis: 'executive_summary',
          period: currentPeriod,
          moduleSummary,
          metrics: { rrhh: metricsRRHH, hacienda: metricsHacienda },
          aiNarrative,
          generatedAt: new Date().toISOString(),
        };
        break;
      }

      // ── 5. Correlación reclamos vs obras ──────────────────────
      case 'reclamos_vs_obras': {
        const [reclamos, obras] = await Promise.all([
          sql`SELECT data FROM data_points WHERE module='vecinos' AND period=${period} LIMIT 1000`,
          sql`SELECT data FROM data_points WHERE module='obras' AND period=${period} LIMIT 200`,
        ]);

        const recData = reclamos.map(r => r.data);
        const obraData = obras.map(r => r.data);

        // Group reclamos by barrio/zona
        const recByBarrio = {};
        recData.forEach(r => {
          const barrio = r.barrio || r.zona || r.sector || 'Sin clasificar';
          recByBarrio[barrio] = (recByBarrio[barrio] || 0) + 1;
        });

        // Find barrios with obras
        const bariosConObras = new Set(obraData.map(o => o.barrio || o.zona || ''));

        const hotspots = Object.entries(recByBarrio)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([barrio, count]) => ({
            barrio,
            reclamos: count,
            tieneObra: bariosConObras.has(barrio),
            prioridad: count > 10 && !bariosConObras.has(barrio) ? 'ALTA' : count > 5 ? 'MEDIA' : 'BAJA',
          }));

        result = {
          analysis: 'reclamos_vs_obras',
          period,
          totalReclamos: recData.length,
          totalObras: obraData.length,
          hotspots,
          sinCobertura: hotspots.filter(h => !h.tieneObra && h.prioridad === 'ALTA').length,
          alertLevel: hotspots.some(h => !h.tieneObra && h.reclamos > 10) ? 'warning' : 'normal',
          insight: `${recData.length} reclamos activos. ${hotspots.filter(h => !h.tieneObra && h.prioridad === 'ALTA').length} zonas con alta demanda sin obra planificada.`,
        };
        break;
      }

      default:
        return res.status(400).json({ error: `Análisis '${analysis}' no reconocido` });
    }

    // Save intelligence report to DB
    if (result.analysis) {
      await sql`
        INSERT INTO intelligence_reports (type, period, result, ai_summary, alert_level)
        VALUES (${result.analysis}, ${period || getCurrentPeriod()}, ${JSON.stringify(result)}, ${result.insight || result.aiNarrative || null}, ${result.alertLevel || 'normal'})
        ON CONFLICT DO NOTHING
      `;
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Intelligence error:', err);
    return res.status(500).json({ error: 'Error en análisis: ' + err.message });
  }
}

// ── HELPERS ──────────────────────────────────────────────────────

function computeRRHHMetrics(data) {
  if (!data.length) return null;
  const totalSueldo = data.reduce((s, d) => s + Number(d.sueldo || d.salario || 0), 0);
  const totalHsExtra = data.reduce((s, d) => s + Number(d.horas_extra || d.horasExtra || 0), 0);
  const ausentes = data.filter(d => String(d.estado || '').toLowerCase() === 'ausente').length;
  return {
    employeeCount: data.length,
    totalSueldo,
    avgSueldo: data.length > 0 ? Math.round(totalSueldo / data.length) : 0,
    totalHsExtra,
    ausentismo: data.length > 0 ? (ausentes / data.length * 100).toFixed(1) : 0,
  };
}

function computeHaciendaMetrics(data) {
  if (!data.length) return null;
  const ingresos = data.filter(d => String(d.tipo || d.type || '').toLowerCase() === 'ingreso')
    .reduce((s, d) => s + Number(d.monto || d.importe || 0), 0);
  const egresos = data.filter(d => String(d.tipo || d.type || '').toLowerCase() === 'egreso')
    .reduce((s, d) => s + Number(d.monto || d.importe || 0), 0);
  return { ingresos, egresos, resultado: ingresos - egresos };
}

async function generateExecutiveNarrative(period, rrhh, hacienda, modules) {
  const token = process.env.MUNI_HF_TOKEN;
  if (!token) return 'Narrative AI not configured.';

  const ctx = `
Período: ${period}
RRHH: ${rrhh ? `${rrhh.employeeCount} empleados, sueldo total $${rrhh.totalSueldo?.toLocaleString('es-AR')}, ausentismo ${rrhh.ausentismo}%, horas extra ${rrhh.totalHsExtra}h` : 'Sin datos'}
Hacienda: ${hacienda ? `Ingresos $${hacienda.ingresos?.toLocaleString('es-AR')}, Egresos $${hacienda.egresos?.toLocaleString('es-AR')}, Resultado $${hacienda.resultado?.toLocaleString('es-AR')}` : 'Sin datos'}
Módulos con datos: ${Object.keys(modules).join(', ')}
`;

  try {
    const resp = await fetch(
      'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-72B-Instruct',
          messages: [
            { role: 'system', content: 'Sos el analista de datos del Municipio de Junín, Mendoza. Generás narrativas ejecutivas breves y claras en español rioplatense para el Intendente.' },
            { role: 'user', content: `Generá un párrafo ejecutivo de 3-4 oraciones con los puntos clave, alertas y una recomendación basada en estos datos:\n${ctx}` }
          ],
          max_tokens: 300,
          temperature: 0.5,
        }),
      }
    );
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Datos procesados correctamente.';
  } catch (e) {
    return `Resumen automático: ${Object.keys(modules).length} módulos con datos para ${period}.`;
  }
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
