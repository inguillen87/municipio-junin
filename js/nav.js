// ============================================================
// NAV.JS v5 — Sidebar + Auth global — MuniControl
// ============================================================

// SESSION GUARD — redirect to login if no session
(function checkAuth() {
  var pub = ['login.html', 'landing.html', 'ciudadano.html', 'cuentas-claras.html', '404.html', 'offline.html'];
  var page = window.location.pathname.split('/').pop() || 'index.html';
  if (pub.indexOf(page) !== -1) return;
  var sess = sessionStorage.getItem('mjunin_user');
  if (!sess) window.location.replace('login.html');
})();

// RBAC page guard
window.requireRole = function(allowedRoles) {
  try {
    var raw = sessionStorage.getItem('mjunin_user');
    if (!raw) { window.location.replace('login.html'); return false; }
    var user = JSON.parse(raw);
    if (!allowedRoles.includes(user.role)) {
      sessionStorage.setItem('access_denied', '1');
      window.location.replace('index.html');
      return false;
    }
    return true;
  } catch(e) { window.location.replace('login.html'); return false; }
};

// NAV ITEMS — SVG icons (no emoji, safe cross-browser)
var NAV_ITEMS = [
  // PRINCIPAL
  { id:'dashboard',   href:'index.html',         icon:'chart',   label:'Panel Principal',     section:'PRINCIPAL',      access:'all' },
  { id:'analytics',   href:'analytics.html',      icon:'bar',     label:'Reportes',            section:'PRINCIPAL',      access:'all' },
  { id:'reportes',    href:'reportes.html',        icon:'doc',     label:'Centro de Reportes',  section:'PRINCIPAL',      access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  // GESTION
  { id:'hacienda',    href:'hacienda.html',        icon:'bank',    label:'Hacienda',            section:'GESTION',        access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'presupuesto', href:'presupuesto.html',     icon:'wallet',  label:'Presupuesto',         section:'GESTION',        access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'control',     href:'control.html',         icon:'gauge',   label:'Control de Gastos',   section:'GESTION',        access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'rrhh',        href:'rrhh.html',            icon:'people',  label:'RRHH',                section:'GESTION',        access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'licitaciones',href:'licitaciones.html',    icon:'folder',  label:'Licitaciones',        section:'GESTION',        access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  // OPERACIONES
  { id:'obras',       href:'obras.html',           icon:'crane',   label:'Obras',               section:'OPERACIONES',    access:'all' },
  { id:'mapa',        href:'mapa.html',            icon:'map',     label:'Mapa Municipal',      section:'OPERACIONES',    access:'all' },
  { id:'vecinos',     href:'vecinos.html',         icon:'bell',    label:'Reclamos 311',        section:'OPERACIONES',    access:'all' },
  { id:'forms',       href:'forms.html',           icon:'form',    label:'Formularios',         section:'OPERACIONES',    access:['SUPER_ADMIN','TENANT_ADMIN'] },
  // COMUNICACION
  { id:'ia',          href:'ia.html',              icon:'ai',      label:'Asistente IA',        section:'COMUNICACION',   access:'all' },
  { id:'whatsapp',    href:'whatsapp.html',        icon:'chat',    label:'WhatsApp Bot',        section:'COMUNICACION',   access:['SUPER_ADMIN','TENANT_ADMIN'] },
  // TRANSPARENCIA
  { id:'cuentas',     href:'cuentas-claras.html',  icon:'eye',     label:'Cuentas Claras',      section:'TRANSPARENCIA',  access:'all' },
  { id:'ciudadano',   href:'ciudadano.html',       icon:'home',    label:'Portal Ciudadano',    section:'TRANSPARENCIA',  access:'all' },
  { id:'exportar',    href:'exportar.html',        icon:'export',  label:'Exportar',            section:'TRANSPARENCIA',  access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  // SISTEMA
  { id:'admin',       href:'admin.html',           icon:'shield',  label:'Administracion',      section:'SISTEMA',        access:['SUPER_ADMIN'] },
  { id:'configuracion',href:'configuracion.html',  icon:'settings',label:'Configuracion',       section:'SISTEMA',        access:['SUPER_ADMIN','TENANT_ADMIN'] },
];

// SVG ICONS — clean vector icons for each key
var ICONS = {
  chart:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  bar:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="17" y="13" width="4" height="8"/></svg>',
  doc:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  bank:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>',
  wallet:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  gauge:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l6.5-6.5"/></svg>',
  people:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  folder:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  crane:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  map:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
  bell:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  form:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>',
  ai:       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>',
  chat:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  eye:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  home:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  export:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  shield:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  logout:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  moon:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  lock:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  logo:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

function getIcon(name) {
  return ICONS[name] || ICONS.doc;
}

function canAccess(item, role) {
  var acc = item.access;
  if (acc === 'all') return true;
  if (Array.isArray(acc)) return acc.indexOf(role) !== -1;
  return false;
}

function buildSidebar(activeId) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { buildSidebar(activeId); });
    return;
  }

  var sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl) return;

  var user = { name:'Usuario', email:'', role:'DEMO' };
  try { user = JSON.parse(sessionStorage.getItem('mjunin_user')) || user; } catch(e) {}

  var role = user.role || 'DEMO';
  var initials = (user.name || 'U').split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
  var roleLabels = {
    SUPER_ADMIN:'Super Admin', INTENDENTE:'Intendente',
    TENANT_ADMIN:'Administrador', TENANT_USER:'Usuario', DEMO:'Demo'
  };
  var roleColors = {
    SUPER_ADMIN:'#f59e0b', INTENDENTE:'#3b82f6',
    TENANT_ADMIN:'#10b981', TENANT_USER:'#8b5cf6', DEMO:'#64748b'
  };
  var roleColor = roleColors[role] || '#64748b';

  // Group items by section
  var sections = {};
  var sectionOrder = [];
  NAV_ITEMS.forEach(function(item) {
    if (!canAccess(item, role)) return;
    var sec = item.section || 'GENERAL';
    if (!sections[sec]) { sections[sec] = []; sectionOrder.push(sec); }
    sections[sec].push(item);
  });

  var html = '';

  // Logo
  html += '<div class="sidebar-logo">';
  html += '<div class="sidebar-logo-icon">' + getIcon('logo') + '</div>';
  html += '<div><div class="sidebar-logo-name">MuniControl</div><div class="sidebar-logo-sub">Junin · 2026</div></div>';
  html += '<button class="sidebar-collapse-btn" id="sidebarToggle" title="Colapsar">&#8592;</button>';
  html += '</div>';

  // Nav sections
  html += '<nav class="sidebar-nav">';
  sectionOrder.forEach(function(sec) {
    html += '<div class="nav-section-label">' + sec + '</div>';
    sections[sec].forEach(function(item) {
      var isActive = (item.id === activeId);
      html += '<a href="' + item.href + '" class="nav-item' + (isActive ? ' active' : '') + '" id="navItem_' + item.id + '">';
      html += '<span class="nav-icon">' + getIcon(item.icon) + '</span>';
      html += '<span class="nav-label">' + item.label + '</span>';
      if (isActive) html += '<span class="nav-active-dot"></span>';
      html += '</a>';
    });
  });
  html += '</nav>';

  // User footer
  html += '<div class="sidebar-user">';
  html += '<div class="sidebar-user-avatar" style="background:' + roleColor + '22;color:' + roleColor + '">' + initials + '</div>';
  html += '<div class="sidebar-user-info">';
  html += '<div class="sidebar-user-name">' + (user.name || 'Usuario') + '</div>';
  html += '<div class="sidebar-user-role" style="color:' + roleColor + '">' + (roleLabels[role] || role) + '</div>';
  html += '</div>';
  html += '<button class="sidebar-logout-btn" onclick="doLogout()" title="Cerrar sesion">' + getIcon('logout') + '</button>';
  html += '</div>';

  sidebarEl.innerHTML = html;

  // MOBILE TOGGLE — bulletproof
  initMobileToggle(sidebarEl);

  // Inject sidebar CSS (once)
  injectSidebarCSS();
}

