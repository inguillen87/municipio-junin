import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import releaseTruthContract from '../shared/release-truth-contract.cjs';

const modulePath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(modulePath), '..');
const RECEIPT_CONTRACT = 'municontrol-deployment-truth/v1';
const BASE_URL_ENV = 'MUNICONTROL_RELEASE_BASE_URL';
const DEMO_FIGURES_ENV = 'MUNICONTROL_RELEASE_DEMO_FIGURES';
const LOCAL_DOCUMENT_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 2;
const DEFAULT_DEMO_FIGURES = Object.freeze(['1247']);
const ALLOWED_ANONYMOUS_API_STATUSES = Object.freeze([401, 403]);
const PRISMA_PRIVATE_PATH = '/prisma/schema.prisma';
const PRISMA_DENY_ROUTE = Object.freeze({
  src: '/prisma(?:/.*)?',
  dest: '/404.html',
  status: 404,
  headers: Object.freeze({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }),
});
const PRISMA_SOURCE_BODY_MARKERS = Object.freeze([
  /\bgenerator\s+client\s*\{/i,
  /\bdatasource\s+db\s*\{/i,
  /\bprovider\s*=\s*["']prisma-client-js["']/i,
  /@@map\s*\(\s*["']tenants["']\s*\)/i,
  /\bpasswordHash\s+String\b/i,
]);
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROXY_ENV_NAMES = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']);
const { API_CONTRACTS, HEADER_NAME: API_CONTRACT_HEADER } = releaseTruthContract;

const ROOT_REQUIRED_MARKERS = Object.freeze([
  /<title>\s*Panel ejecutivo GRH\s*\|\s*MuniControl\s*<\/title>/i,
  /snapshot gobernado de GRH/i,
  /personas_junin/i,
  /js\/grh-secure-data\.js/i,
]);

const MANUAL_REQUIRED_MARKERS = Object.freeze([
  /grh-executive-v2/i,
  /grh-quality-v1/i,
  /Snapshot fechado,\s*no tiempo real/i,
]);

const LEGACY_ROOT_MARKERS = Object.freeze([
  /\bMuniDB\b/i,
]);

const UNSAFE_REALTIME_MARKERS = Object.freeze([
  /\bClima\s+en\s+tiempo\s+real\b/i,
  /\bDatos\s+en\s+tiempo\s+real\b/i,
  /\bInformaci[oó]n\s+en\s+tiempo\s+real\b/i,
  /\bActualizad[oa]s?\s+en\s+tiempo\s+real\b/i,
  /data-realtime\s*=\s*["']true["']/i,
]);

const UNSAFE_OFFICIAL_SOURCE_MARKERS = Object.freeze([
  /los\s+datos\s+provienen\s+de\s+la\s+base\s+de\s+datos\s+oficial\s+del\s+municipio/i,
  /datos\s+oficiales\s+del\s+municipio\s+en\s+tiempo\s+real/i,
  /conectad[oa]\s+(?:directamente\s+)?a\s+la\s+base\s+de\s+datos\s+oficial/i,
]);

const PROBES = Object.freeze([
  Object.freeze({ id: 'entry', path: '/', kind: 'entry', accept: 'text/html,application/xhtml+xml' }),
  Object.freeze({ id: 'dashboard', path: '/dashboard', kind: 'root', accept: 'text/html,application/xhtml+xml' }),
  Object.freeze({ id: 'workspace', path: '/inicio', kind: 'workspace', accept: 'text/html,application/xhtml+xml' }),
  Object.freeze({ id: 'roles', path: '/roles', kind: 'roles', accept: 'text/html,application/xhtml+xml' }),
  Object.freeze({ id: 'manual', path: '/manuales', kind: 'manual', accept: 'text/html,application/xhtml+xml' }),
  Object.freeze({ id: 'prisma-private', path: PRISMA_PRIVATE_PATH, kind: 'private', accept: 'text/plain,*/*;q=0.1' }),
  ...Object.entries(API_CONTRACTS).map(([probePath, expectedContract]) => Object.freeze({
    id: probePath.slice('/api/'.length).replaceAll('/', '-'),
    path: probePath,
    kind: 'api',
    accept: 'application/json',
    expectedContract,
  })),
]);

const FINDING_MESSAGES = Object.freeze({
  ARGUMENT_INVALID: 'La invocación contiene argumentos no permitidos.',
  BASE_URL_REQUIRED: 'Falta el origen HTTPS exacto a verificar.',
  BASE_URL_CONFLICT: 'El argumento y el entorno declaran orígenes diferentes.',
  BASE_URL_INVALID: 'El origen no cumple el contrato HTTPS exacto.',
  BASE_URL_CREDENTIALS_FORBIDDEN: 'El origen no puede contener credenciales.',
  BASE_URL_PATH_FORBIDDEN: 'El origen no puede contener path, query ni fragmento.',
  DEMO_FIGURES_INVALID: 'La configuración de cifras demo no es válida.',
  LOCAL_RELEASE_CONTRACT_INVALID: 'Los documentos locales no forman un contrato de release único y válido.',
  PROXY_ENV_FORBIDDEN: 'El release gate no permite proxies configurados por entorno.',
  DNS_RESOLUTION_FAILED: 'No se pudo resolver un conjunto DNS público y verificable.',
  DNS_NON_PUBLIC_ADDRESS: 'El destino resuelve a una dirección no pública.',
  DNS_REBINDING_DETECTED: 'El conjunto DNS cambió durante la verificación.',
  DNS_REVALIDATION_FAILED: 'El conjunto DNS no pudo revalidarse al finalizar.',
  STALE_RELEASE: 'La portada publicada no acredita el contrato ejecutivo actual.',
  WORKSPACE_RELEASE_DRIFT: 'El workspace publicado no coincide con la captura local autorizada.',
  WORKSPACE_REDIRECT_FORBIDDEN: 'El workspace debe responder en la ruta canonica exacta sin redirecciones.',
  ROLES_RELEASE_DRIFT: 'El tour publico de roles no coincide con la captura local autorizada.',
  ROLES_REDIRECT_FORBIDDEN: 'El tour publico de roles debe responder en la ruta canonica exacta sin redirecciones.',
  LEGACY_DEMO_DATA: 'La portada todavía expone runtime o cifras de demostración retiradas.',
  UNSAFE_REALTIME_CLAIM: 'La portada promete tiempo real sin evidencia operativa autorizada.',
  UNVERIFIED_OFFICIAL_SOURCE_CLAIM: 'La portada atribuye origen oficial conectado sin evidencia autorizada.',
  MANUAL_VERSION_DRIFT: 'El manual publicado no coincide con la versión y contratos vigentes.',
  CURRENT_APIS_MISSING: 'La ruta API actual no existe o devolvió contenido que no acredita una API JSON.',
  ANONYMOUS_API_EXPOSURE: 'La ruta API respondió contenido sin exigir autenticación.',
  API_AUTH_STATE_INVALID: 'La ruta API no devolvió un estado anónimo permitido.',
  API_CONTRACT_MISMATCH: 'La ruta API no acreditó su contrato específico.',
  API_REDIRECT_FORBIDDEN: 'Las rutas API no pueden redirigir.',
  PRISMA_ROUTE_EXPOSED: 'La ruta privada de Prisma no devolvió el 404 canónico.',
  PRISMA_ROUTE_BODY_EXPOSED: 'El 404 privado de Prisma contiene marcadores del schema.',
  PRISMA_ROUTE_HEADERS_INVALID: 'El 404 privado de Prisma no acreditó no-store y nosniff.',
  PRISMA_ROUTE_REDIRECT_FORBIDDEN: 'La ruta privada de Prisma no puede redirigir.',
  REDIRECT_ORIGIN_CHANGED: 'Una redirección intentó abandonar el origen exacto autorizado.',
  REDIRECT_TARGET_UNSAFE: 'Una redirección incluyó componentes de URL no permitidos.',
  REDIRECT_LIMIT_EXCEEDED: 'La cadena de redirecciones superó el límite permitido.',
  FINAL_PATH_MISMATCH: 'El documento terminó en una ruta diferente de la ruta canónica.',
  RESPONSE_BODY_TOO_LARGE: 'Una respuesta superó el límite de cuerpo permitido.',
  RESPONSE_ENCODING_INVALID: 'Una respuesta no pudo validarse como UTF-8.',
  REQUEST_TIMEOUT: 'Una solicitud excedió el tiempo máximo permitido.',
  REQUEST_FAILED: 'Una solicitud no pudo completarse dentro de la política segura.',
  INTERNAL_GATE_ERROR: 'El gate no pudo completar su propia evaluación.',
});

class DeploymentTruthError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DeploymentTruthError';
    this.code = code;
  }
}

function localReleaseContractError() {
  return new DeploymentTruthError('LOCAL_RELEASE_CONTRACT_INVALID');
}

function extractUniqueManualVersion(source) {
  if (typeof source !== 'string') return null;
  const mentions = [...source.matchAll(/\bdata-doc-version\b/gi)];
  if (mentions.length !== 1) return null;
  const declaration = source.slice(mentions[0].index).match(
    /^data-doc-version\s*=\s*(["'])([^"'<>\r\n]+)\1/i,
  );
  return declaration?.[2] || null;
}

function requireValidManualVersion(value) {
  if (typeof value !== 'string' || value.length > 128 || !SEMVER_PATTERN.test(value)) {
    throw localReleaseContractError();
  }
  return value;
}

function canonicalLf(source) {
  return source.replace(/\r\n?/g, '\n');
}

function canonicalTextSha256(source) {
  return crypto.createHash('sha256').update(canonicalLf(source), 'utf8').digest('hex');
}

function readCanonicalLocalDocument(repoRoot, fileName) {
  let handle = null;
  try {
    if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) {
      throw localReleaseContractError();
    }
    const documentPath = path.resolve(repoRoot, fileName);
    const initialStat = fs.lstatSync(documentPath);
    if (!initialStat.isFile()
      || initialStat.isSymbolicLink()
      || initialStat.size <= 0
      || initialStat.size > LOCAL_DOCUMENT_MAX_BYTES) {
      throw localReleaseContractError();
    }

    handle = fs.openSync(documentPath, fs.constants.O_RDONLY);
    const openedStat = fs.fstatSync(handle);
    if (!openedStat.isFile()
      || openedStat.size !== initialStat.size
      || openedStat.dev !== initialStat.dev
      || openedStat.ino !== initialStat.ino
      || openedStat.size > LOCAL_DOCUMENT_MAX_BYTES) {
      throw localReleaseContractError();
    }

    const bytes = Buffer.alloc(openedStat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const bytesRead = fs.readSync(handle, bytes, offset, bytes.length - offset, null);
      if (bytesRead === 0) throw localReleaseContractError();
      offset += bytesRead;
    }
    const extraByte = Buffer.alloc(1);
    if (fs.readSync(handle, extraByte, 0, 1, null) !== 0) {
      throw localReleaseContractError();
    }

    return canonicalLf(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof DeploymentTruthError
      && error.code === 'LOCAL_RELEASE_CONTRACT_INVALID') {
      throw error;
    }
    throw localReleaseContractError();
  } finally {
    if (handle !== null) {
      try {
        fs.closeSync(handle);
      } catch {
        throw localReleaseContractError();
      }
    }
  }
}

function assertCanonicalLocalDocumentAbsent(repoRoot, fileName) {
  try {
    if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) {
      throw localReleaseContractError();
    }
    fs.lstatSync(path.resolve(repoRoot, fileName));
    throw localReleaseContractError();
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    if (error instanceof DeploymentTruthError
      && error.code === 'LOCAL_RELEASE_CONTRACT_INVALID') {
      throw error;
    }
    throw localReleaseContractError();
  }
}

export function readLocalManualVersion({ repoRoot = defaultRepoRoot } = {}) {
  const manualSource = readCanonicalLocalDocument(repoRoot, 'manuales.html');
  return requireValidManualVersion(extractUniqueManualVersion(manualSource));
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index]);
}

function assertCanonicalVercelRouting(source) {
  let config;
  try {
    config = JSON.parse(source);
  } catch {
    throw localReleaseContractError();
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || config.cleanUrls !== true || !Array.isArray(config.rewrites)) {
    throw localReleaseContractError();
  }
  const prismaRoute = Array.isArray(config.routes) ? config.routes[0] : null;
  if (!prismaRoute
    || !hasExactKeys(prismaRoute, ['src', 'dest', 'status', 'headers'])
    || prismaRoute.src !== PRISMA_DENY_ROUTE.src
    || prismaRoute.dest !== PRISMA_DENY_ROUTE.dest
    || prismaRoute.status !== PRISMA_DENY_ROUTE.status
    || !hasExactKeys(prismaRoute.headers, ['Cache-Control', 'X-Content-Type-Options'])
    || prismaRoute.headers['Cache-Control'] !== PRISMA_DENY_ROUTE.headers['Cache-Control']
    || prismaRoute.headers['X-Content-Type-Options'] !== PRISMA_DENY_ROUTE.headers['X-Content-Type-Options']
    || config.routes.filter((route) => route?.src === PRISMA_DENY_ROUTE.src).length !== 1) {
    throw localReleaseContractError();
  }
  for (const [sourcePath, destination] of [
    ['/', '/login'],
    ['/inicio', '/inicio.html'],
  ]) {
    const matches = config.rewrites.filter((rewrite) => rewrite?.source === sourcePath);
    if (matches.length !== 1
      || !hasExactKeys(matches[0], ['source', 'destination'])
      || matches[0].destination !== destination) {
      throw localReleaseContractError();
    }
  }
  if (config.rewrites.some((rewrite) => rewrite?.source === '/dashboard')) {
    throw localReleaseContractError();
  }
}

export function readLocalReleaseContract({ repoRoot = defaultRepoRoot } = {}) {
  const vercelSource = readCanonicalLocalDocument(repoRoot, 'vercel.json');
  assertCanonicalVercelRouting(vercelSource);
  assertCanonicalLocalDocumentAbsent(repoRoot, 'index.html');
  const entrySource = readCanonicalLocalDocument(repoRoot, 'login.html');
  const rootSource = readCanonicalLocalDocument(repoRoot, 'dashboard.html');
  const workspaceSource = readCanonicalLocalDocument(repoRoot, 'inicio.html');
  const rolesSource = readCanonicalLocalDocument(repoRoot, 'roles.html');
  const manualSource = readCanonicalLocalDocument(repoRoot, 'manuales.html');
  return {
    expectedManualVersion: requireValidManualVersion(extractUniqueManualVersion(manualSource)),
    expectedEntryDigest: canonicalTextSha256(entrySource),
    expectedRootDigest: canonicalTextSha256(rootSource),
    expectedWorkspaceDigest: canonicalTextSha256(workspaceSource),
    expectedRolesDigest: canonicalTextSha256(rolesSource),
    expectedManualDigest: canonicalTextSha256(manualSource),
  };
}

function isLoopbackLiteral(hostname) {
  return hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeBaseUrl(input, { allowHttpLoopback = false } = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new DeploymentTruthError('BASE_URL_REQUIRED');
  }
  if (input !== input.trim()) {
    throw new DeploymentTruthError('BASE_URL_INVALID');
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new DeploymentTruthError('BASE_URL_INVALID');
  }

  const loopbackTestOrigin = allowHttpLoopback
    && parsed.protocol === 'http:'
    && isLoopbackLiteral(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopbackTestOrigin) {
    throw new DeploymentTruthError('BASE_URL_INVALID');
  }
  if (parsed.username || parsed.password) {
    throw new DeploymentTruthError('BASE_URL_CREDENTIALS_FORBIDDEN');
  }
  const rawSuffix = input.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+(.*)$/i)?.[1];
  if (rawSuffix === undefined) throw new DeploymentTruthError('BASE_URL_INVALID');
  if ((rawSuffix !== '' && rawSuffix !== '/') || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new DeploymentTruthError('BASE_URL_PATH_FORBIDDEN');
  }

  return `${parsed.origin}/`;
}

function requireDigest(value) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw localReleaseContractError();
  }
  return value;
}

