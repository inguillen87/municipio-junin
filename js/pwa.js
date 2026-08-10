// ============================================================
// pwa.js — Service Worker + PWA Install + Mobile Nav
// VERSIÓN CORREGIDA: timing fix para DOMContentLoaded
// ============================================================

'use strict';

// ── REGISTRO DEL SERVICE WORKER ──────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw?.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Actualización disponible', 'Recargá para ver la última versión', 'info');
            }
          });
        });
      })
      .catch(() => {});
  });
}

// ── INSTALL PROMPT ───────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!sessionStorage.getItem('pwa_dismissed')) {
    setTimeout(showPWABanner, 4000);
  }
});

function showPWABanner() {
  if (document.getElementById('pwa-banner') || !deferredPrompt) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.className = 'pwa-banner';
  banner.innerHTML = `
    <div class="pwa-banner-icon">🏛️</div>
    <div class="pwa-banner-text">
      <div class="pwa-banner-title">Instalar Sistema Municipal</div>
      <div class="pwa-banner-sub">Accedé más rápido desde tu celular</div>
    </div>
    <div class="pwa-banner-actions">
      <button class="pwa-install-btn" id="pwaInstall">📲 Instalar</button>
      <button class="pwa-dismiss-btn" id="pwaDismiss">✕</button>
    </div>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('show'), 50);

  document.getElementById('pwaInstall').onclick = async () => {
    banner.classList.remove('show');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') showToast('✅ App instalada', 'Sistema Municipal en tu pantalla de inicio', 'success');
      deferredPrompt = null;
    }
    setTimeout(() => banner.remove(), 400);
  };
  document.getElementById('pwaDismiss').onclick = () => {
    banner.classList.remove('show');
    sessionStorage.setItem('pwa_dismissed', '1');
    setTimeout(() => banner.remove(), 400);
  };
}

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  showToast('🏛️ App instalada', 'Disponible offline', 'success');
});

// ── HELPER TOAST (local para no depender de toast.js) ────────
function showToast(title, msg, type) {
  if (window.toast) { window.toast(title, msg, type); return; }
  console.log(`[${type}] ${title}: ${msg}`);
}

// ── INICIALIZACIÓN MOBILE — se llama explícitamente ──────────
// Expuesta como window.initMobile() para llamarse después de buildSidebar()
window.initMobile = function () {

  // ── OVERLAY ────────────────────────────────────────────────
  let overlay = document.getElementById('sidebarOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    document.body.appendChild(overlay);
  }

  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menuBtn');

  function openSidebar() {
    sidebar?.classList.add('open');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  // Botón hamburguesa
  if (menuBtn) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      sidebar?.classList.contains('open') ? closeSidebar() : openSidebar();
    };
  }

  // Overlay cierra sidebar
  overlay.onclick = closeSidebar;

  // Links del sidebar cierran en mobile
  sidebar?.querySelectorAll('a.nav-item').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // ── BOTTOM NAV MOBILE ──────────────────────────────────────
  if (!document.getElementById('mobileNav')) {
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const NAV_ITEMS = [
      { icon: '📊', label: 'Dashboard',   href: 'index.html' },
      { icon: '🏛️', label: 'Control',     href: 'control.html' },
      { icon: '💰', label: 'Presupuesto', href: 'presupuesto.html' },
      { icon: '🤖', label: 'Asistente',   href: 'ia.html' },
      { icon: '🏘️', label: 'Vecinos',     href: 'vecinos.html' },
    ];

    const mobileNav = document.createElement('nav');
    mobileNav.id = 'mobileNav';
    mobileNav.className = 'mobile-nav';
    mobileNav.setAttribute('aria-label', 'Navegación móvil');

    const inner = document.createElement('div');
    inner.className = 'mobile-nav-inner';

    NAV_ITEMS.forEach(item => {
      const a = document.createElement('a');
      a.className = 'mobile-nav-item' + (currentPage === item.href ? ' active' : '');
      a.href = item.href;
      a.setAttribute('aria-label', item.label);
      a.innerHTML = `<span class="mobile-nav-icon">${item.icon}</span><span class="mobile-nav-label">${item.label}</span>`;
      inner.appendChild(a);
    });
    mobileNav.appendChild(inner);
    document.body.appendChild(mobileNav);
  }

  // ── SWIPE GESTURES ─────────────────────────────────────────
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll, ignorar

    if (dx > 60 && touchStartX < 40 && !sidebar?.classList.contains('open')) {
      openSidebar();
    } else if (dx < -60 && sidebar?.classList.contains('open')) {
      closeSidebar();
    }
  }, { passive: true });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('open')) closeSidebar();
  });
};

// ── ONLINE/OFFLINE ────────────────────────────────────────────
window.addEventListener('offline', () => showToast('📡 Sin conexión', 'Mostrando datos en caché', 'warning'));
window.addEventListener('online',  () => showToast('✅ Conexión restaurada', 'Sincronizando...', 'success'));

