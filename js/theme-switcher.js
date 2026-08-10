// theme-switcher.js — Dark / Light / Auto theme for MuniControl
// Default: dark. Persists in localStorage.
(function () {
  var THEME_STORAGE_KEY = 'municontrol-color-theme:v1';
  var LEGACY_THEME_STORAGE_KEY = 'govtech_theme';
  var THEMES = ['dark', 'light', 'auto'];
  var releaseTransitionFrame = null;

  function suspendThemeTransitions() {
    var root = document.documentElement;
    root.classList.add('muni-theme-applying');
    if (releaseTransitionFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(releaseTransitionFrame);
    }
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(function () { root.classList.remove('muni-theme-applying'); }, 0);
      return;
    }
    releaseTransitionFrame = requestAnimationFrame(function () {
      releaseTransitionFrame = requestAnimationFrame(function () {
        root.classList.remove('muni-theme-applying');
        releaseTransitionFrame = null;
      });
    });
  }
  var ICONS  = { dark: '🌙', light: '☀️', auto: '⚡' };
  var LABELS = { dark: 'Modo oscuro', light: 'Modo claro', auto: 'Modo automático' };

  function readStoredTheme(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function getTheme() {
    var versionedTheme = readStoredTheme(THEME_STORAGE_KEY);
    if (THEMES.indexOf(versionedTheme) !== -1) return versionedTheme;
    var legacyTheme = readStoredTheme(LEGACY_THEME_STORAGE_KEY);
    return THEMES.indexOf(legacyTheme) !== -1 ? legacyTheme : 'dark';
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(LEGACY_THEME_STORAGE_KEY, theme);
    } catch (_) {
      // A restricted storage context must not prevent applying the theme.
    }
  }

  function applyTheme(theme, persist) {
    var preference = THEMES.indexOf(theme) !== -1 ? theme : 'dark';
    var resolved = preference === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference;

    suspendThemeTransitions();
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
    if (persist !== false) storeTheme(preference);

    // Update ALL theme toggle buttons across pages
    var btns = document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn, [data-muni-theme-control]');
    btns.forEach(function(btn) {
      btn.textContent = ICONS[resolved];
      btn.title = LABELS[resolved];
      btn.setAttribute('aria-label', LABELS[resolved] + '. Cambiar tema');
      btn.setAttribute('aria-pressed', resolved === 'light' ? 'true' : 'false');
      btn.setAttribute('data-theme-preference', preference);
      btn.setAttribute('data-theme-resolved', resolved);
      if (btn.getAttribute('data-muni-theme-bound') !== 'true' && typeof btn.onclick !== 'function') {
        btn.addEventListener('click', cycle);
        btn.setAttribute('data-muni-theme-bound', 'true');
      }
    });

    // Update meta theme-color for browser chrome
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'light' ? '#f0f4ff' : '#060b18';
  }

  function cycle() {
    var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (typeof showToast !== 'undefined') {
      showToast(ICONS[next] + ' ' + LABELS[next] + ' activado', 'info');
    }
  }

  // Apply on load immediately (prevents flash)
  applyTheme(getTheme());

  // Controls may not exist yet when the script runs in <head>.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyTheme(getTheme());
    }, { once: true });
  }

  // Listen for system preference changes
  var colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  var handleColorSchemeChange = function () {
    if (getTheme() === 'auto') applyTheme('auto');
  };
  if (typeof colorScheme.addEventListener === 'function') {
    colorScheme.addEventListener('change', handleColorSchemeChange);
  } else if (typeof colorScheme.addListener === 'function') {
    colorScheme.addListener(handleColorSchemeChange);
  }

  window.addEventListener('storage', function (event) {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(getTheme(), false);
    }
  });

  // Expose global API
  window.MuniTheme = { cycle: cycle, apply: applyTheme, get: getTheme };
})();
