import { resolveMuniGuiaContext } from './contextual-help-catalog.js';

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const state = {
  context: null,
  currentStep: 0,
  dialog: null,
  overlay: null,
  trigger: null,
  opener: null,
  isolated: [],
  open: false,
  closing: false,
  closeTimer: null,
  elements: null,
  externalTriggers: [],
};

function ensureStylesheet() {
  const selector = 'link[data-muni-guide-asset="v1"],link[href$="css/contextual-help.css"]';
  const existing = document.querySelector(selector);
  if (existing && existing.sheet) return Promise.resolve(existing);
  const link = existing || document.createElement('link');
  return new Promise((resolve, reject) => {
    link.addEventListener('load', () => resolve(link), { once: true });
    link.addEventListener('error', () => reject(new Error('muniguia-stylesheet-unavailable')), { once: true });
    if (!existing) {
      link.rel = 'stylesheet';
      link.href = new URL('../css/contextual-help.css', import.meta.url).href;
      link.setAttribute('data-muni-guide-asset', 'v1');
      document.head.appendChild(link);
    }
  });
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (typeof text === 'string') element.textContent = text;
  return element;
}

function safeInternalHref(value) {
  return typeof value === 'string' && /^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/.test(value);
}

function visible(element) {
  if (!element || !element.isConnected || element.disabled || element.closest('[inert]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function targetVisible(element) {
  if (!element || !element.isConnected) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function currentTarget() {
  const step = state.context && state.context.page.steps[state.currentStep];
  if (!step || !/^#[A-Za-z][A-Za-z0-9_-]*$/.test(step.selector)) return null;
  try {
    const target = document.querySelector(step.selector);
    return targetVisible(target) ? target : null;
  } catch {
    return null;
  }
}

function updateTriggerState(expanded) {
  const value = expanded ? 'true' : 'false';
  if (state.trigger) state.trigger.setAttribute('aria-expanded', value);
  state.externalTriggers.forEach((trigger) => {
    if (trigger.isConnected) trigger.setAttribute('aria-expanded', value);
  });
}

function renderStep() {
  if (!state.elements || !state.context) return;
  const step = state.context.page.steps[state.currentStep];
  state.elements.progress.textContent = `Paso ${state.currentStep + 1} de ${state.context.page.steps.length}`;
  state.elements.stepTitle.textContent = step.title;
  state.elements.stepCopy.textContent = step.copy;
  state.elements.previous.disabled = state.currentStep === 0;
  state.elements.next.textContent = state.currentStep === state.context.page.steps.length - 1 ? 'Finalizar' : 'Siguiente';
  state.elements.locate.hidden = !currentTarget();
}

function ignoredNode(element) {
  return ['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT'].includes(element.tagName);
}

function isolateBackground() {
  if (state.isolated.length) return;
  const protectedElements = [state.dialog, state.overlay].filter(Boolean);
  Array.from(document.body.children).forEach((element) => {
    if (ignoredNode(element) || protectedElements.includes(element)) return;
    const usesInert = 'inert' in element;
    state.isolated.push({
      element,
      usesInert,
      hadInert: element.hasAttribute('inert'),
      inertValue: usesInert ? element.inert : null,
      hadAriaHidden: element.hasAttribute('aria-hidden'),
      ariaHidden: element.getAttribute('aria-hidden'),
    });
    if (usesInert) element.inert = true;
    else element.setAttribute('aria-hidden', 'true');
  });
}

function restoreBackground() {
  state.isolated.forEach((entry) => {
    const { element } = entry;
    if (!element || !element.isConnected) return;
    if (entry.usesInert) {
      element.inert = entry.inertValue;
      if (!entry.hadInert) element.removeAttribute('inert');
    } else if (entry.hadAriaHidden) {
      element.setAttribute('aria-hidden', entry.ariaHidden);
    } else {
      element.removeAttribute('aria-hidden');
    }
  });
  state.isolated = [];
}

function dialogControls() {
  if (!state.dialog) return [];
  return Array.from(state.dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(visible);
}

function finishClose(options = {}) {
  if (!state.dialog || !state.overlay) return;
  if (state.closeTimer) window.clearTimeout(state.closeTimer);
  state.closeTimer = null;
  state.open = false;
  state.closing = false;
  state.dialog.setAttribute('aria-hidden', 'true');
  state.dialog.hidden = true;
  state.overlay.hidden = true;
  restoreBackground();
  document.documentElement.classList.remove('muni-guide-open');
  const target = visible(state.opener) ? state.opener : state.trigger;
  state.opener = null;
  if (options.restoreFocus !== false && visible(target)) target.focus({ preventScroll: true });
  if (typeof options.afterClose === 'function') options.afterClose();
}

function closeGuide(options = {}) {
  if ((!state.open && !state.closing) || !state.dialog || !state.overlay) return;
  if (state.closing) {
    if (options.immediate === true) finishClose(options);
    return;
  }
  state.closing = true;
  state.dialog.classList.remove('is-open');
  state.overlay.classList.remove('is-open');
  updateTriggerState(false);
  if (state.closeTimer) window.clearTimeout(state.closeTimer);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || options.immediate === true) {
    finishClose(options);
  } else {
    state.closeTimer = window.setTimeout(() => finishClose(options), 220);
  }
}

function openGuide(opener) {
  if (state.open || !state.dialog || !state.overlay) return;
  if (state.closing) finishClose({ restoreFocus: false });
  if (typeof window.closeMobileSidebar === 'function') window.closeMobileSidebar();
  if (state.closeTimer) window.clearTimeout(state.closeTimer);
  state.opener = visible(opener) ? opener : state.trigger;
  state.currentStep = 0;
  renderStep();
  state.dialog.hidden = false;
  state.overlay.hidden = false;
  state.dialog.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('muni-guide-open');
  updateTriggerState(true);
  isolateBackground();
  state.closing = false;
  state.open = true;
  window.requestAnimationFrame(() => {
    state.overlay.classList.add('is-open');
    state.dialog.classList.add('is-open');
    state.elements.close.focus({ preventScroll: true });
  });
}

function locateCurrentStep() {
  const target = currentTarget();
  if (!target) return;
  closeGuide({
    afterClose: () => {
      target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      target.classList.add('muni-guide-target');
      window.setTimeout(() => target.classList.remove('muni-guide-target'), 1800);
    },
  });
}

function handleDialogKeydown(event) {
  if (!state.open || !state.dialog) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeGuide();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = dialogControls();
  if (!controls.length) {
    event.preventDefault();
    state.dialog.focus({ preventScroll: true });
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || !state.dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (document.activeElement === last || !state.dialog.contains(document.activeElement))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function linkFor(href, label, capability, className) {
  if (!safeInternalHref(href)) return null;
  const link = createElement('a', className, label);
  link.href = href;
  link.dataset.capability = capability;
  return link;
}

function buildInterface(context) {
  const trigger = createElement('button', 'muni-guide-trigger');
  trigger.type = 'button';
  trigger.id = 'muniGuideTrigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'muniGuideDialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', `Abrir MuniGuía para ${context.page.label}`);
  const triggerMark = createElement('span', 'muni-guide-trigger-mark', '?');
  triggerMark.setAttribute('aria-hidden', 'true');
  trigger.append(triggerMark, createElement('span', 'muni-guide-trigger-label', 'MuniGuía'));

  const overlay = createElement('div', 'muni-guide-overlay');
  overlay.id = 'muniGuideOverlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');

  const dialog = createElement('aside', 'muni-guide-dialog');
  dialog.id = 'muniGuideDialog';
  dialog.hidden = true;
  dialog.tabIndex = -1;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'muniGuideTitle');
  dialog.setAttribute('aria-describedby', 'muniGuideObjective');
  dialog.setAttribute('aria-hidden', 'true');
  dialog.dataset.contract = context.contract;

  const header = createElement('header', 'muni-guide-header');
  const headingGroup = createElement('div', 'muni-guide-heading');
  const eyebrow = createElement('p', 'muni-guide-eyebrow', `Ayuda contextual · ${context.role.label}`);
  const title = createElement('h2', 'muni-guide-title', context.page.label);
  title.id = 'muniGuideTitle';
  headingGroup.append(eyebrow, title);
  const close = createElement('button', 'muni-guide-close', 'Cerrar');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar MuniGuía');
  header.append(headingGroup, close);

  const objective = createElement('p', 'muni-guide-objective', context.page.objective);
  objective.id = 'muniGuideObjective';
  const roleIntent = createElement('p', 'muni-guide-role-intent', context.role.intent);
  const progress = createElement('p', 'muni-guide-progress');
  progress.setAttribute('aria-live', 'polite');
  progress.setAttribute('aria-atomic', 'true');

  const step = createElement('section', 'muni-guide-step');
  const stepTitle = createElement('h3', 'muni-guide-step-title');
  const stepCopy = createElement('p', 'muni-guide-step-copy');
  const locate = createElement('button', 'muni-guide-locate', 'Mostrar en pantalla');
  locate.type = 'button';
  step.append(stepTitle, stepCopy, locate);

  const controls = createElement('div', 'muni-guide-controls');
  const previous = createElement('button', 'muni-guide-button secondary', 'Anterior');
  previous.type = 'button';
  const next = createElement('button', 'muni-guide-button primary', 'Siguiente');
  next.type = 'button';
  controls.append(previous, next);

  const links = createElement('nav', 'muni-guide-links');
  links.setAttribute('aria-label', 'Continuar la orientación');
  const manual = linkFor(context.page.manualHref, 'Abrir procedimiento completo', 'navigation.help', 'muni-guide-link');
  if (manual) links.appendChild(manual);
  if (context.related) {
    const related = linkFor(context.related.href, `Continuar en ${context.related.label}`, context.related.capability, 'muni-guide-link related');
    if (related) links.appendChild(related);
  }

  const trust = createElement('p', 'muni-guide-trust', 'Guía local y determinista · sin IA, datos ni persistencia');
  dialog.append(header, objective, roleIntent, progress, step, controls, links, trust);
  document.body.append(trigger, overlay, dialog);

  state.trigger = trigger;
  state.overlay = overlay;
  state.dialog = dialog;
  state.elements = { close, locate, next, previous, progress, stepCopy, stepTitle };

  trigger.addEventListener('click', () => openGuide(trigger));
  close.addEventListener('click', () => closeGuide());
  overlay.addEventListener('click', () => closeGuide());
  locate.addEventListener('click', locateCurrentStep);
  previous.addEventListener('click', () => {
    if (state.currentStep > 0) state.currentStep -= 1;
    renderStep();
  });
  next.addEventListener('click', () => {
    if (state.currentStep >= context.page.steps.length - 1) {
      closeGuide();
      return;
    }
    state.currentStep += 1;
    renderStep();
  });
  document.addEventListener('keydown', handleDialogKeydown);

  state.externalTriggers = Array.from(document.querySelectorAll('[data-muniguia-open]'));
  state.externalTriggers.forEach((externalTrigger) => {
    if (externalTrigger.tagName !== 'BUTTON') return;
    externalTrigger.hidden = false;
    externalTrigger.setAttribute('aria-haspopup', 'dialog');
    externalTrigger.setAttribute('aria-controls', dialog.id);
    externalTrigger.setAttribute('aria-expanded', 'false');
    externalTrigger.addEventListener('click', () => openGuide(externalTrigger));
  });
  renderStep();
}

export async function mountMuniGuia(input) {
  const context = resolveMuniGuiaContext(input);
  if (!context) return false;
  if (state.context) return state.context.contract === context.contract && state.context.page.id === context.page.id;
  await ensureStylesheet();
  state.context = context;
  buildInterface(context);
  window.MuniGuia = Object.freeze({
    contract: context.contract,
    close: () => closeGuide(),
    closeForNavigation: () => closeGuide({ immediate: true, restoreFocus: false }),
    open: () => openGuide(state.trigger),
  });
  return true;
}
