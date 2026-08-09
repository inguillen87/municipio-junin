// ============================================================
// NAV.JS v6 - Sidebar collapsible + Mobile hamburger
// Desktop: sidebar toggle 260px <-> 64px (icon-only mode)
// Mobile: slide in/out with overlay
// ============================================================

var CLIENT_ACCESS_POLICY_VERSION = '2026-08-09.1';
var ACCESS_NOTICE_KEY = 'mjunin_access_notice';
var KNOWN_ROLES = ['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO'];
var KNOWN_CAPABILITIES = [
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.ai-assistant',
  'navigation.audit',
  'navigation.export',
  'navigation.import',
  'navigation.help'
];
var ROLE_HOME_VARIANTS = {
  SUPER_ADMIN: 'platform-governance',
  INTENDENTE: 'executive-leadership',
  TENANT_ADMIN: 'municipal-operations',
  TENANT_USER: 'municipal-limited',
  CONTADOR: 'financial-control',
  INSPECTOR: 'territorial-unassigned',
  DEMO: 'controlled-preview'
};

// SESSION GUARD. Query strings never create or elevate a session.
(function checkAuth() {
  var pub = ['login','landing','ciudadano','cuentas-claras','404','offline'];
  var path = window.location.pathname.toLowerCase();
  var page = path.split('/').pop().replace(/\.html$/, '');
  if (pub.indexOf(page) !== -1) {
    window.__muniAuthValidated = true;
    window.MuniAuthReady = Promise.resolve(true);
    return;
  }

  var sess = sessionStorage.getItem('mjunin_user');
  var token = sessionStorage.getItem('mjunin_token');
  var valid = false;
  try {
    var segment = token && token.split('.')[1];
    var normalized = segment && segment.replace(/-/g, '+').replace(/_/g, '/');
    if (normalized) normalized += '='.repeat((4 - normalized.length % 4) % 4);
    var payload = normalized ? JSON.parse(atob(normalized)) : null;
    valid = Boolean(sess && payload && Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000));
  } catch(e) {}
  if (!valid) {
    sessionStorage.removeItem('mjunin_user');
    sessionStorage.removeItem('mjunin_token');
    window.location.replace('login.html');
    window.MuniAuthReady = Promise.resolve(false);
    return;
  }

  document.documentElement.classList.add('muni-auth-pending');
  var authStyle = document.createElement('style');
  authStyle.id = 'muniAuthPendingStyle';
  authStyle.textContent = 'html.muni-auth-pending body>.main-content{visibility:hidden!important}';
  document.head.appendChild(authStyle);
  window.__muniAuthValidated = false;
  window.MuniAuthReady = fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  }).then(function(response) {
    if (!response.ok) throw new Error('invalid-session');
    return response.json();
  }).then(function(result) {
    if (!result || !result.user || !result.user.role) throw new Error('invalid-session');
    if (!validatedSessionProjection(result.user)) throw new Error('invalid-access-projection');
    sessionStorage.setItem('mjunin_user', JSON.stringify(result.user));
    window.__muniAuthValidated = true;
    document.documentElement.classList.remove('muni-auth-pending');
    authStyle.remove();
    return true;
  }).catch(function() {
    sessionStorage.removeItem('mjunin_user');
    sessionStorage.removeItem('mjunin_token');
    document.documentElement.classList.remove('muni-auth-pending');
    if (authStyle && authStyle.isConnected) authStyle.remove();
    window.location.replace('login.html?reason=session_invalid');
    return false;
  });
})();

function currentSessionUser() {
  try { return JSON.parse(sessionStorage.getItem('mjunin_user')); } catch (error) { return null; }
}

function exactObjectKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  var keys = Object.keys(value).sort();
  var wanted = expected.slice().sort();
  return keys.length === wanted.length && keys.every(function(key, index) { return key === wanted[index]; });
}

function validatedHomeProfile(user, capabilities) {
  var profile = user && user.homeProfile;
  if (!exactObjectKeys(profile, ['variant', 'defaultPath', 'priorityCapabilities'])) return null;
  if (profile.variant !== ROLE_HOME_VARIANTS[user.role] || profile.defaultPath !== 'inicio.html') return null;
  if (!Array.isArray(profile.priorityCapabilities) || !profile.priorityCapabilities.length) return null;
  var seen = [];
  for (var index = 0; index < profile.priorityCapabilities.length; index += 1) {
    var capability = profile.priorityCapabilities[index];
    if (typeof capability !== 'string' || KNOWN_CAPABILITIES.indexOf(capability) === -1 ||
        capabilities.indexOf(capability) === -1 || seen.indexOf(capability) !== -1) return null;
    seen.push(capability);
  }
  if (seen.indexOf('navigation.workspace') === -1) return null;
  return {
    variant: profile.variant,
    defaultPath: profile.defaultPath,
    priorityCapabilities: seen
  };
}

