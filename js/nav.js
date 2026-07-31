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
  { id: 'analytics',    href: 'analytics.html',    icon: '📈', label: 'Analytics',            section: 'CONTROL' },
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
  { id: 'importar',     href: 'importar.html',     icon: '📥', label: 'Importar Datos' },
  { id: 'upload',       href: 'upload.html',       icon: '📂', label: 'Cargar Archivos',      badge: 'BETA' },
  { id: 'exportar',     href: 'exportar.html',     icon: '📑', label: 'Exportar Reportes',    badge: 'PDF' },
  { id: 'presentacion', href: 'presentacion.html', icon: '🎯', label: 'Presentación Ejecutiva', badge: 'DEMO' },
  { id: 'manuales',     href: 'manuales.html',     icon: '📖', label: 'Manual' },
];

function buildSidebar(activeId) {
  const sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl) return;

  // Obtener datos del usuario en sesión
  let user = { name: 'Usuario', email: '', loginAt: '', role: 'DEMO', roleLabel: 'Demo' };
  try { user = JSON.parse(sessionStorage.getItem('mjunin_user') || '{}'); } catch(e) {}
  const initials = user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : 'US';
  
  let roleColor = '#06b6d4';
  if (user.role === 'SUPER_ADMIN') roleColor = '#f59e0b';
  else if (user.role === 'TENANT_ADMIN') roleColor = '#3b82f6';
  else if (user.role === 'TENANT_USER') roleColor = (user.roleLabel && user.roleLabel.toLowerCase().includes('it')) ? '#8b5cf6' : '#10b981';
  else if (user.role === 'DEMO') roleColor = '#06b6d4';

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
    <div class="sidebar-user-footer">
      <div class="sidebar-user-avatar" style="background: ${roleColor}">${initials}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${user.name || 'Usuario'}</div>
        <div class="sidebar-user-role">${user.roleLabel || user.role || 'DEMO'}</div>
      </div>
      <button class="sidebar-logout-btn" onclick="sessionStorage.clear(); window.location.href='login.html'" title="Cerrar sesión">⏏</button>
    </div>`;

  // Toggle sidebar (desktop)
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
    document.getElementById('mainContent')?.classList.toggle('expanded');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
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
      .sidebar-user-footer {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 12px 16px;
        background: rgba(0,0,0,0.3);
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .sidebar-user-avatar {
        width: 36px; height: 36px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 800; color: white; flex-shrink: 0;
      }
      .sidebar-user-info { flex: 1; overflow: hidden; }
      .sidebar-user-name { font-size: 12px; font-weight: 700; color: rgba(240,244,255,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sidebar-user-role { font-size: 10px; color: rgba(100,116,139,0.7); text-transform: uppercase; letter-spacing: 0.5px; }
      .sidebar-logout-btn { background: none; border: none; cursor: pointer; font-size: 18px; color: rgba(100,116,139,0.6); padding: 4px; border-radius: 6px; transition: all 0.15s; }
      .sidebar-logout-btn:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
      /* Add padding to sidebar content so footer doesn't overlap */
      .sidebar-nav { padding-bottom: 80px !important; }

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

  // Show welcome toast only once per session
  if (!sessionStorage.getItem('welcomed')) {
    sessionStorage.setItem('welcomed', '1');
    setTimeout(() => {
      if (typeof showToast !== 'undefined') {
        showToast(`Bienvenido, ${user.name || 'Usuario'} 👋`, 'success');
      }
    }, 800);
  }
}