function assertNoProxyEnvironment(env) {
  if (!env || typeof env !== 'object') throw new DeploymentTruthError('PROXY_ENV_FORBIDDEN');
  for (const [name, value] of Object.entries(env)) {
    if (PROXY_ENV_NAMES.has(name.toUpperCase()) && String(value || '').trim()) {
      throw new DeploymentTruthError('PROXY_ENV_FORBIDDEN');
    }
  }
}

function ipv4Parts(address) {
  if (net.isIP(address) !== 4) return null;
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function isPublicIpv4(parts) {
  const [first, second, third] = parts;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 0 && third === 0) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 192 && second === 168) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function ipv6Parts(address) {
  if (typeof address !== 'string' || address.includes('%') || net.isIP(address) !== 6) return null;
  let normalized = address.toLowerCase();
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const tail = ipv4Parts(normalized.slice(lastColon + 1));
    if (!tail) return null;
    const high = ((tail[0] << 8) | tail[1]).toString(16);
    const low = ((tail[2] << 8) | tail[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[a-f0-9]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function isPublicIpv6(parts) {
  if ((parts[0] & 0xe000) !== 0x2000) return false;
  if (parts[0] === 0x2001 && (parts[1] & 0xfe00) === 0) return false;
  if (parts[0] === 0x2001 && parts[1] === 0x0db8) return false;
  if (parts[0] === 0x2002 || parts[0] === 0x3fff) return false;
  return true;
}

function canonicalIpAddress(address) {
  const v4 = ipv4Parts(address);
  if (v4) return { family: 4, canonical: v4.join('.'), public: isPublicIpv4(v4) };
  const v6 = ipv6Parts(address);
  if (v6) {
    return {
      family: 6,
      canonical: v6.map((group) => group.toString(16).padStart(4, '0')).join(':'),
      public: isPublicIpv6(v6),
    };
  }
  return null;
}

function isLiteralLoopback(address) {
  const v4 = ipv4Parts(address);
  if (v4) return v4[0] === 127;
  const v6 = ipv6Parts(address);
  return Boolean(v6 && v6.slice(0, 7).every((group) => group === 0) && v6[7] === 1);
}

function dnsDigest(canonicalAddresses) {
  return crypto.createHash('sha256').update(canonicalAddresses.join('\n'), 'utf8').digest('hex');
}

async function lookupWithTimeout(dnsLookupImpl, hostname, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => dnsLookupImpl(hostname, { all: true, verbatim: true })),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new DeploymentTruthError('DNS_RESOLUTION_FAILED')), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof DeploymentTruthError) throw error;
    throw new DeploymentTruthError('DNS_RESOLUTION_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDnsSnapshot({ baseUrl, dnsLookupImpl, allowHttpLoopback, timeoutMs }) {
  const target = new URL(baseUrl);
  const hostname = target.hostname.startsWith('[') && target.hostname.endsWith(']')
    ? target.hostname.slice(1, -1)
    : target.hostname;
  const literal = canonicalIpAddress(hostname);
  if (literal) {
    const testLoopback = allowHttpLoopback
      && target.protocol === 'http:'
      && isLiteralLoopback(hostname);
    if (!literal.public && !testLoopback) throw new DeploymentTruthError('DNS_NON_PUBLIC_ADDRESS');
    const canonicalAddresses = [`${literal.family}:${literal.canonical}`];
    return {
      count: 1,
      digest: dnsDigest(canonicalAddresses),
      literal: true,
    };
  }

  const records = await lookupWithTimeout(dnsLookupImpl, hostname, timeoutMs);
  if (!Array.isArray(records) || records.length === 0 || records.length > 32) {
    throw new DeploymentTruthError('DNS_RESOLUTION_FAILED');
  }
  const canonicalAddresses = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') throw new DeploymentTruthError('DNS_RESOLUTION_FAILED');
    const parsed = canonicalIpAddress(record.address);
    if (!parsed || parsed.family !== Number(record.family)) {
      throw new DeploymentTruthError('DNS_RESOLUTION_FAILED');
    }
    if (!parsed.public) throw new DeploymentTruthError('DNS_NON_PUBLIC_ADDRESS');
    canonicalAddresses.push(`${parsed.family}:${parsed.canonical}`);
  }
  const uniqueAddresses = [...new Set(canonicalAddresses)].sort();
  return {
    count: uniqueAddresses.length,
    digest: dnsDigest(uniqueAddresses),
    literal: false,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatThousands(digits, separator) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function demoFigureAppearsNearEmployeeLabel(source, digits) {
  const numericForms = [...new Set([
    digits,
    formatThousands(digits, ','),
    formatThousands(digits, '.'),
  ])].map(escapeRegExp).join('|');
  const number = `(?<!\\d)(?:${numericForms})(?!\\d)`;
  const employeeLabel = '(?:total\\s+(?:de\\s+)?emplead(?:os|as)|emplead(?:os|as)\\s+totales?)';
  return new RegExp(
    `(?:${employeeLabel})[\\s\\S]{0,200}${number}|${number}[\\s\\S]{0,200}(?:${employeeLabel})`,
    'i',
  ).test(source);
}

export function parseDemoFigures(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return [...DEFAULT_DEMO_FIGURES];
  }
  if (typeof rawValue !== 'string') {
    throw new DeploymentTruthError('DEMO_FIGURES_INVALID');
  }
  const values = rawValue.split(';').map((value) => value.trim());
  if (values.length === 0 || values.some((value) => !/^\d{1,12}$/.test(value))) {
    throw new DeploymentTruthError('DEMO_FIGURES_INVALID');
  }
  return [...new Set(values)];
}

function validatePolicyNumber(value, { minimum, maximum, code = 'ARGUMENT_INVALID' }) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new DeploymentTruthError(code);
  }
  return value;
}

