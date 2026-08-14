(function installMuniGuiaOnboarding(global) {
  'use strict';

  var MODULE_URL = '/js/muniguia-onboarding-catalog.js';
  var STORAGE_PREFIX = 'municontrol:muniguia-onboarding';
  var STATE_SCHEMA_VERSION = 1;
  var STATUS = Object.freeze({ NEW: 'new', IN_PROGRESS: 'in_progress', COMPLETED: 'completed' });
  var state = {
    generation: 0, root: null, input: null, projection: null,
    progress: null, storageKey: null, live: null
  };
  var catalogPromise = null;

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, expected) {
    if (!plainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index) { return key === wanted[index]; });
  }

  function identifier(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
  }

  function validInternalHref(value) {
    return typeof value === 'string' &&
      /^(?:\/[a-z0-9-]+|[a-z0-9-]+\.html)(?:#[a-z][a-z0-9-]*)?$/.test(value);
  }

  function uniqueStrings(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    var result = [];
    for (var index = 0; index < value.length; index += 1) {
      if (typeof value[index] !== 'string' || !value[index] || result.indexOf(value[index]) !== -1) return null;
      result.push(value[index]);
    }
    return result;
  }

  function normalizeInput(session) {
    if (!plainObject(session) || !plainObject(session.user) || !plainObject(session.homeProfile)) return null;
    var capabilities = uniqueStrings(session.capabilities);
    var role = session.user.role;
    var variant = session.homeProfile.variant;
    var policyVersion = session.user.accessPolicyVersion;
    if (!capabilities || capabilities.indexOf('session.read') === -1 ||
        capabilities.indexOf('navigation.workspace') === -1 ||
        capabilities.indexOf('navigation.help') === -1 ||
        !identifier(role) || !identifier(variant) || !identifier(policyVersion)) return null;
    return Object.freeze({
      role: role,
      variant: variant,
      capabilities: Object.freeze(capabilities.slice()),
      policyVersion: policyVersion
    });
  }

  function normalizeProjection(value, input) {
    if (!exactKeys(value, ['contract', 'catalogVersion', 'progressVersion', 'journey']) ||
        !identifier(value.contract) || !identifier(value.catalogVersion) || !identifier(value.progressVersion) ||
        !exactKeys(value.journey, ['id', 'title', 'estimatedMinutes', 'stages']) ||
        !identifier(value.journey.id) || typeof value.journey.title !== 'string' ||
        !value.journey.title.trim() || !Number.isSafeInteger(value.journey.estimatedMinutes) ||
        value.journey.estimatedMinutes < 1 || value.journey.estimatedMinutes > 30 ||
        !Array.isArray(value.journey.stages) || value.journey.stages.length < 3 ||
        value.journey.stages.length > 5) return null;

    var stageIds = [];
    var stages = [];
    for (var index = 0; index < value.journey.stages.length; index += 1) {
      var stage = value.journey.stages[index];
      if (!exactKeys(stage, ['id', 'pageId', 'capability', 'href', 'label', 'copy']) ||
          !identifier(stage.id) || stageIds.indexOf(stage.id) !== -1 ||
          !identifier(stage.pageId) || typeof stage.capability !== 'string' ||
          input.capabilities.indexOf(stage.capability) === -1 || !validInternalHref(stage.href) ||
          typeof stage.label !== 'string' || !stage.label.trim() ||
          typeof stage.copy !== 'string' || !stage.copy.trim()) return null;
      stageIds.push(stage.id);
      stages.push(Object.freeze({
        id: stage.id, pageId: stage.pageId, capability: stage.capability,
        href: stage.href, label: stage.label, copy: stage.copy
      }));
    }
    return Object.freeze({
      contract: value.contract,
      catalogVersion: value.catalogVersion,
      progressVersion: value.progressVersion,
      journey: Object.freeze({
        id: value.journey.id,
        title: value.journey.title,
        estimatedMinutes: value.journey.estimatedMinutes,
        stages: Object.freeze(stages)
      })
    });
  }

  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    var attempt = import(MODULE_URL).then(function(module) {
      if (!module || typeof module.resolveMuniGuiaOnboarding !== 'function' ||
          !plainObject(module.MUNIGUIA_ONBOARDING_CATALOG)) {
        catalogPromise = null;
        return null;
      }
      return module;
    }, function() {
      catalogPromise = null;
      return null;
    });
    catalogPromise = attempt;
    return attempt;
  }

  function progressKey(input, projection) {
    return [
      STORAGE_PREFIX, projection.contract, projection.catalogVersion,
      projection.progressVersion, input.role, input.variant
    ].join(':');
  }

  function newProgress(projection) {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: projection.journey.id,
      status: STATUS.NEW,
      completedStageIds: [],
      launchedStageId: null
    };
  }

  function validProgress(value, projection) {
    if (!exactKeys(value, ['schemaVersion', 'journeyId', 'status', 'completedStageIds', 'launchedStageId']) ||
        value.schemaVersion !== STATE_SCHEMA_VERSION || value.journeyId !== projection.journey.id ||
        !Object.keys(STATUS).some(function(key) { return STATUS[key] === value.status; }) ||
        !Array.isArray(value.completedStageIds)) return null;
    var allIds = projection.journey.stages.map(function(stage) { return stage.id; });
    var completed = [];
    for (var index = 0; index < value.completedStageIds.length; index += 1) {
      var stageId = value.completedStageIds[index];
      if (typeof stageId !== 'string' || allIds.indexOf(stageId) === -1 || completed.indexOf(stageId) !== -1) return null;
      completed.push(stageId);
    }
    if (!completed.every(function(stageId, index) { return stageId === allIds[index]; })) return null;
    if (value.launchedStageId !== null && (typeof value.launchedStageId !== 'string' ||
        allIds.indexOf(value.launchedStageId) !== completed.length)) return null;
    if (value.status === STATUS.NEW && (completed.length !== 0 || value.launchedStageId !== null)) return null;
    if (value.status === STATUS.COMPLETED && (completed.length !== allIds.length || value.launchedStageId !== null)) return null;
    if (value.status === STATUS.IN_PROGRESS && completed.length >= allIds.length) return null;
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: projection.journey.id,
      status: value.status,
      completedStageIds: completed,
      launchedStageId: value.launchedStageId
    };
  }

  function readProgress(storageKey, projection) {
    try {
      var serialized = global.sessionStorage.getItem(storageKey);
      if (!serialized) return newProgress(projection);
      return validProgress(JSON.parse(serialized), projection) || newProgress(projection);
    } catch (error) {
      return newProgress(projection);
    }
  }

  function persistProgress() {
    if (!state.storageKey || !state.progress) return;
    try {
      global.sessionStorage.setItem(state.storageKey, JSON.stringify(state.progress));
    } catch (error) {
      // The journey remains usable in memory when session storage is unavailable.
    }
  }

  function clearProgress() {
    if (!state.storageKey) return;
    try { global.sessionStorage.removeItem(state.storageKey); } catch (error) {}
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  }

  function currentStage() {
    if (!state.projection || !state.progress) return null;
    return state.projection.journey.stages[state.progress.completedStageIds.length] || null;
  }

  function stateLabel(status) {
    if (status === STATUS.COMPLETED) return 'Completado';
    if (status === STATUS.IN_PROGRESS) return 'En curso';
    return 'Nuevo';
  }

  function announce(message) {
    if (!state.live) return;
    state.live.textContent = '';
    global.requestAnimationFrame(function() { if (state.live) state.live.textContent = message; });
  }

  function setProgress(next, announcement, focusSelector) {
    state.progress = next;
    persistProgress();
    render();
    announce(announcement);
    if (!focusSelector || !state.root) return;
    global.requestAnimationFrame(function() {
      var target = state.root && state.root.querySelector(focusSelector);
      if (target) target.focus({ preventScroll: true });
    });
  }

  function beginJourney() {
    setProgress({
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: state.projection.journey.id,
      status: STATUS.IN_PROGRESS,
      completedStageIds: [],
      launchedStageId: null
    }, 'Recorrido iniciado. Estás en el paso 1 de ' + state.projection.journey.stages.length + '.',
    '.muni-onboarding__current h3');
  }

  function resetJourney() {
    clearProgress();
    state.progress = newProgress(state.projection);
    render();
    announce('El recorrido volvió al inicio.');
    global.requestAnimationFrame(function() {
      var target = state.root && state.root.querySelector('.muni-onboarding__button--primary');
      if (target) target.focus({ preventScroll: true });
    });
  }

  function launchStage(stage) {
    if (!stage || state.progress.status !== STATUS.IN_PROGRESS || currentStage()?.id !== stage.id) return;
    state.progress = {
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: state.projection.journey.id,
      status: STATUS.IN_PROGRESS,
      completedStageIds: state.progress.completedStageIds.slice(),
      launchedStageId: stage.id
    };
    persistProgress();
  }

  function openWorkspaceGuide(stage) {
    launchStage(stage);
    render();
    var guide = global.MuniGuia;
    if (guide && typeof guide.open === 'function') {
      guide.open();
      return;
    }
    var trigger = document.querySelector('[data-muniguia-open]:not([hidden])');
    if (trigger instanceof HTMLButtonElement) {
      trigger.click();
      return;
    }
    announce('La guía de esta pantalla todavía se está preparando. Podés marcar el paso cuando termines de revisar Inicio.');
  }

  function completeCurrentStage() {
    var stage = currentStage();
    if (!stage || state.progress.launchedStageId !== stage.id) return;
    var completed = state.progress.completedStageIds.concat(stage.id);
    var finished = completed.length === state.projection.journey.stages.length;
    setProgress({
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: state.projection.journey.id,
      status: finished ? STATUS.COMPLETED : STATUS.IN_PROGRESS,
      completedStageIds: completed,
      launchedStageId: null
    }, finished ? 'Recorrido completado.' : 'Paso marcado como listo. Podés continuar con el siguiente.',
    finished ? '.muni-onboarding__button--primary' : '.muni-onboarding__current h3');
  }

  function buildStages() {
    var list = createElement('ol', 'muni-onboarding__stages');
    var current = currentStage();
    state.projection.journey.stages.forEach(function(stage, index) {
      var completed = state.progress.completedStageIds.indexOf(stage.id) !== -1;
      var active = Boolean(current && current.id === stage.id && state.progress.status === STATUS.IN_PROGRESS);
      var item = createElement('li', 'muni-onboarding__stage');
      item.dataset.complete = completed ? 'true' : 'false';
      if (active) item.setAttribute('aria-current', 'step');
      var number = createElement('span', 'muni-onboarding__stage-index', completed ? '✓' : String(index + 1));
      number.setAttribute('aria-hidden', 'true');
      var body = createElement('span');
      var title = createElement('strong', 'muni-onboarding__stage-title', stage.label);
      var copy = createElement('span', 'muni-onboarding__stage-copy', stage.copy);
      var status = createElement('span', 'muni-onboarding__stage-state', completed ? 'Listo' : active ? 'Ahora' : 'Pendiente');
      body.append(title, copy);
      item.append(number, body, status);
      list.appendChild(item);
    });
    return list;
  }

  function primaryButton(label, onClick) {
    var button = createElement('button', 'muni-onboarding__button muni-onboarding__button--primary', label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function resetButton() {
    var button = createElement('button', 'muni-onboarding__button muni-onboarding__reset', 'Reiniciar recorrido');
    button.type = 'button';
    button.addEventListener('click', resetJourney);
    return button;
  }

  function buildCurrentPanel() {
    var panel = createElement('aside', 'muni-onboarding__current');
    if (state.progress.status === STATUS.NEW) {
      panel.append(
        createElement('p', 'muni-onboarding__stage-kicker', 'Cuando quieras'),
        createElement('h3', '', state.projection.journey.stages.length + ' etapas para ubicarte'),
        createElement('p', '', 'Nada se abre automáticamente. Vos decidís cuándo empezar y cada paso se marca de forma explícita.')
      );
      var newActions = createElement('div', 'muni-onboarding__actions');
      newActions.appendChild(primaryButton('Empezar recorrido', beginJourney));
      panel.appendChild(newActions);
      return panel;
    }
    if (state.progress.status === STATUS.COMPLETED) {
      panel.append(
        createElement('p', 'muni-onboarding__stage-kicker', 'Recorrido completo'),
        createElement('h3', '', 'Ya conocés tu espacio'),
        createElement('p', '', 'Podés repetir las ' + state.projection.journey.stages.length +
          ' etapas cuando necesites refrescar el recorrido.')
      );
      var completedActions = createElement('div', 'muni-onboarding__actions');
      completedActions.appendChild(primaryButton('Repetir recorrido', beginJourney));
      panel.append(completedActions, resetButton());
      return panel;
    }
    var stage = currentStage();
    var position = state.progress.completedStageIds.length + 1;
    panel.append(
      createElement('p', 'muni-onboarding__stage-kicker',
        'Paso ' + position + ' de ' + state.projection.journey.stages.length),
      createElement('h3', '', stage.label),
      createElement('p', '', stage.copy)
    );
    panel.querySelector('h3').tabIndex = -1;
    var actions = createElement('div', 'muni-onboarding__actions');
    if (stage.pageId === 'workspace') {
      actions.appendChild(primaryButton('Abrir la guía de Inicio', function() { openWorkspaceGuide(stage); }));
    } else {
      var link = createElement('a', 'muni-onboarding__link muni-onboarding__link--primary', 'Continuar en ' + stage.label);
      link.href = stage.href;
      link.dataset.capability = stage.capability;
      link.addEventListener('click', function() { launchStage(stage); });
      actions.appendChild(link);
    }
    var done = createElement('button', 'muni-onboarding__button', 'Marcar como listo');
    done.type = 'button';
    done.disabled = state.progress.launchedStageId !== stage.id;
    done.addEventListener('click', completeCurrentStage);
    actions.appendChild(done);
    panel.append(actions, resetButton());
    return panel;
  }

  function render() {
    if (!state.root || !state.projection || !state.progress) return;
    var journey = state.projection.journey;
    var completedCount = state.progress.completedStageIds.length;
    var inner = createElement('div', 'muni-onboarding__inner');
    var overview = createElement('div');
    var titleId = 'muniguiaOnboardingTitle';
    var title = createElement('h2', 'muni-onboarding__title', 'Tu recorrido inicial');
    title.id = titleId;
    var summary = createElement('div', 'muni-onboarding__summary');
    var status = createElement('span', 'muni-onboarding__state', stateLabel(state.progress.status));
    status.dataset.state = state.progress.status;
    status.setAttribute('role', 'status');
    var privacy = createElement('span', 'muni-onboarding__privacy', 'Sólo durante esta sesión');
    summary.append(status, privacy);
    var progressWrap = createElement('div', 'muni-onboarding__progress-wrap');
    var progress = createElement('progress', 'muni-onboarding__progress');
    progress.max = journey.stages.length;
    progress.value = completedCount;
    progress.setAttribute('aria-label', 'Avance del recorrido');
    var progressLabel = createElement('span', 'muni-onboarding__progress-label',
      completedCount + ' de ' + journey.stages.length + ' pasos listos');
    progressWrap.append(progress, progressLabel);
    overview.append(
      createElement('p', 'muni-onboarding__eyebrow', journey.title + ' · ' + journey.stages.length +
        ' etapas · ' + journey.estimatedMinutes + ' minutos'),
      title,
      createElement('p', 'muni-onboarding__copy', 'Un recorrido breve y opcional por las herramientas habilitadas para tu función. No cambia permisos ni consulta datos adicionales.'),
      summary, progressWrap, buildStages()
    );
    var live = createElement('p', 'muni-onboarding__note');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.textContent = 'El avance se guarda sólo en esta pestaña y se descarta al cerrarla.';
    overview.appendChild(live);
    inner.append(overview, buildCurrentPanel());
    state.live = live;
    state.root.className = 'muni-onboarding';
    state.root.setAttribute('aria-labelledby', titleId);
    state.root.replaceChildren(inner);
    state.root.hidden = false;
  }

  function unmount() {
    state.generation += 1;
    if (state.root) {
      state.root.hidden = true;
      state.root.removeAttribute('aria-labelledby');
      state.root.className = '';
      state.root.replaceChildren();
    }
    state.root = null;
    state.input = null;
    state.projection = null;
    state.progress = null;
    state.storageKey = null;
    state.live = null;
  }

  function clearSession() {
    try {
      for (var index = global.sessionStorage.length - 1; index >= 0; index -= 1) {
        var key = global.sessionStorage.key(index);
        if (typeof key === 'string' && key.indexOf(STORAGE_PREFIX + ':') === 0) {
          global.sessionStorage.removeItem(key);
        }
      }
    } catch (error) {
      // Logout must continue even when browser storage is unavailable.
    }
    if (state.projection) {
      state.progress = newProgress(state.projection);
      render();
    }
  }

  async function mount(session, root) {
    var generation = state.generation + 1;
    unmount();
    state.generation = generation;
    if (!(root instanceof HTMLElement)) return false;
    var input = normalizeInput(session);
    if (!input) return false;
    var module = await loadCatalog();
    if (state.generation !== generation || !module) return false;
    var resolved;
    try {
      resolved = module.resolveMuniGuiaOnboarding({
        role: input.role,
        variant: input.variant,
        capabilities: input.capabilities.slice(),
        policyVersion: input.policyVersion
      });
    } catch (error) {
      return false;
    }
    var projection = normalizeProjection(resolved, input);
    if (!projection || state.generation !== generation) return false;
    state.root = root;
    state.input = input;
    state.projection = projection;
    state.storageKey = progressKey(input, projection);
    state.progress = readProgress(state.storageKey, projection);
    render();
    return true;
  }

  global.MuniGuiaOnboarding = Object.freeze({
    clearSession: clearSession,
    mount: mount,
    unmount: unmount
  });
}(window));