function validatedSessionProjection(user) {
  if (!user || KNOWN_ROLES.indexOf(user.role) === -1 ||
      user.accessPolicyVersion !== CLIENT_ACCESS_POLICY_VERSION ||
      !Array.isArray(user.capabilities)) return null;
  var capabilities = [];
  for (var index = 0; index < user.capabilities.length; index += 1) {
    var capability = user.capabilities[index];
    if (typeof capability !== 'string' || KNOWN_CAPABILITIES.indexOf(capability) === -1 ||
        capabilities.indexOf(capability) !== -1) return null;
    capabilities.push(capability);
  }
  if (capabilities.indexOf('session.read') === -1 || capabilities.indexOf('navigation.workspace') === -1) return null;
  var homeProfile = validatedHomeProfile(user, capabilities);
  if (!homeProfile) return null;
  return { user: user, capabilities: capabilities, homeProfile: homeProfile };
}

function storeAccessNotice() {
  try {
    sessionStorage.setItem(ACCESS_NOTICE_KEY, 'El perfil actual no tiene habilitada la superficie solicitada.');
  } catch (error) {}
}

// UX projection only. Awaiting /api/auth/me prevents stale browser state from
// deciding visibility; APIs still perform every authorization server-side.
window.requireCapability = async function(capability) {
  var authenticated = await Promise.resolve(window.MuniAuthReady);
  var projection = authenticated ? validatedSessionProjection(currentSessionUser()) : null;
  var allowed = Boolean(projection && typeof capability === 'string' &&
    KNOWN_CAPABILITIES.indexOf(capability) !== -1 &&
    projection.capabilities.indexOf(capability) !== -1);
  if (allowed) return true;
  storeAccessNotice();
  var currentPage = window.location.pathname.split('/').pop() || '';
  if (currentPage !== 'inicio.html') window.location.replace('inicio.html');
  return false;
};

window.MuniAccess = Object.freeze({
  policyVersion: CLIENT_ACCESS_POLICY_VERSION,
  getValidatedSession: function() { return validatedSessionProjection(currentSessionUser()); },
  requireCapability: window.requireCapability
});

window.requireRole = function(allowedRoles) {
  try {
    var raw = sessionStorage.getItem('mjunin_user');
    if (!raw) { window.location.replace('login.html'); return false; }
    var user = JSON.parse(raw);
    if (!Array.isArray(allowedRoles) || allowedRoles.indexOf(user.role) === -1) {
      storeAccessNotice();
      window.location.replace('inicio.html'); return false;
    }
    return true;
  } catch(e) { window.location.replace('login.html'); return false; }
};