function mediaKind(contentType) {
  const normalized = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (normalized === 'text/html' || normalized === 'application/xhtml+xml') return 'html';
  if (normalized === 'application/json' || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(normalized)) return 'json';
  return normalized ? 'other' : 'missing';
}

function prismaRouteHeadersMatched(headers) {
  const cacheDirectives = String(headers.get('cache-control') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return cacheDirectives.includes('no-store')
    && !cacheDirectives.includes('public')
    && !cacheDirectives.some((directive) => directive.startsWith('s-maxage='))
    && String(headers.get('x-content-type-options') || '').trim().toLowerCase() === 'nosniff';
}

function prismaRouteBodyMatched(body) {
  return typeof body === 'string'
    && !PRISMA_SOURCE_BODY_MARKERS.some((marker) => marker.test(body));
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The response is being rejected; cancellation is best effort only.
  }
}

async function readBodyLimited(response, maxBodyBytes) {
  const declaredLength = response.headers.get('content-length');
  if (/^\d+$/.test(declaredLength || '') && BigInt(declaredLength) > BigInt(maxBodyBytes)) {
    await cancelBody(response);
    throw new DeploymentTruthError('RESPONSE_BODY_TOO_LARGE');
  }
  if (!response.body) return { text: '', bytes: 0 };

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBodyBytes) {
        await reader.cancel();
        throw new DeploymentTruthError('RESPONSE_BODY_TOO_LARGE');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      bytes: totalBytes,
    };
  } catch {
    throw new DeploymentTruthError('RESPONSE_ENCODING_INVALID');
  }
}

