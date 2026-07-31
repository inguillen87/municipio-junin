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

// ── RBAC PAGE-LEVEL GUARD ─────────────────────────────────────
// Call this at the top of sensitive pages to block direct URL access
window.requireRole = function(allowedRoles) {
  try {
    const raw = sessionStorage.getItem('mjunin_user');
    if (!raw) { window.location.replace('login.html'); return false; }
    const user = JSON.parse(raw);
    if (!allowedRoles.includes(user.role)) {
      // Redirect to dashboard with access denied toast
      sessionStorage.setItem('access_denied', '1');
      window.location.replace('index.html');
      return false;
    }
    return true;
  } catch(e) {
    window.location.replace('login.html');
    return false;
  }
};

// ── JERARQUÍA DE ROLES ───────────────────────────────────────
// SUPER_ADMIN > TENANT_ADMIN > TENANT_USER > DEMO
// access: 'all'    → visible para todos los roles
// access: ['SUPER_ADMIN','TENANT_ADMIN'] → solo esos roles (oculto para el resto)
// locked: ['DEMO'] → visible pero BLOQUEADO (gris + candado) para esos roles
// hidden: ['DEMO'] → directamente NO APARECE para esos roles
const ROLE_LEVEL = { SUPER_ADMIN: 100, TENANT_ADMIN: 60, TENANT_USER: 30, DEMO: 10 };

const NAV_ITEMS = [
  // ── PRINCIPAL ─────────────────────────────────────────────
  {
    id: 'dashboard', href: 'index.html', icon: '📊',
    label: 'Panel Principal', section: 'PRINCIPAL',
    access: 'all'  // Todos pueden ver el dashboard
  },
  {
    id: 'control', href: 'control.html', icon: '🏛️',
    label: 'Control de Gastos', badge: '30d',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    locked: ['DEMO']  // Demo lo ve gris
  },
  {
    id: 'ia', href: 'ia.html', icon: '🤖',
    label: 'Asistente Inteligente', badge: 'IA',
    access: 'all'  // La IA es pública para todos
  },

  // ── CONTROL FINANCIERO ────────────────────────────────────
  {
    id: 'analytics', href: 'analytics.html', icon: '📈',
    label: 'Reportes y Gráficos', section: 'CONTROL FINANCIERO',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    locked: ['DEMO']
  },
  {
    id: 'presupuesto', href: 'presupuesto.html', icon: '💰',
    label: 'Presupuesto Anual',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    hidden: ['DEMO']  // Demo NO ve el presupuesto real
  },
  {
    id: 'mapa', href: 'mapa.html', icon: '🗺️',
    label: 'Mapa Financiero',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    hidden: ['DEMO']
  },

  // ── GESTIÓN ───────────────────────────────────────────────
  {
    id: 'rrhh', href: 'rrhh.html', icon: '👥',
    label: 'Personal Municipal', section: 'GESTIÓN',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    locked: ['DEMO']
  },
  {
    id: 'licitaciones', href: 'licitaciones.html', icon: '📋',
    label: 'Licitaciones y Compras', badge: '8',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    locked: ['DEMO']
  },
  {
    id: 'proveedores', href: 'proveedores.html', icon: '🏢',
    label: 'Proveedores',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    hidden: ['DEMO']  // Datos sensibles de contratos
  },
  {
    id: 'vecinos', href: 'vecinos.html', icon: '🏘️',
    label: 'Reclamos Vecinales',
    access: 'all'
  },

  // ── OPERACIONES ───────────────────────────────────────────
  {
    id: 'talleres', href: 'talleres.html', icon: '🔧',
    label: 'Talleres Municipales', section: 'OPERACIONES',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    locked: ['DEMO']
  },
  {
    id: 'servicios', href: 'servicios.html', icon: '⛽',
    label: 'Est. de Servicios',
    access: 'all'
  },

  // ── COMUNICACIONES ────────────────────────────────────────
  {
    id: 'whatsapp', href: 'whatsapp.html', icon: '📱',
    label: 'Alertas por WhatsApp', section: 'COMUNICACIONES',
    access: ['SUPER_ADMIN','TENANT_ADMIN'],
    hidden: ['TENANT_USER','DEMO']  // Solo admin configura el bot
  },

  // ── SISTEMA ───────────────────────────────────────────────
  {
    id: 'landing', href: 'landing.html', icon: '🌐',
    label: 'Página de Presentación', section: 'SISTEMA',
    access: ['SUPER_ADMIN','TENANT_ADMIN'],
    hidden: ['TENANT_USER','DEMO']
  },
  {
    id: 'importar', href: 'importar.html', icon: '📥',
    label: 'Importar Información',
    access: ['SUPER_ADMIN','TENANT_ADMIN'],
    locked: ['TENANT_USER'],
    hidden: ['DEMO']
  },
  {
    id: 'upload', href: 'upload.html', icon: '📂',
    label: 'Cargar Archivos', badge: 'BETA',
    access: ['SUPER_ADMIN','TENANT_ADMIN','TENANT_USER'],
    locked: ['DEMO']
  },
  {
    id: 'exportar', href: 'exportar.html', icon: '📑',
    label: 'Generar Informes', badge: 'PDF',
    access: 'all'
  },
  {
    id: 'presentacion', href: 'presentacion.html', icon: '🎯',
    label: 'Presentación Ejecutiva', badge: 'DEMO',
    access: ['SUPER_ADMIN','TENANT_ADMIN'],
    locked: ['TENANT_USER'],
    hidden: ['DEMO']
  },
  {
    id: 'manuales', href: 'manuales.html', icon: '📖',
    label: 'Manual de Uso',
    access: 'all'
  },
  // ── ADMINISTRACIÓN ESPECIAL ───────────────────────────────
  {
    id: 'admin', href: 'admin.html', icon: '⚙️',
    label: 'Panel Super Admin', section: 'ADMINISTRACIÓN',
    access: ['SUPER_ADMIN'],
    hidden: ['TENANT_ADMIN','TENANT_USER','DEMO']
  },
];

