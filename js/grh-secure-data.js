(function (global) {
  'use strict';

  var EXECUTIVE_ENDPOINT = '/api/grh-executive';
  var QUALITY_ENDPOINT = '/api/grh-quality';
  var DEFAULT_TIMEOUT_MS = 15000;
  var MAX_TIMEOUT_MS = 60000;
  var PROTECTED_BUCKET = 'Otros (celdas protegidas)';
  var QUALITY_SCOPE = 'governed_aggregate_extract_not_fitness_of_every_raw_grh_table';
  var TEMPORAL_DOMAINS = Object.freeze(['ausencia', 'calculo', 'legamov', 'licencia', 'totpago']);
  var REFERENTIAL_FACTS = Object.freeze(['calculo', 'legamov', 'ausencia', 'licencia']);
  var QUALITY_COMPONENTS = Object.freeze([
    'temporalValidity',
    'referentialIntegrity',
    'payrollReconciliation',
    'legajoKeyUniqueness'
  ]);
  var AMOUNT_KEYS = Object.freeze([
    'grossWithFamilyAllowancesCents',
    'employeeWithholdingsCents',
    'netPayrollCents',
    'employerContributionsCents'
  ]);

  var SHAPES = Object.freeze({
    executive: ['schemaVersion', 'policyVersion', 'source', 'privacy', 'workforce', 'compensation', 'absence', 'leave', 'movements'],
    executiveSource: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'realtime'],
    executivePrivacy: ['audience', 'interactiveThreshold', 'sensitiveThreshold', 'portableThreshold', 'protectedBucketLabel'],
    workforce: ['definition', 'referencePeriod', 'payrollParticipants', 'bySector', 'byCostCenter', 'byAgreement'],
    ranking: ['threshold', 'totalParticipants', 'participantDisplay', 'privacyStatus', 'rows'],
    rankingRow: ['companyCode', 'sourceCode', 'label', 'participants', 'participantDisplay', 'sharePct', 'privacyStatus'],
    compensation: ['currency', 'amountUnit', 'metricStatus', 'series'],
    monetaryRow: ['period', 'participantCount', 'participantDisplay', 'privacyStatus', 'amounts'],
    sensitiveDomain: ['sourceTable', 'metric', 'series'],
    sensitiveRow: ['period', 'value', 'participantCount', 'participantDisplay', 'privacyStatus'],
    quality: ['schemaVersion', 'source', 'lineage', 'privacy', 'inventory', 'quality', 'temporal', 'referential', 'reconciliation'],
    qualitySource: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'compressedSizeBytes', 'realtime', 'excludedSources'],
    lineage: ['profileSchemaVersion', 'semanticSchemaVersion', 'profileGeneratedAt', 'semanticGeneratedAt'],
    qualityPrivacy: ['aggregateOnly', 'containsPii', 'employeeIdentifiersExported', 'rawRowsExported', 'categoricalLabelsExported', 'cellCodesExported', 'monetarySeriesExported'],
    inventory: ['all', 'focal', 'remainder'],
    inventoryGroup: ['totalTables', 'nonEmptyTables', 'emptyTables', 'totalRows'],
    qualityBody: ['score', 'scope', 'components', 'risks'],
    component: ['score', 'weightPct'],
    risks: ['rawSourceContainsSensitivePii', 'historicalSnapshotNotRealtime', 'currencyNotDeclaredInSource', 'legacyImportErrorRows', 'quarantinedTemporalRows', 'totpagoCrossSourceMismatch', 'calculationControlAnomalousPeriods', 'latestCalculationControlWithinRoundingTolerance', 'suspiciousTextEncodingLabelCount'],
    temporal: ['rows', 'validRows', 'quarantineRows', 'validRatePct', 'dateMonthMismatchRows', 'quarantineReasonOccurrences', 'domains'],
    temporalDomain: ['rows', 'validRows', 'quarantineRows', 'validRatePct', 'validPeriods', 'firstValidPeriod', 'lastValidPeriod', 'firstValidYear', 'lastValidYear', 'dateMonthMismatchRows', 'quarantineReasonOccurrences'],
    referential: ['legajo', 'facts'],
    legajo: ['rows', 'uniqueKeys', 'uniquenessPct'],
    fact: ['rows', 'matchedRows', 'orphanRows', 'joinIntegrityPct', 'distinctEmployeeKeys', 'validMatchedEmployeeKeys', 'employeeCoveragePct'],
    reconciliation: ['status', 'totpagoDiagnosticStatus', 'metricStatus', 'currencyStatus', 'toleranceCents', 'calculationRuns', 'totpagoRuns', 'unionRuns', 'matchedRuns', 'fullyReconciledRuns', 'runCoveragePct', 'metricExactRatePct', 'valueAgreementPct', 'scorePct', 'absoluteVarianceCents']
  });

  var SAFE_MESSAGES = Object.freeze({
    GRH_CLIENT_UNAVAILABLE: 'El cliente autenticado de datos no esta disponible.',
    GRH_CLIENT_UNSUPPORTED: 'El navegador no admite la carga segura de datos.',
    GRH_OPTIONS_INVALID: 'La configuracion de carga GRH no es valida.',
    GRH_REQUEST_TIMEOUT: 'La consulta GRH excedio el tiempo permitido.',
    GRH_REQUEST_ABORTED: 'La consulta GRH fue cancelada.',
    GRH_REQUEST_FAILED: 'No se pudo consultar la fuente GRH.',
    GRH_HTTP_ERROR: 'La fuente GRH respondio con un estado no exitoso.',
    GRH_RESPONSE_INVALID: 'La respuesta GRH no es valida.',
    GRH_RESPONSE_NOT_JSON: 'La fuente GRH no entrego un contrato JSON.',
    GRH_RESPONSE_INVALID_JSON: 'La fuente GRH entrego un JSON invalido.',
    GRH_EXECUTIVE_CONTRACT_INVALID: 'El contrato ejecutivo GRH fue rechazado.',
    GRH_QUALITY_CONTRACT_INVALID: 'El contrato de calidad GRH fue rechazado.',
    GRH_SOURCE_IDENTITY_MISMATCH: 'Las proyecciones GRH no pertenecen al mismo corte.'
  });

  function GrhDataError(code, status) {
    this.name = 'GrhDataError';
    this.message = SAFE_MESSAGES[code] || 'La operacion GRH fue rechazada.';
    this.code = code;
    this.status = validStatus(status) ? status : 0;
    if (Error.captureStackTrace) Error.captureStackTrace(this, GrhDataError);
  }

  GrhDataError.prototype = Object.create(Error.prototype);
  GrhDataError.prototype.constructor = GrhDataError;

  function validStatus(value) {
    return Number.isInteger(value) && value >= 100 && value <= 599;
  }

  function fail(code, status) {
    throw new GrhDataError(code, status);
  }

  function record(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, keys) {
    if (!record(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    return actual.length === expected.length && actual.every(function (key, index) {
      return key === expected[index];
    });
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function percentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function closeTo(left, right, tolerance) {
    return Number.isFinite(left) && Number.isFinite(right) &&
      Math.abs(left - right) <= (tolerance || 0.0001);
  }

  function calculatedPercentage(numerator, denominator) {
    return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(4));
  }

  function shortText(value, maxLength) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function validSource(source, shape) {
    return exactKeys(source, shape) &&
      shortText(source.canonicalSystem, 80) && /grh/i.test(source.canonicalSystem) &&
      /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(source.sourceFile) &&
      /^[0-9a-f]{64}$/.test(source.sourceSha256) &&
      /^\d{4}-\d{2}-\d{2}$/.test(source.snapshotAsOf) &&
      Number.isFinite(Date.parse(source.snapshotAsOf + 'T00:00:00Z')) &&
      source.realtime === false;
  }

  function safeCode(value) {
    return nonNegativeInteger(value) || (
      shortText(value, 64) && /^[A-Za-z0-9._/-]+$/.test(value)
    );
  }

  function validRanking(ranking, totalParticipants, expectedThreshold) {
    if (!exactKeys(ranking, SHAPES.ranking) ||
        ranking.threshold !== expectedThreshold ||
        ranking.totalParticipants !== totalParticipants ||
        ranking.participantDisplay !== String(totalParticipants) ||
        !['released', 'partially_suppressed'].includes(ranking.privacyStatus) ||
        !Array.isArray(ranking.rows) || ranking.rows.length === 0 || ranking.rows.length > 101) {
      return false;
    }

    var sum = 0;
    var protectedRows = 0;
    var identities = new Set();
    for (var index = 0; index < ranking.rows.length; index += 1) {
      var row = ranking.rows[index];
      if (!exactKeys(row, SHAPES.rankingRow) || !nonNegativeInteger(row.participants) ||
          row.participantDisplay !== String(row.participants) || !percentage(row.sharePct) ||
          !closeTo(row.sharePct, Number(((row.participants / totalParticipants) * 100).toFixed(4)))) {
        return false;
      }

      if (row.privacyStatus === 'released') {
        if (!safeCode(row.companyCode) || !safeCode(row.sourceCode) ||
            !shortText(row.label, 256) || row.label === PROTECTED_BUCKET ||
            row.participants < expectedThreshold) return false;
        var identity = String(row.companyCode) + ':' + String(row.sourceCode) + ':' + row.label;
        if (identities.has(identity)) return false;
        identities.add(identity);
      } else if (row.privacyStatus === 'protected_aggregate') {
        protectedRows += 1;
        if (row.companyCode !== null || row.sourceCode !== null || row.label !== PROTECTED_BUCKET ||
            row.participants < expectedThreshold) return false;
      } else {
        return false;
      }
      sum += row.participants;
    }

    return sum === totalParticipants && protectedRows <= 1 &&
      ranking.privacyStatus === (protectedRows === 0 ? 'released' : 'partially_suppressed');
  }

  function validMonetarySeries(series) {
    if (!Array.isArray(series) || series.length === 0 || series.length > 1000) return false;
    var periods = new Set();
    for (var index = 0; index < series.length; index += 1) {
      var row = series[index];
      if (!exactKeys(row, SHAPES.monetaryRow) || !exactKeys(row.amounts, AMOUNT_KEYS)) return false;
      var periodIsSafe = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.period || '');
      if (row.period !== null && (!periodIsSafe || periods.has(row.period))) return false;
      if (row.period !== null) periods.add(row.period);

      if (row.privacyStatus === 'released') {
        if (!periodIsSafe || !nonNegativeInteger(row.participantCount) || row.participantCount < 10 ||
            row.participantDisplay !== String(row.participantCount) ||
            !AMOUNT_KEYS.every(function (key) { return nonNegativeInteger(row.amounts[key]); })) return false;
      } else if (row.privacyStatus === 'suppressed') {
        if (row.participantCount !== null || row.participantDisplay !== '<10' ||
            !AMOUNT_KEYS.every(function (key) { return row.amounts[key] === null; })) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  function validSensitiveDomain(domain, expectedTable, audience) {
    if (!exactKeys(domain, SHAPES.sensitiveDomain) || domain.sourceTable !== expectedTable ||
        domain.metric !== 'valid_rows_by_year' || !Array.isArray(domain.series) ||
        domain.series.length > 200) return false;
    var periods = new Set();
    var suppressedRows = 0;
    var sawPortableSuppressed = false;
    for (var index = 0; index < domain.series.length; index += 1) {
      var row = domain.series[index];
      if (!exactKeys(row, SHAPES.sensitiveRow)) return false;
      var periodIsSafe = /^\d{4}$/.test(row.period || '');
      if (row.period !== null && (!periodIsSafe || periods.has(row.period))) return false;
      if (row.period !== null) periods.add(row.period);
      if (row.privacyStatus === 'released') {
        if (audience === 'portable' && sawPortableSuppressed) return false;
        if (!periodIsSafe || !nonNegativeInteger(row.value) || !nonNegativeInteger(row.participantCount) ||
            row.participantCount < 10 || row.participantCount > row.value ||
            row.participantDisplay !== String(row.participantCount)) return false;
      } else if (row.privacyStatus === 'suppressed') {
        suppressedRows += 1;
        if (audience === 'portable') {
          sawPortableSuppressed = true;
          if (row.period !== null) return false;
        }
        if (row.value !== null || row.participantCount !== null || row.participantDisplay !== '<10') return false;
      } else {
        return false;
      }
    }
    return suppressedRows === 0 || suppressedRows >= 2;
  }

  function validExecutive(data) {
    if (!exactKeys(data, SHAPES.executive) || data.schemaVersion !== 'grh-executive-v2' ||
        data.policyVersion !== 'grh-small-cell-v1' ||
        !validSource(data.source, SHAPES.executiveSource)) return false;

    var privacy = data.privacy;
    if (!exactKeys(privacy, SHAPES.executivePrivacy) ||
        !['interactive', 'portable'].includes(privacy.audience) ||
        privacy.interactiveThreshold !== 5 || privacy.sensitiveThreshold !== 10 ||
        privacy.portableThreshold !== 10 || privacy.protectedBucketLabel !== PROTECTED_BUCKET) return false;

    var workforceThreshold = privacy.audience === 'portable'
      ? privacy.portableThreshold
      : privacy.interactiveThreshold;

    var workforce = data.workforce;
    if (!exactKeys(workforce, SHAPES.workforce) || !shortText(workforce.definition, 1000) ||
        !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(workforce.referencePeriod) ||
        !positiveInteger(workforce.payrollParticipants)) return false;
    if (!validRanking(workforce.bySector, workforce.payrollParticipants, workforceThreshold) ||
        !validRanking(workforce.byCostCenter, workforce.payrollParticipants, workforceThreshold) ||
        !validRanking(workforce.byAgreement, workforce.payrollParticipants, workforceThreshold)) return false;

    var compensation = data.compensation;
    if (!exactKeys(compensation, SHAPES.compensation) ||
        compensation.currency !== 'not_declared_in_source' ||
        compensation.amountUnit !== 'source_currency_cents' ||
        compensation.metricStatus !== 'calculation_control_not_bank_disbursement' ||
        !validMonetarySeries(compensation.series)) return false;

    return validSensitiveDomain(data.absence, 'ausencia', privacy.audience) &&
      validSensitiveDomain(data.leave, 'licencia', privacy.audience) &&
      validSensitiveDomain(data.movements, 'legamov', privacy.audience);
  }

  function validInventoryGroup(group) {
    return exactKeys(group, SHAPES.inventoryGroup) &&
      SHAPES.inventoryGroup.every(function (field) { return nonNegativeInteger(group[field]); }) &&
      group.totalTables === group.nonEmptyTables + group.emptyTables &&
      group.totalRows >= group.nonEmptyTables &&
      ((group.totalRows === 0) === (group.nonEmptyTables === 0));
  }

  function validTemporalDomain(row) {
    if (!exactKeys(row, SHAPES.temporalDomain)) return false;
    var integerFields = ['rows', 'validRows', 'quarantineRows', 'validPeriods', 'firstValidYear',
      'lastValidYear', 'dateMonthMismatchRows', 'quarantineReasonOccurrences'];
    return integerFields.every(function (field) { return nonNegativeInteger(row[field]); }) &&
      row.rows > 0 && row.rows === row.validRows + row.quarantineRows &&
      percentage(row.validRatePct) && closeTo(row.validRatePct, calculatedPercentage(row.validRows, row.rows)) &&
      row.dateMonthMismatchRows <= row.rows && row.quarantineReasonOccurrences >= row.quarantineRows &&
      /^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.firstValidPeriod) &&
      /^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.lastValidPeriod) &&
      row.firstValidPeriod <= row.lastValidPeriod &&
      row.firstValidYear === Number(row.firstValidPeriod.slice(0, 4)) &&
      row.lastValidYear === Number(row.lastValidPeriod.slice(0, 4)) &&
      row.firstValidYear <= row.lastValidYear;
  }

  function validReferentialFact(row, uniqueKeys) {
    if (!exactKeys(row, SHAPES.fact)) return false;
    var integerFields = ['rows', 'matchedRows', 'orphanRows', 'distinctEmployeeKeys', 'validMatchedEmployeeKeys'];
    return integerFields.every(function (field) { return nonNegativeInteger(row[field]); }) &&
      row.rows > 0 && row.rows === row.matchedRows + row.orphanRows &&
      row.distinctEmployeeKeys <= uniqueKeys && row.validMatchedEmployeeKeys <= row.distinctEmployeeKeys &&
      percentage(row.joinIntegrityPct) &&
      closeTo(row.joinIntegrityPct, calculatedPercentage(row.matchedRows, row.rows)) &&
      percentage(row.employeeCoveragePct) &&
      closeTo(row.employeeCoveragePct, calculatedPercentage(row.validMatchedEmployeeKeys, uniqueKeys));
  }

  function validQuality(data) {
    if (!exactKeys(data, SHAPES.quality) || data.schemaVersion !== 'grh-quality-v1' ||
        !validSource(data.source, SHAPES.qualitySource) ||
        !positiveInteger(data.source.compressedSizeBytes) ||
        !Array.isArray(data.source.excludedSources) || data.source.excludedSources.length !== 1 ||
        data.source.excludedSources[0] !== 'personas_junin') return false;

    var lineage = data.lineage;
    if (!exactKeys(lineage, SHAPES.lineage) || lineage.profileSchemaVersion !== 'grh-profile-v1' ||
        !/^grh-semantic-v[1-9]\d*$/.test(lineage.semanticSchemaVersion) ||
        !validIsoTimestamp(lineage.profileGeneratedAt) || !validIsoTimestamp(lineage.semanticGeneratedAt)) return false;

    var privacy = data.privacy;
    if (!exactKeys(privacy, SHAPES.qualityPrivacy) || privacy.aggregateOnly !== true ||
        privacy.containsPii !== false || privacy.employeeIdentifiersExported !== false ||
        privacy.rawRowsExported !== false || privacy.categoricalLabelsExported !== false ||
        privacy.cellCodesExported !== false || privacy.monetarySeriesExported !== false) return false;

    var inventory = data.inventory;
    if (!exactKeys(inventory, SHAPES.inventory) || !validInventoryGroup(inventory.all) ||
        !validInventoryGroup(inventory.focal) || !validInventoryGroup(inventory.remainder)) return false;
    for (var inventoryIndex = 0; inventoryIndex < SHAPES.inventoryGroup.length; inventoryIndex += 1) {
      var inventoryField = SHAPES.inventoryGroup[inventoryIndex];
      if (inventory.all[inventoryField] !== inventory.focal[inventoryField] + inventory.remainder[inventoryField]) return false;
    }
    if (!positiveInteger(inventory.all.totalTables) || !positiveInteger(inventory.all.totalRows) ||
        !positiveInteger(inventory.focal.totalTables) || !positiveInteger(inventory.focal.totalRows)) return false;

    var temporal = data.temporal;
    if (!exactKeys(temporal, SHAPES.temporal) || !exactKeys(temporal.domains, TEMPORAL_DOMAINS)) return false;
    var temporalTotals = {
      rows: 0,
      validRows: 0,
      quarantineRows: 0,
      dateMonthMismatchRows: 0,
      quarantineReasonOccurrences: 0
    };
    for (var domainIndex = 0; domainIndex < TEMPORAL_DOMAINS.length; domainIndex += 1) {
      var domain = temporal.domains[TEMPORAL_DOMAINS[domainIndex]];
      if (!validTemporalDomain(domain)) return false;
      Object.keys(temporalTotals).forEach(function (field) { temporalTotals[field] += domain[field]; });
    }
    var temporalFields = Object.keys(temporalTotals);
    for (var totalIndex = 0; totalIndex < temporalFields.length; totalIndex += 1) {
      var totalField = temporalFields[totalIndex];
      if (temporal[totalField] !== temporalTotals[totalField]) return false;
    }
    if (!percentage(temporal.validRatePct) ||
        !closeTo(temporal.validRatePct, calculatedPercentage(temporal.validRows, temporal.rows)) ||
        temporal.rows > inventory.focal.totalRows) return false;

    var referential = data.referential;
    if (!exactKeys(referential, SHAPES.referential) || !exactKeys(referential.legajo, SHAPES.legajo) ||
        !positiveInteger(referential.legajo.rows) || !nonNegativeInteger(referential.legajo.uniqueKeys) ||
        referential.legajo.uniqueKeys > referential.legajo.rows || !percentage(referential.legajo.uniquenessPct) ||
        !closeTo(referential.legajo.uniquenessPct,
          calculatedPercentage(referential.legajo.uniqueKeys, referential.legajo.rows)) ||
        !exactKeys(referential.facts, REFERENTIAL_FACTS)) return false;
    for (var factIndex = 0; factIndex < REFERENTIAL_FACTS.length; factIndex += 1) {
      if (!validReferentialFact(referential.facts[REFERENTIAL_FACTS[factIndex]], referential.legajo.uniqueKeys)) return false;
    }

    if (!validReconciliation(data.reconciliation) || !validQualityScore(data.quality, data)) return false;
    return true;
  }

  function validIsoTimestamp(value) {
    return typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value));
  }

  function validReconciliation(row) {
    if (!exactKeys(row, SHAPES.reconciliation) ||
        !['reconciled', 'material_differences_detected'].includes(row.status) ||
        row.totpagoDiagnosticStatus !== 'not_cross_source_reconciled' ||
        row.metricStatus !== 'calculation_control_not_bank_disbursement' ||
        row.currencyStatus !== 'not_declared_in_source') return false;
    var integerFields = ['toleranceCents', 'calculationRuns', 'totpagoRuns', 'unionRuns',
      'matchedRuns', 'fullyReconciledRuns', 'absoluteVarianceCents'];
    var rateFields = ['runCoveragePct', 'metricExactRatePct', 'valueAgreementPct', 'scorePct'];
    if (!integerFields.every(function (field) { return nonNegativeInteger(row[field]); }) ||
        !rateFields.every(function (field) { return percentage(row[field]); })) return false;
    var expectedScore = Number(((row.runCoveragePct + row.metricExactRatePct + row.valueAgreementPct) / 3).toFixed(4));
    return row.unionRuns === row.calculationRuns + row.totpagoRuns - row.matchedRuns &&
      row.matchedRuns <= row.calculationRuns && row.matchedRuns <= row.totpagoRuns &&
      row.fullyReconciledRuns <= row.matchedRuns &&
      closeTo(row.runCoveragePct, calculatedPercentage(row.matchedRuns, row.unionRuns)) &&
      closeTo(row.scorePct, expectedScore) &&
      row.status === (row.scorePct === 100 ? 'reconciled' : 'material_differences_detected');
  }

  function validQualityScore(quality, data) {
    if (!exactKeys(quality, SHAPES.qualityBody) || !percentage(quality.score) ||
        quality.scope !== QUALITY_SCOPE || !exactKeys(quality.components, QUALITY_COMPONENTS) ||
        !exactKeys(quality.risks, SHAPES.risks)) return false;
    var weight = 0;
    var score = 0;
    for (var index = 0; index < QUALITY_COMPONENTS.length; index += 1) {
      var component = quality.components[QUALITY_COMPONENTS[index]];
      if (!exactKeys(component, SHAPES.component) || !percentage(component.score) ||
          !percentage(component.weightPct)) return false;
      weight += component.weightPct;
      score += component.score * component.weightPct / 100;
    }
    if (!closeTo(weight, 100, 0.000001) || !closeTo(quality.score, Number(score.toFixed(2)), 0.001)) return false;

    var risks = quality.risks;
    var booleanRisks = ['rawSourceContainsSensitivePii', 'historicalSnapshotNotRealtime',
      'currencyNotDeclaredInSource', 'totpagoCrossSourceMismatch',
      'latestCalculationControlWithinRoundingTolerance'];
    var countRisks = ['legacyImportErrorRows', 'quarantinedTemporalRows',
      'calculationControlAnomalousPeriods', 'suspiciousTextEncodingLabelCount'];
    if (!booleanRisks.every(function (field) { return typeof risks[field] === 'boolean'; }) ||
        !countRisks.every(function (field) { return nonNegativeInteger(risks[field]); })) return false;
    return risks.rawSourceContainsSensitivePii === true &&
      risks.historicalSnapshotNotRealtime === !data.source.realtime &&
      risks.currencyNotDeclaredInSource === (data.reconciliation.currencyStatus === 'not_declared_in_source') &&
      risks.quarantinedTemporalRows === data.temporal.quarantineRows &&
      risks.totpagoCrossSourceMismatch === (data.reconciliation.status === 'material_differences_detected') &&
      risks.legacyImportErrorRows <= data.inventory.all.totalRows &&
      risks.calculationControlAnomalousPeriods <= data.temporal.domains.calculo.validPeriods;
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }

  function normalizeOptions(options) {
    if (options === undefined) return { timeoutMs: DEFAULT_TIMEOUT_MS, signal: null };
    if (!record(options) || !Object.keys(options).every(function (key) {
      return key === 'timeoutMs' || key === 'signal';
    })) fail('GRH_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      fail('GRH_OPTIONS_INVALID');
    }
    var signal = options.signal === undefined ? null : options.signal;
    if (signal !== null && (!record(signal) || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
      fail('GRH_OPTIONS_INVALID');
    }
    return { timeoutMs: timeoutMs, signal: signal };
  }

  function createControl(options) {
    if (typeof global.AbortController !== 'function' || typeof global.setTimeout !== 'function' ||
        typeof global.clearTimeout !== 'function') fail('GRH_CLIENT_UNSUPPORTED');
    var normalized = normalizeOptions(options);
    var controller = new global.AbortController();
    var timedOut = false;
    var callerAborted = false;
    var external = normalized.signal;
    var onExternalAbort = function () {
      callerAborted = true;
      if (!controller.signal.aborted) controller.abort();
    };
    if (external) {
      if (external.aborted) onExternalAbort();
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }
    var timer = global.setTimeout(function () {
      timedOut = true;
      if (!controller.signal.aborted) controller.abort();
    }, normalized.timeoutMs);

    return {
      signal: controller.signal,
      timedOut: function () { return timedOut; },
      callerAborted: function () { return callerAborted; },
      abortPeer: function () { if (!controller.signal.aborted) controller.abort(); },
      cleanup: function () {
        global.clearTimeout(timer);
        if (external) external.removeEventListener('abort', onExternalAbort);
      }
    };
  }

  function mapFailure(error, control) {
    if (error instanceof GrhDataError) return error;
    if (control.timedOut()) return new GrhDataError('GRH_REQUEST_TIMEOUT', 408);
    if (control.callerAborted()) return new GrhDataError('GRH_REQUEST_ABORTED');
    var status = error && validStatus(error.status) ? error.status : 0;
    return new GrhDataError('GRH_REQUEST_FAILED', status);
  }

  async function runControlled(options, operation) {
    var control = createControl(options);
    try {
      if (control.callerAborted()) fail('GRH_REQUEST_ABORTED');
      return await operation(control);
    } catch (error) {
      throw mapFailure(error, control);
    } finally {
      control.cleanup();
    }
  }

  function jsonContentType(response) {
    if (!response.headers || typeof response.headers.get !== 'function') return false;
    var value = response.headers.get('content-type');
    return typeof value === 'string' &&
      /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
  }

  async function requestContract(endpoint, validator, invalidCode, signal) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') fail('GRH_CLIENT_UNAVAILABLE');
    var response = await global.MuniAuth.fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: signal
    });
    if (!response || !validStatus(response.status) || typeof response.ok !== 'boolean') {
      fail('GRH_RESPONSE_INVALID', 502);
    }
    if (!response.ok || response.status < 200 || response.status >= 300) {
      fail('GRH_HTTP_ERROR', response.status);
    }
    if (!jsonContentType(response)) fail('GRH_RESPONSE_NOT_JSON', 502);
    if (typeof response.json !== 'function') fail('GRH_RESPONSE_INVALID', 502);

    var payload;
    try {
      payload = await response.json();
    } catch (_) {
      fail('GRH_RESPONSE_INVALID_JSON', 502);
    }
    if (!validator(payload)) fail(invalidCode, 502);
    return deepFreeze(payload);
  }

  function loadExecutive(options) {
    return runControlled(options, function (control) {
      return requestContract(
        EXECUTIVE_ENDPOINT,
        validExecutive,
        'GRH_EXECUTIVE_CONTRACT_INVALID',
        control.signal
      );
    });
  }

  function loadQuality(options) {
    return runControlled(options, function (control) {
      return requestContract(
        QUALITY_ENDPOINT,
        validQuality,
        'GRH_QUALITY_CONTRACT_INVALID',
        control.signal
      );
    });
  }

  function sameSource(executive, quality) {
    return executive.source.sourceSha256 === quality.source.sourceSha256 &&
      executive.source.snapshotAsOf === quality.source.snapshotAsOf &&
      executive.source.canonicalSystem === quality.source.canonicalSystem;
  }

  function loadExperience(options) {
    return runControlled(options, async function (control) {
      var requests = [
        requestContract(EXECUTIVE_ENDPOINT, validExecutive, 'GRH_EXECUTIVE_CONTRACT_INVALID', control.signal),
        requestContract(QUALITY_ENDPOINT, validQuality, 'GRH_QUALITY_CONTRACT_INVALID', control.signal)
      ];
      var values;
      try {
        values = await Promise.all(requests);
      } catch (error) {
        control.abortPeer();
        throw error;
      }
      if (!sameSource(values[0], values[1])) fail('GRH_SOURCE_IDENTITY_MISMATCH', 502);
      return deepFreeze({ executive: values[0], quality: values[1] });
    });
  }

  global.MuniGrhData = Object.freeze({
    loadExecutive: loadExecutive,
    loadQuality: loadQuality,
    loadExperience: loadExperience
  });
})(window);
