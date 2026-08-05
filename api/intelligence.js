import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { analysis, period, modules } = req.method === 'POST' ? req.body : req.query;
  const currentPeriod = period || getCurrentPeriod();

  try {
    let result = {};

    switch (analysis) {
      case 'salary_vs_budget': {
        const rrhhRes = await pool.query("SELECT data FROM data_points WHERE module='rrhh' AND period=$1 LIMIT 5000", [currentPeriod]);
        const budgetRes = await pool.query("SELECT data FROM data_points WHERE module='hacienda' AND period=$1 LIMIT 1000", [currentPeriod]);

        const salaryData = rrhhRes.rows.map(r => r.data);
        const totalSalary = salaryData.reduce((sum, emp) => sum + Number(emp.sueldo || emp.salario || emp.remuneracion || emp.total || 0), 0);

        const budgetData = budgetRes.rows.map(r => r.data);
        const personalBudget = budgetData.find(b => String(b.partida || b.area || '').toLowerCase().includes('personal'));
        const budgetAmount = Number(personalBudget?.monto || personalBudget?.presupuesto || 0);

        const executionPct = budgetAmount > 0 ? (totalSalary / budgetAmount * 100).toFixed(1) : null;
        const deviation = budgetAmount > 0 ? budgetAmount - totalSalary : null;

        result = {
          analysis: 'salary_vs_budget',
          period: currentPeriod,
          totalSalary,
          budgetAmount,
          executionPct: executionPct ? Number(executionPct) : null,
          deviation,
          employeeCount: salaryData.length,
          alertLevel: executionPct > 100 ? 'critical' : executionPct > 90 ? 'warning' : 'normal',
          insight: executionPct ? `Ejecución salarial ${executionPct}% del presupuesto.` : 'Datos insuficientes.'
        };
        break;
      }
      case 'obra_efficiency': {
        const obrasRes = await pool.query("SELECT data FROM data_points WHERE module='obras' AND period=$1 LIMIT 200", [currentPeriod]);
        const obrasData = obrasRes.rows.map(r => r.data);
        const avgProgress = obrasData.length > 0 ? obrasData.reduce((s, o) => s + Number(o.avance || o.progreso || o.progress || 0), 0) / obrasData.length : 0;
        const delayed = obrasData.filter(o => new Date(o.fecha_fin || o.fechaFin || o.end_date || '') < new Date() && Number(o.avance || 0) < 100);

        result = {
          analysis: 'obra_efficiency',
          period: currentPeriod,
          totalObras: obrasData.length,
          avgProgress: avgProgress.toFixed(1),
          delayedCount: delayed.length,
          delayedObras: delayed.slice(0, 5).map(o => o.nombre || o.name || 'Sin nombre'),
          alertLevel: delayed.length > 3 ? 'critical' : delayed.length > 0 ? 'warning' : 'normal',
          insight: `${obrasData.length} obras registradas. Avance promedio: ${avgProgress.toFixed(0)}%. ${delayed.length} obras con demora.`
        };
        break;
      }
      case 'licitacion_concentration': {
        const licsRes = await pool.query("SELECT data FROM data_points WHERE module='licitaciones' AND period=$1 LIMIT 500", [currentPeriod]);
        const licsData = licsRes.rows.map(r => r.data);
        const byProvider = {};
        let totalMonto = 0;
        licsData.forEach(l => {
          const prov = l.proveedor || l.adjudicatario || l.empresa || 'Desconocido';
          const monto = Number(l.monto || l.importe || l.valor || 0);
          byProvider[prov] = (byProvider[prov] || 0) + monto;
          totalMonto += monto;
        });
        const sorted = Object.entries(byProvider).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const top3Pct = totalMonto > 0 ? sorted.slice(0, 3).reduce((s, [, m]) => s + m, 0) / totalMonto * 100 : 0;

        result = {
          analysis: 'licitacion_concentration',
          period: currentPeriod,
          totalLicitaciones: licsData.length,
          totalMonto,
          top10Providers: sorted.map(([name, monto]) => ({ name, monto, pct: totalMonto > 0 ? (monto/totalMonto*100).toFixed(1) : 0 })),
          top3ConcentrationPct: top3Pct.toFixed(1),
          alertLevel: top3Pct > 70 ? 'critical' : top3Pct > 50 ? 'warning' : 'normal',
          insight: `Top 3 proveedores concentran ${top3Pct.toFixed(0)}% del gasto.`
        };
        break;
      }
      case 'executive_summary': {
        const dsRes = await pool.query("SELECT module, COUNT(*) as files, SUM(row_count) as rows FROM datasets WHERE period=$1 GROUP BY module", [currentPeriod]);
        const dpRes = await pool.query("SELECT module, data FROM data_points WHERE period=$1 ORDER BY created_at DESC LIMIT 100", [currentPeriod]);

        const moduleSummary = {};
        dsRes.rows.forEach(d => { moduleSummary[d.module] = { files: parseInt(d.files), rows: parseInt(d.rows) }; });

        const metricsRRHH = computeRRHHMetrics(dpRes.rows.filter(p => p.module === 'rrhh').map(p => p.data));
        const metricsHacienda = computeHaciendaMetrics(dpRes.rows.filter(p => p.module === 'hacienda').map(p => p.data));

        const aiNarrative = await generateExecutiveNarrative(currentPeriod, metricsRRHH, metricsHacienda, moduleSummary);

        result = {
          analysis: 'executive_summary',
          period: currentPeriod,
          moduleSummary,
          metrics: { rrhh: metricsRRHH, hacienda: metricsHacienda },
          aiNarrative,
          generatedAt: new Date().toISOString()
        };
        break;
      }
      case 'reclamos_vs_obras': {
        const recRes = await pool.query("SELECT data FROM data_points WHERE module='vecinos' AND period=$1 LIMIT 1000", [currentPeriod]);
        const obrasRes = await pool.query("SELECT data FROM data_points WHERE module='obras' AND period=$1 LIMIT 200", [currentPeriod]);

        const recData = recRes.rows.map(r => r.data);
        const obraData = obrasRes.rows.map(r => r.data);

        const recByBarrio = {};
        recData.forEach(r => {
          const barrio = r.barrio || r.zona || r.sector || 'Sin clasificar';
          recByBarrio[barrio] = (recByBarrio[barrio] || 0) + 1;
        });

        const bariosConObras = new Set(obraData.map(o => o.barrio || o.zona || ''));
        const hotspots = Object.entries(recByBarrio)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([barrio, count]) => ({
            barrio, reclamos: count, tieneObra: bariosConObras.has(barrio),
            prioridad: count > 10 && !bariosConObras.has(barrio) ? 'ALTA' : count > 5 ? 'MEDIA' : 'BAJA'
          }));

        result = {
          analysis: 'reclamos_vs_obras',
          period: currentPeriod,
          totalReclamos: recData.length,
          totalObras: obraData.length,
          hotspots,
          sinCobertura: hotspots.filter(h => !h.tieneObra && h.prioridad === 'ALTA').length,
          alertLevel: hotspots.some(h => !h.tieneObra && h.reclamos > 10) ? 'warning' : 'normal',
          insight: `${recData.length} reclamos activos.`
        };
        break;
      }
      case 'cashflow_projection': {
        const resHacienda = await pool.query("SELECT data FROM data_points WHERE module='hacienda' AND period=$1", [currentPeriod]);
        const data = resHacienda.rows.map(r => r.data);
        const ingresos = data.filter(d => String(d.tipo || '').toLowerCase() === 'ingreso').reduce((s, d) => s + Number(d.monto || 0), 0);
        const egresos = data.filter(d => String(d.tipo || '').toLowerCase() === 'egreso').reduce((s, d) => s + Number(d.monto || 0), 0);
        result = {
          analysis: 'cashflow_projection', period: currentPeriod, ingresos, egresos, proyectado: ingresos * 1.05 - egresos * 1.05, alertLevel: ingresos < egresos ? 'warning' : 'normal'
        };
        break;
      }
      case 'rrhh_ausentismo': {
        const resRRHH = await pool.query("SELECT data FROM data_points WHERE module='rrhh' AND period=$1", [currentPeriod]);
        const data = resRRHH.rows.map(r => r.data);
        const ausentes = data.filter(d => String(d.estado || '').toLowerCase() === 'ausente').length;
        const pct = data.length ? (ausentes / data.length * 100).toFixed(1) : 0;
        result = {
          analysis: 'rrhh_ausentismo', period: currentPeriod, ausentes, total: data.length, porcentaje: pct, alertLevel: pct > 10 ? 'warning' : 'normal'
        };
        break;
      }
      default:
        return res.status(400).json({ error: `Análisis '${analysis}' no reconocido` });
    }

    if (result.analysis) {
      try {
        await pool.query(
          `INSERT INTO intelligence_reports (type, period, result, ai_summary, alert_level) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [result.analysis, currentPeriod, JSON.stringify(result), result.insight || result.aiNarrative || null, result.alertLevel || 'normal']
        );
      } catch (e) {
        console.warn('Pudo fallar insert (no existe tabla)', e.message);
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Intelligence error:', err);
    return res.status(500).json({ error: 'Error en análisis: ' + err.message });
  }
}

function computeRRHHMetrics(data) {
  if (!data.length) return null;
  const totalSueldo = data.reduce((s, d) => s + Number(d.sueldo || d.salario || 0), 0);
  const totalHsExtra = data.reduce((s, d) => s + Number(d.horas_extra || d.horasExtra || 0), 0);
  const ausentes = data.filter(d => String(d.estado || '').toLowerCase() === 'ausente').length;
  return { employeeCount: data.length, totalSueldo, avgSueldo: data.length > 0 ? Math.round(totalSueldo / data.length) : 0, totalHsExtra, ausentismo: data.length > 0 ? (ausentes / data.length * 100).toFixed(1) : 0 };
}

function computeHaciendaMetrics(data) {
  if (!data.length) return null;
  const ingresos = data.filter(d => String(d.tipo || d.type || '').toLowerCase() === 'ingreso').reduce((s, d) => s + Number(d.monto || d.importe || 0), 0);
  const egresos = data.filter(d => String(d.tipo || d.type || '').toLowerCase() === 'egreso').reduce((s, d) => s + Number(d.monto || d.importe || 0), 0);
  return { ingresos, egresos, resultado: ingresos - egresos };
}

async function generateExecutiveNarrative(period, rrhh, hacienda, modules) {
  const token = process.env.MUNI_HF_TOKEN;
  if (!token) return 'Narrativa AI no configurada.';
  const ctx = `Período: ${period}\nRRHH: ${rrhh ? `${rrhh.employeeCount} empleados` : 'Sin datos'}\nHacienda: ${hacienda ? `Ingresos $${hacienda.ingresos}` : 'Sin datos'}`;
  try {
    const resp = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'Qwen/Qwen2.5-72B-Instruct', messages: [{ role: 'system', content: 'Sos analista de datos del Municipio de Junín. Escribí 3 oraciones.' }, { role: 'user', content: ctx }], max_tokens: 300, temperature: 0.5 })
    });
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Datos procesados.';
  } catch (e) { return 'Resumen automático.'; }
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
