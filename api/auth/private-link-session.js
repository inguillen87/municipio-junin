import { assertPrismaDatabaseTransport, prisma } from '../lib/db.js';
import { cors, noStore } from '../lib/auth.js';
import {
  createFixedWindowRateLimiter,
  createSessionToken,
  exactBodyValue,
  futureExpiry,
  hasSessionSecret,
  isSameSiteRequest,
  secureHashMatches,
  sessionResponseUser,
} from '../lib/one-click-session.js';
import releaseTruthContract from '../../shared/release-truth-contract.cjs';
import tenantLifecycle from '../../shared/tenant-lifecycle.cjs';

const { HEADER_NAME, SESSION_EXCHANGE_CONTRACTS } = releaseTruthContract;
const { evaluateTenantAccess } = tenantLifecycle;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const limiter = createFixedWindowRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

function unavailable(res) {
  return res.status(503).json({ error: 'El enlace institucional no está disponible.' });
}

function denied(res) {
  return res.status(401).json({ error: 'El enlace institucional no es válido o ya venció.' });
}

export function createPrivateLinkSessionHandler({
  environment = process.env,
  findUserImpl = options => prisma.user.findUnique(options),
  assertTransportImpl = assertPrismaDatabaseTransport,
  limiterImpl = limiter,
  clock = () => new Date(),
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, SESSION_EXCHANGE_CONTRACTS['/api/auth/private-link-session']);
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

    const tokenValue = exactBodyValue(req.body, 'token', OPAQUE_TOKEN_PATTERN);
    if (!tokenValue) return res.status(400).json({ error: 'Enlace institucional inválido' });

    const rate = limiterImpl.consume(req);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      return res.status(429).json({ error: 'Demasiados accesos. Reintentá más tarde.' });
    }

    const now = clock();
    const expiresAt = futureExpiry(environment.PRIVATE_INTENDENTE_LINK_EXPIRES_AT, now);
    const userId = String(environment.PRIVATE_INTENDENTE_USER_ID || '').trim();
    const tenantId = String(environment.PRIVATE_INTENDENTE_TENANT_ID || '').trim();
    const grhTenantId = String(environment.GRH_TENANT_ID || '').trim();
    const configurationValid = hasSessionSecret(environment) && expiresAt &&
      USER_ID_PATTERN.test(userId) && tenantId.length > 0 && tenantId.length <= 128 &&
      tenantId === grhTenantId &&
      /^[0-9a-f]{64}$/.test(String(environment.PRIVATE_INTENDENTE_LINK_TOKEN_SHA256 || ''));
    if (!configurationValid) return unavailable(res);
    if (!secureHashMatches(tokenValue, environment.PRIVATE_INTENDENTE_LINK_TOKEN_SHA256)) return denied(res);
    try {
      if (!assertTransportImpl()) return unavailable(res);
    } catch {
      return unavailable(res);
    }

    try {
      const user = await findUserImpl({
        where: { id: userId },
        include: { tenant: true },
      });
      const identityMatches = user && user.active === true && user.id === userId &&
        user.role === 'INTENDENTE' && user.tenantId === tenantId &&
        user.tenant?.id === tenantId && user.tenant?.slug === 'junin' &&
        evaluateTenantAccess(user.tenant, now).allowed;
      if (!identityMatches) return denied(res);

      const responseUser = sessionResponseUser(user);
      if (!responseUser) return denied(res);
      const secondsUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
      const token = createSessionToken(user, {
        authMode: 'private-intendente-link',
        expiresIn: Math.max(1, Math.min(8 * 60 * 60, secondsUntilExpiry)),
        environment,
        issuedAt: now,
      });
      return res.status(200).json({ token, user: responseUser });
    } catch {
      console.error('[AUTH] No se pudo validar el enlace institucional');
      return unavailable(res);
    }
  };
}

export default createPrivateLinkSessionHandler();
