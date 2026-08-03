// ============================================================
// NAV.JS v6 - Sidebar collapsible + Mobile hamburger
// Desktop: sidebar toggle 260px <-> 64px (icon-only mode)
// Mobile: slide in/out with overlay
// ============================================================

// SESSION GUARD
(function checkAuth() {
  var pub = ['login.html','landing.html','ciudadano.html','cuentas-claras.html','404.html','offline.html'];
  var page = window.location.pathname.split('/').pop() || 'index.html';
  if (pub.indexOf(page) !== -1) return;
  var sess = sessionStorage.getItem('mjunin_user');
  if (!sess) window.location.replace('login.html');
})();

window.requireRole = function(allowedRoles) {
  try {
    var raw = sessionStorage.getItem('mjunin_user');
    if (!raw) { window.location.replace('login.html'); return false; }
    var user = JSON.parse(raw);
    if (!allowedRoles.includes(user.role)) {
      window.location.replace('index.html'); return false;
    }
    return true;
  } catch(e) { window.location.replace('login.html'); return false; }
};

// NAV ITEMS
var NAV_ITEMS = [
  { id:'dashboard',    href:'index.html',         icon:'chart',   label:'Panel Principal',    section:'PRINCIPAL',     access:'all' },
  { id:'analytics',   href:'analytics.html',      icon:'bar',     label:'Reportes',           section:'PRINCIPAL',     access:'all' },
  { id:'reportes',    href:'reportes.html',        icon:'doc',     label:'Centro de Reportes', section:'PRINCIPAL',     access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'hacienda',    href:'hacienda.html',        icon:'bank',    label:'Hacienda',           section:'GESTION',       access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'presupuesto', href:'presupuesto.html',     icon:'wallet',  label:'Presupuesto',        section:'GESTION',       access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'control',     href:'control.html',         icon:'gauge',   label:'Control de Gastos',  section:'GESTION',       access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'rrhh',        href:'rrhh.html',            icon:'people',  label:'RRHH',               section:'GESTION',       access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'licitaciones',href:'licitaciones.html',    icon:'folder',  label:'Licitaciones',       section:'GESTION',       access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'obras',       href:'obras.html',           icon:'crane',   label:'Obras',              section:'OPERACIONES',   access:'all' },
  { id:'mapa',        href:'mapa.html',            icon:'map',     label:'Mapa Municipal',     section:'OPERACIONES',   access:'all' },
  { id:'vecinos',     href:'vecinos.html',         icon:'bell',    label:'Reclamos 311',       section:'OPERACIONES',   access:'all' },
  { id:'forms',       href:'forms.html',           icon:'form',    label:'Formularios',        section:'OPERACIONES',   access:['SUPER_ADMIN','TENANT_ADMIN'] },
  { id:'ia',          href:'ia.html',              icon:'ai',      label:'Asistente IA',       section:'COMUNICACION',  access:'all' },
  { id:'whatsapp',    href:'whatsapp.html',        icon:'chat',    label:'WhatsApp Bot',       section:'COMUNICACION',  access:['SUPER_ADMIN','TENANT_ADMIN'] },
  { id:'cuentas',     href:'cuentas-claras.html',  icon:'eye',     label:'Cuentas Claras',     section:'TRANSPARENCIA', access:'all' },
  { id:'ciudadano',   href:'ciudadano.html',       icon:'home',    label:'Portal Ciudadano',   section:'TRANSPARENCIA', access:'all' },
  { id:'exportar',    href:'exportar.html',        icon:'export',  label:'Exportar',           section:'TRANSPARENCIA', access:['SUPER_ADMIN','TENANT_ADMIN','INTENDENTE'] },
  { id:'importar',    href:'importar.html',        icon:'upload',  label:'Importar Datos',     section:'SISTEMA',       access:['SUPER_ADMIN','TENANT_ADMIN'] },
  { id:'admin',       href:'admin.html',           icon:'shield',  label:'Administracion',     section:'SISTEMA',       access:['SUPER_ADMIN'] },
  { id:'configuracion',href:'configuracion.html',  icon:'settings',label:'Configuracion',      section:'SISTEMA',       access:['SUPER_ADMIN','TENANT_ADMIN'] },
];

