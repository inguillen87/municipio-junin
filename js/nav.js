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
  // CONTROL
  { id: 'presupuesto',  href: 'presupuesto.html',  icon: '💰', label: 'Presupuesto',          section: 'CONTROL' },
  { id: 'mapa',         href: 'mapa.html',         icon: '🗺️', label: 'Mapa Financiero',     section: 'CONTROL' },
  // GESTION
  { id: 'rrhh',         href: 'rrhh.html',         icon: '👥', label: 'Recursos Humanos',     section: 'GESTIÓN' },
  { id: 'licitaciones', href: 'licitaciones.html', icon: '📋', label: 'Licitaciones',         badge: '8' },
  { id: 'proveedores',  href: 'proveedores.html',  icon: '🏢', label: 'Proveedores' },
  { id: 'vecinos',      href: 'vecinos.html',      icon: '🏘️', label: 'Atención Vecinal' },
  // OPERACIONES
  { id: 'talleres',     href: 'talleres.html',     icon: '🔧', label: 'Talleres',             section: 'OPERACIONES' },
  { id: 'servicios',    href: 'servicios.html',    icon: '⛽', label: 'Est. de Servicios' },
  // COMUNICACIONES
  { id: 'whatsapp',     href: 'whatsapp.html',     icon: '📱', label: 'WhatsApp Bot',         section: 'COMUNICACIONES' },
  // SISTEMA
  { id: 'landing',      href: 'landing.html',      icon: '🌐', label: 'Landing Page',         section: 'SISTEMA' },
  { id: 'upload',       href: 'upload.html',       icon: '📂', label: 'Cargar Archivos',      badge: 'BETA' },
  { id: 'exportar',     href: 'exportar.html',     icon: '📑', label: 'Exportar Reportes',    badge: 'PDF' },
  { id: 'presentacion', href: 'presentacion.html', icon: '🎯', label: 'Presentación Ejecutiva', badge: 'DEMO' },
  { id: 'manuales',     href: 'manuales.html',     icon: '📖', label: 'Manual' },
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

  // Mobile sidebar toggle
  const menuBtn = document.getElementById('menuBtn');
  const mainContent = document.getElementById('mainContent');

  // Create overlay
  if (!document.getElementById('sidebarOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.style.cssText = `
      display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);
      z-index:998;backdrop-filter:blur(2px);transition:opacity 0.25s
    `;
    overlay.onclick = closeMobileSidebar;
    document.body.appendChild(overlay);
  }

  function openMobileSidebar() {
    sidebarEl.classList.add('mobile-open');
    document.getElementById('sidebarOverlay').style.display = 'block';
    setTimeout(() => document.getElementById('sidebarOverlay').style.opacity = '1', 10);
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    sidebarEl.classList.remove('mobile-open');
    const overlay = document.getElementById('sidebarOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
    document.body.style.overflow = '';
  }

  if (menuBtn) {
    menuBtn.onclick = () => {
      if (sidebarEl.classList.contains('mobile-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    };
  }

  // Mobile sidebar CSS
  if (!document.getElementById('mobileNavCss')) {
    const style = document.createElement('style');
    style.id = 'mobileNavCss';
    style.innerHTML = `
      @media (max-width: 768px) {
        .sidebar {
          transform: translateX(-100%);
          transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
          position: fixed !important;
          z-index: 999 !important;
          height: 100vh !important;
          top: 0 !important;
        }
        .sidebar.mobile-open {
          transform: translateX(0) !important;
          box-shadow: 20px 0 60px rgba(0,0,0,0.5) !important;
        }
        .main-content {
          margin-left: 0 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