function initMobileToggle(sidebarEl) {
  // Find menuBtn — retry mechanism for pages that build it after sidebar
  function attachToggle() {
    var menuBtn = document.getElementById('menuBtn');
    if (!menuBtn) return;

    // Clone to remove stale listeners
    var fresh = menuBtn.cloneNode(true);
    menuBtn.parentNode.replaceChild(fresh, menuBtn);

    // Overlay
    var overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebarOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:998;display:none;';
      document.body.appendChild(overlay);
    }

    function open() {
      sidebarEl.classList.add('mobile-open');
      overlay.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
    function close() {
      sidebarEl.classList.remove('mobile-open');
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }

    fresh.addEventListener('click', function(e) {
      e.stopPropagation();
      sidebarEl.classList.contains('mobile-open') ? close() : open();
    });
    overlay.addEventListener('click', close);

    // Close on nav link click
    sidebarEl.querySelectorAll('a.nav-item').forEach(function(a) {
      a.addEventListener('click', function() { if(window.innerWidth <= 900) close(); });
    });
  }

  attachToggle();
  // Also attach after DOMContentLoaded in case menuBtn isn't there yet
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachToggle);
  }
}

function doLogout() {
  sessionStorage.removeItem('mjunin_user');
  window.location.href = 'login.html';
}

