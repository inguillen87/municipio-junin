(function (global) {
  'use strict';

  var EXECUTIVE_VARIANT = 'executive-leadership';
  var PRIORITY_COPY = Object.freeze({
    cross_source_material_difference: Object.freeze({
      title: 'Hay diferencias entre las dos fuentes',
      detail: 'Revisalas antes de tomar una decisión administrativa.',
      action: 'Revisar diferencias'
    }),
    temporal_quarantine_present: Object.freeze({
      title: 'Hay fechas que necesitan revisión',
      detail: 'Separalas del análisis hasta confirmar el dato original.',
      action: 'Revisar fechas'
    }),
    historical_snapshot: Object.freeze({
      title: 'La información corresponde a un respaldo histórico',
      detail: 'Usá siempre la fecha indicada al comunicar una cifra.',
      action: ''
    })
  });
  var MONTHS = Object.freeze(['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']);

  function element(id) {
    return global.document.getElementById(id);
  }

  function setText(id, value) {
    var target = element(id);
    if (target) target.textContent = value;
  }

  function canNavigate(projection, capability) {
    var catalog = global.MuniNavigationCatalog;
    return Boolean(projection) && Array.isArray(projection.capabilities) &&
      catalog && Object.prototype.hasOwnProperty.call(catalog, capability) &&
      typeof catalog[capability].href === 'string' &&
      projection.capabilities.indexOf(capability) !== -1;
  }

  function routeFor(capability) {
    return global.MuniNavigationCatalog[capability].href;
  }

  function formatPeriod(value) {
    var match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value || '');
    return match ? MONTHS[Number(match[2]) - 1] + ' ' + match[1] : 'fecha no disponible';
  }

  function formatDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return 'fecha no disponible';
    return String(Number(match[3])) + ' ' + MONTHS[Number(match[2]) - 1] + ' ' + match[1];
  }

  function formatPercentage(value, fractionDigits) {
    try {
      return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
      }).format(value);
    } catch (_) {
      return Number(value).toFixed(fractionDigits).replace('.', ',');
    }
  }

  function appendAction(container, href, label, capability) {
    var link = global.document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.dataset.capability = capability;
    container.appendChild(link);
  }

  function renderActions(projection, priority) {
    var container = element('executiveSummaryActions');
    container.replaceChildren();
    if (priority && PRIORITY_COPY[priority.code] && priority.requiredCapability &&
        canNavigate(projection, priority.requiredCapability)) {
      appendAction(
        container,
        routeFor(priority.requiredCapability),
        PRIORITY_COPY[priority.code].action,
        priority.requiredCapability
      );
    } else if (canNavigate(projection, 'navigation.dashboard')) {
      appendAction(container, routeFor('navigation.dashboard'), 'Abrir panorama de personal', 'navigation.dashboard');
    }
    if (canNavigate(projection, 'navigation.ai-assistant')) {
      appendAction(container, routeFor('navigation.ai-assistant'), 'Preguntarle al asistente', 'navigation.ai-assistant');
    }
  }

  function renderBrief(projection, brief) {
    var summary = element('executiveSummary');
    var priority = brief.priorities[0];
    var copy = priority && PRIORITY_COPY[priority.code];
    if (!copy) throw new Error('EXECUTIVE_SUMMARY_PRIORITY_UNAVAILABLE');
    summary.dataset.state = brief.status === 'attention_required' ? 'attention' : 'ready';
    summary.setAttribute('aria-busy', 'false');
    setText(
      'executiveSummaryKicker',
      'Resumen para decidir · respaldo del ' + formatDate(brief.source.snapshotAsOf)
    );
    setText(
      'executiveSummaryState',
      brief.status === 'attention_required' ? 'Necesita revisión' : 'Listo para consultar'
    );
    setText('executivePriorityTitle', copy.title);
    setText('executivePriorityDetail', copy.detail);
    setText('executivePeopleValue', brief.situation.participantDisplay);
    setText('executivePeopleDetail', formatPeriod(brief.period) + ' · cálculo, no padrón actual');
    setText('executiveQualityValue', formatPercentage(brief.situation.qualityScorePct, 2) + '/100');
    setText('executiveQualityDetail', 'controles del respaldo completo');
    setText('executiveAgreementValue', formatPercentage(brief.situation.valueAgreementPct, 1) + '%');
    setText('executiveAgreementDetail', 'coincidencia entre las dos fuentes');
    renderActions(projection, priority);
  }

  function renderUnavailable(projection) {
    var summary = element('executiveSummary');
    summary.dataset.state = 'unavailable';
    summary.setAttribute('aria-busy', 'false');
    setText('executiveSummaryKicker', 'Resumen para decidir');
    setText('executiveSummaryState', 'No disponible ahora');
    setText('executivePriorityTitle', 'No pudimos actualizar el resumen');
    setText('executivePriorityDetail', 'Los accesos autorizados siguen disponibles para continuar la revisión.');
    setText('executivePeopleValue', '—');
    setText('executivePeopleDetail', 'Sin dato confirmado');
    setText('executiveQualityValue', '—');
    setText('executiveQualityDetail', 'Sin dato confirmado');
    setText('executiveAgreementValue', '—');
    setText('executiveAgreementDetail', 'Sin dato confirmado');
    renderActions(projection, null);
  }

  async function mount(projection) {
    var summary = element('executiveSummary');
    if (!summary || !projection || !projection.homeProfile ||
        projection.homeProfile.variant !== EXECUTIVE_VARIANT ||
        !canNavigate(projection, 'navigation.dashboard')) return false;
    summary.hidden = false;
    summary.dataset.state = 'loading';
    summary.setAttribute('aria-busy', 'true');
    if (!global.MuniGrhDecisionBrief || typeof global.MuniGrhDecisionBrief.load !== 'function') {
      renderUnavailable(projection);
      return false;
    }
    try {
      renderBrief(projection, await global.MuniGrhDecisionBrief.load({ timeoutMs: 8000 }));
      return true;
    } catch (_) {
      renderUnavailable(projection);
      return false;
    }
  }

  global.MuniWorkspaceExecutiveSummary = Object.freeze({ mount: mount });
}(window));
