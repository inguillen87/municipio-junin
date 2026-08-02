import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_scripts = """  <!-- Core scripts -->
  <script src="js/nav.js"></script>
  <script src="js/toast.js"></script>
  <script src="js/db.js"></script>
  <script src="js/permissions.js"></script>
  <script src="js/charts-premium.js"></script>
  <script src="js/ux-improvements.js"></script>
  
  <!-- Page init -->
  <script>
  (function() {
    // Session check
    var u = sessionStorage.getItem('mjunin_user');
    if (!u) { window.location.replace('login.html'); return; }
    
    // Theme
    try { var t = localStorage.getItem('govtech_theme'); if(t) document.documentElement.setAttribute('data-theme',t); } catch(e) {}
    
    // Build sidebar
    if (typeof buildSidebar === 'function') buildSidebar('dashboard');
    
    document.addEventListener('DOMContentLoaded', function() {
      // Access denied toast
      if (sessionStorage.getItem('access_denied')) {
        sessionStorage.removeItem('access_denied');
        setTimeout(function() { if(typeof showToast!=='undefined') showToast('\\u26a0\\ufe0f Acceso restringido para tu rol', 'error'); }, 500);
      }
      
      // User avatar + greeting
      try {
        var raw = sessionStorage.getItem('mjunin_user');
        var user = raw ? JSON.parse(raw) : null;
        if (user) {
          var av = document.getElementById('topbarAvatar');
          if (av) av.textContent = (user.name||'U').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
          var hour = new Date().getHours();
          var greeting = hour < 12 ? 'Buenos d\\u00edas' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
          var wg = document.getElementById('welcomeGreeting');
          if (wg) wg.innerHTML = greeting + ', <span>' + (user.name||'Usuario') + '</span>';
          var wr = document.getElementById('welcomeRole');
          var roleMap = { SUPER_ADMIN:'\\ud83d\\udc51 Super Admin', INTENDENTE:'\\ud83c\\udfdb\\ufe0f Intendente', TENANT_ADMIN:'\\ud83c\\udfe6 Administrador', TENANT_USER:'\\ud83d\\udc64 Usuario', DEMO:'\\ud83d\\udc41\\ufe0f Demo' };
          if (wr) wr.textContent = roleMap[user.role] || user.role || 'Usuario';
        }
      } catch(e) {}
      
      // Charts
      if (window.MuniCharts) {
        try { window.mainChart = MuniCharts.gastoMensual('chartGastoMensual'); } catch(e) {}
        try { MuniCharts.presupuesto('chartPresupuestoDoughnut'); } catch(e) {}
        try { MuniCharts.horasExtra('chartHorasExtra'); } catch(e) {}
        try { MuniCharts.ejecucionRadar('chartEjecucionRadar'); } catch(e) {}
      }
      
      // Checkbook from MuniDB
      if (window.MuniDB) {
        try {
          var pagos = MuniDB.sort(MuniDB.getAll('pagos'),'fecha','desc').slice(0,5);
          var tbody = document.getElementById('checkbookBody');
          if (tbody && pagos.length) {
            tbody.innerHTML = pagos.map(function(p) {
              return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)"><td style="padding:10px 12px;font-size:12px">' + new Date(p.fecha).toLocaleDateString('es-AR') + '</td><td style="padding:10px 12px;font-size:13px;font-weight:700">' + (p.proveedor||'') + '</td><td style="padding:10px 12px;font-size:11px;color:rgba(148,163,184,0.7)">' + (p.concepto||'').slice(0,35) + '</td><td style="padding:10px 12px"><span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(59,130,246,0.1);color:#60a5fa">' + (p.secretaria||'') + '</span></td><td style="padding:10px 12px;font-weight:800;color:#10b981">$' + ((p.monto||0)/1000000).toFixed(2) + 'M</td></tr>';
            }).join('');
          }
        } catch(e) {}
        
        // Live KPIs
        try {
          var empleados = MuniDB.getAll('empleados');
          var activos = empleados.filter(function(e){return e.estado==='activo';}).length;
          var el1 = document.getElementById('kpi-empleados-val');
          if (el1) el1.textContent = activos.toLocaleString('es-AR');
        } catch(e) {}
        try {
          var reclamos = MuniDB.getAll('reclamos');
          var pendientes = reclamos.filter(function(r){return r.estado!=='resuelto';}).length;
          var el2 = document.getElementById('kpi-reclamos-val');
          if (el2) el2.textContent = pendientes;
        } catch(e) {}
      }
    });
  })();
  </script>
  
  <!-- Feature scripts -->
  <script src="js/dashboard.js"></script>
  <script src="js/notifications.js"></script>
  <script src="js/search-global.js"></script>
  <script src="js/analytics-live.js"></script>
  <script src="js/live-clock.js"></script>
  <script src="js/chat-widget.js"></script>
  <script src="js/theme-switcher.js"></script>
  <script src="js/onboarding.js"></script>
</body>
</html>
"""

idx = content.find('<script src="js/nav.js"></script>')
if idx != -1:
    new_content = content[:idx] + new_scripts
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Replaced successfully")
else:
    print("Could not find script tag")
