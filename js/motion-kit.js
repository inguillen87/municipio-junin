// ============================================================
// MOTION-KIT.JS — Motor global de animaciones UX
// MuniControl Junín — Sprint 1 (Design System & Motion)
// Sin dependencias. Auto-inicializa. Cargar en todas las páginas.
// API:
//   window.motionKit.revealAll()          → dispara reveal pendientes
//   window.motionKit.skeleton(el, on)     → pone/quita shimmer
//   window.motionKit.flash(el)            → destello verde de update
//   window.motionKit.shake(el)            → feedback de error
//   window.motionKit.countUp(el, valor)   → anima número (es-AR)
// ============================================================
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 1. REVEAL ON SCROLL ──────────────────────────────────
  var revealObs = null;
  function initReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    if (reduced) {
      document.documentElement.classList.add('no-reveal');
      els.forEach(function (el) { el.classList.add('is-revealed'); });
      return;
    }
    // Stagger automático: delay por índice dentro del padre
    els.forEach(function (el) {
      var parent = el.parentElement;
      if (!parent) return;
      var idx = Array.prototype.indexOf.call(parent.children, el);
      var base = el.dataset.revealDelay || '0';
      el.style.setProperty('--reveal-delay', (parseFloat(base) + idx * 70) + 'ms');
    });
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-revealed'); });
      return;
    }
    revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { revealObs.observe(el); });
  }

  // ── 2. SKELETON LOADER ───────────────────────────────────
  function skeleton(el, on) {
    if (!el) return;
    if (on) {
      el.classList.add('skeleton');
      var w = el.offsetWidth;
      el.style.minHeight = (el.offsetHeight || 24) + 'px';
    } else {
      el.classList.remove('skeleton');
    }
  }

  // ── 3. FLASH UPDATE (destello) ───────────────────────────
  function flash(el) {
    if (!el || reduced) return;
    el.classList.remove('flash-update');
    void el.offsetWidth; // restart animation
    el.classList.add('flash-update');
    setTimeout(function () { el.classList.remove('flash-update'); }, 1200);
  }

  // ── 4. SHAKE (error) ─────────────────────────────────────
  function shake(el) {
    if (!el || reduced) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  // ── 5. COUNT UP (es-AR) ──────────────────────────────────
  function countUp(el, target, opts) {
    if (!el) return;
    var o = opts || {};
    var isCurrency = o.currency === false ? false : (el.dataset.currency !== 'false');
    var prefix = o.prefix !== undefined ? o.prefix : (el.dataset.prefix || '');
    var suffix = o.suffix !== undefined ? o.suffix : (el.dataset.suffix || '');
    var decimals = o.decimals !== undefined ? o.decimals : parseInt(el.dataset.decimals || '0', 10);
    var dur = o.duration || 1100;
    target = typeof target === 'number' ? target : parseFloat(String(target).replace(/[^0-9.\-]/g, '')) || 0;

    if (reduced) {
      el.textContent = prefix + format(target, decimals, isCurrency) + suffix;
      return;
    }
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      var val = target * eased;
      el.textContent = prefix + format(val, decimals, isCurrency) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function format(n, decimals, isCurrency) {
    var fixed = n.toFixed(decimals);
    if (isCurrency) return '$' + Number(fixed).toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return Number(fixed).toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Auto count-up para [data-count] al entrar en viewport
  var countObs = null;
  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { countUp(el, el.dataset.count); });
      return;
    }
    countObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          countUp(entry.target, entry.target.dataset.count);
          countObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { countObs.observe(el); });
  }

  // ── 6. PAGE ENTRANCE (fade global, complementa ux-improvements) ──
  function initPageEntrance() {
    if (reduced || document.body.dataset.noEntrance) return;
    document.body.style.animation = 'bodyFadeIn 0.35s var(--m-ease)';
    var s = document.createElement('style');
    s.textContent = '@keyframes bodyFadeIn { from { opacity: 0; } to { opacity: 1; } }';
    document.head.appendChild(s);
  }

  // ── EXPORT API ───────────────────────────────────────────
  window.motionKit = {
    revealAll: function () {
      document.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach(function (el) {
        if (revealObs) revealObs.unobserve(el);
        el.classList.add('is-revealed');
      });
    },
    skeleton: skeleton,
    flash: flash,
    shake: shake,
    countUp: countUp
  };

  function init() {
    initPageEntrance();
    initReveal();
    initCounters();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
