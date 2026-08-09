import { GRH_PRIVACY_POLICY_VERSION } from './grh-privacy.js';

export const GRH_DECISION_BRIEF_SCHEMA_VERSION = 'grh-decision-brief-v1';
export const GRH_DECISION_BRIEF_PRIVACY_THRESHOLD = 10;

export const GRH_DECISION_BRIEF_LIMITS = Object.freeze([
  'historical_snapshot_not_realtime',
  'calculation_control_not_bank_disbursement',
  'currency_not_declared_in_source',
  'arithmetic_decomposition_not_causal_explanation',
  'snapshot_reconciliation_not_monthly_series',
]);

export const GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS = Object.freeze([
  Object.freeze({
    code: 'cross_source_material_difference',
    severity: 'critical',
    href: 'hacienda.html',
    requiredCapability: 'navigation.hacienda',
  }),
  Object.freeze({
    code: 'temporal_quarantine_present',
    severity: 'warning',
    href: 'control.html',
    requiredCapability: 'navigation.data-quality',
  }),
  Object.freeze({
    code: 'historical_snapshot',
    severity: 'context',
    href: null,
    requiredCapability: null,
  }),
]);

const SHAPES = Object.freeze({
  top: [
    'schemaVersion',
    'policyVersion',
    'source',
    'privacy',
    'period',
    'status',
    'situation',
    'change',
    'priorities',
    'limits',
  ],
  source: [
    'canonicalSystem',
    'sourceFile',
    'sourceSha256',
    'snapshotAsOf',
    'latestValidCalculationPeriod',
    'realtime',
  ],
  privacy: [
    'audience',
    'threshold',
    'aggregateOnly',
    'containsPii',
    'employeeIdentifiersExported',
    'rawRowsExported',
    'categoricalLabelsExported',
    'cellCodesExported',
    'monetaryAmountsExported',
  ],
  situation: [
    'participantCount',
    'participantDisplay',
    'qualityScorePct',
    'temporalQuarantineRows',
    'runCoveragePct',
    'metricExactRatePct',
    'valueAgreementPct',
    'identityWithinRoundingTolerance',
  ],
  change: [
    'status',
    'previousPeriod',
    'participantDelta',
    'runCoverageDeltaPctPoints',
    'metricExactRateDeltaPctPoints',
    'valueAgreementDeltaPctPoints',
  ],
  priority: ['code', 'severity', 'href', 'requiredCapability'],
});

const MONTH_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FORBIDDEN_PROPERTY_NAMES = new Set([
  'name', 'fullname', 'nombre', 'apellido', 'dni', 'documento', 'cuil', 'cuit',
  'cbu', 'bankaccount', 'accountnumber', 'email', 'phone', 'telefono', 'domicilio',
  'address', 'dateofbirth', 'birthdate', 'idpersona', 'personaid', 'employeeid',
  'legajo', 'legajoid', 'companycode', 'sourcecode', 'label', 'concept', 'concepto',
  'amount', 'amounts', 'importe', 'importes', 'cents', 'currency', 'owner',
  'responsible', 'responsable', 'deadline', 'duedate', 'plazo', 'causalexplanation',
]);
const FORBIDDEN_VALUE_PATTERNS = Object.freeze([
  /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)+\b/i,
  /\b(?:d[.\s_/-]*n[.\s_/-]*i|documento)\b[^\d]{0,16}\d[\d.\s/-]{5,18}\d/i,
  /\b(?:c[.\s_/-]*u[.\s_/-]*i[.\s_/-]*[lt])\b[^\d]{0,16}\d[\d.\s/-]{8,24}\d/i,
  /\b(?:c[.\s_/-]*b[.\s_/-]*u|cuenta\s+bancaria)\b[^\d]{0,16}\d[\d.\s/-]{20,42}\d/i,
]);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function addShape(errors, value, keys, code) {
  add(errors, exactKeys(value, keys), code);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function signedInteger(value) {
  return Number.isSafeInteger(value);
}

function finitePercentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function finitePercentageDelta(value) {
  return Number.isFinite(value) && value >= -100 && value <= 100;
}

function validSnapshot(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return false;
  const date = new Date(timestamp);
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
}

function previousCalendarMonth(period) {
  const match = MONTH_PERIOD.exec(period || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 1
    ? `${String(year - 1).padStart(4, '0')}-12`
    : `${String(year).padStart(4, '0')}-${String(month - 1).padStart(2, '0')}`;
}

function normalizedPropertyName(key) {
  return key
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function containsForbiddenProperty(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some(item => containsForbiddenProperty(item, visited));
  }
  return Object.entries(value).some(([key, child]) => {
    const normalized = normalizedPropertyName(key);
    const monetaryField = normalized !== 'monetaryamountsexported' &&
      (normalized.endsWith('cents') || normalized.includes('amount') ||
        normalized.includes('importe'));
    return FORBIDDEN_PROPERTY_NAMES.has(normalized) || monetaryField ||
      containsForbiddenProperty(child, visited);
  });
}

function containsForbiddenValue(value, visited = new Set()) {
  if (typeof value === 'string') {
    if (value.length > 256 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      return true;
    }
    const normalized = value
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u202F]/g, ' ');
    return FORBIDDEN_VALUE_PATTERNS.some(pattern => pattern.test(normalized));
  }
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) return value.some(item => containsForbiddenValue(item, visited));
  return Object.values(value).some(child => containsForbiddenValue(child, visited));
}

