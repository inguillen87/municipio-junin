import { createHmac } from 'node:crypto';

const PRINCIPAL_PATTERN = /^muni_[A-Za-z0-9_-]{43}$/u;
const IDENTITY_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/u;
const RATE_WINDOW_MS = 60_000;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PRINCIPALS = 5_000;
const DEFAULT_RATE_LIMIT = 6;
const MAX_RATE_LIMIT = 20;
const DEFAULT_DAILY_QUOTA = 40;
const MAX_DAILY_QUOTA = 200;
const DEFAULT_CONCURRENCY_LIMIT = 1;
const MAX_CONCURRENCY_LIMIT = 2;

let sharedGate = null;
let sharedGateKey = '';

export function createMunicipalCopilotSafetyIdentifier({ secret, tenantId, userId } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 ||
      typeof tenantId !== 'string' || !IDENTITY_PATTERN.test(tenantId) ||
      typeof userId !== 'string' || !IDENTITY_PATTERN.test(userId)) return null;
  return `muni_${createHmac('sha256', secret)
    .update(`municipal-copilot-safety-v1\u0000${tenantId}\u0000${userId}`, 'utf8')
    .digest('base64url')}`;
}

export function resolveMunicipalCopilotBudgetConfig(environment = process.env) {
  return Object.freeze({
    rateLimit: resolveBoundedInteger(
      environment?.MUNI_AI_RATE_LIMIT_PER_MINUTE,
      DEFAULT_RATE_LIMIT,
      1,
      MAX_RATE_LIMIT,
    ),
    dailyQuota: resolveBoundedInteger(
      environment?.MUNI_AI_DAILY_QUOTA_PER_PRINCIPAL,
      DEFAULT_DAILY_QUOTA,
      1,
      MAX_DAILY_QUOTA,
    ),
    concurrencyLimit: resolveBoundedInteger(
      environment?.MUNI_AI_MAX_CONCURRENCY_PER_PRINCIPAL,
      DEFAULT_CONCURRENCY_LIMIT,
      1,
      MAX_CONCURRENCY_LIMIT,
    ),
  });
}

export function sharedMunicipalCopilotBudgetGate(environment = process.env) {
  const config = resolveMunicipalCopilotBudgetConfig(environment);
  const key = `${config.rateLimit}:${config.dailyQuota}:${config.concurrencyLimit}`;
  if (!sharedGate || sharedGateKey !== key) {
    sharedGate = createMunicipalCopilotBudgetGate(config);
    sharedGateKey = key;
  }
  return sharedGate;
}

export function createMunicipalCopilotBudgetGate({
  rateLimit = DEFAULT_RATE_LIMIT,
  dailyQuota = DEFAULT_DAILY_QUOTA,
  concurrencyLimit = DEFAULT_CONCURRENCY_LIMIT,
  maxPrincipals = MAX_PRINCIPALS,
  clock = () => Date.now(),
} = {}) {
  if (![rateLimit, dailyQuota, concurrencyLimit, maxPrincipals]
    .every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new TypeError('Invalid municipal copilot budget configuration');
  }
  const entries = new Map();

  return Object.freeze({
    acquire({ principalKey } = {}) {
      if (typeof principalKey !== 'string' || !PRINCIPAL_PATTERN.test(principalKey)) {
        return denied('PROVIDER_BUDGET_CONTEXT_INVALID', 0);
      }
      const now = clock();
      if (!Number.isFinite(now) || now < 0) {
        return denied('PROVIDER_BUDGET_CLOCK_INVALID', 0);
      }
      let entry = entries.get(principalKey);
      if (!entry) {
        if (entries.size >= maxPrincipals) removeExpiredEntries(entries, now);
        if (entries.size >= maxPrincipals) {
          return denied('PROVIDER_BUDGET_CAPACITY_EXHAUSTED', 60);
        }
        entry = {
          rateStartedAt: now,
          rateCount: 0,
          quotaStartedAt: now,
          quotaCount: 0,
          inFlight: 0,
        };
        entries.set(principalKey, entry);
      }
      resetExpiredWindows(entry, now);
      if (entry.inFlight >= concurrencyLimit) {
        return denied('PROVIDER_CONCURRENCY_LIMIT', 1);
      }
      if (entry.rateCount >= rateLimit) {
        return denied(
          'PROVIDER_RATE_LIMIT',
          remainingSeconds(entry.rateStartedAt, RATE_WINDOW_MS, now),
        );
      }
      if (entry.quotaCount >= dailyQuota) {
        return denied(
          'PROVIDER_DAILY_QUOTA_EXHAUSTED',
          remainingSeconds(entry.quotaStartedAt, QUOTA_WINDOW_MS, now),
        );
      }

      entry.rateCount += 1;
      entry.quotaCount += 1;
      entry.inFlight += 1;
      let released = false;
      return Object.freeze({
        allowed: true,
        code: 'PROVIDER_BUDGET_ALLOWED',
        retryAfterSeconds: 0,
        release() {
          if (released) return;
          released = true;
          const current = entries.get(principalKey);
          if (current === entry && current.inFlight > 0) current.inFlight -= 1;
        },
      });
    },
  });
}

function resetExpiredWindows(entry, now) {
  if (now - entry.rateStartedAt >= RATE_WINDOW_MS) {
    entry.rateStartedAt = now;
    entry.rateCount = 0;
  }
  if (now - entry.quotaStartedAt >= QUOTA_WINDOW_MS) {
    entry.quotaStartedAt = now;
    entry.quotaCount = 0;
  }
}

function removeExpiredEntries(entries, now) {
  for (const [key, entry] of entries) {
    if (entry.inFlight === 0 && now - entry.rateStartedAt >= RATE_WINDOW_MS &&
        now - entry.quotaStartedAt >= QUOTA_WINDOW_MS) entries.delete(key);
  }
}

function remainingSeconds(startedAt, windowMs, now) {
  return Math.max(1, Math.ceil((windowMs - (now - startedAt)) / 1000));
}

function denied(code, retryAfterSeconds) {
  return Object.freeze({ allowed: false, code, retryAfterSeconds, release: null });
}

function resolveBoundedInteger(value, fallback, minimum, maximum) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}
