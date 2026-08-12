export const AUTH_TIMEOUT_MS = 12_000;
export const SAFE_WORKSPACE = '/inicio.html';
const SESSION_CONTRACT = 'municontrol-auth-me-v1';
const CONTRACT_HEADER = 'x-municontrol-contract';
const ACCESS_POLICY_VERSION = '2026-08-11.3';

const ROLE_HOME_VARIANTS = Object.freeze({
  SUPER_ADMIN: 'platform-governance',
  TENANT_ADMIN: 'municipal-operations',
  INTENDENTE: 'executive-leadership',
  TENANT_USER: 'municipal-limited',
  CONTADOR: 'financial-control',
  INSPECTOR: 'territorial-unassigned',
  DEMO: 'controlled-preview',
} as const);

const ROLE_HOME_PRIORITIES = Object.freeze({
  SUPER_ADMIN: Object.freeze([
    'navigation.workspace',
    'navigation.audit',
    'navigation.import',
    'navigation.data-quality',
  ]),
  TENANT_ADMIN: Object.freeze([
    'navigation.workspace',
    'navigation.import',
    'navigation.audit',
    'navigation.data-quality',
  ]),
  INTENDENTE: Object.freeze([
    'navigation.workspace',
    'navigation.dashboard',
    'navigation.grh-executive',
    'navigation.reports',
  ]),
  TENANT_USER: Object.freeze([
    'navigation.workspace',
    'navigation.territory',
    'navigation.help',
  ]),
  CONTADOR: Object.freeze([
    'navigation.workspace',
    'navigation.hacienda',
    'navigation.reports',
    'navigation.data-quality',
  ]),
  INSPECTOR: Object.freeze([
    'navigation.workspace',
    'navigation.territory',
    'navigation.help',
  ]),
  DEMO: Object.freeze([
    'navigation.workspace',
    'navigation.territory',
    'navigation.help',
  ]),
} as const);

type SessionRole = keyof typeof ROLE_HOME_VARIANTS;
export type SessionHomeVariant = (typeof ROLE_HOME_VARIANTS)[SessionRole];
const HOME_PROFILE_KEYS = Object.freeze(['defaultPath', 'priorityCapabilities', 'variant']);

const LIMITED_SESSION_ROLES = new Set([
  'TENANT_USER',
  'INSPECTOR',
  'DEMO',
]);

const LIMITED_SESSION_CAPABILITIES = new Set([
  'session.read',
  'navigation.workspace',
  'navigation.territory',
  'navigation.help',
]);

const KNOWN_CAPABILITIES = new Set([
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.grh-decisions',
  'navigation.organization-analytics',
  'navigation.territory',
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.ai-assistant',
  'navigation.audit',
  'navigation.export',
  'navigation.import',
  'navigation.help',
]);

export function isKnownNavigationCapability(value: string): boolean {
  return value.startsWith('navigation.') && KNOWN_CAPABILITIES.has(value);
}

interface AuthClient {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface SessionIdentity {
  id: string;
  name: string;
  role: SessionRole;
  tenant: string;
  tenantId: string;
  capabilities: readonly string[];
  accessPolicyVersion: typeof ACCESS_POLICY_VERSION;
  homeVariant: SessionHomeVariant;
}

interface FetchSessionOptions {
  requiredCapability: string;
  signal: AbortSignal;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sessionRole(value: unknown): value is SessionRole {
  return typeof value === 'string' && Object.hasOwn(ROLE_HOME_VARIANTS, value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function validHomeProfile(
  value: unknown,
  role: SessionRole,
  capabilities: readonly string[],
): boolean {
  if (!plainObject(value) || !exactKeys(value, HOME_PROFILE_KEYS) ||
      value.variant !== ROLE_HOME_VARIANTS[role] || value.defaultPath !== 'inicio.html' ||
      !Array.isArray(value.priorityCapabilities) || value.priorityCapabilities.length === 0) {
    return false;
  }

  const priorities = value.priorityCapabilities;
  const expectedPriorities = ROLE_HOME_PRIORITIES[role];
  return priorities.length === expectedPriorities.length && priorities.every((capability, index) =>
    typeof capability === 'string' && capability === expectedPriorities[index] &&
    KNOWN_CAPABILITIES.has(capability) && capabilities.includes(capability));
}

function authClient(): AuthClient | null {
  const candidate = (window as Window & { MuniAuth?: unknown }).MuniAuth;
  if (!plainObject(candidate) || typeof candidate.fetch !== 'function') return null;
  return candidate;
}

export function parseAuthoritativeSession(
  payload: unknown,
  requiredCapability: string,
): SessionIdentity | null {
  if (!KNOWN_CAPABILITIES.has(requiredCapability)) return null;
  if (!plainObject(payload) || !plainObject(payload.user)) return null;

  const { user } = payload;
  if (!nonEmptyString(user.id) || !nonEmptyString(user.name) || !sessionRole(user.role) ||
      !nonEmptyString(user.tenantId) || !Array.isArray(user.capabilities)) {
    return null;
  }
  if (user.accessPolicyVersion !== ACCESS_POLICY_VERSION) return null;

  const capabilities = user.capabilities;
  if (!capabilities.every((capability): capability is string =>
    typeof capability === 'string' && KNOWN_CAPABILITIES.has(capability))) {
    return null;
  }
  if (capabilities.length === 0 || new Set(capabilities).size !== capabilities.length) return null;
  if (LIMITED_SESSION_ROLES.has(user.role) &&
      !capabilities.every(capability => LIMITED_SESSION_CAPABILITIES.has(capability))) {
    return null;
  }
  if (!capabilities.includes('session.read') || !capabilities.includes('navigation.workspace') ||
      !capabilities.includes(requiredCapability)) {
    return null;
  }
  if (!validHomeProfile(user.homeProfile, user.role, capabilities)) return null;

  if (!plainObject(user.tenant) || user.tenant.id !== user.tenantId) return null;
  let tenant = user.tenantId;
  if (nonEmptyString(user.tenant.shortName)) tenant = user.tenant.shortName;
  else if (nonEmptyString(user.tenant.name)) tenant = user.tenant.name;

  return Object.freeze({
    id: user.id,
    name: user.name,
    role: user.role,
    tenant,
    tenantId: user.tenantId,
    capabilities: Object.freeze([...capabilities]),
    accessPolicyVersion: ACCESS_POLICY_VERSION,
    homeVariant: ROLE_HOME_VARIANTS[user.role],
  });
}

export function redirectToSafeWorkspace() {
  try {
    window.sessionStorage.setItem(
      'mjunin_access_notice',
      'El perfil actual no tiene habilitada la superficie solicitada.',
    );
  } catch {
    // The redirect is the security behavior; the explanatory notice is optional.
  }
  window.location.replace(SAFE_WORKSPACE);
}

export async function fetchAuthoritativeSession({
  requiredCapability,
  signal,
}: FetchSessionOptions): Promise<SessionIdentity | null> {
  const client = authClient();
  if (!client) throw new Error('AUTH_CLIENT_UNAVAILABLE');

  const response = await client.fetch('/api/auth/me', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal,
  });
  const contentType = response.headers.get('content-type');
  const contract = response.headers.get(CONTRACT_HEADER);
  if (!response.ok || response.status !== 200 ||
      typeof contentType !== 'string' ||
      !/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType) ||
      contract !== SESSION_CONTRACT) {
    throw new Error('SESSION_UNAVAILABLE');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  return parseAuthoritativeSession(payload, requiredCapability);
}
