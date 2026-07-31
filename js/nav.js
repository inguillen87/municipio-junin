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
  { id: 'dashboard',  href: 'index.html',     icon: '📊', label: 'Dashboard',          section: 'PRINCIPAL' },
  { id: 'control',    href: 'control.html',   icon: '🏛️', label: 'Junín Control',      badge: '30d',      section: null },
  { id: 'rrhh',       href: 'rrhh.html',      icon: '👥', label: 'Recursos Humanos',   section: null },
  { id: 'vecinos',    href: 'vecinos.html',   icon: '🏘️', label: 'Atención Vecinal',   section: null },
  { id: 'talleres',   href: 'talleres.html',  icon: '🔧', label: 'Talleres',            section: 'ENTIDADES' },
  { id: 'servicios',  href: 'servicios.html', icon: '⛽', label: 'Est. de Servicios',   section: null },
  { id: 'mapa',       href: 'mapa.html',      icon: '📍', label: 'Mapa Reclamos',       badge: 'NUEVO', badgeClass: 'new', section: null },
  { id: 'licitaciones',href: 'licitaciones.html',icon: '📋',label: 'Licitaciones',      section: null },
  { id: 'proveedores',href: 'proveedores.html',icon: '🏢', label: 'Auditoría Proveedores', section: 'SISTEMA' },
  { id: 'docs',       href: 'manuales.html',  icon: '📋', label: 'Manuales',            section: null },
  { id: 'presentacion',href:'presentacion.html',icon:'🎯', label: 'Presentación Ejecutiva', badge: 'DAY30', section: null },
  { id: 'ia',         href: 'ia.html',        icon: '🤖', label: 'Asistente IA',        badge: 'OCR+VOZ',  section: null },
  { id: 'ia-hf',      href: 'ia-hf.html',    icon: '🤗', label: 'IA HuggingFace',      badge: 'NEW',      section: null },
  { id: 'upload',     href: 'upload.html',    icon: '📂', label: 'Cargar Archivos',     badge: 'BETA',     section: null },
  { id: 'exportar',   href: 'exportar.html',  icon: '📑', label: 'Exportar Reportes',   badge: 'PDF',      section: null },
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

  // Toggle sidebar
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
    document.getElementById('mainContent')?.classList.toggle('expanded');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
  });

  document.getElementById('menuBtn')?.addEventListener('click', () => {
    sidebarEl.classList.toggle('mobile-open');
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) {
      sessionStorage.removeItem('mjunin_user');
      window.location.href = 'login.html';
    }
  });
}
