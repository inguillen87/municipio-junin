// ============================================================
// UX-IMPROVEMENTS.JS — Global micro-interactions & polish
// MuniControl v2 — Loaded on all pages
// ============================================================

(function() {
  'use strict';

  // ── 1. SMOOTH PAGE TRANSITIONS ─────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.25s ease';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        document.body.style.opacity = '1';
      });
    });

    // Intercept internal links for smooth transitions
    document.querySelectorAll('a[href]').forEach(function(link) {
      var href = link.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('javascript')) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          document.body.style.opacity = '0';
          setTimeout(function() {
            window.location.href = href;
          }, 220);
        });
      }
    });
  });

  // ── 2. RIPPLE EFFECT ON BUTTONS ─────────────────────────
  document.addEventListener('click', function(e) {
    var target = e.target.closest('button, .btn-primary, .btn-secondary, .kpi-card, .nav-item');
    if (!target || target.dataset.noRipple) return;

    var rect = target.getBoundingClientRect();
    var ripple = document.createElement('span');
    var size = Math.max(rect.width, rect.height) * 1.5;
    var x = e.clientX - rect.left - size / 2;
    var y = e.clientY - rect.top - size / 2;

    ripple.style.cssText = [
      'position:absolute',
      'border-radius:50%',
      'pointer-events:none',
      'width:' + size + 'px',
      'height:' + size + 'px',
      'left:' + x + 'px',
      'top:' + y + 'px',
      'background:rgba(255,255,255,0.12)',
      'transform:scale(0)',
      'animation:rippleEffect 0.5s cubic-bezier(0.4,0,0.2,1) forwards',
      'z-index:999'
    ].join(';');

    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
    target.style.overflow = 'hidden';
    target.appendChild(ripple);
    setTimeout(function() { ripple.remove(); }, 600);
  });

  // Add ripple keyframe
  if (!document.getElementById('rippleStyle')) {
    var s = document.createElement('style');
    s.id = 'rippleStyle';
    s.textContent = '@keyframes rippleEffect { to { transform: scale(1); opacity: 0; } }';
    document.head.appendChild(s);
  }

  // ── 3. SCROLL TO TOP BUTTON ──────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.createElement('button');
    btn.id = 'scrollTopBtn';
    btn.innerHTML = '↑';
    btn.title = 'Volver arriba';
    btn.style.cssText = [
      'position:fixed',
      'bottom:90px',
      'right:20px',
      'width:40px',
      'height:40px',
      'border-radius:50%',
      'background:rgba(59,130,246,0.15)',
      'border:1px solid rgba(59,130,246,0.3)',
      'color:#60a5fa',
      'font-size:18px',
      'cursor:pointer',
      'z-index:800',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'transition:all 0.2s ease',
      'backdrop-filter:blur(8px)'
    ].join(';');

    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    btn.addEventListener('mouseover', function() {
      this.style.background = 'rgba(59,130,246,0.25)';
      this.style.transform = 'translateY(-2px)';
    });
    btn.addEventListener('mouseout', function() {
      this.style.background = 'rgba(59,130,246,0.15)';
      this.style.transform = 'translateY(0)';
    });

    window.addEventListener('scroll', function() {
      btn.style.display = window.pageYOffset > 300 ? 'flex' : 'none';
    }, { passive: true });

    document.body.appendChild(btn);
  });

  // ── 4. KEYBOARD SHORTCUTS ─────────────────────────────────
  document.addEventListener('keydown', function(e) {
    // Alt+H → Home/Dashboard
    if (e.altKey && e.key === 'h') { e.preventDefault(); window.location.href = 'index.html'; }
    // Alt+P → Presupuesto
    if (e.altKey && e.key === 'p') { e.preventDefault(); window.location.href = 'presupuesto.html'; }
    // Alt+R → RRHH
    if (e.altKey && e.key === 'r') { e.preventDefault(); window.location.href = 'rrhh.html'; }
    // Alt+I → IA Chat
    if (e.altKey && e.key === 'i') { e.preventDefault(); window.location.href = 'ia.html'; }
    // Escape → close any open modal
    if (e.key === 'Escape') {
      var modals = document.querySelectorAll('.modal-overlay, [id$="Modal"]');
      modals.forEach(function(m) {
        if (m.style.display !== 'none') {
          m.style.display = 'none';
          document.body.style.overflow = '';
        }
      });
    }
    // / → focus global search
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      var search = document.getElementById('globalSearch');
      if (search) { search.focus(); search.select(); }
    }
  });

  // ── 5. CLICK OUTSIDE TO CLOSE MODALS ─────────────────────
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
      document.body.style.overflow = '';
    }
  });

  // ── 6. AUTO-HIDE SIDEBAR OVERLAY ON MOBILE NAVIGATION ────
  document.addEventListener('click', function(e) {
    if (window.innerWidth <= 900) {
      var sidebar = document.getElementById('sidebar');
      var menuBtn = document.getElementById('menuBtn');
      if (sidebar && sidebar.classList.contains('mobile-open')) {
        if (!sidebar.contains(e.target) && e.target !== menuBtn && !menuBtn?.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
        }
      }
    }
  });

  // ── 7. TOOLTIPS FOR ICON-ONLY BUTTONS ───────────────────
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[data-tooltip]').forEach(function(el) {
      var tooltip = null;
      el.addEventListener('mouseenter', function() {
        tooltip = document.createElement('div');
        tooltip.style.cssText = 'position:fixed;background:rgba(11,17,32,0.95);color:#f0f4ff;padding:6px 12px;border-radius:7px;font-size:11px;font-weight:600;pointer-events:none;z-index:9999;border:1px solid rgba(255,255,255,0.1);white-space:nowrap;backdrop-filter:blur(8px)';
        tooltip.textContent = el.dataset.tooltip;
        document.body.appendChild(tooltip);

        var rect = el.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width/2 - tooltip.offsetWidth/2) + 'px';
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
      });
      el.addEventListener('mouseleave', function() {
        if (tooltip) { tooltip.remove(); tooltip = null; }
      });
    });
  });

  // ── 8. NUMBERS ANIMATE WHEN SCROLLED INTO VIEW ─────────
  var observed = new Set();
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting && !observed.has(entry.target)) {
        observed.add(entry.target);
        var el = entry.target;
        var target = parseInt(el.dataset.target || el.textContent.replace(/[^0-9]/g,''), 10);
        if (!target || isNaN(target)) return;
        var start = 0;
        var duration = 1200;
        var startTime = performance.now();
        var prefix = el.dataset.prefix || '';
        var suffix = el.dataset.suffix || '';
        function step(now) {
          var elapsed = now - startTime;
          var progress = Math.min(elapsed / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 4);
          var current = Math.floor(eased * target);
          el.textContent = prefix + current.toLocaleString('es-AR') + suffix;
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
    });
  }, { threshold: 0.3 });

  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.kpi-value[data-target], .stat-value[data-target]').forEach(function(el) {
      observer.observe(el);
    });
  });

  // ── 9. COPY TO CLIPBOARD UTILITY ───────────────────────
  window.copyToClipboard = function(text, successMsg) {
    navigator.clipboard.writeText(text).then(function() {
      if (typeof showToast !== 'undefined') {
        showToast(successMsg || '✅ Copiado al portapapeles', 'success');
      }
    }).catch(function() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      if (typeof showToast !== 'undefined') showToast('✅ Copiado', 'success');
    });
  };

  // ── 10. CONNECTION STATUS INDICATOR ────────────────────
  window.addEventListener('online', function() {
    if (typeof showToast !== 'undefined') showToast('🌐 Conexión restaurada', 'success');
  });
  window.addEventListener('offline', function() {
    if (typeof showToast !== 'undefined') showToast('⚠️ Sin conexión a internet', 'warning');
  });

})();