// SVG ICONS
var ICONS = {
  chart:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  bar:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="17" y="13" width="4" height="8"/></svg>',
  doc:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
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
  upload:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  shield:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  logout:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  logo:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  // Collapse/expand arrows
  arrowLeft:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
  arrowRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
  hamburger:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  close:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

var SIDEBAR_COLLAPSED_KEY = 'muni_sidebar_collapsed';

function getIcon(name) { return ICONS[name] || ICONS.doc; }

function canAccess(item, role) {
  var acc = item.access;
  if (acc === 'all') return true;
  if (Array.isArray(acc)) return acc.indexOf(role) !== -1;
  return false;
}

function isCollapsed() {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

function setCollapsed(val) {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, val ? '1' : '0');
}

window.buildSidebar = function(activeId) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { window.buildSidebar(activeId); });
    return;
  }

  var sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl) return;

  var user = { name: 'Usuario', email: '', role: 'DEMO' };
  try { user = JSON.parse(sessionStorage.getItem('mjunin_user')) || user; } catch(e) {}
  var role = user.role || 'DEMO';
  var initials = (user.name || 'U').split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
  var roleLabels = { SUPER_ADMIN:'Super Admin', INTENDENTE:'Intendente', TENANT_ADMIN:'Administrador', TENANT_USER:'Usuario', DEMO:'Demo' };
  var roleColors = { SUPER_ADMIN:'#f59e0b', INTENDENTE:'#3b82f6', TENANT_ADMIN:'#10b981', TENANT_USER:'#8b5cf6', DEMO:'#64748b' };
  var roleColor = roleColors[role] || '#64748b';

  // Group items
  var sections = {}, sectionOrder = [];
  NAV_ITEMS.forEach(function(item) {
    if (!canAccess(item, role)) return;
    var sec = item.section || 'GENERAL';
    if (!sections[sec]) { sections[sec] = []; sectionOrder.push(sec); }
    sections[sec].push(item);
  });

  var html = '';

  // Logo + collapse button
  html += '<div class="sb-logo">';
  html += '<div class="sb-logo-icon">' + getIcon('logo') + '</div>';
  html += '<div class="sb-logo-text"><div class="sb-logo-name">MuniControl</div><div class="sb-logo-sub">Junin 2026</div></div>';
  html += '<button class="sb-collapse-btn" id="sidebarCollapseBtn" title="Colapsar sidebar">' + getIcon('arrowLeft') + '</button>';
  html += '</div>';

  // Nav
  html += '<nav class="sb-nav">';
  sectionOrder.forEach(function(sec) {
    html += '<div class="sb-section-label"><span class="sb-section-text">' + sec + '</span></div>';
    sections[sec].forEach(function(item) {
      var isActive = (item.id === activeId);
      html += '<a href="' + item.href + '" class="sb-item' + (isActive ? ' active' : '') + '" title="' + item.label + '">';
      html += '<span class="sb-item-icon">' + getIcon(item.icon) + '</span>';
      html += '<span class="sb-item-label">' + item.label + '</span>';
      if (isActive) html += '<span class="sb-active-dot"></span>';
      html += '</a>';
    });
  });
  html += '</nav>';

  // User footer
  html += '<div class="sb-user">';
  html += '<div class="sb-user-avatar" style="background:' + roleColor + '22;color:' + roleColor + '">' + initials + '</div>';
  html += '<div class="sb-user-info"><div class="sb-user-name">' + (user.name || 'Usuario') + '</div><div class="sb-user-role" style="color:' + roleColor + '">' + (roleLabels[role] || role) + '</div></div>';
  html += '<button class="sb-logout-btn" onclick="doLogout()" title="Cerrar sesion">' + getIcon('logout') + '</button>';
  html += '</div>';

  sidebarEl.innerHTML = html;

  // Inject CSS first
  injectSidebarCSS();

  // Apply collapsed state on desktop
  if (window.innerWidth > 900 && isCollapsed()) {
    sidebarEl.classList.add('collapsed');
    adjustMainContent(true);
  }

  // Wire up collapse button (desktop)
  var collapseBtn = document.getElementById('sidebarCollapseBtn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (window.innerWidth <= 900) return; // mobile uses overlay, not collapse
      var collapsed = sidebarEl.classList.toggle('collapsed');
      setCollapsed(collapsed);
      adjustMainContent(collapsed);
    });
  }

  // Update collapse btn icon based on state
  updateCollapseBtnIcon(sidebarEl);

  // Wire up mobile hamburger
  initMobileToggle(sidebarEl);

  // Update menuBtn if it exists (show hamburger on mobile)
  updateMenuBtn();

  // Update topbar avatar
  updateTopbarAvatar(initials, roleColor);
};

