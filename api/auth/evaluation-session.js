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

    try {
      const user = await findUserImpl({
        where: { email: profile.email },
        include: { tenant: true },
      });
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
    } catch {
      console.error('[AUTH] No se pudo validar el perfil de evaluación publicado');
      return unavailable(res);
    }
  };
}

export default createEvaluationSessionHandler();
