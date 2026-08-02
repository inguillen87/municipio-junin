// ============================================================
// DASHBOARD.JS — Lógica principal del dashboard
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  setCurrentDate();
  animateKPIs();
  buildAlertasTable();
  buildEntidadesList();
  buildActivityFeed();
  initAllCharts();
  initSidebar();
  animateProgressBars();
});

// ── FECHA ACTUAL ──────────────────────────────────────────
function setCurrentDate() {
  const el = document.getElementById('currentDate');
  const now = new Date();
  el.textContent = now.toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ── ANIMACIÓN DE KPIs ─────────────────────────────────────
function animateKPIs() {
  document.querySelectorAll('.kpi-value[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const isMoney = el.classList.contains('money');
    const isPct   = el.classList.contains('pct');
    const duration = 1600;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(eased * target);

      if (isMoney) {
        el.textContent = '$' + formatMoney(current);
      } else if (isPct) {
        el.textContent = current + '%';
      } else {
        el.textContent = current.toLocaleString('es-AR');
      }

      if (progress < 1) requestAnimationFrame(update);
    }

    // Delay escalonado por card
    const delay = Array.from(document.querySelectorAll('.kpi-value[data-target]')).indexOf(el) * 100;
    setTimeout(() => requestAnimationFrame(update), delay);
  });
}

function formatMoney(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000)    return (num / 1000).toFixed(0) + 'K';
  return num.toLocaleString('es-AR');
}

// ── PROGRESS BAR ─────────────────────────────────────────
function animateProgressBars() {
  setTimeout(() => {
    const pb = document.getElementById('presupProgressBar');
    if (pb) pb.style.width = '72%';
  }, 400);

  // Entidades progress bars
  setTimeout(() => {
    document.querySelectorAll('.entidad-bar[data-pct]').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  }, 600);
}

// ── TABLA DE ALERTAS ─────────────────────────────────────
function buildAlertasTable() {
  const tbody = document.getElementById('alertasBody');
  if (!tbody) return;

  tbody.innerHTML = MUNICIPIO_DATA.alertas.map(a => {
    const isOver = parseFloat(a.desvio) > 0;
    const statusLabel = { critical: 'Crítico', warning: 'Atención', ok: 'Normal' }[a.estado];
    return `
      <tr>
        <td><strong>${a.secretaria}</strong></td>
        <td>$${(a.presupuesto / 1000000).toFixed(1)}M</td>
        <td>$${(a.ejecutado / 1000000).toFixed(1)}M</td>
        <td class="${isOver ? 'deviation-up' : 'deviation-ok'}">${a.desvio}</td>
        <td><span class="status-badge ${a.estado}">${statusLabel}</span></td>
      </tr>
    `;
  }).join('');
}

// ── LISTA DE ENTIDADES ────────────────────────────────────
function buildEntidadesList() {
  const container = document.getElementById('entidadesList');
  if (!container) return;

  container.innerHTML = MUNICIPIO_DATA.entidades.map(e => `
    <div class="entidad-item">
      <div class="entidad-header">
        <span class="entidad-name">
          <span>${e.emoji}</span>
          <span>${e.nombre}</span>
        </span>
        <span class="entidad-pct" style="color:${e.color}">${e.progreso}%</span>
      </div>
      <div class="entidad-bar-wrap">
        <div class="entidad-bar" data-pct="${e.progreso}"
          style="background:${e.color}; width:0%"></div>
      </div>
    </div>
  `).join('');
}

