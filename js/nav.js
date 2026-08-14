// ============================================================
// NAV.JS v6 - Sidebar collapsible + Mobile hamburger
// Desktop: sidebar toggle 260px <-> 64px (icon-only mode)
// Mobile: slide in/out with overlay
// ============================================================

function ensureInstitutionalShellStylesheet() {
  document.documentElement.classList.add('muni-shell-v1');
  var existing = document.querySelector(
    'link[data-muni-shell-asset="v1"],link[href$="css/institutional-shell.css"],link[href$="css/dashboard.css"]'
  );
  if (existing) return existing;
  document.documentElement.classList.add('muni-shell-asset-missing');
  return null;
}

function ensurePwaShellAssets() {
  var manifest = document.querySelector('link[rel="manifest"]');
  if (!manifest) {
    manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/manifest.json';
    manifest.setAttribute('data-muni-pwa-asset', 'manifest-v1');
    document.head.appendChild(manifest);
  }

  if (document.querySelector('script[data-muni-pwa-asset="register-v1"],script[src$="/js/pwa-register.js"]')) return;
  var registerScript = document.createElement('script');
  registerScript.src = '/js/pwa-register.js';
  registerScript.defer = true;
  registerScript.setAttribute('data-muni-pwa-asset', 'register-v1');
  document.head.appendChild(registerScript);
}

function enableInstitutionalShellInteractivity() {
  var root = document.documentElement;
  if (root.classList.contains('muni-shell-interactive') || root.dataset.muniShellMotionQueued === 'true') return;
  root.dataset.muniShellMotionQueued = 'true';
  var stylesheet = ensureInstitutionalShellStylesheet();
  if (!stylesheet) {
    delete root.dataset.muniShellMotionQueued;
    return;
  }
  var enableAfterInitialLayout = function() {
    window.requestAnimationFrame(function() {
      window.requestAnimationFrame(function() {
        root.classList.add('muni-shell-interactive');
        delete root.dataset.muniShellMotionQueued;
      });
    });
  };
  if (stylesheet.sheet) {
    enableAfterInitialLayout();
    return;
  }
  stylesheet.addEventListener('load', enableAfterInitialLayout, { once: true });
  stylesheet.addEventListener('error', enableAfterInitialLayout, { once: true });
}

ensureInstitutionalShellStylesheet();
ensurePwaShellAssets();

var MUNI_NAV_ASSET_BASE = (function() {
  try {
    var source = document.currentScript && document.currentScript.src;
    return source ? new URL('.', source).href : new URL('/js/', window.location.origin).href;
  } catch (error) {
    return '/js/';
  }
})();

var CLIENT_ACCESS_POLICY_VERSION = '2026-08-13.4';
var ACCESS_NOTICE_KEY = 'mjunin_access_notice';
var KNOWN_ROLES = ['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO'];
var KNOWN_CAPABILITIES = [
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.organization-analytics',
  'navigation.employment-actions',
  'navigation.territory',
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.grh-decisions',
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
var authoritativeAccessProjection = null;

function clearMuniGuiaOnboardingSession() {
  if (window.MuniGuiaOnboarding && typeof window.MuniGuiaOnboarding.clearSession === 'function') {
    window.MuniGuiaOnboarding.clearSession();
  }
  try {
    Object.keys(sessionStorage).forEach(function(key) {
      if (key.indexOf('municontrol:muniguia-onboarding:') === 0) sessionStorage.removeItem(key);
    });
  } catch (error) {}
}

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
    clearMuniGuiaOnboardingSession();
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
    var projection = validatedSessionProjection(result.user);
    if (!projection) throw new Error('invalid-access-projection');
    authoritativeAccessProjection = snapshotAccessProjection(projection);
    sessionStorage.setItem('mjunin_user', JSON.stringify(result.user));
    window.__muniAuthValidated = true;
    document.documentElement.classList.remove('muni-auth-pending');
    authStyle.remove();
    return true;
  }).catch(function() {
    authoritativeAccessProjection = null;
    clearMuniGuiaOnboardingSession();
    sessionStorage.removeItem('mjunin_user');
    sessionStorage.removeItem('mjunin_token');
    document.documentElement.classList.remove('muni-auth-pending');
    if (authStyle && authStyle.isConnected) authStyle.remove();
    window.location.replace('login.html?reason=session_invalid');
    return false;
  });
})();

