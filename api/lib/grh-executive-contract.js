import {
  GRH_PRIVACY_POLICY_VERSION,
  GRH_PRIVACY_THRESHOLDS,
  GRH_PROTECTED_BUCKET_LABEL,
  resolveGrhPrivacyThreshold,
} from './grh-privacy.js';

export const GRH_EXECUTIVE_SCHEMA_VERSION = 'grh-executive-v2';
export const GRH_EXECUTIVE_AMOUNT_KEYS = Object.freeze([
  'grossWithFamilyAllowancesCents',
  'employeeWithholdingsCents',
  'netPayrollCents',
  'employerContributionsCents',
]);

const SHAPES = Object.freeze({
  top: [
    'schemaVersion',
    'policyVersion',
    'source',
    'privacy',
    'workforce',
    'compensation',
    'absence',
    'leave',
    'movements',
  ],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'realtime'],
  privacy: ['audience', 'interactiveThreshold', 'sensitiveThreshold', 'portableThreshold', 'protectedBucketLabel'],
  workforce: ['definition', 'referencePeriod', 'payrollParticipants', 'bySector', 'byCostCenter', 'byAgreement'],
  ranking: ['threshold', 'totalParticipants', 'participantDisplay', 'privacyStatus', 'rows'],
  rankingRow: ['companyCode', 'sourceCode', 'label', 'participants', 'participantDisplay', 'sharePct', 'privacyStatus'],
  compensation: ['currency', 'amountUnit', 'metricStatus', 'series'],
  monetaryRow: ['period', 'participantCount', 'participantDisplay', 'privacyStatus', 'amounts'],
  sensitiveDomain: ['sourceTable', 'metric', 'series'],
  sensitiveRow: ['period', 'value', 'participantCount', 'participantDisplay', 'privacyStatus'],
});

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
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

function finitePercentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function safeCode(value) {
  if (Number.isSafeInteger(value) && value >= 0) return true;
  return typeof value === 'string' && value.length > 0 && value.length <= 64 &&
    /^[A-Za-z0-9._/-]+$/.test(value);
}

function expectedShare(participants, totalParticipants) {
  return Number(((participants / totalParticipants) * 100).toFixed(4));
}

function inspectRanking(errors, ranking, {
  code,
  audience,
  totalParticipants,
}) {
  addShape(errors, ranking, SHAPES.ranking, `${code}.structure`);
  let threshold = null;
  try {
    threshold = resolveGrhPrivacyThreshold({ audience, domain: 'workforce' });
  } catch {
    // The audience error is reported by the privacy section below.
  }
  add(errors, ranking?.threshold === threshold, `${code}.threshold`);
  add(errors, ranking?.totalParticipants === totalParticipants, `${code}.total`);
  add(errors, ranking?.participantDisplay === String(totalParticipants), `${code}.total_display`);
  add(errors, ['released', 'partially_suppressed'].includes(ranking?.privacyStatus), `${code}.privacy_status`);
  add(errors, Array.isArray(ranking?.rows) && ranking.rows.length > 0, `${code}.rows`);

  let participantSum = 0;
  let protectedRows = 0;
  const identities = new Set();
  for (const row of Array.isArray(ranking?.rows) ? ranking.rows : []) {
    addShape(errors, row, SHAPES.rankingRow, `${code}.row_structure`);
    if (row?.privacyStatus === 'released') {
      add(errors, safeCode(row.companyCode) && safeCode(row.sourceCode) &&
        typeof row.label === 'string' && row.label.trim().length > 0 &&
        row.label !== GRH_PROTECTED_BUCKET_LABEL, `${code}.released_identity`);
      add(errors, nonNegativeInteger(row.participants) && row.participants >= threshold, `${code}.small_cell`);
      const identity = `${String(row.companyCode)}:${String(row.sourceCode)}:${row.label}`;
      add(errors, !identities.has(identity), `${code}.duplicate_identity`);
      identities.add(identity);
    } else if (row?.privacyStatus === 'protected_aggregate') {
      protectedRows += 1;
      add(errors, row.companyCode === null && row.sourceCode === null &&
        row.label === GRH_PROTECTED_BUCKET_LABEL, `${code}.protected_identity`);
      add(errors, nonNegativeInteger(row.participants) && row.participants >= threshold, `${code}.protected_size`);
    } else {
      add(errors, false, `${code}.row_privacy_status`);
    }

    if (nonNegativeInteger(row?.participants)) {
      participantSum += row.participants;
      add(errors, row.participantDisplay === String(row.participants), `${code}.row_display`);
      add(errors, finitePercentage(row.sharePct) &&
        Math.abs(row.sharePct - expectedShare(row.participants, totalParticipants)) <= 0.0001,
      `${code}.share_identity`);
    }
  }
  add(errors, participantSum === totalParticipants, `${code}.total_identity`);
  add(errors, protectedRows <= 1, `${code}.protected_bucket_count`);
  add(errors,
    ranking?.privacyStatus === (protectedRows === 0 ? 'released' : 'partially_suppressed'),
    `${code}.status_identity`,
  );
}

