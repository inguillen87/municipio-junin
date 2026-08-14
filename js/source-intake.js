(function installSourceIntake(global) {
  'use strict';

  var CONTRACT = 'municipal-source-intake-v1';
  var ENDPOINT = '/api/source-intake';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var MAX_FILE_BYTES = 4 * 1024 * 1024;
  var ALLOWED_EXTENSIONS = Object.freeze(['csv', 'xlsx', 'xls', 'json', 'pdf', 'txt']);
  var SOURCE_DOMAINS = Object.freeze(['budget', 'purchases', 'treasury', 'accounting', 'hr', 'works', 'general']);
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
  var state = { root: null, projection: null, busy: false };

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
    else bind();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  global.MuniSourceIntake = Object.freeze({
    contract: CONTRACT,
    endpoint: ENDPOINT,
    maxFileBytes: MAX_FILE_BYTES,
  });
}(window));