function currentSessionUser() {
  if (authoritativeAccessProjection) return authoritativeAccessProjection.user;
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

function snapshotAccessProjection(projection) {
  if (!projection || !projection.user || !projection.homeProfile) return null;
  var source = projection.user;
  var tenant = source.tenant && typeof source.tenant === 'object'
    ? {
        name: typeof source.tenant.name === 'string' ? source.tenant.name : '',
        shortName: typeof source.tenant.shortName === 'string' ? source.tenant.shortName : ''
      }
    : null;
  var capabilities = projection.capabilities.slice();
  var homeProfile = {
    variant: projection.homeProfile.variant,
    defaultPath: projection.homeProfile.defaultPath,
    priorityCapabilities: projection.homeProfile.priorityCapabilities.slice()
  };
  return {
    user: {
      id: typeof source.id === 'string' ? source.id : '',
      name: typeof source.name === 'string' ? source.name : '',
      email: typeof source.email === 'string' ? source.email : '',
      role: source.role,
      tenantId: typeof source.tenantId === 'string' ? source.tenantId : null,
      tenant: tenant,
      capabilities: capabilities.slice(),
      accessPolicyVersion: source.accessPolicyVersion,
      homeProfile: {
        variant: homeProfile.variant,
        defaultPath: homeProfile.defaultPath,
        priorityCapabilities: homeProfile.priorityCapabilities.slice()
      }
    },
    capabilities: capabilities,
    homeProfile: homeProfile
  };
}

function currentAccessProjection() {
  return authoritativeAccessProjection
    ? snapshotAccessProjection(authoritativeAccessProjection)
    : null;
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
  var projection = authenticated ? currentAccessProjection() : null;
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
  getValidatedSession: currentAccessProjection,
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

// Shared navigation definition. A missing or malformed catalog deliberately
// renders no private destinations; capability visibility never falls back to a
// second, local menu.
function validatedNavigationDefinition(definition) {
  if (!definition || definition.version !== '2026-08-13.2' ||
      !Array.isArray(definition.groups) || !Array.isArray(definition.items) ||
      !Object.isFrozen(definition) || !Object.isFrozen(definition.groups) ||
      !Object.isFrozen(definition.items) ||
      !exactObjectKeys(definition, ['version', 'groups', 'items'])) return null;

  var expectedGroups = ['executive', 'people', 'territory', 'data'];
  var expectedItems = [
    ['workspace', 'inicio.html', null, 'top', 'navigation.workspace', true],
    ['dashboard', 'dashboard.html', 'executive', 'group', 'navigation.dashboard', true],
    ['grh-ejecutivo', '/ejecutivo', 'executive', 'group', 'navigation.grh-executive', true],
    ['decisiones-grh', 'decisiones-grh.html', 'executive', 'group', 'navigation.grh-decisions', true],
    ['ia', 'ia.html', 'executive', 'group', 'navigation.ai-assistant', true],
    ['reportes', 'reportes.html', 'executive', 'group', 'navigation.reports', true],
    ['hacienda', 'hacienda.html', 'people', 'group', 'navigation.hacienda', true],
    ['estructura', '/estructura', 'people', 'group', 'navigation.organization-analytics', true],
    ['trayectoria', '/trayectoria', 'people', 'group', 'navigation.employment-actions', true],
    ['movimientos-grh', 'movimientos-grh.html', 'people', 'group', 'navigation.organization-analytics', false],
    ['rrhh', 'rrhh.html', 'people', 'group', 'navigation.rrhh', true],
    ['areas-grh', 'areas-grh.html', 'people', 'group', 'navigation.rrhh', false],
    ['territorio', '/territorio', 'territory', 'group', 'navigation.territory', true],
    ['cuentas', 'cuentas-claras.html', 'territory', 'group', 'public', false],
    ['ciudadano', 'ciudadano.html', 'territory', 'group', 'public', false],
    ['importar', 'importar.html', 'data', 'group', 'navigation.import', true],
    ['auditoria', 'auditoria.html', 'data', 'group', 'navigation.audit', true],
    ['control', '/calidad', 'data', 'group', 'navigation.data-quality', true],
    ['exportar', 'exportar.html', 'data', 'group', 'navigation.export', true],
    ['manuales', 'manuales.html', null, 'footer', 'navigation.help', true]
  ];
  if (definition.groups.length !== expectedGroups.length || definition.items.length !== expectedItems.length) return null;
  var groupIds = [];
  var itemIds = [];
  var hrefs = [];
  var primaryCapabilities = [];
  for (var groupIndex = 0; groupIndex < definition.groups.length; groupIndex += 1) {
    var group = definition.groups[groupIndex];
    if (!group || !Object.isFrozen(group) || typeof group.id !== 'string' ||
        typeof group.label !== 'string' || typeof group.shortLabel !== 'string' ||
        typeof group.icon !== 'string' || !group.label || !group.shortLabel || !group.icon ||
        !exactObjectKeys(group, ['id', 'label', 'shortLabel', 'icon']) ||
        group.id !== expectedGroups[groupIndex] || groupIds.indexOf(group.id) !== -1) return null;
    groupIds.push(group.id);
  }
  for (var itemIndex = 0; itemIndex < definition.items.length; itemIndex += 1) {
    var item = definition.items[itemIndex];
    var expected = expectedItems[itemIndex];
    if (!item || !Object.isFrozen(item) || typeof item.id !== 'string' ||
        typeof item.href !== 'string' || typeof item.label !== 'string' ||
        typeof item.shortLabel !== 'string' || typeof item.icon !== 'string' ||
        !item.label || !item.shortLabel || !item.icon || itemIds.indexOf(item.id) !== -1 ||
        hrefs.indexOf(item.href) !== -1 || /^(?:[a-z]+:|\/\/)/i.test(item.href) || /\\/.test(item.href) ||
        ['top', 'group', 'footer'].indexOf(item.placement) === -1) return null;
    if (item.id !== expected[0] || item.href !== expected[1] || item.groupId !== expected[2] ||
        item.placement !== expected[3] || item.primary !== expected[5]) return null;
    if (item.placement === 'group') {
      if (typeof item.groupId !== 'string' || groupIds.indexOf(item.groupId) === -1) return null;
    } else if (item.groupId !== null) return null;
    if (item.public === true) {
      if (expected[4] !== 'public' || item.capability !== undefined || item.primary !== false ||
          !exactObjectKeys(item, ['id', 'href', 'label', 'shortLabel', 'icon', 'groupId', 'placement', 'public', 'primary'])) return null;
    } else if (typeof item.capability !== 'string' ||
        item.capability !== expected[4] || KNOWN_CAPABILITIES.indexOf(item.capability) === -1 ||
        !exactObjectKeys(item, ['id', 'href', 'label', 'shortLabel', 'icon', 'groupId', 'placement', 'capability', 'primary'])) return null;
    if (item.primary === true && item.capability) {
      if (primaryCapabilities.indexOf(item.capability) !== -1) return null;
      primaryCapabilities.push(item.capability);
    }
    itemIds.push(item.id);
    hrefs.push(item.href);
  }
  return definition;
}

var NAV_DEFINITION = validatedNavigationDefinition(window.MuniNavigationDefinition);
var NAV_GROUPS = NAV_DEFINITION ? NAV_DEFINITION.groups : [];
var NAV_ITEMS = NAV_DEFINITION ? NAV_DEFINITION.items : [];
window.MuniNavigationCatalog = Object.freeze(NAV_ITEMS.reduce(function(catalog, item) {
  if (item.capability && item.primary === true && !Object.prototype.hasOwnProperty.call(catalog, item.capability)) {
    catalog[item.capability] = Object.freeze({
      id: item.id,
      href: item.href,
      icon: item.icon,
      label: item.label,
      shortLabel: item.shortLabel,
      groupId: item.groupId
    });
  }
  return catalog;
}, Object.create(null)));

// SVG ICONS
var ICONS = {
  chart:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  check:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
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
  organization:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/></svg>',
  movement: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/></svg>',
  database: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  help:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.8 1.95c-.95.68-1.6 1.18-1.6 2.55"/><path d="M12 17h.01"/></svg>',
  logout:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  logo:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  // Collapse/expand arrows
  arrowLeft:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
  arrowRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
  hamburger:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  close:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronDown:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>',
};

var SIDEBAR_COLLAPSED_KEY = 'muni_sidebar_collapsed';
var SIDEBAR_OPEN_GROUP_KEY = 'muni_nav_open_group_v1';

function getIcon(name) { return ICONS[name] || ICONS.doc; }

window.MuniIcons = Object.freeze({ get: getIcon });

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
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch (error) { return false; }
}

function setCollapsed(val) {
  try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, val ? '1' : '0'); } catch (error) {}
}

