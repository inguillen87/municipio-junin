(function installWorkspaceNextAction(global) {
  'use strict';

  var CONTRACT = 'workspace-next-action-v1';
  var MODULE_URL = (function() {
    try {
      var source = document.currentScript && document.currentScript.src;
      return new URL('municipal-task-catalog.js', source || new URL('/js/', global.location.origin)).href;
    } catch (error) {
      return '/js/municipal-task-catalog.js';
    }
  }());
  var modulePromise = null;
  var generation = 0;

  function loadCatalog() {
    if (!modulePromise) {
      modulePromise = import(MODULE_URL).catch(function() {
        modulePromise = null;
        return null;
      });
    }
    return modulePromise;
  }

  function internalHref(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      var url = new URL(value, global.location.origin);
      if (url.origin !== global.location.origin || url.username || url.password) return null;
      return url.pathname + url.search + url.hash;
    } catch (error) {
      return null;
    }
  }

  function inputFromProjection(projection) {
    if (!projection || !projection.user || !projection.homeProfile ||
        typeof projection.user.role !== 'string' || typeof projection.homeProfile.variant !== 'string' ||
        typeof projection.user.accessPolicyVersion !== 'string' || !Array.isArray(projection.capabilities)) return null;
    var capabilities = [];
    for (var index = 0; index < projection.capabilities.length; index += 1) {
      var capability = projection.capabilities[index];
      if (typeof capability !== 'string' || capabilities.indexOf(capability) !== -1) return null;
      capabilities.push(capability);
    }
    return {
      role: projection.user.role,
      variant: projection.homeProfile.variant,
      policyVersion: projection.user.accessPolicyVersion,
      capabilities: capabilities,
      published: typeof projection.user.id === 'string' &&
        projection.user.id.indexOf('published-evaluation:') === 0,
    };
  }

  function taskById(catalog, taskId) {
    return catalog.tasks.find(function(task) { return task.id === taskId; }) || null;
  }

  function firstSafeTask(catalog, input) {
    var task = null;
    if (input.published && input.capabilities.indexOf('navigation.data-quality') !== -1) {
      task = taskById(catalog, 'verify-quality');
    }
    if (!task && !input.published && input.role === 'TENANT_ADMIN' &&
        input.capabilities.indexOf('navigation.import') !== -1) {
      task = taskById(catalog, 'import-source');
    }
    if (!task) {
      for (var index = 0; index < catalog.recommendedTaskIds.length; index += 1) {
        task = taskById(catalog, catalog.recommendedTaskIds[index]);
        if (input.published && task && task.id === 'import-source') {
          task = null;
          continue;
        }
        if (task) break;
      }
    }
    if (!task && catalog.tasks.length) {
      task = catalog.tasks.find(function(candidate) {
        return !input.published || candidate.id !== 'import-source';
      }) || null;
    }
    if (!task || typeof task.id !== 'string' || typeof task.label !== 'string' ||
        typeof task.description !== 'string' || typeof task.capability !== 'string' ||
        input.capabilities.indexOf(task.capability) === -1 || !internalHref(task.href)) return null;
    return task;
  }

  function setText(root, selector, value) {
    var target = root.querySelector(selector);
    if (target) target.textContent = value;
  }

  function render(root, task, input) {
    var isGovernedIntake = !input.published && input.role === 'TENANT_ADMIN' && task.id === 'import-source';
    root.dataset.taskId = task.id;
    root.dataset.capability = task.capability;
    root.setAttribute('aria-busy', 'false');
    setText(root, '[data-workspace-next-action-kind]', isGovernedIntake ? 'Ingreso gobernado' : task.kind);
    setText(root, '[data-workspace-next-action-title]',
      isGovernedIntake ? 'Cargar y validar una fuente' : task.label);
    setText(root, '[data-workspace-next-action-copy]', isGovernedIntake
      ? 'Obtené una huella, un perfil agregado y controles básicos antes de decidir cualquier integración.'
      : task.description);
    var primary = root.querySelector('[data-workspace-next-action-primary]');
    if (!(primary instanceof HTMLAnchorElement)) return false;
    primary.href = internalHref(task.href);
    primary.dataset.capability = task.capability;
    primary.textContent = isGovernedIntake ? 'Cargar y validar una fuente' : 'Empezar';
    root.hidden = false;
    return true;
  }

  function unmount(root) {
    generation += 1;
    var target = root instanceof HTMLElement ? root : document.querySelector('[data-workspace-next-action]');
    if (!target) return;
    target.hidden = true;
    target.removeAttribute('data-task-id');
    target.removeAttribute('data-capability');
    target.setAttribute('aria-busy', 'false');
    var primary = target.querySelector('[data-workspace-next-action-primary]');
    if (primary) {
      primary.removeAttribute('href');
      primary.removeAttribute('data-capability');
    }
  }

  async function mount(projection, root) {
    var target = root instanceof HTMLElement ? root : document.querySelector('[data-workspace-next-action]');
    var input = inputFromProjection(projection);
    var currentGeneration = generation + 1;
    generation = currentGeneration;
    if (!target || !input) {
      unmount(target);
      return false;
    }
    target.hidden = true;
    target.setAttribute('aria-busy', 'true');
    var module = await loadCatalog();
    if (generation !== currentGeneration || !module ||
        typeof module.resolveMunicipalTaskCatalog !== 'function') return false;
    var catalog;
    try {
      catalog = module.resolveMunicipalTaskCatalog({
        role: input.role,
        variant: input.variant,
        policyVersion: input.policyVersion,
        capabilities: input.capabilities,
      });
    } catch (error) {
      catalog = null;
    }
    if (generation !== currentGeneration || !catalog || !Array.isArray(catalog.tasks) ||
        !Array.isArray(catalog.recommendedTaskIds)) return false;
    var task = firstSafeTask(catalog, input);
    if (!task) return false;
    return render(target, task, input);
  }

  global.MuniWorkspaceNextAction = Object.freeze({
    contract: CONTRACT,
    mount: mount,
    unmount: unmount,
  });
}(window));
