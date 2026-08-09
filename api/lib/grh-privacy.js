export const GRH_PRIVACY_POLICY_VERSION = 'grh-small-cell-v1';
export const GRH_PROTECTED_BUCKET_LABEL = 'Otros (celdas protegidas)';

export const GRH_PRIVACY_THRESHOLDS = Object.freeze({
  interactive: 5,
  sensitive: 10,
  portable: 10,
});

const ALLOWED_AUDIENCES = new Set(['interactive', 'portable']);
const ALLOWED_DOMAINS = new Set([
  'workforce',
  'compensation',
  'absence',
  'leave',
  'movements',
  'geography',
]);
const SENSITIVE_DOMAINS = new Set([
  'compensation',
  'absence',
  'leave',
  'movements',
  'geography',
]);
const MONTH_PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const YEAR_PERIOD = /^\d{4}$/;

function privacyError(message) {
  const error = new TypeError(message);
  error.code = 'GRH_PRIVACY_CONTEXT_INVALID';
  return error;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeCode(value) {
  if (Number.isSafeInteger(value) && value >= 0) return true;
  return typeof value === 'string' && value.length > 0 && value.length <= 64 &&
    /^[A-Za-z0-9._/-]+$/.test(value);
}

function safeLabel(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160 &&
    value !== GRH_PROTECTED_BUCKET_LABEL &&
    !/[\u0000-\u001F\u007F]/.test(value);
}

function safePeriod(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function sharePct(participants, totalParticipants) {
  return Number(((participants / totalParticipants) * 100).toFixed(4));
}

function protectedRankingRow(participants, threshold, privacyStatus) {
  return {
    companyCode: null,
    sourceCode: null,
    label: GRH_PROTECTED_BUCKET_LABEL,
    participants,
    participantDisplay: participants === null ? `<${threshold}` : String(participants),
    sharePct: participants === null ? null : 100,
    privacyStatus,
  };
}

function fullySuppressedRanking(totalParticipants, threshold) {
  const releasableTotal = nonNegativeInteger(totalParticipants) && totalParticipants >= threshold;
  const safeTotal = releasableTotal ? totalParticipants : null;
  return deepFreeze({
    threshold,
    totalParticipants: safeTotal,
    participantDisplay: safeTotal === null ? `<${threshold}` : String(safeTotal),
    privacyStatus: 'suppressed',
    rows: [protectedRankingRow(
      safeTotal,
      threshold,
      safeTotal === null ? 'suppressed' : 'protected_aggregate',
    )],
  });
}

function compareRankingRows(left, right) {
  if (right.participants !== left.participants) return right.participants - left.participants;
  if (left.label !== right.label) return left.label < right.label ? -1 : 1;
  const leftCode = String(left.sourceCode);
  const rightCode = String(right.sourceCode);
  if (leftCode === rightCode) return 0;
  return leftCode < rightCode ? -1 : 1;
}

function moveSmallestVisibleToProtected(visible, protectedRows) {
  if (visible.length === 0) return false;
  let smallestIndex = 0;
  for (let index = 1; index < visible.length; index += 1) {
    if (compareRankingRows(visible[smallestIndex], visible[index]) < 0) {
      smallestIndex = index;
    }
  }
  protectedRows.push(visible.splice(smallestIndex, 1)[0]);
  return true;
}

function completeProtectedGroup(visible, protectedRows, threshold) {
  if (protectedRows.length === 0) return 0;
  let protectedTotal = protectedRows.reduce((total, row) => total + row.participants, 0);
  while (
    visible.length > 0 &&
    (protectedRows.length === 1 || protectedTotal < threshold)
  ) {
    const previousLength = protectedRows.length;
    moveSmallestVisibleToProtected(visible, protectedRows);
    if (protectedRows.length === previousLength) break;
    protectedTotal = protectedRows.reduce((total, row) => total + row.participants, 0);
  }
  return protectedTotal;
}

function normalizeRankingRow(row) {
  if (!plainObject(row) || !safeLabel(row.label) ||
      !safeCode(row.company_code) || !safeCode(row.source_code) ||
      !nonNegativeInteger(row.participants)) {
    return null;
  }
  return {
    companyCode: row.company_code,
    sourceCode: row.source_code,
    label: row.label.trim(),
    participants: row.participants,
  };
}

export function resolveGrhPrivacyThreshold({ audience, domain } = {}) {
  if (!ALLOWED_AUDIENCES.has(audience) || !ALLOWED_DOMAINS.has(domain)) {
    throw privacyError('Contexto de privacidad GRH no soportado.');
  }
  if (audience === 'portable') return GRH_PRIVACY_THRESHOLDS.portable;
  if (SENSITIVE_DOMAINS.has(domain)) return GRH_PRIVACY_THRESHOLDS.sensitive;
  return GRH_PRIVACY_THRESHOLDS.interactive;
}

export function protectGrhRanking(rows, {
  audience = 'interactive',
  domain = 'workforce',
  totalParticipants,
  topN,
} = {}) {
  const threshold = resolveGrhPrivacyThreshold({ audience, domain });
  if (topN !== undefined && (!Number.isSafeInteger(topN) || topN < 1 || topN > 100)) {
    throw privacyError('El limite del ranking GRH no es valido.');
  }
  if (!Array.isArray(rows) || !nonNegativeInteger(totalParticipants) || totalParticipants < threshold) {
    return fullySuppressedRanking(totalParticipants, threshold);
  }

  const normalized = rows.map(normalizeRankingRow);
  if (normalized.length === 0 || normalized.some(row => row === null)) {
    return fullySuppressedRanking(totalParticipants, threshold);
  }
  const sourceTotal = normalized.reduce((total, row) => total + row.participants, 0);
  if (!Number.isSafeInteger(sourceTotal) || sourceTotal !== totalParticipants) {
    return fullySuppressedRanking(totalParticipants, threshold);
  }

  const visible = normalized.filter(row => row.participants >= threshold);
  const protectedRows = normalized.filter(row => row.participants < threshold);

  completeProtectedGroup(visible, protectedRows, threshold);
  visible.sort(compareRankingRows);

  const limit = topN ?? visible.length;
  if (visible.length > limit) {
    protectedRows.push(...visible.splice(limit));
  }
  completeProtectedGroup(visible, protectedRows, threshold);
  visible.sort(compareRankingRows);

  const outputRows = visible.map(row => ({
    ...row,
    participantDisplay: String(row.participants),
    sharePct: sharePct(row.participants, totalParticipants),
    privacyStatus: 'released',
  }));

  if (protectedRows.length > 0) {
    const protectedTotal = protectedRows.reduce((total, row) => total + row.participants, 0);
    if (protectedRows.length < 2 || protectedTotal < threshold) {
      return fullySuppressedRanking(totalParticipants, threshold);
    }
    outputRows.push({
      companyCode: null,
      sourceCode: null,
      label: GRH_PROTECTED_BUCKET_LABEL,
      participants: protectedTotal,
      participantDisplay: String(protectedTotal),
      sharePct: sharePct(protectedTotal, totalParticipants),
      privacyStatus: 'protected_aggregate',
    });
  }

  return deepFreeze({
    threshold,
    totalParticipants,
    participantDisplay: String(totalParticipants),
    privacyStatus: protectedRows.length > 0 ? 'partially_suppressed' : 'released',
    rows: outputRows,
  });
}

function normalizedAmountKeys(amountKeys) {
  if (!Array.isArray(amountKeys) || amountKeys.length === 0 ||
      !amountKeys.every(key => typeof key === 'string' && /^[a-z][A-Za-z0-9]*$/.test(key)) ||
      new Set(amountKeys).size !== amountKeys.length) {
    throw privacyError('Las medidas monetarias GRH no estan allowlisteadas.');
  }
  return [...amountKeys];
}

function nullAmounts(amountKeys) {
  return Object.fromEntries(amountKeys.map(key => [key, null]));
}

function validAmounts(value, amountKeys) {
  return plainObject(value) && amountKeys.every(key => Number.isSafeInteger(value[key]));
}

function uniqueSafePeriods(rows, pattern) {
  const counts = new Map();
  for (const row of rows) {
    if (!safePeriod(row?.period, pattern)) continue;
    counts.set(row.period, (counts.get(row.period) ?? 0) + 1);
  }
  return counts;
}

export function protectGrhMonetarySeries(rows, {
  audience = 'interactive',
  amountKeys,
  allowSuppressedPeriod = false,
} = {}) {
  const threshold = resolveGrhPrivacyThreshold({ audience, domain: 'compensation' });
  const safeAmountKeys = normalizedAmountKeys(amountKeys);
  if (!Array.isArray(rows)) throw privacyError('La serie monetaria GRH no es valida.');
  if (typeof allowSuppressedPeriod !== 'boolean') {
    throw privacyError('La politica de periodo monetario GRH no es valida.');
  }
  const periodCounts = uniqueSafePeriods(rows, MONTH_PERIOD);

  return deepFreeze(rows.map(row => {
    const periodIsSafe = safePeriod(row?.period, MONTH_PERIOD) && periodCounts.get(row.period) === 1;
    const participantCount = row?.participantCount;
    const releasable = periodIsSafe && nonNegativeInteger(participantCount) &&
      participantCount >= threshold && validAmounts(row?.amounts, safeAmountKeys);
    if (releasable) {
      return {
        period: row.period,
        participantCount,
        participantDisplay: String(participantCount),
        privacyStatus: 'released',
        amounts: Object.fromEntries(safeAmountKeys.map(key => [key, row.amounts[key]])),
      };
    }
    return {
      period: allowSuppressedPeriod && periodIsSafe ? row.period : null,
      participantCount: null,
      participantDisplay: `<${threshold}`,
      privacyStatus: 'suppressed',
      amounts: nullAmounts(safeAmountKeys),
    };
  }));
}

export function protectGrhSensitiveCountSeries(rows, {
  audience = 'interactive',
  domain,
  allowSuppressedPeriod = false,
} = {}) {
  const threshold = resolveGrhPrivacyThreshold({ audience, domain });
  if (!SENSITIVE_DOMAINS.has(domain) || domain === 'compensation' || !Array.isArray(rows)) {
    throw privacyError('La serie sensible GRH no tiene un dominio valido.');
  }
  if (typeof allowSuppressedPeriod !== 'boolean') {
    throw privacyError('La politica de periodo sensible GRH no es valida.');
  }
  const periodCounts = uniqueSafePeriods(rows, YEAR_PERIOD);

  return deepFreeze(rows.map(row => {
    const periodIsSafe = safePeriod(row?.period, YEAR_PERIOD) && periodCounts.get(row.period) === 1;
    const participantCount = row?.participantCount;
    const releasable = periodIsSafe && nonNegativeInteger(participantCount) &&
      participantCount >= threshold && nonNegativeInteger(row?.value) &&
      participantCount <= row.value;
    if (releasable) {
      return {
        period: row.period,
        value: row.value,
        participantCount,
        participantDisplay: String(participantCount),
        privacyStatus: 'released',
      };
    }
    return {
      period: allowSuppressedPeriod && periodIsSafe ? row.period : null,
      value: null,
      participantCount: null,
      participantDisplay: `<${threshold}`,
      privacyStatus: 'suppressed',
    };
  }));
}
