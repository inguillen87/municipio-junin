// Mobile quick navigation projected from the authoritative role home profile.
(function installBottomNavigation() {
  'use strict';

  if (window.MuniBottomNav && typeof window.MuniBottomNav.init === 'function') {
    window.MuniBottomNav.init();
    return;
  }
  var authWaitPending = false;

  function initBottomNavigation() {
    if (window.innerWidth > 900) return;
    if (!window.__muniAuthValidated && window.MuniAuthReady) {
      if (!authWaitPending) {
        authWaitPending = true;
        window.MuniAuthReady.then(function(valid) {
          authWaitPending = false;
          if (valid) initBottomNavigation();
        });
      }
      return;
    }
    if (document.querySelector('.bottom-nav')) return;

  function pageKey(value) {
    var parts = String(value || '').split('/');
    var page = parts[parts.length - 1] || 'inicio.html';
    return page.toLowerCase().replace(/\.html$/, '');
  }

  var CURRENT_PAGE = pageKey(location.pathname);
  var CATALOG = Object.freeze({
    'navigation.workspace': { icon: 'home', label: 'Inicio', href: 'inicio.html' },
    'navigation.dashboard': { icon: 'chart', label: 'Panel', href: 'dashboard.html' },
    'navigation.reports': { icon: 'doc', label: 'Reportes', href: 'reportes.html' },
    'navigation.hacienda': { icon: 'bank', label: 'Hacienda', href: 'hacienda.html' },
    'navigation.grh-executive': { icon: 'people', label: 'GRH', href: 'grh-ejecutivo.html' },
    'navigation.data-quality': { icon: 'gauge', label: 'Calidad', href: 'control.html' },
    'navigation.rrhh': { icon: 'people', label: 'RRHH', href: 'rrhh.html' },
    'navigation.ai-assistant': { icon: 'ai', label: 'Asistente', href: 'ia.html' },
    'navigation.audit': { icon: 'shield', label: 'Inventario', href: 'auditoria.html' },
    'navigation.export': { icon: 'export', label: 'Salidas', href: 'exportar.html' },
    'navigation.import': { icon: 'upload', label: 'Importar', href: 'importar.html' },
    'navigation.help': { icon: 'help', label: 'Manual', href: 'manuales.html' }
  });

  function renderIcon(name) {
    if (window.MuniIcons && typeof window.MuniIcons.get === 'function') {
      return window.MuniIcons.get(name);
    }
    return '<span class="bottom-nav-icon-fallback" aria-hidden="true">·</span>';
  }

  var projection = window.MuniAccess && typeof window.MuniAccess.getValidatedSession === 'function'
    ? window.MuniAccess.getValidatedSession()
    : null;
  if (!projection) return;
  var priorities = projection ? projection.homeProfile.priorityCapabilities : [];
  var capabilities = projection ? projection.capabilities : [];
  var items = [];

  priorities.forEach(function(capability) {
    var item = CATALOG[capability];
    if (!item || capabilities.indexOf(capability) === -1 || items.length >= 4) return;
    items.push(item);
  });
  if (document.querySelector('#sidebar, #sidebar-container')) {
    items.push({ icon: 'hamburger', label: 'Más', href: '#more' });
  }
  if (items.length === 0) return;

  var nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('data-muni-shell', 'bottom-nav');
  nav.setAttribute('aria-label', 'Accesos prioritarios del perfil');
  nav.innerHTML = items.map(function(item) {
    var active = CURRENT_PAGE === pageKey(item.href);
    return '<a class="bottom-nav-item' + (active ? ' active' : '') + '" ' +
      'href="' + item.href + '" aria-label="' + item.label + '"' +
      (active ? ' aria-current="page"' : '') + '>' +
      '<span class="nav-icon" aria-hidden="true">' + renderIcon(item.icon) + '</span>' +
      '<span class="bottom-nav-label">' + item.label + '</span></a>';
  }).join('');

  var more = nav.querySelector('[href="#more"]');
  if (more) {
    more.addEventListener('click', function(event) {
      event.preventDefault();
      var menuButton = document.getElementById('menuBtn');
      if (typeof window.openMobileSidebar === 'function') window.openMobileSidebar();
      else if (menuButton) menuButton.click();
    });
  }

    document.body.appendChild(nav);
    document.body.classList.add('muni-bottom-nav-ready');
  }

  window.MuniBottomNav = Object.freeze({ init: initBottomNavigation });
  initBottomNavigation();
  window.addEventListener('resize', initBottomNavigation, { passive: true });
}());
