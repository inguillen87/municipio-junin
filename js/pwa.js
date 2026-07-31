// ============================================================
// pwa.js — Service Worker + PWA Install + Mobile Nav
// Se carga en TODAS las páginas del sistema
// ============================================================

'use strict';

// ── REGISTRO DEL SERVICE WORKER ──────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[PWA] Service Worker registrado:', reg.scope);
        // Notificar actualización disponible
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (window.toast) toast('Actualización disponible', 'Recargá la página para obtener la última versión', 'info');
            }
          });
        });
      })
      .catch(err => console.warn('[PWA] SW no registrado:', err.message));
  });
}

// ── INSTALL PROMPT (banner "Instalar app") ───────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Solo mostrar si no fue descartado antes
  if (!sessionStorage.getItem('pwa_dismissed')) {
    setTimeout(() => showPWABanner(), 3000);
  }
});

function showPWABanner() {
  const existing = document.getElementById('pwa-banner');
  if (existing || !deferredPrompt) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.className = 'pwa-banner';
  banner.innerHTML = `
    <div class="pwa-banner-icon">🏛️</div>
    <div class="pwa-banner-text">
      <div class="pwa-banner-title">Instalar Sistema Municipal</div>
      <div class="pwa-banner-sub">Accedé más rápido desde tu celular o escritorio</div>
    </div>
    <div class="pwa-banner-actions">
      <button class="pwa-install-btn" id="pwaInstall">📲 Instalar</button>
      <button class="pwa-dismiss-btn" id="pwaDismiss">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('show'), 50);

  document.getElementById('pwaInstall').onclick = async () => {
    banner.classList.remove('show');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        if (window.toast) toast('✅ App instalada', 'Sistema Municipal disponible en tu pantalla de inicio', 'success');
      }
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
  if (window.toast) toast('🏛️ App instalada', 'Sistema Municipal disponible offline', 'success');
});

// ── OVERLAY SIDEBAR MOBILE ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Crear overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebarOverlay';
  document.body.appendChild(overlay);

  // Botón menu toggle
  const menuBtn = document.getElementById('menuBtn');
  const sidebar  = document.getElementById('sidebar');

  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
    // Cerrar al navegar
    sidebar.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      });
    });
  }

  // ── BOTTOM NAV MOBILE ─────────────────────────────────────
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  
  const NAV_ITEMS = [
    { icon: '📊', label: 'Dashboard', href: 'index.html' },
    { icon: '🤖', label: 'Asistente', href: 'ia.html' },
    { icon: '💰', label: 'Control',   href: 'control.html' },
    { icon: '👥', label: 'RRHH',      href: 'rrhh.html' },
    { icon: '🏘️', label: 'Vecinos',   href: 'vecinos.html' },
  ];

  const mobileNav = document.createElement('div');
  mobileNav.className = 'mobile-nav';
  mobileNav.id = 'mobileNav';

  const inner = document.createElement('div');
  inner.className = 'mobile-nav-inner';

  NAV_ITEMS.forEach(item => {
    const link = document.createElement('a');
    link.className = 'mobile-nav-item' + (currentPage === item.href ? ' active' : '');
    link.href = item.href;
    link.innerHTML = `<span class="mobile-nav-icon">${item.icon}</span><span class="mobile-nav-label">${item.label}</span>`;
    inner.appendChild(link);
  });

  mobileNav.appendChild(inner);
  document.body.appendChild(mobileNav);

  // ── SWIPE TO OPEN SIDEBAR ─────────────────────────────────
  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return;
    
    if (dx > 60 && touchStartX < 30 && sidebar) {
      // Swipe right desde el borde → abrir sidebar
      sidebar.classList.add('open');
      overlay.classList.add('show');
    } else if (dx < -60 && sidebar?.classList.contains('open')) {
      // Swipe left → cerrar sidebar
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    }
  }, { passive: true });

  // ── PULL TO REFRESH ───────────────────────────────────────
  let pullStart = 0;
  let pulling = false;
  let refreshIndicator = null;

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) pullStart = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pullStart) return;
    const dy = e.touches[0].clientY - pullStart;
    if (dy > 60 && window.scrollY === 0) {
      pulling = true;
      if (!refreshIndicator) {
        refreshIndicator = document.createElement('div');
        refreshIndicator.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:rgba(59,130,246,0.9);color:white;padding:6px 16px;border-radius:99px;font-size:12px;font-weight:700;z-index:9997;transition:opacity 0.2s';
        refreshIndicator.textContent = '↓ Soltá para actualizar';
        document.body.appendChild(refreshIndicator);
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (pulling) {
      if (refreshIndicator) { refreshIndicator.textContent = '⟳ Actualizando...'; }
      setTimeout(() => { location.reload(); }, 300);
    }
    pullStart = 0;
    pulling = false;
  }, { passive: true });
});

// ── ONLINE/OFFLINE STATUS ─────────────────────────────────────
window.addEventListener('offline', () => {
  if (window.toast) toast('📡 Sin conexión', 'Mostrando datos en caché', 'warning');
});
window.addEventListener('online', () => {
  if (window.toast) toast('✅ Conexión restaurada', 'Sincronizando datos...', 'success');
});
