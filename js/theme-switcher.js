// theme-switcher.js — Dark/Light/Auto theme management
(function() {
  const THEMES = ['dark', 'light', 'auto'];
  const ICONS = { dark: '🌙', light: '☀️', auto: '💻' };

  function getTheme() {
    return localStorage.getItem('govtech_theme') || 'dark';
  }

  function applyTheme(theme) {
    const resolved = theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem('govtech_theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = ICONS[theme] || ICONS.dark;
  }

  function cycle() {
    const current = getTheme();
    const idx = THEMES.indexOf(current);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
    if (typeof showToast !== 'undefined') {
      const labels = { dark: 'Modo oscuro', light: 'Modo claro', auto: 'Modo automático' };
      showToast(ICONS[next] + ' ' + labels[next] + ' activado', 'info');
    }
  }

  // Apply on load
  applyTheme(getTheme());

  // System preference listener
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (getTheme() === 'auto') applyTheme('auto');
  });

  window.MuniTheme = { cycle, apply: applyTheme, get: getTheme };
})();