function inspectMonetarySeries(errors, series) {
  add(errors, Array.isArray(series) && series.length > 0, 'compensation.series');
  const periods = new Set();
  for (const row of Array.isArray(series) ? series : []) {
    addShape(errors, row, SHAPES.monetaryRow, 'compensation.series.row_structure');
    addShape(errors, row?.amounts, GRH_EXECUTIVE_AMOUNT_KEYS, 'compensation.series.amount_structure');
    const periodSafe = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(row?.period || '');
    if (row?.period !== null) {
      add(errors, periodSafe && !periods.has(row.period), 'compensation.series.period');
      periods.add(row.period);
    }

    if (row?.privacyStatus === 'released') {
      add(errors, periodSafe, 'compensation.series.released_period');
      add(errors, nonNegativeInteger(row.participantCount) &&
        row.participantCount >= GRH_PRIVACY_THRESHOLDS.sensitive,
      'compensation.series.small_cell');
      add(errors, row.participantDisplay === String(row.participantCount), 'compensation.series.released_display');
      add(errors, GRH_EXECUTIVE_AMOUNT_KEYS.every(key => nonNegativeInteger(row?.amounts?.[key])),
        'compensation.series.released_amounts');
    } else if (row?.privacyStatus === 'suppressed') {
      add(errors, row.participantCount === null, 'compensation.series.suppressed_count');
      add(errors, row.participantDisplay === `<${GRH_PRIVACY_THRESHOLDS.sensitive}`,
        'compensation.series.suppressed_display');
      add(errors, GRH_EXECUTIVE_AMOUNT_KEYS.every(key => row?.amounts?.[key] === null),
        'compensation.series.suppressed_amounts');
    } else {
      add(errors, false, 'compensation.series.privacy_status');
    }
  }
}

function inspectSensitiveSeries(errors, domain, expectedTable, audience) {
  addShape(errors, domain, SHAPES.sensitiveDomain, `${expectedTable}.structure`);
  add(errors, domain?.sourceTable === expectedTable, `${expectedTable}.source_table`);
  add(errors, domain?.metric === 'valid_rows_by_year', `${expectedTable}.metric`);
  add(errors, Array.isArray(domain?.series), `${expectedTable}.series`);
  const periods = new Set();
  let suppressedRows = 0;
  let sawPortableSuppressed = false;
  for (const row of Array.isArray(domain?.series) ? domain.series : []) {
    addShape(errors, row, SHAPES.sensitiveRow, `${expectedTable}.series.row_structure`);
    const periodSafe = /^\d{4}$/.test(row?.period || '');
    if (row?.period !== null) {
      add(errors, periodSafe && !periods.has(row.period), `${expectedTable}.series.period`);
      periods.add(row.period);
    }
    if (row?.privacyStatus === 'released') {
      add(errors, audience !== 'portable' || !sawPortableSuppressed,
        `${expectedTable}.series.portable_order`);
      add(errors, periodSafe, `${expectedTable}.series.released_period`);
      add(errors, nonNegativeInteger(row.participantCount) &&
        row.participantCount >= GRH_PRIVACY_THRESHOLDS.sensitive,
      `${expectedTable}.series.small_cell`);
      add(errors, row.participantDisplay === String(row.participantCount),
        `${expectedTable}.series.released_display`);
      add(errors, nonNegativeInteger(row.value), `${expectedTable}.series.released_value`);
      add(errors, row.participantCount <= row.value, `${expectedTable}.series.cardinality_identity`);
    } else if (row?.privacyStatus === 'suppressed') {
      suppressedRows += 1;
      if (audience === 'portable') {
        sawPortableSuppressed = true;
        add(errors, row.period === null, `${expectedTable}.series.portable_suppressed_period`);
      }
      add(errors, row.participantCount === null, `${expectedTable}.series.suppressed_count`);
      add(errors, row.participantDisplay === `<${GRH_PRIVACY_THRESHOLDS.sensitive}`,
        `${expectedTable}.series.suppressed_display`);
      add(errors, row.value === null, `${expectedTable}.series.suppressed_value`);
    } else {
      add(errors, false, `${expectedTable}.series.privacy_status`);
    }
  }
  add(errors, suppressedRows === 0 || suppressedRows >= 2,
    `${expectedTable}.series.complementary_suppression`);
}

