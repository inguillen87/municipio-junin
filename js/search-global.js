// ============================================================
// search-global.js — Global unified search
// Searches across employees, reclamos, obras, payments
// ============================================================

(function() {
  let searchTimeout;
  let searchPanel;

  function init() {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;
    
    // Create results panel
    searchPanel = document.createElement('div');
    searchPanel.id = 'searchPanel';
    searchPanel.style.cssText = `
      position:absolute;top:calc(100% + 8px);left:0;right:0;
      background:var(--card-bg,#0d1526);border:1px solid rgba(255,255,255,0.1);
      border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);
      z-index:9999;max-height:400px;overflow-y:auto;display:none;
    `;
    searchInput.parentElement.style.position = 'relative';
    searchInput.parentElement.appendChild(searchPanel);

    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      const q = this.value.trim();
      if (q.length < 2) { searchPanel.style.display = 'none'; return; }
      searchTimeout = setTimeout(() => performSearch(q), 200);
    });

    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { searchPanel.style.display = 'none'; this.value = ''; }
    });

    document.addEventListener('click', function(e) {
      if (!searchInput.parentElement.contains(e.target)) {
        searchPanel.style.display = 'none';
      }
    });
  }

  function performSearch(q) {
    if (!window.MuniDB) return;
    const ql = q.toLowerCase();
    const results = [];

    // Search employees
    try {
      MuniDB.getAll('empleados').filter(e =>
        `${e.nombre} ${e.apellido} ${e.cargo} ${e.secretaria}`.toLowerCase().includes(ql)
      ).slice(0,3).forEach(e => results.push({
        icon:'\ud83d\udc64', label:`${e.apellido}, ${e.nombre}`, sub:`${e.cargo} \u2014 ${e.secretaria}`,
        href:'rrhh.html'
      }));
    } catch(e){}

    // Search reclamos
    try {
      MuniDB.getAll('reclamos').filter(r =>
        `${r.descripcion} ${r.direccion} ${r.tipo}`.toLowerCase().includes(ql)
      ).slice(0,3).forEach(r => results.push({
        icon:'\ud83c\udfd8\ufe0f', label:r.descripcion, sub:`${r.direccion} \u2014 ${r.estado}`,
        href:'vecinos.html'
      }));
    } catch(e){}

    // Search obras
    try {
      MuniDB.getAll('obras').filter(o =>
        `${o.nombre} ${o.barrio} ${o.contratista}`.toLowerCase().includes(ql)
      ).slice(0,2).forEach(o => results.push({
        icon:'\ud83c\udfd7\ufe0f', label:o.nombre, sub:`${o.barrio} \u2014 ${o.avance}% avance`,
        href:'obras.html'
      }));
    } catch(e){}

    // Search pagos
    try {
      MuniDB.getAll('pagos').filter(p =>
        `${p.proveedor} ${p.concepto}`.toLowerCase().includes(ql)
      ).slice(0,2).forEach(p => results.push({
        icon:'\ud83d\udcb3', label:p.concepto, sub:`${p.proveedor} \u2014 $${(p.monto||0).toLocaleString('es-AR')}`,
        href:'hacienda.html'
      }));
    } catch(e){}

    // Navigation shortcuts
    const pages = [
      {k:'dashboard', href:'index.html', label:'Dashboard Ejecutivo', icon:'\ud83d\udcca'},
      {k:'hacienda', href:'hacienda.html', label:'Hacienda', icon:'\ud83c\udfe6'},
      {k:'rrhh personal empleados', href:'rrhh.html', label:'RRHH / Personal', icon:'\ud83d\udc65'},
      {k:'reclamos vecinos 311', href:'vecinos.html', label:'Reclamos Vecinales 311', icon:'\ud83c\udfd8\ufe0f'},
      {k:'obras mapa', href:'obras.html', label:'Obras Municipales', icon:'\ud83c\udfd7\ufe0f'},
      {k:'ia inteligencia artificial chat', href:'ia.html', label:'IA Municipal', icon:'\ud83e\udd16'},
      {k:'licitaciones compras', href:'licitaciones.html', label:'Licitaciones y Compras', icon:'\ud83d\udccb'},
      {k:'transparencia cuentas claras pagos', href:'cuentas-claras.html', label:'Cuentas Claras', icon:'\ud83d\udcb5'},
    ].filter(p => p.k.includes(ql)).slice(0,2);
    pages.forEach(p => results.push({icon:p.icon, label:p.label, sub:'Ir al m\u00f3dulo', href:p.href}));

    if (results.length === 0) {
      searchPanel.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(148,163,184,0.5);font-size:13px">Sin resultados para "${q}"</div>`;
    } else {
      searchPanel.innerHTML = results.map(r => `
        <a href="${r.href}" style="display:flex;gap:12px;padding:11px 16px;text-decoration:none;color:inherit;transition:background 0.15s;border-bottom:1px solid rgba(255,255,255,0.04)" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
          <span style="font-size:20px;flex-shrink:0">${r.icon}</span>
          <div><div style="font-size:13px;font-weight:600">${r.label}</div><div style="font-size:11px;color:rgba(148,163,184,0.6);margin-top:2px">${r.sub}</div></div>
        </a>
      `).join('');
    }
    searchPanel.style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 400); });
})();
