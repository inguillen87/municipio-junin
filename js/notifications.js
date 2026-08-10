// ============================================================
// notifications.js — MuniControl Notification Center
// Real-time alerts, notification bell, persistence
// ============================================================

window.MuniNotifications = (function() {
  const STORAGE_KEY = 'muni_notifications';
  
  // Default notifications seeded on first load
  const SEED_NOTIFICATIONS = [
    {
      id: 'n001', type: 'warning', priority: 'high',
      title: 'Presupuesto Obras Públicas al 117%',
      body: 'Se superaron los fondos asignados en $3.4M. Requiere autorización del Intendente.',
      module: 'presupuesto', href: 'presupuesto.html',
      timestamp: new Date(Date.now() - 15*60000).toISOString(), read: false
    },
    {
      id: 'n002', type: 'info', priority: 'medium',
      title: '8 reclamos sin atender en Zona Norte',
      body: 'Reclamos de baches y luminaria acumulados en las últimas 48hs.',
      module: 'vecinos', href: 'vecinos.html',
      timestamp: new Date(Date.now() - 45*60000).toISOString(), read: false
    },
    {
      id: 'n003', type: 'success', priority: 'low',
      title: 'Licitación adjudicada: Bacheo Norte',
      body: 'Construar SA quedó seleccionada. Orden de inicio emitida.',
      module: 'licitaciones', href: 'licitaciones.html',
      timestamp: new Date(Date.now() - 2*3600000).toISOString(), read: false
    },
    {
      id: 'n004', type: 'error', priority: 'high',
      title: '3 contratos vencen en menos de 7 días',
      body: 'Revisar renovaciones en Salud, Mantenimiento y Seguridad.',
      module: 'rrhh', href: 'rrhh.html',
      timestamp: new Date(Date.now() - 3*3600000).toISOString(), read: false
    },
    {
      id: 'n005', type: 'info', priority: 'low',
      title: 'Reporte mensual disponible',
      body: 'El informe ejecutivo de julio ya está listo para descargar.',
      module: 'exportar', href: 'exportar.html',
      timestamp: new Date(Date.now() - 24*3600000).toISOString(), read: true
    }
  ];

  function getAll() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_NOTIFICATIONS));
      return SEED_NOTIFICATIONS;
    }
    return JSON.parse(stored);
  }

  function getUnread() {
    return getAll().filter(n => !n.read);
  }

  function markRead(id) {
    const notifs = getAll();
    const n = notifs.find(x => x.id === id);
    if (n) { n.read = true; save(notifs); }
  }

  function markAllRead() {
    const notifs = getAll().map(n => ({...n, read: true}));
    save(notifs);
    renderBell();
    renderPanel();
  }

  function add(notif) {
    const notifs = getAll();
    notifs.unshift({...notif, id: 'n' + Date.now(), timestamp: new Date().toISOString(), read: false});
    save(notifs.slice(0, 50)); // max 50
    renderBell();
    if (typeof showToast !== 'undefined') {
      const icons = {warning:'\u26a0\ufe0f', error:'\ud83d\udd34', success:'\u2705', info:'\u2139\ufe0f'};
      showToast(`${icons[notif.type]||''} ${notif.title}`, notif.type === 'error' ? 'error' : notif.type === 'warning' ? 'warning' : 'success');
    }
  }

  function save(notifs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs));
  }

  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'Hace un momento';
    if (diff < 3600) return `Hace ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff/3600)}h`;
    return `Hace ${Math.floor(diff/86400)}d`;
  }

  function renderBell() {
    const bell = document.getElementById('notifBell');
    const badge = document.getElementById('notifBadge');
    if (!bell) return;
    const unread = getUnread().length;
    if (badge) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }
  }

  function renderPanel() {
    const list = document.getElementById('notifList');
    if (!list) return;
    const notifs = getAll().slice(0, 15);
    const icons = {warning:'\u26a0\ufe0f', error:'\ud83d\udd34', success:'\u2705', info:'\u2139\ufe0f'};
    const colors = {warning:'#f59e0b', error:'#ef4444', success:'#10b981', info:'#3b82f6'};
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read ? 'read' : 'unread'}" onclick="MuniNotifications.markRead('${n.id}');this.classList.add('read');document.getElementById('notifBadge').textContent=Math.max(0,(parseInt(document.getElementById('notifBadge').textContent||0)-1));if(${!n.read}&&'${n.href}')window.location='${n.href}'">
        <div class="notif-icon" style="background:${colors[n.type]}22;color:${colors[n.type]}">${icons[n.type]||'\ud83d\udd14'}</div>
        <div class="notif-content">
          <div class="notif-title">${n.title}</div>
          <div class="notif-body">${n.body}</div>
          <div class="notif-time">${timeAgo(n.timestamp)}</div>
        </div>
        ${!n.read ? '<div class="notif-dot"></div>' : ''}
      </div>
    `).join('');
  }

  function initBell(container) {
    // Create bell button + dropdown panel
    const bellHTML = `
      <div class="notif-bell-wrap" id="notifWrap" style="position:relative">
        <button id="notifBell" onclick="MuniNotifications.togglePanel()" aria-label="Notificaciones" style="position:relative;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all 0.2s;color:var(--text-primary)">
          \ud83d\udd14
          <span id="notifBadge" style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;font-size:9px;font-weight:800;min-width:16px;height:16px;border-radius:99px;display:none;align-items:center;justify-content:center;padding:0 3px;font-family:'Inter',sans-serif">0</span>
        </button>
        <div id="notifPanel" style="display:none;position:absolute;top:calc(100% + 10px);right:0;width:340px;background:var(--card-bg,#0d1526);border:1px solid rgba(255,255,255,0.08);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);z-index:9999;overflow:hidden;max-height:480px;display:none;flex-direction:column">
          <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:13px;font-weight:800">Notificaciones <span id="notifCount" style="color:rgba(148,163,184,0.6)"></span></div>
            <button onclick="MuniNotifications.markAllRead()" style="font-size:11px;color:#60a5fa;background:none;border:none;cursor:pointer;font-weight:700">Marcar todo leído</button>
          </div>
          <div id="notifList" style="overflow-y:auto;max-height:380px"></div>
        </div>
      </div>
    `;
    if (container) {
      container.insertAdjacentHTML('beforeend', bellHTML);
    }
    // Add styles
    if (!document.getElementById('notifStyles')) {
      const style = document.createElement('style');
      style.id = 'notifStyles';
      style.innerHTML = `
        .notif-item { display:flex;gap:12px;padding:12px 16px;cursor:pointer;transition:background 0.2s;border-bottom:1px solid rgba(255,255,255,0.04); }
        .notif-item:hover { background:rgba(255,255,255,0.04); }
        .notif-item.unread { background:rgba(59,130,246,0.03); }
        .notif-icon { width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0; }
        .notif-content { flex:1;min-width:0; }
        .notif-title { font-size:12px;font-weight:700;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .notif-body { font-size:11px;color:rgba(148,163,184,0.7);line-height:1.4;margin-bottom:4px; }
        .notif-time { font-size:10px;color:rgba(100,116,139,0.5);font-weight:600; }
        .notif-dot { width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:4px; }
        #notifBell:hover { background:rgba(255,255,255,0.08)!important;transform:scale(1.05); }
      `;
      document.head.appendChild(style);
    }
    renderBell();
    // Close on outside click
    document.addEventListener('click', function(e) {
      const wrap = document.getElementById('notifWrap');
      if (wrap && !wrap.contains(e.target)) {
        const panel = document.getElementById('notifPanel');
        if (panel) panel.style.display = 'none';
      }
    });
  }

  function togglePanel() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    const isOpen = panel.style.display === 'flex';
    panel.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) {
      renderPanel();
      const unread = getUnread().length;
      const cnt = document.getElementById('notifCount');
      if (cnt) cnt.textContent = '(' + unread + ' sin leer)';
    }
  }

  // Auto-init when nav.js builds sidebar (hook into topbar)
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      const topbarRight = document.querySelector('.topbar-right');
      if (topbarRight && !document.getElementById('notifBell')) {
        initBell(topbarRight);
      }
    }, 300);
  });

  // Simulate incoming notifications every 5 minutes
  setInterval(function() {
    const types = ['info','warning','success'];
    const msgs = [
      {title:'Nuevo reclamo registrado', body:'Luminaria rota en Av. República 445', module:'vecinos', href:'vecinos.html'},
      {title:'Pago procesado', body:'Factura PR-2026-089 de $245.000 acreditada', module:'hacienda', href:'hacienda.html'},
      {title:'Actualización de obra', body:'Plaza Belgrano avanzó al 100% de completitud', module:'obras', href:'obras.html'},
    ];
    const t = types[Math.floor(Math.random()*types.length)];
    const m = msgs[Math.floor(Math.random()*msgs.length)];
    add({type:t, priority:'low', ...m});
  }, 5*60*1000);

  return { getAll, getUnread, markRead, markAllRead, add, renderBell, renderPanel, togglePanel, initBell };
})();

