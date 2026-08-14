(function installMunicipalTaskCenter(global) {
  'use strict';

  var CONTRACT = 'municipal-task-center-v1';
  var MODULE_URL = (function() {
    try {
      var source = document.currentScript && document.currentScript.src;
      return new URL('municipal-task-catalog.js', source || new URL('/js/', global.location.origin)).href;
    } catch (error) {
      return '/js/municipal-task-catalog.js';
    }
  })();
  var STYLESHEET_URL = (function() {
    try { return new URL('../css/task-center.css', MODULE_URL).href; } catch (error) { return '/css/task-center.css'; }
  })();
  var modulePromise = null;
  var state = {
    generation: 0,
    catalog: null,
    inputKey: null,
    dialog: null,
    dialogInput: null,
    dialogResults: null,
    dialogEmpty: null,
    activeIndex: -1,
    visibleTasks: [],
    opener: null,
    finderCleanups: [],
    triggerCleanups: [],
    createdTriggers: [],
    documentKeydown: null,
  };

  function loadCatalog() {
    if (!modulePromise) {
      modulePromise = import(MODULE_URL).catch(function() {
        modulePromise = null;
        return null;
      });
    }
    return modulePromise;
  }

  function ensureStylesheet() {
    var existing = document.querySelector('link[data-municipal-task-center-style="v1"],link[href$="/css/task-center.css"],link[href$="css/task-center.css"]');
    if (existing) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET_URL;
    link.setAttribute('data-municipal-task-center-style', 'v1');
    document.head.appendChild(link);
  }

  function exactInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var keys = Object.keys(value).sort();
    var expected = ['capabilities', 'policyVersion', 'role', 'variant'].sort();
    if (keys.length !== expected.length || !keys.every(function(key, index) { return key === expected[index]; })) return null;
    if (typeof value.role !== 'string' || typeof value.variant !== 'string' ||
        typeof value.policyVersion !== 'string' || !Array.isArray(value.capabilities)) return null;
    return {
      role: value.role,
      variant: value.variant,
      policyVersion: value.policyVersion,
      capabilities: value.capabilities.slice(),
    };
  }

  function inputKey(input) {
    return [input.role, input.variant, input.policyVersion, input.capabilities.join('|')].join('::');
  }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  }

  function taskById(id) {
    if (!state.catalog || typeof id !== 'string') return null;
    return state.catalog.tasks.find(function(task) { return task.id === id; }) || null;
  }

  function defaultTasks(mode) {
    if (!state.catalog) return [];
    if (mode === 'workspace') {
      return state.catalog.recommendedTaskIds.map(taskById).filter(Boolean).slice(0, 4);
    }
    return state.catalog.tasks.slice(0, 8);
  }

  function secondaryLink(href, label, className) {
    if (!href) return null;
    var link = createElement('a', className, label);
    link.href = href;
    return link;
  }

  function taskCard(task, mode) {
    var article = createElement('article', 'municipal-task-card');
    article.dataset.taskId = task.id;
    var header = createElement('div', 'municipal-task-card__header');
    var kind = createElement('span', 'municipal-task-card__kind', task.kind);
    var title = createElement('h3', 'municipal-task-card__title', task.label);
    header.append(kind, title);
    var description = createElement('p', 'municipal-task-card__description', task.description);
    var actions = createElement('div', 'municipal-task-card__actions');
    var start = secondaryLink(task.href, 'Empezar', 'municipal-task-card__action municipal-task-card__action--primary');
    if (start) {
      start.dataset.capability = task.capability;
      actions.appendChild(start);
    }
    if (mode === 'catalog') {
      var help = secondaryLink(task.helpHref, 'Ver guía', 'municipal-task-card__action');
      if (help) actions.appendChild(help);
    }
    if (task.assistant) {
      var assistant = secondaryLink(task.assistant.href, 'Preguntar al Asistente', 'municipal-task-card__action');
      if (assistant) actions.appendChild(assistant);
    }
    article.append(header, description, actions);
    return article;
  }

  function renderFinderResults(root, resultsRoot, empty, tasks, mode, query) {
    resultsRoot.replaceChildren();
    tasks.forEach(function(task) { resultsRoot.appendChild(taskCard(task, mode)); });
    empty.hidden = tasks.length > 0;
    empty.textContent = query
      ? 'No encontramos una tarea habilitada con esas palabras. Probá con personal, reportes, fuentes o ayuda.'
      : 'Este perfil no tiene tareas adicionales habilitadas.';
    root.dataset.resultCount = String(tasks.length);
  }

  function mountFinder(root, module) {
    if (!(root instanceof HTMLElement) || root.dataset.municipalTaskMounted === 'true') return;
    var mode = root.dataset.taskFinderMode === 'catalog' ? 'catalog' : 'workspace';
    var titleId = root.id ? root.id + 'Title' : 'municipalTaskFinderTitle';
    var inputId = root.id ? root.id + 'Search' : 'municipalTaskSearch';
    var resultsId = root.id ? root.id + 'Results' : 'municipalTaskResults';
    var header = createElement('div', 'municipal-task-finder__header');
    var heading = createElement('div');
    var eyebrow = createElement('p', 'municipal-task-finder__eyebrow', mode === 'workspace' ? 'Acción primero' : 'Catálogo por tarea');
    var title = createElement('h2', 'municipal-task-finder__title', mode === 'workspace' ? '¿Qué necesitás hacer?' : 'Encontrá una tarea y empezá');
    title.id = titleId;
    var copy = createElement('p', 'municipal-task-finder__copy', mode === 'workspace'
      ? 'Buscá con palabras simples. Sólo aparecen acciones habilitadas para tu función.'
      : 'Este buscador usa los mismos accesos de tu sesión. No cambia permisos ni consulta datos municipales.');
    heading.append(eyebrow, title, copy);
    var shortcut = createElement('button', 'municipal-task-shortcut');
    shortcut.type = 'button';
    shortcut.setAttribute('data-municipal-task-open', 'true');
    shortcut.setAttribute('aria-label', 'Abrir buscador global de tareas');
    shortcut.append(createElement('span', '', 'Buscar en cualquier pantalla'), createElement('kbd', '', 'Ctrl K'));
    header.append(heading, shortcut);

    var label = createElement('label', 'municipal-task-finder__search');
    label.htmlFor = inputId;
    label.append(createElement('span', 'sr-only', 'Buscar una tarea'));
    var input = createElement('input');
    input.id = inputId;
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Ej.: revisar un cierre, buscar un legajo, crear un reporte';
    input.setAttribute('aria-controls', resultsId);
    label.appendChild(input);
    var summary = createElement('p', 'municipal-task-finder__summary');
    summary.setAttribute('aria-live', 'polite');
    var results = createElement('div', 'municipal-task-finder__results');
    results.id = resultsId;
    var empty = createElement('p', 'municipal-task-finder__empty');
    empty.hidden = true;
    root.setAttribute('aria-labelledby', titleId);
    root.replaceChildren(header, label, summary, results, empty);
    root.dataset.municipalTaskMounted = 'true';

    function update() {
      var query = input.value.trim();
      var tasks = query
        ? module.searchMunicipalTasks(state.catalog.tasks, query, 8)
        : defaultTasks(mode);
      renderFinderResults(root, results, empty, tasks, mode, query);
      summary.textContent = query
        ? tasks.length + (tasks.length === 1 ? ' tarea encontrada.' : ' tareas encontradas.')
        : mode === 'workspace'
          ? 'Recomendadas para tu función.'
          : 'Tareas habilitadas para tu función.';
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', function(event) {
      if (event.key !== 'Escape' || !input.value) return;
      event.preventDefault();
      input.value = '';
      update();
    });
    shortcut.addEventListener('click', openPalette);
    update();
    state.finderCleanups.push(function() {
      shortcut.removeEventListener('click', openPalette);
      root.removeAttribute('aria-labelledby');
      root.removeAttribute('data-result-count');
      root.removeAttribute('data-municipal-task-mounted');
      root.replaceChildren();
    });
  }

  function paletteOption(task, index) {
    var link = createElement('a', 'municipal-task-palette__option');
    link.href = task.href;
    link.id = 'municipalTaskOption' + index;
    link.setAttribute('role', 'option');
    link.setAttribute('aria-selected', index === state.activeIndex ? 'true' : 'false');
    link.dataset.taskIndex = String(index);
    link.dataset.capability = task.capability;
    link.append(
      createElement('span', 'municipal-task-palette__kind', task.kind),
      createElement('strong', '', task.label),
      createElement('small', '', task.description),
      createElement('span', 'municipal-task-palette__go', 'Abrir')
    );
    link.addEventListener('mouseenter', function() { setActiveOption(index); });
    link.addEventListener('focus', function() { setActiveOption(index); });
    link.addEventListener('click', closePalette);
    return link;
  }

  function renderPaletteResults(module) {
    if (!state.dialogInput || !state.dialogResults || !state.catalog) return;
    var query = state.dialogInput.value.trim();
    state.visibleTasks = query
      ? module.searchMunicipalTasks(state.catalog.tasks, query, 8)
      : defaultTasks('catalog');
    state.activeIndex = state.visibleTasks.length ? 0 : -1;
    state.dialogResults.replaceChildren();
    state.visibleTasks.forEach(function(task, index) {
      state.dialogResults.appendChild(paletteOption(task, index));
    });
    state.dialogEmpty.hidden = state.visibleTasks.length > 0;
    state.dialogEmpty.textContent = 'No hay una tarea habilitada con esas palabras.';
    setActiveOption(state.activeIndex);
  }

  function setActiveOption(index) {
    if (!state.dialogResults || !state.dialogInput) return;
    var options = Array.from(state.dialogResults.querySelectorAll('[role="option"]'));
    if (!options.length || index < 0) {
      state.activeIndex = -1;
      state.dialogInput.removeAttribute('aria-activedescendant');
      return;
    }
    state.activeIndex = (index + options.length) % options.length;
    options.forEach(function(option, optionIndex) {
      option.setAttribute('aria-selected', optionIndex === state.activeIndex ? 'true' : 'false');
    });
    var active = options[state.activeIndex];
    state.dialogInput.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }

  function otherModalOpen() {
    return Array.from(document.querySelectorAll('[aria-modal="true"]')).some(function(element) {
      return element !== state.dialog && !element.hidden && element.getClientRects().length > 0;
    });
  }

  function openPalette(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (!state.dialog || !state.catalog || state.dialog.open) return;
    if (global.MuniGuia && typeof global.MuniGuia.closeForNavigation === 'function') {
      global.MuniGuia.closeForNavigation();
    }
    if (otherModalOpen()) return;
    state.opener = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement;
    state.dialog.showModal();
    state.dialogInput.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('municipal-task-palette-open');
    state.dialogInput.value = '';
    loadCatalog().then(function(module) {
      if (!module || !state.dialog || !state.dialog.open) return;
      renderPaletteResults(module);
      state.dialogInput.focus({ preventScroll: true });
    });
  }

  function markPaletteClosed() {
    document.documentElement.classList.remove('municipal-task-palette-open');
    if (state.dialogInput) {
      state.dialogInput.setAttribute('aria-expanded', 'false');
      state.dialogInput.removeAttribute('aria-activedescendant');
    }
  }

  function closePalette() {
    markPaletteClosed();
    if (state.dialog && state.dialog.open) state.dialog.close();
  }

  function afterPaletteClose() {
    markPaletteClosed();
    var opener = state.opener;
    state.opener = null;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
  }

  function buildPalette(module) {
    if (state.dialog) return;
    var dialog = createElement('dialog', 'municipal-task-palette');
    dialog.id = 'municipalTaskPalette';
    dialog.dataset.contract = CONTRACT;
    dialog.setAttribute('aria-labelledby', 'municipalTaskPaletteTitle');
    dialog.setAttribute('aria-describedby', 'municipalTaskPaletteDescription');
    var header = createElement('header', 'municipal-task-palette__header');
    var heading = createElement('div');
    var eyebrow = createElement('p', 'municipal-task-palette__eyebrow', 'Centro de acción');
    var title = createElement('h2', '', '¿Qué necesitás hacer?');
    title.id = 'municipalTaskPaletteTitle';
    var description = createElement('p', '', 'Buscá una tarea habilitada para tu función.');
    description.id = 'municipalTaskPaletteDescription';
    heading.append(eyebrow, title, description);
    var close = createElement('button', 'municipal-task-palette__close', 'Cerrar');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar buscador de tareas');
    header.append(heading, close);
    var input = createElement('input', 'municipal-task-palette__search');
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Escribí una tarea…';
    input.setAttribute('aria-label', 'Buscar una tarea');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'municipalTaskPaletteResults');
    input.setAttribute('aria-autocomplete', 'list');
    var results = createElement('div', 'municipal-task-palette__results');
    results.id = 'municipalTaskPaletteResults';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Tareas habilitadas');
    var empty = createElement('p', 'municipal-task-palette__empty');
    empty.hidden = true;
    var footer = createElement('footer', 'municipal-task-palette__footer');
    var chooseHint = createElement('span');
    chooseHint.append(createElement('kbd', '', '↑'), createElement('kbd', '', '↓'), document.createTextNode(' elegir'));
    var openHint = createElement('span');
    openHint.append(createElement('kbd', '', 'Enter'), document.createTextNode(' abrir'));
    var closeHint = createElement('span');
    closeHint.append(createElement('kbd', '', 'Esc'), document.createTextNode(' cerrar'));
    footer.append(chooseHint, openHint, closeHint);
    dialog.append(header, input, results, empty, footer);
    document.body.appendChild(dialog);
    state.dialog = dialog;
    state.dialogInput = input;
    state.dialogResults = results;
    state.dialogEmpty = empty;
    close.addEventListener('click', closePalette);
    dialog.addEventListener('cancel', markPaletteClosed);
    dialog.addEventListener('close', afterPaletteClose);
    dialog.addEventListener('click', function(event) {
      if (event.target === dialog) closePalette();
    });
    input.addEventListener('input', function() { renderPaletteResults(module); });
    input.addEventListener('keydown', function(event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveOption(state.activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveOption(state.activeIndex - 1);
      } else if (event.key === 'Enter' && state.activeIndex >= 0) {
        event.preventDefault();
        var task = state.visibleTasks[state.activeIndex];
        if (task) global.location.assign(task.href);
      }
    });
  }

  function bindTrigger(trigger) {
    if (!(trigger instanceof HTMLElement) || trigger.dataset.municipalTaskBound === 'true') return;
    trigger.dataset.municipalTaskBound = 'true';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'municipalTaskPalette');
    trigger.addEventListener('click', openPalette);
    state.triggerCleanups.push(function() {
      trigger.removeEventListener('click', openPalette);
      trigger.removeAttribute('data-municipal-task-bound');
      trigger.removeAttribute('aria-haspopup');
      trigger.removeAttribute('aria-controls');
    });
  }

  function createShellTrigger() {
    if (document.querySelector('[data-municipal-task-open]')) return;
    var host = document.querySelector('.topbar__tools') || document.querySelector('.sb-nav');
    if (!host) return;
    var button = createElement('button', 'municipal-task-shell-trigger');
    button.type = 'button';
    button.setAttribute('data-municipal-task-open', 'true');
    button.setAttribute('aria-label', 'Buscar una tarea, atajo Control K');
    button.append(createElement('span', '', 'Buscar tarea'), createElement('kbd', '', 'Ctrl K'));
    if (host.classList.contains('sb-nav')) host.insertBefore(button, host.firstChild);
    else host.insertBefore(button, host.firstChild);
    state.createdTriggers.push(button);
  }

  function bindInterface(module) {
    ensureStylesheet();
    buildPalette(module);
    createShellTrigger();
    document.querySelectorAll('[data-municipal-task-open]').forEach(bindTrigger);
    document.querySelectorAll('[data-municipal-task-finder]').forEach(function(root) {
      mountFinder(root, module);
    });
    state.documentKeydown = function(event) {
      if (event.defaultPrevented || event.altKey || event.shiftKey || event.key.toLocaleLowerCase('es-AR') !== 'k' ||
          !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      openPalette(event);
    };
    document.addEventListener('keydown', state.documentKeydown);
  }

  function unmount() {
    state.generation += 1;
    closePalette();
    if (state.documentKeydown) document.removeEventListener('keydown', state.documentKeydown);
    state.documentKeydown = null;
    state.finderCleanups.splice(0).forEach(function(cleanup) { cleanup(); });
    state.triggerCleanups.splice(0).forEach(function(cleanup) { cleanup(); });
    state.createdTriggers.splice(0).forEach(function(trigger) { if (trigger.isConnected) trigger.remove(); });
    if (state.dialog && state.dialog.isConnected) state.dialog.remove();
    state.catalog = null;
    state.inputKey = null;
    state.dialog = null;
    state.dialogInput = null;
    state.dialogResults = null;
    state.dialogEmpty = null;
    state.activeIndex = -1;
    state.visibleTasks = [];
    state.opener = null;
  }

  async function mount(rawInput) {
    var input = exactInput(rawInput);
    if (!input) return false;
    var key = inputKey(input);
    if (state.catalog && state.inputKey === key) {
      var currentModule = await loadCatalog();
      if (!currentModule) return false;
      createShellTrigger();
      document.querySelectorAll('[data-municipal-task-open]').forEach(bindTrigger);
      document.querySelectorAll('[data-municipal-task-finder]').forEach(function(root) { mountFinder(root, currentModule); });
      return true;
    }
    unmount();
    var generation = state.generation;
    var module = await loadCatalog();
    if (generation !== state.generation || !module || typeof module.resolveMunicipalTaskCatalog !== 'function') return false;
    var catalog = module.resolveMunicipalTaskCatalog(input);
    if (generation !== state.generation || !catalog) return false;
    state.catalog = catalog;
    state.inputKey = key;
    bindInterface(module);
    return true;
  }

  global.MuniTaskCenter = Object.freeze({
    contract: CONTRACT,
    mount: mount,
    open: openPalette,
    close: closePalette,
    unmount: unmount,
  });
}(window));
