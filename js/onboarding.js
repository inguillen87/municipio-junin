// onboarding.js - MuniControl Tour (DISABLED AUTO-SHOW)
// Call window.startTour() manually to trigger
window.startTour = function() {
  if (typeof showToast !== 'undefined') {
    showToast('Tour disponible proximamente', 'info');
  }
};
// DO NOT auto-start - was blocking content on first load