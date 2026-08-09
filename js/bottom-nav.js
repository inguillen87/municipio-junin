// Mobile quick navigation projected from the authoritative role home profile.
(function initBottomNavigation() {
  'use strict';

  if (window.innerWidth > 900) return;
  if (!window.__muniAuthValidated && window.MuniAuthReady) {
    window.MuniAuthReady.then(function(valid) {
      if (valid) initBottomNavigation();
    });
    return;
  }
  if (document.querySelector('.bottom-nav')) return;

  var CURRENT_PAGE = location.pathname.split('/').pop() || 'inicio.html';
  var CATALOG = Object.freeze({
    'navigation.workspace': { icon: '⌂', label: 'Inicio', href: 'inicio.html' },
    'navigation.dashboard': { icon: '▥', label: 'Panel', href: 'index.html' },
    'navigation.reports': { icon: '▤', label: 'Reportes', href: 'reportes.html' },
    'navigation.hacienda': { icon: 'H', label: 'Hacienda', href: 'hacienda.html' },
    'navigation.grh-executive': { icon: 'GRH', label: 'GRH', href: 'grh-ejecutivo.html' },
    'navigation.data-quality': { icon: 'Q', label: 'Calidad', href: 'control.html' },
    'navigation.rrhh': { icon: 'RH', label: 'RRHH', href: 'rrhh.html' },
    'navigation.ai-assistant': { icon: '✦', label: 'Asistente', href: 'ia.html' },
    'navigation.audit': { icon: 'A', label: 'Inventario', href: 'auditoria.html' },
    'navigation.export': { icon: '⇩', label: 'Salidas', href: 'exportar.html' },
    'navigation.import': { icon: '⇧', label: 'Importar', href: 'importar.html' },
    'navigation.help': { icon: '?', label: 'Manual', href: 'manuales.html' }
  });

  var projection = window.MuniAccess && typeof window.MuniAccess.getValidatedSession === 'function'
    ? window.MuniAccess.getValidatedSession()
    : null;
  var priorities = projection ? projection.homeProfile.priorityCapabilities : [];
  var capabilities = projection ? projection.capabilities : [];
  var items = [];

  priorities.forEach(function(capability) {
    var item = CATALOG[capability];
    if (!item || capabilities.indexOf(capability) === -1 || items.length >= 4) return;
    items.push(item);
  });
  items.push({ icon: '☰', label: 'Más', href: '#more' });

  var nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Accesos prioritarios del perfil');
  nav.innerHTML = items.map(function(item) {
    var active = CURRENT_PAGE === item.href;
    return '<a class="bottom-nav-item' + (active ? ' active' : '') + '" ' +
      'href="' + item.href + '" aria-label="' + item.label + '"' +
      (active ? ' aria-current="page"' : '') + '>' +
      '<span class="nav-icon" aria-hidden="true">' + item.icon + '</span>' +
      '<span>' + item.label + '</span></a>';
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
}());
