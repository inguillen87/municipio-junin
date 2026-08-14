import {
  SOURCE_INTAKE_ALLOWED_EXTENSIONS,
  SOURCE_INTAKE_AUTHORITIES,
  SOURCE_INTAKE_CLASSIFICATIONS,
  SOURCE_INTAKE_CURRENCIES,
  SOURCE_INTAKE_DOMAINS,
  SOURCE_INTAKE_MAX_FILE_BYTES,
  SOURCE_INTAKE_PROFILE_SCHEMA_VERSION,
  SOURCE_INTAKE_PURPOSES,
} from './source-intake-profiler.js';

export const SOURCE_INTAKE_SCHEMA_VERSION = 'municipal-source-intake-v1';
export const SOURCE_INTAKE_STATUS = 'quarantined';
export const SOURCE_INTAKE_AUDIT_ACTION = 'SOURCE_INTAKE_QUARANTINED';
export const SOURCE_INTAKE_AUDIT_ENTITY = 'source_intake_receipt';
export const SOURCE_INTAKE_LIST_LIMIT = 20;
export const SOURCE_INTAKE_MODES = Object.freeze({
  PERSISTENT: 'persistent_receipts',
  PREVIEW: 'evaluation_preview',
});
export const SOURCE_INTAKE_METADATA_KEYS = Object.freeze([
  'sourceLabel',
  'domain',
  'referencePeriod',
  'ownerOffice',
  'purpose',
  'classification',
  'authority',
  'currency',
  'containsPersonalData',
]);

const SOURCE_KEYS = Object.freeze([
  'label', 'domain', 'referencePeriod', 'ownerOffice', 'purpose',
  'classification', 'authority', 'currency', 'containsPersonalData',
]);
const FILE_KEYS = Object.freeze(['extension', 'kind', 'sizeBytes', 'sha256']);
const PROFILE_KEYS = Object.freeze([
  'schemaVersion', 'schemaDigest', 'rowCount', 'columnCount', 'emptyCellRatePct',
  'duplicateRowRatePct', 'pageCount', 'lineCount', 'textBytes',
]);
const CHECK_KEYS = Object.freeze(['code', 'status', 'severity', 'label']);
const QUALITY_KEYS = Object.freeze(['status', 'checks', 'passedCount', 'blockedCount']);
const LIMIT_KEYS = Object.freeze(['code', 'text']);
const RECEIPT_KEYS = Object.freeze([
  'id', 'status', 'createdAt', 'persisted', 'source', 'file', 'profile', 'quality', 'limits',
]);
const DETAILS_KEYS = Object.freeze(['schemaVersion', 'status', 'source', 'file', 'profile', 'quality', 'limits']);
const HEX_64 = /^[0-9a-f]{64}$/;
const SAFE_TOKEN = /^[a-z][a-z0-9_-]{0,63}$/;
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f]/u;
const NORMALIZED_ALLOWED_EXTENSIONS = Object.freeze(
  [...SOURCE_INTAKE_ALLOWED_EXTENSIONS].map(value => String(value).replace(/^\./, '').toLowerCase()).sort(),
);
const STRUCTURED_EXTENSIONS = new Set(['csv', 'json', 'xls', 'xlsx']);
const DOMAINS = new Set(SOURCE_INTAKE_DOMAINS);
const PURPOSES = new Set(SOURCE_INTAKE_PURPOSES);
const CLASSIFICATIONS = new Set(SOURCE_INTAKE_CLASSIFICATIONS);
const AUTHORITIES = new Set(SOURCE_INTAKE_AUTHORITIES);
const CURRENCIES = new Set(SOURCE_INTAKE_CURRENCIES);
const FINANCE_DOMAINS = new Set(['budget', 'purchases', 'treasury', 'accounting']);
const REFERENCE_PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const QUALITY_FIXED_CHECKS = Object.freeze({
  metadata_validated: Object.freeze(['passed', 'info']),
  file_within_limit: Object.freeze(['passed', 'info']),
  format_parsed: Object.freeze(['passed', 'info']),
  original_not_retained: Object.freeze(['blocked', 'high']),
  antimalware_not_run: Object.freeze(['blocked', 'high']),
});
const LIMIT_CODES = new Set(['original_not_retained', 'antimalware_not_run', 'quarantine_not_publication']);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function boundedText(value, maximum, { nullable = false } = {}) {
  if (nullable && value === null) return true;
  return typeof value === 'string' && value === value.trim() && value.length > 0 &&
    value.length <= maximum && !FORBIDDEN_TEXT.test(value);
}

