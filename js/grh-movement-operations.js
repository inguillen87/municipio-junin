(function installGrhMovementOperations(global) {
  'use strict';

  var CONTRACT = 'grh-movement-operations-v1';
  var POLICY = 'grh-movement-operations-policy-v1';
  var ENDPOINT = '/api/grh-movement-operations';
  var REQUIRED_CAPABILITY = 'navigation.organization-analytics';
  var TOP_KEYS = ['schemaVersion', 'policyVersion', 'source', 'metric', 'coverage', 'summary', 'series', 'actions', 'limits'];
  var SOURCE_KEYS = ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt', 'realtime', 'sourceTable'];
  var METRIC_KEYS = ['eventUnit', 'participantUnit', 'intensityUnit', 'classificationStatus', 'comparisonRule'];
  var COVERAGE_KEYS = ['sourceRows', 'validRows', 'quarantineRows', 'validRatePct', 'validPeriods', 'firstValidPeriod', 'lastValidPeriod', 'matchedRows', 'orphanRows', 'joinIntegrityPct', 'distinctEmployeeKeys', 'employeeCoveragePct'];
  var SUMMARY_KEYS = ['firstYear', 'lastObservedYear', 'lastObservedYearStatus', 'latestCompleteYear', 'yearsAvailable', 'releasedYears', 'protectedYears', 'latestCompleteEvents', 'latestCompleteParticipants', 'latestCompleteEventsPerParticipant', 'defaultComparison'];
  var COMPARISON_KEYS = ['fromYear', 'toYear', 'status', 'eventDelta', 'eventDeltaPct', 'participantDelta', 'participantDeltaPct', 'intensityDelta', 'intensityDeltaPct'];
  var SERIES_KEYS = ['year', 'status', 'privacyStatus', 'events', 'participants', 'eventsPerParticipant'];
  var ACTION_KEYS = ['id', 'label', 'href', 'requiredCapability'];
  var LIMIT_KEYS = ['privacyThreshold', 'availableWindows', 'availableMetrics', 'classification'];
  var EXPECTED_METRIC = Object.freeze({
    eventUnit: 'valid_source_rows', participantUnit: 'distinct_compound_employee_keys',
    intensityUnit: 'events_per_participant', classificationStatus: 'unclassified_source_events',
    comparisonRule: 'latest_two_released_complete_years'
  });
  var RELATED_ACTIONS = Object.freeze([
    Object.freeze({ id: 'open_structure', label: 'Abrir dotación y estructura', href: '/estructura', requiredCapability: 'navigation.organization-analytics' }),
    Object.freeze({ id: 'open_data_quality', label: 'Revisar calidad de datos', href: '/calidad', requiredCapability: 'navigation.data-quality' })
  ]);
  var EXPECTED_WINDOWS = Object.freeze(['all_years', 'latest_5_years', 'latest_10_years']);
  var EXPECTED_METRICS = Object.freeze(['events', 'participants', 'events_per_participant']);
  var DEFAULT_FILTERS = Object.freeze({ metric: 'events', window: '5', from: null, to: null });
  var state = { contract: null, filters: DEFAULT_FILTERS, invalidDeepLink: false, noticeKind: null, interactive: false, loading: false };

  function plainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function exactKeys(value, expected) {
    if (!plainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index) { return key === wanted[index]; });
  }
  function boundedText(value, maximum) {
    return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
  }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function number(value) { return typeof value === 'number' && Number.isFinite(value); }
  function percentage(value) { return number(value) && value >= 0 && value <= 100; }
  function round4(value) { return Number(value.toFixed(4)); }
  function sameNumber(left, right) { return number(left) && number(right) && Math.abs(left - right) <= 0.00005; }
  function sameArray(left, right) { return Array.isArray(left) && left.length === right.length && left.every(function(value, index) { return value === right[index]; }); }
  function sameObject(value, expected) { return exactKeys(value, Object.keys(expected)) && Object.keys(expected).every(function(key) { return value[key] === expected[key]; }); }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
    return value;
  }
  function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')); }
  function validTimestamp(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value) && !Number.isNaN(Date.parse(value)); }
  function validPeriod(value) { return typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value); }
  function expectedRate(numerator, denominator) { return denominator === 0 ? 0 : round4(numerator / denominator * 100); }

  function validSource(value) {
    return exactKeys(value, SOURCE_KEYS) && boundedText(value.canonicalSystem, 120) && boundedText(value.sourceFile, 180) &&
      /^[0-9a-f]{64}$/.test(value.sourceSha256) && validDate(value.snapshotAsOf) && validTimestamp(value.generatedAt) &&
      value.realtime === false && value.sourceTable === 'legamov';
  }
  function validCoverage(value, source) {
    if (!exactKeys(value, COVERAGE_KEYS)) return false;
    var integers = ['sourceRows', 'validRows', 'quarantineRows', 'validPeriods', 'matchedRows', 'orphanRows', 'distinctEmployeeKeys'];
    return integers.every(function(key) { return integer(value[key]); }) && value.sourceRows > 0 && value.validPeriods > 0 &&
      value.validRows + value.quarantineRows === value.sourceRows && value.matchedRows + value.orphanRows === value.sourceRows &&
      percentage(value.validRatePct) && sameNumber(value.validRatePct, expectedRate(value.validRows, value.sourceRows)) &&
      percentage(value.joinIntegrityPct) && sameNumber(value.joinIntegrityPct, expectedRate(value.matchedRows, value.sourceRows)) &&
      percentage(value.employeeCoveragePct) && validPeriod(value.firstValidPeriod) && validPeriod(value.lastValidPeriod) &&
      value.firstValidPeriod <= value.lastValidPeriod && value.lastValidPeriod <= source.snapshotAsOf.slice(0, 7) &&
      value.distinctEmployeeKeys <= value.sourceRows;
  }
  function inspectSeries(value, source, threshold) {
    if (!Array.isArray(value) || !value.length) return null;
    var snapshotYear = source.snapshotAsOf.slice(0, 4);
    var previous = '';
    var seen = new Set();
    var protectedCount = 0;
    for (var index = 0; index < value.length; index += 1) {
      var row = value[index];
      if (!exactKeys(row, SERIES_KEYS) || !/^\d{4}$/.test(row.year) || seen.has(row.year) || (previous && previous >= row.year) || row.year > snapshotYear ||
          row.status !== (row.year === snapshotYear ? 'partial' : 'complete')) return null;
      seen.add(row.year); previous = row.year;
      if (row.privacyStatus === 'released') {
        if (!integer(row.events) || !integer(row.participants) || row.participants < threshold || row.participants > row.events ||
            !sameNumber(row.eventsPerParticipant, round4(row.events / row.participants))) return null;
      } else if (row.privacyStatus === 'protected') {
        protectedCount += 1;
        if (row.events !== null || row.participants !== null || row.eventsPerParticipant !== null) return null;
      } else return null;
    }
    if (protectedCount === 1) return null;
    return value;
  }
  function comparisonFor(rows) {
    if (rows.length < 2) return { fromYear: null, toYear: null, status: 'unavailable', eventDelta: null, eventDeltaPct: null, participantDelta: null, participantDeltaPct: null, intensityDelta: null, intensityDeltaPct: null };
    var from = rows[rows.length - 2];
    var to = rows[rows.length - 1];
    var eventDelta = to.events - from.events;
    var participantDelta = to.participants - from.participants;
    var intensityDelta = round4(to.eventsPerParticipant - from.eventsPerParticipant);
    return { fromYear: from.year, toYear: to.year, status: 'available', eventDelta: eventDelta, eventDeltaPct: round4(eventDelta / from.events * 100), participantDelta: participantDelta, participantDeltaPct: round4(participantDelta / from.participants * 100), intensityDelta: intensityDelta, intensityDeltaPct: round4(intensityDelta / from.eventsPerParticipant * 100) };
  }
  function validComparison(value, expected) {
    return exactKeys(value, COMPARISON_KEYS) && COMPARISON_KEYS.every(function(key) {
      return typeof expected[key] === 'number' ? sameNumber(value[key], expected[key]) : value[key] === expected[key];
    });
  }
  function validSummary(value, series) {
    if (!exactKeys(value, SUMMARY_KEYS)) return false;
    var released = series.filter(function(row) { return row.privacyStatus === 'released'; });
    var complete = released.filter(function(row) { return row.status === 'complete'; });
    var latest = complete.length ? complete[complete.length - 1] : null;
    return value.firstYear === series[0].year && value.lastObservedYear === series[series.length - 1].year &&
      value.lastObservedYearStatus === series[series.length - 1].status && value.yearsAvailable === series.length &&
      value.releasedYears === released.length && value.protectedYears === series.length - released.length &&
      value.latestCompleteYear === (latest ? latest.year : null) && value.latestCompleteEvents === (latest ? latest.events : null) &&
      value.latestCompleteParticipants === (latest ? latest.participants : null) &&
      (latest ? sameNumber(value.latestCompleteEventsPerParticipant, latest.eventsPerParticipant) : value.latestCompleteEventsPerParticipant === null) &&
      validComparison(value.defaultComparison, comparisonFor(complete));
  }
  function expectedActions(comparison) {
    var available = comparison && comparison.status === 'available' && /^\d{4}$/.test(comparison.fromYear || '') &&
      /^\d{4}$/.test(comparison.toYear || '') && comparison.fromYear < comparison.toYear;
    var question = available
      ? 'Compará movimientos ' + comparison.fromYear + ' y ' + comparison.toYear
      : 'Qué movimientos históricos están disponibles';
    return [
      { id: 'ask_movement_assistant', label: available ? 'Comparar ' + comparison.fromYear + ' y ' + comparison.toYear + ' con BOT IA' : 'Consultar movimientos con BOT IA', href: '/ia.html?question=' + encodeURIComponent(question), requiredCapability: 'navigation.ai-assistant' }
    ].concat(RELATED_ACTIONS);
  }
  function validActions(value, comparison) {
    var expected = expectedActions(comparison);
    return Array.isArray(value) && value.length === expected.length && value.every(function(action, index) {
      return exactKeys(action, ACTION_KEYS) && sameObject(action, expected[index]);
    });
  }
  function validLimits(value) {
    return exactKeys(value, LIMIT_KEYS) && value.privacyThreshold === 10 && sameArray(value.availableWindows, EXPECTED_WINDOWS) &&
      sameArray(value.availableMetrics, EXPECTED_METRICS) && value.classification === 'no_governed_movement_taxonomy';
  }
  function inspectContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== CONTRACT || value.policyVersion !== POLICY || !validSource(value.source) ||
        !sameObject(value.metric, EXPECTED_METRIC) || !validLimits(value.limits) || !validCoverage(value.coverage, value.source)) return null;
    var series = inspectSeries(value.series, value.source, value.limits.privacyThreshold);
    if (!series || !validSummary(value.summary, series) || !validActions(value.actions, value.summary.defaultComparison) ||
        value.summary.firstYear !== value.coverage.firstValidPeriod.slice(0, 4) ||
        value.summary.lastObservedYear !== value.coverage.lastValidPeriod.slice(0, 4)) return null;
    return deepFreeze(value);
  }

  global.MuniGrhMovementOperations = Object.freeze({ contract: CONTRACT, endpoint: ENDPOINT, inspectContract: inspectContract });
  var documentRef = global.document;
  if (!documentRef) return;
  function byId(id) { return documentRef.getElementById(id); }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function element(tag, className, text) { var node = documentRef.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function formatInteger(value) { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value); }
  function formatDecimal(value) { return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
  function formatPercent(value) { return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) + '%'; }
  function formatSigned(value, formatter) { if (value === null) return 'No disponible'; return (value > 0 ? '+' : '') + formatter(value); }
  function formatDate(value) { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')); }

  function parseDeepLink() {
    if (!global.location.search) return { filters: DEFAULT_FILTERS, invalid: false };
    var params;
    try { params = new URLSearchParams(global.location.search); } catch (_) { return { filters: DEFAULT_FILTERS, invalid: true }; }
    var allowed = ['metric', 'window', 'from', 'to'];
    var keys = Array.from(params.keys());
    var exact = keys.length > 0 && keys.every(function(key) { return allowed.indexOf(key) !== -1 && params.getAll(key).length === 1; });
    var metric = params.get('metric') || DEFAULT_FILTERS.metric;
    var windowValue = params.get('window') || DEFAULT_FILTERS.window;
    var from = params.get('from');
    var to = params.get('to');
    var yearsValid = (from === null && to === null) || (/^\d{4}$/.test(from || '') && /^\d{4}$/.test(to || '') && from < to);
    if (!exact || ['events', 'participants', 'intensity'].indexOf(metric) === -1 || ['5', '10', 'all'].indexOf(windowValue) === -1 || !yearsValid) {
      return { filters: DEFAULT_FILTERS, invalid: true };
    }
    return { filters: Object.freeze({ metric: metric, window: windowValue, from: from, to: to }), invalid: false };
  }
  function syncUrl() {
    var params = new URLSearchParams();
    params.set('metric', state.filters.metric);
    params.set('window', state.filters.window);
    if (state.filters.from && state.filters.to) { params.set('from', state.filters.from); params.set('to', state.filters.to); }
    try { global.history.replaceState(null, '', global.location.pathname + '?' + params.toString() + global.location.hash); } catch (_) {}
  }
  function visibleRows() {
    var rows = state.contract.series;
    if (state.filters.window === 'all') return rows;
    return rows.slice(-Number(state.filters.window));
  }
  function metricDefinition() {
    return state.filters.metric === 'participants'
      ? { key: 'participants', label: 'Participantes distintos', description: 'Claves compuestas de empleado distintas por año.', format: formatInteger }
      : state.filters.metric === 'intensity'
        ? { key: 'eventsPerParticipant', label: 'Movimientos por participante', description: 'Cociente entre movimientos válidos y participantes distintos.', format: formatDecimal }
        : { key: 'events', label: 'Movimientos registrados', description: 'Filas válidas de movimientos registradas por año.', format: formatInteger };
  }
  function renderChart() {
    var chart = byId('movementChart');
    clear(chart);
    var rows = visibleRows();
    var metric = metricDefinition();
    var released = rows.filter(function(row) { return row.privacyStatus === 'released'; });
    var maximum = Math.max.apply(Math, [0].concat(released.map(function(row) { return row[metric.key]; })));
    var bars = element('div', 'movement-chart-bars');
    bars.style.setProperty('--movement-points', String(Math.max(rows.length, 1)));
    rows.forEach(function(row) {
      var item = element('div', 'movement-chart-item');
      item.dataset.status = row.status;
      item.dataset.privacy = row.privacyStatus;
      var value = row.privacyStatus === 'released' ? row[metric.key] : null;
      var valueLabel = value === null ? 'Protegido' : metric.format(value);
      var height = value === null || maximum <= 0 ? 16 : Math.max(3, value / maximum * 100);
      var track = element('span', 'movement-chart-track');
      var fill = element('i', 'movement-chart-fill');
      fill.style.height = height + '%';
      track.appendChild(fill);
      item.setAttribute('aria-label', row.year + ': ' + valueLabel + '. ' + (row.status === 'partial' ? 'Año parcial.' : 'Año completo.'));
      item.append(element('strong', 'movement-chart-value', valueLabel), track, element('span', 'movement-chart-year', row.year));
      bars.appendChild(item);
    });
    chart.appendChild(bars);
    byId('movementChartDefinition').textContent = metric.description;
  }
  function completeReleasedRows() { return state.contract.series.filter(function(row) { return row.status === 'complete' && row.privacyStatus === 'released'; }); }
  function renderComparison() {
    var rows = completeReleasedRows();
    var from = rows.find(function(row) { return row.year === state.filters.from; });
    var to = rows.find(function(row) { return row.year === state.filters.to; });
    if (!from || !to || from.year >= to.year) {
      if (state.filters.from !== null || state.filters.to !== null) {
        state.invalidDeepLink = true;
        state.noticeKind = state.interactive ? 'selection' : 'deeplink';
      }
      var defaults = state.contract.summary.defaultComparison;
      from = rows.find(function(row) { return row.year === defaults.fromYear; }) || rows[rows.length - 2];
      to = rows.find(function(row) { return row.year === defaults.toYear; }) || rows[rows.length - 1];
      state.filters = Object.freeze({ metric: state.filters.metric, window: state.filters.window, from: from ? from.year : null, to: to ? to.year : null });
    }
    [['movementCompareFrom', from], ['movementCompareTo', to]].forEach(function(entry) {
      var select = byId(entry[0]);
      clear(select);
      rows.forEach(function(row) { var option = element('option', '', row.year); option.value = row.year; select.appendChild(option); });
      if (entry[1]) select.value = entry[1].year;
      select.disabled = rows.length < 2;
    });
    if (!from || !to) {
      ['movementEventsDelta', 'movementEventsDeltaPct', 'movementParticipantsDelta', 'movementParticipantsDeltaPct', 'movementIntensityDelta', 'movementIntensityDeltaPct'].forEach(function(id) { byId(id).textContent = 'No disponible'; });
      return;
    }
    var eventDelta = to.events - from.events;
    var participantDelta = to.participants - from.participants;
    var intensityDelta = round4(to.eventsPerParticipant - from.eventsPerParticipant);
    byId('movementEventsDelta').textContent = formatSigned(eventDelta, formatInteger);
    byId('movementEventsDeltaPct').textContent = formatSigned(round4(eventDelta / from.events * 100), formatPercent);
    byId('movementParticipantsDelta').textContent = formatSigned(participantDelta, formatInteger);
    byId('movementParticipantsDeltaPct').textContent = formatSigned(round4(participantDelta / from.participants * 100), formatPercent);
    byId('movementIntensityDelta').textContent = formatSigned(intensityDelta, formatDecimal);
    byId('movementIntensityDeltaPct').textContent = formatSigned(round4(intensityDelta / from.eventsPerParticipant * 100), formatPercent);
  }
  function renderTable() {
    var body = byId('movementTableBody');
    clear(body);
    state.contract.series.slice().reverse().forEach(function(item) {
      var row = element('tr');
      var coverage = element('span', 'movement-status', item.status === 'complete' ? 'Completo' : 'Parcial');
      coverage.dataset.state = item.status;
      var privacy = element('span', 'movement-status', item.privacyStatus === 'released' ? 'Publicado' : 'Protegido');
      privacy.dataset.state = item.privacyStatus;
      var values = item.privacyStatus === 'released'
        ? [formatInteger(item.events), formatInteger(item.participants), formatDecimal(item.eventsPerParticipant)]
        : ['Protegido', 'Protegido', 'Protegido'];
      var year = element('td', '', item.year);
      var status = element('td'); status.appendChild(coverage);
      var publication = element('td'); publication.appendChild(privacy);
      row.append(year, status, publication, element('td', 'movement-numeric', values[0]), element('td', 'movement-numeric', values[1]), element('td', 'movement-numeric', values[2]));
      body.appendChild(row);
    });
  }
  function renderActions() {
    var container = byId('movementActions'); clear(container);
    var projection = global.MuniAccess && global.MuniAccess.getValidatedSession ? global.MuniAccess.getValidatedSession() : null;
    var capabilities = projection ? projection.capabilities : [];
    state.contract.actions.forEach(function(action) {
      if (capabilities.indexOf(action.requiredCapability) === -1) return;
      var link = element('a', '', action.label); link.href = action.href; link.dataset.actionId = action.id; container.appendChild(link);
    });
  }
  function renderLimits() {
    var list = byId('movementLimits'); clear(list);
    [
      'Movimientos registrados, no altas/bajas/rotación.',
      'La fuente no posee una taxonomía gobernada para ingresos, egresos, promociones o transferencias.',
      'Para proteger identidades, los años con menos de ' + state.contract.limits.privacyThreshold + ' personas no se muestran ni se reemplazan por cero.',
      'El año del corte es parcial y la serie es histórica, no información en tiempo real.'
    ].forEach(function(copy) { list.appendChild(element('li', '', copy)); });
  }
  function renderFilterNotice(focus) {
    var notice = byId('movementDeepLinkNotice');
    notice.textContent = state.noticeKind === 'selection'
      ? 'La combinación elegida no forma un rango válido. Se restauró la comparación completa disponible.'
      : 'El enlace contenía filtros no válidos. Se aplicó la vista inicial segura.';
    notice.hidden = !state.invalidDeepLink;
    if (focus && state.invalidDeepLink) notice.focus({ preventScroll: true });
  }
  function renderContract(contract) {
    var coverage = contract.coverage;
    var summary = contract.summary;
    byId('movementSnapshotChip').textContent = 'Corte ' + formatDate(contract.source.snapshotAsOf);
    byId('movementPolicyChip').textContent = contract.policyVersion;
    byId('movementSourceName').textContent = contract.source.canonicalSystem;
    byId('movementSourceFile').textContent = contract.source.sourceTable + ' · ' + contract.source.sourceFile;
    byId('movementDetailFile').textContent = contract.source.sourceFile;
    byId('movementSourceHash').textContent = contract.source.sourceSha256;
    byId('movementValidRows').textContent = formatInteger(coverage.validRows);
    byId('movementValidRate').textContent = formatPercent(coverage.validRatePct) + ' de ' + formatInteger(coverage.sourceRows) + ' filas';
    byId('movementJoinRate').textContent = formatPercent(coverage.joinIntegrityPct);
    byId('movementCoveredKeys').textContent = formatInteger(coverage.distinctEmployeeKeys);
    byId('movementLatestYear').textContent = summary.latestCompleteYear || 'No disponible';
    byId('movementLatestYearMeta').textContent = summary.latestCompleteEvents === null ? 'Sin año completo publicable' : formatInteger(summary.latestCompleteEvents) + ' movimientos · ' + formatInteger(summary.latestCompleteParticipants) + ' participantes';
    byId('movementSourceRows').textContent = formatInteger(coverage.sourceRows);
    byId('movementQualityValidRows').textContent = formatInteger(coverage.validRows) + ' · ' + formatPercent(coverage.validRatePct);
    byId('movementQuarantineRows').textContent = formatInteger(coverage.quarantineRows);
    byId('movementLinkedRows').textContent = formatInteger(coverage.matchedRows) + ' · ' + formatPercent(coverage.joinIntegrityPct);
    byId('movementUnlinkedRows').textContent = formatInteger(coverage.orphanRows);
    byId('movementMetric').value = state.filters.metric;
    byId('movementWindow').value = state.filters.window;
    renderChart(); renderComparison(); renderTable(); renderActions(); renderLimits(); syncUrl();
    renderFilterNotice(false);
    byId('movementLoading').hidden = true;
    byId('movementError').hidden = true;
    byId('movementContent').hidden = false;
    byId('movementOperations').setAttribute('aria-busy', 'false');
    byId('movementSourceStatus').dataset.state = 'ready';
    byId('movementSourceStatusText').textContent = 'Serie verificada';
    if (state.invalidDeepLink) byId('movementDeepLinkNotice').focus({ preventScroll: true });
    state.interactive = true;
  }
  function showError(status) {
    var title = status === 403 ? 'Acceso no habilitado' : status === 503 ? 'Centro de movimientos no disponible' : 'Serie de movimientos no verificable';
    var message = status === 403 ? 'Tu perfil no tiene habilitada la analítica organizacional.' : status === 503 ? 'La fuente no está disponible. No se muestran cifras de reemplazo.' : 'La respuesta no cumple el contrato completo esperado.';
    byId('movementLoading').hidden = true; byId('movementContent').hidden = true; byId('movementError').hidden = false;
    byId('movementErrorTitle').textContent = title; byId('movementErrorMessage').textContent = message;
    byId('movementRetry').hidden = status === 403;
    byId('movementSourceStatus').dataset.state = 'error'; byId('movementSourceStatusText').textContent = title;
    byId('movementOperations').setAttribute('aria-busy', 'false'); byId('movementError').focus({ preventScroll: true });
  }
  async function load() {
    if (state.loading) return;
    state.loading = true;
    byId('movementLoading').hidden = false; byId('movementError').hidden = true; byId('movementContent').hidden = true;
    byId('movementOperations').setAttribute('aria-busy', 'true');
    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, { method: 'GET', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) { showError(response.status); return; }
      if (response.headers.get('X-MuniControl-Contract') !== CONTRACT) { showError(502); return; }
      var payload = inspectContract(await response.json());
      if (!payload) { showError(502); return; }
      state.contract = payload; renderContract(payload);
    } catch (_) { showError(503); }
    finally { state.loading = false; }
  }
  function updateFilters(next) {
    state.filters = Object.freeze({ metric: next.metric || state.filters.metric, window: next.window || state.filters.window, from: next.from === undefined ? state.filters.from : next.from, to: next.to === undefined ? state.filters.to : next.to });
    state.invalidDeepLink = false; state.noticeKind = null;
    renderChart(); renderComparison(); renderFilterNotice(true); syncUrl();
  }
  function bind() {
    byId('movementMetric').addEventListener('change', function(event) { updateFilters({ metric: event.target.value }); });
    byId('movementWindow').addEventListener('change', function(event) { updateFilters({ window: event.target.value }); });
    byId('movementCompareFrom').addEventListener('change', function(event) { updateFilters({ from: event.target.value }); });
    byId('movementCompareTo').addEventListener('change', function(event) { updateFilters({ to: event.target.value }); });
    byId('movementRetry').addEventListener('click', load);
  }
  async function init() {
    var parsed = parseDeepLink(); state.filters = parsed.filters; state.invalidDeepLink = parsed.invalid; state.noticeKind = parsed.invalid ? 'deeplink' : null; bind();
    var allowed = typeof global.requireCapability === 'function' ? await global.requireCapability(REQUIRED_CAPABILITY) : false;
    if (!allowed || !global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') { showError(403); return; }
    load();
  }
  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}(window));
