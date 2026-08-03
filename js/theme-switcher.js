// theme-switcher.js — Dark / Light / Auto theme for MuniControl
// Default: dark. Persists in localStorage.
(function () {
  var THEMES = ['dark', 'light', 'auto'];
  var ICONS  = { dark: '🌙', light: '☀️', auto: '⚡' };
  var LABELS = { dark: 'Modo oscuro', light: 'Modo claro', auto: 'Modo automático' };

  function getTheme() {
    return localStorage.getItem('govtech_theme') || 'dark';
  }

  function applyTheme(theme) {
    var resolved = theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem('govtech_theme', theme);

    // Update ALL theme toggle buttons across pages
    var btns = document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn');
    btns.forEach(function(btn) {
      btn.textContent = ICONS[theme] || ICONS.dark;
      btn.title = LABELS[theme] || LABELS.dark;
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
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (getTheme() === 'auto') applyTheme('auto');
  });

  // Expose global API
  window.MuniTheme = { cycle: cycle, apply: applyTheme, get: getTheme };
})();
