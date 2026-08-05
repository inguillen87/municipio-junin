// js/analytics-live.js — Real-time Municipal Metrics & Engine
window.MuniAnalytics = (function() {
  function getStats() {
    try {
      if (typeof MuniDB === 'undefined') return {};
      const empleados = MuniDB.getAll('empleados') || [];
      const reclamos = MuniDB.getAll('reclamos') || [];
      const pagos = MuniDB.getAll('pagos') || [];
      const obras = MuniDB.getAll('obras') || [];
      const proveedores = MuniDB.getAll('proveedores') || [];

      return {
        empleados: {
          total: empleados.length,
          activos: empleados.filter(e => e && e.estado === 'activo').length,
          licencia: empleados.filter(e => e && e.estado === 'licencia').length,
          nominaMensual: empleados.reduce((s,e) => s + (e && e.salario ? Number(e.salario) : 0), 0),
          horasExtra: empleados.reduce((s,e) => s + (e && e.horasExtra ? Number(e.horasExtra) : 0), 0),
          ausentismoPromedio: empleados.length > 0 ? (empleados.reduce((s,e) => s + (e && e.ausentismo ? Number(e.ausentismo) : 0), 0) / empleados.length).toFixed(1) : 0,
          topSecretariaHoras: (() => {
            const bySecret = {};
            empleados.forEach(e => { if (e && e.secretaria) bySecret[e.secretaria] = (bySecret[e.secretaria]||0) + (e.horasExtra||0); });
            return Object.entries(bySecret).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-';
          })()
        },
        reclamos: {
          total: reclamos.length,
          pendientes: reclamos.filter(r => r && r.estado === 'pendiente').length,
          enProceso: reclamos.filter(r => r && r.estado === 'en_proceso').length,
          resueltos: reclamos.filter(r => r && r.estado === 'resuelto').length,
          tasaResolucion: reclamos.length > 0 ? ((reclamos.filter(r => r && r.estado === 'resuelto').length / reclamos.length) * 100).toFixed(0) : 0,
          topTipo: (() => {
            const byTipo = {};
            reclamos.forEach(r => { if (r && r.tipo) byTipo[r.tipo] = (byTipo[r.tipo]||0)+1; });
            return Object.entries(byTipo).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Sin datos';
          })()
        },
        pagos: {
          total: pagos.length,
          montoTotal: pagos.reduce((s,p) => s + (p && p.monto ? Number(p.monto) : 0), 0),
          pendientes: pagos.filter(p => p && p.estado === 'pendiente').length,
          promedioPago: pagos.length > 0 ? pagos.reduce((s,p) => s + (p && p.monto ? Number(p.monto) : 0), 0) / pagos.length : 0,
        },
        obras: {
          total: obras.length,
          enEjecucion: obras.filter(o => o && o.estado === 'en_ejecucion').length,
          finalizadas: obras.filter(o => o && o.estado === 'finalizada').length,
          avancePromedio: obras.length > 0 ? (obras.reduce((s,o) => s + (o && o.avance ? Number(o.avance) : 0), 0) / obras.length).toFixed(0) : 0,
          presupuestoTotal: obras.reduce((s,o) => s + (o && o.presupuesto ? Number(o.presupuesto) : 0), 0),
          ejecutadoTotal: obras.reduce((s,o) => s + (o && o.ejecutado ? Number(o.ejecutado) : 0), 0),
        },
        proveedores: {
          total: proveedores.length,
          activos: proveedores.filter(p => p && p.estado === 'activo').length
        }
      };
    } catch(e) { console.error('MuniAnalytics error:', e); return {}; }
  }

  function renderInPage() {
    const stats = getStats();
    if (!stats.empleados) return;

    document.querySelectorAll('[data-stat]').forEach(el => {
      const path = el.getAttribute('data-stat').split('.');
      let val = stats;
      for (const key of path) {
        val = val ? val[key] : null;
      }
      if (val !== null && val !== undefined) {
        if (el.getAttribute('data-format') === 'currency') {
          el.textContent = '$' + Number(val).toLocaleString('es-AR');
        } else {
          el.textContent = val;
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(renderInPage, 200);
  });

  return { getStats, renderInPage };
})();