function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function fetchProbe({
  baseUrl,
  probe,
  fetchImpl,
  timeoutMs,
  maxBodyBytes,
  maxRedirects,
}) {
  const authorizedOrigin = new URL(baseUrl).origin;
  let currentUrl = new URL(probe.path, baseUrl);
  let redirectCount = 0;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (currentUrl.origin !== authorizedOrigin) {
      throw new DeploymentTruthError('REDIRECT_ORIGIN_CHANGED');
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new DeploymentTruthError('REQUEST_TIMEOUT');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(currentUrl, {
        method: 'GET',
        headers: {
          Accept: probe.accept,
          'User-Agent': 'MuniControl-Deployment-Truth/1',
        },
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });

      if (probe.kind === 'api' && response.status >= 300 && response.status < 400) {
        await cancelBody(response);
        throw new DeploymentTruthError('API_REDIRECT_FORBIDDEN');
      }
      if (probe.kind === 'workspace' && isRedirectStatus(response.status)) {
        await cancelBody(response);
        throw new DeploymentTruthError('WORKSPACE_REDIRECT_FORBIDDEN');
      }
      if (probe.kind === 'roles' && isRedirectStatus(response.status)) {
        await cancelBody(response);
        throw new DeploymentTruthError('ROLES_REDIRECT_FORBIDDEN');
      }
      const privateRedirect = probe.kind === 'private'
        && response.status >= 300
        && response.status < 400;
      if (isRedirectStatus(response.status) && !privateRedirect) {
        await cancelBody(response);
        if (redirectCount >= maxRedirects) {
          throw new DeploymentTruthError('REDIRECT_LIMIT_EXCEEDED');
        }
        const location = response.headers.get('location');
        if (!location) throw new DeploymentTruthError('REDIRECT_TARGET_UNSAFE');

        let redirected;
        try {
          redirected = new URL(location, currentUrl);
        } catch {
          throw new DeploymentTruthError('REDIRECT_TARGET_UNSAFE');
        }
        if (redirected.username
          || redirected.password
          || redirected.search
          || redirected.hash
          || location.includes('?')
          || location.includes('#')) {
          throw new DeploymentTruthError('REDIRECT_TARGET_UNSAFE');
        }
        if (redirected.origin !== authorizedOrigin) {
          throw new DeploymentTruthError('REDIRECT_ORIGIN_CHANGED');
        }
        currentUrl = redirected;
        redirectCount += 1;
        continue;
      }

      const body = await readBodyLimited(response, maxBodyBytes);
      return {
        status: response.status,
        media: mediaKind(response.headers.get('content-type')),
        bytes: body.bytes,
        redirects: redirectCount,
        finalPath: currentUrl.pathname,
        apiContract: probe.kind === 'api' ? response.headers.get(API_CONTRACT_HEADER) : null,
        privateContractMatched: probe.kind === 'private'
          ? prismaRouteHeadersMatched(response.headers) && prismaRouteBodyMatched(body.text)
          : null,
        privateBodyMatched: probe.kind === 'private' ? prismaRouteBodyMatched(body.text) : null,
        body: body.text,
      };
    } catch (error) {
      if (error instanceof DeploymentTruthError) throw error;
      if (controller.signal.aborted) throw new DeploymentTruthError('REQUEST_TIMEOUT');
      throw new DeploymentTruthError('REQUEST_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }
}

function addFinding(findings, code, probePath) {
  const message = FINDING_MESSAGES[code] || FINDING_MESSAGES.INTERNAL_GATE_ERROR;
  const key = `${probePath || 'configuration'}\u0000${code}`;
  if (findings.some((finding) => finding.key === key)) return;
  findings.push({ key, code, path: probePath || null, message });
}

function hasValidAnonymousJson(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed !== null
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && typeof parsed.error === 'string'
      && parsed.error.length > 0;
  } catch {
    return false;
  }
}

function inspectRoot(body, demoFigures, expectedRootDigest) {
  const codes = [];
  if (canonicalTextSha256(body) !== expectedRootDigest
    || !ROOT_REQUIRED_MARKERS.every((marker) => marker.test(body))) {
    codes.push('STALE_RELEASE');
  }
  if (LEGACY_ROOT_MARKERS.some((marker) => marker.test(body))
    || demoFigures.some((figure) => demoFigureAppearsNearEmployeeLabel(body, figure))) {
    codes.push('LEGACY_DEMO_DATA');
  }
  if (UNSAFE_REALTIME_MARKERS.some((marker) => marker.test(body))) codes.push('UNSAFE_REALTIME_CLAIM');
  if (UNSAFE_OFFICIAL_SOURCE_MARKERS.some((marker) => marker.test(body))) {
    codes.push('UNVERIFIED_OFFICIAL_SOURCE_CLAIM');
  }
  return codes;
}

function inspectEntry(body, expectedEntryDigest) {
  return canonicalTextSha256(body) === expectedEntryDigest ? [] : ['STALE_RELEASE'];
}

function inspectWorkspace(body, expectedWorkspaceDigest) {
  return canonicalTextSha256(body) === expectedWorkspaceDigest ? [] : ['WORKSPACE_RELEASE_DRIFT'];
}

function inspectRoles(body, expectedRolesDigest) {
  return canonicalTextSha256(body) === expectedRolesDigest ? [] : ['ROLES_RELEASE_DRIFT'];
}

function inspectManual(body, expectedManualVersion, expectedManualDigest) {
  return extractUniqueManualVersion(body) === expectedManualVersion
    && canonicalTextSha256(body) === expectedManualDigest
    && MANUAL_REQUIRED_MARKERS.every((marker) => marker.test(body))
    ? []
    : ['MANUAL_VERSION_DRIFT'];
}

function inspectApi(result, probe) {
  if (result.status === 404 || result.media !== 'json' || !hasValidAnonymousJson(result.body)) {
    return ['CURRENT_APIS_MISSING'];
  }
  const codes = [];
  if (result.apiContract !== probe.expectedContract) codes.push('API_CONTRACT_MISMATCH');
  if (result.status >= 200 && result.status < 300) codes.push('ANONYMOUS_API_EXPOSURE');
  else if (!ALLOWED_ANONYMOUS_API_STATUSES.includes(result.status)) codes.push('API_AUTH_STATE_INVALID');
  return codes;
}

function inspectPrivatePrismaRoute(result) {
  if (result.status >= 300 && result.status < 400) {
    return ['PRISMA_ROUTE_REDIRECT_FORBIDDEN'];
  }
  if (result.status !== 404) return ['PRISMA_ROUTE_EXPOSED'];
  if (result.privateBodyMatched !== true) return ['PRISMA_ROUTE_BODY_EXPOSED'];
  return result.privateContractMatched === true ? [] : ['PRISMA_ROUTE_HEADERS_INVALID'];
}

function checkedAt(now) {
  const value = typeof now === 'function' ? now() : now;
  return new Date(value ?? Date.now()).toISOString();
}

function createPolicyReceipt({
  timeoutMs,
  maxBodyBytes,
  maxRedirects,
  demoFigures,
  expectedManualVersion,
  expectedEntryDigest,
  expectedRootDigest,
  expectedWorkspaceDigest,
  expectedRolesDigest,
  expectedManualDigest,
  dnsAddressCount,
  dnsAddressesDigest,
  dnsRevalidated,
}) {
  return {
    method: 'GET',
    anonymous: true,
    timeoutMs,
    maxBodyBytes,
    maxRedirects,
    allowedApiStatuses: [...ALLOWED_ANONYMOUS_API_STATUSES],
    configuredDemoFigureCount: demoFigures.length,
    expectedManualVersion,
    expectedEntryDigest,
    expectedRootDigest,
    expectedWorkspaceDigest,
    expectedRolesDigest,
    expectedManualDigest,
    dnsAddressCount,
    dnsAddressesDigest,
    dnsRevalidated,
  };
}

export async function inspectDeployment({
  baseUrl,
  expectedManualVersion,
  expectedEntryDigest,
  expectedRootDigest,
  expectedWorkspaceDigest,
  expectedRolesDigest,
  expectedManualDigest,
  allowHttpLoopback = false,
  demoFigures = DEFAULT_DEMO_FIGURES,
  fetchImpl = globalThis.fetch,
  dnsLookupImpl = dns.lookup,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  now = () => new Date(),
} = {}) {
  const validatedManualVersion = requireValidManualVersion(expectedManualVersion);
  const validatedEntryDigest = requireDigest(expectedEntryDigest);
  const validatedRootDigest = requireDigest(expectedRootDigest);
  const validatedWorkspaceDigest = requireDigest(expectedWorkspaceDigest);
  const validatedRolesDigest = requireDigest(expectedRolesDigest);
  const validatedManualDigest = requireDigest(expectedManualDigest);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, { allowHttpLoopback });
  if (!Array.isArray(demoFigures)
    || demoFigures.length === 0
    || demoFigures.some((value) => typeof value !== 'string' || !/^\d{1,12}$/.test(value))) {
    throw new DeploymentTruthError('DEMO_FIGURES_INVALID');
  }
  if (typeof fetchImpl !== 'function') throw new DeploymentTruthError('ARGUMENT_INVALID');
  if (typeof dnsLookupImpl !== 'function') throw new DeploymentTruthError('ARGUMENT_INVALID');
  validatePolicyNumber(timeoutMs, { minimum: 50, maximum: 30_000 });
  validatePolicyNumber(maxBodyBytes, { minimum: 256, maximum: 1024 * 1024 });
  validatePolicyNumber(maxRedirects, { minimum: 0, maximum: 5 });

  const findings = [];
  const checks = [];
  const initialDns = await resolveDnsSnapshot({
    baseUrl: normalizedBaseUrl,
    dnsLookupImpl,
    allowHttpLoopback,
    timeoutMs,
  });
  const results = await Promise.all(PROBES.map(async (probe) => {
    try {
      return { probe, result: await fetchProbe({
        baseUrl: normalizedBaseUrl,
        probe,
        fetchImpl,
        timeoutMs,
        maxBodyBytes,
        maxRedirects,
      }) };
    } catch (error) {
      const code = error instanceof DeploymentTruthError ? error.code : 'REQUEST_FAILED';
      return { probe, errorCode: code };
    }
  }));

  let dnsRevalidated = true;
  if (!initialDns.literal) {
    try {
      const finalDns = await resolveDnsSnapshot({
        baseUrl: normalizedBaseUrl,
        dnsLookupImpl,
        allowHttpLoopback,
        timeoutMs,
      });
      if (finalDns.count !== initialDns.count || finalDns.digest !== initialDns.digest) {
        dnsRevalidated = false;
        addFinding(findings, 'DNS_REBINDING_DETECTED', null);
      }
    } catch (error) {
      dnsRevalidated = false;
      const code = error instanceof DeploymentTruthError && error.code === 'DNS_NON_PUBLIC_ADDRESS'
        ? 'DNS_REBINDING_DETECTED'
        : 'DNS_REVALIDATION_FAILED';
      addFinding(findings, code, null);
    }
  }

  for (const entry of results) {
    const { probe } = entry;
    if (entry.errorCode) {
      addFinding(findings, entry.errorCode, probe.path);
      checks.push({
        id: probe.id,
        path: probe.path,
        outcome: 'fail',
        status: null,
        media: 'unavailable',
        bytes: null,
        redirects: null,
        finalPathMatched: null,
        contractMatched: null,
        codes: [entry.errorCode],
      });
      continue;
    }

    const { result } = entry;
    let codes = [];
    if (result.finalPath !== probe.path) {
      codes.push('FINAL_PATH_MISMATCH');
    }
    if (probe.kind === 'entry') {
      codes.push(...(result.status === 200 && result.media === 'html'
        ? inspectEntry(result.body, validatedEntryDigest)
        : ['STALE_RELEASE']
      ));
    } else if (probe.kind === 'root') {
      codes.push(...(result.status === 200 && result.media === 'html'
        ? inspectRoot(result.body, demoFigures, validatedRootDigest)
        : ['STALE_RELEASE']
      ));
    } else if (probe.kind === 'workspace') {
      codes.push(...(result.status === 200 && result.media === 'html'
        ? inspectWorkspace(result.body, validatedWorkspaceDigest)
        : ['WORKSPACE_RELEASE_DRIFT']
      ));
    } else if (probe.kind === 'roles') {
      codes.push(...(result.status === 200 && result.media === 'html'
        ? inspectRoles(result.body, validatedRolesDigest)
        : ['ROLES_RELEASE_DRIFT']
      ));
    } else if (probe.kind === 'manual') {
      codes.push(...(result.status === 200 && result.media === 'html'
        ? inspectManual(result.body, validatedManualVersion, validatedManualDigest)
        : ['MANUAL_VERSION_DRIFT']
      ));
    } else if (probe.kind === 'private') {
      codes.push(...inspectPrivatePrismaRoute(result));
    } else {
      codes.push(...inspectApi(result, probe));
    }
    for (const code of codes) addFinding(findings, code, probe.path);
    checks.push({
      id: probe.id,
      path: probe.path,
      outcome: codes.length === 0 ? 'pass' : 'fail',
      status: result.status,
      media: result.media,
      bytes: result.bytes,
      redirects: result.redirects,
      finalPathMatched: result.finalPath === probe.path,
      contractMatched: probe.kind === 'api'
        ? result.apiContract === probe.expectedContract
        : probe.kind === 'private'
          ? result.status === 404 && result.privateContractMatched === true
          : null,
      codes,
    });
  }

  const publicFindings = findings
    .map(({ key: _key, ...finding }) => finding)
    .sort((left, right) => String(left.path || '').localeCompare(String(right.path || ''))
      || left.code.localeCompare(right.code));
  return {
    contract: RECEIPT_CONTRACT,
    checkedAt: checkedAt(now),
    ok: publicFindings.length === 0,
    target: { origin: new URL(normalizedBaseUrl).origin },
    policy: createPolicyReceipt({
      timeoutMs,
      maxBodyBytes,
      maxRedirects,
      demoFigures,
      expectedManualVersion: validatedManualVersion,
      expectedEntryDigest: validatedEntryDigest,
      expectedRootDigest: validatedRootDigest,
      expectedWorkspaceDigest: validatedWorkspaceDigest,
      expectedRolesDigest: validatedRolesDigest,
      expectedManualDigest: validatedManualDigest,
      dnsAddressCount: initialDns.count,
      dnsAddressesDigest: initialDns.digest,
      dnsRevalidated,
    }),
    checks,
    findings: publicFindings,
  };
}