// NAV ITEMS
var NAV_ITEMS = [
  { id:'workspace',     href:'inicio.html',         icon:'home',   label:'Inicio',                section:'PRINCIPAL',     capability:'navigation.workspace' },
  { id:'dashboard',     href:'index.html',          icon:'chart',  label:'Panel ejecutivo',       section:'PRINCIPAL',     capability:'navigation.dashboard' },
  { id:'reportes',      href:'reportes.html',       icon:'doc',    label:'Reportes ejecutivos',   section:'PRINCIPAL',     capability:'navigation.reports' },
  { id:'hacienda',      href:'hacienda.html',       icon:'bank',   label:'Hacienda',              section:'GESTIÓN',       capability:'navigation.hacienda' },
  { id:'grh-ejecutivo', href:'grh-ejecutivo.html', icon:'people', label:'Centro Ejecutivo GRH', section:'GESTIÓN',       capability:'navigation.grh-executive' },
  { id:'control',       href:'control.html',        icon:'gauge',  label:'Calidad y Linaje',      section:'GESTIÓN',       capability:'navigation.data-quality' },
  { id:'rrhh',          href:'rrhh.html',           icon:'people', label:'RRHH',                  section:'GESTIÓN',       capability:'navigation.rrhh' },
  { id:'ia',            href:'ia.html',             icon:'ai',     label:'Asistente IA',          section:'INTELIGENCIA',  capability:'navigation.ai-assistant' },
  { id:'auditoria',     href:'auditoria.html',      icon:'shield', label:'Inventario de cargas', section:'DATOS',         capability:'navigation.audit' },
  { id:'exportar',      href:'exportar.html',       icon:'export', label:'Salidas gobernadas',   section:'DATOS',         capability:'navigation.export' },
  { id:'importar',      href:'importar.html',       icon:'upload', label:'Importar datos',        section:'DATOS',         capability:'navigation.import' },
  { id:'cuentas',       href:'cuentas-claras.html', icon:'eye',    label:'Cuentas Claras',        section:'TRANSPARENCIA', public:true },
  { id:'ciudadano',     href:'ciudadano.html',      icon:'home',   label:'Portal Ciudadano',      section:'TRANSPARENCIA', public:true },
  { id:'manuales',      href:'manuales.html',       icon:'doc',    label:'Manual y ayuda',        section:'AYUDA',         capability:'navigation.help' },
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizedCapabilities(user) {
  var projection = validatedSessionProjection(user);
  return projection ? projection.capabilities.slice() : [];
}

// UX projection only. Every API must enforce its own server-side authorization.
// Missing or malformed private capabilities intentionally hide the item.
function canAccess(item, capabilities) {
  if (item.public === true) return true;
  return typeof item.capability === 'string' &&
    capabilities.indexOf(item.capability) !== -1;
}

function isCollapsed() {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

function setCollapsed(val) {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, val ? '1' : '0');
}

window.buildSidebar = function(activeId) {
  if (!window.__muniAuthValidated && window.MuniAuthReady) {
    window.MuniAuthReady.then(function(valid) {
      if (valid) window.buildSidebar(activeId);
    });
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { window.buildSidebar(activeId); });
    return;
  }

  var sidebarEl = document.getElementById('sidebar') || document.getElementById('sidebar-container');
  if (!sidebarEl) return;
  sidebarEl.classList.add('sidebar');
  sidebarEl.setAttribute('aria-label', sidebarEl.getAttribute('aria-label') || 'Navegación principal');

  var user = { name: 'Usuario', email: '', role: 'DEMO' };
  user = currentSessionUser() || user;
  var role = user.role || 'DEMO';
  var capabilities = normalizedCapabilities(user);
  var initials = (user.name || 'U').split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
  var roleLabels = { SUPER_ADMIN:'Super Admin', INTENDENTE:'Intendente', CONTADOR:'Contaduría', TENANT_ADMIN:'Administrador', TENANT_USER:'Usuario municipal', INSPECTOR:'Inspección', DEMO:'Vista de demostración' };
  var roleColors = { SUPER_ADMIN:'#f59e0b', INTENDENTE:'#3b82f6', CONTADOR:'#06b6d4', TENANT_ADMIN:'#10b981', TENANT_USER:'#8b5cf6', INSPECTOR:'#f97316', DEMO:'#64748b' };
  var roleColor = roleColors[role] || '#64748b';

  // Group items
  var sections = {}, sectionOrder = [];
  NAV_ITEMS.forEach(function(item) {
    if (!canAccess(item, capabilities)) return;
    var sec = item.section || 'GENERAL';
    if (!sections[sec]) { sections[sec] = []; sectionOrder.push(sec); }
    sections[sec].push(item);
  });

  var html = '';

  // Logo + collapse button
  html += '<div class="sb-logo">';
  html += '<div class="sb-logo-icon"><img src="img/municontrol-logo-new.jpg" alt="MuniControl" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="this.style.display=\'none\';this.parentElement.textContent=\'M\';"></div>';
  html += '<div class="sb-logo-text"><div class="sb-logo-name">MuniControl</div><div class="sb-logo-sub">Junín 2026</div></div>';
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
  html += '<div class="sb-user-avatar" style="background:' + roleColor + '22;color:' + roleColor + '">' + escapeHtml(initials) + '</div>';
  html += '<div class="sb-user-info"><div class="sb-user-name">' + escapeHtml(user.name || 'Usuario') + '</div><div class="sb-user-role" style="color:' + roleColor + '">' + escapeHtml(roleLabels[role] || role) + '</div></div>';
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
      if (window.innerWidth <= 900) {
        if (typeof window.closeMobileSidebar === 'function') window.closeMobileSidebar();
        return;
      }
      var collapsed = sidebarEl.classList.toggle('collapsed');
      setCollapsed(collapsed);
      adjustMainContent(collapsed);
    });
  }

  // Update collapse btn icon based on state
  updateCollapseBtnIcon(sidebarEl);

  // Wire up mobile hamburger
  ensureMenuButton(sidebarEl);
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
  btn.setAttribute('aria-label', btn.title);
}

