(function bootstrapGrhAssistant(global) {
  'use strict';

  var EXECUTIVE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
  var ENDPOINT = '/api/ai-analyze';
  var MAX_LENGTH = 1200;
  var REQUEST_TIMEOUT_MS = 18000;
  var DIRECTORY_ENDPOINT = '/api/grh-directory';
  var DIRECTORY_SCHEMA = 'grh-directory-v1';
  var DIRECTORY_SEARCH_LIMIT = 8;
  var DIRECTORY_DEBOUNCE_MS = 280;
  var DIRECTORY_TIMEOUT_MS = 10000;
  var PRIMARY_QUERY_ORDER = {
    INTENDENTE: ['priority', 'summary', 'absence-compare', 'cost-overview'],
    CONTADOR: ['cost-overview', 'cost-components', 'calculation-control', 'reconciliation'],
    TENANT_ADMIN: ['priority', 'catalog', 'quality', 'summary'],
    SUPER_ADMIN: ['quality', 'catalog', 'summary', 'cost-overview'],
  };
  var busy = false;
  var typingNode = null;
  var directoryTimer = null;
  var directoryController = null;
  var directorySequence = 0;

  function byId(id) { return document.getElementById(id); }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function currentUser() {
    try {
      return JSON.parse(global.sessionStorage.getItem('mjunin_user') || 'null');
    } catch (_) {
      return null;
    }
  }

  function currentCapabilities() {
    var user = currentUser();
    if (!user || !Array.isArray(user.capabilities)) return [];
    return user.capabilities.filter(function(capability, index, values) {
      return typeof capability === 'string' && capability.length <= 100 &&
        /^[a-z0-9.-]+$/i.test(capability) && values.indexOf(capability) === index;
    });
  }

  function canUseExecutiveAssistant() {
    var user = currentUser();
    return Boolean(user && EXECUTIVE_ROLES.indexOf(user.role) !== -1);
  }

  function appendUserMessage(text) {
    removeWelcome();
    var row = createElement('article', 'message-row user');
    row.setAttribute('aria-label', 'Tu consulta');
    row.appendChild(createElement('div', 'message-avatar', 'VOS'));
    row.appendChild(createElement('div', 'user-bubble', text));
    appendToLog(row);
  }

  function appendTyping() {
    removeTyping();
    var row = createElement('article', 'message-row assistant');
    row.setAttribute('aria-label', 'El asistente está consultando el contrato GRH');
    row.appendChild(createElement('div', 'message-avatar', 'GRH'));
    var indicator = createElement('div', 'typing-card');
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-label', 'Consultando contrato privado');
    indicator.appendChild(document.createElement('span'));
    indicator.appendChild(document.createElement('span'));
    indicator.appendChild(document.createElement('span'));
    row.appendChild(indicator);
    typingNode = row;
    appendToLog(row);
  }

  function removeTyping() {
    if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);
    typingNode = null;
  }

  function appendAnswer(payload) {
    removeTyping();
    removeWelcome();

    var answer = payload && payload.answer;
    if (!answer || typeof answer !== 'object') {
      appendUnavailable('Respuesta no verificable', 'El servidor no devolvió un contrato de respuesta válido.', 'Fuente no disponible');
      return;
    }

    var row = createElement('article', 'message-row assistant');
    row.setAttribute('aria-label', 'Respuesta del asistente GRH');
    row.appendChild(createElement('div', 'message-avatar', 'GRH'));

    var card = createElement('div', 'answer-card');
    var header = createElement('header', 'answer-header');
    var headingLine = createElement('div', 'answer-heading-line');
    headingLine.appendChild(createElement('h3', '', answer.title || 'Respuesta GRH'));
    var state = createElement('span', 'answer-state ' + safeState(payload.status), stateLabel(payload.status));
    headingLine.appendChild(state);
    header.appendChild(headingLine);
    header.appendChild(createElement('p', 'answer-summary', answer.summary || 'Sin resumen verificable.'));
    card.appendChild(header);

    var body = createElement('div', 'answer-body');
    appendAnswerActions(body, answer.actions);
    appendAnswerVisual(body, answer.visual);
    var detailsContent = createElement('div', 'answer-details-content');
    var findings = safeArray(answer.findings);
    if (findings.length) {
      var list = createElement('ul', 'finding-list');
      findings.forEach(function(finding) { list.appendChild(createElement('li', '', finding)); });
      var findingsSection = createElement('section', 'answer-findings');
      findingsSection.appendChild(createElement('h4', '', 'Hallazgos'));
      findingsSection.appendChild(list);
      detailsContent.appendChild(findingsSection);
    }

    var evidence = safeArray(answer.evidence);
    if (evidence.length) {
      var evidenceGrid = createElement('div', 'evidence-grid');
      evidence.slice(0, 8).forEach(function(item) {
        if (!item || typeof item !== 'object') return;
        var evidenceItem = createElement('div', 'evidence-item');
        evidenceItem.appendChild(createElement('span', 'evidence-label', item.label || 'Métrica'));
        evidenceItem.appendChild(createElement('strong', 'evidence-value', item.value || 'Sin dato'));
        if (item.detail) evidenceItem.appendChild(createElement('span', 'evidence-detail', item.detail));
        evidenceGrid.appendChild(evidenceItem);
      });
      body.appendChild(evidenceGrid);
    }

    appendDirectoryContract(body, answer.directory);

    var caveats = safeArray(answer.caveats);
    if (caveats.length) {
      var limits = createElement('section', 'answer-limits');
      limits.appendChild(createElement('strong', '', 'Límites de lectura'));
      caveats.forEach(function(caveat) { limits.appendChild(createElement('p', '', caveat)); });
      detailsContent.appendChild(limits);
    }

    if (detailsContent.childElementCount) {
      var details = createElement('details', 'answer-details');
      details.appendChild(createElement('summary', '', 'Evidencia y límites'));
      details.appendChild(detailsContent);
      body.appendChild(details);
    }

    if (answer.source) body.appendChild(createElement('p', 'answer-source', answer.source));
    card.appendChild(body);
    var stack = createElement('div', 'answer-stack');
    stack.appendChild(card);
    appendNextQuestions(stack, answer.nextQuestions);
    row.appendChild(stack);
    appendToLog(row, 'start');
    updateProvenance(payload.provenance);
    setSourceStatus(
      'verified',
      payload.status === 'answered' ? 'Corte GRH verificado' : 'Corte GRH consultado'
    );
  }

  function exactObjectKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var actual = Object.keys(value).sort();
    var keys = expected.slice().sort();
    return actual.length === keys.length && actual.every(function(key, index) { return key === keys[index]; });
  }

  function safeText(value, maximum, nullable) {
    if (nullable && value === null) return true;
    return typeof value === 'string' && value === value.trim() && value.length > 0 &&
      value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
  }

  function validAnswerVisual(value) {
    if (!exactObjectKeys(value, [
      'schemaVersion', 'kind', 'title', 'subtitle', 'order', 'unit', 'scaleMax', 'items'
    ]) || value.schemaVersion !== 'grh-answer-visual-v1' || value.kind !== 'bar' ||
        !safeText(value.title, 160, false) || !safeText(value.subtitle, 240, false) ||
        !['ranked', 'chronological', 'defined'].includes(value.order) ||
        !['participants', 'records', 'rows', 'percent', 'source_currency_cents'].includes(value.unit) ||
        !Number.isFinite(value.scaleMax) || value.scaleMax <= 0 ||
        (value.unit !== 'percent' && !Number.isSafeInteger(value.scaleMax)) ||
        !Array.isArray(value.items) || value.items.length < 2 || value.items.length > 13) return false;

    var labels = new Set();
    var previous = Number.POSITIVE_INFINITY;
    var maximum = 0;
    var valid = value.items.every(function(item) {
      if (!exactObjectKeys(item, ['label', 'value', 'displayValue']) ||
          !safeText(item.label, 120, false) || !Number.isFinite(item.value) || item.value < 0 ||
          (value.unit === 'percent' ? item.value > 100 : !Number.isSafeInteger(item.value)) ||
          item.value > value.scaleMax || !safeText(item.displayValue, 64, false) || labels.has(item.label)) return false;
      if (value.order === 'ranked' && item.value > previous) return false;
      labels.add(item.label);
      maximum = Math.max(maximum, item.value);
      previous = item.value;
      return true;
    });
    return valid && maximum > 0 && value.scaleMax >= maximum;
  }

  function appendAnswerVisual(body, visual) {
    if (!validAnswerVisual(visual)) return;
    var figure = createElement('figure', 'answer-visual');
    figure.setAttribute('aria-label', visual.title);
    figure.dataset.schemaVersion = visual.schemaVersion;
    figure.dataset.order = visual.order;

    var caption = createElement('figcaption', 'answer-visual-header');
    caption.appendChild(createElement('h4', '', visual.title));
    caption.appendChild(createElement('p', '', visual.subtitle));
    figure.appendChild(caption);

    var list = createElement('div', 'answer-visual-list');
    list.setAttribute('role', 'list');
    visual.items.forEach(function(item) {
      var visualRow = createElement('div', 'answer-visual-row');
      visualRow.setAttribute('role', 'listitem');
      visualRow.setAttribute('aria-label', item.label + ': ' + item.displayValue);

      var labels = createElement('div', 'answer-visual-labels');
      labels.appendChild(createElement('span', 'answer-visual-label', item.label));
      labels.appendChild(createElement('strong', 'answer-visual-value', item.displayValue));
      visualRow.appendChild(labels);

      var track = createElement('div', 'answer-visual-track');
      track.setAttribute('aria-hidden', 'true');
      var fill = createElement('span', 'answer-visual-fill');
      if (item.value === 0) fill.classList.add('is-zero');
      fill.style.width = Math.max(0, Math.min(100, item.value / visual.scaleMax * 100)) + '%';
      track.appendChild(fill);
      visualRow.appendChild(track);
      list.appendChild(visualRow);
    });
    figure.appendChild(list);
    figure.appendChild(createElement('p', 'answer-visual-scale', answerVisualScaleLabel(visual)));
    body.appendChild(figure);
  }

  function answerVisualScaleLabel(visual) {
    if (visual.unit === 'percent') return 'Escala 0–100 %';
    if (visual.unit === 'source_currency_cents') {
      return 'Barras desde cero · unidad de control indicada en cada valor';
    }
    var labels = { participants: 'participantes', records: 'registros', rows: 'filas' };
    var formatted = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(visual.scaleMax);
    return 'Escala 0–' + formatted + ' ' + labels[visual.unit];
  }

  function validAnswerTextList(value, maximumItems, maximumLength) {
    if (!Array.isArray(value) || value.length > maximumItems) return [];
    var seen = new Set();
    return value.filter(function(item) {
      if (!safeText(item, maximumLength, false) || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }

  function appendNextQuestions(container, rawQuestions) {
    var questions = validAnswerTextList(rawQuestions, 3, 300);
    if (!questions.length) return;
    var section = createElement('section', 'answer-followups');
    section.setAttribute('aria-label', 'Preguntas siguientes');
    section.appendChild(createElement('p', 'answer-followups-label', 'Seguir analizando'));
    var chips = createElement('div', 'answer-followups-list');
    questions.forEach(function(question) {
      var button = createElement('button', 'answer-followup', question);
      button.type = 'button';
      button.dataset.followUpQuestion = question;
      chips.appendChild(button);
    });
    section.appendChild(chips);
    container.appendChild(section);
  }

  function appendUnavailable(title, detail, sourceStatusText) {
    removeTyping();
    removeWelcome();

    var row = createElement('article', 'message-row assistant');
    row.setAttribute('aria-label', 'Fuente GRH no disponible');
    row.appendChild(createElement('div', 'message-avatar', 'GRH'));

    var card = createElement('div', 'answer-card');
    var header = createElement('header', 'answer-header');
    var headingLine = createElement('div', 'answer-heading-line');
    headingLine.appendChild(createElement('h3', '', title));
    headingLine.appendChild(createElement('span', 'answer-state refused', 'No disponible'));
    header.appendChild(headingLine);
    header.appendChild(createElement('p', 'answer-summary', detail));
    card.appendChild(header);

    var body = createElement('div', 'answer-body');
    var limits = createElement('section', 'answer-limits');
    limits.appendChild(createElement('strong', '', 'Respuesta bloqueada'));
    limits.appendChild(createElement('p', '', 'No se usaron cifras demo, caché pública ni un proveedor externo como reemplazo.'));
    body.appendChild(limits);
    card.appendChild(body);
    row.appendChild(card);
    appendToLog(row, 'start');
    if (sourceStatusText) setSourceStatus('error', sourceStatusText);
  }

  function appendToLog(node, alignment) {
    var log = byId('conversationLog');
    if (!log) return;
    log.appendChild(node);
    global.requestAnimationFrame(function() {
      if (alignment === 'start') {
        log.scrollTop = Math.max(0, node.offsetTop - 10);
        global.scrollTo({ top: 0, left: global.scrollX, behavior: 'auto' });
      } else {
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  function removeWelcome() {
    var welcome = byId('welcomeCard');
    if (welcome && welcome.parentNode) welcome.parentNode.removeChild(welcome);
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value.filter(function(item) { return item !== null && item !== undefined; })
      : [];
  }

  function appendDirectoryContract(body, directory) {
    if (!directory || typeof directory !== 'object') return;
    if (directory.status === 'matched' && directory.person && typeof directory.person === 'object') {
      appendLeaveHistory(body, directory.person.leaveHistory);
      return;
    }
    if (directory.status !== 'multiple_matches') return;
    var options = safeArray(directory.options).slice(0, 6);
    if (!options.length) return;
    var list = createElement('div', 'directory-options');
    options.forEach(function(option) {
      if (!option || typeof option !== 'object' || !positiveInteger(option.companyCode) || !positiveInteger(option.legajo)) return;
      var href = '/rrhh?company=' + encodeURIComponent(option.companyCode) + '&legajo=' + encodeURIComponent(option.legajo) + '#peopleDirectory';
      var link = createElement('a', 'directory-option');
      link.href = href;
      link.appendChild(createElement('strong', '', option.displayName || ('Legajo ' + option.legajo)));
      var context = ['Legajo ' + option.legajo, dimensionLabel(option.sector), dimensionLabel(option.organization)].filter(Boolean).join(' · ');
      link.appendChild(createElement('span', '', context));
      list.appendChild(link);
    });
    if (list.childElementCount) body.appendChild(list);
  }

  function appendLeaveHistory(body, leaveHistory) {
    if (!leaveHistory || typeof leaveHistory !== 'object') return;
    var events = safeArray(leaveHistory.items).slice(0, 24);
    if (!events.length) return;
    var section = createElement('section', 'directory-history');
    section.appendChild(createElement('h4', '', 'Licencias históricas · ' + String(leaveHistory.total || events.length)));
    var grid = createElement('div', 'directory-history-grid');
    events.forEach(function(event) {
      if (!event || typeof event !== 'object' || !dateValue(event.startDate)) return;
      var item = createElement('div', 'directory-history-item');
      var range = event.startDate + (dateValue(event.endDate) ? ' → ' + event.endDate : '');
      item.appendChild(createElement('strong', '', range));
      item.appendChild(createElement('span', '', Number.isSafeInteger(event.days) ? event.days + ' días' : 'Duración no informada'));
      grid.appendChild(item);
    });
    if (!grid.childElementCount) return;
    section.appendChild(grid);
    body.appendChild(section);
  }

  function appendAnswerActions(body, actions) {
    var validActions = safeArray(actions).slice(0, 4);
    if (!validActions.length) return;
    var section = createElement('section', 'answer-next-step');
    section.setAttribute('aria-label', 'Próximo paso');
    section.appendChild(createElement('h4', '', 'Próximo paso'));
    var row = createElement('div', 'answer-actions');
    row.setAttribute('aria-label', 'Próximo paso');
    var capabilities = currentCapabilities();
    validActions.forEach(function(action) {
      if (!action || typeof action !== 'object') return;
      var href = safeInternalHref(action.href);
      if (!href || typeof action.label !== 'string' || !action.label.trim()) return;
      var requiredCapability = action.requiredCapability;
      if (requiredCapability !== undefined &&
          (typeof requiredCapability !== 'string' ||
            !/^[a-z0-9.-]{1,100}$/i.test(requiredCapability) ||
            capabilities.indexOf(requiredCapability) === -1)) return;
      var link = createElement('a', 'answer-action' + (row.childElementCount === 0 ? ' answer-action--primary' : ''), action.label.trim());
      link.href = href;
      if (requiredCapability) link.dataset.capability = requiredCapability;
      row.appendChild(link);
    });
    if (row.childElementCount) {
      section.appendChild(row);
      body.appendChild(section);
    }
  }

  function safeInternalHref(value) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 500) return null;
    try {
      var parsed = new URL(value, global.location.origin);
      return parsed.origin === global.location.origin ? value : null;
    } catch (_) {
      return null;
    }
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function dateValue(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function dimensionLabel(value) {
    return value && typeof value === 'object' && typeof value.label === 'string' ? value.label : '';
  }

  function validDirectoryDate(value) {
    return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  }

  function validDirectoryDimension(value) {
    return value === null || (
      exactObjectKeys(value, ['code', 'label']) && Number.isSafeInteger(value.code) && value.code >= 0 &&
      safeText(value.label, 200, true)
    );
  }

  function validDirectoryRelation(value) {
    return value === null || (
      exactObjectKeys(value, ['code', 'label']) && Number.isSafeInteger(value.code) && value.code > 0 &&
      safeText(value.label, 200, true)
    );
  }

  function validDirectoryPosition(value) {
    return value === null || (
      exactObjectKeys(value, ['code', 'label', 'parent', 'dependsOn']) &&
      Number.isSafeInteger(value.code) && value.code >= 0 && safeText(value.label, 200, true) &&
      validDirectoryRelation(value.parent) && validDirectoryRelation(value.dependsOn)
    );
  }

  function validDirectoryPositionObservation(value, snapshotAsOf) {
    if (value === null) return true;
    if (!exactObjectKeys(value, ['label', 'observedDate', 'observedPeriod', 'status', 'sourceTable']) ||
        !safeText(value.label, 200, false) || !validDirectoryDate(value.observedDate) || value.observedDate === null ||
        typeof value.observedPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(value.observedPeriod) ||
        value.observedDate.slice(0, 7) !== value.observedPeriod ||
        !['historical_observation', 'source_future_effective'].includes(value.status) ||
        value.sourceTable !== 'histolegajo') return false;
    return value.status === 'source_future_effective'
      ? value.observedDate > snapshotAsOf
      : value.observedDate <= snapshotAsOf;
  }

  function validDirectoryEvents(value, snapshotAsOf) {
    if (!exactObjectKeys(value, [
      'absenceCount', 'latestAbsenceDate', 'leaveCount', 'latestLeaveStartDate', 'latestLeaveEndDate'
    ]) || !Number.isSafeInteger(value.absenceCount) || value.absenceCount < 0 ||
        !Number.isSafeInteger(value.leaveCount) || value.leaveCount < 0) return false;
    return ['latestAbsenceDate', 'latestLeaveStartDate', 'latestLeaveEndDate'].every(function(key) {
      return validDirectoryDate(value[key]) && (value[key] === null || value[key] <= snapshotAsOf);
    }) && (value.latestLeaveStartDate === null || value.latestLeaveEndDate === null ||
      value.latestLeaveEndDate >= value.latestLeaveStartDate);
  }

  function validDirectoryItem(item, snapshotAsOf) {
    return exactObjectKeys(item, [
      'companyCode', 'legajo', 'displayName', 'sector', 'organization', 'position', 'positionObservation',
      'category', 'agreement', 'events'
    ]) && Number.isSafeInteger(item.companyCode) && item.companyCode > 0 &&
      Number.isSafeInteger(item.legajo) && item.legajo > 0 && safeText(item.displayName, 200, true) &&
      validDirectoryDimension(item.sector) && validDirectoryDimension(item.organization) &&
      validDirectoryPosition(item.position) &&
      validDirectoryPositionObservation(item.positionObservation, snapshotAsOf) &&
      validDirectoryDimension(item.category) && validDirectoryDimension(item.agreement) &&
      validDirectoryEvents(item.events, snapshotAsOf);
  }

  function validDirectoryFacetRow(row, name) {
    var keys = name === 'categories' ? ['agreementCode', 'code', 'label', 'count'] :
      name === 'positionObservations' ? ['label', 'count', 'status'] : ['code', 'label', 'count'];
    if (!exactObjectKeys(row, keys) || !Number.isSafeInteger(row.count) || row.count < 1) return false;
    if (name === 'positionObservations') {
      return safeText(row.label, 200, false) &&
        ['historical_observation', 'source_future_effective'].includes(row.status);
    }
    return Number.isSafeInteger(row.code) && row.code >= 0 && safeText(row.label, 200, true) &&
      (name !== 'categories' || (Number.isSafeInteger(row.agreementCode) && row.agreementCode >= 0));
  }

  function validDirectoryFacets(value) {
    var names = ['sectors', 'organizations', 'positions', 'positionObservations', 'categories', 'agreements'];
    if (!exactObjectKeys(value, names)) return false;
    return names.every(function(name) {
      if (!Array.isArray(value[name]) || value[name].length > 5000) return false;
      var seen = new Set();
      return value[name].every(function(row) {
        var key = name === 'categories' ? String(row && row.agreementCode) + ':' + String(row && row.code) :
          name === 'positionObservations' ? String(row && row.status) + ':' + String(row && row.label) :
            String(row && row.code);
        if (!validDirectoryFacetRow(row, name) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }

  function validDirectoryListResponse(payload) {
    if (!exactObjectKeys(payload, ['schemaVersion', 'source', 'privacy', 'query', 'facets', 'items']) ||
        payload.schemaVersion !== DIRECTORY_SCHEMA) return false;
    var source = payload.source;
    if (!exactObjectKeys(source, ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf']) ||
        !safeText(source.canonicalSystem, 100, false) || !safeText(source.sourceFile, 260, false) ||
        !source.sourceFile.endsWith('.sql.gz') || !/^[0-9a-f]{64}$/.test(source.sourceSha256) ||
        !validDirectoryDate(source.snapshotAsOf) || source.snapshotAsOf === null) return false;
    if (!exactObjectKeys(payload.privacy, ['containsPersonalData', 'excludedFields']) ||
        payload.privacy.containsPersonalData !== true || !Array.isArray(payload.privacy.excludedFields) ||
        payload.privacy.excludedFields.join('|') !== 'dni|cuil|contact|address|bank_account|salary|event_cause') return false;
    var query = payload.query;
    if (!exactObjectKeys(query, ['mode', 'page', 'limit', 'total', 'hasNext', 'cursor', 'nextCursor']) ||
        query.mode !== 'list' || query.page !== 1 || query.limit !== DIRECTORY_SEARCH_LIMIT ||
        !Number.isSafeInteger(query.total) || query.total < 0 || typeof query.hasNext !== 'boolean' ||
        query.cursor !== null || (query.nextCursor !== null && (!safeText(query.nextCursor, 512, false))) ||
        Boolean(query.nextCursor) !== query.hasNext || !validDirectoryFacets(payload.facets) ||
        !Array.isArray(payload.items) || payload.items.length > DIRECTORY_SEARCH_LIMIT) return false;
    var identities = new Set();
    return payload.items.every(function(item) {
      var identity = String(item && item.companyCode) + ':' + String(item && item.legajo);
      if (!validDirectoryItem(item, source.snapshotAsOf) || identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });
  }

  function clearDirectorySearch() {
    if (directoryTimer) global.clearTimeout(directoryTimer);
    directoryTimer = null;
    if (directoryController) directoryController.abort();
    directoryController = null;
    directorySequence += 1;
  }

  function clearPersonResults() {
    var results = byId('personSearchResults');
    if (results) while (results.firstChild) results.removeChild(results.firstChild);
  }

  function setPersonSearchStatus(message) {
    var status = byId('personSearchStatus');
    if (status) status.textContent = message;
  }

  function openPersonSearch() {
    var panel = byId('personSearchPanel');
    var input = byId('personSearchInput');
    var more = byId('queryMore');
    if (!panel || !input) return;
    if (more) more.open = false;
    panel.hidden = false;
    if (!input.disabled) {
      setPersonSearchStatus('Escribí al menos 2 caracteres para consultar el directorio privado.');
      input.focus({ preventScroll: true });
    }
  }

  function closePersonSearch() {
    clearDirectorySearch();
    clearPersonResults();
    var panel = byId('personSearchPanel');
    var input = byId('personSearchInput');
    if (panel) panel.hidden = true;
    if (input && !input.disabled) input.value = '';
  }

  function restorePersonSearchFocus(suggestions) {
    var trigger = suggestions && suggestions.querySelector('[data-person-lookup]');
    var more = byId('queryMore');
    if (trigger && more && more.contains(trigger) && !more.open) {
      var summary = byId('queryMoreSummary');
      if (summary) summary.focus({ preventScroll: true });
      return;
    }
    if (trigger) trigger.focus({ preventScroll: true });
  }

  function showDirectoryDenied() {
    clearPersonResults();
    var badge = byId('personAccessBadge');
    var input = byId('personSearchInput');
    var denied = byId('personSearchDenied');
    if (badge) {
      badge.textContent = 'Vista pública / acceso nominal requerido';
      badge.classList.add('denied');
    }
    if (input) {
      input.value = '';
      input.disabled = true;
    }
    if (denied) denied.hidden = false;
    setPersonSearchStatus('El perfil actual no puede consultar nombres ni fichas individuales.');
  }

  function personResultContext(item) {
    var position = dimensionLabel(item.position) || dimensionLabel(item.positionObservation);
    return [
      'Legajo ' + item.legajo,
      dimensionLabel(item.sector),
      dimensionLabel(item.organization),
      position,
    ].filter(Boolean).join(' · ');
  }

  function submitPersonLookup(item) {
    if (!item || !positiveInteger(item.legajo) || busy) return;
    closePersonSearch();
    var input = byId('assistantInput');
    var form = byId('assistantForm');
    if (!input || !form) return;
    input.value = 'Licencias del legajo ' + item.legajo;
    resizeInput(input);
    form.requestSubmit();
  }

  function renderPersonResults(payload) {
    clearPersonResults();
    var results = byId('personSearchResults');
    var badge = byId('personAccessBadge');
    var denied = byId('personSearchDenied');
    var namedItems = payload.items.filter(function(item) { return safeText(item.displayName, 200, false); });
    if (badge) {
      badge.textContent = 'Acceso nominal verificado';
      badge.classList.remove('denied');
    }
    if (denied) denied.hidden = true;
    if (!namedItems.length) {
      setPersonSearchStatus('No hay coincidencias nominales para esta búsqueda.');
      return;
    }
    namedItems.forEach(function(item) {
      var button = createElement('button', 'person-search-result');
      button.type = 'button';
      button.setAttribute('role', 'listitem');
      button.appendChild(createElement('strong', '', item.displayName));
      button.appendChild(createElement('span', '', personResultContext(item)));
      button.addEventListener('click', function() { submitPersonLookup(item); });
      results.appendChild(button);
    });
    var prefix = payload.query.total > namedItems.length
      ? 'Mostrando ' + namedItems.length + ' de ' + payload.query.total + ' coincidencias.'
      : namedItems.length + (namedItems.length === 1 ? ' coincidencia.' : ' coincidencias.');
    setPersonSearchStatus(prefix + ' Seleccioná una persona para consultar sus licencias.');
  }

  async function searchPeople(rawQuery, sequence) {
    if (!await requirePageCapability() || sequence !== directorySequence) return;
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      setPersonSearchStatus('No se pudo abrir el canal autenticado del directorio.');
      return;
    }
    directoryController = new AbortController();
    var controller = directoryController;
    var timeout = global.setTimeout(function() { controller.abort(); }, DIRECTORY_TIMEOUT_MS);
    try {
      var parameters = new URLSearchParams({ search: rawQuery, limit: String(DIRECTORY_SEARCH_LIMIT) });
      var response = await global.MuniAuth.fetch(DIRECTORY_ENDPOINT + '?' + parameters.toString(), {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'X-MuniControl-Purpose': 'DIRECTORY_BROWSE',
        },
        signal: controller.signal,
      });
      if (sequence !== directorySequence) return;
      if (response.status === 403) {
        showDirectoryDenied();
        return;
      }
      if (!response.ok || response.headers.get('x-municontrol-contract') !== DIRECTORY_SCHEMA ||
          !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) {
        throw new Error('GRH_DIRECTORY_UNAVAILABLE');
      }
      var payload = await response.json();
      if (sequence !== directorySequence) return;
      if (!validDirectoryListResponse(payload)) throw new Error('GRH_DIRECTORY_RESPONSE_INVALID');
      renderPersonResults(payload);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (global.MuniAuth && global.MuniAuth.isAuthError && global.MuniAuth.isAuthError(error)) return;
      clearPersonResults();
      setPersonSearchStatus('No se pudo verificar el directorio. Intentá nuevamente.');
    } finally {
      global.clearTimeout(timeout);
      if (directoryController === controller) directoryController = null;
    }
  }

  function schedulePersonSearch(value) {
    clearDirectorySearch();
    clearPersonResults();
    var query = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (query.length < 2) {
      setPersonSearchStatus('Escribí al menos 2 caracteres para iniciar la búsqueda.');
      return;
    }
    if (query.length > 80) {
      setPersonSearchStatus('La búsqueda admite hasta 80 caracteres.');
      return;
    }
    var sequence = directorySequence;
    setPersonSearchStatus('Consultando el directorio privado…');
    directoryTimer = global.setTimeout(function() {
      directoryTimer = null;
      searchPeople(query, sequence);
    }, DIRECTORY_DEBOUNCE_MS);
  }

  function safeState(value) {
    return ['answered', 'limited', 'unsupported', 'refused'].indexOf(value) !== -1 ? value : 'answered';
  }

  function stateLabel(value) {
    var labels = {
      answered: 'Respuesta verificada',
      limited: 'Datos parciales',
      unsupported: 'No disponible',
      refused: 'No disponible para este perfil',
    };
    return labels[value] || labels.answered;
  }

  function setSourceStatus(state, text) {
    var status = byId('assistantSourceStatus');
    if (!status) return;
    status.dataset.state = state;
    var label = status.querySelector('span');
    if (label) label.textContent = text;
    else status.textContent = text;
  }

  function configureRoleChip(user) {
    var chip = byId('assistantRoleChip');
    if (!chip || !user) return;
    var labels = {
      INTENDENTE: 'Intendencia',
      CONTADOR: 'Contaduría',
      TENANT_ADMIN: 'Administración municipal',
      SUPER_ADMIN: 'Gobierno de plataforma',
    };
    chip.textContent = labels[user.role] || 'Perfil ejecutivo';
  }

  function updateProvenance(provenance) {
    if (!provenance || typeof provenance !== 'object') return;
    var snapshot = byId('snapshotStatus');
    var period = byId('periodStatus');
    if (snapshot && /^\d{4}-\d{2}-\d{2}$/.test(provenance.snapshotAsOf || '')) {
      snapshot.textContent = provenance.snapshotAsOf + ' · snapshot histórico';
      activateTrustDot('snapshotDot');
    }
    if (period && /^\d{4}-\d{2}$/.test(provenance.latestValidCalculationPeriod || '')) {
      period.textContent = provenance.latestValidCalculationPeriod + ' · último válido';
      activateTrustDot('periodDot');
    }
  }

  function activateTrustDot(id) {
    var dot = byId(id);
    if (dot) dot.classList.remove('pending');
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    var submit = byId('sendQuery');
    var input = byId('assistantInput');
    var suggestions = byId('querySuggestions');
    var more = byId('queryMore');
    if (submit) submit.disabled = nextBusy;
    if (input) input.setAttribute('aria-busy', nextBusy ? 'true' : 'false');
    if (nextBusy) setSourceStatus('busy', 'Consultando GRH…');
    if (more) {
      if (nextBusy) more.open = false;
      more.inert = nextBusy;
    }
    if (suggestions) {
      suggestions.setAttribute('aria-busy', nextBusy ? 'true' : 'false');
      suggestions.querySelectorAll('[data-question], [data-person-lookup]').forEach(function(button) {
        button.disabled = nextBusy || button.hidden;
      });
    }
    document.querySelectorAll('.answer-followup, .person-search-result').forEach(function(button) {
      button.disabled = nextBusy;
    });
  }

  function redirectToSafeWorkspace() {
    try {
      if (!global.sessionStorage.getItem('mjunin_access_notice')) {
        global.sessionStorage.setItem('mjunin_access_notice', 'El perfil actual no tiene habilitada la superficie solicitada.');
      }
    } catch (_) {}
    var currentPage = global.location.pathname.split('/').pop() || '';
    if (currentPage !== 'inicio.html') global.location.replace('inicio.html');
  }

  async function requirePageCapability() {
    if (typeof global.requireCapability !== 'function') {
      redirectToSafeWorkspace();
      return false;
    }
    try {
      var allowed = await global.requireCapability('navigation.ai-assistant');
      if (allowed !== true) {
        if (allowed !== false) redirectToSafeWorkspace();
        return false;
      }
      return true;
    } catch (_) {
      redirectToSafeWorkspace();
      return false;
    }
  }

  async function ask(question) {
    if (busy) return;
    if (!await requirePageCapability()) return;
    var text = String(question || '').trim();
    if (!text) {
      var emptyInput = byId('assistantInput');
      if (emptyInput) emptyInput.focus();
      return;
    }
    if (text.length > MAX_LENGTH) {
      appendUnavailable('Consulta demasiado extensa', 'Reducí la consulta a 1200 caracteres o menos.');
      return;
    }
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      appendUnavailable('Sesión no verificable', 'No se pudo iniciar el canal autenticado del asistente.', 'Fuente no disponible');
      return;
    }

    appendUserMessage(text);
    appendTyping();
    setBusy(true);

    var controller = new AbortController();
    var timeout = global.setTimeout(function() { controller.abort(); }, REQUEST_TIMEOUT_MS);

    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-MuniControl-Purpose': questionPurpose(text),
        },
        body: JSON.stringify({ message: text, mode: 'deterministic' }),
        signal: controller.signal,
      });

      var contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('INVALID_RESPONSE_TYPE');
      }
      var payload = await response.json();

      if (payload && payload.answer) {
        appendAnswer(payload);
      } else if (response.status === 503) {
        appendUnavailable('Contrato GRH no disponible', payload.error || 'No se pudo leer el artefacto privado para este municipio.', 'Fuente no disponible');
      } else if (response.status === 403) {
        appendUnavailable('Acceso no habilitado', 'Tu perfil o municipio no está autorizado para consultar este contrato GRH.', 'No disponible para este perfil');
      } else {
        appendUnavailable('Consulta no procesada', payload.error || 'No existe una respuesta verificable para esta consulta.', 'Fuente no disponible');
      }
    } catch (error) {
      if (global.MuniAuth && global.MuniAuth.isAuthError && global.MuniAuth.isAuthError(error)) return;
      var detail = error && error.name === 'AbortError'
        ? 'La validación del contrato excedió el tiempo disponible. Intentá nuevamente.'
        : 'No se pudo verificar el contrato GRH. La respuesta quedó bloqueada.';
      appendUnavailable('Fuente no verificada', detail, 'Fuente no disponible');
    } finally {
      global.clearTimeout(timeout);
      setBusy(false);
      var input = byId('assistantInput');
      if (input) input.focus();
    }
  }

  function normalizedQuestion(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function isPersonLookupQuestion(value) {
    var raw = String(value || '').trim();
    var normalized = normalizedQuestion(raw);
    if (/\blegajo\s*(?:(?:n|nro|numero)\s*)?\d+\b/.test(normalized) ||
        /\b(?:ficha|historial(?: de licencias)?)\s+(?:personal |laboral )?(?:de|del)\s+(?!(?:licencias?|municipio|personal|organismo|area|sector|periodo|ano|historicas?)\b)(?:(?:empleado|agente|concejal)\b|(?:[a-z][a-z'-]{1,}\s+){1,3}[a-z][a-z'-]{1,}\b)/.test(normalized) ||
        /\blicencias?\s+(?:de|del)\s+(?!(?:19|20)\d{2}\b)(?:un(?:a)?\s+)?(?:empleado|agente|concejal|[a-z][a-z'-]{1,}(?:\s+[a-z][a-z'-]{1,}){1,3})\b/.test(normalized) ||
        /\b(?:empleado|agente|concejal)\s+(?:llamad[oa]\s+)?[a-z][a-z'-]{1,}(?:\s+[a-z][a-z'-]{1,}){1,3}\b/.test(normalized) ||
        /^(?:[a-z][a-z'-]{1,}\s+){1,4}(?:concejal|empleado|agente)$/.test(normalized)) {
      return true;
    }
    if (/^(?:personas?(?: y)? estructura|asistencia(?: y)? tiempo|licencias?(?: y)? salud(?: laboral)?|carrera(?: y)? desarrollo|relaciones? laborales?|nomina(?: y)? control(?: de calculo)?|beneficios?(?: y)? descuentos?|movimientos?(?: y)? trazabilidad)$/.test(normalized)) {
      return false;
    }
    if (/^(?:que|como|cual|cuanto|cuantos|dame|mostra(?:r(?:me)?|me)?|muestra(?:me)?|explica(?:r(?:me)?|me)?|analiza(?:r(?:me)?|me)?|compara|comparar|tendencia|evolucion|resumen|panorama|estado|inventario|catalogo)\b/.test(normalized)) {
      return false;
    }
    if (!/^[\p{L}'-]+(?:\s+[\p{L}'-]+){1,5}$/u.test(raw)) return false;
    var tokens = normalized.split(' ');
    return tokens.length >= 2 && tokens.length <= 6 &&
      tokens.every(function(token) { return /^[a-z'-]{2,40}$/.test(token); });
  }

  function questionPurpose(value) {
    return isPersonLookupQuestion(value) ? 'PERSON_LOOKUP' : 'AGGREGATE_ANALYSIS';
  }

  function configureSuggestionsForRole() {
    var suggestions = byId('querySuggestions');
    var user = currentUser();
    if (!suggestions || !user || typeof user.role !== 'string') return;
    configureRoleChip(user);
    var primary = byId('queryPrimary');
    suggestions.querySelectorAll('[data-primary-roles]').forEach(function(button) {
      if (!button.dataset.queryGroup) {
        var owner = button.closest('[data-query-group]');
        if (owner) button.dataset.queryGroup = owner.dataset.queryGroup;
      }
      var roles = String(button.dataset.primaryRoles || '').split(',').map(function(role) {
        return role.trim();
      }).filter(Boolean);
      if (roles.indexOf(user.role) !== -1 && primary) {
        primary.appendChild(button);
      } else if (button.closest('#queryPrimary')) {
        var group = suggestions.querySelector('[data-query-group="' + button.dataset.queryGroup + '"] .query-group-list');
        if (group) group.appendChild(button);
      }
      button.hidden = false;
      button.disabled = false;
    });
    safeArray(PRIMARY_QUERY_ORDER[user.role]).forEach(function(queryId) {
      var button = suggestions.querySelector('[data-query-id="' + queryId + '"]');
      if (button && primary && button.parentNode === primary) primary.appendChild(button);
    });
    if (primary) primary.hidden = primary.childElementCount === 0;
    suggestions.querySelectorAll('.query-group[data-query-group]').forEach(function(group) {
      group.hidden = !group.querySelector('[data-query-id]');
    });
    var more = byId('queryMore');
    if (more) more.hidden = !suggestions.querySelector('#queryMoreBody [data-query-id]');
  }

  function parseQuestionDeepLink() {
    if (!global.location.search) return null;
    var parameters;
    try {
      parameters = new URLSearchParams(global.location.search);
    } catch (_) {
      return null;
    }
    var keys = Array.from(parameters.keys());
    if (keys.length !== 1 || keys[0] !== 'question' ||
        parameters.getAll('question').length !== 1) return null;
    var question = String(parameters.get('question') || '').trim();
    if (!safeText(question, 300, false)) return null;
    var normalized = normalizedQuestion(question);
    if (isPersonLookupQuestion(question) ||
        /\b(dni|cuit|cuil|domicilio|telefono|correo personal|email personal|legajo|nombre|apellido|persona|empleado)\b/.test(normalized)) {
      return null;
    }
    if (!/(area|dato|tabla|dominio|inventario|resumen|prioridad|atencion|calidad|cuarentena|conciliacion|calculo|cierre|neto|bruto|retencion|aporte|sector|centros? de costos?|convenio|acuerdo|ausencia|movimiento|fuente|snapshot|carrera|formacion|estudio|licencia|beneficio|descuento|gremio|turno|horario|relacion laboral|salud|trayectoria)/.test(normalized)) {
      return null;
    }
    return question;
  }

  async function consumeQuestionDeepLink() {
    var hadSearch = Boolean(global.location.search);
    var question = parseQuestionDeepLink();
    if (!question) {
      if (hadSearch) {
        try {
          global.history.replaceState(null, '', global.location.pathname + global.location.hash);
        } catch (_) {}
      }
      return;
    }
    try {
      global.history.replaceState(null, '', global.location.pathname + global.location.hash);
    } catch (_) {}
    var input = byId('assistantInput');
    if (input) {
      input.value = question;
      resizeInput(input);
    }
    await ask(question);
  }

  function resizeInput(input) {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 116) + 'px';
    var counter = byId('characterCount');
    if (counter) counter.textContent = input.value.length + ' / ' + MAX_LENGTH;
  }

  function disableForRole() {
    var input = byId('assistantInput');
    var submit = byId('sendQuery');
    if (input) {
      input.disabled = true;
      input.placeholder = 'Tu perfil no está habilitado para consultas ejecutivas GRH.';
    }
    if (submit) submit.disabled = true;
    appendUnavailable('Perfil no habilitado', 'Esta vista requiere un rol ejecutivo autorizado. El servidor volverá a validar el rol y el tenant en cada solicitud.', 'No disponible para este perfil');
  }

  function bindInterface() {
    if (typeof global.buildSidebar === 'function') global.buildSidebar('ia');
    if (!canUseExecutiveAssistant()) {
      disableForRole();
      return;
    }

    var form = byId('assistantForm');
    var input = byId('assistantInput');
    var suggestions = byId('querySuggestions');
    var more = byId('queryMore');
    var conversation = byId('conversationLog');
    var personInput = byId('personSearchInput');
    var personClose = byId('personSearchClose');
    configureSuggestionsForRole();
    setSourceStatus('ready', 'Listo para consultar');

    if (form) {
      form.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (!input) return;
        var text = input.value;
        input.value = '';
        resizeInput(input);
        await ask(text);
      });
    }

    if (input) {
      input.addEventListener('input', function() { resizeInput(input); });
      input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (form) form.requestSubmit();
        }
      });
      resizeInput(input);
    }

    if (suggestions) {
      suggestions.addEventListener('click', async function(event) {
        var personLookup = event.target.closest('[data-person-lookup]');
        if (personLookup && !busy) {
          openPersonSearch();
          return;
        }
        var button = event.target.closest('[data-question]');
        if (!button || busy) return;
        closePersonSearch();
        if (more) more.open = false;
        await ask(button.getAttribute('data-question'));
      });
    }

    if (more) {
      more.addEventListener('toggle', function() {
        if (more.open) closePersonSearch();
      });
    }

    if (conversation) {
      conversation.addEventListener('click', function(event) {
        var followUp = event.target.closest('[data-follow-up-question]');
        if (!followUp || busy || !input || !form) return;
        var question = followUp.dataset.followUpQuestion;
        if (!safeText(question, 300, false)) return;
        input.value = question;
        resizeInput(input);
        form.requestSubmit();
      });
    }

    if (personInput) {
      personInput.addEventListener('input', function() { schedulePersonSearch(personInput.value); });
      personInput.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePersonSearch();
          restorePersonSearchFocus(suggestions);
        }
      });
    }
    if (personClose) {
      personClose.addEventListener('click', function() {
        closePersonSearch();
        restorePersonSearchFocus(suggestions);
      });
    }
  }

  async function start() {
    if (!await requirePageCapability()) return;
    Promise.resolve(global.MuniAuthReady)
      .then(async function(valid) {
        if (valid === false) return;
        bindInterface();
        await consumeQuestionDeepLink();
      })
      .catch(function() {
        appendUnavailable('Sesión no verificable', 'No se pudo validar la sesión institucional.', 'Fuente no disponible');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(window);