function storedOpenGroup() {
  try { return localStorage.getItem(SIDEBAR_OPEN_GROUP_KEY); } catch (error) { return null; }
}

function storeOpenGroup(groupId) {
  try { localStorage.setItem(SIDEBAR_OPEN_GROUP_KEY, groupId); } catch (error) {}
}

function navigationItemMarkup(item, activeId, child) {
  var isActive = item.id === activeId;
  return '<li class="sb-nav-entry' + (child ? ' sb-child-entry' : '') + '">' +
    '<a href="' + escapeHtml(item.href) + '" class="sb-item' + (child ? ' sb-child-item' : '') +
      (isActive ? ' active' : '') + '" data-nav-item="' + escapeHtml(item.id) +
      '" title="' + escapeHtml(item.label) + '" aria-label="' + escapeHtml(item.label) + '"' +
      (isActive ? ' aria-current="page"' : '') + '>' +
      '<span class="sb-item-icon">' + getIcon(item.icon) + '</span>' +
      '<span class="sb-item-label">' + escapeHtml(item.label) + '</span>' +
    '</a></li>';
}

function preferredOpenGroup(activeId, visibleGroups, visibleItems, homeProfile) {
  var visibleIds = visibleGroups.map(function(entry) { return entry.group.id; });
  var activeItem = visibleItems.find(function(item) { return item.id === activeId; });
  if (activeItem && activeItem.groupId && visibleIds.indexOf(activeItem.groupId) !== -1) {
    return activeItem.groupId;
  }

  var persisted = storedOpenGroup();
  if (persisted && visibleIds.indexOf(persisted) !== -1) return persisted;

  var priorities = homeProfile && Array.isArray(homeProfile.priorityCapabilities)
    ? homeProfile.priorityCapabilities
    : [];
  for (var priorityIndex = 0; priorityIndex < priorities.length; priorityIndex += 1) {
    var capability = priorities[priorityIndex];
    if (capability === 'navigation.workspace') continue;
    var priorityItem = visibleItems.find(function(item) {
      return item.primary === true && item.capability === capability && item.groupId;
    });
    if (priorityItem && visibleIds.indexOf(priorityItem.groupId) !== -1) return priorityItem.groupId;
  }
  return visibleIds[0] || null;
}

