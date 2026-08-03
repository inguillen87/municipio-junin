// ============================================================
// toast.js — Sistema de notificaciones globales
// Uso: toast('Guardado', 'Operacion exitosa', 'success')
// Tipos: 'success' | 'error' | 'warning' | 'info'
// ============================================================

(function () {
  function ensureContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  window.toast = function (title, msg = '', type = 'info', duration = 4000) {
    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <div class="toast-icon">${ICONS[type] || '🔔'}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>`;
    container.appendChild(el);
    function removeToast(el) {
      el.classList.add('removing');
      setTimeout(function() { el.remove(); }, 300);
    }

    setTimeout(() => {
      removeToast(el);
    }, duration);
    return el;
  };

  window.toastSuccess = (t, m) => window.toast(t, m, 'success');
  window.toastError   = (t, m) => window.toast(t, m, 'error');
  window.toastWarn    = (t, m) => window.toast(t, m, 'warning');
  window.toastInfo    = (t, m) => window.toast(t, m, 'info');
})();
