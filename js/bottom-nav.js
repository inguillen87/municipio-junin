// ============================================================
// BOTTOM-NAV.JS - Mobile bottom navigation bar
// MuniControl v2
// ============================================================
(function() {
  if (window.innerWidth > 900) return; // Desktop: skip

  var CURRENT_PAGE = location.pathname.split('/').pop() || 'index.html';

  var NAV_ITEMS = [
    { icon: '🏠', label: 'Inicio',    href: 'index.html' },
    { icon: '💰', label: 'Presup.',   href: 'presupuesto.html' },
    { icon: '🤖', label: 'IA',        href: 'ia.html' },
    { icon: '👥', label: 'Vecinos',   href: 'vecinos.html' },
    { icon: '☰',  label: 'Más',       href: '#more' },
  ];

  var nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Navegación principal');

  nav.innerHTML = NAV_ITEMS.map(function(item) {
    var isActive = CURRENT_PAGE === item.href || 
                   (item.href === 'index.html' && CURRENT_PAGE === '');
    return '<a class="bottom-nav-item' + (isActive ? ' active' : '') + '" ' +
           'href="' + item.href + '" aria-label="' + item.label + '">' +
           '<span class="nav-icon">' + item.icon + '</span>' +
           '<span>' + item.label + '</span>' +
           '</a>';
  }).join('');

  // 'Más' button opens sidebar
  nav.querySelector('[href="#more"]')?.addEventListener('click', function(e) {
    e.preventDefault();
    var sidebar = document.getElementById('sidebar');
    var menuBtn = document.getElementById('menuBtn');
    if (sidebar) sidebar.classList.toggle('mobile-open');
    if (menuBtn) menuBtn.click();
  });

  document.body.appendChild(nav);

  // Hide on scroll down, show on scroll up (mobile UX)
  var lastScroll = 0;
  window.addEventListener('scroll', function() {
    var current = window.pageYOffset;
    if (current > lastScroll + 10 && current > 100) {
      nav.style.transform = 'translateY(100%)';
    } else if (current < lastScroll - 5) {
      nav.style.transform = 'translateY(0)';
    }
    lastScroll = current;
  }, { passive: true });
})();
