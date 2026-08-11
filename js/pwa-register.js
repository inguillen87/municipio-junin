(function initializeMuniControlPwa() {
  'use strict';

  var installPrompt = null;
  var installButton = document.querySelector('[data-pwa-install]');
  var installStatus = document.querySelector('[data-pwa-install-status]');

  function setInstallAvailability(available) {
    if (!installButton) return;
    installButton.hidden = !available;
    installButton.disabled = false;
  }

  function setInstallStatus(message) {
    if (installStatus) installStatus.textContent = message || '';
  }

  function clearInstallPrompt(message) {
    installPrompt = null;
    setInstallAvailability(false);
    setInstallStatus(message);
  }

  window.addEventListener('beforeinstallprompt', function onBeforeInstallPrompt(event) {
    event.preventDefault();
    installPrompt = event;
    setInstallAvailability(true);
    setInstallStatus('MuniControl se puede instalar en este dispositivo.');
  });

  window.addEventListener('appinstalled', function onAppInstalled() {
    clearInstallPrompt('MuniControl quedó instalado en este dispositivo.');
  });

  if (installButton) {
    installButton.addEventListener('click', async function requestInstall() {
      if (!installPrompt) return;
      var promptEvent = installPrompt;
      installPrompt = null;
      installButton.disabled = true;

      try {
        await promptEvent.prompt();
        var choice = await promptEvent.userChoice;
        clearInstallPrompt(
          choice && choice.outcome === 'accepted'
            ? 'Instalación iniciada.'
            : 'Instalación cancelada. Podés volver a intentarlo cuando el navegador la ofrezca.',
        );
      } catch (error) {
        clearInstallPrompt('No se pudo iniciar la instalación desde este navegador.');
      }
    });
  }

  if (!('serviceWorker' in navigator)) return;

  function activateWaitingWorker(registration) {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  function watchForUpdate(registration) {
    activateWaitingWorker(registration);
    registration.addEventListener('updatefound', function onUpdateFound() {
      var installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', function onWorkerStateChange() {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          activateWaitingWorker(registration);
        }
      });
    });
  }

  function registerPublicShell() {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then(function onRegistered(registration) {
      watchForUpdate(registration);
      return registration.update();
    }).catch(function ignoreUnavailableServiceWorker() {
      // The web application remains usable when installation is unsupported.
    });
  }

  if (document.readyState === 'complete') {
    registerPublicShell();
  } else {
    window.addEventListener('load', registerPublicShell, { once: true });
  }
})();
