(function () {
  'use strict';

  var DOMAIN_ORDER = ['ausencia', 'calculo', 'legamov', 'licencia', 'totpago'];
  var FACT_ORDER = ['calculo', 'legamov', 'ausencia', 'licencia'];
  var COMPONENT_ORDER = [
    'temporalValidity',
    'referentialIntegrity',
    'payrollReconciliation',
    'legajoKeyUniqueness'
  ];
  var domainLabels = Object.freeze({
    ausencia: 'Ausencias',
    calculo: 'Control de cálculo',
    legamov: 'Movimientos',
    licencia: 'Licencias históricas',
    totpago: 'totpago diagnóstico'
  });
  var componentLabels = Object.freeze({
    temporalValidity: 'Validez temporal',
    referentialIntegrity: 'Integridad referencial',
    payrollReconciliation: 'Conciliación entre fuentes',
    legajoKeyUniqueness: 'Unicidad de clave de legajo'
  });
  var numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  var compactFormatter = new Intl.NumberFormat('es-AR', {
    notation: 'compact',
    maximumFractionDigits: 2
  });
  var decimalFormatter = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  var percentFormatter = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  });
  var dateFormatter = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
  var dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires'
  });
  var elements = {};
  var state = { controller: null, loadSequence: 0 };

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      'trustDashboard', 'connectionStatus', 'connectionStatusText', 'themeToggleBtn',
      'snapshotDate', 'snapshotMeta', 'profileSchema', 'semanticSchema', 'loadingState',
      'loadError', 'errorMessage', 'retryButton', 'dataViews', 'kpiQuality',
      'kpiQualityNote', 'kpiQuarantine', 'kpiQuarantineNote', 'kpiReconciliation',
      'kpiReconciliationNote', 'kpiReferential', 'kpiTables', 'kpiTablesNote',
      'kpiRows', 'qualityBadge', 'qualityBars', 'qualityFormula',
      'reconciliationScore', 'reconciliationContext', 'runCoverage',
      'metricExactness', 'valueAgreement', 'temporalBadge', 'quarantineTableBody',
      'quarantineReasonNote', 'coverageBadge', 'coverageTableBody', 'lineageSteps',
      'sourceFile', 'sourceHash', 'sourceSize', 'sourceSnapshot', 'profileGeneratedAt',
      'semanticGeneratedAt', 'riskBadge', 'riskRegister', 'actionQueue', 'privacyStatus'
    ].forEach(function (id) {
      elements[id] = byId(id);
    });
  }

  function setText(target, value) {
    if (target) target.textContent = String(value);
  }

  function clearNode(target) {
    while (target && target.firstChild) target.removeChild(target.firstChild);
  }

  function createElement(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function appendCell(row, text, className) {
    var cell = createElement('td', className || '', text);
    row.appendChild(cell);
    return cell;
  }

  function formatNumber(value) {
    return numberFormatter.format(value);
  }

  function formatCompact(value) {
    return compactFormatter.format(value);
  }

  function formatPercent(value) {
    return percentFormatter.format(value) + '%';
  }

  function formatDate(value) {
    return dateFormatter.format(new Date(value + 'T12:00:00Z')).replace(/\s+de\s+/g, ' ');
  }

  function formatDateTime(value) {
    return dateTimeFormatter.format(new Date(value));
  }

  function formatBytes(value) {
    return decimalFormatter.format(value / 1000000) + ' MB';
  }

  function renderSource(data) {
    setText(elements.snapshotDate, formatDate(data.source.snapshotAsOf));
    setText(
      elements.snapshotMeta,
      'Snapshot histórico validado mediante una proyección privada de calidad; no es tiempo real.'
    );
    setText(elements.profileSchema, data.lineage.profileSchemaVersion);
    setText(elements.semanticSchema, data.lineage.semanticSchemaVersion);
    setText(elements.sourceFile, data.source.sourceFile);
    setText(elements.sourceHash, data.source.sourceSha256);
    setText(elements.sourceSize, formatBytes(data.source.compressedSizeBytes));
    setText(elements.sourceSnapshot, formatDate(data.source.snapshotAsOf));
    setText(elements.profileGeneratedAt, formatDateTime(data.lineage.profileGeneratedAt));
    setText(elements.semanticGeneratedAt, formatDateTime(data.lineage.semanticGeneratedAt));
  }

  function renderQuality(data) {
    var quality = data.quality;
    setText(elements.kpiQuality, decimalFormatter.format(quality.score) + '/100');
    setText(elements.kpiQualityNote, 'Extracto agregado gobernado; alcance explícito.');
    setText(
      elements.kpiReferential,
      formatPercent(quality.components.referentialIntegrity.score)
    );
    setText(elements.qualityBadge, decimalFormatter.format(quality.score) + ' / 100');
    clearNode(elements.qualityBars);

    COMPONENT_ORDER.forEach(function (key) {
      var component = quality.components[key];
      var row = createElement('div', 'trust-bar-row');
      var label = createElement('div', 'trust-bar-label');
      label.appendChild(createElement('strong', '', componentLabels[key]));
      label.appendChild(
        createElement('span', '', 'Peso ' + decimalFormatter.format(component.weightPct) + '%')
      );
      var track = createElement('div', 'trust-bar-track');
      var fill = createElement('div', 'trust-bar-fill');
      fill.style.width = Math.max(0, Math.min(100, component.score)) + '%';
      track.appendChild(fill);
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(createElement('span', 'trust-bar-value', decimalFormatter.format(component.score)));
      elements.qualityBars.appendChild(row);
    });

    var formula = COMPONENT_ORDER.map(function (key) {
      var component = quality.components[key];
      return decimalFormatter.format(component.weightPct) + '% ' + componentLabels[key].toLowerCase();
    }).join(' + ');
    setText(
      elements.qualityFormula,
      'Puntaje = suma de cada componente × su peso (' + formula + '). ' +
      'Evalúa el extracto agregado gobernado, no la aptitud de cada tabla cruda.'
    );
  }

  function renderInventory(data) {
    var inventory = data.inventory;
    setText(elements.kpiTables, formatNumber(inventory.all.totalTables));
    setText(
      elements.kpiTablesNote,
      formatNumber(inventory.all.nonEmptyTables) + ' con filas · ' +
      formatNumber(inventory.all.emptyTables) + ' vacías.'
    );
    setText(elements.kpiRows, formatCompact(inventory.all.totalRows));
    elements.kpiRows.title = formatNumber(inventory.all.totalRows) + ' filas inventariadas';
  }

  function renderReconciliation(data) {
    var block = data.reconciliation;
    setText(elements.kpiReconciliation, decimalFormatter.format(block.scorePct) + '/100');
    setText(elements.kpiReconciliationNote, 'Diferencias materiales entre cálculo y totpago.');
    setText(elements.reconciliationScore, decimalFormatter.format(block.scorePct));
    setText(
      elements.reconciliationContext,
      formatNumber(block.fullyReconciledRuns) + ' de ' + formatNumber(block.matchedRuns) +
      ' corridas vinculadas conciliaron completamente.'
    );
    setText(elements.runCoverage, formatPercent(block.runCoveragePct));
    setText(elements.metricExactness, formatPercent(block.metricExactRatePct));
    setText(elements.valueAgreement, formatPercent(block.valueAgreementPct));
  }

  function renderTemporal(data) {
    var block = data.temporal;
    setText(elements.kpiQuarantine, formatNumber(block.quarantineRows));
    setText(elements.kpiQuarantineNote, 'Excluidas del universo válido por reglas temporales.');
    setText(elements.temporalBadge, formatNumber(block.quarantineRows) + ' filas');
    clearNode(elements.quarantineTableBody);

    DOMAIN_ORDER.forEach(function (key) {
      var item = block.domains[key];
      var row = document.createElement('tr');
      var nameCell = document.createElement('td');
      nameCell.appendChild(createElement('strong', '', domainLabels[key]));
      row.appendChild(nameCell);
      appendCell(row, key);
      appendCell(row, formatNumber(item.validRows));
      appendCell(row, formatNumber(item.quarantineRows), item.quarantineRows ? 'trust-cell-warn' : '');
      appendCell(row, formatPercent(item.validRatePct));
      appendCell(row, item.firstValidPeriod);
      appendCell(row, item.lastValidPeriod);
      elements.quarantineTableBody.appendChild(row);
    });

    setText(
      elements.quarantineReasonNote,
      'Las razones registran ' + formatNumber(block.quarantineReasonOccurrences) +
      ' ocurrencias no excluyentes; no representan filas adicionales. Licencias termina en ' +
      block.domains.licencia.lastValidPeriod + ' y se presenta como historia, no como vigencia actual.'
    );
  }

  function renderCoverage(data) {
    var block = data.referential;
    setText(elements.coverageBadge, formatNumber(block.legajo.uniqueKeys) + ' claves únicas');
    clearNode(elements.coverageTableBody);
    FACT_ORDER.forEach(function (key) {
      var fact = block.facts[key];
      var row = document.createElement('tr');
      var nameCell = document.createElement('td');
      nameCell.appendChild(createElement('strong', '', domainLabels[key] || key));
      row.appendChild(nameCell);
      appendCell(row, formatNumber(fact.rows));
      appendCell(row, formatPercent(fact.joinIntegrityPct));
      appendCell(row, formatNumber(fact.orphanRows), fact.orphanRows ? 'trust-cell-warn' : '');
      appendCell(row, formatPercent(fact.employeeCoveragePct));
      elements.coverageTableBody.appendChild(row);
    });
  }

  function addLineageStep(index, title, detail) {
    var step = createElement('div', 'trust-lineage-step');
    step.appendChild(createElement('span', 'trust-lineage-index', index));
    var copy = createElement('div', 'trust-lineage-copy');
    copy.appendChild(createElement('strong', '', title));
    copy.appendChild(createElement('span', '', detail));
    step.appendChild(copy);
    step.appendChild(createElement('span', 'trust-lineage-state', 'Validado'));
    elements.lineageSteps.appendChild(step);
  }

  function renderLineage(data) {
    clearNode(elements.lineageSteps);
    addLineageStep(
      '01',
      'Identidad del backup aprobada',
      'Archivo, SHA-256, tamaño, corte, fuente canónica y exclusiones fueron validados en el servidor.'
    );
    addLineageStep(
      '02',
      'Inventario focal reconciliado',
      formatNumber(data.inventory.focal.totalTables) + ' tablas de foco y ' +
      formatNumber(data.inventory.focal.totalRows) + ' filas coinciden con el diccionario completo.'
    );
    addLineageStep(
      '03',
      'Calidad agregada validada',
      'Contrato ' + data.schemaVersion + ' derivado de ' + data.lineage.semanticSchemaVersion +
      '; personas_junin permanece excluida.'
    );
    addLineageStep(
      '04',
      'Entrega mínima al navegador',
      'La sesión recibió sólo /api/grh-quality, sin profile, semantic, filas crudas, etiquetas, códigos ni series monetarias.'
    );
  }

  function addRisk(level, mark, title, detail) {
    var item = createElement('li', 'trust-risk');
    item.dataset.level = level;
    item.appendChild(createElement('span', 'trust-risk-mark', mark));
    var copy = document.createElement('div');
    copy.appendChild(createElement('strong', '', title));
    copy.appendChild(createElement('span', '', detail));
    item.appendChild(copy);
    elements.riskRegister.appendChild(item);
  }

  function renderRisks(data) {
    var risks = data.quality.risks;
    clearNode(elements.riskRegister);
    addRisk(
      'guarded', 'P', 'PII contenida en la frontera del servidor',
      'Esta proyección no exporta identificadores, etiquetas, códigos, filas crudas ni personas_junin.'
    );
    addRisk(
      'high', 'C', 'Conciliación cruzada con diferencias materiales',
      'El score ' + decimalFormatter.format(data.reconciliation.scorePct) +
      '/100 exige revisión; totpago sigue siendo diagnóstico.'
    );
    addRisk(
      'high', 'Q', formatNumber(risks.quarantinedTemporalRows) + ' filas en cuarentena',
      'No alimentan los universos válidos hasta revisar las reglas temporales.'
    );
    addRisk(
      'medium', 'H', 'Snapshot histórico, no tiempo real',
      'El corte es ' + formatDate(data.source.snapshotAsOf) + '; los cambios posteriores no están incluidos.'
    );
    addRisk(
      'medium', 'U', 'Moneda no declarada en la fuente',
      'No se rotula ningún importe como moneda, pago bancario o ejecución presupuestaria.'
    );
    addRisk(
      'medium', 'L', formatNumber(risks.legacyImportErrorRows) + ' filas en errorimportacion',
      'Es volumen histórico legacy; no equivale a errores activos de la plataforma.'
    );
    addRisk(
      'medium', 'A', formatNumber(risks.calculationControlAnomalousPeriods) +
      ' períodos de cálculo anómalos',
      'Las anomalías permanecen visibles; el último control está dentro de tolerancia de redondeo.'
    );
    addRisk(
      'medium', 'T', formatNumber(risks.suspiciousTextEncodingLabelCount) +
      ' etiqueta con codificación sospechosa',
      'Debe conciliarse con un catálogo aprobado; no se corrige silenciosamente.'
    );
    setText(elements.riskBadge, formatNumber(elements.riskRegister.children.length) + ' señales');
  }

  function addAction(index, title, detail) {
    var item = createElement('li', 'trust-action');
    item.appendChild(createElement('span', 'trust-action-mark', index));
    var copy = document.createElement('div');
    copy.appendChild(createElement('strong', '', title));
    copy.appendChild(createElement('span', '', detail));
    item.appendChild(copy);
    elements.actionQueue.appendChild(item);
  }

  function renderActions(data) {
    var risks = data.quality.risks;
    var reconciliation = data.reconciliation;
    clearNode(elements.actionQueue);
    addAction(
      '1', 'Conciliar cálculo con totpago',
      'Priorizar corridas no conciliadas: acuerdo de valores ' +
      formatPercent(reconciliation.valueAgreementPct) + ' y score ' +
      decimalFormatter.format(reconciliation.scorePct) + '/100.'
    );
    addAction(
      '2', 'Resolver cuarentena temporal',
      'Investigar ' + formatNumber(risks.quarantinedTemporalRows) +
      ' filas sin alterar el backup histórico; documentar corrección o exclusión.'
    );
    addAction(
      '3', 'Clasificar el legado de importación',
      'Determinar origen y vigencia de ' + formatNumber(risks.legacyImportErrorRows) +
      ' filas de errorimportacion antes de tratarlas como señal operativa.'
    );
    addAction(
      '4', 'Revisar anomalías y catálogo de textos',
      'Tratar ' + formatNumber(risks.calculationControlAnomalousPeriods) +
      ' períodos y ' + formatNumber(risks.suspiciousTextEncodingLabelCount) +
      ' etiqueta sospechosa con evidencia de fuente.'
    );
    addAction(
      '5', 'Preparar el siguiente corte gobernado',
      'Diseñar ingesta incremental, backup propio y restore probado antes de anunciar actualización diaria o tiempo real.'
    );
  }

  function renderPrivacy(data) {
    setText(
      elements.privacyStatus,
      'La proyección ' + data.schemaVersion +
      ' es sólo agregada: no contiene PII, identificadores, filas crudas, etiquetas de categorías, ' +
      'códigos de celdas ni series monetarias. personas_junin está excluida y el contrato bruto no llega al DOM.'
    );
  }

  function renderAll(data) {
    renderSource(data);
    renderQuality(data);
    renderInventory(data);
    renderReconciliation(data);
    renderTemporal(data);
    renderCoverage(data);
    renderLineage(data);
    renderRisks(data);
    renderActions(data);
    renderPrivacy(data);
    elements.loadingState.hidden = true;
    elements.loadError.hidden = true;
    elements.dataViews.hidden = false;
    elements.trustDashboard.setAttribute('aria-busy', 'false');
    elements.connectionStatus.dataset.state = 'ready';
    setText(elements.connectionStatusText, 'Proyección validada');
  }

  function resetView() {
    elements.dataViews.hidden = true;
    elements.loadError.hidden = true;
    elements.loadingState.hidden = false;
    elements.trustDashboard.setAttribute('aria-busy', 'true');
    delete elements.connectionStatus.dataset.state;
    setText(elements.connectionStatusText, 'Validando proyección');
    setText(elements.snapshotDate, '—');
    setText(elements.snapshotMeta, 'Esperando la proyección privada de calidad GRH.');
    setText(elements.profileSchema, '—');
    setText(elements.semanticSchema, '—');
  }

  function safeErrorMessage(error) {
    if (error && error.status === 401) return 'La sesión no es válida; se requiere un nuevo acceso seguro.';
    if (error && error.status === 403) return 'El rol o municipio actual no está autorizado para esta evidencia.';
    if (error && error.code === 'GRH_REQUEST_TIMEOUT') return 'La validación superó el tiempo máximo de espera.';
    if (error && error.code === 'GRH_REQUEST_ABORTED') return 'La validación anterior fue cancelada.';
    return 'La proyección privada no está disponible o no supera su contrato. No se muestran cifras.';
  }

  function showError(error) {
    setText(elements.errorMessage, safeErrorMessage(error));
    elements.loadingState.hidden = true;
    elements.dataViews.hidden = true;
    elements.loadError.hidden = false;
    elements.trustDashboard.setAttribute('aria-busy', 'false');
    elements.connectionStatus.dataset.state = 'error';
    setText(elements.connectionStatusText, 'Evidencia bloqueada');
  }

  function redirectToSafeWorkspace() {
    try {
      if (!window.sessionStorage.getItem('mjunin_access_notice')) {
        window.sessionStorage.setItem('mjunin_access_notice', 'El perfil actual no tiene habilitada la superficie solicitada.');
      }
    } catch (error) {}
    var currentPage = window.location.pathname.split('/').pop() || '';
    if (currentPage !== 'inicio.html') window.location.replace('inicio.html');
  }

  async function requirePageCapability() {
    if (typeof window.requireCapability !== 'function') {
      redirectToSafeWorkspace();
      return false;
    }
    try {
      var allowed = await window.requireCapability('navigation.data-quality');
      if (allowed !== true) {
        redirectToSafeWorkspace();
        return false;
      }
      return true;
    } catch (error) {
      redirectToSafeWorkspace();
      return false;
    }
  }

  async function loadDashboard() {
    var sequence = state.loadSequence + 1;
    state.loadSequence = sequence;
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    resetView();
    try {
      if (!window.MuniGrhData || typeof window.MuniGrhData.loadQuality !== 'function') {
        throw new Error('GRH_SECURE_CLIENT_UNAVAILABLE');
      }
      var quality = await window.MuniGrhData.loadQuality({
        timeoutMs: 12000,
        signal: state.controller.signal
      });
      if (sequence !== state.loadSequence) return;
      renderAll(quality);
    } catch (error) {
      if (sequence !== state.loadSequence) return;
      showError(error);
      if (!error || error.code !== 'GRH_REQUEST_ABORTED') {
        console.error('[Calidad GRH] Proyección bloqueada:', error && error.code ? error.code : 'UNKNOWN');
      }
    }
  }

  async function loadAuthorizedDashboard() {
    if (!await requirePageCapability()) return;
    await loadDashboard();
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    elements.themeToggleBtn.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
    elements.themeToggleBtn.setAttribute(
      'aria-label',
      next === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'
    );
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'light' ? '#edf3fa' : '#07111f';
    try {
      localStorage.setItem('govtech_theme', next);
    } catch (_) {
      /* Preferencia no persistible. */
    }
  }

  function bindEvents() {
    elements.retryButton.addEventListener('click', loadAuthorizedDashboard);
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    elements.themeToggleBtn.setAttribute('aria-pressed', light ? 'true' : 'false');
    elements.themeToggleBtn.setAttribute(
      'aria-label',
      light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'
    );
  }

  async function init() {
    cacheElements();
    bindEvents();
    if (typeof window.buildSidebar === 'function') window.buildSidebar('control');
    if (window.MuniAuthReady && typeof window.MuniAuthReady.then === 'function') {
      var valid = await window.MuniAuthReady;
      if (!valid) return;
    }
    if (!await requirePageCapability()) return;
    await loadDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