export function resolveCliConfiguration(
  argv = process.argv.slice(2),
  env = process.env,
  { repoRoot = defaultRepoRoot } = {},
) {
  let argumentBaseUrl;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--base-url') {
      if (argumentBaseUrl !== undefined || index + 1 >= argv.length) {
        throw new DeploymentTruthError('ARGUMENT_INVALID');
      }
      argumentBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith('--base-url=')) {
      if (argumentBaseUrl !== undefined) throw new DeploymentTruthError('ARGUMENT_INVALID');
      argumentBaseUrl = argument.slice('--base-url='.length);
      continue;
    }
    throw new DeploymentTruthError('ARGUMENT_INVALID');
  }
  if (help) {
    if (argv.length !== 1) throw new DeploymentTruthError('ARGUMENT_INVALID');
    return { help: true };
  }

  const localReleaseContract = readLocalReleaseContract({ repoRoot });
  assertNoProxyEnvironment(env);
  const environmentBaseUrl = env[BASE_URL_ENV];
  if (argumentBaseUrl !== undefined && environmentBaseUrl) {
    const normalizedArgument = normalizeBaseUrl(argumentBaseUrl);
    const normalizedEnvironment = normalizeBaseUrl(environmentBaseUrl);
    if (normalizedArgument !== normalizedEnvironment) {
      throw new DeploymentTruthError('BASE_URL_CONFLICT');
    }
  }
  const selectedBaseUrl = argumentBaseUrl ?? environmentBaseUrl;
  return {
    help: false,
    baseUrl: normalizeBaseUrl(selectedBaseUrl),
    demoFigures: parseDemoFigures(env[DEMO_FIGURES_ENV]),
    ...localReleaseContract,
  };
}

