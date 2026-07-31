// ============================================================
// NAV.JS — Sidebar compartido + Autenticación global
// Municipalidad de Junín — Sistema de Gestión Municipal
// ============================================================

// ── PROTECCIÓN DE SESIÓN ─────────────────────────────────────
// Todas las páginas que llamen a buildSidebar quedan protegidas
(function checkAuth() {
  const sess = sessionStorage.getItem('mjunin_user');
  if (!sess) {
    window.location.href = 'login.html';
  }
})();

const NAV_ITEMS = [
  // PRINCIPAL
  { id: 'dashboard',    href: 'index.html',        icon: '📊', label: 'Dashboard',            section: 'PRINCIPAL' },
  { id: 'control',      href: 'control.html',      icon: '🏛️', label: 'Junín Control',        badge: '30d' },
  { id: 'ia',           href: 'ia.html',           icon: '🤖', label: 'Asistente IA',         badge: 'IA' },
  // GESTION
  { id: 'rrhh',         href: 'rrhh.html',         icon: '👥', label: 'Recursos Humanos',     section: 'GESTIÓN' },
  { id: 'licitaciones', href: 'licitaciones.html', icon: '📋', label: 'Licitaciones',         badge: '8' },
  { id: 'proveedores',  href: 'proveedores.html',  icon: '🏢', label: 'Proveedores',          },
  { id: 'vecinos',      href: 'vecinos.html',      icon: '🏘️', label: 'Atención Vecinal',    },
  { id: 'mapa',         href: 'mapa.html',         icon: '📍', label: 'Mapa de Reclamos',     badge: 'NUEVO', badgeClass: 'new' },
  // OPERACIONES
  { id: 'talleres',     href: 'talleres.html',     icon: '🔧', label: 'Talleres',             section: 'OPERACIONES' },
  { id: 'servicios',    href: 'servicios.html',    icon: '⛽', label: 'Est. de Servicios',    },
  // SISTEMA
  { id: 'upload',       href: 'upload.html',       icon: '📂', label: 'Cargar Archivos',      section: 'SISTEMA', badge: 'BETA' },
  { id: 'exportar',     href: 'exportar.html',     icon: '📑', label: 'Exportar Reportes',    badge: 'PDF' },
  { id: 'presentacion', href: 'presentacion.html', icon: '🎯', label: 'Presentación Ejecutiva', badge: 'DEMO' },
  { id: 'docs',         href: 'manuales.html',     icon: '📖', label: 'Manuales',             },
];

function buildSidebar(activeId) {
  const sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl) return;

  // Obtener datos del usuario en sesión
  let user = { name: 'Usuario', email: '', loginAt: '' };
  try { user = JSON.parse(sessionStorage.getItem('mjunin_user') || '{}'); } catch(e) {}
  const initials = user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : 'JT';
  const loginTime = user.loginAt ? new Date(user.loginAt).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' }) : '';

  let navHTML = '';
  let lastSection = null;

  NAV_ITEMS.forEach(item => {
    if (item.section && item.section !== lastSection) {
      navHTML += `<div class="nav-section-label">${item.section}</div>`;
      lastSection = item.section;
    }
    const isActive = item.id === activeId;
    const badge = item.badge
      ? `<span class="nav-badge ${item.badgeClass || (item.badge === 'NEW' ? 'new' : '')}">${item.badge}</span>`
      : '';
    navHTML += `
      <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}" id="nav-${item.id}">
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
        ${badge}
      </a>`;
  });

  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <div class="logo-wrap">
        <div class="logo-icon">🏛️</div>
        <div class="logo-text">
          <span class="logo-title">Junín</span>
          <span class="logo-sub">Sistema Municipal</span>
        </div>
      </div>
      <button class="sidebar-toggle" id="sidebarToggle">‹</button>
    </div>
    <nav class="sidebar-nav">${navHTML}</nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">${initials}</div>
        <div class="user-details">
          <span class="user-name">${user.name || 'Jefe de Tecnología'}</span>
          <span class="user-role">Sesión: ${loginTime || 'activa'}</span>
        </div>
        <button class="logout-btn" id="logoutBtn" title="Cerrar sesión">⏏</button>
      </div>
    </div>`;

  // Toggle sidebar (desktop)
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
    document.getElementById('mainContent')?.classList.toggle('expanded');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) {
      sessionStorage.removeItem('mjunin_user');
      window.location.href = 'login.html';
    }
  });

  // ── INICIALIZAR MOBILE (llamar siempre al final de buildSidebar) ─────
  // pwa.js expone window.initMobile() para evitar el bug de DOMContentLoaded timing
  if (typeof window.initMobile === 'function') {
    window.initMobile();
  } else {
    // pwa.js todavía no cargó: esperar y reintentar
    document.addEventListener('pwaMobileReady', () => window.initMobile?.());
  }
}

