(function installSourceIntake(global) {
  'use strict';

  var CONTRACT = 'municipal-source-intake-v1';
  var ENDPOINT = '/api/source-intake';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var MAX_FILE_BYTES = 4 * 1024 * 1024;
  var ALLOWED_EXTENSIONS = Object.freeze(['csv', 'xlsx', 'xls', 'json', 'pdf', 'txt']);
  var SOURCE_DOMAINS = Object.freeze(['budget', 'purchases', 'treasury', 'accounting', 'hr', 'works', 'general']);
  var SOURCE_INTAKE_LIST_LIMIT = 20;
  var DOMAIN_LABELS = Object.freeze({
    budget: 'Presupuesto',
    purchases: 'Compras',
    treasury: 'Tesorería',
    accounting: 'Contabilidad',
    hr: 'Personal y GRH',
    works: 'Obras',
    general: 'Información general',
  });
  var PURPOSE_LABELS = Object.freeze({
    operational_analysis: 'Análisis operativo',
    reconciliation: 'Conciliación o control cruzado',
    official_reporting: 'Preparación de informe oficial',
  });
  var CLASSIFICATION_LABELS = Object.freeze({
    internal: 'Uso interno',
    confidential: 'Confidencial',
    restricted: 'Restringida',
  });
  var SOURCE_PURPOSES = Object.freeze(['operational_analysis', 'reconciliation', 'official_reporting']);
  var SOURCE_CLASSIFICATIONS = Object.freeze(['internal', 'confidential', 'restricted']);
  var SOURCE_AUTHORITIES = Object.freeze(['unverified', 'owner_confirmed']);
  var SOURCE_CURRENCIES = Object.freeze(['ARS', 'not_applicable']);
  var FINANCIAL_DOMAINS = Object.freeze(['budget', 'purchases', 'treasury', 'accounting']);
  var QUALITY_FIXED_CHECKS = Object.freeze({
    metadata_validated: Object.freeze(['passed', 'info']),
    file_within_limit: Object.freeze(['passed', 'info']),
    format_parsed: Object.freeze(['passed', 'info']),
    original_not_retained: Object.freeze(['blocked', 'high']),
    antimalware_not_run: Object.freeze(['blocked', 'high']),
  });
  var REQUIRED_LIMIT_CODES = Object.freeze([
    'original_not_retained', 'antimalware_not_run', 'quarantine_not_publication',
  ]);
  var METADATA_KEYS = Object.freeze([
    'sourceLabel', 'domain', 'referencePeriod', 'ownerOffice', 'purpose',
    'classification', 'authority', 'currency', 'containsPersonalData',
  ]);
  var PROFILE_KEYS = Object.freeze([
    'schemaVersion', 'schemaDigest', 'rowCount', 'columnCount', 'emptyCellRatePct',
    'duplicateRowRatePct', 'pageCount', 'lineCount', 'textBytes',
  ]);
  var state = {
    root: null,
    projection: null,
    busy: false,
    receipts: [],
    historyReady: false,
    selectedTab: 'new',
  };

  function element(id) { return global.document.getElementById(id); }

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype;
  }

  function exactKeys(value, expected) {
    if (!plainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index) {
      return key === wanted[index];
    });
  }

  function safeText(value, maximum) {
    return typeof value === 'string' && value === value.trim() && value.length > 0 &&
      value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
  }

  function safeToken(value) { return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value); }
  function nullableCount(value) { return value === null || (Number.isSafeInteger(value) && value >= 0); }
  function nullableRate(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
  }

  function exactIsoInstant(value) {
    if (typeof value !== 'string') return false;
    var milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
  }

  function exactAllowedExtensions(value) {
    return Array.isArray(value) && value.length === ALLOWED_EXTENSIONS.length &&
      value.every(function(extension) { return ALLOWED_EXTENSIONS.indexOf(extension) !== -1; }) &&
      new Set(value).size === ALLOWED_EXTENSIONS.length;
  }

  function validSource(value) {
    return exactKeys(value, [
      'label', 'domain', 'referencePeriod', 'ownerOffice', 'purpose',
      'classification', 'authority', 'currency', 'containsPersonalData',
    ]) && safeText(value.label, 120) && SOURCE_DOMAINS.indexOf(value.domain) !== -1 &&
      /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.referencePeriod || '') &&
      safeText(value.ownerOffice, 160) && SOURCE_PURPOSES.indexOf(value.purpose) !== -1 &&
      SOURCE_CLASSIFICATIONS.indexOf(value.classification) !== -1 &&
      SOURCE_AUTHORITIES.indexOf(value.authority) !== -1 &&
      SOURCE_CURRENCIES.indexOf(value.currency) !== -1 &&
      (FINANCIAL_DOMAINS.indexOf(value.domain) === -1 || value.currency === 'ARS') &&
      typeof value.containsPersonalData === 'boolean';
  }

  function validFile(value) {
    return exactKeys(value, ['extension', 'kind', 'sizeBytes', 'sha256']) &&
      ALLOWED_EXTENSIONS.indexOf(value.extension) !== -1 &&
      ['structured', 'pdf', 'text'].indexOf(value.kind) !== -1 &&
      Number.isSafeInteger(value.sizeBytes) && value.sizeBytes > 0 && value.sizeBytes <= MAX_FILE_BYTES &&
      /^[0-9a-f]{64}$/.test(value.sha256 || '');
  }

  function validProfile(value) {
    return exactKeys(value, PROFILE_KEYS) &&
      value.schemaVersion === 'municipal-source-intake-profile-v1' &&
      (value.schemaDigest === null || /^[0-9a-f]{64}$/.test(value.schemaDigest || '')) &&
      nullableCount(value.rowCount) && nullableCount(value.columnCount) &&
      nullableRate(value.emptyCellRatePct) && nullableRate(value.duplicateRowRatePct) &&
      nullableCount(value.pageCount) && nullableCount(value.lineCount) && nullableCount(value.textBytes);
  }

  function validQuality(value, source) {
    if (!exactKeys(value, ['status', 'checks', 'passedCount', 'blockedCount']) ||
        value.status !== 'blocked' || !Array.isArray(value.checks) || value.checks.length !== 7 ||
        !Number.isSafeInteger(value.passedCount) || value.passedCount < 0 ||
        !Number.isSafeInteger(value.blockedCount) || value.blockedCount < 1) return false;
    var codes = [];
    var byCode = Object.create(null);
    var passed = 0;
    var blocked = 0;
    for (var index = 0; index < value.checks.length; index += 1) {
      var check = value.checks[index];
      if (!exactKeys(check, ['code', 'status', 'severity', 'label']) || !safeToken(check.code) ||
          ['passed', 'blocked'].indexOf(check.status) === -1 ||
          ['info', 'high'].indexOf(check.severity) === -1 || !safeText(check.label, 180) ||
          codes.indexOf(check.code) !== -1) return false;
      codes.push(check.code);
      byCode[check.code] = check;
      if (check.status === 'passed') passed += 1;
      else blocked += 1;
    }
    if (passed !== value.passedCount || blocked !== value.blockedCount) return false;
    var fixedCodes = Object.keys(QUALITY_FIXED_CHECKS);
    for (var fixedIndex = 0; fixedIndex < fixedCodes.length; fixedIndex += 1) {
      var fixedCode = fixedCodes[fixedIndex];
      var expectedFixed = QUALITY_FIXED_CHECKS[fixedCode];
      if (!byCode[fixedCode] || byCode[fixedCode].status !== expectedFixed[0] ||
          byCode[fixedCode].severity !== expectedFixed[1]) return false;
    }
    var authorityConfirmed = source.authority === 'owner_confirmed';
    var expectedAuthority = authorityConfirmed ? 'authority_owner_confirmed' : 'authority_unverified';
    var unexpectedAuthority = authorityConfirmed ? 'authority_unverified' : 'authority_owner_confirmed';
    if (!byCode[expectedAuthority] || byCode[unexpectedAuthority] ||
        byCode[expectedAuthority].status !== (authorityConfirmed ? 'passed' : 'blocked') ||
        byCode[expectedAuthority].severity !== (authorityConfirmed ? 'info' : 'high')) return false;
    var declaresPersonalData = source.containsPersonalData;
    var expectedPersonal = declaresPersonalData ? 'personal_data_declared' : 'personal_data_not_declared';
    var unexpectedPersonal = declaresPersonalData ? 'personal_data_not_declared' : 'personal_data_declared';
    return Boolean(byCode[expectedPersonal]) && !byCode[unexpectedPersonal] &&
      byCode[expectedPersonal].status === (declaresPersonalData ? 'blocked' : 'passed') &&
      byCode[expectedPersonal].severity === (declaresPersonalData ? 'high' : 'info');
  }

  function validLimits(value) {
    if (!Array.isArray(value) || value.length !== REQUIRED_LIMIT_CODES.length) return false;
    var codes = [];
    return value.every(function(limit) {
      if (!exactKeys(limit, ['code', 'text']) || !safeToken(limit.code) ||
          !safeText(limit.text, 300) || REQUIRED_LIMIT_CODES.indexOf(limit.code) === -1 ||
          codes.indexOf(limit.code) !== -1) return false;
      codes.push(limit.code);
      return true;
    }) && REQUIRED_LIMIT_CODES.every(function(code) { return codes.indexOf(code) !== -1; });
  }

  function validReceipt(value, writeEnabled) {
    if (!exactKeys(value, [
      'id', 'status', 'createdAt', 'persisted', 'source', 'file', 'profile', 'quality', 'limits',
    ]) || !safeText(value.id, 160) || value.status !== 'quarantined' ||
        !exactIsoInstant(value.createdAt) ||
        value.persisted !== writeEnabled) return false;
    return validSource(value.source) && validFile(value.file) && validProfile(value.profile) &&
      validQuality(value.quality, value.source) && validLimits(value.limits);
  }

  function normalizeEnvelope(response, payload) {
    if (response.status !== 201 || response.headers.get(CONTRACT_HEADER) !== CONTRACT ||
        !exactKeys(payload, [
          'schemaVersion', 'mode', 'writeEnabled', 'maxFileBytes', 'allowedExtensions', 'receipt',
        ]) || payload.schemaVersion !== CONTRACT || payload.mode !== 'persistent_receipts' ||
        payload.writeEnabled !== true || payload.maxFileBytes !== MAX_FILE_BYTES ||
        !exactAllowedExtensions(payload.allowedExtensions) ||
        !validReceipt(payload.receipt, true)) return null;
    return payload.receipt;
  }

  function normalizeHistoryEnvelope(response, payload) {
    if (response.status !== 200 || response.headers.get(CONTRACT_HEADER) !== CONTRACT ||
        !exactKeys(payload, [
          'schemaVersion', 'mode', 'writeEnabled', 'maxFileBytes', 'allowedExtensions', 'receipts',
        ]) || payload.schemaVersion !== CONTRACT || payload.mode !== 'persistent_receipts' ||
        payload.writeEnabled !== true || payload.maxFileBytes !== MAX_FILE_BYTES ||
        !exactAllowedExtensions(payload.allowedExtensions) || !Array.isArray(payload.receipts) ||
        payload.receipts.length > SOURCE_INTAKE_LIST_LIMIT) return null;
    var ids = [];
    for (var index = 0; index < payload.receipts.length; index += 1) {
      var receipt = payload.receipts[index];
      if (!validReceipt(receipt, true) || ids.indexOf(receipt.id) !== -1) return null;
      ids.push(receipt.id);
    }
    return payload.receipts.slice();
  }

  function fileExtension(file) {
    if (!(file instanceof File) || typeof file.name !== 'string') return '';
    var match = /\.([^.]+)$/.exec(file.name.trim());
    return match ? match[1].toLowerCase() : '';
  }

  function validateFile(file, announce) {
    var message = '';
    if (!(file instanceof File)) message = 'Seleccioná un archivo para continuar.';
    else if (file.size < 1) message = 'El archivo está vacío y no puede diagnosticarse.';
    else if (file.size > MAX_FILE_BYTES) message = 'El archivo supera el máximo exacto de 4 MiB.';
    else if (ALLOWED_EXTENSIONS.indexOf(fileExtension(file)) === -1) {
      message = 'El formato no está admitido. Usá CSV, XLSX, XLS, JSON, PDF o TXT.';
    }
    var error = element('sourceFileError');
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    if (message && announce && element('sourceFile')) element('sourceFile').focus();
    return !message;
  }

  function updateCurrencyRule() {
    var domain = element('sourceDomain');
    var currency = element('sourceCurrency');
    if (!domain || !currency) return;
    var isFinancial = FINANCIAL_DOMAINS.indexOf(domain.value) !== -1;
    if (isFinancial) currency.value = 'ARS';
    var notApplicable = currency.querySelector('option[value="not_applicable"]');
    if (notApplicable) notApplicable.disabled = isFinancial;
  }

  function formMetadata(form) {
    var data = new FormData(form);
    var personalValue = data.get('containsPersonalData');
    if (personalValue !== 'true' && personalValue !== 'false') return null;
    var result = {};
    for (var index = 0; index < METADATA_KEYS.length; index += 1) {
      var key = METADATA_KEYS[index];
      var value = key === 'containsPersonalData' ? personalValue : data.get(key);
      if (typeof value !== 'string') return null;
      result[key] = key === 'containsPersonalData' ? value : value.trim();
    }
    return result;
  }

  function setBusy(value) {
    state.busy = value;
    var form = element('sourceIntakeForm');
    var submit = element('sourceIntakeSubmit');
    if (form) form.setAttribute('aria-busy', String(value));
    if (submit) {
      submit.disabled = value;
      submit.setAttribute('aria-busy', String(value));
      submit.textContent = value ? 'Generando diagnóstico…' : 'Generar diagnóstico';
    }
    if (state.root) {
      if (value) state.root.dataset.state = 'submitting';
      else if (state.root.dataset.state === 'submitting') state.root.dataset.state = 'ready';
    }
  }

  function clearMessages() {
    var result = element('sourceIntakeResult');
    var error = element('sourceIntakeError');
    if (result) result.hidden = true;
    if (error) error.hidden = true;
  }

  function formatInteger(value) {
    try { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value); }
    catch (error) { return String(value); }
  }

  function formatRate(value) {
    try {
      return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value) + '%';
    } catch (error) { return String(value) + '%'; }
  }

  function formatBytes(value) {
    if (value < 1024) return formatInteger(value) + ' bytes';
    var scaled = value < 1024 * 1024 ? value / 1024 : value / (1024 * 1024);
    var unit = value < 1024 * 1024 ? ' KiB' : ' MiB';
    try {
      return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(scaled) + unit;
    } catch (error) { return scaled.toFixed(2).replace('.', ',') + unit; }
  }

  function formatDateTime(value) {
    try {
      return new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date(value));
    } catch (error) { return value; }
  }

  function normalizedSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
  }

  function historyFact(root, label, value, code) {
    var wrapper = document.createElement('div');
    var term = document.createElement('dt');
    var detail = document.createElement('dd');
    term.textContent = label;
    if (code) {
      var codeNode = document.createElement('code');
      codeNode.textContent = value;
      detail.appendChild(codeNode);
    } else detail.textContent = value;
    wrapper.append(term, detail);
    root.appendChild(wrapper);
  }

  function historyProfileFacts(root, profile) {
    if (profile.rowCount !== null) historyFact(root, 'Filas detectadas', formatInteger(profile.rowCount));
    if (profile.columnCount !== null) historyFact(root, 'Columnas detectadas', formatInteger(profile.columnCount));
    if (profile.emptyCellRatePct !== null) historyFact(root, 'Celdas vacías', formatRate(profile.emptyCellRatePct));
    if (profile.duplicateRowRatePct !== null) historyFact(root, 'Filas duplicadas', formatRate(profile.duplicateRowRatePct));
    if (profile.pageCount !== null) historyFact(root, 'Páginas', formatInteger(profile.pageCount));
    if (profile.lineCount !== null) historyFact(root, 'Líneas', formatInteger(profile.lineCount));
    if (profile.textBytes !== null) historyFact(root, 'Texto perfilado', formatBytes(profile.textBytes));
    if (profile.schemaDigest !== null) historyFact(root, 'Huella del esquema', profile.schemaDigest, true);
  }

  function historyControl(label, status, kind) {
    var item = document.createElement('li');
    var title = document.createElement('strong');
    item.dataset.state = status;
    title.textContent = kind || (status === 'passed' ? 'Control superado' : 'Bloqueo vigente');
    item.appendChild(title);
    item.appendChild(document.createTextNode(label));
    return item;
  }

  function historyItem(receipt, index) {
    var item = document.createElement('li');
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    var identity = document.createElement('span');
    var label = document.createElement('strong');
    var metadata = document.createElement('span');
    var signal = document.createElement('span');
    var detail = document.createElement('div');
    var sourceSection = document.createElement('section');
    var technicalSection = document.createElement('section');
    var controlsSection = document.createElement('section');
    var limitsSection = document.createElement('section');
    var sourceTitle = document.createElement('h3');
    var technicalTitle = document.createElement('h3');
    var controlsTitle = document.createElement('h3');
    var limitsTitle = document.createElement('h3');
    var sourceFacts = document.createElement('dl');
    var technicalFacts = document.createElement('dl');
    var controls = document.createElement('ul');
    var limits = document.createElement('ul');
    var summaryId = 'sourceIntakeHistorySummary-' + index;

    item.className = 'source-intake-history__item';
    identity.className = 'source-intake-history__identity';
    signal.className = 'source-intake-history__signal';
    detail.className = 'source-intake-history__detail';
    sourceFacts.className = 'source-intake-history__facts';
    technicalFacts.className = 'source-intake-history__facts';
    controls.className = 'source-intake-history__controls';
    limits.className = 'source-intake-history__controls source-intake-history__limits';
    summary.id = summaryId;
    detail.setAttribute('role', 'region');
    detail.setAttribute('aria-labelledby', summaryId);

    label.textContent = receipt.source.label;
    metadata.textContent = DOMAIN_LABELS[receipt.source.domain] + ' · ' + receipt.source.referencePeriod +
      ' · ' + receipt.source.ownerOffice;
    signal.textContent = receipt.quality.blockedCount +
      (receipt.quality.blockedCount === 1 ? ' bloqueo de control' : ' bloqueos de control') + ' · En cuarentena';
    identity.append(label, metadata);
    summary.append(identity, signal);

    sourceTitle.textContent = 'Identidad y uso declarado';
    historyFact(sourceFacts, 'Área', DOMAIN_LABELS[receipt.source.domain]);
    historyFact(sourceFacts, 'Período', receipt.source.referencePeriod);
    historyFact(sourceFacts, 'Oficina', receipt.source.ownerOffice);
    historyFact(sourceFacts, 'Finalidad', PURPOSE_LABELS[receipt.source.purpose]);
    historyFact(sourceFacts, 'Clasificación', CLASSIFICATION_LABELS[receipt.source.classification]);
    historyFact(sourceFacts, 'Autoridad', receipt.source.authority === 'owner_confirmed' ? 'Confirmada' : 'Pendiente de confirmar');
    historyFact(sourceFacts, 'Datos personales', receipt.source.containsPersonalData ? 'Declarados o no descartados' : 'No declarados');
    historyFact(sourceFacts, 'Moneda', receipt.source.currency === 'ARS' ? 'Pesos argentinos (ARS)' : 'No corresponde');
    sourceSection.append(sourceTitle, sourceFacts);

    technicalTitle.textContent = 'Perfil técnico agregado';
    historyFact(technicalFacts, 'Recepción', formatDateTime(receipt.createdAt));
    historyFact(technicalFacts, 'Formato', receipt.file.extension.toUpperCase());
    historyFact(technicalFacts, 'Tamaño', formatBytes(receipt.file.sizeBytes));
    historyFact(technicalFacts, 'SHA-256', receipt.file.sha256, true);
    historyProfileFacts(technicalFacts, receipt.profile);
    technicalSection.append(technicalTitle, technicalFacts);

    controlsTitle.textContent = 'Controles de calidad · ' + receipt.quality.blockedCount + ' bloqueados';
    receipt.quality.checks.forEach(function(check) {
      controls.appendChild(historyControl(check.label, check.status));
    });
    limitsTitle.textContent = 'Límites del flujo · ' + receipt.limits.length;
    receipt.limits.forEach(function(limit) {
      limits.appendChild(historyControl(limit.text, 'blocked', 'Límite vigente'));
    });
    controlsSection.append(controlsTitle, controls);
    limitsSection.append(limitsTitle, limits);
    detail.append(sourceSection, technicalSection, controlsSection, limitsSection);
    details.append(summary, detail);
    details.addEventListener('toggle', function() {
      if (!details.open) return;
      var openDetails = element('sourceIntakeHistoryList').querySelectorAll('details[open]');
      for (var detailIndex = 0; detailIndex < openDetails.length; detailIndex += 1) {
        if (openDetails[detailIndex] !== details) openDetails[detailIndex].open = false;
      }
    });
    details.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && details.open) {
        event.preventDefault();
        details.open = false;
        summary.focus({ preventScroll: true });
      }
    });
    item.appendChild(details);
    return item;
  }

  function filteredHistory() {
    var query = normalizedSearch(element('sourceIntakeHistorySearch').value);
    var domain = element('sourceIntakeHistoryDomain').value;
    var attention = element('sourceIntakeHistoryAttention').value;
    return state.receipts.filter(function(receipt) {
      if (domain && receipt.source.domain !== domain) return false;
      if (attention === 'unverified' && receipt.source.authority !== 'unverified') return false;
      if (attention === 'personal' && !receipt.source.containsPersonalData) return false;
      if (attention === 'attention' && receipt.source.authority !== 'unverified' &&
          !receipt.source.containsPersonalData) return false;
      if (!query) return true;
      return normalizedSearch([
        receipt.source.label,
        receipt.source.ownerOffice,
        receipt.source.referencePeriod,
        DOMAIN_LABELS[receipt.source.domain],
        receipt.file.extension,
      ].join(' ')).indexOf(query) !== -1;
    });
  }

  function renderHistory() {
    var receipts = state.receipts;
    var visible = filteredHistory();
    var list = element('sourceIntakeHistoryList');
    var fragment = document.createDocumentFragment();
    var latest = receipts.reduce(function(result, receipt) {
      return !result || Date.parse(receipt.createdAt) > Date.parse(result) ? receipt.createdAt : result;
    }, null);
    element('sourceIntakeHistoryTotal').textContent = formatInteger(receipts.length);
    element('sourceIntakeHistoryAuthority').textContent = formatInteger(receipts.filter(function(receipt) {
      return receipt.source.authority === 'unverified';
    }).length);
    element('sourceIntakeHistoryPersonal').textContent = formatInteger(receipts.filter(function(receipt) {
      return receipt.source.containsPersonalData;
    }).length);
    element('sourceIntakeHistoryLatest').textContent = latest ? formatDateTime(latest) : 'Sin registros';
    visible.forEach(function(receipt, index) { fragment.appendChild(historyItem(receipt, index)); });
    list.replaceChildren(fragment);
    list.hidden = visible.length === 0;
    element('sourceIntakeHistorySummary').hidden = false;
    element('sourceIntakeHistoryFilters').hidden = receipts.length === 0;
    element('sourceIntakeHistoryStatus').hidden = false;
    if (receipts.length === 0) {
      element('sourceIntakeHistoryStatus').textContent = 'Todavía no hay comprobantes recientes en cuarentena.';
    } else if (visible.length === 0) {
      element('sourceIntakeHistoryStatus').textContent = 'No hay coincidencias. Ajustá la búsqueda o los filtros.';
    } else {
      element('sourceIntakeHistoryStatus').textContent = 'Mostrando ' + visible.length + ' de ' +
        receipts.length + ' comprobantes recientes.';
    }
  }

  function setHistoryLoading(value) {
    var history = element('sourceIntakeHistory');
    history.setAttribute('aria-busy', String(value));
    element('sourceIntakeHistoryReload').disabled = value;
    if (value) {
      history.dataset.state = 'loading';
      element('sourceIntakeHistoryStatus').hidden = false;
      element('sourceIntakeHistoryStatus').textContent = 'Cargando comprobantes recientes…';
      element('sourceIntakeHistoryError').hidden = true;
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      var payload = await response.json().catch(function() { return null; });
      var receipts = response.ok ? normalizeHistoryEnvelope(response, payload) : null;
      if (!receipts) throw new Error('SOURCE_INTAKE_HISTORY_INVALID');
      state.receipts = receipts;
      state.historyReady = true;
      element('sourceIntakeHistory').dataset.state = receipts.length ? 'ready' : 'empty';
      element('sourceIntakeHistoryError').hidden = true;
      renderHistory();
    } catch (error) {
      if (global.MuniAuth && global.MuniAuth.isAuthError(error)) return;
      state.receipts = [];
      state.historyReady = false;
      element('sourceIntakeHistory').dataset.state = 'error';
      element('sourceIntakeHistorySummary').hidden = true;
      element('sourceIntakeHistoryFilters').hidden = true;
      element('sourceIntakeHistoryList').replaceChildren();
      element('sourceIntakeHistoryList').hidden = true;
      element('sourceIntakeHistoryStatus').hidden = true;
      element('sourceIntakeHistoryError').hidden = false;
    } finally {
      setHistoryLoading(false);
    }
  }

  function updateHistoryWithReceipt(receipt) {
    if (!state.historyReady) return;
    state.receipts = [receipt].concat(state.receipts.filter(function(item) {
      return item.id !== receipt.id;
    })).slice(0, SOURCE_INTAKE_LIST_LIMIT);
    element('sourceIntakeHistory').dataset.state = 'ready';
    renderHistory();
  }

  function selectTab(name, focusPanel) {
    var historySelected = name === 'history';
    var historyTab = element('sourceIntakeHistoryTab');
    var newTab = element('sourceIntakeNewTab');
    state.selectedTab = historySelected ? 'history' : 'new';
    historyTab.setAttribute('aria-selected', String(historySelected));
    historyTab.tabIndex = historySelected ? 0 : -1;
    newTab.setAttribute('aria-selected', String(!historySelected));
    newTab.tabIndex = historySelected ? -1 : 0;
    element('sourceIntakeHistory').hidden = !historySelected;
    element('sourceIntakeNewPanel').hidden = historySelected;
    if (focusPanel) {
      if (historySelected) historyTab.focus({ preventScroll: true });
      else element('sourceLabel').focus({ preventScroll: true });
    }
  }

  function bindTabs() {
    var tabs = [element('sourceIntakeHistoryTab'), element('sourceIntakeNewTab')];
    tabs.forEach(function(tab, index) {
      tab.addEventListener('click', function() { selectTab(index === 0 ? 'history' : 'new', false); });
      tab.addEventListener('keydown', function(event) {
        var target = index;
        if (event.key === 'ArrowLeft') target = index === 0 ? tabs.length - 1 : index - 1;
        else if (event.key === 'ArrowRight') target = index === tabs.length - 1 ? 0 : index + 1;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = tabs.length - 1;
        else return;
        event.preventDefault();
        selectTab(target === 0 ? 'history' : 'new', false);
        tabs[target].focus({ preventScroll: true });
      });
    });
  }

  function bindHistory() {
    element('sourceIntakeHistorySearch').addEventListener('input', renderHistory);
    element('sourceIntakeHistoryDomain').addEventListener('change', renderHistory);
    element('sourceIntakeHistoryAttention').addEventListener('change', renderHistory);
    element('sourceIntakeHistoryClear').addEventListener('click', function() {
      element('sourceIntakeHistorySearch').value = '';
      element('sourceIntakeHistoryDomain').value = '';
      element('sourceIntakeHistoryAttention').value = '';
      renderHistory();
      element('sourceIntakeHistorySearch').focus({ preventScroll: true });
    });
    element('sourceIntakeHistoryReload').addEventListener('click', loadHistory);
  }

  function profileMetric(fragment, label, value) {
    var wrapper = document.createElement('div');
    var term = document.createElement('dt');
    var detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    fragment.appendChild(wrapper);
  }

  function renderProfile(profile) {
    var root = element('sourceIntakeProfile');
    var fragment = document.createDocumentFragment();
    if (profile.rowCount !== null) profileMetric(fragment, 'Filas detectadas', formatInteger(profile.rowCount));
    if (profile.columnCount !== null) profileMetric(fragment, 'Columnas detectadas', formatInteger(profile.columnCount));
    if (profile.emptyCellRatePct !== null) profileMetric(fragment, 'Celdas vacías', formatRate(profile.emptyCellRatePct));
    if (profile.duplicateRowRatePct !== null) profileMetric(fragment, 'Filas duplicadas', formatRate(profile.duplicateRowRatePct));
    if (profile.pageCount !== null) profileMetric(fragment, 'Páginas', formatInteger(profile.pageCount));
    if (profile.lineCount !== null) profileMetric(fragment, 'Líneas', formatInteger(profile.lineCount));
    if (profile.textBytes !== null) profileMetric(fragment, 'Texto extraído para perfil', formatBytes(profile.textBytes));
    if (profile.schemaDigest !== null) profileMetric(fragment, 'Huella del esquema', profile.schemaDigest);
    root.replaceChildren(fragment);
  }

  function checkItem(label, status) {
    var item = document.createElement('li');
    item.dataset.state = status;
    var body = document.createElement('span');
    var title = document.createElement('strong');
    title.textContent = status === 'passed' ? 'Control superado' : 'Bloqueo vigente';
    var copy = document.createElement('span');
    copy.textContent = label;
    body.append(title, copy);
    item.appendChild(body);
    return item;
  }

  function renderChecks(receipt) {
    var root = element('sourceIntakeChecks');
    var fragment = document.createDocumentFragment();
    receipt.quality.checks.forEach(function(check) {
      fragment.appendChild(checkItem(check.label, check.status));
    });
    receipt.limits.forEach(function(limit) {
      fragment.appendChild(checkItem(limit.text, 'blocked'));
    });
    root.replaceChildren(fragment);
  }

  function renderReceipt(receipt) {
    updateHistoryWithReceipt(receipt);
    element('sourceIntakeSha').textContent = receipt.file.sha256;
    element('sourceIntakeFormat').textContent = receipt.file.extension.toUpperCase() + ' · ' +
      (receipt.file.kind === 'structured' ? 'estructura tabular' : receipt.file.kind === 'pdf' ? 'documento PDF' : 'texto');
    element('sourceIntakeSize').textContent = formatBytes(receipt.file.sizeBytes);
    renderProfile(receipt.profile);
    renderChecks(receipt);
    element('sourceIntakeResultKicker').textContent = 'Comprobante técnico registrado';
    element('sourceIntakeResultSummary').textContent =
      'Se registró el comprobante técnico. El archivo no se conservó y ningún dato fue integrado ni publicado.';
    element('sourceIntakeStatePill').textContent = 'Cuarentena';
    var result = element('sourceIntakeResult');
    result.dataset.state = 'quarantined';
    result.hidden = false;
    element('sourceFile').value = '';
    element('sourceFileName').textContent = 'Ningún archivo seleccionado';
    result.focus({ preventScroll: true });
    result.scrollIntoView({ behavior: global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function safeErrorMessage(status, code) {
    if (status === 413 || code === 'SOURCE_INTAKE_FILE_TOO_LARGE') return 'El archivo supera el máximo de 4 MiB.';
    if (status === 415 || code === 'SOURCE_INTAKE_FORMAT_UNSUPPORTED') return 'El formato no está admitido por este ingreso.';
    if (status === 422 || code === 'SOURCE_INTAKE_INPUT_INVALID') return 'Revisá el archivo y los datos declarados. No se registró un diagnóstico.';
    if (status === 403) return 'Tu sesión no tiene autorización vigente para generar este diagnóstico.';
    if (status === 503) return 'El registro de ingresos no está disponible. No se declaró éxito ni se reintentó automáticamente.';
    return 'La respuesta no confirmó un diagnóstico válido. No se declaró éxito.';
  }

  function showError(message) {
    var error = element('sourceIntakeError');
    element('sourceIntakeErrorMessage').textContent = message;
    error.hidden = false;
    if (state.root) state.root.dataset.state = 'error';
    error.focus({ preventScroll: true });
  }

  async function submit(event) {
    event.preventDefault();
    if (state.busy || !state.projection) return;
    var form = event.currentTarget;
    clearMessages();
    updateCurrencyRule();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    var file = element('sourceFile').files[0];
    if (!validateFile(file, true)) return;
    var metadata = formMetadata(form);
    if (!metadata) {
      showError('No pudimos confirmar todos los datos obligatorios. Revisalos antes de continuar.');
      return;
    }
    var body = new FormData();
    METADATA_KEYS.forEach(function(key) { body.append(key, metadata[key]); });
    body.append('file', file, file.name);
    setBusy(true);
    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: body,
      });
      var payload = await response.json().catch(function() { return null; });
      if (!response.ok) {
        showError(safeErrorMessage(response.status, plainObject(payload) ? payload.code : ''));
        return;
      }
      var receipt = normalizeEnvelope(response, payload);
      if (!receipt) {
        showError('El servidor no confirmó el contrato municipal-source-intake-v1. No se declaró éxito.');
        return;
      }
      renderReceipt(receipt);
    } catch (error) {
      if (global.MuniAuth && global.MuniAuth.isAuthError(error)) return;
      showError('No pudimos verificar la respuesta. No se declaró éxito ni se reintentó automáticamente.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    var form = element('sourceIntakeForm');
    if (!form || state.busy) return;
    form.reset();
    updateCurrencyRule();
    clearMessages();
    validateFile(null, false);
    element('sourceFileError').hidden = true;
    element('sourceFileName').textContent = 'Ningún archivo seleccionado';
    state.root.dataset.state = 'ready';
    element('sourceLabel').focus({ preventScroll: true });
    state.root.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  function bind() {
    var form = element('sourceIntakeForm');
    var fileInput = element('sourceFile');
    form.addEventListener('submit', submit);
    element('sourceDomain').addEventListener('change', updateCurrencyRule);
    fileInput.addEventListener('change', function() {
      var file = fileInput.files[0];
      element('sourceFileName').textContent = file ? file.name : 'Ningún archivo seleccionado';
      validateFile(file, false);
    });
    element('sourceIntakeReset').addEventListener('click', reset);
  }

  function installPublishedReadOnlyMode() {
    var form = element('sourceIntakeForm');
    state.root.dataset.mode = 'evaluation_read_only';
    form.setAttribute('aria-disabled', 'true');
    form.addEventListener('submit', function(event) { event.preventDefault(); });
    var controls = form.querySelectorAll('input, select, textarea, button');
    for (var index = 0; index < controls.length; index += 1) controls[index].disabled = true;
    element('sourceIntakeSubmit').textContent = 'Disponible sólo con acceso privado';
    element('sourceFileName').textContent = 'Carga deshabilitada en evaluación pública';
    element('sourceIntakeSession').textContent = 'Evaluación · sólo lectura';
  }

  async function init() {
    if (typeof global.buildSidebar === 'function') global.buildSidebar('importar');
    var allowed = typeof global.requireCapability === 'function'
      ? await global.requireCapability('navigation.import')
      : false;
    var projection = allowed && global.MuniAccess &&
      typeof global.MuniAccess.getValidatedSession === 'function'
      ? global.MuniAccess.getValidatedSession()
      : null;
    if (!projection || !projection.user || !Array.isArray(projection.capabilities) ||
        projection.capabilities.indexOf('navigation.import') === -1) return;
    state.root = element('sourceIntakeApp');
    state.projection = projection;
    state.root.hidden = false;
    state.root.setAttribute('aria-busy', 'false');
    state.root.dataset.state = 'ready';
    element('sourceIntakeSession').textContent = 'Acceso confirmado';
    var published = typeof projection.user.id === 'string' &&
      projection.user.id.indexOf('published-evaluation:') === 0;
    element('sourceIntakeEvaluation').hidden = !published;
    element('sourceIntakeAuditLink').hidden = projection.capabilities.indexOf('navigation.audit') === -1;
    updateCurrencyRule();
    if (published) installPublishedReadOnlyMode();
    else {
      state.root.dataset.mode = 'private_operational';
      element('sourceIntakeEyebrow').textContent = 'Control de fuentes · operación privada';
      element('sourceIntakeTitle').textContent = 'Fuentes en cuarentena';
      element('sourceIntakeLead').textContent = 'Revisá los comprobantes recientes o abrí Nueva fuente para generar otro diagnóstico agregado.';
      bind();
      bindTabs();
      bindHistory();
      element('sourceIntakeTabs').hidden = false;
      selectTab('history', false);
      await loadHistory();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  global.MuniSourceIntake = Object.freeze({
    contract: CONTRACT,
    endpoint: ENDPOINT,
    maxFileBytes: MAX_FILE_BYTES,
  });
}(window));