// Evalúa si el usuario puede ver/acceder a un ítem
function getItemAccess(item, userRole) {
  const access = item.access;
  const locked = item.locked || [];
  const hidden = item.hidden || [];

  // Super Admin siempre ve todo
  if (userRole === 'SUPER_ADMIN') return 'visible';

  // Si está en la lista de ocultos → no mostrar
  if (hidden.includes(userRole)) return 'hidden';

  // Si el acceso es para todos → visible
  if (access === 'all') {
    return locked.includes(userRole) ? 'locked' : 'visible';
  }

  // Si no está en la lista de acceso permitido
  if (!access.includes(userRole)) return 'hidden';

  // Está en la lista de acceso pero puede estar bloqueado
  return locked.includes(userRole) ? 'locked' : 'visible';
}

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
    const accessLevel = getItemAccess(item, user.role || 'DEMO');

    // Si el ítem está completamente oculto para este rol, saltear
    if (accessLevel === 'hidden') return;

    if (item.section && item.section !== lastSection) {
      navHTML += `<div class="nav-section-label">${item.section}</div>`;
      lastSection = item.section;
    }

    const isActive = item.id === activeId;
    const badge = item.badge
      ? `<span class="nav-badge ${item.badgeClass || (item.badge === 'NEW' ? 'new' : '')}">${item.badge}</span>`
      : '';

    if (accessLevel === 'locked') {
      // Ítem bloqueado: gris, sin enlace, con icono de candado
      navHTML += `
        <div class="nav-item nav-locked" title="Acceso restringido para tu rol">
          <span class="nav-icon" style="opacity:0.4">${item.icon}</span>
          <span class="nav-label" style="opacity:0.4">${item.label}</span>
          <span class="nav-lock-icon">🔒</span>
        </div>`;
    } else {
      // Ítem visible y accesible normalmente
      navHTML += `
        <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}" id="nav-${item.id}">
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
          ${badge}
        </a>`;
    }
  });

  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <div class="logo-wrap">
        <div class="logo-icon">🏛️</div>
        <div class="logo-text">
          <span class="logo-title">MuniControl</span>
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
    </div>
    <div class="theme-toggle-wrap">
  <div>
    <div class="theme-toggle-label" id="themeModeLabel">Modo Oscuro</div>
    <div class="theme-icons"><span id="themeIconDark">🌙</span><span style="color:rgba(148,163,184,0.3);margin:0 2px">·</span><span id="themeIconLight" style="opacity:0.3">☀️</span></div>
  </div>
  <label class="theme-toggle-switch" title="Cambiar tema">
    <input type="checkbox" id="themeToggleCheckbox" onchange="toggleTheme(this.checked)">
    <span class="theme-slider"></span>
  </label>