// ── ACTIVIDAD RECIENTE ────────────────────────────────────
function buildActivityFeed() {
  const container = document.getElementById('activityFeed');
  if (!container) return;

  container.innerHTML = MUNICIPIO_DATA.actividad.map(a => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${a.color}; box-shadow: 0 0 6px ${a.color}88"></div>
      <div class="activity-content">
        <div class="activity-text">${a.texto}</div>
        <div class="activity-time">${a.tiempo}</div>
      </div>
    </div>
  `).join('');
}

// ── SIDEBAR TOGGLE ────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const menuBtn = document.getElementById('menuBtn');
  const mainContent = document.getElementById('mainContent');

  // Desktop collapse
  toggleBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
    // Resize charts after transition
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  });

  // Mobile overlay
  menuBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 900) {
      if (!sidebar.contains(e.target) && !menuBtn?.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    }
  });

  // Nav items active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
      if (this.getAttribute('href') === '#') {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
      }
    });
  });
}

// ── EXPORT BUTTON ─────────────────────────────────────────
document.getElementById('btnExport')?.addEventListener('click', () => {
  const blob = new Blob([generateReport()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe-ejecutivo-junin-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

function generateReport() {
  const now = new Date().toLocaleDateString('es-AR');
  const d = MUNICIPIO_DATA;
  const totalEmpleados = d.secretarias.reduce((a,s) => a + s.empleados, 0);
  const totalGasto = d.secretarias.reduce((a,s) => a + s.ejecutado, 0);
  const totalHsExtra = d.horasExtra.reduce((a,h) => a + h.horas, 0);

  return `
MUNICIPIO DE JUNÍN — INFORME EJECUTIVO
Fecha: ${now}
========================================

RESUMEN EJECUTIVO
-----------------
Total empleados:    ${totalEmpleados.toLocaleString('es-AR')}
Gasto agosto 2026:  $${(totalGasto/1000000).toFixed(1)} millones
Horas extra mes:    ${totalHsExtra.toLocaleString('es-AR')} hs
Presupuesto ejec.:  72%

DETALLE POR SECRETARÍA
-----------------------
${d.secretarias.map(s =>
  `${s.nombre.padEnd(20)} ${s.empleados} emp. | $${(s.ejecutado/1000000).toFixed(1)}M ejecutado`
).join('\n')}

ALERTAS PRESUPUESTARIAS
------------------------
${d.alertas.filter(a => a.estado !== 'ok').map(a =>
  `⚠ ${a.secretaria}: desvío ${a.desvio} (presup. $${(a.presupuesto/1000000).toFixed(1)}M | ejec. $${(a.ejecutado/1000000).toFixed(1)}M)`
).join('\n')}

Informe generado por Sistema Municipal Junín v1.0
`;
}

// ── BÚSQUEDA GLOBAL (básica) ───────────────────────────────
document.getElementById('globalSearch')?.addEventListener('input', function() {
  const q = this.value.toLowerCase();
  if (!q) return;
  // Destacar secretarías en la tabla de alertas
  document.querySelectorAll('#alertasBody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.background = text.includes(q) ? 'rgba(59,130,246,0.08)' : '';
  });
});

// ── QUICK ACTION BUTTONS ─────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Quick action navigation buttons
  var qaLinks = {
    'qaIA': 'ia.html', 'qaRRHH': 'rrhh.html', 'qaLic': 'licitaciones.html',
    'qaVecinos': 'vecinos.html', 'qaAnalytics': 'analytics.html', 'qaExportar': 'exportar.html'
  };
  Object.keys(qaLinks).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.onclick = function() { window.location.href = qaLinks[id]; };
  });

  // Welcome banner buttons
  var btnIA = document.getElementById('btnConsultarIA');
  if (btnIA) btnIA.onclick = function() { window.location.href = 'ia.html'; };
  var btnReport = document.getElementById('btnVerReporte');
  if (btnReport) btnReport.onclick = function() { window.location.href = 'analytics.html'; };

  // Alert dismissal
  var alertClose = document.getElementById('alertCloseBtn');
  if (alertClose) alertClose.onclick = function() {
    var banner = document.getElementById('alertBanner');
    if (banner) { banner.style.opacity='0'; banner.style.transform='translateY(-8px)'; setTimeout(function(){banner.style.display='none';},300); }
    sessionStorage.setItem('alert_dismissed','1');
  };
  if (sessionStorage.getItem('alert_dismissed')) {
    var b = document.getElementById('alertBanner');
    if (b) b.style.display='none';
  }

  // Chart period toggle (Anual/Semestre)
  var btnAnual = document.getElementById('btnAnual');
  var btnSemestre = document.getElementById('btnSemestre');
  if (btnAnual && btnSemestre) {
    btnAnual.onclick = function() {
      btnAnual.classList.add('active'); btnSemestre.classList.remove('active');
      if (window.mainChart) {
        window.mainChart.data.labels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        window.mainChart.data.datasets[0].data = [22.1,24.3,21.8,26.5,28.2,25.9,31.4,28.7,29.8,27.3,30.1,32.4];
        window.mainChart.update();
      }
    };
    btnSemestre.onclick = function() {
      btnSemestre.classList.add('active'); btnAnual.classList.remove('active');
      if (window.mainChart) {
        window.mainChart.data.labels = ['Feb','Mar','Abr','May','Jun','Jul'];
        window.mainChart.data.datasets[0].data = [24.3,21.8,26.5,28.2,25.9,31.4];
        window.mainChart.update();
      }
    };
  }

  // Notification bell dropdown
  var bell = document.getElementById('notifBell');
  if (bell) {
    bell.onclick = function(e) {
      e.stopPropagation();
      var dd = document.getElementById('notifDropdown');
      if (!dd) {
        dd = document.createElement('div');
        dd.id = 'notifDropdown';
        dd.style.cssText = 'position:fixed;top:64px;right:20px;width:300px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:0;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.3)';
        dd.innerHTML = '<div style="padding:14px 16px;border-bottom:1px solid var(--border);font-weight:800;font-size:13px">🔔 Notificaciones</div>' +
          '<div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.03)"><div style="font-size:12px;font-weight:600;color:var(--text-primary)">⚠️ Obras P. sobre presupuesto</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">18% por encima del límite mensual</div></div>' +
          '<div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.03)"><div style="font-size:12px;font-weight:600;color:var(--text-primary)">🔔 23 reclamos sin atender</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">Llevan más de 48hs pendientes</div></div>' +
          '<div style="padding:12px 16px"><div style="font-size:12px;font-weight:600;color:var(--text-primary)">✅ Nómina de agosto procesada</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">1.247 recibos generados correctamente</div></div>';
        document.body.appendChild(dd);
        setTimeout(function() { document.addEventListener('click', function rem() { dd.remove(); document.removeEventListener('click',rem); }); }, 0);
      } else { dd.remove(); }
    };
  }

  // Global search with dropdown
  var gs = document.getElementById('globalSearch');
  if (gs) {
    var SEARCH_ITEMS = [
      {label:'📊 Dashboard Ejecutivo', url:'index.html'}, {label:'💰 Presupuesto Anual', url:'presupuesto.html'},
      {label:'👥 Personal Municipal', url:'rrhh.html'}, {label:'⚖️ Licitaciones', url:'licitaciones.html'},
      {label:'🏘️ Reclamos Vecinales', url:'vecinos.html'}, {label:'📈 Analytics', url:'analytics.html'},
      {label:'🗺️ Mapa Financiero', url:'mapa.html'}, {label:'📱 WhatsApp Bot', url:'whatsapp.html'},
      {label:'📤 Exportar PDF/Excel', url:'exportar.html'}, {label:'🤖 Asistente IA', url:'ia.html'},
    ];
    gs.addEventListener('input', function() {
      var q = this.value.toLowerCase().trim();
      var existing = document.getElementById('searchDD'); if (existing) existing.remove();
      if (!q) return;
      var matches = SEARCH_ITEMS.filter(function(i){return i.label.toLowerCase().includes(q);});
      if (!matches.length) return;
      var dd = document.createElement('div');
      dd.id = 'searchDD';
      dd.style.cssText = 'position:absolute;top:100%;left:0;width:240px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.3);overflow:hidden;margin-top:4px';
      dd.innerHTML = matches.slice(0,5).map(function(m){
        return '<div style="padding:10px 14px;font-size:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.03)" onclick="window.location.href=\'' + m.url + '\'" onmouseover="this.style.background=\'rgba(59,130,246,0.1)\'" onmouseout="this.style.background=\'\'">'+m.label+'</div>';
      }).join('');
      gs.parentElement.style.position='relative';
      gs.parentElement.appendChild(dd);
      setTimeout(function(){ document.addEventListener('click', function rem(){ dd.remove(); document.removeEventListener('click',rem);},{once:true}); }, 100);
    });
  }

  // Export button — topbar
  var btnTopExport = document.getElementById('btnTopExport');
  if (btnTopExport) {
    btnTopExport.onclick = function() {
      window.location.href = 'exportar.html';
    };
  }

  // Last update counter
  var mins = 2;
  setInterval(function() {
    mins++;
    var el = document.getElementById('lastUpdateText');
    if (el) el.textContent = 'hace ' + mins + ' min';
  }, 60000);
});