function adjustMainContent(collapsed) {
  var main = document.getElementById('mainContent');
  if (!main) return;
  var w = collapsed ? '64px' : '260px';
  // Drive ALL layout via the CSS variable — dashboard.css already uses var(--sidebar-w)
  document.documentElement.style.setProperty('--sidebar-w', w);
  if (collapsed) {
    main.classList.add('sidebar-collapsed');
    main.style.marginLeft = '';
    main.style.width = '';
  } else {
    main.classList.remove('sidebar-collapsed');
    main.style.marginLeft = '';
    main.style.width = '';
  }
}

function updateCollapseBtnIcon(sidebarEl) {
  var btn = document.getElementById('sidebarCollapseBtn');
  if (!btn) return;
  var isCol = sidebarEl.classList.contains('collapsed');
  btn.innerHTML = isCol ? getIcon('arrowRight') : getIcon('arrowLeft');
  btn.title = isCol ? 'Expandir sidebar' : 'Colapsar sidebar';
}

function initMobileToggle(sidebarEl) {
  function getOrCreateOverlay() {
    var ov = document.getElementById('sidebarOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'sidebarOverlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:997;display:none;opacity:0;transition:opacity 0.25s ease;';
      document.body.appendChild(ov);
    }
    return ov;
  }

  function openMobile() {
    var ov = getOrCreateOverlay();
    sidebarEl.classList.add('mobile-open');
    ov.style.display = 'block';
    requestAnimationFrame(function() { ov.style.opacity = '1'; });
    document.body.style.overflow = 'hidden';
    // Switch hamburger to X
    var btn = document.getElementById('menuBtn');
    if (btn) btn.innerHTML = getIcon('close');
  }

  function closeMobile() {
    var ov = getOrCreateOverlay();
    sidebarEl.classList.remove('mobile-open');
    ov.style.opacity = '0';
    document.body.style.overflow = '';
    setTimeout(function() { ov.style.display = 'none'; }, 260);
    // Switch X back to hamburger
    var btn = document.getElementById('menuBtn');
    if (btn) btn.innerHTML = getIcon('hamburger');
  }

  // Overlay click = close
  var ov = getOrCreateOverlay();
  var freshOv = ov.cloneNode(false);
  ov.parentNode.replaceChild(freshOv, ov);
  freshOv.addEventListener('click', closeMobile);

  // menuBtn wiring
  function wireMenuBtn() {
    var btn = document.getElementById('menuBtn');
    if (!btn) return;
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', function(e) {
      e.stopPropagation();
      if (sidebarEl.classList.contains('mobile-open')) { closeMobile(); } else { openMobile(); }
    });
    fresh.innerHTML = getIcon('hamburger');
  }

  wireMenuBtn();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireMenuBtn);
  }

  // Close sidebar on nav link click (mobile)
  sidebarEl.querySelectorAll('a.sb-item').forEach(function(a) {
    a.addEventListener('click', function() {
      if (window.innerWidth <= 900) closeMobile();
    });
  });

  // Close on resize to desktop
  window.addEventListener('resize', function() {
    if (window.innerWidth > 900) {
      closeMobile();
      // Restore collapse state
      if (isCollapsed()) {
        sidebarEl.classList.add('collapsed');
        adjustMainContent(true);
      } else {
        sidebarEl.classList.remove('collapsed');
        adjustMainContent(false);
      }
    }
  });
}

function updateMenuBtn() {
  var btn = document.getElementById('menuBtn');
  if (btn) btn.innerHTML = getIcon('hamburger');
}

function updateTopbarAvatar(initials, roleColor) {
  var av = document.getElementById('topbarAvatar');
  if (av && initials) {
    av.textContent = initials;
    av.style.background = 'linear-gradient(135deg,' + roleColor + ',' + roleColor + 'aa)';
  }
}

window.doLogout = function() {
  sessionStorage.removeItem('mjunin_user');
  window.location.href = 'login.html';
};