function priorityDefinition(code) {
  return GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS.find(row => row.code === code);
}

function statusForPriorities(priorities) {
  if (priorities.some(row => row?.severity === 'critical')) return 'attention_required';
  if (priorities.some(row => row?.severity === 'warning')) return 'review_recommended';
  return 'context_only';
}

function inspectSituation(errors, situation) {
  addShape(errors, situation, SHAPES.situation, 'situation.structure');
  add(errors, finitePercentage(situation?.qualityScorePct), 'situation.quality_score');
  add(errors, nonNegativeInteger(situation?.temporalQuarantineRows),
    'situation.temporal_quarantine_rows');

  if (situation?.participantCount === null) {
    add(errors, situation?.participantDisplay === `<${GRH_DECISION_BRIEF_PRIVACY_THRESHOLD}`,
      'situation.protected_display');
    add(errors, situation?.runCoveragePct === null, 'situation.protected_run_coverage');
    add(errors, situation?.metricExactRatePct === null, 'situation.protected_metric_exact_rate');
    add(errors, situation?.valueAgreementPct === null, 'situation.protected_value_agreement');
    add(errors, situation?.identityWithinRoundingTolerance === null,
      'situation.protected_rounding_identity');
    return;
  }

  add(errors, nonNegativeInteger(situation?.participantCount) &&
    situation.participantCount >= GRH_DECISION_BRIEF_PRIVACY_THRESHOLD,
  'situation.small_cell');
  add(errors, situation?.participantDisplay === String(situation?.participantCount),
    'situation.participant_display');
  add(errors, finitePercentage(situation?.runCoveragePct), 'situation.run_coverage');
  add(errors, finitePercentage(situation?.metricExactRatePct), 'situation.metric_exact_rate');
  add(errors, finitePercentage(situation?.valueAgreementPct), 'situation.value_agreement');
  add(errors, typeof situation?.identityWithinRoundingTolerance === 'boolean',
    'situation.rounding_identity');
}

function inspectChange(errors, change, period) {
  addShape(errors, change, SHAPES.change, 'change.structure');
  add(errors, ['released', 'privacy_protected', 'period_missing'].includes(change?.status),
    'change.status');
  add(errors, change?.previousPeriod === previousCalendarMonth(period), 'change.previous_period');

  if (change?.status !== 'released') {
    for (const field of [
      'participantDelta',
      'runCoverageDeltaPctPoints',
      'metricExactRateDeltaPctPoints',
      'valueAgreementDeltaPctPoints',
    ]) {
      add(errors, change?.[field] === null, `change.protected_${field}`);
    }
    return;
  }

  add(errors, signedInteger(change?.participantDelta), 'change.participant_delta');
  for (const field of [
    'runCoverageDeltaPctPoints',
    'metricExactRateDeltaPctPoints',
    'valueAgreementDeltaPctPoints',
  ]) {
    add(errors, finitePercentageDelta(change?.[field]), `change.${field}`);
  }
}