function syncSidebarGroups(sidebarEl) {
  if (!sidebarEl) return;
  var visibleIds = sidebarEl.__muniVisibleGroupIds || [];
  var openGroupId = sidebarEl.__muniOpenGroupId;
  if (visibleIds.indexOf(openGroupId) === -1) openGroupId = visibleIds[0] || null;
  sidebarEl.__muniOpenGroupId = openGroupId;
  if (openGroupId) sidebarEl.setAttribute('data-open-group', openGroupId);
  else sidebarEl.removeAttribute('data-open-group');

  var compactDesktop = window.innerWidth > 900 && sidebarEl.classList.contains('collapsed');
  sidebarEl.querySelectorAll('[data-nav-group-trigger]').forEach(function(trigger) {
    var groupId = trigger.getAttribute('data-nav-group-trigger');
    var expanded = !compactDesktop && groupId === openGroupId;
    trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    var panel = sidebarEl.querySelector('[data-nav-group-panel="' + groupId + '"]');
    if (panel) panel.hidden = !expanded;
    var groupElement = trigger.closest('[data-nav-group]');
    if (groupElement) groupElement.classList.toggle('is-open', expanded);
  });
}

function openSidebarGroup(sidebarEl, groupId, persist) {
  if (!sidebarEl || (sidebarEl.__muniVisibleGroupIds || []).indexOf(groupId) === -1) return;
  sidebarEl.__muniOpenGroupId = groupId;
  if (persist !== false) storeOpenGroup(groupId);
  syncSidebarGroups(sidebarEl);
}