function initMobileToggle(sidebarEl) {
  var previouslyFocusedElement = null;
  var isolatedBackgrounds = [];
  var overlayHideTimer = null;
  var FOCUSABLE_SELECTOR = [
    'a[href]:not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function getOrCreateOverlay() {
    var ov = document.getElementById('sidebarOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'sidebarOverlay';
      ov.setAttribute('aria-hidden', 'true');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1090;display:none;opacity:0;transition:opacity 0.25s ease;';
      document.body.appendChild(ov);
    }
    return ov;
  }

  function isVisibleControl(element) {
    if (!element || element.disabled || element.getAttribute('aria-hidden') === 'true') return false;
    if (element.closest('[inert]')) return false;
    var style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  function getFocusableControls() {
    return Array.prototype.slice.call(sidebarEl.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(isVisibleControl);
  }

  function setDrawerAvailability(open) {
    if (open || window.innerWidth > 900) {
      sidebarEl.removeAttribute('aria-hidden');
      sidebarEl.removeAttribute('inert');
      if ('inert' in sidebarEl) sidebarEl.inert = false;
      return;
    }
    sidebarEl.setAttribute('aria-hidden', 'true');
    sidebarEl.setAttribute('inert', '');
    if ('inert' in sidebarEl) sidebarEl.inert = true;
  }

  function getBackgroundRegions() {
    var selector = '#mainContent, #retired-module-root, .main-content, main, [role="main"], .bottom-nav';
    var candidates = Array.prototype.slice.call(document.querySelectorAll(selector));
    return candidates.filter(function(candidate) {
      if (candidate === sidebarEl || candidate.contains(sidebarEl) || sidebarEl.contains(candidate)) return false;
      return !candidates.some(function(parent) {
        return parent !== candidate && parent.contains(candidate);
      });
    });
  }

  function isolateBackground() {
    if (isolatedBackgrounds.length) return;
    getBackgroundRegions().forEach(function(element) {
      var usesInert = 'inert' in element;
      isolatedBackgrounds.push({
        element: element,
        usesInert: usesInert,
        hadInert: element.hasAttribute('inert'),
        hadAriaHidden: element.hasAttribute('aria-hidden'),
        ariaHidden: element.getAttribute('aria-hidden'),
      });
      if (usesInert) {
        element.inert = true;
      } else {
        element.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function restoreBackground() {
    isolatedBackgrounds.forEach(function(state) {
      if (!state.element || !state.element.isConnected) return;
      if (state.usesInert) {
        state.element.inert = state.hadInert;
        if (!state.hadInert) state.element.removeAttribute('inert');
      } else if (state.hadAriaHidden) {
        state.element.setAttribute('aria-hidden', state.ariaHidden);
      } else {
        state.element.removeAttribute('aria-hidden');
      }
    });
    isolatedBackgrounds = [];
  }

  function focusFirstDrawerControl() {
    var controls = getFocusableControls();
    var preferred = sidebarEl.querySelector('#sidebarCollapseBtn');
    var target = isVisibleControl(preferred) ? preferred : controls[0];
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
    sidebarEl.setAttribute('tabindex', '-1');
    sidebarEl.focus({ preventScroll: true });
  }

  function openMobile() {
    if (window.innerWidth > 900 || sidebarEl.classList.contains('mobile-open')) return;
    var ov = getOrCreateOverlay();
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    previouslyFocusedElement = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : null;
    setDrawerAvailability(true);
    sidebarEl.classList.add('mobile-open');
    sidebarEl.style.setProperty('left', '0', 'important');
    sidebarEl.style.setProperty('transform', 'translateX(0)', 'important');
    ov.style.display = 'block';
    requestAnimationFrame(function() { ov.style.opacity = '1'; });
    document.body.style.overflow = 'hidden';
    // Switch hamburger to X
    var btn = document.getElementById('menuBtn');
    if (btn) {
      btn.innerHTML = getIcon('close');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Cerrar navegación principal');
    }
    var drawerCloseButton = sidebarEl.querySelector('#sidebarCollapseBtn');
    if (drawerCloseButton) {
      drawerCloseButton.innerHTML = getIcon('close');
      drawerCloseButton.title = 'Cerrar navegación principal';
      drawerCloseButton.setAttribute('aria-label', 'Cerrar navegación principal');
    }
    focusFirstDrawerControl();
    isolateBackground();
  }

  function closeMobile() {
    var ov = getOrCreateOverlay();
    var wasOpen = sidebarEl.classList.contains('mobile-open');
    sidebarEl.classList.remove('mobile-open');
    sidebarEl.style.removeProperty('left');
    sidebarEl.style.removeProperty('transform');
    ov.style.opacity = '0';
    document.body.style.overflow = '';
    if (overlayHideTimer) clearTimeout(overlayHideTimer);
    overlayHideTimer = setTimeout(function() {
      if (!sidebarEl.classList.contains('mobile-open')) ov.style.display = 'none';
      overlayHideTimer = null;
    }, 260);
    // Switch X back to hamburger
    var btn = document.getElementById('menuBtn');
    if (btn) {
      btn.innerHTML = getIcon('hamburger');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Abrir navegación principal');
    }
    updateCollapseBtnIcon(sidebarEl);
    restoreBackground();
    if (wasOpen) {
      var focusTarget = previouslyFocusedElement && previouslyFocusedElement.isConnected &&
        !sidebarEl.contains(previouslyFocusedElement)
        ? previouslyFocusedElement
        : btn;
      previouslyFocusedElement = null;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true });
      }
    }
    setDrawerAvailability(false);
  }

  // Overlay click = close
  var ov = getOrCreateOverlay();
  var freshOv = ov.cloneNode(false);
  ov.parentNode.replaceChild(freshOv, ov);
  freshOv.addEventListener('click', closeMobile);

  function handleDrawerKeydown(event) {
    if (window.innerWidth > 900 || !sidebarEl.classList.contains('mobile-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMobile();
      return;
    }
    if (event.key !== 'Tab') return;

    var controls = getFocusableControls();
    if (!controls.length) {
      event.preventDefault();
      sidebarEl.focus({ preventScroll: true });
      return;
    }
    var first = controls[0];
    var last = controls[controls.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && (active === first || !sidebarEl.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !sidebarEl.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  if (sidebarEl.__muniDrawerKeydownHandler) {
    document.removeEventListener('keydown', sidebarEl.__muniDrawerKeydownHandler);
  }
  sidebarEl.__muniDrawerKeydownHandler = handleDrawerKeydown;
  document.addEventListener('keydown', handleDrawerKeydown);

  // menuBtn wiring (desktop collapse + mobile drawer)
  function wireMenuBtn() {
    var btn = document.getElementById('menuBtn');
    if (!btn) return;
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', function(e) {
      e.stopPropagation();
      if (window.innerWidth <= 900) {
        if (sidebarEl.classList.contains('mobile-open')) { closeMobile(); } else { openMobile(); }
      } else {
        var collapsed = sidebarEl.classList.toggle('collapsed');
        setCollapsed(collapsed);
        adjustMainContent(collapsed);
        updateCollapseBtnIcon(sidebarEl);
      }
    });
    fresh.innerHTML = getIcon('hamburger');
    fresh.style.display = 'inline-flex';
    fresh.title = 'Colapsar / Expandir menú (Agrandar pantalla)';
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
  function handleDrawerResize() {
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
      setDrawerAvailability(true);
    } else if (!sidebarEl.classList.contains('mobile-open')) {
      setDrawerAvailability(false);
    }
  }
  if (sidebarEl.__muniDrawerResizeHandler) {
    window.removeEventListener('resize', sidebarEl.__muniDrawerResizeHandler);
  }
  sidebarEl.__muniDrawerResizeHandler = handleDrawerResize;
  window.addEventListener('resize', handleDrawerResize);

  setDrawerAvailability(sidebarEl.classList.contains('mobile-open'));

  window.openMobileSidebar = openMobile;
  window.closeMobileSidebar = closeMobile;
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

// Inject theme btn into any topbar-right that nav.js didn't build
window.MuniTheme && window.MuniTheme.apply(window.MuniTheme.get());
(function injectThemeBtn() {
  if (document.getElementById('themeToggleBtn')) return; // already exists
  var topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;
  var btn = document.createElement('button');
  btn.id = 'themeToggleBtn';
  btn.className = 'notif-btn theme-toggle-btn';
  btn.style.fontSize = '16px';
  btn.title = 'Cambiar tema';
  btn.textContent = (window.MuniTheme && window.MuniTheme.get() === 'light') ? '☀️' : '🌙';
  btn.onclick = function() { if (window.MuniTheme) window.MuniTheme.cycle(); };
  // Insert before notifications button
  var notifBtn = topbarRight.querySelector('.notif-btn');
  topbarRight.insertBefore(btn, notifBtn || topbarRight.firstChild);
})();

// Global search handler — filters visible rows/cards on keyup
(function initGlobalSearch() {
  var input = document.getElementById('globalSearch');
  if (!input) return;
  var timer;
  input.addEventListener('keyup', function() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      var q = input.value.trim().toLowerCase();
      if (!q) {
        document.querySelectorAll('tr[data-searchable], .card[data-searchable], .kpi-card[data-searchable]').forEach(function(el) {
          el.style.display = '';
        });
        return;
      }
      // Search in table rows
      document.querySelectorAll('tbody tr').forEach(function(row) {
        var text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
      // Search in cards with text
      document.querySelectorAll('.search-target').forEach(function(card) {
        card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }, 280);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('keyup')); }
  });
})();

window.doLogout = async function() {
  sessionStorage.removeItem('mjunin_user');
  sessionStorage.removeItem('mjunin_token');
  if ('caches' in window) {
    try {
      var names = await caches.keys();
      await Promise.all(names.filter(function(name) {
        return name.indexOf('municontrol-') === 0;
      }).map(function(name) { return caches.delete(name); }));
    } catch (error) {
      // El cierre de sesión no depende de que CacheStorage esté disponible.
    }
  }
  window.location.href = 'login.html';
};

function ensureMenuButton(sidebarEl) {
  var button = document.getElementById('menuBtn');
  if (!button) {
    button = document.createElement('button');
    button.id = 'menuBtn';
    button.className = 'menu-btn sb-floating-menu-btn';
    button.type = 'button';
    document.body.appendChild(button);
  }
  button.setAttribute('aria-label', 'Abrir navegación principal');
  button.setAttribute('aria-expanded', 'false');
  if (sidebarEl.id) button.setAttribute('aria-controls', sidebarEl.id);
  button.title = 'Abrir navegación principal';
}


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
    '.sb-section-label{padding:14px 12px 5px;overflow:hidden;}',
    '.sb-section-text{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:1.2px;color:rgba(148,163,184,0.35);white-space:nowrap;transition:opacity 0.2s,width 0.28s;display:block;}',

    // Nav items
    '.sb-item{',
    '  display:flex;align-items:center;gap:12px;',
    '  padding:10px 12px;border-radius:10px;',
    '  text-decoration:none;',
    '  color:rgba(148,163,184,0.8);',
    '  font-size:13px;font-weight:500;',
    '  transition:background 0.18s,color 0.18s,transform 0.15s;',
    '  position:relative;margin-bottom:2px;',
    '  white-space:nowrap;overflow:hidden;min-height:40px;',
    '}',
    '.sb-item:hover{background:rgba(255,255,255,0.06);color:#f0f4ff;transform:translateX(2px);}',
    '.sb-item.active{background:rgba(59,130,246,0.12);color:#60a5fa;font-weight:700;}',
    '.sb-item.active .sb-item-icon svg{stroke:#60a5fa;}',
    '.sb-item.active:hover{transform:none;}',

    // Item icon + label
    '.sb-item-icon{width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0.85;}',
    '.sb-item:hover .sb-item-icon{opacity:1;}',
    '.sb-item.active .sb-item-icon{opacity:1;}',
    '.sb-item-icon svg{stroke:currentColor;transition:stroke 0.15s;width:18px;height:18px;}',
    '.sb-item-label{transition:opacity 0.2s,width 0.28s;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}',
    '.sb-active-dot{width:5px;height:5px;background:#3b82f6;border-radius:50%;margin-left:auto;flex-shrink:0;box-shadow:0 0 6px rgba(59,130,246,0.6);}',

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
    '.sidebar :focus-visible{outline:3px solid #60a5fa;outline-offset:2px;}',

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
    '.sb-floating-menu-btn{position:fixed;top:12px;left:12px;z-index:1102;box-shadow:0 8px 24px rgba(0,0,0,.28);}',
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
    '  .sidebar,.sidebar.collapsed{left:-280px;width:260px!important;}',
    '  .main-content{margin-left:0!important;width:100%!important;}',
    '  .page-content,.content-wrapper{padding:14px!important;}',
    '  .sidebar.mobile-open,.sidebar.collapsed.mobile-open{left:0!important;width:260px!important;z-index:1101!important;box-shadow:8px 0 40px rgba(0,0,0,0.6)!important;}',
    '}',

    // ── DESKTOP (>900px) ──────────────────────────────────────
    '@media(min-width:901px){',
    '  .menu-btn{display:none!important;}',
    '  .sb-floating-menu-btn{display:none!important;}',
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
