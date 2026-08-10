// theme-switcher.js — Dark / Light / Auto theme for MuniControl
// Default: dark. Persists in localStorage.
(function () {
  var THEME_STORAGE_KEY = 'municontrol-color-theme:v1';
  var LEGACY_THEME_STORAGE_KEY = 'govtech_theme';
  var THEMES = ['dark', 'light', 'auto'];
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
    var legacyTheme = readStoredTheme(LEGACY_THEME_STORAGE_KEY);
    if (THEMES.indexOf(legacyTheme) !== -1) return legacyTheme;
    var versionedTheme = readStoredTheme(THEME_STORAGE_KEY);
    return THEMES.indexOf(versionedTheme) !== -1 ? versionedTheme : 'dark';
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(LEGACY_THEME_STORAGE_KEY, theme);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (_) {
      // A restricted storage context must not prevent applying the theme.
    }
  }

  function applyTheme(theme) {
    var resolved = theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

    document.documentElement.setAttribute('data-theme', resolved);
    storeTheme(theme);

    // Update ALL theme toggle buttons across pages
    var btns = document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn');
    btns.forEach(function(btn) {
      btn.textContent = ICONS[theme] || ICONS.dark;
      btn.title = LABELS[theme] || LABELS.dark;
      btn.setAttribute('aria-label', (LABELS[theme] || LABELS.dark) + '. Cambiar tema');
      btn.setAttribute('data-theme-preference', theme);
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
    var current = getTheme();
    var idx  = THEMES.indexOf(current);
    var next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
    if (typeof showToast !== 'undefined') {
      showToast(ICONS[next] + ' ' + LABELS[next] + ' activado', 'info');
    }
  }

  // Apply on load immediately (prevents flash)
  applyTheme(getTheme());

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

  // Expose global API
  window.MuniTheme = { cycle: cycle, apply: applyTheme, get: getTheme };
})();