function inspectPriorities(errors, priorities, temporalQuarantineRows) {
  add(errors, Array.isArray(priorities) && priorities.length >= 1 && priorities.length <= 3,
    'priorities.structure');
  const rows = Array.isArray(priorities) ? priorities : [];
  const seen = new Set();
  let previousDefinitionIndex = -1;

  for (const row of rows) {
    addShape(errors, row, SHAPES.priority, 'priorities.row_structure');
    const definition = priorityDefinition(row?.code);
    add(errors, Boolean(definition), 'priorities.code');
    add(errors, !seen.has(row?.code), 'priorities.duplicate');
    seen.add(row?.code);
    if (!definition) continue;

    const definitionIndex = GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS.indexOf(definition);
    add(errors, definitionIndex > previousDefinitionIndex, 'priorities.order');
    previousDefinitionIndex = definitionIndex;
    add(errors, row?.severity === definition.severity, 'priorities.severity');
    add(errors, row?.href === definition.href, 'priorities.href');
    add(errors, row?.requiredCapability === definition.requiredCapability,
      'priorities.required_capability');
  }

  add(errors, seen.has('historical_snapshot'), 'priorities.historical_snapshot');
  add(errors,
    seen.has('temporal_quarantine_present') === (temporalQuarantineRows > 0),
    'priorities.temporal_quarantine_identity');
}

export function inspectGrhDecisionBriefContract(data) {
  const errors = [];
  addShape(errors, data, SHAPES.top, 'decision_brief.structure');
  add(errors, data?.schemaVersion === GRH_DECISION_BRIEF_SCHEMA_VERSION, 'schema.version');
  add(errors, data?.policyVersion === GRH_PRIVACY_POLICY_VERSION, 'policy.version');
  add(errors, !containsForbiddenProperty(data), 'privacy.forbidden_property');
  add(errors, !containsForbiddenValue(data), 'privacy.forbidden_value');

  const source = data?.source;
  addShape(errors, source, SHAPES.source, 'source.structure');
  add(errors, typeof source?.canonicalSystem === 'string' &&
    source.canonicalSystem.length > 0 && source.canonicalSystem.length <= 80 &&
    source.canonicalSystem.toLowerCase().includes('grh') &&
    !/[\u0000-\u001F\u007F]/.test(source.canonicalSystem), 'source.canonical_system');
  add(errors, /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(source?.sourceFile || ''),
    'source.file');
  add(errors, /^[0-9a-f]{64}$/.test(source?.sourceSha256 || ''), 'source.sha256');
  add(errors, validSnapshot(source?.snapshotAsOf), 'source.snapshot');
  add(errors, MONTH_PERIOD.test(source?.latestValidCalculationPeriod || ''),
    'source.latest_period');
  add(errors,
    source?.latestValidCalculationPeriod <= String(source?.snapshotAsOf || '').slice(0, 7),
    'source.latest_period_bound');
  add(errors, source?.realtime === false, 'source.realtime');

  const privacy = data?.privacy;
  addShape(errors, privacy, SHAPES.privacy, 'privacy.structure');
  add(errors, privacy?.audience === 'interactive', 'privacy.audience');
  add(errors, privacy?.threshold === GRH_DECISION_BRIEF_PRIVACY_THRESHOLD, 'privacy.threshold');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  for (const field of [
    'containsPii',
    'employeeIdentifiersExported',
    'rawRowsExported',
    'categoricalLabelsExported',
    'cellCodesExported',
    'monetaryAmountsExported',
  ]) {
    add(errors, privacy?.[field] === false, `privacy.${field}`);
  }

  add(errors, MONTH_PERIOD.test(data?.period || ''), 'period.format');
  add(errors, data?.period === source?.latestValidCalculationPeriod, 'period.source_identity');

  inspectSituation(errors, data?.situation);
  inspectChange(errors, data?.change, data?.period);
  inspectPriorities(errors, data?.priorities, data?.situation?.temporalQuarantineRows);
  add(errors, ['attention_required', 'review_recommended', 'context_only'].includes(data?.status),
    'status.value');
  add(errors,
    Array.isArray(data?.priorities) && data?.status === statusForPriorities(data.priorities),
    'status.priority_identity');

  add(errors, Array.isArray(data?.limits) &&
    data.limits.length === GRH_DECISION_BRIEF_LIMITS.length &&
    data.limits.every((value, index) => value === GRH_DECISION_BRIEF_LIMITS[index]),
  'limits.enumeration');

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateGrhDecisionBriefContract(data) {
  return inspectGrhDecisionBriefContract(data).ok;
}