function injectSidebarCSS() {
  if (document.getElementById('sidebarNavCSS')) return;
  var style = document.createElement('style');
  style.id = 'sidebarNavCSS';
  style.textContent = [
    // Layout
    'body{margin:0;font-family:Inter,system-ui,sans-serif;}',
    '.sidebar{position:fixed;left:0;top:0;height:100vh;width:260px;background:#0a1628;border-right:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;z-index:200;overflow:hidden;transition:left 0.3s cubic-bezier(0.4,0,0.2,1);}',
    '.main-content{margin-left:260px;min-height:100vh;}',
    // Logo
    '.sidebar-logo{display:flex;align-items:center;gap:10px;padding:18px 16px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;}',
    '.sidebar-logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;}',
    '.sidebar-logo-name{font-family:Outfit,sans-serif;font-size:15px;font-weight:900;color:#f0f4ff;line-height:1.2;}',
    '.sidebar-logo-sub{font-size:10px;color:rgba(148,163,184,0.5);font-weight:600;}',
    '.sidebar-collapse-btn{margin-left:auto;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(148,163,184,0.6);width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '.sidebar-collapse-btn:hover{background:rgba(255,255,255,0.1);color:#f0f4ff;}',
    // Nav
    '.sidebar-nav{flex:1;overflow-y:auto;padding:10px 8px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.08) transparent;}',
    '.sidebar-nav::-webkit-scrollbar{width:4px;}',
    '.sidebar-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px;}',
    '.nav-section-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:rgba(148,163,184,0.35);padding:14px 10px 6px;line-height:1;}',
    '.nav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;text-decoration:none;color:rgba(148,163,184,0.75);font-size:13px;font-weight:500;transition:all 0.15s;position:relative;margin-bottom:1px;}',
    '.nav-item:hover{background:rgba(255,255,255,0.06);color:#f0f4ff;}',
    '.nav-item.active{background:rgba(59,130,246,0.12);color:#60a5fa;font-weight:700;}',
    '.nav-item.active .nav-icon svg{stroke:#60a5fa;}',
    '.nav-icon{width:20px;height:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0.8;}',
    '.nav-item.active .nav-icon{opacity:1;}',
    '.nav-icon svg{stroke:currentColor;}',
    '.nav-active-dot{width:6px;height:6px;background:#3b82f6;border-radius:50%;margin-left:auto;flex-shrink:0;}',
    // User footer
    '.sidebar-user{display:flex;align-items:center;gap:10px;padding:14px 16px;border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0;}',
    '.sidebar-user-avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;}',
    '.sidebar-user-info{flex:1;min-width:0;}',
    '.sidebar-user-name{font-size:12px;font-weight:700;color:#f0f4ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.sidebar-user-role{font-size:10px;font-weight:700;margin-top:1px;}',
    '.sidebar-logout-btn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(148,163,184,0.6);width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;}',
    '.sidebar-logout-btn:hover{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2);color:#f87171;}',
    // Topbar
    '.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:rgba(6,11,24,0.95);border-bottom:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100;}',
    '.topbar-left{display:flex;align-items:center;gap:14px;}',
    '.topbar-right{display:flex;align-items:center;gap:10px;}',
    '.menu-btn{display:none;width:38px;height:38px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#f0f4ff;font-size:18px;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;}',
    '.menu-btn:hover{background:rgba(255,255,255,0.1);}',
    '.page-title h1{font-family:Outfit,sans-serif;font-size:20px;font-weight:900;color:#f0f4ff;margin:0;}',
    '.breadcrumb{font-size:11px;color:rgba(148,163,184,0.55);font-weight:500;}',
    '.topbar-avatar{width:34px;height:34px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:white;cursor:pointer;flex-shrink:0;}',
    '.page-content{padding:24px;}',
    '.card{background:rgba(13,21,38,0.9);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;}',
    '.card:hover{border-color:rgba(255,255,255,0.1);}',
    // Mobile
    '@media(max-width:900px){',
    '.menu-btn{display:flex!important;}',
    '.sidebar{left:-280px!important;}',
    '.sidebar.mobile-open{left:0!important;box-shadow:4px 0 30px rgba(0,0,0,0.6)!important;}',
    '.main-content{margin-left:0!important;width:100%!important;}',
    '}',
    '@media(min-width:901px){',
    '.menu-btn{display:none!important;}',
    '.sidebar{left:0!important;}',
    '.main-content{margin-left:260px!important;}',
    '}',
  ].join('');
  document.head.appendChild(style);
}

// Toast utility (fallback if toast.js not loaded)
window.showToast = window.showToast || function(msg, type) {
  var t = document.createElement('div');
  var colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0d1526;border:1px solid ' + (colors[type]||'#3b82f6') + '44;color:#f0f4ff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:320px;animation:toastIn 0.25s ease';
  t.textContent = msg;
  if (!document.getElementById('toastKF')) {
    var s = document.createElement('style');
    s.id = 'toastKF';
    s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(function(){t.remove();},300); }, 3000);
};