function wireSidebarGroups(sidebarEl) {
  sidebarEl.querySelectorAll('[data-nav-group-trigger]').forEach(function(trigger) {
    trigger.addEventListener('click', function() {
      var groupId = trigger.getAttribute('data-nav-group-trigger');
      if (window.innerWidth > 900 && sidebarEl.classList.contains('collapsed')) {
        sidebarEl.classList.remove('collapsed');
        setCollapsed(false);
        adjustMainContent(false);
        updateCollapseBtnIcon(sidebarEl);
      }
      openSidebarGroup(sidebarEl, groupId, true);
    });
  });
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
  if (!sidebarEl.id) sidebarEl.id = 'sidebar';
  sidebarEl.classList.add('sidebar');
  sidebarEl.setAttribute('data-muni-shell', 'primary-nav');
  sidebarEl.setAttribute('aria-label', sidebarEl.getAttribute('aria-label') || 'Navegación principal');

  var accessProjection = currentAccessProjection();
  var user = { name: 'Usuario', email: '', role: 'DEMO' };
  user = currentSessionUser() || user;
  var role = user.role || 'DEMO';
  var capabilities = normalizedCapabilities(user);
  var initials = (user.name || 'U').split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
  var roleLabels = { SUPER_ADMIN:'Super Admin', INTENDENTE:'Intendente', CONTADOR:'Contaduría', TENANT_ADMIN:'Administrador', TENANT_USER:'Usuario municipal', INSPECTOR:'Inspección', DEMO:'Vista de demostración' };
  var roleColors = { SUPER_ADMIN:'#f59e0b', INTENDENTE:'#3b82f6', CONTADOR:'#06b6d4', TENANT_ADMIN:'#10b981', TENANT_USER:'#8b5cf6', INSPECTOR:'#f97316', DEMO:'#64748b' };
  var roleColor = roleColors[role] || '#64748b';

  var visibleItems = NAV_ITEMS.filter(function(item) { return canAccess(item, capabilities); });
  var topItems = visibleItems.filter(function(item) { return item.placement === 'top'; });
  var footerItems = visibleItems.filter(function(item) { return item.placement === 'footer'; });
  var visibleGroups = NAV_GROUPS.map(function(group) {
    return {
      group: group,
      items: visibleItems.filter(function(item) {
        return item.placement === 'group' && item.groupId === group.id;
      })
    };
  }).filter(function(entry) { return entry.items.length > 0; });
  var openGroupId = preferredOpenGroup(
    activeId,
    visibleGroups,
    visibleItems,
    accessProjection && accessProjection.homeProfile
  );
  if (openGroupId) storeOpenGroup(openGroupId);
  var compactDesktop = window.innerWidth > 900 && isCollapsed();

  var html = '';

  // Logo + collapse button
  html += '<div class="sb-logo">';
  html += '<span class="sb-brand-mark" aria-hidden="true">MC</span>';
  html += '<div class="sb-logo-text"><div class="sb-logo-name">MuniControl</div><div class="sb-logo-sub">Junín · gestión municipal</div></div>';
  html += '<button class="sb-collapse-btn" id="sidebarCollapseBtn" type="button" title="Contraer navegación" aria-label="Contraer navegación">' + getIcon('arrowLeft') + '</button>';
  html += '</div>';


  // Nav
  html += '<nav class="sb-nav" aria-label="Navegación principal"><ul class="sb-nav-list">';
  topItems.forEach(function(item) {
    html += '<li class="sb-nav-direct" data-nav-placement="top">' + navigationItemMarkup(item, activeId, false).replace(/^<li[^>]*>|<\/li>$/g, '') + '</li>';
  });
  visibleGroups.forEach(function(entry) {
    var group = entry.group;
    var groupHasActive = entry.items.some(function(item) { return item.id === activeId; });
    var expanded = !compactDesktop && group.id === openGroupId;
    var triggerId = 'muni-nav-trigger-' + group.id;
    var panelId = 'muni-nav-panel-' + group.id;
    html += '<li class="sb-nav-group' + (expanded ? ' is-open' : '') + (groupHasActive ? ' has-active' : '') + '" data-nav-group="' + escapeHtml(group.id) + '">';
    html += '<button class="sb-group-trigger" id="' + triggerId + '" type="button" data-nav-group-trigger="' + escapeHtml(group.id) +
      '" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="' + panelId + '" title="' + escapeHtml(group.label) + '" aria-label="' + escapeHtml(group.label) + '">';
    html += '<span class="sb-item-icon">' + getIcon(group.icon) + '</span>';
    html += '<span class="sb-group-label">' + escapeHtml(group.label) + '</span>';
    html += '<span class="sb-group-count" aria-hidden="true">' + entry.items.length + '</span>';
    html += '<span class="sb-group-chevron" aria-hidden="true">' + getIcon('chevronDown') + '</span></button>';
    html += '<ul class="sb-group-panel" id="' + panelId + '" data-nav-group-panel="' + escapeHtml(group.id) + '" aria-labelledby="' + triggerId + '"' + (expanded ? '' : ' hidden') + '>';
    entry.items.forEach(function(item) { html += navigationItemMarkup(item, activeId, true); });
    html += '</ul></li>';
  });
  footerItems.forEach(function(item) {
    html += '<li class="sb-nav-direct sb-nav-footer" data-nav-placement="footer">' + navigationItemMarkup(item, activeId, false).replace(/^<li[^>]*>|<\/li>$/g, '') + '</li>';
  });
  html += '</ul></nav>';

  // User footer
  html += '<div class="sb-user">';
  html += '<div class="sb-user-avatar">' + escapeHtml(initials) + '</div>';
  html += '<div class="sb-user-info"><div class="sb-user-name">' + escapeHtml(user.name || 'Usuario') + '</div><div class="sb-user-role">' + escapeHtml(roleLabels[role] || role) + '</div></div>';
  html += '<button class="sb-logout-btn" type="button" onclick="doLogout()" title="Cerrar sesión" aria-label="Cerrar sesión">' + getIcon('logout') + '</button>';
  html += '</div>';

  sidebarEl.innerHTML = html;
  sidebarEl.__muniVisibleGroupIds = visibleGroups.map(function(entry) { return entry.group.id; });
  sidebarEl.__muniOpenGroupId = openGroupId;
  var sidebarAvatar = sidebarEl.querySelector('.sb-user-avatar');
  if (sidebarAvatar) sidebarAvatar.style.setProperty('--muni-role-color', roleColor);

  ensureInstitutionalShellStylesheet();

  // Apply collapsed state on desktop
  sidebarEl.classList.remove('collapsed');
  if (window.innerWidth > 900 && isCollapsed()) {
    sidebarEl.classList.add('collapsed');
    adjustMainContent(true);
  } else if (window.innerWidth > 900) {
    adjustMainContent(false);
  }
  syncSidebarGroups(sidebarEl);
  wireSidebarGroups(sidebarEl);

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
      updateCollapseBtnIcon(sidebarEl);
      syncSidebarGroups(sidebarEl);
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
  enableInstitutionalShellInteractivity();
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
  btn.title = isCol ? 'Expandir navegación' : 'Contraer navegación';
  btn.setAttribute('aria-label', btn.title);
}

