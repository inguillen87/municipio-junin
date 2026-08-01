// ============================================================
// analytics-live.js — Live Analytics Engine
// Reads from MuniDB and renders real-time KPIs
// ============================================================

window.MuniAnalytics = (function() {
  
  function getStats() {
    if (!window.MuniDB) return {};
    try {
      const empleados = MuniDB.getAll('empleados');
      const reclamos = MuniDB.getAll('reclamos');
      const pagos = MuniDB.getAll('pagos');
      const obras = MuniDB.getAll('obras');
      const proveedores = MuniDB.getAll('proveedores');

      return {
        empleados: {
          total: empleados.length,
          activos: empleados.filter(e => e.estado === 'activo').length,
          licencia: empleados.filter(e => e.estado === 'licencia').length,
          nominaMensual: empleados.reduce((s,e) => s+(e.salario||0), 0),
          horasExtra: empleados.reduce((s,e) => s+(e.horasExtra||0), 0),
          ausentismoPromedio: empleados.length > 0 ? (empleados.reduce((s,e) => s+(e.ausentismo||0), 0) / empleados.length).toFixed(1) : 0,
          topSecretariaHoras: (() => {
            const bySecret = {};
            empleados.forEach(e => { bySecret[e.secretaria] = (bySecret[e.secretaria]||0) + (e.horasExtra||0); });
            return Object.entries(bySecret).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-';
          })()
        },
        reclamos: {
          total: reclamos.length,
          pendientes: reclamos.filter(r => r.estado === 'pendiente').length,
          enProceso: reclamos.filter(r => r.estado === 'en_proceso').length,
          resueltos: reclamos.filter(r => r.estado === 'resuelto').length,
          tasaResolucion: reclamos.length > 0 ? ((reclamos.filter(r=>r.estado==='resuelto').length/reclamos.length)*100).toFixed(0) : 0,
          topTipo: (() => {
            const byTipo = {};
            reclamos.forEach(r => { byTipo[r.tipo] = (byTipo[r.tipo]||0)+1; });
            return Object.entries(byTipo).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Sin datos';
          })()
        },
        pagos: {
          total: pagos.length,
          montoTotal: pagos.reduce((s,p) => s+(p.monto||0), 0),
          pendientes: pagos.filter(p => p.estado === 'pendiente').length,
          promedioPago: pagos.length > 0 ? pagos.reduce((s,p)=>s+(p.monto||0),0)/pagos.length : 0,
        },
        obras: {
          total: obras.length,
          enEjecucion: obras.filter(o => o.estado === 'en_ejecucion').length,
          finalizadas: obras.filter(o => o.estado === 'finalizada').length,
          avancePromedio: obras.length > 0 ? (obras.reduce((s,o) => s+(o.avance||0), 0)/obras.length).toFixed(0) : 0,
          presupuestoTotal: obras.reduce((s,o) => s+(o.presupuesto||0), 0),
          ejecutadoTotal: obras.reduce((s,o) => s+(o.ejecutado||0), 0),
        },
        proveedores: {
          total: proveedores.length,
          activos: proveedores.filter(p => p.estado === 'activo').length
        }
      };
    } catch(e) { console.error('MuniAnalytics error:', e); return {}; }
  }

  function renderInPage() {
    const stats = getStats();
    if (!stats.empleados) return;

    // Update any element with data-stat attribute
    document.querySelectorAll('[data-stat]').forEach(el => {
      const path = el.dataset.stat.split('.');
      let val = stats;
      path.forEach(k => { val = val?.[k]; });
      if (val !== undefined && val !== null) {
        const format = el.dataset.format;
        if (format === 'money') el.textContent = '$' + Number(val).toLocaleString('es-AR');
        else if (format === 'pct') el.textContent = val + '%';
        else el.textContent = val;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(renderInPage, 600);
    setInterval(renderInPage, 30000); // Refresh every 30s
  });

  return { getStats, renderInPage };
})();