</div>
    <div class="sidebar-lang-picker">
      <button class="sidebar-lang-btn" onclick="i18n&&i18n.setLang('es')" title="Español">🇦🇷 ES</button>
      <button class="sidebar-lang-btn" onclick="i18n&&i18n.setLang('en')" title="English">🇺🇸 EN</button>
      <button class="sidebar-lang-btn" onclick="i18n&&i18n.setLang('pt')" title="Português">🇧🇷 PT</button>
    </div>
  `;

  // Cargar i18n.js dinámicamente (innerHTML no ejecuta scripts)
  if (!document.getElementById('i18nScript')) {
    const s = document.createElement('script');
    s.id = 'i18nScript';
    s.src = 'js/i18n.js';
    document.head.appendChild(s);
  }

// Theme toggle init
function toggleTheme(isLight) {
  const root = document.documentElement;
  if (isLight) {
    root.setAttribute('data-theme', 'light');
    localStorage.setItem('govtech_theme', 'light');
    const label = document.getElementById('themeModeLabel');
    const iconDark = document.getElementById('themeIconDark');
    const iconLight = document.getElementById('themeIconLight');
    if (label) label.textContent = 'Modo Claro';
    if (iconDark) iconDark.style.opacity = '0.3';
    if (iconLight) iconLight.style.opacity = '1';
  } else {
    root.removeAttribute('data-theme');
    localStorage.setItem('govtech_theme', 'dark');
    const label = document.getElementById('themeModeLabel');
    const iconDark = document.getElementById('themeIconDark');
    const iconLight = document.getElementById('themeIconLight');
    if (label) label.textContent = 'Modo Oscuro';
    if (iconDark) iconDark.style.opacity = '1';
    if (iconLight) iconLight.style.opacity = '0.3';
  }
}

// Apply saved theme immediately
(function applyThemeFromStorage() {
  const saved = localStorage.getItem('govtech_theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const cb = document.getElementById('themeToggleCheckbox');
    if (cb) {
      cb.checked = true;
      toggleTheme(true);
    }
  }
})();

// Make toggleTheme global
window.toggleTheme = toggleTheme;

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
            /* Theme Toggle */
      .theme-toggle-wrap {
        padding: 10px 16px 6px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid rgba(255,255,255,0.04);
      }
      .theme-toggle-label {
        font-size: 11px;
        color: rgba(100,116,139,0.6);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .theme-toggle-switch {
        position: relative;
        width: 44px;
        height: 24px;
      }
      .theme-toggle-switch input { opacity: 0; width: 0; height: 0; }
      .theme-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(255,255,255,0.1);
        border-radius: 99px;
        border: 1px solid rgba(255,255,255,0.12);
        transition: 0.3s;
      }
      .theme-slider::before {
        content: '';
        position: absolute;
        left: 3px; top: 3px;
        width: 16px; height: 16px;
        border-radius: 50%;
        background: rgba(148,163,184,0.7);
        transition: 0.3s;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      input:checked + .theme-slider {
        background: rgba(251,191,36,0.2);
        border-color: rgba(251,191,36,0.3);
      }
      input:checked + .theme-slider::before {
        transform: translateX(20px);
        background: #fbbf24;
      }
      .theme-icons {
        display: flex;
        gap: 3px;
        font-size: 13px;
      }
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
      .sidebar-lang-picker { padding: 8px 16px; border-top: 1px solid rgba(255,255,255,0.04); display: flex; gap: 4px; justify-content: center; }
      .sidebar-lang-btn { background: none; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: rgba(100,116,139,0.7); font-size: 11px; padding: 3px 7px; cursor: pointer; transition: all 0.15s; }
      .sidebar-lang-btn:hover { background: rgba(255,255,255,0.06); color: rgba(240,244,255,0.8); }
      .sidebar-lang-btn.active { background: rgba(59,130,246,0.12); border-color: rgba(59,130,246,0.25); color: #60a5fa; }
      /* ── NAV ITEMS BLOQUEADOS (rol sin permiso) ────────── */
      .nav-locked {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 14px;
        border-radius: 8px;
        cursor: not-allowed;
        opacity: 0.45;
        margin-bottom: 1px;
        position: relative;
        transition: opacity 0.15s;
      }
      .nav-locked:hover { opacity: 0.6; }
      .nav-lock-icon {
        margin-left: auto;
        font-size: 11px;
        opacity: 0.5;
      }
      /* ── PADDING BOTTOM for user footer ─────────────── */
      .sidebar-nav { padding-bottom: 80px !important; }

      /* ── SIDEBAR RESPONSIVE ─────────────────────────────── */
      /* DESKTOP (> 900px): siempre visible */
      @media (min-width: 901px) {
        .sidebar {
          transform: translateX(0) !important;
          display: flex !important;
          visibility: visible !important;
        }
        .main-content {
          margin-left: var(--sidebar-w, 240px) !important;
        }
        .main-content.expanded {
          margin-left: 64px !important;
        }
        /* Ocultar botón hamburguesa en desktop — usar sidebarToggle */
        #menuBtn { display: none !important; }
      }
      /* MOBILE (≤ 900px): sidebar oculto, hamburguesa visible */
      @media (max-width: 900px) {
        .sidebar {
          transform: translateX(-100%);
          transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
          position: fixed !important;
          z-index: 999 !important;
          height: 100vh !important;
          top: 0 !important;
          width: 280px !important;
        }
        .sidebar.mobile-open {
          transform: translateX(0) !important;
          box-shadow: 20px 0 60px rgba(0,0,0,0.5) !important;
        }
        .main-content {
          margin-left: 0 !important;
        }
        #menuBtn { display: flex !important; }
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