// ============================================================
// KEYBOARD SHORTCUTS HELP MODAL
// ============================================================
function initKeyboardHelp() {
  const shortcuts = [
    { key: 'G + D', action: 'Ir al Dashboard' },
    { key: 'G + H', action: 'Ir a Hacienda' },
    { key: 'G + R', action: 'Ir a RRHH' },
    { key: 'G + I', action: 'Ir a IA Municipal' },
    { key: 'G + M', action: 'Ir al Mapa' },
    { key: 'G + V', action: 'Ir a Vecinos 311' },
    { key: 'Ctrl + K', action: 'Busqueda global' },
    { key: '?', action: 'Mostrar atajos' },
    { key: 'Esc', action: 'Cerrar modal' },
  ];
  let gPressed = false;
  let gTimer;
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '?') { showShortcutsModal(); return; }
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      const s = document.getElementById('globalSearch');
      if (s) { s.focus(); s.select(); }
      return;
    }
    if (e.key === 'g' || e.key === 'G') {
      gPressed = true;
      clearTimeout(gTimer);
      gTimer = setTimeout(function() { gPressed = false; }, 1500);
      return;
    }
    if (gPressed) {
      const navMap = { d:'index.html',h:'hacienda.html',r:'rrhh.html',i:'ia.html',m:'mapa.html',v:'vecinos.html',o:'obras.html',c:'control.html',l:'licitaciones.html',a:'analytics.html' };
      const dest = navMap[e.key.toLowerCase()];
      if (dest) { gPressed = false; window.location.href = dest; }
    }
  });
  function showShortcutsModal() {
    const existing = document.getElementById('shortcutsModal');
    if (existing) { existing.remove(); return; }
    const modal = document.createElement('div');
    modal.id = 'shortcutsModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
    modal.innerHTML = `<div style="background:#0d1526;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:420px;width:90%"><h3 style="font-family:Outfit,sans-serif;font-size:18px;font-weight:900;margin-bottom:16px">Atajos de teclado</h3><div style="display:flex;flex-direction:column;gap:8px">${shortcuts.map(s => "<div style='display:flex;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:8px'><span style='font-size:13px'>" + s.action + "</span><code style='background:rgba(255,255,255,0.08);border-radius:6px;padding:2px 8px;font-size:11px'>" + s.key + "</code></div>").join('')}</div><p style="margin-top:14px;text-align:center;font-size:11px;color:rgba(100,116,139,0.5)">Esc para cerrar</p></div>`;
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { const m = document.getElementById('shortcutsModal'); if (m) m.remove(); } });
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initKeyboardHelp); } else { setTimeout(initKeyboardHelp, 100); }

