(function installGrhDomainExplorer(global) {
  'use strict';

  var SCHEMA_VERSION = 'grh-domain-catalog-v1';
  var ENDPOINT = '/api/grh-domain-catalog';
  var REQUIRED_CAPABILITY = 'navigation.rrhh';
  var DOMAIN_IDS = Object.freeze([
    'personas_estructura',
    'asistencia_tiempo',
    'licencias_salud',
    'carrera_desarrollo',
    'relaciones_laborales',
    'nomina_control',
    'beneficios_descuentos',
    'movimientos_trazabilidad'
  ]);
  var DOMAIN_STATUSES = Object.freeze(['operational', 'partial', 'catalogued']);
  var TABLE_STATUSES = Object.freeze(['available', 'empty']);
  var PERIOD_STATUSES = Object.freeze(['certified', 'historical', 'not_available']);
  var COVERAGE_STATUSES = Object.freeze(['verified', 'informational']);
  var COVERAGE_UNITS = Object.freeze(['percent', 'rows', 'tables']);
  var STATUS_LABELS = Object.freeze({
    operational: 'Operativo',
    partial: 'Cobertura parcial',
    catalogued: 'Catalogado'
  });
  var PERIOD_STATUS_LABELS = Object.freeze({
    certified: 'Serie certificada',
    historical: 'Serie histórica',
    not_available: 'Sin período semántico'
  });
  var TOP_KEYS = Object.freeze(['schemaVersion', 'source', 'lineage', 'privacy', 'counts', 'domains']);
  var SOURCE_KEYS = Object.freeze([
    'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt', 'realtime'
  ]);
  var LINEAGE_KEYS = Object.freeze(['profileSchemaVersion', 'semanticSchemaVersion', 'dictionaryProjection']);
  var PRIVACY_KEYS = Object.freeze(['aggregateMetadataOnly', 'containsPersonRecords', 'containsFinancialAmounts']);
  var COUNTS_KEYS = Object.freeze([
    'totalTables', 'nonEmptyTables', 'emptyTables', 'totalRows', 'mappedTables', 'mappedRows', 'domainCount'
  ]);
  var DOMAIN_KEYS = Object.freeze([
    'id', 'title', 'status', 'summary', 'counts', 'tables', 'coverage', 'periods', 'questions', 'actions'
  ]);
  var DOMAIN_COUNTS_KEYS = Object.freeze(['tables', 'nonEmptyTables', 'rows']);
  var TABLE_KEYS = Object.freeze(['name', 'label', 'rows', 'columns', 'status', 'periods']);
  var PERIOD_KEYS = Object.freeze(['first', 'last', 'status']);
  var COVERAGE_KEYS = Object.freeze(['id', 'label', 'value', 'unit', 'status']);
  var ACTION_KEYS = Object.freeze(['id', 'label', 'href', 'requiredCapability']);
  var ACTION_CAPABILITIES = Object.freeze([
    'navigation.rrhh',
    'navigation.organization-analytics',
    'navigation.ai-assistant',
    'navigation.data-quality',
    'navigation.hacienda'
  ]);

  var state = {
    contract: null,
    selectedDomainId: null,
    search: '',
    status: 'all',
    loading: false
  };

  function plainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exactKeys(value, expected) {
    if (!plainObject(value)) return false;
    var keys = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return keys.length === wanted.length && keys.every(function(key, index) {
      return key === wanted[index];
    });
  }

  function shortText(value, maxLength) {
    return typeof value === 'string' && value.trim() === value && value.length > 0 &&
      value.length <= (maxLength || 220);
  }

  function identifier(value) {
    return shortText(value, 100) && /^[a-z][a-z0-9_.-]*$/i.test(value);
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function percentage(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function isoDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function isoTimestamp(value) {
    return typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value);
  }

  function month(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
    return value;
  }

  function validSource(value) {
    return exactKeys(value, SOURCE_KEYS) && shortText(value.canonicalSystem, 120) &&
      shortText(value.sourceFile, 180) && /^[a-f0-9]{64}$/.test(value.sourceSha256) &&
      isoDay(value.snapshotAsOf) && isoTimestamp(value.generatedAt) && value.realtime === false;
  }

  function validLineage(value) {
    return exactKeys(value, LINEAGE_KEYS) && value.profileSchemaVersion === 'grh-profile-v1' &&
      value.semanticSchemaVersion === 'grh-semantic-v2' &&
      value.dictionaryProjection === 'table_dictionary_governed_projection';
  }

  function validPrivacy(value) {
    return exactKeys(value, PRIVACY_KEYS) && value.aggregateMetadataOnly === true &&
      value.containsPersonRecords === false && value.containsFinancialAmounts === false;
  }

  function validCounts(value) {
    return exactKeys(value, COUNTS_KEYS) && COUNTS_KEYS.every(function(key) { return nonNegativeInteger(value[key]); }) &&
      value.domainCount === DOMAIN_IDS.length && value.nonEmptyTables + value.emptyTables === value.totalTables &&
      value.mappedTables <= value.totalTables && value.mappedRows <= value.totalRows;
  }

  function validDomainCounts(value) {
    return exactKeys(value, DOMAIN_COUNTS_KEYS) && DOMAIN_COUNTS_KEYS.every(function(key) {
      return nonNegativeInteger(value[key]);
    }) && value.nonEmptyTables <= value.tables;
  }

  function validPeriods(value) {
    if (!exactKeys(value, PERIOD_KEYS) || PERIOD_STATUSES.indexOf(value.status) === -1) return false;
    if (value.status === 'not_available') return value.first === null && value.last === null;
    return month(value.first) && month(value.last) && value.first <= value.last;
  }

  function validTable(value) {
    return exactKeys(value, TABLE_KEYS) && typeof value.name === 'string' && /^[a-z][a-z0-9_]{1,63}$/.test(value.name) &&
      shortText(value.label, 100) && nonNegativeInteger(value.rows) && nonNegativeInteger(value.columns) &&
      TABLE_STATUSES.indexOf(value.status) !== -1 && value.status === (value.rows > 0 ? 'available' : 'empty') &&
      validPeriods(value.periods);
  }

  function validCoverage(value) {
    return exactKeys(value, COVERAGE_KEYS) && typeof value.id === 'string' && /^[a-z][a-z0-9_]{2,48}$/.test(value.id) &&
      shortText(value.label, 120) && typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0 &&
      (value.unit !== 'percent' || percentage(value.value)) && COVERAGE_UNITS.indexOf(value.unit) !== -1 &&
      COVERAGE_STATUSES.indexOf(value.status) !== -1;
  }

  function safeHref(value) {
    return shortText(value, 360) && /^(?:\/(?![\\/])|[a-z0-9-]+\.html(?:[?#]|$))/i.test(value);
  }

  function validAction(value) {
    return exactKeys(value, ACTION_KEYS) && typeof value.id === 'string' && /^[a-z][a-z0-9_]{2,48}$/.test(value.id) &&
      shortText(value.label, 100) && safeHref(value.href) &&
      typeof value.requiredCapability === 'string' && ACTION_CAPABILITIES.indexOf(value.requiredCapability) !== -1;
  }

  function uniqueBy(values, keySelector) {
    var keys = new Set();
    return values.every(function(value) {
      var key = keySelector(value);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
  }

  function validDomain(value, index) {
    if (!exactKeys(value, DOMAIN_KEYS) || DOMAIN_IDS.indexOf(value.id) === -1 ||
        value.id !== DOMAIN_IDS[index] ||
        !shortText(value.title, 100) || !shortText(value.summary, 360) ||
        DOMAIN_STATUSES.indexOf(value.status) === -1 || !validDomainCounts(value.counts) ||
        !Array.isArray(value.tables) || !Array.isArray(value.coverage) ||
        !Array.isArray(value.questions) || !Array.isArray(value.actions) ||
        !value.tables.every(validTable) || value.coverage.length < 1 || value.coverage.length > 6 ||
        !value.coverage.every(validCoverage) || !validPeriods(value.periods) ||
        value.questions.length < 2 || value.questions.length > 5 ||
        !value.questions.every(function(question) { return shortText(question, 220); }) ||
        value.actions.length < 1 || value.actions.length > 4 ||
        !value.actions.every(validAction) || !uniqueBy(value.tables, function(row) { return row.name; }) ||
        !uniqueBy(value.coverage, function(row) { return row.id; }) ||
        !uniqueBy(value.questions, function(question) { return question; }) ||
        !uniqueBy(value.actions, function(row) { return row.id; })) return false;

    var rows = value.tables.reduce(function(total, row) { return total + row.rows; }, 0);
    var nonEmpty = value.tables.filter(function(row) { return row.rows > 0; }).length;
    return value.counts.tables === value.tables.length && value.counts.nonEmptyTables === nonEmpty &&
      value.counts.rows === rows;
  }

  function inspectContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION || !validSource(value.source) ||
        !validLineage(value.lineage) || !validPrivacy(value.privacy) || !validCounts(value.counts) ||
        !Array.isArray(value.domains) || value.domains.length !== DOMAIN_IDS.length ||
        !value.domains.every(validDomain) || !uniqueBy(value.domains, function(domain) { return domain.id; })) return null;

    var mappedRows = 0;
    var mappedTables = 0;
    var uniqueTables = new Set();
    value.domains.forEach(function(domain) {
      mappedRows += domain.counts.rows;
      mappedTables += domain.counts.tables;
      domain.tables.forEach(function(table) { uniqueTables.add(table.name); });
    });

    if (uniqueTables.size !== mappedTables || value.counts.mappedTables !== mappedTables ||
        value.counts.mappedRows !== mappedRows) return null;

    return deepFreeze(value);
  }

  global.MuniGrhExplorer = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    endpoint: ENDPOINT,
    domainIds: DOMAIN_IDS,
    inspectContract: inspectContract
  });

  var documentRef = global.document;
  if (!documentRef) return;

  function byId(id) { return documentRef.getElementById(id); }
  function clear(element) { while (element && element.firstChild) element.removeChild(element.firstChild); }

  function element(tagName, className, text) {
    var node = documentRef.createElement(tagName);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
  }

  function formatPercentage(value) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) + '%';
  }

  function formatSnapshot(value) {
    var parsed = new Date(value.length === 10 ? value + 'T00:00:00Z' : value);
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed);
  }

  function formatPeriod(value) {
    var parts = value.split('-');
    return new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1)));
  }

  function formatPeriodRange(period) {
    if (!period || period.status === 'not_available') return 'Sin serie temporal';
    if (period.first === period.last) return formatPeriod(period.first);
    return formatPeriod(period.first) + ' — ' + formatPeriod(period.last);
  }

  function statusLabel(value) { return STATUS_LABELS[value] || value; }

  function setSourceState(kind, text) {
    var status = byId('grhSourceStatus');
    status.dataset.state = kind;
    byId('grhSourceStatusText').textContent = text;
  }

  function renderSummary(contract) {
    var definitions = [
      { label: 'Áreas GRH', value: contract.counts.domainCount },
      { label: 'Tablas inventariadas', value: contract.counts.totalTables },
      { label: 'Tablas con datos', value: contract.counts.nonEmptyTables },
      { label: 'Filas inventariadas', value: contract.counts.totalRows },
      { label: 'Tablas mapeadas', value: contract.counts.mappedTables },
      { label: 'Filas en dominios', value: contract.counts.mappedRows }
    ];
    var container = byId('grhSummaryKpis');
    clear(container);
    definitions.forEach(function(definition) {
      var card = element('article', 'grh-kpi');
      card.append(element('span', '', definition.label), element('strong', '', formatNumber(definition.value)));
      container.appendChild(card);
    });
    byId('grhSnapshotDate').textContent = formatSnapshot(contract.source.snapshotAsOf);
    byId('grhSourceNote').textContent = contract.source.canonicalSystem + ' · ' +
      formatNumber(contract.counts.mappedTables) + ' de ' + formatNumber(contract.counts.totalTables) +
      ' tablas organizadas en dominios · snapshot histórico.';
    byId('grhContractChip').textContent = contract.schemaVersion;
  }

  function renderStatusOptions(contract) {
    var select = byId('grhStatusFilter');
    while (select.options.length > 1) select.remove(1);
    DOMAIN_STATUSES.forEach(function(status) {
      var count = contract.domains.filter(function(domain) { return domain.status === status; }).length;
      if (count === 0) return;
      var option = element('option', '', statusLabel(status) + ' (' + formatNumber(count) + ')');
      option.value = status;
      select.appendChild(option);
    });
  }

  function searchableText(domain) {
    return [domain.title, domain.summary]
      .concat(domain.tables.map(function(row) { return row.name + ' ' + row.label; }))
      .concat(domain.questions)
      .join(' ').toLocaleLowerCase('es');
  }

  function visibleDomains() {
    if (!state.contract) return [];
    var query = state.search.trim().toLocaleLowerCase('es');
    return state.contract.domains.filter(function(domain) {
      return (state.status === 'all' || domain.status === state.status) &&
        (!query || searchableText(domain).includes(query));
    });
  }

  function selectDomain(domainId, updateHistory, focusDetail) {
    if (!state.contract || !state.contract.domains.some(function(domain) { return domain.id === domainId; })) return;
    state.selectedDomainId = domainId;
    renderDomainNavigation();
    if (updateHistory && global.history && global.URL) {
      var url = new URL(global.location.href);
      url.searchParams.set('domain', domainId);
      global.history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString() + url.hash);
    }
    if (focusDetail) byId('grhDomainTitle').focus({ preventScroll: false });
  }

  function keyboardDomainNavigation(event) {
    var buttons = Array.from(byId('grhDomainGrid').querySelectorAll('.grh-domain-card:not([hidden])'));
    var current = buttons.indexOf(event.currentTarget);
    var next = current;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Math.min(buttons.length - 1, current + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    if (buttons[next]) buttons[next].focus();
  }

  function renderDomainNavigation() {
    var domains = visibleDomains();
    var container = byId('grhDomainGrid');
    var hasSelectedDomain = domains.some(function(domain) { return domain.id === state.selectedDomainId; });
    state.selectedDomainId = domains.length > 0
      ? (hasSelectedDomain ? state.selectedDomainId : domains[0].id)
      : null;
    clear(container);
    domains.forEach(function(domain) {
      var index = state.contract.domains.findIndex(function(candidate) { return candidate.id === domain.id; }) + 1;
      var button = element('button', 'grh-domain-card');
      var copy = element('span');
      button.type = 'button';
      button.dataset.domainId = domain.id;
      button.dataset.status = domain.status;
      button.setAttribute('aria-current', domain.id === state.selectedDomainId ? 'true' : 'false');
      button.tabIndex = domain.id === state.selectedDomainId ? 0 : -1;
      copy.append(element('strong', '', domain.title), element('small', '', statusLabel(domain.status) + ' · ' + formatNumber(domain.counts.tables) + ' tablas'));
      button.append(
        element('span', 'grh-domain-index', String(index).padStart(2, '0')),
        copy,
        element('span', 'grh-domain-card-state')
      );
      button.addEventListener('click', function() { selectDomain(domain.id, true, false); });
      button.addEventListener('keydown', keyboardDomainNavigation);
      container.appendChild(button);
    });
    byId('grhDomainEmpty').hidden = domains.length > 0;
    byId('grhResultsLine').textContent = formatNumber(domains.length) + ' de ' +
      formatNumber(state.contract.domains.length) + ' áreas visibles.';
    renderDomainDetail();
  }

  function formatCoverage(value) {
    if (value.unit === 'percent') return formatPercentage(value.value);
    return formatNumber(value.value) + (value.unit === 'tables' ? ' tablas' : ' filas');
  }

  function renderCoverage(domain) {
    var container = byId('grhCoverageGrid');
    clear(container);
    domain.coverage.forEach(function(item) {
      var card = element('article', 'grh-coverage-card');
      card.append(
        element('span', '', item.label),
        element('strong', '', formatCoverage(item)),
        element('small', '', item.status === 'verified' ? 'Verificado' : 'Informativo')
      );
      container.appendChild(card);
    });
  }

  function renderEvidence(domain) {
    var body = byId('grhEvidenceBody');
    var cards = byId('grhEvidenceCards');
    clear(body);
    clear(cards);
    domain.tables.forEach(function(table) {
      var row = element('tr');
      var coverageCell = element('td');
      var tableCell = element('td');
      var rowsCell = element('td', 'grh-numeric', formatNumber(table.rows));
      var periodCell = element('td', '', formatPeriodRange(table.periods));
      var stateCell = element('td');
      coverageCell.append(element('strong', '', table.label), element('small', '', formatNumber(table.columns) + ' columnas'));
      tableCell.append(element('strong', '', table.name));
      stateCell.append(element('span', 'grh-table-state', table.status === 'available' ? 'Disponible' : 'Sin filas'));
      stateCell.firstChild.dataset.state = table.status === 'available' ? 'operational' : 'catalogued';
      row.append(coverageCell, tableCell, rowsCell, periodCell, stateCell);
      body.appendChild(row);

      var card = element('article', 'grh-evidence-card');
      var list = element('dl');
      card.append(element('strong', '', table.label), element('small', '', table.name));
      [
        ['Filas', formatNumber(table.rows)],
        ['Columnas', formatNumber(table.columns)],
        ['Período', formatPeriodRange(table.periods)],
        ['Estado', table.status === 'available' ? 'Disponible' : 'Sin filas']
      ].forEach(function(item) {
        var wrapper = element('div');
        wrapper.append(element('dt', '', item[0]), element('dd', '', item[1]));
        list.appendChild(wrapper);
      });
      card.appendChild(list);
      cards.appendChild(card);
    });
    byId('grhEvidenceSummary').textContent = formatNumber(domain.counts.nonEmptyTables) + ' de ' +
      formatNumber(domain.counts.tables) + ' tablas con filas · ' + formatNumber(domain.counts.rows) + ' filas registradas.';
  }

  function renderQuestions(domain) {
    var list = byId('grhQuestionList');
    clear(list);
    var projection = global.MuniAccess && typeof global.MuniAccess.getValidatedSession === 'function'
      ? global.MuniAccess.getValidatedSession()
      : null;
    var canAskAssistant = Boolean(projection && Array.isArray(projection.capabilities) &&
      projection.capabilities.indexOf('navigation.ai-assistant') !== -1);
    domain.questions.forEach(function(question, index) {
      var item = element('li', 'grh-question');
      if (canAskAssistant) {
        var link = element('a', 'grh-question-link');
        link.href = '/ia.html?question=' + encodeURIComponent(question);
        link.dataset.questionIndex = String(index + 1);
        link.append(
          element('strong', '', question),
          element('span', '', 'Preguntar al BOT IA')
        );
        item.appendChild(link);
      } else {
        item.append(
          element('strong', '', question),
          element('span', '', 'Pregunta ' + String(index + 1).padStart(2, '0'))
        );
      }
      list.appendChild(item);
    });
  }

  function renderActions(domain) {
    var container = byId('grhDomainActions');
    clear(container);
    var projection = global.MuniAccess && typeof global.MuniAccess.getValidatedSession === 'function'
      ? global.MuniAccess.getValidatedSession()
      : null;
    var capabilities = projection ? projection.capabilities : [];
    domain.actions.forEach(function(action) {
      if (capabilities.indexOf(action.requiredCapability) !== -1) {
        var link = element('a', 'grh-action-link', action.label);
        link.href = action.href;
        link.dataset.actionId = action.id;
        container.appendChild(link);
        return;
      }
      var button = element('button', 'grh-action-disabled', action.label);
      button.type = 'button';
      button.disabled = true;
      button.dataset.actionId = action.id;
      button.title = 'El perfil actual no tiene ' + action.requiredCapability;
      container.appendChild(button);
    });
  }

  function renderDomainDetail() {
    if (!state.contract) return;
    var detail = byId('grhDomainDetail');
    var domain = state.contract.domains.find(function(candidate) { return candidate.id === state.selectedDomainId; });
    if (!domain) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    var index = state.contract.domains.indexOf(domain) + 1;
    var title = byId('grhDomainTitle');
    byId('grhDomainOrder').textContent = 'Dominio ' + String(index).padStart(2, '0') + ' de ' + state.contract.domains.length;
    byId('grhDomainStatus').textContent = statusLabel(domain.status);
    byId('grhDomainStatus').dataset.status = domain.status;
    title.textContent = domain.title;
    title.tabIndex = -1;
    byId('grhDomainDescription').textContent = domain.summary;
    renderActions(domain);
    renderCoverage(domain);
    renderEvidence(domain);
    renderQuestions(domain);
    byId('grhDomainLimit').replaceChildren(
      element('strong', '', PERIOD_STATUS_LABELS[domain.periods.status] + '. '),
      documentRef.createTextNode(formatPeriodRange(domain.periods) + ' · ' + formatNumber(domain.counts.nonEmptyTables) +
        ' tablas con datos · ' + formatNumber(domain.counts.rows) + ' filas en el dominio.')
    );
  }

  function renderGlobalLimits() {
    var values = [
      'El corte es histórico y no representa información en tiempo real.',
      'Una fila registrada no equivale automáticamente a una persona activa.',
      'Estos dominios agrupan datos del GRH; no son departamentos ni certifican el organigrama vigente.',
      'Las acciones disponibles respetan la capacidad confirmada para la sesión.'
    ];
    var list = byId('grhGlobalLimits');
    clear(list);
    values.forEach(function(value) { list.appendChild(element('li', '', value)); });
  }

  function domainFromLocation(contract) {
    try {
      var requested = new URL(global.location.href).searchParams.get('domain');
      if (requested && contract.domains.some(function(domain) { return domain.id === requested; })) return requested;
    } catch (_) {}
    return contract.domains[0].id;
  }

  function showError(title, message) {
    state.loading = false;
    byId('grhLoadingState').hidden = true;
    byId('grhExplorerContent').hidden = true;
    byId('grhErrorTitle').textContent = title;
    byId('grhErrorMessage').textContent = message;
    byId('grhErrorState').hidden = false;
    setSourceState('error', 'Catálogo no disponible');
    byId('grhErrorState').focus();
  }

  function showContract(contract) {
    state.contract = contract;
    state.selectedDomainId = domainFromLocation(contract);
    state.loading = false;
    renderSummary(contract);
    renderStatusOptions(contract);
    renderGlobalLimits();
    renderDomainNavigation();
    byId('grhLoadingState').hidden = true;
    byId('grhErrorState').hidden = true;
    byId('grhExplorerContent').hidden = false;
    setSourceState('ready', 'Catálogo verificado');
  }

  async function loadCatalog() {
    if (state.loading) return;
    state.loading = true;
    state.contract = null;
    byId('grhLoadingState').hidden = false;
    byId('grhErrorState').hidden = true;
    byId('grhExplorerContent').hidden = true;
    setSourceState('loading', 'Verificando catálogo');

    try {
      var allowed = typeof global.requireCapability === 'function'
        ? await global.requireCapability(REQUIRED_CAPABILITY)
        : false;
      if (!allowed) return;
      if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
        throw new Error('AUTH_CLIENT_UNAVAILABLE');
      }
      var response = await global.MuniAuth.fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        if (response.status === 403) {
          showError('Acceso no habilitado', 'El perfil actual no tiene acceso al catálogo de áreas GRH.');
          return;
        }
        throw new Error('CATALOG_REQUEST_FAILED');
      }
      if (response.headers.get('x-municontrol-contract') !== SCHEMA_VERSION) {
        throw new Error('CATALOG_HEADER_INVALID');
      }
      var payload = await response.json();
      var contract = inspectContract(payload);
      if (!contract) throw new Error('CATALOG_CONTRACT_INVALID');
      showContract(contract);
    } catch (error) {
      if (global.MuniAuth && typeof global.MuniAuth.isAuthError === 'function' && global.MuniAuth.isAuthError(error)) return;
      showError('Catálogo GRH no verificable', 'No se muestran resultados parciales. Reintentá cuando la fuente y el contrato estén disponibles.');
    }
  }

  function installEvents() {
    byId('grhRetryButton').addEventListener('click', loadCatalog);
    byId('grhDomainSearch').addEventListener('input', function(event) {
      state.search = event.target.value;
      renderDomainNavigation();
    });
    byId('grhStatusFilter').addEventListener('change', function(event) {
      state.status = event.target.value;
      renderDomainNavigation();
    });
    global.addEventListener('popstate', function() {
      if (!state.contract) return;
      selectDomain(domainFromLocation(state.contract), false, false);
    });
  }

  function init() {
    if (!byId('grhExplorerMain')) return;
    installEvents();
    loadCatalog();
  }

  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}(window));