export function inspectGrhExecutiveContract(data) {
  const errors = [];
  addShape(errors, data, SHAPES.top, 'executive.structure');
  add(errors, data?.schemaVersion === GRH_EXECUTIVE_SCHEMA_VERSION, 'schema.version');
  add(errors, data?.policyVersion === GRH_PRIVACY_POLICY_VERSION, 'policy.version');

  addShape(errors, data?.source, SHAPES.source, 'source.structure');
  add(errors, typeof data?.source?.canonicalSystem === 'string' &&
    data.source.canonicalSystem.toLowerCase().includes('grh'), 'source.canonical_system');
  add(errors, /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(data?.source?.sourceFile || ''), 'source.file');
  add(errors, /^[0-9a-f]{64}$/.test(data?.source?.sourceSha256 || ''), 'source.sha256');
  add(errors, /^\d{4}-\d{2}-\d{2}$/.test(data?.source?.snapshotAsOf || ''), 'source.snapshot');
  add(errors, data?.source?.realtime === false, 'source.realtime');

  const privacy = data?.privacy;
  addShape(errors, privacy, SHAPES.privacy, 'privacy.structure');
  add(errors, ['interactive', 'portable'].includes(privacy?.audience), 'privacy.audience');
  add(errors, privacy?.interactiveThreshold === GRH_PRIVACY_THRESHOLDS.interactive,
    'privacy.interactive_threshold');
  add(errors, privacy?.sensitiveThreshold === GRH_PRIVACY_THRESHOLDS.sensitive,
    'privacy.sensitive_threshold');
  add(errors, privacy?.portableThreshold === GRH_PRIVACY_THRESHOLDS.portable,
    'privacy.portable_threshold');
  add(errors, privacy?.protectedBucketLabel === GRH_PROTECTED_BUCKET_LABEL,
    'privacy.protected_bucket_label');

  const workforce = data?.workforce;
  addShape(errors, workforce, SHAPES.workforce, 'workforce.structure');
  add(errors, typeof workforce?.definition === 'string' && workforce.definition.trim().length > 0,
    'workforce.definition');
  add(errors, /^\d{4}-(?:0[1-9]|1[0-2])$/.test(workforce?.referencePeriod || ''),
    'workforce.reference_period');
  add(errors, nonNegativeInteger(workforce?.payrollParticipants) && workforce.payrollParticipants > 0,
    'workforce.participants');
  for (const [property, suffix] of [
    ['bySector', 'bySector'],
    ['byCostCenter', 'byCostCenter'],
    ['byAgreement', 'byAgreement'],
  ]) {
    inspectRanking(errors, workforce?.[property], {
      code: `workforce.${suffix}`,
      audience: privacy?.audience,
      totalParticipants: workforce?.payrollParticipants,
    });
  }

  const compensation = data?.compensation;
  addShape(errors, compensation, SHAPES.compensation, 'compensation.structure');
  add(errors, compensation?.currency === 'not_declared_in_source', 'compensation.currency');
  add(errors, compensation?.amountUnit === 'source_currency_cents', 'compensation.amount_unit');
  add(errors, compensation?.metricStatus === 'calculation_control_not_bank_disbursement',
    'compensation.metric_status');
  inspectMonetarySeries(errors, compensation?.series);

  inspectSensitiveSeries(errors, data?.absence, 'ausencia', privacy?.audience);
  inspectSensitiveSeries(errors, data?.leave, 'licencia', privacy?.audience);
  inspectSensitiveSeries(errors, data?.movements, 'legamov', privacy?.audience);

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateGrhExecutiveContract(data) {
  return inspectGrhExecutiveContract(data).ok;
}
