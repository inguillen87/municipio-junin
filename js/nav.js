// ============================================================
// NAV.JS — Sidebar compartido para todas las páginas
// Inyecta el sidebar dinámicamente y marca el item activo
// ============================================================

const NAV_ITEMS = [
  { id: 'dashboard',  href: 'index.html',     icon: '📊', label: 'Dashboard',         section: 'PRINCIPAL' },
  { id: 'rrhh',       href: 'rrhh.html',      icon: '👥', label: 'Recursos Humanos',  section: null },
  { id: 'gastos',     href: 'gastos.html',    icon: '💰', label: 'Gastos y Costos',   badge: '!', section: null },
  { id: 'vecinos',    href: 'vecinos.html',   icon: '🏘️', label: 'Atención Vecinal',  section: null },
  { id: 'jardines',   href: '#',             icon: '🌳', label: 'Jardines',           section: 'ENTIDADES' },
  { id: 'talleres',   href: 'talleres.html', icon: '🔧', label: 'Talleres',           section: null },
  { id: 'servicios',  href: 'servicios.html',icon: '⛽', label: 'Est. de Servicios',  section: null },
  { id: 'reciclaje',  href: '#',             icon: '♻️', label: 'Reciclaje',          section: null },
  { id: 'docs',       href: 'manuales.html', icon: '📋', label: 'Manuales',           section: 'SISTEMA' },
  { id: 'ia',         href: 'ia.html',       icon: '🤖', label: 'Asistente IA',       badge: 'OCR+VOZ', section: null },
  { id: 'ia-hf',      href: 'ia-hf.html',   icon: '🤗', label: 'IA Lab HuggingFace', badge: 'NEW', section: null },
  { id: 'exportar',   href: 'exportar.html', icon: '📑', label: 'Exportar Reportes',  badge: 'PDF',  section: null },
  { id: 'upload',     href: 'upload.html',   icon: '📂', label: 'Cargar Archivos',    badge: 'BETA', section: null },
];


function buildSidebar(activeId) {
  const sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl) return;

  let navHTML = '';
  let lastSection = null;

  NAV_ITEMS.forEach(item => {
    if (item.section && item.section !== lastSection) {
      navHTML += `<div class="nav-section-label">${item.section}</div>`;
      lastSection = item.section;
    }
    const isActive = item.id === activeId;
    const badge = item.badge
      ? `<span class="nav-badge ${item.badge === 'NUEVO' ? 'new' : ''}">${item.badge}</span>`
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
        <div class="user-avatar">JT</div>
        <div class="user-details">
          <span class="user-name">Jefe de Tecnología</span>
          <span class="user-role">Administrador</span>
        </div>
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
}
