(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-workforce-finance';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var CONTRACT = 'grh-workforce-finance-v1';
  var SOURCE_CONTRACT = 'grh-workforce-finance-source-v1';
  var POLICY = 'grh-workforce-finance-privacy-v1';
  var THRESHOLD = 10;
  var MONTHS = 24;
  var DEFAULT_TIMEOUT_MS = 12000;
  var MAX_TIMEOUT_MS = 60000;
  var MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
  var PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
  var SHA256 = /^[0-9a-f]{64}$/;
  var APPROVED_SOURCE = Object.freeze({
    canonicalSystem: 'GRH Junín',
    sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
    sourceSha256: 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9',
    compressedSizeBytes: 44537741,
    snapshotAsOf: '2026-08-06'
  });
  var APPROVED_RELEASE_ID = 'e9460c55eaa819146c263f251f96eb269e18fbaad3fb279240e8950187abbe43';
  var MAX_OBSERVABLES_PER_VIEW = 13;
  var MAX_PROTECTED_TARGET_STATES_PER_PERIOD = 32768;
  var MAX_SUBSET_EQUATIONS_PER_PERIOD = 12000000;
  var COMPONENT_KEYS = Object.freeze([
    'grossWithFamilyAllowancesCents',
    'contributoryEarningsCents',
    'nonContributoryEarningsCents',
    'familyAllowancesCents',
    'employeeWithholdingsCents',
    'netPayrollCents',
    'netToPayCents',
    'employerContributionsCents'
  ]);
  var CONTROL_KEYS = Object.freeze([
    'netIdentityVarianceCents',
    'netToPayVarianceCents',
    'roundingToleranceCents',
    'identityExactlyReconciled',
    'identityWithinRoundingTolerance'
  ]);
  var RECONCILIATION_KEYS = Object.freeze([
    'calculationRuns',
    'totpagoRuns',
    'matchedRuns',
    'fullyReconciledRuns',
    'runCoveragePct',
    'metricExactRatePct',
    'valueAgreementPct',
    'absoluteVarianceCents'
  ]);
  var CHANGE_KEYS = Object.freeze([
    'status',
    'reason',
    'previousPeriod',
    'distinctParticipantsDelta',
    'grossWithFamilyAllowancesDeltaCents',
    'employeeWithholdingsDeltaCents',
    'netPayrollDeltaCents',
    'employerContributionsDeltaCents',
    'netPayrollDeltaPct'
  ]);
  var DIMENSIONS = Object.freeze(['sector', 'costCenter', 'agreement']);
  var SOURCE_DIMENSIONS = Object.freeze({
    sector: 'sector',
    costCenter: 'cost_center',
    agreement: 'agreement'
  });
  var SHAPES = Object.freeze({
    top: ['schemaVersion', 'policyVersion', 'releaseId', 'source', 'metric', 'cohort', 'privacy', 'capabilities', 'periodTotals', 'dimensionViews', 'quality'],
    source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'compressedSizeBytes', 'snapshotAsOf', 'generatedAt', 'latestValidCalculationPeriod', 'profileSchemaVersion', 'semanticSchemaVersion', 'realtime'],
    metric: ['grain', 'sourceCurrencyStatus', 'amountUnit', 'presentationSchemaVersion', 'presentationCurrency', 'presentationCurrencyBasis', 'presentationCurrencyEffectiveOn', 'presentationLocale', 'status', 'allocationBasis', 'allocationRule', 'interpretation'],
    cohort: ['participantDefinition', 'assignmentMode', 'assignmentGrain', 'assignmentSemantics', 'publishedWindowMonths', 'firstPeriod', 'lastPeriod', 'oneWayDimensions', 'participantsMayOverlapAcrossCategories'],
    privacy: ['threshold', 'aggregateOnly', 'containsPii', 'employeeIdentifiersExported', 'rawRowsExported', 'arbitraryFiltersAllowed', 'intersectionsAllowed', 'primarySuppression', 'complementarySuppression', 'crossPeriodProtection', 'smallOverlapProtection', 'releasedAmountsRemainArithmeticallyComparable', 'protectedBucketLabel'],
    capabilities: ['cohortFinance', 'cellArithmeticControl', 'periodCrossSourceReconciliation', 'cohortCrossSourceReconciliation', 'cohortAbsence', 'cohortLeave'],
    periodTotal: ['period', 'participantCount', 'participantDisplay', 'privacyStatus', 'components', 'control', 'reconciliation'],
    view: ['dimension', 'assignmentSemantics', 'periods'],
    dimensionPeriod: ['period', 'privacyStatus', 'participantAccounting', 'cells'],
    accounting: ['periodDistinctParticipants', 'sumCellDistinctParticipantsObserved', 'multiCategoryParticipants', 'multiCategoryParticipantDisplay', 'multiCategoryPrivacyStatus', 'participantsMayOverlap'],
    cell: ['companyCode', 'sourceCode', 'label', 'distinctParticipantsObserved', 'participantDisplay', 'participantPrivacyStatus', 'allocationSharePct', 'privacyStatus', 'components', 'control', 'change'],
    quality: ['calculation', 'references', 'assignment', 'participantSetReconciliation', 'amountSigns', 'partitionChecks', 'warnings'],
    calculation: ['sourceRows', 'validRows', 'quarantineRows', 'validRatePct', 'windowRows', 'windowControlRows', 'windowPeriods'],
    reference: ['dimension', 'observedCodes', 'resolvedCodes', 'unresolvedCodes', 'observedControlRuns', 'resolvedControlRuns', 'coveragePct'],
    assignment: ['employeePeriodRuns', 'invalidEmployeePeriodRuns', 'dimensionRunChecks', 'multiCategoryEmployeePeriods'],
    runCheck: ['dimension', 'employeePeriodRuns', 'validRuns', 'ambiguousRuns', 'missingCodeRuns', 'unresolvedReferenceRuns', 'invalidEmployeeKeyRuns', 'coveragePct'],
    multiQuality: ['dimension', 'employeePeriods', 'multiCategoryEmployeePeriods', 'multiCategoryPct'],
    participantReconciliation: ['periodsChecked', 'exactPeriods', 'mismatchedPeriods', 'allCalculoEmployeePeriods', 'controlEmployeePeriods', 'controlCohortUsedForFinance'],
    amountSigns: ['periodsChecked', 'periodsWithNonpositiveNetPayroll', 'negativePeriodComponents', 'dimensions'],
    dimensionSigns: ['dimension', 'cellsChecked', 'negativeComponentCells', 'allocationPeriodsAvailable', 'allocationPeriodsUnavailable'],
    partition: ['dimension', 'periodsChecked', 'componentIdentityFailures', 'netAllocationIdentityFailures', 'allocationShareFailures']
  });
  var FORBIDDEN_KEYS = new Set([
    'legajo', 'employee', 'employeekey', 'displayname', 'nombre', 'apellido',
    'dni', 'cuil', 'cbu', 'email', 'phone', 'telefono', 'address', 'domicilio'
  ]);

  function WorkforceFinanceError(code, status) {
    this.name = 'WorkforceFinanceError';
    this.code = code;
    this.status = Number.isInteger(status) ? status : 0;
    this.message = ({
      WORKFORCE_FINANCE_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      WORKFORCE_FINANCE_OPTIONS_INVALID: 'La configuración de carga no es válida.',
      WORKFORCE_FINANCE_REQUEST_TIMEOUT: 'La consulta excedió el tiempo permitido.',
      WORKFORCE_FINANCE_REQUEST_ABORTED: 'La consulta fue cancelada.',
      WORKFORCE_FINANCE_REQUEST_FAILED: 'No se pudo consultar la proyección financiera.',
      WORKFORCE_FINANCE_HTTP_ERROR: 'La proyección financiera respondió con un estado no exitoso.',
      WORKFORCE_FINANCE_RESPONSE_TOO_LARGE: 'La proyección financiera excedió el límite permitido.',
      WORKFORCE_FINANCE_RESPONSE_INVALID: 'La respuesta financiera no es válida.',
      WORKFORCE_FINANCE_CONTRACT_INVALID: 'El contrato financiero fue rechazado.'
    })[code] || 'La proyección financiera fue rechazada.';
    if (Error.captureStackTrace) Error.captureStackTrace(this, WorkforceFinanceError);
  }

  WorkforceFinanceError.prototype = Object.create(Error.prototype);
  WorkforceFinanceError.prototype.constructor = WorkforceFinanceError;

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

  function snakeKey(value) {
    return value.replace(/[A-Z]/g, function (letter) {
      return '_' + letter.toLowerCase();
    });
  }

  function toSnake(value) {
    if (Array.isArray(value)) return value.map(toSnake);
    if (!record(value)) return value;
    return Object.fromEntries(Object.keys(value).map(function (key) {
      return [snakeKey(key), toSnake(value[key])];
    }));
  }

  function mapSourceDimensions(value) {
    if (Array.isArray(value)) {
      value.forEach(mapSourceDimensions);
      return;
    }
    if (!record(value)) return;
    if (typeof value.dimension === 'string') {
      value.dimension = SOURCE_DIMENSIONS[value.dimension] || value.dimension;
    }
    Object.keys(value).forEach(function (key) { mapSourceDimensions(value[key]); });
  }

  function projectionToSource(value) {
    var raw = toSnake(value);
    raw.schema_version = SOURCE_CONTRACT;
    raw.source.file = raw.source.source_file;
    raw.source.sha256 = raw.source.source_sha256;
    delete raw.source.source_file;
    delete raw.source.source_sha256;
    raw.metric = {
      grain: raw.metric.grain,
      currency: raw.metric.source_currency_status,
      amount_unit: raw.metric.amount_unit,
      status: raw.metric.status,
      allocation_basis: raw.metric.allocation_basis,
      allocation_rule: raw.metric.allocation_rule,
      interpretation: raw.metric.interpretation
    };
    raw.cohort.one_way_dimensions = raw.cohort.one_way_dimensions.map(function (item) {
      return SOURCE_DIMENSIONS[item] || item;
    });
    mapSourceDimensions(raw.dimension_views);
    mapSourceDimensions(raw.quality);
    return raw;
  }

  function canonicalReleaseNumber(value) {
    if (!Number.isFinite(value)) throw new TypeError('non-finite release number');
    if (Object.is(value, -0) || value === 0) return '0';
    if (Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) throw new TypeError('unsafe release integer');
      return String(value);
    }
    var fixed = value.toFixed(4);
    if (Number(fixed) !== value) throw new TypeError('release number exceeds four decimals');
    return fixed.replace(/0+$/, '').replace(/\.$/, '');
  }

  function canonicalReleaseJson(value) {
    if (Array.isArray(value)) {
      return '[' + value.map(canonicalReleaseJson).join(',') + ']';
    }
    if (record(value)) {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + canonicalReleaseJson(value[key]);
      }).join(',') + '}';
    }
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return canonicalReleaseNumber(value);
    throw new TypeError('release content is not canonical JSON');
  }

  async function digestHex(value) {
    if (!global.crypto || !global.crypto.subtle ||
        typeof global.crypto.subtle.digest !== 'function') return null;
    var digest = await global.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(value)
    );
    return Array.from(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  async function computeProjectionReleaseId(data) {
    var source = projectionToSource(data);
    var content = Object.fromEntries(Object.keys(source)
      .filter(function (key) { return key !== 'release_id'; })
      .map(function (key) { return [key, source[key]]; }));
    var contentDigest = await digestHex(canonicalReleaseJson(content));
    if (!contentDigest) return null;
    return digestHex([
      SOURCE_CONTRACT,
      POLICY,
      source.source.sha256,
      source.source.snapshot_as_of,
      source.cohort.first_period,
      source.cohort.last_period,
      'calculo_row_observed',
      contentDigest
    ].join('|'));
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function signedInteger(value) {
    return Number.isSafeInteger(value);
  }

  function percentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function closeTo(left, right, tolerance) {
    return Number.isFinite(left) && Number.isFinite(right) &&
      Math.abs(left - right) <= (tolerance === undefined ? 0.0001 : tolerance);
  }

  function round4(value) {
    return Number(value.toFixed(4));
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    var parsed = new Date(value + 'T00:00:00.000Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function validTimestamp(value) {
    return typeof value === 'string' && value.length <= 40 &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
      !Number.isNaN(Date.parse(value));
  }

  function previousMonth(period) {
    var match = PERIOD.exec(period || '');
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    return month === 1
      ? String(year - 1).padStart(4, '0') + '-12'
      : String(year).padStart(4, '0') + '-' + String(month - 1).padStart(2, '0');
  }

  function nextMonth(period) {
    var match = PERIOD.exec(period || '');
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    return month === 12
      ? String(year + 1).padStart(4, '0') + '-01'
      : String(year).padStart(4, '0') + '-' + String(month + 1).padStart(2, '0');
  }

  function validLabel(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 160 &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function noForbiddenKeys(value) {
    if (Array.isArray(value)) return value.every(noForbiddenKeys);
    if (!record(value)) return true;
    return Object.keys(value).every(function (key) {
      return !FORBIDDEN_KEYS.has(key.toLowerCase()) && noForbiddenKeys(value[key]);
    });
  }

  function validComponents(value) {
    return exactKeys(value, COMPONENT_KEYS) && COMPONENT_KEYS.every(function (key) {
      return nonNegativeInteger(value[key]);
    }) && value.grossWithFamilyAllowancesCents ===
      value.contributoryEarningsCents + value.nonContributoryEarningsCents +
      value.familyAllowancesCents;
  }

  function validControl(value, components, participantCount, countProtected) {
    if (!exactKeys(value, CONTROL_KEYS) || !signedInteger(value.netIdentityVarianceCents) ||
        !signedInteger(value.netToPayVarianceCents) ||
        typeof value.identityExactlyReconciled !== 'boolean') return false;
    var netVariance = components.netPayrollCents -
      (components.grossWithFamilyAllowancesCents - components.employeeWithholdingsCents);
    var payVariance = components.netToPayCents - components.netPayrollCents;
    if (value.netIdentityVarianceCents !== netVariance ||
        value.netToPayVarianceCents !== payVariance ||
        value.identityExactlyReconciled !== (Math.abs(netVariance) <= 1 && Math.abs(payVariance) <= 1)) {
      return false;
    }
    if (countProtected) {
      return value.roundingToleranceCents === null &&
        value.identityWithinRoundingTolerance === null;
    }
    var tolerance = Math.max(1, participantCount);
    return value.roundingToleranceCents === tolerance &&
      typeof value.identityWithinRoundingTolerance === 'boolean' &&
      value.identityWithinRoundingTolerance ===
        (Math.abs(netVariance) <= tolerance && Math.abs(payVariance) <= tolerance);
  }

  function validReconciliation(value) {
    if (!exactKeys(value, RECONCILIATION_KEYS)) return false;
    var integers = ['calculationRuns', 'totpagoRuns', 'matchedRuns', 'fullyReconciledRuns'];
    if (!integers.every(function (key) { return nonNegativeInteger(value[key]); }) ||
        value.calculationRuns <= 0 || value.matchedRuns > value.calculationRuns ||
        value.matchedRuns > value.totpagoRuns || value.fullyReconciledRuns > value.matchedRuns ||
        !percentage(value.runCoveragePct) || !percentage(value.metricExactRatePct) ||
        !percentage(value.valueAgreementPct) || !nonNegativeInteger(value.absoluteVarianceCents)) {
      return false;
    }
    var unionRuns = value.calculationRuns + value.totpagoRuns - value.matchedRuns;
    return unionRuns > 0 && closeTo(value.runCoveragePct,
      round4(value.matchedRuns / unionRuns * 100));
  }

  function validPeriodTotal(row) {
    return exactKeys(row, SHAPES.periodTotal) && PERIOD.test(row.period) &&
      row.privacyStatus === 'released' && nonNegativeInteger(row.participantCount) &&
      row.participantCount >= THRESHOLD && row.participantDisplay === String(row.participantCount) &&
      validComponents(row.components) && validControl(row.control, row.components,
        row.participantCount, false) && validReconciliation(row.reconciliation);
  }

  function validUnavailableChange(change, cell) {
    var reasons = [
      'pending_comparison', 'privacy_protected', 'protected_bucket_composition',
      'previous_period_missing', 'category_not_comparable', 'membership_change_protected',
      'participant_count_protected'
    ];
    if (change.status !== 'unavailable' || reasons.indexOf(change.reason) === -1 ||
        !PERIOD.test(change.previousPeriod || '')) return false;
    if (!CHANGE_KEYS.slice(3).every(function (key) { return change[key] === null; })) return false;
    return change.reason !== 'membership_change_protected' ||
      (cell.participantPrivacyStatus === 'protected_difference_attack' &&
       cell.distinctParticipantsObserved === null);
  }

  function validReleasedChange(change, cell, previous) {
    if (!previous || change.status !== 'released' ||
        change.reason !== 'both_consecutive_periods_released' ||
        cell.participantPrivacyStatus !== 'released' ||
        previous.participantPrivacyStatus !== 'released' ||
        change.previousPeriod !== previous.period) return false;
    var expectedNet = cell.components.netPayrollCents - previous.components.netPayrollCents;
    var previousNet = previous.components.netPayrollCents;
    return change.distinctParticipantsDelta ===
        cell.distinctParticipantsObserved - previous.distinctParticipantsObserved &&
      change.grossWithFamilyAllowancesDeltaCents ===
        cell.components.grossWithFamilyAllowancesCents - previous.components.grossWithFamilyAllowancesCents &&
      change.employeeWithholdingsDeltaCents ===
        cell.components.employeeWithholdingsCents - previous.components.employeeWithholdingsCents &&
      change.netPayrollDeltaCents === expectedNet &&
      change.employerContributionsDeltaCents ===
        cell.components.employerContributionsCents - previous.components.employerContributionsCents &&
      (previousNet === 0
        ? change.netPayrollDeltaPct === null
        : closeTo(change.netPayrollDeltaPct, round4(expectedNet / Math.abs(previousNet) * 100)));
  }

  function cellIdentity(cell) {
    return String(cell.companyCode) + ':' + String(cell.sourceCode);
  }

  function validCell(cell, previousByIdentity) {
    if (!exactKeys(cell, SHAPES.cell) || !validComponents(cell.components) ||
        !exactKeys(cell.change, CHANGE_KEYS) || !percentage(cell.allocationSharePct)) return false;
    if (cell.privacyStatus === 'released') {
      if (!nonNegativeInteger(cell.companyCode) || !nonNegativeInteger(cell.sourceCode) ||
          !validLabel(cell.label)) return false;
    } else if (cell.privacyStatus === 'protected_aggregate') {
      if (cell.companyCode !== null || cell.sourceCode !== null ||
          cell.label !== 'Otros (celdas protegidas)') return false;
    } else {
      return false;
    }
    var countProtected = cell.participantPrivacyStatus === 'protected_difference_attack';
    if (countProtected) {
      if (cell.distinctParticipantsObserved !== null || cell.participantDisplay !== 'Protegido') return false;
    } else if (cell.participantPrivacyStatus === 'released') {
      if (!nonNegativeInteger(cell.distinctParticipantsObserved) ||
          cell.distinctParticipantsObserved < THRESHOLD ||
          cell.participantDisplay !== String(cell.distinctParticipantsObserved)) return false;
    } else {
      return false;
    }
    if (!validControl(cell.control, cell.components,
      cell.distinctParticipantsObserved || THRESHOLD, countProtected)) return false;
    var previous = cell.privacyStatus === 'released'
      ? previousByIdentity.get(cellIdentity(cell))
      : null;
    return cell.change.status === 'released'
      ? validReleasedChange(cell.change, cell, previous && { period: previousByIdentity.period, ...previous })
      : validUnavailableChange(cell.change, cell);
  }

  function validAccounting(value, cells, periodParticipantCount) {
    if (!exactKeys(value, SHAPES.accounting) ||
        !nonNegativeInteger(value.periodDistinctParticipants) ||
        value.periodDistinctParticipants < THRESHOLD ||
        value.periodDistinctParticipants !== periodParticipantCount ||
        typeof value.participantsMayOverlap !== 'boolean') return false;
    var hasProtectedCellCount = cells.some(function (cell) {
      return cell.participantPrivacyStatus === 'protected_difference_attack';
    });
    if (hasProtectedCellCount && value.sumCellDistinctParticipantsObserved !== null) return false;
    if (value.multiCategoryPrivacyStatus === 'protected') {
      return value.multiCategoryParticipants === null &&
        value.sumCellDistinctParticipantsObserved === null &&
        value.multiCategoryParticipantDisplay === '<10' &&
        value.participantsMayOverlap === true && cells.some(function (cell) {
          return cell.participantPrivacyStatus === 'protected_difference_attack' ||
            cell.privacyStatus === 'protected_aggregate';
        });
    }
    if (['released', 'not_observed'].indexOf(value.multiCategoryPrivacyStatus) === -1 ||
        !nonNegativeInteger(value.multiCategoryParticipants) ||
        (!hasProtectedCellCount && !nonNegativeInteger(value.sumCellDistinctParticipantsObserved)) ||
        value.multiCategoryParticipantDisplay !== String(value.multiCategoryParticipants)) return false;
    if (value.multiCategoryPrivacyStatus === 'not_observed') {
      return value.multiCategoryParticipants === 0 &&
        value.participantsMayOverlap === false &&
        (hasProtectedCellCount ||
          value.sumCellDistinctParticipantsObserved === value.periodDistinctParticipants);
    }
    return value.multiCategoryParticipants > 0 &&
      value.multiCategoryParticipants <= value.periodDistinctParticipants &&
      value.participantsMayOverlap === true &&
      (hasProtectedCellCount || value.sumCellDistinctParticipantsObserved >=
        value.periodDistinctParticipants + value.multiCategoryParticipants);
  }

  function validDimensionViews(views, periods, totals) {
    if (!Array.isArray(views) || views.length !== DIMENSIONS.length) return false;
    var totalByPeriod = new Map(totals.map(function (row) { return [row.period, row]; }));
    return views.every(function (view, viewIndex) {
      if (!exactKeys(view, SHAPES.view) || view.dimension !== DIMENSIONS[viewIndex] ||
          view.assignmentSemantics !== 'dimension_observed_on_calculo_run_not_contract_status' ||
          !Array.isArray(view.periods) || view.periods.length !== periods.length) return false;
      var previousByIdentity = new Map();
      previousByIdentity.period = null;
      for (var index = 0; index < view.periods.length; index += 1) {
        var row = view.periods[index];
        var total = totalByPeriod.get(row.period);
        if (!exactKeys(row, SHAPES.dimensionPeriod) || row.period !== periods[index] ||
            row.privacyStatus !== 'released' || !Array.isArray(row.cells) || row.cells.length < 1 ||
            !total || !validAccounting(row.participantAccounting, row.cells,
              total.participantCount)) return false;
        var componentSums = Object.fromEntries(COMPONENT_KEYS.map(function (key) { return [key, 0]; }));
        var allocation = 0;
        var currentByIdentity = new Map();
        currentByIdentity.period = row.period;
        for (var cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
          var cell = row.cells[cellIndex];
          if (!validCell(cell, previousByIdentity)) return false;
          COMPONENT_KEYS.forEach(function (key) { componentSums[key] += cell.components[key]; });
          allocation += cell.allocationSharePct;
          if (cell.privacyStatus === 'released') {
            var identity = cellIdentity(cell);
            if (currentByIdentity.has(identity)) return false;
            currentByIdentity.set(identity, cell);
          } else if (cellIndex !== row.cells.length - 1) {
            return false;
          }
        }
        if (!COMPONENT_KEYS.every(function (key) {
          return componentSums[key] === total.components[key];
        }) || !closeTo(allocation, 100, 0.01)) return false;
        previousByIdentity = currentByIdentity;
      }
      return true;
    });
  }

  function validQuality(data) {
    var quality = data.quality;
    if (!exactKeys(quality, SHAPES.quality) ||
        !exactKeys(quality.calculation, SHAPES.calculation) ||
        quality.calculation.windowPeriods !== MONTHS ||
        !Array.isArray(quality.references) || quality.references.length !== DIMENSIONS.length ||
        !exactKeys(quality.assignment, SHAPES.assignment) ||
        !exactKeys(quality.participantSetReconciliation, SHAPES.participantReconciliation) ||
        !exactKeys(quality.amountSigns, SHAPES.amountSigns) ||
        !Array.isArray(quality.partitionChecks) || quality.partitionChecks.length !== DIMENSIONS.length ||
        !Array.isArray(quality.warnings) || !quality.warnings.every(validLabel)) return false;
    var calculation = quality.calculation;
    if (!nonNegativeInteger(calculation.sourceRows) || calculation.sourceRows === 0 ||
        !nonNegativeInteger(calculation.validRows) ||
        !nonNegativeInteger(calculation.quarantineRows) ||
        calculation.validRows + calculation.quarantineRows !== calculation.sourceRows ||
        !percentage(calculation.validRatePct) ||
        !closeTo(calculation.validRatePct,
          round4(calculation.validRows / calculation.sourceRows * 100)) ||
        !nonNegativeInteger(calculation.windowRows) ||
        calculation.windowRows > calculation.validRows ||
        !nonNegativeInteger(calculation.windowControlRows) ||
        calculation.windowControlRows > calculation.windowRows) return false;
    var participantTotal = data.periodTotals.reduce(function (sum, row) {
      return sum + row.participantCount;
    }, 0);
    if (quality.participantSetReconciliation.periodsChecked !== MONTHS ||
        quality.participantSetReconciliation.exactPeriods !== MONTHS ||
        quality.participantSetReconciliation.mismatchedPeriods !== 0 ||
        quality.participantSetReconciliation.controlCohortUsedForFinance !== true ||
        !nonNegativeInteger(quality.participantSetReconciliation.allCalculoEmployeePeriods) ||
        !nonNegativeInteger(quality.participantSetReconciliation.controlEmployeePeriods) ||
        quality.participantSetReconciliation.allCalculoEmployeePeriods !==
          quality.participantSetReconciliation.controlEmployeePeriods ||
        quality.participantSetReconciliation.controlEmployeePeriods !== participantTotal) return false;
    if (quality.amountSigns.periodsChecked !== MONTHS ||
        quality.amountSigns.periodsWithNonpositiveNetPayroll !== 0 ||
        !validComponents(quality.amountSigns.negativePeriodComponents) ||
        !COMPONENT_KEYS.every(function (key) { return quality.amountSigns.negativePeriodComponents[key] === 0; }) ||
        !Array.isArray(quality.amountSigns.dimensions) ||
        quality.amountSigns.dimensions.length !== DIMENSIONS.length ||
        !nonNegativeInteger(quality.assignment.employeePeriodRuns) ||
        quality.assignment.employeePeriodRuns === 0 ||
        !nonNegativeInteger(quality.assignment.invalidEmployeePeriodRuns) ||
        quality.assignment.invalidEmployeePeriodRuns > quality.assignment.employeePeriodRuns) return false;
    var maximumInvalidRuns = 0;
    for (var index = 0; index < DIMENSIONS.length; index += 1) {
      var reference = quality.references[index];
      var run = quality.assignment.dimensionRunChecks[index];
      var multi = quality.assignment.multiCategoryEmployeePeriods[index];
      var signs = quality.amountSigns.dimensions[index];
      var partition = quality.partitionChecks[index];
      var referenceCountsValid = nonNegativeInteger(reference && reference.observedCodes) &&
        nonNegativeInteger(reference && reference.resolvedCodes) &&
        reference.resolvedCodes <= reference.observedCodes &&
        nonNegativeInteger(reference.unresolvedCodes) &&
        reference.resolvedCodes + reference.unresolvedCodes === reference.observedCodes &&
        nonNegativeInteger(reference.observedControlRuns) && reference.observedControlRuns > 0 &&
        nonNegativeInteger(reference.resolvedControlRuns) &&
        reference.resolvedControlRuns <= reference.observedControlRuns &&
        percentage(reference.coveragePct) &&
        closeTo(reference.coveragePct,
          round4(reference.resolvedControlRuns / reference.observedControlRuns * 100));
      var runCounts = run && [run.validRuns, run.ambiguousRuns, run.missingCodeRuns,
        run.unresolvedReferenceRuns, run.invalidEmployeeKeyRuns];
      var runCountsValid = Array.isArray(runCounts) && runCounts.every(nonNegativeInteger) &&
        nonNegativeInteger(run.employeePeriodRuns) &&
        run.employeePeriodRuns === quality.assignment.employeePeriodRuns &&
        runCounts.reduce(function (sum, value) { return sum + value; }, 0) === run.employeePeriodRuns &&
        percentage(run.coveragePct) &&
        closeTo(run.coveragePct, round4(run.validRuns / run.employeePeriodRuns * 100));
      var invalidRuns = runCountsValid
        ? run.ambiguousRuns + run.missingCodeRuns + run.unresolvedReferenceRuns +
          run.invalidEmployeeKeyRuns
        : 0;
      maximumInvalidRuns = Math.max(maximumInvalidRuns, invalidRuns);
      var multiCountsValid = multi && nonNegativeInteger(multi.employeePeriods) &&
        nonNegativeInteger(multi.multiCategoryEmployeePeriods) &&
        multi.employeePeriods === quality.participantSetReconciliation.controlEmployeePeriods &&
        multi.multiCategoryEmployeePeriods <= multi.employeePeriods &&
        percentage(multi.multiCategoryPct) &&
        (multi.employeePeriods === 0
          ? multi.multiCategoryPct === 0
          : closeTo(multi.multiCategoryPct,
            round4(multi.multiCategoryEmployeePeriods / multi.employeePeriods * 100)));
      if (!exactKeys(reference, SHAPES.reference) || reference.dimension !== DIMENSIONS[index] ||
          !referenceCountsValid ||
          !exactKeys(run, SHAPES.runCheck) || run.dimension !== DIMENSIONS[index] ||
          !runCountsValid ||
          reference.observedControlRuns !== run.employeePeriodRuns ||
          reference.resolvedControlRuns !== run.validRuns ||
          !exactKeys(multi, SHAPES.multiQuality) || multi.dimension !== DIMENSIONS[index] ||
          !multiCountsValid ||
          !exactKeys(signs, SHAPES.dimensionSigns) || signs.dimension !== DIMENSIONS[index] ||
          !nonNegativeInteger(signs.cellsChecked) ||
          !nonNegativeInteger(signs.allocationPeriodsAvailable) ||
          !nonNegativeInteger(signs.allocationPeriodsUnavailable) ||
          signs.allocationPeriodsAvailable + signs.allocationPeriodsUnavailable !== MONTHS ||
          !validComponents(signs.negativeComponentCells) ||
          !COMPONENT_KEYS.every(function (key) { return signs.negativeComponentCells[key] === 0; }) ||
          !exactKeys(partition, SHAPES.partition) || partition.dimension !== DIMENSIONS[index] ||
          partition.periodsChecked !== MONTHS || partition.componentIdentityFailures !== 0 ||
          partition.netAllocationIdentityFailures !== 0 || partition.allocationShareFailures !== 0) return false;
    }
    if (quality.assignment.invalidEmployeePeriodRuns !== maximumInvalidRuns) return false;
    var requiredWarnings = [
      'source_currency_not_declared',
      'cross_view_single_cell_difference_gate_passed',
      'cross_view_remaining_single_cell_risks:0',
      'cross_view_subset_difference_gate_passed',
      'cross_view_remaining_subset_difference_risks:0'
    ];
    if (!requiredWarnings.every(function (warning) { return quality.warnings.includes(warning); })) {
      return false;
    }
    function warningInteger(prefix) {
      var matches = quality.warnings.filter(function (warning) {
        return warning.indexOf(prefix + ':') === 0;
      });
      if (matches.length !== 1) return null;
      var textValue = matches[0].slice(prefix.length + 1);
      if (!/^(?:0|[1-9]\d*)$/.test(textValue)) return null;
      var numericValue = Number(textValue);
      return Number.isSafeInteger(numericValue) ? numericValue : null;
    }
    var maxObservables = warningInteger('cross_view_max_observables_per_view');
    var targetStates = warningInteger('cross_view_max_protected_target_states_per_period');
    var subsetEquations = warningInteger('cross_view_subset_equations_checked');
    var maxSubsetEquations = warningInteger('cross_view_max_subset_equations_per_period');
    if (maxObservables === null || maxObservables > MAX_OBSERVABLES_PER_VIEW ||
        targetStates === null || targetStates <= 0 ||
        targetStates > MAX_PROTECTED_TARGET_STATES_PER_PERIOD ||
        subsetEquations === null || subsetEquations <= 0 ||
        maxSubsetEquations === null || maxSubsetEquations <= 0 ||
        maxSubsetEquations > MAX_SUBSET_EQUATIONS_PER_PERIOD) return false;
    return Array.isArray(quality.assignment.dimensionRunChecks) &&
      quality.assignment.dimensionRunChecks.length === DIMENSIONS.length &&
      Array.isArray(quality.assignment.multiCategoryEmployeePeriods) &&
      quality.assignment.multiCategoryEmployeePeriods.length === DIMENSIONS.length;
  }

  function validContract(data) {
    if (!exactKeys(data, SHAPES.top) || data.schemaVersion !== CONTRACT ||
        data.policyVersion !== POLICY || data.releaseId !== APPROVED_RELEASE_ID ||
        !exactKeys(data.source, SHAPES.source) ||
        data.source.canonicalSystem !== APPROVED_SOURCE.canonicalSystem ||
        data.source.sourceFile !== APPROVED_SOURCE.sourceFile ||
        data.source.sourceSha256 !== APPROVED_SOURCE.sourceSha256 ||
        data.source.compressedSizeBytes !== APPROVED_SOURCE.compressedSizeBytes ||
        data.source.snapshotAsOf !== APPROVED_SOURCE.snapshotAsOf ||
        !validTimestamp(data.source.generatedAt) ||
        !PERIOD.test(data.source.latestValidCalculationPeriod || '') || data.source.realtime !== false ||
        data.source.profileSchemaVersion !== 'grh-profile-v1' ||
        data.source.semanticSchemaVersion !== 'grh-semantic-v2' ||
        !exactKeys(data.metric, SHAPES.metric) ||
        data.metric.grain !== 'calendar_month_x_observed_run_dimension' ||
        data.metric.sourceCurrencyStatus !== 'not_declared_in_source' ||
        data.metric.amountUnit !== 'source_currency_cents' ||
        data.metric.presentationSchemaVersion !== 'tenant-presentation-v1' ||
        data.metric.presentationCurrency !== 'ARS' ||
        data.metric.presentationCurrencyBasis !== 'tenant_configuration' ||
        !validDate(data.metric.presentationCurrencyEffectiveOn) ||
        data.metric.presentationLocale !== 'es-AR' ||
        data.metric.status !== 'calculation_control_not_bank_disbursement' ||
        data.metric.allocationBasis !== 'net_payroll_cents' ||
        data.metric.allocationRule !== 'released_only_when_all_period_cell_components_nonnegative_and_period_net_positive' ||
        data.metric.interpretation !== 'run_observed_allocation_not_exclusive_workforce_distribution' ||
        !exactKeys(data.cohort, SHAPES.cohort) ||
        data.cohort.publishedWindowMonths !== MONTHS ||
        data.cohort.participantDefinition !== 'distinct_company_employee_key_observed_in_allowlisted_control_concepts' ||
        data.cohort.assignmentMode !== 'calculo_row_observed' ||
        data.cohort.assignmentGrain !== 'company_employee_period_calculation_date_run_type' ||
        data.cohort.assignmentSemantics !== 'dimension_observed_on_calculo_run_not_contract_status' ||
        data.cohort.participantsMayOverlapAcrossCategories !== true ||
        !Array.isArray(data.cohort.oneWayDimensions) ||
        data.cohort.oneWayDimensions.length !== DIMENSIONS.length ||
        !data.cohort.oneWayDimensions.every(function (item, index) { return item === DIMENSIONS[index]; }) ||
        !exactKeys(data.privacy, SHAPES.privacy) || data.privacy.threshold !== THRESHOLD ||
        data.privacy.aggregateOnly !== true || data.privacy.containsPii !== false ||
        data.privacy.employeeIdentifiersExported !== false || data.privacy.rawRowsExported !== false ||
        data.privacy.arbitraryFiltersAllowed !== false || data.privacy.intersectionsAllowed !== false ||
        data.privacy.primarySuppression !== true || data.privacy.complementarySuppression !== true ||
        data.privacy.crossPeriodProtection !== 'consecutive_participant_count_difference_protection' ||
        data.privacy.smallOverlapProtection !== true ||
        data.privacy.releasedAmountsRemainArithmeticallyComparable !== true ||
        data.privacy.protectedBucketLabel !== 'Otros (celdas protegidas)' ||
        !exactKeys(data.capabilities, SHAPES.capabilities) ||
        data.capabilities.cohortFinance !== 'released' ||
        data.capabilities.cellArithmeticControl !== 'released' ||
        data.capabilities.periodCrossSourceReconciliation !== 'released' ||
        data.capabilities.cohortCrossSourceReconciliation !== 'unavailable_no_dimensional_totpago_join' ||
        data.capabilities.cohortAbsence !== 'not_in_source_v1' ||
        data.capabilities.cohortLeave !== 'not_in_source_v1') return false;
    if (!Array.isArray(data.periodTotals) || data.periodTotals.length !== MONTHS ||
        !data.periodTotals.every(validPeriodTotal)) return false;
    var periods = data.periodTotals.map(function (row) { return row.period; });
    for (var index = 1; index < periods.length; index += 1) {
      if (nextMonth(periods[index - 1]) !== periods[index]) return false;
    }
    if (data.cohort.firstPeriod !== periods[0] || data.cohort.lastPeriod !== periods[periods.length - 1] ||
        data.source.latestValidCalculationPeriod !== periods[periods.length - 1]) return false;
    return validDimensionViews(data.dimensionViews, periods, data.periodTotals) &&
      validQuality(data) && noForbiddenKeys(data);
  }

  async function verifyContract(data) {
    if (!validContract(data)) return false;
    try {
      return await computeProjectionReleaseId(data) === APPROVED_RELEASE_ID;
    } catch (error) {
      return false;
    }
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }

  function timeoutOption(value) {
    return Number.isInteger(value) && value >= 1000 && value <= MAX_TIMEOUT_MS;
  }

  async function load(options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new WorkforceFinanceError('WORKFORCE_FINANCE_CLIENT_UNAVAILABLE');
    }
    var config = options === undefined ? {} : options;
    if (!record(config) || Object.keys(config).some(function (key) {
      return ['timeoutMs', 'signal'].indexOf(key) === -1;
    })) throw new WorkforceFinanceError('WORKFORCE_FINANCE_OPTIONS_INVALID');
    var timeoutMs = config.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : config.timeoutMs;
    if (!timeoutOption(timeoutMs) || (config.signal !== undefined &&
        (!config.signal || typeof config.signal.addEventListener !== 'function'))) {
      throw new WorkforceFinanceError('WORKFORCE_FINANCE_OPTIONS_INVALID');
    }
    var controller = new AbortController();
    var timedOut = false;
    var timeout = global.setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
    var abortListener;
    if (config.signal) {
      if (config.signal.aborted) controller.abort();
      abortListener = function () { controller.abort(); };
      config.signal.addEventListener('abort', abortListener, { once: true });
    }
    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal
      });
      if (!response || typeof response.status !== 'number') {
        throw new WorkforceFinanceError('WORKFORCE_FINANCE_RESPONSE_INVALID');
      }
      if (response.status !== 200) {
        throw new WorkforceFinanceError('WORKFORCE_FINANCE_HTTP_ERROR', response.status);
      }
      if (response.headers.get(CONTRACT_HEADER) !== CONTRACT ||
          !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
        throw new WorkforceFinanceError('WORKFORCE_FINANCE_RESPONSE_INVALID', response.status);
      }
      var text = await response.text();
      if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) {
        throw new WorkforceFinanceError('WORKFORCE_FINANCE_RESPONSE_TOO_LARGE', response.status);
      }
      var data;
      try { data = JSON.parse(text); } catch (error) {
        throw new WorkforceFinanceError('WORKFORCE_FINANCE_RESPONSE_INVALID', response.status);
      }
      if (!(await verifyContract(data))) {
        throw new WorkforceFinanceError('WORKFORCE_FINANCE_CONTRACT_INVALID', response.status);
      }
      return deepFreeze(data);
    } catch (error) {
      if (error instanceof WorkforceFinanceError) throw error;
      if (controller.signal.aborted) {
        throw new WorkforceFinanceError(timedOut
          ? 'WORKFORCE_FINANCE_REQUEST_TIMEOUT'
          : 'WORKFORCE_FINANCE_REQUEST_ABORTED');
      }
      throw new WorkforceFinanceError('WORKFORCE_FINANCE_REQUEST_FAILED');
    } finally {
      global.clearTimeout(timeout);
      if (config.signal && abortListener) config.signal.removeEventListener('abort', abortListener);
    }
  }

  global.MuniGrhWorkforceFinance = Object.freeze({
    ENDPOINT: ENDPOINT,
    CONTRACT: CONTRACT,
    APPROVED_RELEASE_ID: APPROVED_RELEASE_ID,
    APPROVED_SOURCE: APPROVED_SOURCE,
    load: load,
    validate: verifyContract,
    WorkforceFinanceError: WorkforceFinanceError
  });
}(window));
