import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import accessPolicy from '../../shared/access-policy.cjs';
import publishedDemoPolicy from '../../shared/published-demo-policy.cjs';

const { ACCESS_POLICY_VERSION, getSessionAccessForUser } = accessPolicy;
const {
  PUBLISHED_DEMO_CAPABILITIES,
  resolvePublishedDemoProfile,
} = publishedDemoPolicy;
const MAX_RATE_KEYS = 5000;

function publishedSessionId(profile) {
  if (!profile) return null;
  const canonical = resolvePublishedDemoProfile(profile.profileId);
  return canonical === profile ? `published-evaluation:${canonical.profileId}` : null;
}

export function exactBodyValue(body, key, pattern) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== key || typeof body[key] !== 'string') return null;
  return pattern.test(body[key]) ? body[key] : null;
}

export function isSameSiteRequest(req) {
  const site = String(req?.headers?.['sec-fetch-site'] || '').trim().toLowerCase();
  return !site || site === 'same-origin' || site === 'same-site' || site === 'none';
}

function requestKey(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || String(req?.socket?.remoteAddress || 'unknown').trim();
  const bounded = address.length > 0 && address.length <= 128 ? address : 'unknown';
  return crypto.createHash('sha256').update(bounded).digest('hex');
}

export function createFixedWindowRateLimiter({ limit, windowMs, clock = () => Date.now() }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000) {
    throw new TypeError('Invalid one-click session rate limit');
  }
  const entries = new Map();

  return Object.freeze({
    consume(req) {
      const now = clock();
      const key = requestKey(req);
      let entry = entries.get(key);
      if (!entry || now - entry.startedAt >= windowMs) {
        if (entries.size >= MAX_RATE_KEYS) {
          for (const [candidateKey, candidate] of entries) {
            if (now - candidate.startedAt >= windowMs) entries.delete(candidateKey);
          }
        }
        if (entries.size >= MAX_RATE_KEYS && !entries.has(key)) {
          return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
        }
        entry = { count: 0, startedAt: now };
        entries.set(key, entry);
      }
      if (entry.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - entry.startedAt)) / 1000)),
        };
      }
      entry.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  });
}

export function hasSessionSecret(environment = process.env) {
  return typeof environment.JWT_SECRET === 'string' && environment.JWT_SECRET.length >= 32;
}

export function createSessionToken(user, {
  authMode,
  expiresIn,
  environment = process.env,
  issuedAt = null,
  publishedProfile = null,
}) {
  const canonicalPublishedProfile = publishedProfile
    ? resolvePublishedDemoProfile(publishedProfile.profileId)
    : null;
  const isPublishedProfile = publishedProfile !== null && canonicalPublishedProfile === publishedProfile;
  const opaquePublishedId = publishedSessionId(publishedProfile);
  const payload = isPublishedProfile
    ? {
        id: opaquePublishedId,
        profileId: canonicalPublishedProfile.profileId,
        role: canonicalPublishedProfile.role,
        tenantId: user.tenantId,
        authMode: 'published-evaluation',
      }
    : {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        name: user.name,
        authMode,
      };
  if (issuedAt instanceof Date && Number.isFinite(issuedAt.getTime())) {
    payload.iat = Math.floor(issuedAt.getTime() / 1000);
  }
  return jwt.sign(payload, environment.JWT_SECRET, { expiresIn });
}

export function sessionResponseUser(user, {
  publishedProfile = null,
  exposePublishedSessionId = false,
} = {}) {
  const sessionAccess = getSessionAccessForUser(user);
  if (!sessionAccess) return null;
  return {
    id: publishedProfile
      ? (exposePublishedSessionId ? (publishedSessionId(publishedProfile) || '') : '')
      : user.id,
    name: publishedProfile ? `Evaluación ${publishedProfile.label}` : user.name,
    email: publishedProfile ? '' : user.email,
    role: user.role,
    tenantId: user.tenantId,
    tenant: user.tenant,
    capabilities: publishedProfile ? [...PUBLISHED_DEMO_CAPABILITIES] : sessionAccess.capabilities,
    accessPolicyVersion: ACCESS_POLICY_VERSION,
    homeProfile: sessionAccess.homeProfile,
  };
}

export function secureHashMatches(value, expectedSha256) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(value) ||
      typeof expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedSha256)) return false;
  const actual = Buffer.from(crypto.createHash('sha256').update(value).digest('hex'), 'hex');
  const expected = Buffer.from(expectedSha256, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function futureExpiry(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime() ? new Date(timestamp) : null;
}
