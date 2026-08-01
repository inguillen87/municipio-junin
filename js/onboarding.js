// ============================================================
// onboarding.js — MuniControl Onboarding Tour
// Step-by-step guide for new users
// ============================================================
(function() {
  const TOUR_KEY = 'muni_tour_done_v2';
  
  const STEPS = [
    {
      title: '🎉 ¡Bienvenido a MuniControl!',
      body: 'El sistema de gestión municipal más completo de Argentina. Te mostramos las funciones principales en 30 segundos.',
      target: null,
      position: 'center'
    },
    {
      title: '📊 Dashboard Ejecutivo',
      body: 'Aquí ves el resumen completo del municipio: KPIs, gráficos y alertas en tiempo real.',
      target: '.sidebar',
      position: 'right'
    },
    {
      title: '🔔 Notificaciones',
      body: 'La campanita muestra alertas automáticas: presupuesto excedido, reclamos sin atender, contratos por vencer.',
      target: '#notifBell',
      position: 'bottom'
    },
    {
      title: '🔍 Búsqueda global',
      body: 'Busca empleados, obras, reclamos y pagos desde cualquier página con Ctrl+K.',
      target: '#globalSearch',
      position: 'bottom'
    },
    {
      title: '🤖 MuniBot',
      body: 'El asistente virtual está siempre disponible. Hacé clic en el botón azul para hacer consultas instantáneas.',
      target: '#munibot-fab',
      position: 'left'
    },
    {
      title: '⌨️ Atajos de teclado',
      body: 'Presioná \'?\' en cualquier momento para ver todos los atajos. G+D = Dashboard, G+H = Hacienda, G+R = RRHH y más.',
      target: null,
      position: 'center'
    },
    {
      title: '🚀 ¡Listo para empezar!',
      body: 'MuniControl está configurado para Junín. Todos los datos son reales y se sincronizan automáticamente.',
      target: null,
      position: 'center'
    }
  ];

  let currentStep = 0;
  let overlay, card;

  function start(force) {
    if (!force && localStorage.getItem(TOUR_KEY)) return;
    currentStep = 0;
    createOverlay();
    showStep(0);
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99998;backdrop-filter:blur(4px);transition:opacity 0.3s';
    document.body.appendChild(overlay);

    card = document.createElement('div');
    card.id = 'tourCard';
    card.style.cssText = 'position:fixed;z-index:99999;background:#0d1526;border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:28px;max-width:380px;width:90%;box-shadow:0 24px 80px rgba(0,0,0,0.7);transition:all 0.3s cubic-bezier(0.4,0,0.2,1)';
    document.body.appendChild(card);
  }

  function showStep(idx) {
    const step = STEPS[idx];
    if (!step) { finish(); return; }
    
    // Position card
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (step.position === 'right') {
          card.style.left = (rect.right + 16) + 'px';
          card.style.top = rect.top + 'px';
        } else if (step.position === 'bottom') {
          card.style.left = rect.left + 'px';
          card.style.top = (rect.bottom + 16) + 'px';
        } else if (step.position === 'left') {
          card.style.right = (window.innerWidth - rect.left + 16) + 'px';
          card.style.left = 'auto';
          card.style.top = rect.top + 'px';
        }
      } else {
        centerCard();
      }
    } else {
      centerCard();
    }

    const progress = ((idx + 1) / STEPS.length * 100).toFixed(0);
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:rgba(148,163,184,0.5)">${idx + 1} de ${STEPS.length}</span>
        <button onclick="MuniTour.skip()" style="background:rgba(255,255,255,0.06);border:none;color:rgba(148,163,184,0.6);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px">Saltar</button>
      </div>
      <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:99px;margin-bottom:20px;overflow:hidden">
        <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);border-radius:99px;transition:width 0.4s"></div>
      </div>
      <div style="font-size:22px;margin-bottom:10px">${step.title.split(' ')[0]}</div>
      <div style="font-family:'Outfit',sans-serif;font-size:17px;font-weight:800;margin-bottom:10px;line-height:1.3">${step.title.split(' ').slice(1).join(' ')}</div>
      <p style="font-size:13px;color:rgba(148,163,184,0.8);line-height:1.6;margin-bottom:24px">${step.body}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        ${idx > 0 ? '<button onclick="MuniTour.prev()" style="padding:9px 18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(148,163,184,0.8);border-radius:10px;cursor:pointer;font-size:13px;font-weight:700">← Anterior</button>' : ''}
        <button onclick="MuniTour.next()" style="padding:9px 22px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border:none;color:white;border-radius:10px;cursor:pointer;font-size:13px;font-weight:800">${idx === STEPS.length - 1 ? '🎉 Empezar' : 'Siguiente →'}</button>
      </div>
    `;

    // Highlight target element
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        el.classList.add('tour-highlight');
        el.style.position = 'relative';
        el.style.zIndex = '100000';
        el.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.5), 0 0 0 8px rgba(59,130,246,0.2)';
        el.style.borderRadius = '12px';
      }
    }
  }

  function centerCard() {
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    card.style.right = 'auto';
  }

  function finish() {
    localStorage.setItem(TOUR_KEY, '1');
    document.querySelectorAll('.tour-highlight').forEach(el => {
      el.classList.remove('tour-highlight');
      el.style.zIndex = '';
      el.style.boxShadow = '';
    });
    if (overlay) overlay.remove();
    if (card) card.remove();
    if (typeof showToast !== 'undefined') showToast('🎉 ¡Tour completado! Ya conocés MuniControl.', 'success');
  }

  // Add highlight style
  const style = document.createElement('style');
  style.textContent = '.tour-highlight { transition: box-shadow 0.3s, border-radius 0.3s !important; }';
  document.head.appendChild(style);

  window.MuniTour = {
    start,
    next: function() { currentStep++; showStep(currentStep); },
    prev: function() { currentStep--; showStep(currentStep); },
    skip: finish,
    reset: function() { localStorage.removeItem(TOUR_KEY); }
  };

  // Auto-start after 1 second if first time
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      if (!localStorage.getItem(TOUR_KEY)) start();
    }, 1500);
  });
})();
