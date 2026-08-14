import { assertPrismaDatabaseTransport, prisma } from '../lib/db.js';
import { cors, noStore } from '../lib/auth.js';
import {
  createFixedWindowRateLimiter,
  createSessionToken,
  exactBodyValue,
  hasSessionSecret,
  isSameSiteRequest,
  sessionResponseUser,
} from '../lib/one-click-session.js';
import publishedDemoPolicy from '../../shared/published-demo-policy.cjs';
import releaseTruthContract from '../../shared/release-truth-contract.cjs';
import tenantLifecycle from '../../shared/tenant-lifecycle.cjs';

const { resolvePublishedDemoProfile } = publishedDemoPolicy;
const { HEADER_NAME, SESSION_EXCHANGE_CONTRACTS } = releaseTruthContract;
const { evaluateTenantAccess } = tenantLifecycle;
const PROFILE_ID_PATTERN = /^[a-z][a-z-]{2,31}$/;
const limiter = createFixedWindowRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });
const PUBLISHED_IDENTITY_RETRY_DELAY_MS = 100;
const RETRYABLE_PRISMA_READ_CODES = new Set(['P1001', 'P1002', 'P2024']);
const RETRYABLE_PRISMA_ERROR_NAMES = new Set([
  'PrismaClientInitializationError',
  'PrismaClientKnownRequestError',
]);

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function prismaErrorMetadata(error, attempt) {
  const rawName = typeof error?.name === 'string' ? error.name : '';
  const rawCode = typeof error?.code === 'string'
    ? error.code
    : (typeof error?.errorCode === 'string' ? error.errorCode : '');
  return Object.freeze({
    name: RETRYABLE_PRISMA_ERROR_NAMES.has(rawName) ? rawName : 'Error',
    code: /^P\d{4}$/.test(rawCode) ? rawCode : 'UNKNOWN',
    attempt,
  });
}

function isRetryablePrismaRead(error) {
  const metadata = prismaErrorMetadata(error, 1);
  return RETRYABLE_PRISMA_ERROR_NAMES.has(metadata.name) &&
    RETRYABLE_PRISMA_READ_CODES.has(metadata.code);
}

function logIdentityReadFailure(error, attempt) {
  console.error(
    '[AUTH] No se pudo validar el perfil de evaluación publicado',
    prismaErrorMetadata(error, attempt),
  );
}

async function findPublishedIdentity(findUserImpl, options, retryDelayImpl) {
  try {
    return await findUserImpl(options);
  } catch (error) {
    if (!isRetryablePrismaRead(error)) {
      logIdentityReadFailure(error, 1);
      throw error;
    }
    console.warn(
      '[AUTH] Reintentando lectura del perfil de evaluación publicado',
      prismaErrorMetadata(error, 1),
    );
    await retryDelayImpl(PUBLISHED_IDENTITY_RETRY_DELAY_MS);
  }

  try {
    return await findUserImpl(options);
  } catch (error) {
    logIdentityReadFailure(error, 2);
    throw error;
  }
}

function unavailable(res) {
  return res.status(503).json({ error: 'El acceso de evaluación no está disponible.' });
}

function denied(res) {
  return res.status(403).json({ error: 'El perfil de evaluación no está disponible.' });
}

export function createEvaluationSessionHandler({
  environment = process.env,
  findUserImpl = options => prisma.user.findUnique(options),
  assertTransportImpl = assertPrismaDatabaseTransport,
  limiterImpl = limiter,
  clock = () => new Date(),
  retryDelayImpl = wait,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, SESSION_EXCHANGE_CONTRACTS['/api/auth/evaluation-session']);
    cors(req, res);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error: 'Método no permitido' });
    }
    if (!isSameSiteRequest(req)) return res.status(403).json({ error: 'Solicitud no permitida' });

    const profileId = exactBodyValue(req.body, 'profileId', PROFILE_ID_PATTERN);
    const profile = profileId ? resolvePublishedDemoProfile(profileId) : null;
    if (!profile) return res.status(400).json({ error: 'Perfil de evaluación inválido' });

    const rate = limiterImpl.consume(req);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      return res.status(429).json({ error: 'Demasiados accesos. Reintentá más tarde.' });
    }

    const configuredTenantId = String(environment.GRH_TENANT_ID || '').trim();
    if (!hasSessionSecret(environment) || !configuredTenantId || configuredTenantId.length > 128) {
      return unavailable(res);
    }
    try {
      if (!assertTransportImpl()) return unavailable(res);
    } catch {
      return unavailable(res);
    }

    let user;
    try {
      user = await findPublishedIdentity(findUserImpl, {
        where: { email: profile.email },
        include: { tenant: true },
      }, retryDelayImpl);
    } catch {
      return unavailable(res);
    }

    try {
      const identityMatches = user && user.active === true &&
        user.email === profile.email && user.role === profile.role &&
        user.tenantId === configuredTenantId && user.tenant?.id === configuredTenantId &&
        user.tenant?.slug === profile.tenantSlug && evaluateTenantAccess(user.tenant, clock()).allowed;
      if (!identityMatches) return denied(res);

      const responseUser = sessionResponseUser(user, { publishedProfile: profile });
      if (!responseUser) return denied(res);
      const token = createSessionToken(user, {
        authMode: 'published-evaluation',
        expiresIn: '2h',
        environment,
        issuedAt: clock(),
        publishedProfile: profile,
      });
      return res.status(200).json({ token, user: responseUser });
    } catch (error) {
      logIdentityReadFailure(error, 1);
      return unavailable(res);
    }
  };
}

export default createEvaluationSessionHandler();
