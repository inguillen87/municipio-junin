// live-clock.js — Premium live clock for topbar
(function() {
  function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('liveClock');
    const dateEl = document.getElementById('currentDate');
    
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('es-AR', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('es-AR', { 
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
      });
    }
  }
  updateClock();
  setInterval(updateClock, 1000);
})();
