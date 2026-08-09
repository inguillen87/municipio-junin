import { assertPrismaDatabaseTransport, prisma } from '../lib/db.js';
import { cors, noStore } from '../lib/auth.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import tenantLifecycle from '../../shared/tenant-lifecycle.cjs';
import authInputPolicy from '../../shared/auth-input-policy.cjs';
import accessPolicy from '../../shared/access-policy.cjs';

const { evaluateTenantAccess } = tenantLifecycle;
const { inspectLoginCredentials } = authInputPolicy;
const {
  ACCESS_POLICY_VERSION,
  getSessionAccessForUser,
  isKnownRole,
} = accessPolicy;

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function attemptKey(req, email) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return `${forwarded || req.socket?.remoteAddress || 'unknown'}:${email}`;
}

function tooManyAttempts(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 0, startedAt: now });
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailure(key) {
  const entry = loginAttempts.get(key) || { count: 0, startedAt: Date.now() };
  entry.count += 1;
  loginAttempts.set(key, entry);
}

export default async function handler(req, res) {
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const credentials = inspectLoginCredentials(req.body);
  if (!credentials.ok) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }
  const { email, password } = credentials;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ error: 'Autenticación no configurada' });
  }
  try {
    assertPrismaDatabaseTransport();
  } catch {
    return res.status(503).json({ error: 'La base de autenticación no supera la política TLS' });
  }
  const key = attemptKey(req, email);
  if (tooManyAttempts(key)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: 'Demasiados intentos. Reintentá más tarde.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true }
    });

    if (!user || !user.active) {
      recordFailure(key);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      recordFailure(key);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (!isKnownRole(user.role)) {
      return res.status(403).json({ error: 'Rol no habilitado' });
    }
    if (!user.tenantId && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Usuario sin municipio habilitado' });
    }
    if (user.tenantId && !evaluateTenantAccess(user.tenant).allowed) {
      return res.status(403).json({ error: 'Municipio no habilitado' });
    }
    const sessionAccess = getSessionAccessForUser(user);
    if (!sessionAccess) {
      return res.status(403).json({ error: 'Perfil de inicio no habilitado' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date(), loginCount: { increment: 1 } }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    loginAttempts.delete(key);

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant,
        capabilities: sessionAccess.capabilities,
        accessPolicyVersion: ACCESS_POLICY_VERSION,
        homeProfile: sessionAccess.homeProfile,
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno' });
  }
}
