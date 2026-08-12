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
  var CATALOG = window.MuniNavigationCatalog;
  if (!CATALOG) return;

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
  var sidebar = document.querySelector('#sidebar, #sidebar-container');
  if (sidebar && !sidebar.id) sidebar.id = 'sidebar';
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
      '<span class="bottom-nav-label">' + (item.shortLabel || item.label) + '</span></a>';
  }).join('');
  if (sidebar) {
    nav.insertAdjacentHTML('beforeend',
      '<button class="bottom-nav-item bottom-nav-more" type="button" aria-label="Abrir navegación principal" ' +
        'aria-controls="' + sidebar.id + '" aria-expanded="' +
        (sidebar.classList.contains('mobile-open') ? 'true' : 'false') + '">' +
        '<span class="nav-icon" aria-hidden="true">' + renderIcon('hamburger') + '</span>' +
        '<span class="bottom-nav-label">Más</span></button>'
    );
  }

  var more = nav.querySelector('.bottom-nav-more');
  if (more) {
    more.addEventListener('click', function(event) {
      event.preventDefault();
      var menuButton = document.getElementById('menuBtn');
      if (typeof window.openMobileSidebar === 'function') window.openMobileSidebar();
      else if (menuButton) menuButton.click();
    });
    window.addEventListener('muni:sidebar-state', function(event) {
      if (!event.detail || event.detail.sidebarId !== sidebar.id) return;
      more.setAttribute('aria-expanded', event.detail.open ? 'true' : 'false');
      more.setAttribute('aria-label', event.detail.open ? 'Cerrar navegación principal' : 'Abrir navegación principal');
    });
  }

    document.body.appendChild(nav);
    document.body.classList.add('muni-bottom-nav-ready');
  }

  window.MuniBottomNav = Object.freeze({ init: initBottomNavigation });
  initBottomNavigation();
  window.addEventListener('resize', initBottomNavigation, { passive: true });
}());