function configurationFailureReceipt(code, now = () => new Date()) {
  const safeCode = FINDING_MESSAGES[code] ? code : 'INTERNAL_GATE_ERROR';
  return {
    contract: RECEIPT_CONTRACT,
    checkedAt: checkedAt(now),
    ok: false,
    target: { origin: null },
    policy: createPolicyReceipt({
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
      maxRedirects: DEFAULT_MAX_REDIRECTS,
      demoFigures: DEFAULT_DEMO_FIGURES,
      expectedManualVersion: null,
      expectedEntryDigest: null,
      expectedRootDigest: null,
      expectedWorkspaceDigest: null,
      expectedRolesDigest: null,
      expectedManualDigest: null,
      dnsAddressCount: null,
      dnsAddressesDigest: null,
      dnsRevalidated: false,
    }),
    checks: [],
    findings: [{
      code: safeCode,
      path: null,
      message: FINDING_MESSAGES[safeCode],
    }],
  };
}

function usage() {
  return [
    'Uso: node scripts/check-deployment-truth.mjs --base-url https://municipio.example',
    `Alternativa: ${BASE_URL_ENV}=https://municipio.example`,
    `Cifras demo canónicas separadas por punto y coma: ${DEMO_FIGURES_ENV}=1247;9999`,
  ].join('\n');
}

async function main() {
  let configuration;
  try {
    configuration = resolveCliConfiguration();
  } catch (error) {
    const code = error instanceof DeploymentTruthError ? error.code : 'INTERNAL_GATE_ERROR';
    process.stdout.write(`${JSON.stringify(configurationFailureReceipt(code))}\n`);
    process.exitCode = 2;
    return;
  }
  if (configuration.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  try {
    const receipt = await inspectDeployment(configuration);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    process.exitCode = receipt.ok ? 0 : 1;
  } catch (error) {
    const code = error instanceof DeploymentTruthError ? error.code : 'INTERNAL_GATE_ERROR';
    process.stdout.write(`${JSON.stringify(configurationFailureReceipt(code))}\n`);
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === modulePath) {
  await main();
}