function notifySidebarState(sidebarEl) {
  var open = window.innerWidth <= 900
    ? sidebarEl.classList.contains('mobile-open')
    : !sidebarEl.classList.contains('collapsed');
  window.dispatchEvent(new CustomEvent('muni:sidebar-state', {
    detail: { open: open, sidebarId: sidebarEl.id || 'sidebar' }
  }));
}

function initMobileToggle(sidebarEl) {
  var previouslyFocusedElement = null;
  var isolatedBackgrounds = [];
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
      ov.setAttribute('data-muni-shell', 'drawer-overlay');
      ov.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ov);
    } else {
      ov.setAttribute('data-muni-shell', 'drawer-overlay');
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
    var overlay = document.getElementById('sidebarOverlay');
    var menuButton = document.getElementById('menuBtn');
    var protectedElements = [sidebarEl, overlay, menuButton].filter(Boolean);
    var ignoredTags = ['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT'];
    var candidates = [];

    function containsProtectedElement(element) {
      return protectedElements.some(function(protectedElement) {
        return element === protectedElement || element.contains(protectedElement);
      });
    }

    function collect(element) {
      if (!element || ignoredTags.indexOf(element.tagName) !== -1) return;
      if (protectedElements.indexOf(element) !== -1) return;
      if (containsProtectedElement(element)) {
        Array.prototype.slice.call(element.children).forEach(collect);
        return;
      }
      candidates.push(element);
    }

    Array.prototype.slice.call(document.body.children).forEach(collect);
    return candidates;
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
    if (window.MuniGuia && typeof window.MuniGuia.closeForNavigation === 'function') {
      window.MuniGuia.closeForNavigation();
    }
    var ov = getOrCreateOverlay();
    previouslyFocusedElement = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : null;
    setDrawerAvailability(true);
    sidebarEl.classList.add('mobile-open');
    syncSidebarGroups(sidebarEl);
    ov.classList.add('is-visible');
    document.body.classList.add('muni-drawer-open');
    // Switch hamburger to X
    var btn = document.getElementById('menuBtn');
    if (btn) {
      btn.innerHTML = getIcon('close');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Cerrar navegación principal');
    }
    notifySidebarState(sidebarEl);
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
    syncSidebarGroups(sidebarEl);
    ov.classList.remove('is-visible');
    document.body.classList.remove('muni-drawer-open');
    // Switch X back to hamburger
    var btn = document.getElementById('menuBtn');
    if (btn) {
      btn.innerHTML = getIcon('hamburger');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Abrir navegación principal');
    }
    notifySidebarState(sidebarEl);
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
        syncSidebarGroups(sidebarEl);
        notifySidebarState(sidebarEl);
      }
    });
    fresh.innerHTML = getIcon('hamburger');
    fresh.title = 'Abrir navegación principal';
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
      syncSidebarGroups(sidebarEl);
      notifySidebarState(sidebarEl);
    } else if (!sidebarEl.classList.contains('mobile-open')) {
      setDrawerAvailability(false);
      syncSidebarGroups(sidebarEl);
      notifySidebarState(sidebarEl);
    }
  }
  if (sidebarEl.__muniDrawerResizeHandler) {
    window.removeEventListener('resize', sidebarEl.__muniDrawerResizeHandler);
  }
  sidebarEl.__muniDrawerResizeHandler = handleDrawerResize;
  window.addEventListener('resize', handleDrawerResize);

  setDrawerAvailability(sidebarEl.classList.contains('mobile-open'));
  syncSidebarGroups(sidebarEl);
  notifySidebarState(sidebarEl);

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
    av.setAttribute('data-muni-shell-control', 'avatar');
    av.style.setProperty('--muni-role-color', roleColor);
  }
}

