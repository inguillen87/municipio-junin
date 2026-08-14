(function installMunicipalLearningCenter(global) {
  'use strict';

  var CONTRACT = 'municipal-learning-center-v1';
  var STORAGE_PREFIX = 'municontrol:muniguia-onboarding';
  var STATE_SCHEMA_VERSION = 1;
  var STATUS = Object.freeze({ NEW: 'new', IN_PROGRESS: 'in_progress', COMPLETED: 'completed' });
  var MODULE_BASE = (function() {
    try {
      var source = document.currentScript && document.currentScript.src;
      return new URL('./', source || new URL('/js/', global.location.origin)).href;
    } catch (error) {
      return '/js/';
    }
  })();
  var state = {
    root: null,
    input: null,
    journey: null,
    context: null,
    progress: null,
    storageKey: null,
    live: null,
    ready: false,
    advancedLayoutObserver: null,
    advancedLayoutTimer: null,
    advancedScrollEpoch: 0,
    advancedScrollRafOne: null,
    advancedScrollRafTwo: null,
    advancedScrollTimer: null,
  };

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, expected) {
    if (!plainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index) {
      return key === wanted[index];
    });
  }

  function identifier(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
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

  function validInternalHref(value) {
    return typeof value === 'string' &&
      /^(?:\/[a-z0-9-]+|[a-z0-9-]+\.html)(?:#[a-z][a-z0-9-]*)?$/.test(value);
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
      policyVersion: policyVersion,
    });
  }

  function normalizeJourney(value, input) {
    if (!exactKeys(value, ['contract', 'catalogVersion', 'progressVersion', 'journey']) ||
        value.contract !== 'muniguia-onboarding-v1' || !identifier(value.catalogVersion) ||
        value.progressVersion !== 'muniguia-onboarding-progress-v1' ||
        !exactKeys(value.journey, ['id', 'title', 'estimatedMinutes', 'stages']) ||
        !identifier(value.journey.id) || typeof value.journey.title !== 'string' || !value.journey.title.trim() ||
        !Number.isSafeInteger(value.journey.estimatedMinutes) || value.journey.estimatedMinutes < 1 ||
        value.journey.estimatedMinutes > 30 || !Array.isArray(value.journey.stages) ||
        value.journey.stages.length < 3 || value.journey.stages.length > 5) return null;

    var stageIds = [];
    var stages = [];
    for (var index = 0; index < value.journey.stages.length; index += 1) {
      var stage = value.journey.stages[index];
      if (!exactKeys(stage, ['id', 'pageId', 'capability', 'href', 'label', 'copy']) ||
          !identifier(stage.id) || stageIds.indexOf(stage.id) !== -1 || !identifier(stage.pageId) ||
          typeof stage.capability !== 'string' || input.capabilities.indexOf(stage.capability) === -1 ||
          !validInternalHref(stage.href) || typeof stage.label !== 'string' || !stage.label.trim() ||
          typeof stage.copy !== 'string' || !stage.copy.trim()) return null;
      stageIds.push(stage.id);
      stages.push(Object.freeze({
        id: stage.id,
        pageId: stage.pageId,
        capability: stage.capability,
        href: stage.href,
        label: stage.label,
        copy: stage.copy,
      }));
    }
    if (stages[0].pageId !== 'workspace') return null;
    return Object.freeze({
      contract: value.contract,
      catalogVersion: value.catalogVersion,
      progressVersion: value.progressVersion,
      journey: Object.freeze({
        id: value.journey.id,
        title: value.journey.title,
        estimatedMinutes: value.journey.estimatedMinutes,
        stages: Object.freeze(stages),
      }),
    });
  }

  function validAssistant(value, expectedQuestion, input) {
    if (value === null) return input.capabilities.indexOf('navigation.ai-assistant') === -1 ? null : false;
    if (!exactKeys(value, ['capability', 'href', 'label', 'question']) ||
        value.capability !== 'navigation.ai-assistant' ||
        input.capabilities.indexOf(value.capability) === -1 ||
        typeof expectedQuestion !== 'string' || value.question !== expectedQuestion ||
        typeof value.label !== 'string' || !value.label.trim() || typeof value.href !== 'string') return false;
    try {
      var href = new URL(value.href, global.location.href);
      var keys = Array.from(href.searchParams.keys());
      if (href.origin !== global.location.origin || href.pathname !== '/ia.html' || href.hash ||
          keys.length !== 1 || keys[0] !== 'question' || href.searchParams.get('question') !== expectedQuestion) return false;
    } catch (error) {
      return false;
    }
    return Object.freeze({ href: value.href, label: value.label, question: value.question });
  }

  function normalizeContext(value, module, input) {
    if (!plainObject(value) || value.contract !== 'muniguia-contextual-v1' ||
        !plainObject(value.role) || value.role.id !== input.role || typeof value.role.label !== 'string' ||
        !value.role.label.trim() || typeof value.role.intent !== 'string' || !value.role.intent.trim() ||
        !plainObject(value.page) || value.page.id !== 'manuals') return null;
    var expectedQuestion = module && module.MUNIGUIA_ASSISTANT_QUESTIONS
      ? module.MUNIGUIA_ASSISTANT_QUESTIONS.manuals
      : null;
    var assistant = validAssistant(value.assistant, expectedQuestion, input);
    if (assistant === false) return null;
    return Object.freeze({
      role: Object.freeze({ label: value.role.label, intent: value.role.intent }),
      assistant: assistant,
    });
  }

  function progressKey(input, projection) {
    return [
      STORAGE_PREFIX,
      projection.contract,
      projection.catalogVersion,
      projection.progressVersion,
      input.role,
      input.variant,
    ].join(':');
  }

  function newProgress(projection) {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: projection.journey.id,
      status: STATUS.NEW,
      completedStageIds: [],
      launchedStageId: null,
    };
  }

  function validProgress(value, projection) {
    if (!exactKeys(value, ['schemaVersion', 'journeyId', 'status', 'completedStageIds', 'launchedStageId']) ||
        value.schemaVersion !== STATE_SCHEMA_VERSION || value.journeyId !== projection.journey.id ||
        [STATUS.NEW, STATUS.IN_PROGRESS, STATUS.COMPLETED].indexOf(value.status) === -1 ||
        !Array.isArray(value.completedStageIds)) return null;
    var allIds = projection.journey.stages.map(function(stage) { return stage.id; });
    var completed = [];
    for (var index = 0; index < value.completedStageIds.length; index += 1) {
      var stageId = value.completedStageIds[index];
      if (typeof stageId !== 'string' || allIds.indexOf(stageId) === -1 || completed.indexOf(stageId) !== -1) return null;
      completed.push(stageId);
    }
    if (!completed.every(function(stageId, index) { return stageId === allIds[index]; })) return null;
    if (value.launchedStageId !== null &&
        (typeof value.launchedStageId !== 'string' || allIds.indexOf(value.launchedStageId) !== completed.length)) return null;
    if (value.status === STATUS.NEW && (completed.length !== 0 || value.launchedStageId !== null)) return null;
    if (value.status === STATUS.COMPLETED && (completed.length !== allIds.length || value.launchedStageId !== null)) return null;
    if (value.status === STATUS.IN_PROGRESS && completed.length >= allIds.length) return null;
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: projection.journey.id,
      status: value.status,
      completedStageIds: completed,
      launchedStageId: value.launchedStageId,
    };
  }

  function readProgress() {
    try {
      var serialized = global.sessionStorage.getItem(state.storageKey);
      if (!serialized) return newProgress(state.journey);
      return validProgress(JSON.parse(serialized), state.journey) || newProgress(state.journey);
    } catch (error) {
      return newProgress(state.journey);
    }
  }

  function persistProgress() {
    try {
      global.sessionStorage.setItem(state.storageKey, JSON.stringify(state.progress));
    } catch (error) {
      // The role journey remains usable in memory when session storage is unavailable.
    }
  }

  function clearProgress() {
    try { global.sessionStorage.removeItem(state.storageKey); } catch (error) {}
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  }

  function announce(message) {
    if (!state.live) return;
    state.live.textContent = '';
    global.requestAnimationFrame(function() {
      if (state.live) state.live.textContent = message;
    });
  }

  function currentStage() {
    return state.journey.journey.stages[state.progress.completedStageIds.length] || null;
  }

  function setProgress(progress, message, focusSelector) {
    state.progress = progress;
    persistProgress();
    renderJourney();
    announce(message);
    if (!focusSelector) return;
    global.requestAnimationFrame(function() {
      var target = state.root && state.root.querySelector(focusSelector);
      if (target) target.focus({ preventScroll: true });
    });
  }

  function beginJourney() {
    setProgress({
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: state.journey.journey.id,
      status: STATUS.IN_PROGRESS,
      completedStageIds: [],
      launchedStageId: null,
    }, 'Recorrido iniciado. Estás en el paso 1 de ' + state.journey.journey.stages.length + '.', '[data-learning-launch]');
  }

  function launchStage(stage) {
    if (!stage || state.progress.status !== STATUS.IN_PROGRESS || currentStage() !== stage) return;
    state.progress = {
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: state.journey.journey.id,
      status: STATUS.IN_PROGRESS,
      completedStageIds: state.progress.completedStageIds.slice(),
      launchedStageId: stage.id,
    };
    persistProgress();
  }

  function completeStage() {
    var stage = currentStage();
    if (!stage || state.progress.launchedStageId !== stage.id) return;
    var completed = state.progress.completedStageIds.concat(stage.id);
    var finished = completed.length === state.journey.journey.stages.length;
    setProgress({
      schemaVersion: STATE_SCHEMA_VERSION,
      journeyId: state.journey.journey.id,
      status: finished ? STATUS.COMPLETED : STATUS.IN_PROGRESS,
      completedStageIds: completed,
      launchedStageId: null,
    }, finished ? 'Recorrido completado.' : 'Paso marcado como listo. Podés continuar con el siguiente.',
    finished ? '[data-learning-reset]' : '[data-learning-launch]');
  }

  function resetJourney() {
    clearProgress();
    state.progress = newProgress(state.journey);
    renderJourney();
    announce('El recorrido volvió al inicio.');
    global.requestAnimationFrame(function() {
      var target = state.root && state.root.querySelector('[data-learning-begin]');
      if (target) target.focus({ preventScroll: true });
    });
  }

  function buildStageList() {
    var list = createElement('ol', 'learning-steps');
    var current = currentStage();
    state.journey.journey.stages.forEach(function(stage, index) {
      var completed = state.progress.completedStageIds.indexOf(stage.id) !== -1;
      var active = Boolean(current && current.id === stage.id && state.progress.status === STATUS.IN_PROGRESS);
      var item = createElement('li', 'learning-step');
      item.dataset.state = completed ? 'complete' : active ? 'current' : 'pending';
      if (active) item.setAttribute('aria-current', 'step');
      var marker = createElement('span', 'learning-step__marker', completed ? '✓' : String(index + 1));
      marker.setAttribute('aria-hidden', 'true');
      var body = createElement('span', 'learning-step__body');
      body.append(
        createElement('strong', 'learning-step__title', stage.label),
        createElement('span', 'learning-step__state', completed ? 'Listo' : active ? 'Ahora' : 'Pendiente')
      );
      item.append(marker, body);
      list.appendChild(item);
    });
    return list;
  }

  function buildCurrentStage() {
    var stage = currentStage();
    if (!stage) return null;
    var index = state.progress.completedStageIds.length;
    var panel = createElement('article', 'learning-current-step');
    var eyebrow = createElement('p', 'learning-current-step__eyebrow',
      'Paso ' + (index + 1) + ' de ' + state.journey.journey.stages.length);
    var title = createElement('h3', '', stage.label);
    title.tabIndex = -1;
    var copy = createElement('p', '', stage.copy);
    var actions = createElement('div', 'learning-current-step__actions');
    var open = createElement('a', 'learning-action learning-action--primary', 'Abrir este paso');
    open.href = stage.href;
    open.dataset.learningLaunch = stage.id;
    open.dataset.capability = stage.capability;
    open.addEventListener('click', function() { launchStage(stage); });
    var done = createElement('button', 'learning-action', 'Marcar este paso como listo');
    done.type = 'button';
    done.dataset.learningComplete = stage.id;
    done.disabled = state.progress.launchedStageId !== stage.id;
    done.addEventListener('click', completeStage);
    actions.append(open, done);
    if (done.disabled) {
      var hint = createElement('p', 'learning-current-step__hint', 'Abrí el paso y volvé a esta guía para marcarlo como listo.');
      panel.append(eyebrow, title, copy, actions, hint);
    } else {
      panel.append(eyebrow, title, copy, actions);
    }
    return panel;
  }

  function updateProgressSummary() {
    var root = state.root.querySelector('[data-learning-progress-summary]');
    if (!root) return;
    var completed = state.progress.completedStageIds.length;
    var total = state.journey.journey.stages.length;
    var label = state.progress.status === STATUS.COMPLETED ? 'Recorrido completo' : completed + ' de ' + total + ' pasos';
    var progress = createElement('progress', 'learning-progress');
    progress.max = total;
    progress.value = completed;
    progress.setAttribute('aria-label', label);
    root.replaceChildren(
      createElement('strong', '', label),
      createElement('span', '', state.journey.journey.estimatedMinutes + ' min aprox.'),
      progress
    );
  }

  function renderJourney() {
    var root = state.root && state.root.querySelector('[data-learning-journey]');
    if (!root || !state.progress) return;
    updateProgressSummary();
    var layout = createElement('div', 'learning-journey');
    var overview = createElement('div', 'learning-journey__overview');
    overview.append(createElement('h3', '', state.journey.journey.title), buildStageList());
    var action = createElement('div', 'learning-journey__action');
    if (state.progress.status === STATUS.NEW) {
      action.append(
        createElement('p', '', 'Empezá cuando quieras. Este progreso vive sólo en esta pestaña y no cambia accesos ni datos.'),
        (function() {
          var button = createElement('button', 'learning-action learning-action--primary', 'Empezar mi recorrido');
          button.type = 'button';
          button.dataset.learningBegin = 'true';
          button.addEventListener('click', beginJourney);
          return button;
        })()
      );
    } else if (state.progress.status === STATUS.COMPLETED) {
      var done = createElement('div', 'learning-complete');
      done.append(
        createElement('strong', '', 'Recorrido completado'),
        createElement('p', '', 'Ya conocés los pasos esenciales de tu función. Podés repetirlos cuando lo necesites.')
      );
      action.appendChild(done);
    } else {
      action.appendChild(buildCurrentStage());
    }
    if (state.progress.status !== STATUS.NEW) {
      var reset = createElement('button', 'learning-reset', 'Reiniciar recorrido');
      reset.type = 'button';
      reset.dataset.learningReset = 'true';
      reset.addEventListener('click', resetJourney);
      action.appendChild(reset);
    }
    layout.append(overview, action);
    root.replaceChildren(layout);
  }

  function openGuide() {
    if (!state.input || state.input.capabilities.indexOf('navigation.help') === -1) return;
    if (global.MuniGuia && typeof global.MuniGuia.open === 'function') {
      global.MuniGuia.open();
      return;
    }
    var trigger = document.querySelector('[data-muniguia-open]:not([hidden])');
    if (trigger instanceof HTMLButtonElement) {
      trigger.click();
      return;
    }
    announce('MuniGuía todavía se está preparando. Volvé a intentarlo en unos segundos.');
  }

  function renderReady() {
    state.root.dataset.state = 'ready';
    state.root.dataset.role = state.input.role;
    var role = state.root.querySelector('[data-learning-role]');
    var status = state.root.querySelector('[data-learning-status]');
    var intent = state.root.querySelector('[data-learning-intent]');
    if (role) {
      role.textContent = state.context.role.label;
      role.hidden = false;
    }
    if (status) status.textContent = 'Rol y permisos confirmados';
    if (intent) intent.textContent = state.context.role.intent;
    state.root.querySelectorAll('[data-learning-private]').forEach(function(element) { element.hidden = false; });

    var guide = state.root.querySelector('[data-learning-guide]');
    if (guide) {
      guide.hidden = false;
      guide.addEventListener('click', openGuide);
    }
    var assistant = state.root.querySelector('[data-learning-assistant]');
    if (assistant && state.context.assistant) {
      assistant.href = state.context.assistant.href;
      assistant.textContent = state.context.assistant.label;
      assistant.dataset.capability = 'navigation.ai-assistant';
      assistant.hidden = false;
    }
    renderJourney();
  }

  function failClosed() {
    if (!state.root) return;
    state.ready = false;
    clearAdvancedLayoutTracking();
    cancelAdvancedScroll();
    state.root.dataset.state = 'unavailable';
    state.root.removeAttribute('data-role');
    state.root.querySelectorAll('[data-learning-private]').forEach(function(element) { element.hidden = true; });
    var role = state.root.querySelector('[data-learning-role]');
    var status = state.root.querySelector('[data-learning-status]');
    var guide = state.root.querySelector('[data-learning-guide]');
    var assistant = state.root.querySelector('[data-learning-assistant]');
    if (role) { role.textContent = ''; role.hidden = true; }
    if (status) status.textContent = 'No pudimos validar el recorrido de esta sesión. Recargá la página o pedí ayuda a tu administrador.';
    if (guide) guide.hidden = true;
    if (assistant) { assistant.hidden = true; assistant.removeAttribute('href'); }
  }

  function advancedTargetFromLink(link) {
    if (!(link instanceof HTMLAnchorElement) || !link.hash) return null;
    try {
      var targetUrl = new URL(link.href, global.location.href);
      if (targetUrl.origin !== global.location.origin || targetUrl.pathname !== global.location.pathname) return null;
      return document.getElementById(decodeURIComponent(targetUrl.hash.slice(1)));
    } catch (error) {
      return null;
    }
  }

  function clearAdvancedLayoutTracking() {
    if (state.advancedLayoutObserver) state.advancedLayoutObserver.disconnect();
    if (state.advancedLayoutTimer !== null) global.clearTimeout(state.advancedLayoutTimer);
    state.advancedLayoutObserver = null;
    state.advancedLayoutTimer = null;
  }

  function cancelAdvancedScroll() {
    state.advancedScrollEpoch += 1;
    if (state.advancedScrollRafOne !== null && typeof global.cancelAnimationFrame === 'function') {
      global.cancelAnimationFrame(state.advancedScrollRafOne);
    }
    if (state.advancedScrollRafTwo !== null && typeof global.cancelAnimationFrame === 'function') {
      global.cancelAnimationFrame(state.advancedScrollRafTwo);
    }
    if (state.advancedScrollTimer !== null) global.clearTimeout(state.advancedScrollTimer);
    state.advancedScrollRafOne = null;
    state.advancedScrollRafTwo = null;
    state.advancedScrollTimer = null;
  }

  function currentHashTarget() {
    if (!global.location.hash) return null;
    try {
      return document.getElementById(decodeURIComponent(global.location.hash.slice(1)));
    } catch (error) {
      return null;
    }
  }

  function scrollAdvancedTarget(target) {
    cancelAdvancedScroll();
    var epoch = state.advancedScrollEpoch;
    var scroll = function() {
      state.advancedScrollRafTwo = null;
      state.advancedScrollTimer = null;
      if (epoch !== state.advancedScrollEpoch || !state.ready || !target.isConnected ||
          currentHashTarget() !== target) return;
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    };
    if (typeof global.requestAnimationFrame === 'function') {
      state.advancedScrollRafOne = global.requestAnimationFrame(function() {
        state.advancedScrollRafOne = null;
        if (epoch !== state.advancedScrollEpoch) return;
        state.advancedScrollRafTwo = global.requestAnimationFrame(scroll);
      });
    } else {
      state.advancedScrollTimer = global.setTimeout(scroll, 0);
    }
  }

  function resettleAfterTaskFinder(target) {
    clearAdvancedLayoutTracking();
    var finder = state.root && state.root.querySelector('[data-municipal-task-finder]');
    if (!(finder instanceof HTMLElement) || finder.dataset.municipalTaskMounted === 'true' ||
        typeof global.MutationObserver !== 'function') return;
    var finish = function() {
      clearAdvancedLayoutTracking();
      if (state.ready && target.isConnected && currentHashTarget() === target) {
        scrollAdvancedTarget(target);
      }
    };
    state.advancedLayoutObserver = new global.MutationObserver(function() {
      if (finder.dataset.municipalTaskMounted === 'true') finish();
    });
    state.advancedLayoutObserver.observe(finder, { attributes: true, childList: true, subtree: true });
    state.advancedLayoutTimer = global.setTimeout(finish, 5000);
  }

  function openManagedHashTarget(target) {
    var advanced = document.getElementById('referencia-operativa');
    if (!(advanced instanceof HTMLDetailsElement) || !(target instanceof Element)) return;
    var insideAdvanced = target === advanced || advanced.contains(target);
    var insideLearningCenter = state.root instanceof HTMLElement && target.parentElement === state.root;
    if (!insideAdvanced && !insideLearningCenter) return;
    if (insideAdvanced) advanced.open = true;
    if (!state.ready) return;
    scrollAdvancedTarget(target);
    resettleAfterTaskFinder(target);
  }

  function openCurrentAdvancedHash() {
    clearAdvancedLayoutTracking();
    cancelAdvancedScroll();
    openManagedHashTarget(currentHashTarget());
  }

  function installAdvancedRouting() {
    document.addEventListener('click', function(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target instanceof Element ? event.target.closest('a[href*="#"]') : null;
      clearAdvancedLayoutTracking();
      cancelAdvancedScroll();
      openManagedHashTarget(advancedTargetFromLink(link));
    });
    global.addEventListener('hashchange', openCurrentAdvancedHash);
    openCurrentAdvancedHash();
  }

  async function mount() {
    state.root = document.getElementById('learningCenter');
    if (!(state.root instanceof HTMLElement) || state.root.dataset.contract !== CONTRACT) return;
    state.ready = false;
    state.live = state.root.querySelector('[data-learning-live]');
    installAdvancedRouting();
    try {
      var authenticated = await Promise.resolve(global.MuniAuthReady);
      if (authenticated !== true || !global.MuniAccess ||
          typeof global.MuniAccess.getValidatedSession !== 'function') return failClosed();
      state.input = normalizeInput(global.MuniAccess.getValidatedSession());
      if (!state.input) return failClosed();
      var modules = await Promise.all([
        import(new URL('muniguia-onboarding-catalog.js', MODULE_BASE).href),
        import(new URL('contextual-help-catalog.js', MODULE_BASE).href),
      ]);
      if (!modules[0] || typeof modules[0].resolveMuniGuiaOnboarding !== 'function' ||
          !modules[1] || typeof modules[1].resolveMuniGuiaContext !== 'function') return failClosed();
      state.journey = normalizeJourney(modules[0].resolveMuniGuiaOnboarding(state.input), state.input);
      state.context = normalizeContext(modules[1].resolveMuniGuiaContext({
        role: state.input.role,
        variant: state.input.variant,
        capabilities: state.input.capabilities.slice(),
        policyVersion: state.input.policyVersion,
        pathname: global.location.pathname.toLowerCase(),
      }), modules[1], state.input);
      if (!state.journey || !state.context) return failClosed();
      state.storageKey = progressKey(state.input, state.journey);
      state.progress = readProgress();
      renderReady();
      state.ready = true;
      openCurrentAdvancedHash();
    } catch (error) {
      failClosed();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})(window);