function nullableCount(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function nullableRate(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
}

function isoInstant(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const normalized = new Date(milliseconds).toISOString();
  return normalized === value ? normalized : null;
}

function inspectSource(value, sourceKey = 'label') {
  const expected = sourceKey === 'sourceLabel'
    ? ['sourceLabel', ...SOURCE_KEYS.slice(1)]
    : SOURCE_KEYS;
  if (!exactKeys(value, expected)) return false;
  return boundedText(value[sourceKey], 120) && DOMAINS.has(value.domain) &&
    REFERENCE_PERIOD.test(value.referencePeriod || '') && boundedText(value.ownerOffice, 160) &&
    PURPOSES.has(value.purpose) && CLASSIFICATIONS.has(value.classification) &&
    AUTHORITIES.has(value.authority) && CURRENCIES.has(value.currency) &&
    (!FINANCE_DOMAINS.has(value.domain) || value.currency === 'ARS') &&
    typeof value.containsPersonalData === 'boolean';
}

function inspectFile(value) {
  if (!exactKeys(value, FILE_KEYS) || !NORMALIZED_ALLOWED_EXTENSIONS.includes(value.extension) ||
      !['structured', 'pdf', 'text'].includes(value.kind) || !Number.isSafeInteger(value.sizeBytes) ||
      value.sizeBytes < 1 || value.sizeBytes > SOURCE_INTAKE_MAX_FILE_BYTES ||
      !HEX_64.test(value.sha256 || '')) return false;
  return (STRUCTURED_EXTENSIONS.has(value.extension) && value.kind === 'structured') ||
    (value.extension === 'pdf' && value.kind === 'pdf') ||
    (value.extension === 'txt' && value.kind === 'text');
}

function inspectProfile(value, file) {
  if (!exactKeys(value, PROFILE_KEYS) || value.schemaVersion !== SOURCE_INTAKE_PROFILE_SCHEMA_VERSION ||
      !(value.schemaDigest === null || HEX_64.test(value.schemaDigest || '')) ||
      !nullableCount(value.rowCount) || !nullableCount(value.columnCount) ||
      !nullableRate(value.emptyCellRatePct) || !nullableRate(value.duplicateRowRatePct) ||
      !nullableCount(value.pageCount) || !nullableCount(value.lineCount) || !nullableCount(value.textBytes)) {
    return false;
  }
  if (file?.kind === 'structured') {
    return HEX_64.test(value.schemaDigest || '') && Number.isSafeInteger(value.rowCount) && value.rowCount > 0 &&
      Number.isSafeInteger(value.columnCount) && value.columnCount > 0 &&
      typeof value.emptyCellRatePct === 'number' && typeof value.duplicateRowRatePct === 'number' &&
      value.pageCount === null && value.lineCount === null && value.textBytes === null;
  }
  if (file?.kind === 'pdf') {
    return value.schemaDigest === null && value.rowCount === null && value.columnCount === null &&
      value.emptyCellRatePct === null && value.duplicateRowRatePct === null &&
      Number.isSafeInteger(value.pageCount) && value.pageCount > 0 && value.lineCount === null &&
      Number.isSafeInteger(value.textBytes) && value.textBytes > 0;
  }
  return file?.kind === 'text' && value.schemaDigest === null && value.rowCount === null &&
    value.columnCount === null && value.emptyCellRatePct === null && value.duplicateRowRatePct === null &&
    value.pageCount === null && Number.isSafeInteger(value.lineCount) && value.lineCount > 0 &&
    Number.isSafeInteger(value.textBytes) && value.textBytes > 0;
}

function inspectQuality(value, source) {
  if (!exactKeys(value, QUALITY_KEYS) || value.status !== 'blocked' ||
      !Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 32 ||
      !Number.isSafeInteger(value.passedCount) || value.passedCount < 0 ||
      !Number.isSafeInteger(value.blockedCount) || value.blockedCount < 1) return false;

  const codes = new Set();
  let passed = 0;
  let blocked = 0;
  for (const check of value.checks) {
    if (!exactKeys(check, CHECK_KEYS) || !SAFE_TOKEN.test(check.code || '') ||
        !['passed', 'blocked'].includes(check.status) || !['info', 'high'].includes(check.severity) ||
        !boundedText(check.label, 180) || codes.has(check.code)) return false;
    codes.add(check.code);
    if (check.status === 'passed') passed += 1;
    else blocked += 1;
  }
  if (value.passedCount !== passed || value.blockedCount !== blocked || codes.size !== 7) return false;
  const byCode = new Map(value.checks.map(check => [check.code, check]));
  for (const [code, [status, severity]] of Object.entries(QUALITY_FIXED_CHECKS)) {
    if (byCode.get(code)?.status !== status || byCode.get(code)?.severity !== severity) return false;
  }
  const expectedAuthority = source?.authority === 'owner_confirmed'
    ? 'authority_owner_confirmed'
    : 'authority_unverified';
  const unexpectedAuthority = expectedAuthority === 'authority_owner_confirmed'
    ? 'authority_unverified'
    : 'authority_owner_confirmed';
  if (!byCode.has(expectedAuthority) || byCode.has(unexpectedAuthority)) return false;
  if (byCode.get(expectedAuthority).status !== (source?.authority === 'owner_confirmed' ? 'passed' : 'blocked') ||
      byCode.get(expectedAuthority).severity !== (source?.authority === 'owner_confirmed' ? 'info' : 'high')) return false;
  const expectedPersonalData = source?.containsPersonalData
    ? 'personal_data_declared'
    : 'personal_data_not_declared';
  const unexpectedPersonalData = expectedPersonalData === 'personal_data_declared'
    ? 'personal_data_not_declared'
    : 'personal_data_declared';
  if (!byCode.has(expectedPersonalData) || byCode.has(unexpectedPersonalData)) return false;
  return byCode.get(expectedPersonalData).status === (source?.containsPersonalData ? 'blocked' : 'passed') &&
    byCode.get(expectedPersonalData).severity === (source?.containsPersonalData ? 'high' : 'info');
}

function inspectLimits(value) {
  if (!Array.isArray(value) || value.length !== LIMIT_CODES.size) return false;
  const codes = new Set();
  return value.every(limit => {
    if (!exactKeys(limit, LIMIT_KEYS) || !SAFE_TOKEN.test(limit.code || '') ||
        !boundedText(limit.text, 300) || codes.has(limit.code)) return false;
    codes.add(limit.code);
    return true;
  }) && codes.size === LIMIT_CODES.size && [...LIMIT_CODES].every(code => codes.has(code));
}

function cloneSource(source) {
  return {
    label: source.label,
    domain: source.domain,
    referencePeriod: source.referencePeriod,
    ownerOffice: source.ownerOffice,
    purpose: source.purpose,
    classification: source.classification,
    authority: source.authority,
    currency: source.currency,
    containsPersonalData: source.containsPersonalData,
  };
}

function cloneFile(file) {
  return {
    extension: file.extension,
    kind: file.kind,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  };
}

function cloneProfile(profile) {
  return Object.fromEntries(PROFILE_KEYS.map(key => [key, profile[key]]));
}

function cloneQuality(quality) {
  return {
    status: quality.status,
    checks: quality.checks.map(check => Object.fromEntries(CHECK_KEYS.map(key => [key, check[key]]))),
    passedCount: quality.passedCount,
    blockedCount: quality.blockedCount,
  };
}

function cloneLimits(limits) {
  return limits.map(limit => ({ code: limit.code, text: limit.text }));
}

export function normalizeProfiledSourceIntake(value) {
  if (!exactKeys(value, ['source', 'file', 'profile', 'quality', 'limits']) ||
      !inspectSource(value.source) || !inspectFile(value.file) ||
      !inspectProfile(value.profile, value.file) || !inspectQuality(value.quality, value.source) ||
      !inspectLimits(value.limits)) {
    throw new Error('SOURCE_INTAKE_PROFILE_INVALID');
  }
  return {
    source: cloneSource(value.source),
    file: cloneFile(value.file),
    profile: cloneProfile(value.profile),
    quality: cloneQuality(value.quality),
    limits: cloneLimits(value.limits),
  };
}

export function inspectSourceIntakeReceipt(value) {
  const errors = [];
  if (!exactKeys(value, RECEIPT_KEYS)) errors.push('receipt.keys');
  if (!boundedText(value?.id, 160)) errors.push('receipt.id');
  if (value?.status !== SOURCE_INTAKE_STATUS) errors.push('receipt.status');
  if (!isoInstant(value?.createdAt)) errors.push('receipt.created_at');
  if (typeof value?.persisted !== 'boolean') errors.push('receipt.persisted');
  if (!inspectSource(value?.source)) errors.push('receipt.source');
  if (!inspectFile(value?.file)) errors.push('receipt.file');
  if (!inspectProfile(value?.profile, value?.file)) errors.push('receipt.profile');
  if (!inspectQuality(value?.quality, value?.source)) errors.push('receipt.quality');
  if (!inspectLimits(value?.limits)) errors.push('receipt.limits');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function buildSourceIntakeReceipt({ id, createdAt, persisted, profiled }) {
  const normalized = normalizeProfiledSourceIntake(profiled);
  const receipt = {
    id,
    status: SOURCE_INTAKE_STATUS,
    createdAt: isoInstant(createdAt),
    persisted,
    ...normalized,
  };
  if (!inspectSourceIntakeReceipt(receipt).ok) throw new Error('SOURCE_INTAKE_RECEIPT_INVALID');
  return receipt;
}

export function sourceIntakeDetailsFromReceipt(receipt) {
  if (!inspectSourceIntakeReceipt(receipt).ok || receipt.persisted !== true) {
    throw new Error('SOURCE_INTAKE_RECEIPT_INVALID');
  }
  return {
    schemaVersion: SOURCE_INTAKE_SCHEMA_VERSION,
    status: receipt.status,
    source: cloneSource(receipt.source),
    file: cloneFile(receipt.file),
    profile: cloneProfile(receipt.profile),
    quality: cloneQuality(receipt.quality),
    limits: cloneLimits(receipt.limits),
  };
}

export function sourceIntakeDetailsFromProfiled(profiled) {
  const normalized = normalizeProfiledSourceIntake(profiled);
  return {
    schemaVersion: SOURCE_INTAKE_SCHEMA_VERSION,
    status: SOURCE_INTAKE_STATUS,
    source: normalized.source,
    file: normalized.file,
    profile: normalized.profile,
    quality: normalized.quality,
    limits: normalized.limits,
  };
}

export function sourceIntakeReceiptFromAuditLog(row) {
  if (!plainObject(row) || !boundedText(row.id, 160) || !exactKeys(row.details, DETAILS_KEYS) ||
      row.details.schemaVersion !== SOURCE_INTAKE_SCHEMA_VERSION ||
      row.details.status !== SOURCE_INTAKE_STATUS) {
    throw new Error('SOURCE_INTAKE_AUDIT_ROW_INVALID');
  }
  const receipt = {
    id: row.id,
    status: row.details.status,
    createdAt: isoInstant(row.createdAt),
    persisted: true,
    source: cloneSource(row.details.source),
    file: cloneFile(row.details.file),
    profile: cloneProfile(row.details.profile),
    quality: cloneQuality(row.details.quality),
    limits: cloneLimits(row.details.limits),
  };
  if (!inspectSourceIntakeReceipt(receipt).ok) throw new Error('SOURCE_INTAKE_AUDIT_ROW_INVALID');
  return receipt;
}

export function buildSourceIntakeEnvelope({ mode, receipt, receipts }) {
  const writeEnabled = mode === SOURCE_INTAKE_MODES.PERSISTENT;
  if (!writeEnabled && mode !== SOURCE_INTAKE_MODES.PREVIEW) {
    throw new Error('SOURCE_INTAKE_ENVELOPE_INVALID');
  }
  const hasReceipt = receipt !== undefined;
  const hasReceipts = receipts !== undefined;
  if (hasReceipt === hasReceipts) throw new Error('SOURCE_INTAKE_ENVELOPE_INVALID');
  if (!writeEnabled && (hasReceipt || !hasReceipts)) {
    throw new Error('SOURCE_INTAKE_ENVELOPE_INVALID');
  }
  if (hasReceipt && (!inspectSourceIntakeReceipt(receipt).ok || receipt.persisted !== writeEnabled)) {
    throw new Error('SOURCE_INTAKE_ENVELOPE_INVALID');
  }
  if (hasReceipts && (!Array.isArray(receipts) || receipts.length > SOURCE_INTAKE_LIST_LIMIT ||
      receipts.some(item => !inspectSourceIntakeReceipt(item).ok || item.persisted !== true) ||
      (!writeEnabled && receipts.length !== 0))) {
    throw new Error('SOURCE_INTAKE_ENVELOPE_INVALID');
  }
  return {
    schemaVersion: SOURCE_INTAKE_SCHEMA_VERSION,
    mode,
    writeEnabled,
    maxFileBytes: SOURCE_INTAKE_MAX_FILE_BYTES,
    allowedExtensions: [...NORMALIZED_ALLOWED_EXTENSIONS],
    ...(hasReceipt ? { receipt } : { receipts: [...receipts] }),
  };
}