function injectSidebarCSS() {
  if (document.getElementById('sidebarNavCSS')) return;
  var style = document.createElement('style');
  style.id = 'sidebarNavCSS';
  style.textContent = [
    // Base
    'body{margin:0;font-family:Inter,system-ui,sans-serif;background:#060b18;color:#f0f4ff;}',

    // ── SIDEBAR ──────────────────────────────────────────────
    '.sidebar{',
    '  position:fixed;left:0;top:0;height:100vh;width:260px;',
    '  background:#0a1628;',
    '  border-right:1px solid rgba(255,255,255,0.07);',
    '  display:flex;flex-direction:column;z-index:200;overflow:hidden;',
    '  transition:width 0.28s cubic-bezier(0.4,0,0.2,1),left 0.3s cubic-bezier(0.4,0,0.2,1),box-shadow 0.28s;',
    '  will-change:width;',
    '}',

    // Collapsed state (desktop only) — full width collapses to 64px icon rail
    '.sidebar.collapsed{width:64px!important;}',
    '.sidebar.collapsed .sb-logo-text{opacity:0;max-width:0;overflow:hidden;pointer-events:none;transition:opacity 0.2s,max-width 0.28s;}',
    '.sidebar.collapsed .sb-section-label{padding:6px 4px;display:flex;justify-content:center;}',
    '.sidebar.collapsed .sb-section-text{opacity:0;max-width:0;overflow:hidden;white-space:nowrap;}',
    '.sidebar.collapsed .sb-item{padding:0;height:40px;width:40px;margin:1px auto;border-radius:10px;justify-content:center;gap:0;overflow:visible;}',
    '.sidebar.collapsed .sb-item-label{opacity:0;max-width:0;overflow:hidden;pointer-events:none;white-space:nowrap;}',
    '.sidebar.collapsed .sb-active-dot{display:none;}',
    '.sidebar.collapsed .sb-user{justify-content:center;padding:12px 0;}',
    '.sidebar.collapsed .sb-user-info{opacity:0;max-width:0;overflow:hidden;pointer-events:none;}',
    '.sidebar.collapsed .sb-logout-btn{display:none;}',
    '.sidebar.collapsed .sb-collapse-btn{margin-left:0;width:28px;height:28px;}',
    '.sidebar.collapsed .sb-logo{padding:14px 0;justify-content:center;}',
    '.sidebar.collapsed .sb-logo-icon{margin:0;}',
    '.sidebar.collapsed .sb-nav{padding:6px 0;display:flex;flex-direction:column;align-items:center;}',
    '.sidebar.collapsed .sb-item-icon{width:20px;height:20px;}',

    // Logo area
    '.sb-logo{display:flex;align-items:center;gap:10px;padding:18px 14px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;min-height:64px;}',
    '.sb-logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;}',
    '.sb-logo-text{overflow:hidden;white-space:nowrap;transition:opacity 0.2s,width 0.28s;}',
    '.sb-logo-name{font-family:Outfit,sans-serif;font-size:15px;font-weight:900;color:#f0f4ff;line-height:1.2;}',
    '.sb-logo-sub{font-size:10px;color:rgba(148,163,184,0.45);font-weight:600;}',

    // Collapse button
    '.sb-collapse-btn{',
    '  margin-left:auto;flex-shrink:0;',
    '  background:rgba(255,255,255,0.05);',
    '  border:1px solid rgba(255,255,255,0.09);',
    '  color:rgba(148,163,184,0.55);',
    '  width:28px;height:28px;border-radius:8px;',
    '  cursor:pointer;display:flex;align-items:center;justify-content:center;',
    '  transition:all 0.2s;',
    '}',
    '.sb-collapse-btn:hover{background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.3);color:#60a5fa;}',

    // Nav
    '.sb-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 6px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.07) transparent;}',
    '.sb-nav::-webkit-scrollbar{width:3px;}',
    '.sb-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px;}',

    // Section labels
    '.sb-section-label{padding:12px 8px 4px;overflow:hidden;}',
    '.sb-section-text{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:rgba(148,163,184,0.3);white-space:nowrap;transition:opacity 0.2s,width 0.28s;display:block;}',

    // Nav items
    '.sb-item{',
    '  display:flex;align-items:center;gap:10px;',
    '  padding:9px 10px;border-radius:10px;',
    '  text-decoration:none;',
    '  color:rgba(148,163,184,0.75);',
    '  font-size:13px;font-weight:500;',
    '  transition:background 0.15s,color 0.15s,transform 0.15s;',
    '  position:relative;margin-bottom:1px;',
    '  white-space:nowrap;overflow:hidden;',
    '}',
    '.sb-item:hover{background:rgba(255,255,255,0.06);color:#f0f4ff;transform:translateX(2px);}',
    '.sb-item.active{background:rgba(59,130,246,0.12);color:#60a5fa;font-weight:700;}',
    '.sb-item.active .sb-item-icon svg{stroke:#60a5fa;}',
    '.sb-item.active:hover{transform:none;}',

    // Item icon + label
    '.sb-item-icon{width:20px;height:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '.sb-item-icon svg{stroke:currentColor;transition:stroke 0.15s;}',
    '.sb-item-label{transition:opacity 0.2s,width 0.28s;overflow:hidden;}',
    '.sb-active-dot{width:6px;height:6px;background:#3b82f6;border-radius:50%;margin-left:auto;flex-shrink:0;}',

    // Tooltip for collapsed mode
    '.sidebar.collapsed .sb-item{position:relative;}',
    '.sidebar.collapsed .sb-item:hover::after{',
    '  content:attr(title);',
    '  position:absolute;left:68px;top:50%;transform:translateY(-50%);',
    '  background:#0d1526;border:1px solid rgba(255,255,255,0.1);',
    '  color:#f0f4ff;font-size:12px;font-weight:600;',
    '  padding:6px 12px;border-radius:8px;white-space:nowrap;',
    '  pointer-events:none;z-index:9999;',
    '  box-shadow:0 4px 16px rgba(0,0,0,0.4);',
    '}',

    // User footer
    '.sb-user{display:flex;align-items:center;gap:10px;padding:14px;border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0;overflow:hidden;}',
    '.sb-user-avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;cursor:default;}',
    '.sb-user-info{flex:1;min-width:0;overflow:hidden;transition:opacity 0.2s,width 0.28s;}',
    '.sb-user-name{font-size:12px;font-weight:700;color:#f0f4ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.sb-user-role{font-size:10px;font-weight:700;margin-top:1px;}',
    '.sb-logout-btn{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);color:rgba(148,163,184,0.55);width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;}',
    '.sb-logout-btn:hover{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2);color:#f87171;}',

    // ── MAIN CONTENT ──────────────────────────────────────────
    '.main-content{margin-left:260px;min-height:100vh;transition:margin-left 0.28s cubic-bezier(0.4,0,0.2,1);width:calc(100% - 260px);}',
    '.main-content.sidebar-collapsed{margin-left:64px;width:calc(100% - 64px);}',

    // ── TOPBAR ────────────────────────────────────────────────
    '.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:60px;background:rgba(6,11,24,0.97);border-bottom:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100;}',
    '.topbar-left{display:flex;align-items:center;gap:14px;}',
    '.topbar-right{display:flex;align-items:center;gap:10px;}',
    '.menu-btn{display:none;width:38px;height:38px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#f0f4ff;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.2s;}',
    '.menu-btn:hover{background:rgba(255,255,255,0.1);}',
    '.menu-btn:active{transform:scale(0.9);}',
    '.page-title h1{font-family:Outfit,sans-serif;font-size:20px;font-weight:900;color:#f0f4ff;margin:0;line-height:1.2;}',
    '.breadcrumb{font-size:11px;color:rgba(148,163,184,0.5);font-weight:500;}',
    '.topbar-avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;cursor:pointer;flex-shrink:0;}',

    // ── MISC UTILITIES ────────────────────────────────────────
    '.page-content,.content-wrapper{padding:24px;}',
    '.card{background:rgba(13,21,38,0.9);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;transition:border-color 0.2s;}',
    '.card:hover{border-color:rgba(255,255,255,0.11);}',

    // ── MOBILE (<=900px) ──────────────────────────────────────
    '@media(max-width:900px){',
    '  .menu-btn{display:flex!important;}',
    '  .sidebar{left:-280px;width:260px!important;}',
    '  .sidebar.mobile-open{left:0!important;box-shadow:8px 0 40px rgba(0,0,0,0.6)!important;}',
    '  .main-content{margin-left:0!important;width:100%!important;}',
    '  .page-content,.content-wrapper{padding:14px!important;}',
    '  .sidebar.collapsed{left:-280px;width:260px!important;}',
    '}',

    // ── DESKTOP (>900px) ──────────────────────────────────────
    '@media(min-width:901px){',
    '  .menu-btn{display:none!important;}',
    '  .sidebar{left:0;}',
    '  .sidebar.collapsed .sb-logo{justify-content:center;}',
    '}',

  ].join('');
  document.head.appendChild(style);
}

// Toast fallback
window.showToast = window.showToast || function(msg, type) {
  var colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;right:24px;background:#0d1526;border:1px solid ' + (colors[type]||'#3b82f6') + '55;color:#f0f4ff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:320px;animation:toastSlideIn 0.3s ease both;font-family:Inter,sans-serif;';
  t.textContent = msg;
  if (!document.getElementById('toastKF')) {
    var s = document.createElement('style'); s.id='toastKF';
    s.textContent = '@keyframes toastSlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(function(){t.remove();},300); }, 3000);
};