// Inject theme btn into any topbar-right that nav.js didn't build
window.MuniTheme && window.MuniTheme.apply(window.MuniTheme.get());
(function injectThemeBtn() {
  var existingThemeButton = document.getElementById('themeToggleBtn');
  if (existingThemeButton) {
    existingThemeButton.classList.add('theme-toggle-btn');
    existingThemeButton.setAttribute('data-muni-shell-control', 'theme');
    return;
  }
  var topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;
  var btn = document.createElement('button');
  btn.id = 'themeToggleBtn';
  btn.className = 'notif-btn theme-toggle-btn';
  btn.setAttribute('data-muni-shell-control', 'theme');
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

var SAFE_LOGOUT_RETURN_PATHS = ['rrhh.html#peopleDirectory', 'ia.html'];

window.doLogout = function(returnPath, accessMode) {
  clearMuniGuiaOnboardingSession();
  authoritativeAccessProjection = null;
  window.__muniAuthValidated = false;
  sessionStorage.removeItem('mjunin_user');
  sessionStorage.removeItem('mjunin_token');
  if ('caches' in window) {
    try {
      Promise.resolve(caches.keys()).then(function(names) {
        return Promise.all(names.filter(function(name) {
          return name.indexOf('municontrol-') === 0 &&
            name.indexOf('municontrol-shell-') !== 0;
        }).map(function(name) { return caches.delete(name); }));
      }).catch(function() {
        // CacheStorage es best-effort y nunca demora la salida de la sesión.
      });
    } catch (error) {
      // El cierre de sesión no depende de que CacheStorage esté disponible.
    }
  }
  var safeReturn = SAFE_LOGOUT_RETURN_PATHS.indexOf(returnPath) !== -1 ? returnPath : null;
  var privateGrh = accessMode === 'private-grh' && safeReturn === 'rrhh.html#peopleDirectory';
  var loginTarget = safeReturn ? 'login.html?return=' + encodeURIComponent(safeReturn) : 'login.html';
  if (privateGrh) loginTarget = 'login.html?access=private-grh&return=' + encodeURIComponent(safeReturn);
  window.location.replace(loginTarget);
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
  button.classList.add('menu-btn');
  button.type = 'button';
  button.setAttribute('data-muni-shell-control', 'menu');
  button.setAttribute('aria-label', 'Abrir navegación principal');
  button.setAttribute('aria-expanded', 'false');
  if (sidebarEl.id) button.setAttribute('aria-controls', sidebarEl.id);
  button.title = 'Abrir navegación principal';
}

function ensureInstitutionalBottomNavigation() {
  if (window.innerWidth > 900) return;
  if (window.MuniBottomNav && typeof window.MuniBottomNav.init === 'function') {
    window.MuniBottomNav.init();
    return;
  }
  if (document.querySelector('script[data-muni-shell-asset="bottom-nav-v1"],script[src$="js/bottom-nav.js"]')) return;
  var script = document.createElement('script');
  script.src = 'js/bottom-nav.js';
  script.defer = true;
  script.setAttribute('data-muni-shell-asset', 'bottom-nav-v1');
  document.body.appendChild(script);
}

var MUNIGUIA_PRIVATE_PATHS = [
  '/inicio', '/inicio.html',
  '/dashboard', '/dashboard.html',
  '/reportes', '/reportes.html',
  '/hacienda', '/hacienda.html',
  '/ejecutivo', '/ejecutivo.html', '/grh-ejecutivo', '/grh-ejecutivo.html',
  '/estructura', '/estructura.html',
  '/trayectoria', '/trayectoria.html',
  '/movimientos-grh', '/movimientos-grh.html',
  '/territorio', '/territorio.html',
  '/calidad', '/calidad.html', '/control', '/control.html',
  '/areas-grh', '/areas-grh.html',
  '/decisiones-grh', '/decisiones-grh.html',
  '/rrhh', '/rrhh.html',
  '/ia', '/ia.html',
  '/auditoria', '/auditoria.html',
  '/exportar', '/exportar.html',
  '/importar', '/importar.html',
  '/manuales', '/manuales.html'
];
var muniguiaScheduled = false;

function ensureMuniGuia() {
  if (muniguiaScheduled) return;
  muniguiaScheduled = true;
  Promise.resolve(window.MuniAuthReady).then(function(authenticated) {
    if (!authenticated || MUNIGUIA_PRIVATE_PATHS.indexOf(window.location.pathname) === -1) return;
    var projection = window.MuniAccess && typeof window.MuniAccess.getValidatedSession === 'function'
      ? window.MuniAccess.getValidatedSession()
      : null;
    if (!projection || projection.capabilities.indexOf('navigation.help') === -1) return;
    var sidebar = document.getElementById('sidebar') || document.getElementById('sidebar-container');
    if (!sidebar) return;
    var moduleUrl = new URL('contextual-help.js', MUNI_NAV_ASSET_BASE).href;
    return import(moduleUrl).then(function(module) {
      if (!module || typeof module.mountMuniGuia !== 'function') return false;
      return module.mountMuniGuia({
        role: projection.user.role,
        capabilities: projection.capabilities.slice(),
        variant: projection.homeProfile.variant,
        policyVersion: CLIENT_ACCESS_POLICY_VERSION,
        pathname: window.location.pathname
      });
    });
  }).catch(function() {
    // Help is an enhancement. A missing local asset must not weaken auth or
    // replace the direct Manual link already exposed by the shell.
  });
}

function scheduleMuniGuia() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMuniGuia, { once: true });
  } else {
    ensureMuniGuia();
  }
}

function scheduleInstitutionalBottomNavigation() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureInstitutionalBottomNavigation, { once: true });
  } else {
    ensureInstitutionalBottomNavigation();
  }
  window.addEventListener('resize', ensureInstitutionalBottomNavigation, { passive: true });
}

scheduleInstitutionalBottomNavigation();
scheduleMuniGuia();


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
