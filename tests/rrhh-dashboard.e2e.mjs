import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';
import { inspectGrhDirectoryAccessResponse } from '../api/lib/grh-directory-access-contract.js';
import { inspectGrhDirectoryResponse } from '../api/lib/grh-directory-contract.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_PATH = path.join(REPO, 'api', '_data', 'grh-profile.json');
const SEMANTIC_PATH = path.join(REPO, 'api', '_data', 'grh-semantic.json');
const HAS_PRIVATE_GRH = existsSync(PROFILE_PATH) && existsSync(SEMANTIC_PATH);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const PRIVATE_GRH_PATHS = new Set([
  '/api/grh-executive',
  '/api/grh-quality',
  '/api/grh-close',
  '/api/grh-data',
]);

function authoritativeUser(role = 'INTENDENTE') {
  const tenantId = 'tenant-junin-test';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access, `missing test access projection for ${role}`);
  return {
    id: 'qa-rrhh',
    name: 'QA RRHH',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

let projections = null;
if (HAS_PRIVATE_GRH) {
  const [profile, semantic] = await Promise.all([
    readFile(PROFILE_PATH, 'utf8').then(JSON.parse),
    readFile(SEMANTIC_PATH, 'utf8').then(JSON.parse),
  ]);
  projections = Object.freeze({
    executive: buildGrhExecutiveProjection(semantic, { audience: 'interactive' }),
    quality: buildGrhQualityProjection(profile, semantic),
  });
}

function directoryItem(index, detail = false) {
  const legajo = index === 1 ? 571 : 1000 + index;
  const leaveCount = index === 1 ? 3 : index % 5 === 0 ? 1 : 0;
  const item = {
    companyCode: 1,
    legajo,
    displayName: index === 1 ? 'ALONSO, ARIEL MAURICIO' : `PERSONA PRUEBA ${String(index).padStart(2, '0')}`,
    sector: { code: index % 2 ? 10 : 20, label: index % 2 ? 'ADMINISTRACION' : 'SERVICIOS' },
    organization: { code: index % 2 ? 100 : 200, label: index % 2 ? 'SECRETARIA DE GOBIERNO' : 'SECRETARIA DE SERVICIOS' },
    costCenter: { code: index % 2 ? 30 : 40, label: index % 2 ? 'PERSONAL' : 'SERVICIOS URBANOS' },
    position: index === 2 ? {
      code: 1002,
      label: 'AGENTE MUNICIPAL CODIFICADO',
      parent: { code: 900, label: 'SECRETARIA GENERAL' },
      dependsOn: { code: 800, label: 'INTENDENCIA' },
    } : null,
    positionObservation: {
      label: index === 1 ? 'DIRECTORA DE PERSONAL' :
        index === 2 ? 'OBSERVACION NO PRIORIZADA' : 'AGENTE MUNICIPAL INFORMADO',
      observedDate: '2026-08-31',
      observedPeriod: '2026-08',
      status: 'source_future_effective',
      sourceTable: 'histolegajo',
    },
    category: { code: 7, label: 'CATEGORIA 7' },
    agreement: { code: 1, label: 'MUNICIPAL' },
    contractRegime: { code: index % 2 ? 1 : 2, label: index % 2 ? 'PLANTA PERMANENTE' : 'TEMPORARIO' },
    serviceSituation: { code: index % 2 ? 10 : 20, label: index % 2 ? 'NORMAL' : 'RESERVA DE CARGO' },
    terminationReason: index === 2 ? { code: 5, label: 'RENUNCIA INFORMADA' } : null,
    employment: (() => {
      const asOf = projections.executive.source.snapshotAsOf;
      const variants = {
        2: { reportedIngressDate: '2004-02-01', reportedExitDate: '2025-01-31', reportedStatus: 'ended_by_reported_dates' },
        3: { reportedIngressDate: null, reportedExitDate: null, reportedStatus: 'unknown_sentinel_ingress' },
        4: { reportedIngressDate: null, reportedExitDate: null, reportedStatus: 'unknown_missing_ingress' },
        5: { reportedIngressDate: '1950-01-01', reportedExitDate: null, reportedStatus: 'unknown_implausible_active_tenure' },
        6: { reportedIngressDate: '2026-08-07', reportedExitDate: null, reportedStatus: 'invalid_chronology' },
      };
      return {
        ...(variants[index] || {
          reportedIngressDate: '2004-02-01', reportedExitDate: null,
          reportedStatus: 'current_by_reported_dates',
        }),
        asOf,
        basis: 'legajo_reported_dates',
        referencePayrollParticipation: {
          period: '2026-07', observed: index === 1, rowCount: index === 1 ? 5 : 0,
        },
      };
    })(),
    events: {
      absenceCount: index === 1 ? 41 : (index % 3 === 0 ? 2 : 0),
      latestAbsenceDate: index === 1 ? '2026-02-09' : (index % 3 === 0 ? '2026-07-10' : null),
      leaveCount,
      latestLeaveStartDate: index === 1 ? '2008-01-25' : (leaveCount ? '2009-05-01' : null),
      latestLeaveEndDate: index === 1 ? '2008-02-07' : (leaveCount ? '2009-05-05' : null),
    },
    movement: index === 1
      ? { rowCount: 7, periodCount: 3, latestPeriod: '2026-07' }
      : (index % 4 === 0
        ? { rowCount: 2, periodCount: 1, latestPeriod: '2026-06' }
        : { rowCount: 0, periodCount: 0, latestPeriod: null }),
  };
  if (detail) {
    item.absenceHistory = {
      total: item.events.absenceCount,
      limit: 24,
      items: index === 1 ? Array.from({ length: 24 }, (_, offset) => {
        const date = new Date(Date.UTC(2026, 1, 9));
        date.setUTCDate(date.getUTCDate() - offset);
        return { date: date.toISOString().slice(0, 10), days: offset % 4 === 0 ? null : 1 };
      }) : item.events.absenceCount === 2 ? [
        { date: '2026-07-10', days: 1 },
        { date: '2025-11-03', days: null },
      ] : [],
    };
    item.leaveHistory = {
      total: leaveCount,
      limit: 24,
      items: leaveCount === 3 ? [
        { startDate: '2008-01-25', endDate: '2008-02-07', days: 14 },
        { startDate: '2006-07-23', endDate: '2006-08-05', days: 14 },
        { startDate: '2005-02-14', endDate: '2005-02-27', days: 14 },
      ] : leaveCount === 1 ? [
        { startDate: '2009-05-01', endDate: '2009-05-05', days: 5 },
      ] : [],
    };
    item.movementHistory = {
      total: item.movement.periodCount,
      limit: 24,
      items: item.movement.periodCount === 3 ? [
        { period: '2026-07', rowCount: 3 },
        { period: '2026-04', rowCount: 2 },
        { period: '2025-12', rowCount: 2 },
      ] : item.movement.periodCount === 1 ? [
        { period: '2026-06', rowCount: 2 },
      ] : [],
    };
  }
  return item;
}

function directoryPayload(url) {
  const all = Array.from({ length: 22 }, (_, index) => directoryItem(index + 1));
  const source = {
    canonicalSystem: projections.executive.source.canonicalSystem,
    sourceFile: projections.executive.source.sourceFile,
    sourceSha256: projections.executive.source.sourceSha256,
    snapshotAsOf: projections.executive.source.snapshotAsOf,
  };
  const privacy = {
    containsPersonalData: true,
    excludedFields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'absence_leave_event_cause'],
  };
  const detailLegajo = Number(url.searchParams.get('legajo'));
  if (Number.isSafeInteger(detailLegajo) && detailLegajo > 0) {
    const match = all.find(item => item.legajo === detailLegajo);
    const item = directoryItem(all.indexOf(match) + 1, true);
    const payload = {
      schemaVersion: 'grh-directory-v3', source, privacy,
      query: { mode: 'detail', page: 1, limit: 1, total: 1, hasNext: false, cursor: null, nextCursor: null },
      facets: null,
      items: [item],
    };
    const inspection = inspectGrhDirectoryResponse(payload);
    assert.equal(inspection.ok, true, inspection.errors.join(', '));
    return payload;
  }

  let filtered = all;
  const search = (url.searchParams.get('search') || '').toLocaleUpperCase('es-AR');
  if (search) filtered = filtered.filter(item => item.displayName.includes(search) || String(item.legajo).includes(search));
  if (url.searchParams.get('hasLeave') === 'true') filtered = filtered.filter(item => item.events.leaveCount > 0);
  if (url.searchParams.get('hasAbsence') === 'true') filtered = filtered.filter(item => item.events.absenceCount > 0);
  if (url.searchParams.get('hasMovement') === 'true') filtered = filtered.filter(item => item.movement.rowCount > 0);
  if (url.searchParams.get('reportedStatus')) {
    filtered = filtered.filter(item => item.employment.reportedStatus === url.searchParams.get('reportedStatus'));
  }
  for (const [parameter, property] of [['contractRegime', 'contractRegime'], ['serviceSituation', 'serviceSituation']]) {
    const rawCode = url.searchParams.get(parameter);
    const code = Number(rawCode);
    if (rawCode !== null && rawCode !== '' && Number.isSafeInteger(code) && code >= 0) {
      filtered = filtered.filter(item => item[property]?.code === code);
    }
  }
  const positionObservation = url.searchParams.get('positionObservation');
  if (positionObservation) {
    filtered = filtered.filter(item => item.positionObservation?.label === positionObservation);
  }
  for (const [parameter, property] of [['sector', 'sector'], ['organization', 'organization'], ['costCenter', 'costCenter'], ['position', 'position']]) {
    const rawCode = url.searchParams.get(parameter);
    const code = Number(rawCode);
    if (rawCode !== null && rawCode !== '' && Number.isSafeInteger(code) && code >= 0) {
      filtered = filtered.filter(item => item[property]?.code === code);
    }
  }
  const limit = Number(url.searchParams.get('limit')) || 20;
  const cursor = url.searchParams.get('cursor');
  const page = cursor ? 2 : Number(url.searchParams.get('page')) || 1;
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);
  const hasNext = offset + limit < filtered.length;
  const payload = {
    schemaVersion: 'grh-directory-v3', source, privacy,
    query: {
      mode: 'list', page, limit, total: filtered.length, hasNext,
      cursor: cursor || null,
      nextCursor: hasNext ? 'eyJ2IjoxLCJvIjoyMCwicSI6InFhIn0' : null,
    },
    facets: {
      sectors: [{ code: 10, label: 'ADMINISTRACION', count: 11 }, { code: 20, label: 'SERVICIOS', count: 11 }],
      organizations: [{ code: 100, label: 'SECRETARIA DE GOBIERNO', count: 11 }, { code: 200, label: 'SECRETARIA DE SERVICIOS', count: 11 }],
      costCenters: [{ code: 30, label: 'PERSONAL', count: 11 }, { code: 40, label: 'SERVICIOS URBANOS', count: 11 }],
      positions: [{ code: 1002, label: 'AGENTE MUNICIPAL CODIFICADO', count: 1 }],
      positionObservations: [
        { label: 'AGENTE MUNICIPAL INFORMADO', count: 20, status: 'source_future_effective' },
        { label: 'DIRECTORA DE PERSONAL', count: 1, status: 'source_future_effective' },
        { label: 'OBSERVACION NO PRIORIZADA', count: 1, status: 'source_future_effective' },
      ],
      categories: [{ agreementCode: 1, code: 7, label: 'CATEGORIA 7', count: 22 }],
      agreements: [{ code: 1, label: 'MUNICIPAL', count: 22 }],
      reportedStatuses: [
        { status: 'current_by_reported_dates', label: 'Sin egreso informado al corte', count: 17 },
        { status: 'ended_by_reported_dates', label: 'Egreso informado al corte', count: 1 },
        { status: 'unknown_sentinel_ingress', label: 'Fecha de ingreso no utilizable', count: 1 },
        { status: 'unknown_missing_ingress', label: 'Ingreso no informado', count: 1 },
        { status: 'unknown_implausible_active_tenure', label: 'Antigüedad informada a revisar', count: 1 },
        { status: 'invalid_chronology', label: 'Fechas informadas inconsistentes', count: 1 },
      ],
      contractRegimes: [
        { code: 1, label: 'PLANTA PERMANENTE', count: 11 },
        { code: 2, label: 'TEMPORARIO', count: 11 },
        { code: 99, label: null, count: 1 },
      ],
      serviceSituations: [
        { code: 10, label: 'NORMAL', count: 11 },
        { code: 20, label: 'RESERVA DE CARGO', count: 11 },
      ],
    },
    items,
  };
  const inspection = inspectGrhDirectoryResponse(payload);
  assert.equal(inspection.ok, true, inspection.errors.join(', '));
  return payload;
}

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-rrhh',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

function directoryAccessPayload(status = 'static') {
  const payload = {
    schemaVersion: 'grh-directory-access-v1',
    status,
    policyVersion: status === 'static' ? 'static:2026-08-11.3' : 'grh-directory-policy-shadow-v1',
    permission: 'grh.directory:read',
    scope: { kind: 'TENANT', label: 'Municipio actual', organizationCount: null },
    validity: { validFrom: null, validUntil: null },
    audit: {
      required: status !== 'static',
      purposes: ['DIRECTORY_BROWSE', 'PERSON_LOOKUP', 'LEAVE_REVIEW'],
      storesPersonalQuery: false,
    },
    limits: ['private_identity_required', 'purpose_required', 'tenant_bound', 'no_public_demo', 'no_raw_export'],
  };
  const inspection = inspectGrhDirectoryAccessResponse(payload);
  assert.equal(inspection.ok, true, inspection.errors.join(', '));
  return payload;
}

async function createServer(requestLog, availability = { unavailable: false }, options = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/js/nav.js' && options.navMode) {
      const malformed = options.navMode === 'malformed'
        ? "window.requireCapability = async function () { return { allowed: true }; };"
        : '';
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'], 'Cache-Control': 'no-store' });
      response.end(`window.__muniAuthValidated = true; window.MuniAuthReady = Promise.resolve(true); ${malformed}`);
      return;
    }
    if (url.pathname === '/api/grh-directory-access') {
      requestLog.push({
        path: url.pathname,
        authorization: request.headers.authorization || '',
        cacheControl: request.headers['cache-control'] || '',
        query: Object.fromEntries(url.searchParams),
      });
      const accessMode = options.directoryAccessState?.mode || options.directoryAccessMode || 'allowed';
      if (accessMode === 'allowed' || accessMode === 'invalid') {
        const payload = directoryAccessPayload();
        if (accessMode === 'invalid') payload.audit.required = true;
        response.writeHead(200, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store, private',
          'X-Content-Type-Options': 'nosniff',
          'X-MuniControl-Contract': 'grh-directory-access-v1',
        });
        response.end(JSON.stringify(payload));
        return;
      }
      response.writeHead(accessMode === 'unavailable' ? 503 : 403, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'X-MuniControl-Contract': 'grh-directory-access-v1',
      });
      response.end(JSON.stringify({
        code: accessMode === 'unavailable' ? 'GRH_DIRECTORY_ACCESS_UNAVAILABLE' : 'GRH_DIRECTORY_ACCESS_DENIED',
      }));
      return;
    }
    if (url.pathname === '/api/grh-directory') {
      requestLog.push({
        path: url.pathname,
        authorization: request.headers.authorization || '',
        unavailable: false,
        purpose: request.headers['x-municontrol-purpose'] || '',
        query: Object.fromEntries(url.searchParams),
      });
      const directoryMode = options.directoryMode || 'denied';
      if (directoryMode === 'allowed') {
        const payload = directoryPayload(url);
        if (options.directoryMutation === 'rows-without-period') {
          payload.items[0].movement = { rowCount: 1, periodCount: 0, latestPeriod: null };
        } else if (options.directoryMutation === 'period-without-rows') {
          payload.items[0].movement = { rowCount: 0, periodCount: 1, latestPeriod: '2026-07' };
        } else if (options.directoryMutation === 'impossible-period') {
          payload.items[0].movement.latestPeriod = '2025-99';
        } else if (options.directoryMutation === 'impossible-employment-date') {
          payload.items[0].employment.reportedIngressDate = '2025-02-31';
        } else if (options.directoryMutation === 'stale-payroll-period') {
          payload.items[0].employment.referencePayrollParticipation.period = '2026-06';
        }
        response.writeHead(200, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store, private',
          'X-Content-Type-Options': 'nosniff',
          'X-MuniControl-Contract': options.directoryContract || 'grh-directory-v3',
        });
        response.end(JSON.stringify(payload));
        return;
      }
      response.writeHead(directoryMode === 'unavailable' ? 503 : 403, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify({
        code: directoryMode === 'unavailable' ? 'GRH_DIRECTORY_UNAVAILABLE' : 'GRH_DIRECTORY_ACCESS_DENIED',
      }));
      return;
    }
    if (PRIVATE_GRH_PATHS.has(url.pathname)) {
      requestLog.push({
        path: url.pathname,
        authorization: request.headers.authorization || '',
        unavailable: availability.unavailable,
      });
      if (url.pathname !== '/api/grh-executive' && url.pathname !== '/api/grh-quality') {
        response.writeHead(410, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato retirado' }));
        return;
      }
      if (availability.unavailable) {
        response.writeHead(503, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify({ code: 'GRH_CONTRACT_UNAVAILABLE' }));
        return;
      }
      const body = url.pathname.endsWith('executive') ? projections.executive : projections.quality;
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify(body));
      return;
    }
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user: authoritativeUser(options.authRole || 'INTENDENTE') }));
      return;
    }

    const relative = url.pathname === '/' ? 'login.html' :
      url.pathname === '/rrhh' ? 'rrhh.html' : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(REPO, relative);
    if (!target.startsWith(`${REPO}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function seedSession(context, theme = 'dark') {
  await context.addInitScript(({ token, selectedTheme }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'qa-rrhh', name: 'QA RRHH', role: 'INTENDENTE', tenantId: 'tenant-junin-test',
    }));
    localStorage.setItem('govtech_theme', selectedTheme);
    localStorage.setItem('municontrol-color-theme:v1', selectedTheme);
  }, { token: fakeBrowserToken(), selectedTheme: theme });
}

async function readContrastAudit(page) {
  return page.evaluate(() => {
    const parseColor = value => {
      if (!value || value === 'none' || value === 'transparent') return [0, 0, 0, 0];
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    };
    const composite = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map(index =>
        (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha
      ).concat(alpha);
    };
    const luminance = color => color.slice(0, 3).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (first, second) => {
      const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const effectiveBackground = node => {
      const layers = [];
      let current = node;
      while (current instanceof Element) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
        if (color && color[3] >= 1) break;
        current = current.parentElement;
      }
      let result = [255, 255, 255, 1];
      for (let index = layers.length - 1; index >= 0; index -= 1) result = composite(layers[index], result);
      return result;
    };
    const selectorFor = node => {
      const classes = typeof node.className === 'string' ? node.className : node.className?.baseVal || '';
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes ? `.${classes.trim().replace(/\s+/g, '.')}` : ''}`;
    };
    const visible = node => {
      const style = getComputedStyle(node);
      return node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0;
    };

    const textViolations = Array.from(document.querySelectorAll('body.rrhh-page *')).filter(node => {
      if (!visible(node) || node.matches('script, style, title, desc, option')) return false;
      return node instanceof SVGTextElement || Array.from(node.childNodes).some(child =>
        child.nodeType === Node.TEXT_NODE && child.textContent.trim()
      );
    }).map(node => {
      const style = getComputedStyle(node);
      const background = effectiveBackground(node);
      const rawTextColor = parseColor(node instanceof SVGTextElement ? style.fill : style.color);
      const textColor = rawTextColor ? composite(rawTextColor, background) : null;
      return {
        selector: selectorFor(node),
        text: node.textContent.trim().slice(0, 70),
        ratio: textColor ? ratio(textColor, background) : 0,
        color: node instanceof SVGTextElement ? style.fill : style.color,
        background: `rgb(${background.slice(0, 3).map(Math.round).join(', ')})`,
      };
    }).filter(result => result.ratio < 4.5 - 0.01);

    const boundarySelector = [
      '.topbar', '[data-muni-shell="primary-nav"]', '[data-muni-shell="bottom-nav"]',
      '.rrhh-hero', '.rrhh-hero-aside', '.rrhh-state', '.rrhh-kpi', '.rrhh-card',
      '.rrhh-action', '.rrhh-button', '.rrhh-toggle', '.rrhh-field input', '.rrhh-field select',
      '.rrhh-person-card', '.rrhh-person-dialog', '.rrhh-person-dimension', '.rrhh-event-card',
      '.rrhh-leave-history', '.rrhh-source-item', '.rrhh-methodology'
    ].join(',');
    const boundaryViolations = Array.from(document.querySelectorAll(boundarySelector)).filter(visible).map(node => {
      const style = getComputedStyle(node);
      const outside = effectiveBackground(node.parentElement || node);
      const inside = effectiveBackground(node);
      const borderSides = ['Top', 'Right', 'Bottom', 'Left'].flatMap(side => {
        const width = Number.parseFloat(style[`border${side}Width`]) || 0;
        if (width <= 0) return [];
        const parsed = parseColor(style[`border${side}Color`]);
        return parsed ? [composite(parsed, outside)] : [];
      });
      const boundaryRatio = Math.max(
        ratio(inside, outside),
        ...borderSides.map(border => ratio(border, outside)),
      );
      return { selector: selectorFor(node), ratio: boundaryRatio };
    }).filter(result => result.ratio < 3 - 0.01);

    const rootStyle = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      mainBackground: getComputedStyle(document.querySelector('#mainContent')).backgroundColor,
      mainColor: getComputedStyle(document.querySelector('#mainContent')).color,
      topbarBackground: getComputedStyle(document.querySelector('.topbar')).backgroundColor,
      textViolations,
      boundaryViolations,
      tokenInk: rootStyle.getPropertyValue('--rrhh-ink').trim(),
      tokenPage: rootStyle.getPropertyValue('--rrhh-page').trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function assertContrastAudit(audit, expectedTheme, viewportName) {
  assert.equal(audit.theme, expectedTheme, `${viewportName} theme`);
  assert.deepEqual(audit.textViolations, [], `${viewportName} text contrast: ${JSON.stringify(audit.textViolations)}`);
  assert.deepEqual(audit.boundaryViolations, [], `${viewportName} boundaries: ${JSON.stringify(audit.boundaryViolations)}`);
  assert.equal(audit.overflow, 0, `${viewportName} must not overflow horizontally`);
  assert.notEqual(audit.mainBackground, audit.mainColor, `${viewportName} main text cannot equal its background`);
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value) {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

test('RRHH renders only governed GRH projections on desktop and mobile', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const expectedWorkforce = projections.executive.workforce;
  const expectedQuality = projections.quality;
  const viewports = [
    { name: 'desktop-dark', width: 1440, height: 1000, reducedMotion: 'no-preference', theme: 'dark' },
    { name: 'desktop-light', width: 1440, height: 1000, reducedMotion: 'no-preference', theme: 'light' },
    { name: 'mobile-dark', width: 390, height: 844, reducedMotion: 'reduce', theme: 'dark' },
    { name: 'mobile-light', width: 390, height: 844, reducedMotion: 'reduce', theme: 'light' },
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: viewport.reducedMotion,
    });
    await seedSession(context, viewport.theme);
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
    });

    await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rrhhDashboard[aria-busy="false"]:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'denied');
    await page.waitForFunction(() => document.querySelector('#directoryAccessPanel')?.dataset.state === 'static');
    const collapsed = await page.evaluate(() => {
      const dashboard = document.querySelector('#rrhhDashboard');
      const mainText = document.querySelector('main')?.innerText || '';
      const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
      const protectedLabels = Array.from(
        document.querySelectorAll('.rrhh-bar-row--protected .rrhh-bar-label'),
        node => node.textContent.trim(),
      );
      return {
        legajos: document.querySelector('#kpiLegajos')?.textContent.trim(),
        participants: document.querySelector('#kpiWorkforceParticipants')?.textContent.trim(),
        workforceContext: document.querySelector('#kpiWorkforceContext')?.textContent.trim(),
        quality: document.querySelector('#kpiQuality')?.textContent.trim(),
        quarantine: document.querySelector('#kpiQuarantine')?.textContent.trim(),
        leaves: document.querySelector('#kpiLeaves')?.textContent.trim(),
        leaveContext: document.querySelector('#kpiLeavesContext')?.textContent.trim(),
        leaveRange: document.querySelector('#leaveRangeNote')?.textContent.trim(),
        sourceStatus: document.querySelector('#connectionStatusText')?.textContent.trim(),
        schema: document.querySelector('#schemaChip')?.textContent.trim(),
        sourceText: document.querySelector('#sourceMetadata')?.textContent.replace(/\s+/g, ' ').trim(),
        technicalOpen: document.querySelector('main .rrhh-technical-details')?.open,
        errorVisible: !document.querySelector('#loadError')?.hidden,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sectorRows: document.querySelectorAll('#sectorBars .rrhh-bar-row').length,
        costRows: document.querySelectorAll('#costBars .rrhh-bar-row').length,
        agreementRows: document.querySelectorAll('#agreementBars .rrhh-bar-row').length,
        protectedLabels,
        topSectorLabel: document.querySelector('#sectorBars .rrhh-bar-label')?.textContent.trim(),
        topCostLabel: document.querySelector('#costBars .rrhh-bar-label')?.textContent.trim(),
        topAgreementLabel: document.querySelector('#agreementBars .rrhh-bar-label')?.textContent.trim(),
        containsSuppressedDisplay: mainText.includes('<10'),
        containsCurrency: /\$|\bARS\b|\bUSD\b/.test(mainText),
        containsEmployeeDirectory: /Directorio de Empleados|Sueldo|Salario|Documento|Domicilio/.test(mainText),
        privacyJargonVisible: /\bk\s*(?:=|≥|<|>)\s*\d|\bPII\b|umbral|celdas protegidas/i.test(mainText),
        suppressedChartPoints: document.querySelectorAll('.rrhh-chart-point:not([data-privacy-status="released"])').length,
        unsafeHistoricalPoint: document.querySelectorAll('.rrhh-chart-point[data-period="1991"]').length,
        accessibleCharts: document.querySelectorAll('.rrhh-chart-wrap svg[role="img"][aria-label]').length,
        directoryState: document.querySelector('#directoryStatusBadge')?.dataset.state,
        directoryRows: document.querySelectorAll('#directoryTableBody tr, #directoryMobileList .rrhh-person-card').length,
        directorySearchDisabled: document.querySelector('#directorySearch')?.disabled,
        directoryFormLocked: document.querySelector('#directoryForm')?.dataset.locked,
        privateAccessVisible: !document.querySelector('#directoryPrivateAccess')?.hidden,
        accessState: document.querySelector('#directoryAccessPanel')?.dataset.state,
        accessStatus: document.querySelector('#directoryAccessStatus')?.textContent.trim(),
        accessScope: document.querySelector('#directoryAccessScope')?.textContent.trim(),
        accessValidity: document.querySelector('#directoryAccessValidity')?.textContent.trim(),
        accessAudit: document.querySelector('#directoryAccessAudit')?.textContent.trim(),
        accessLimits: document.querySelector('#directoryAccessLimits')?.textContent.trim(),
        accessErrorHidden: document.querySelector('#directoryAccessError')?.hidden,
        accessRetryHidden: document.querySelector('#directoryAccessRetry')?.hidden,
        accessPanelText: document.querySelector('#directoryAccessPanel')?.textContent.replace(/\s+/g, ' ').trim(),
        actionCount: document.querySelectorAll('.rrhh-actions .rrhh-action').length,
        busy: dashboard?.getAttribute('aria-busy'),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        revealAnimation: getComputedStyle(document.querySelector('.rrhh-reveal')).animationName,
      };
    });

    assert.equal(collapsed.legajos, formatNumber(expectedQuality.referential.legajo.rows));
    assert.equal(collapsed.participants, expectedWorkforce.bySector.participantDisplay);
    assert.match(collapsed.workforceContext, new RegExp(`^${expectedWorkforce.referencePeriod} .* legajos incluidos en el cálculo del mes\\.$`));
    assert.equal(collapsed.quality, `${formatDecimal(expectedQuality.quality.score)}/100`);
    assert.equal(collapsed.quarantine, formatNumber(expectedQuality.temporal.quarantineRows));
    const latestLeave = projections.executive.leave.series.filter(row => row.privacyStatus === 'released').at(-1);
    assert.equal(collapsed.leaves, formatNumber(latestLeave.value));
    assert.match(collapsed.leaveContext, new RegExp(`^${latestLeave.period} .* histórico\\.$`));
    assert.match(collapsed.leaveRange, /Cobertura histórica publicada:/);
    assert.equal(collapsed.sourceStatus, 'Datos verificados');
    assert.equal(collapsed.schema, 'Datos listos para consultar');
    assert.match(collapsed.sourceText, /grh-profile-v1 · grh-semantic-v2/);
    assert.match(collapsed.sourceText, /Diferencias materiales detectadas/);
    assert.equal(collapsed.technicalOpen, false);
    assert.doesNotMatch(await page.locator('main').innerText(), /snapshot|linaje|SHA-256|cuarentena|gobernad|legamov/i);
    assert.match(await page.locator('main').innerText(), /Datos del respaldo municipal|Ver detalle técnico/);
    assert.equal(collapsed.errorVisible, false);
    assert.equal(collapsed.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.equal(collapsed.sectorRows, 9);
    assert.equal(collapsed.costRows, 9);
    assert.equal(collapsed.agreementRows, 8);
    assert.deepEqual(collapsed.protectedLabels, [
      'Otros grupos protegidos',
      'Otros grupos protegidos',
    ]);
    assert.equal(collapsed.privacyJargonVisible, false);
    assert.equal(collapsed.topSectorLabel, expectedWorkforce.bySector.rows[0].label);
    assert.equal(collapsed.topCostLabel, expectedWorkforce.byCostCenter.rows[0].label);
    assert.equal(collapsed.topAgreementLabel, expectedWorkforce.byAgreement.rows[0].label);
    assert.equal(collapsed.containsSuppressedDisplay, false);
    assert.equal(collapsed.containsCurrency, false);
    assert.equal(collapsed.containsEmployeeDirectory, false);
    assert.equal(collapsed.suppressedChartPoints, 0);
    assert.equal(collapsed.unsafeHistoricalPoint, 0);
    assert.equal(collapsed.accessibleCharts, 3);
    assert.equal(collapsed.directoryState, 'denied');
    assert.equal(collapsed.directoryRows, 0);
    assert.equal(collapsed.directorySearchDisabled, true);
    assert.equal(collapsed.directoryFormLocked, 'true');
    assert.equal(collapsed.privateAccessVisible, true);
    assert.equal(collapsed.accessState, 'static');
    assert.equal(collapsed.accessStatus, 'Piloto privado actual');
    assert.equal(collapsed.accessScope, 'Municipio completo');
    assert.equal(collapsed.accessValidity, 'Sin vigencia persistida');
    assert.equal(collapsed.accessAudit, 'Pendiente de activación');
    assert.equal(collapsed.accessLimits, '5 controles activos');
    assert.equal(collapsed.accessErrorHidden, true);
    assert.equal(collapsed.accessRetryHidden, true);
    assert.doesNotMatch(collapsed.accessPanelText, /tenant-junin-test|grh\.directory|DIRECTORY_BROWSE|PERSON_LOOKUP|LEAVE_REVIEW|\b100\b|ALONSO/i);
    assert.equal(collapsed.actionCount, 5);
    assert.equal(collapsed.busy, 'false');
    assert.deepEqual(collapsed.duplicateIds, []);
    if (viewport.reducedMotion === 'reduce') assert.equal(collapsed.revealAnimation, 'none');
    assertContrastAudit(await readContrastAudit(page), viewport.theme, viewport.name);

    if (process.env.RRHH_CAPTURE === '1') {
      await page.screenshot({ path: path.join(tmpdir(), `rrhh-dashboard-${viewport.name}.png`), fullPage: true });
    }

    await page.click('#sectorToggle');
    await page.click('#costToggle');
    await page.click('#agreementToggle');
    const expanded = await page.evaluate(() => {
      const summarize = selector => {
        const container = document.querySelector(selector);
        const rows = Array.from(container?.querySelectorAll('.rrhh-bar-row') || []);
        return {
          total: Number(container?.dataset.totalParticipants),
          rows: rows.length,
          participantSum: rows.reduce((sum, row) => sum + Number(row.dataset.participants), 0),
          protectedRows: rows.filter(row => row.dataset.privacyStatus === 'protected_aggregate').length,
          sharesReconcile: rows.every(row => {
            const expected = Number(row.dataset.participants) / Number(container?.dataset.totalParticipants) * 100;
            return Math.abs(Number(row.dataset.sharePct) - expected) < 0.0001;
          }),
        };
      };
      return { sector: summarize('#sectorBars'), cost: summarize('#costBars'), agreement: summarize('#agreementBars') };
    });
    for (const [name, ranking] of [
      ['sector', expectedWorkforce.bySector],
      ['cost', expectedWorkforce.byCostCenter],
      ['agreement', expectedWorkforce.byAgreement],
    ]) {
      assert.equal(expanded[name].total, ranking.totalParticipants, `${name} total`);
      assert.equal(expanded[name].rows, ranking.rows.length, `${name} published groups`);
      assert.equal(expanded[name].participantSum, ranking.totalParticipants, `${name} reconciliation`);
      assert.equal(expanded[name].protectedRows, ranking.privacyStatus === 'partially_suppressed' ? 1 : 0, `${name} privacy bucket`);
      assert.equal(expanded[name].sharesReconcile, true, `${name} shares`);
    }
    await Promise.all([
      page.waitForURL(`${baseUrl}/login.html?access=private-grh&return=rrhh.html%23peopleDirectory`),
      page.click('#directoryPrivateAccess'),
    ]);
    assert.equal(await page.locator('#privateAccessNotice').isVisible(), true);
    assert.equal(await page.locator('#evaluationAccess').isHidden(), true);
    assert.deepEqual(consoleErrors.filter(message => !/status of 403 \(Forbidden\)/.test(message)), []);
    assert.deepEqual(externalRequests, []);
    await context.close();
  }

  assert.equal(requestLog.length, viewports.length * 4);
  assert.deepEqual(requestLog.map(item => item.path).sort(), viewports.flatMap(() => [
    '/api/grh-directory', '/api/grh-directory-access', '/api/grh-executive', '/api/grh-quality',
  ]).sort());
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
});

test('RRHH authorized directory searches, filters, paginates and opens a real-contract person card', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { unavailable: false }, { directoryMode: 'allowed' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await seedSession(context);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');
  assert.doesNotMatch(await page.locator('#directoryContractRegime').innerText(), /Código 99/,
    'opaque employment codes without a governed label must stay hidden');
  await page.waitForFunction(() => document.querySelector('#directoryAccessPanel')?.dataset.state === 'static');

  let directory = await page.evaluate(() => ({
    count: document.querySelector('#directoryResultCount')?.textContent.trim(),
    rows: document.querySelectorAll('#directoryTableBody tr').length,
    page: document.querySelector('#directoryPageLabel')?.textContent.trim(),
    sectorOptions: document.querySelector('#directorySector')?.options.length,
    organizationOptions: document.querySelector('#directoryOrganization')?.options.length,
    costCenterOptions: document.querySelector('#directoryCostCenter')?.options.length,
    positionOptions: document.querySelector('#directoryPosition')?.options.length,
  }));
  assert.deepEqual(directory, {
    count: '22', rows: 20, page: 'Página 1 de 2', sectorOptions: 3, organizationOptions: 3,
    costCenterOptions: 3, positionOptions: 4,
  });
  const initialPositions = await page.locator('#directoryTableBody .rrhh-position-cell').allTextContents();
  assert.match(initialPositions[0], /DIRECTORA DE PERSONAL/);
  assert.match(initialPositions[0], /Cargo informado para 2026-08/);
  assert.match(initialPositions[1], /AGENTE MUNICIPAL CODIFICADO/);
  assert.doesNotMatch(initialPositions[1], /OBSERVACION NO PRIORIZADA/);
  assert.doesNotMatch(await page.locator('body').innerText(), /cargo actual/i);
  if (process.env.RRHH_CAPTURE === '1') {
    await page.screenshot({ path: path.join(tmpdir(), 'rrhh-directory-authorized-desktop.png'), fullPage: true });
  }

  await page.locator('#directoryNext').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('#directoryPageLabel')?.textContent.trim() === 'Página 2 de 2');
  assert.equal(await page.locator('#directoryTableBody tr').count(), 2);
  await page.locator('#directoryPrevious').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('#directoryPageLabel')?.textContent.trim() === 'Página 1 de 2');

  await page.selectOption('#directoryPosition', 'DIRECTORA DE PERSONAL');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '1');
  assert.match(await page.locator('#directoryTableBody .rrhh-position-cell').innerText(), /Cargo informado para 2026-08/);
  assert.ok(requestLog.some(entry => entry.path === '/api/grh-directory' && entry.query?.positionObservation === 'DIRECTORA DE PERSONAL'));
  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');

  await page.selectOption('#directoryReportedStatus', 'current_by_reported_dates');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '17');
  assert.ok(requestLog.some(entry => entry.path === '/api/grh-directory' &&
    entry.query?.reportedStatus === 'current_by_reported_dates'));
  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');

  await page.selectOption('#directoryContractRegime', '1');
  await page.selectOption('#directoryServiceSituation', '10');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '11');
  assert.ok(requestLog.some(entry => entry.path === '/api/grh-directory' &&
    entry.query?.contractRegime === '1' && entry.query?.serviceSituation === '10'));
  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');

  await page.selectOption('#directoryCostCenter', '30');
  await page.selectOption('#directoryEvent', 'movement');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '1');
  assert.match(await page.locator('#directoryTableBody tr').innerText(), /PERSONAL/);
  assert.ok(requestLog.some(entry => entry.path === '/api/grh-directory' &&
    entry.query?.costCenter === '30' && entry.query?.hasMovement === 'true'));
  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');

  await page.fill('#directorySearch', 'ALONSO');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '1');
  assert.equal(await page.locator('#directoryTableBody tr').count(), 1);
  assert.equal(await page.locator('#directoryTableBody .rrhh-person-name').textContent(), 'ALONSO, ARIEL MAURICIO');

  await page.click('#directoryTableBody .rrhh-person-open');
  await page.waitForSelector('#personDialogContent:not([hidden])');
  await page.waitForTimeout(260);
  const requestsAfterPersonLoad = requestLog.length;
  const person = await page.evaluate(() => ({
    title: document.querySelector('#personDialogTitle')?.textContent.trim(),
    subtitle: document.querySelector('#personDialogSubtitle')?.textContent.trim(),
    assignmentTitle: document.querySelector('#personAssignmentTitle')?.textContent.trim(),
    assignmentNote: document.querySelector('#personAssignmentTitle')?.nextElementSibling?.textContent.trim(),
    dimensions: document.querySelector('#personDimensions')?.textContent.replace(/\s+/g, ' ').trim(),
    events: document.querySelector('#personEvents')?.textContent.replace(/\s+/g, ' ').trim(),
    employment: {
      state: document.querySelector('#personEmployment')?.dataset.state,
      status: document.querySelector('#personEmploymentStatus')?.textContent.trim(),
      detail: document.querySelector('#personEmploymentStatusDetail')?.textContent.trim(),
      basis: document.querySelector('#personEmploymentBasis')?.textContent.trim(),
      facts: document.querySelector('#personEmploymentFacts')?.textContent.replace(/\s+/g, ' ').trim(),
      payrollLabel: document.querySelector('#personPayrollLabel')?.textContent.trim(),
      payrollValue: document.querySelector('#personPayrollValue')?.textContent.trim(),
      position: Array.from(document.querySelector('#personDialogContent').children).indexOf(document.querySelector('#personEmployment')),
    },
    timelineCoverage: document.querySelector('#personTimelineCoverage')?.textContent.trim(),
    coverage: Array.from(document.querySelectorAll('#personTimelineList .rrhh-person-coverage-row'), item => ({
      kind: item.dataset.kind,
      text: item.textContent.replace(/\s+/g, ' ').trim(),
      state: item.querySelector('.rrhh-person-coverage-status')?.dataset.state,
    })),
    tabs: Array.from(document.querySelectorAll('#personTimelineTabs [role="tab"]'), tab => ({
      text: tab.textContent.trim(), selected: tab.getAttribute('aria-selected'), tabIndex: tab.tabIndex,
    })),
    evidence: document.querySelector('#personEvidenceTitle')?.parentElement?.parentElement?.textContent.replace(/\s+/g, ' ').trim(),
    cutoff: document.querySelector('#personDialogCutoff')?.textContent.trim(),
    rect: (() => {
      const rect = document.querySelector('#personDialog')?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    })(),
    sectorCohort: {
      hidden: document.querySelector('#personHaciendaSector')?.hidden,
      href: document.querySelector('#personHaciendaSector')?.getAttribute('href'),
      text: document.querySelector('#personHaciendaSector')?.textContent.trim(),
    },
    agreementCohort: {
      hidden: document.querySelector('#personHaciendaAgreement')?.hidden,
      href: document.querySelector('#personHaciendaAgreement')?.getAttribute('href'),
      text: document.querySelector('#personHaciendaAgreement')?.textContent.trim(),
    },
    assistant: {
      href: document.querySelector('#personAssistantAction')?.getAttribute('href'),
      companyCode: document.querySelector('#personAssistantAction')?.dataset.companyCode,
      legajo: document.querySelector('#personAssistantAction')?.dataset.legajo,
      text: document.querySelector('#personAssistantAction')?.textContent.trim(),
    },
    actionHelp: document.querySelector('.rrhh-person-action-help')?.textContent.trim(),
    visibleText: document.querySelector('#personDialog')?.innerText || '',
    technicalOpen: document.querySelector('#personDialog .rrhh-person-technical')?.open,
    text: document.querySelector('#personDialog')?.textContent || '',
  }));
  assert.equal(person.title, 'ALONSO, ARIEL MAURICIO');
  assert.equal(person.assignmentTitle, 'Ubicación y encuadre informados');
  assert.match(person.assignmentNote, /no certifican adscripción ni vigencia/i);
  assert.match(person.subtitle, /Legajo 571 · empresa 1/);
  assert.match(person.dimensions, /DIRECTORA DE PERSONAL/);
  assert.match(person.dimensions, /Cargo informado para 2026-08/);
  assert.match(person.dimensions, /Fecha posterior al respaldo municipal/);
  assert.match(person.dimensions, /31 de ago de 2026/);
  assert.match(person.dimensions, /Jerarquía del cargo\s*No informada en la fuente/);
  assert.match(person.dimensions, /Centro de costo informado\s*PERSONAL/);
  assert.doesNotMatch(person.dimensions, /SECRETARIA GENERAL|INTENDENCIA|cargo actual/i);
  assert.match(person.events, /Ausencias encontradas en la fuente41 · última 0?9 de feb de 2026/);
  assert.match(person.events, /Licencias encontradas en la fuente3 · última 25 de ene de 2008 a 0?7 de feb de 2008/);
  assert.match(person.events, /Historia de cambios del legajo7 registros de origen · 3 períodos · último 2026-07/);
  assert.deepEqual(person.employment, {
    state: 'reported',
    status: 'Sin egreso informado al corte',
    detail: 'La fuente informa ingreso y no informa egreso. No equivale a una certificación de vínculo activo.',
    basis: 'Según legajo · corte 06 de ago de 2026',
    facts: 'Ingreso reportado01 de feb de 2004Egreso reportadoNo informadoRégimen contractualPLANTA PERMANENTESituación de revistaNORMAL',
    payrollLabel: 'Participación observada en cálculo · jul 2026',
    payrollValue: 'Sí',
    position: 0,
  });
  assert.doesNotMatch(person.employment.status + person.employment.detail, /certifica(?:do|da)?\s+(?:activo|inactivo)/i);
  assert.match(person.timelineCoverage, /cuántos registros encontró la fuente y cuántos se muestran/i);
  assert.match(person.timelineCoverage, /hasta 24 registros o períodos por sección/i);
  assert.deepEqual(person.tabs.map(tab => tab.text), ['Resumen', 'Licencias', 'Ausencias', 'Historia de cambios del legajo']);
  assert.deepEqual(person.tabs.map(tab => tab.selected), ['true', 'false', 'false', 'false']);
  assert.deepEqual(person.tabs.map(tab => tab.tabIndex), [0, -1, -1, -1]);
  assert.deepEqual(person.coverage.map(row => row.kind), ['leave', 'absence', 'movement']);
  assert.match(person.coverage[0].text, /Licencias.*Encontradas en la fuente3.*Mostrados en la ficha3 de 3.*Historia completa/);
  assert.match(person.coverage[1].text, /Ausencias.*Encontradas en la fuente41.*Mostrados en la ficha24 de 41.*Vista parcial/);
  assert.match(person.coverage[2].text, /Historia de cambios del legajo.*Períodos encontrados3.*Mostrados en la ficha3 de 3.*Historia completa/i);
  assert.deepEqual(person.coverage.map(row => row.state), ['complete', 'partial', 'complete']);
  assert.match(person.evidence, /Datos técnicos de la consulta/);
  assert.match(person.cutoff, /Información al/);
  assert.equal(person.technicalOpen, false);
  assert.doesNotMatch(person.visibleText, /snapshot|linaje|SHA-256|cuarentena|gobernad|legamov|histolegajo/i);
  assert.match(person.visibleText, /Ver detalle técnico/);
  assert.ok(person.rect.width >= 730 && person.rect.width <= 770, JSON.stringify(person.rect));
  assert.ok(Math.abs(person.rect.right - 1440) <= 1, JSON.stringify(person.rect));
  assert.ok(person.rect.top <= 1 && Math.abs(person.rect.bottom - 1000) <= 1, JSON.stringify(person.rect));
  if (process.env.RRHH_CAPTURE === '1') {
    await page.screenshot({ path: path.join(tmpdir(), 'rrhh-person-drawer-desktop.png'), fullPage: false });
  }
  assert.doesNotMatch(person.text, /\b(?:DNI|CUIL|domicilio|salario|cuenta bancaria|causa)\b/i);
  assert.doesNotMatch(person.text, /departamento/i);
  assert.deepEqual(person.sectorCohort, {
    hidden: false,
    href: 'hacienda.html?cohort=sector&company=1&code=10#cohortContext',
    text: 'Ver nómina agregada del sector',
  });
  assert.deepEqual(person.agreementCohort, {
    hidden: false,
    href: 'hacienda.html?cohort=agreement&company=1&code=1#cohortContext',
    text: 'Ver nómina agregada del convenio',
  });
  assert.deepEqual(person.assistant, {
    href: 'ia.html?handoff=person', companyCode: '1', legajo: '571',
    text: 'Analizar esta ficha con Asistente GRH',
  });
  assert.match(person.actionHelp, /cohorte agregada; no muestran remuneración individual/i);
  for (const [dimension, href] of [
    ['sector', person.sectorCohort.href],
    ['agreement', person.agreementCohort.href],
  ]) {
    const target = new URL(href, 'https://municipio.example/rrhh.html');
    assert.equal(target.pathname, '/hacienda.html');
    assert.equal(target.hash, '#cohortContext');
    assert.deepEqual(Array.from(target.searchParams), [
      ['cohort', dimension],
      ['company', '1'],
      ['code', dimension === 'sector' ? '10' : '1'],
    ]);
    assert.equal(target.searchParams.has('name'), false);
    assert.equal(target.searchParams.has('nombre'), false);
    assert.equal(target.searchParams.has('legajo'), false);
  }
  await page.waitForTimeout(50);
  assert.equal(requestLog.length, requestsAfterPersonLoad, 'rendering cohort CTAs issues zero extra requests');
  await page.click('[data-timeline-filter="movement"]');
  assert.equal(await page.locator('#personTimelineList tbody tr').count(), 3);
  assert.deepEqual(await page.locator('#personTimelineList thead th').allTextContents(), ['Período', 'Registros de origen']);
  assert.match(await page.locator('#personTimelineList caption').innerText(), /no equivalen automáticamente a altas, bajas ni traslados/i);
  await page.locator('[data-timeline-filter="movement"]').press('ArrowLeft');
  assert.equal(await page.locator('[data-timeline-filter="absence"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#personTimelineList tbody tr').count(), 24);
  assert.deepEqual(await page.locator('#personTimelineList thead th').allTextContents(), ['Fecha', 'Días']);
  assert.match(await page.locator('#personTimelineList caption').innerText(), /Ausencias encontradas en la fuente: 41\. Se muestran 24 de 41\./);
  await page.click('[data-timeline-filter="leave"]');
  assert.equal(await page.locator('#personTimelineList tbody tr').count(), 3);
  assert.deepEqual(await page.locator('#personTimelineList thead th').allTextContents(), ['Inicio', 'Fin', 'Días']);
  assert.match(await page.locator('#personTimelineList caption').innerText(), /Licencias encontradas en la fuente: 3\. Se muestran 3 de 3\./);
  await page.click('#personDialogClose');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('rrhh-person-open')), true);

  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');
  await page.selectOption('#directoryReportedStatus', 'unknown_sentinel_ingress');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryTableBody .rrhh-person-open')?.dataset.legajo === '1003');
  await page.click('#directoryTableBody .rrhh-person-open');
  await page.waitForSelector('#personDialogContent:not([hidden])');
  const sentinelEmployment = await page.locator('#personEmployment').innerText();
  assert.match(sentinelEmployment, /Situación no determinada: fecha de ingreso no utilizable/i);
  assert.match(sentinelEmployment, /Ingreso reportado\s*Dato no utilizable/i);
  assert.doesNotMatch(sentinelEmployment, /1111-11-11|activo certificado|inactivo certificado/i);
  await page.click('#personDialogClose');
  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');

  await page.selectOption('#directoryReportedStatus', 'invalid_chronology');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryTableBody .rrhh-person-open')?.dataset.legajo === '1006');
  await page.click('#directoryTableBody .rrhh-person-open');
  await page.waitForSelector('#personDialogContent:not([hidden])');
  assert.equal(await page.locator('#personEmployment').getAttribute('data-state'), 'invalid');
  assert.match(await page.locator('#personEmployment').innerText(), /Fechas inconsistentes: revisión requerida/i);
  await page.click('#personDialogClose');
  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');
  const mobile = await page.evaluate(() => ({
    cardVisible: getComputedStyle(document.querySelector('#directoryMobileList')).display !== 'none',
    cards: document.querySelectorAll('#directoryMobileList .rrhh-person-card').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(mobile.cardVisible, true);
  assert.equal(mobile.cards, 20);
  assert.ok(mobile.overflow <= 1, JSON.stringify(mobile));
  await page.click('#directoryMobileList .rrhh-person-open');
  await page.waitForSelector('#personDialogContent:not([hidden])');
  await page.waitForTimeout(260);
  const mobileDrawer = await page.evaluate(() => {
    const rect = document.querySelector('#personDialog').getBoundingClientRect();
    const close = document.querySelector('#personDialogClose').getBoundingClientRect();
    const footer = document.querySelector('#personActions').getBoundingClientRect();
    const controls = Array.from(document.querySelectorAll(
      '#personDialogClose, #personTimelineTabs button, #personDialogContent a, #personActions a',
    ), control => {
      const target = control.getBoundingClientRect();
      return { width: target.width, height: target.height };
    });
    return {
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      close: { width: close.width, height: close.height },
      footer: { top: footer.top, bottom: footer.bottom, height: footer.height },
      controls,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert.deepEqual(mobileDrawer.rect, { left: 0, right: 390, top: 0, bottom: 844 });
  assert.ok(mobileDrawer.close.width >= 44 && mobileDrawer.close.height >= 44, JSON.stringify(mobileDrawer));
  assert.ok(Math.abs(mobileDrawer.footer.bottom - 844) <= 1, JSON.stringify(mobileDrawer));
  assert.ok(mobileDrawer.footer.height <= 90, JSON.stringify(mobileDrawer));
  assert.equal(mobileDrawer.controls.every(control => control.width >= 44 && control.height >= 44), true,
    JSON.stringify(mobileDrawer));
  assert.ok(mobileDrawer.overflow <= 1, JSON.stringify(mobileDrawer));
  if (process.env.RRHH_CAPTURE === '1') {
    await page.screenshot({ path: path.join(tmpdir(), 'rrhh-person-drawer-mobile.png'), fullPage: false });
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#personDialog').getAttribute('open'), null);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('rrhh-person-open')), true);
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.click('#directoryMobileList .rrhh-person-open');
  await page.waitForSelector('#personDialogContent:not([hidden])');
  const adaptedDrawer = await page.evaluate(() => ({
    animationName: getComputedStyle(document.querySelector('#personDialog')).animationName,
    selectedTabForcedColors: getComputedStyle(document.querySelector('.rrhh-timeline-tab[aria-selected="true"]')).forcedColorAdjust,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(adaptedDrawer.animationName, 'none');
  assert.equal(adaptedDrawer.selectedTabForcedColors, 'none');
  assert.ok(adaptedDrawer.overflow <= 1, JSON.stringify(adaptedDrawer));
  await page.keyboard.press('Escape');
  if (process.env.RRHH_CAPTURE === '1') {
    await page.screenshot({ path: path.join(tmpdir(), 'rrhh-directory-authorized-mobile.png'), fullPage: true });
  }
  await page.click('#directoryMobileList .rrhh-person-open');
  await page.waitForSelector('#personDialogContent:not([hidden])');
  await page.route('**/ia.html?handoff=person', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>handoff target</title>',
  }));
  const handoffStartedAt = Date.now();
  await Promise.all([
    page.waitForURL(`${baseUrl}/ia.html?handoff=person`),
    page.click('#personAssistantAction'),
  ]);
  const handoff = await page.evaluate(() => {
    const raw = sessionStorage.getItem('muni_grh_person_handoff_v1');
    return raw ? JSON.parse(raw) : null;
  });
  assert.deepEqual(Object.keys(handoff), ['version', 'kind', 'companyCode', 'legajo', 'createdAt']);
  assert.deepEqual({ ...handoff, createdAt: 0 }, {
    version: 'grh-person-handoff-v1',
    kind: 'PERSON_OVERVIEW',
    companyCode: 1,
    legajo: 571,
    createdAt: 0,
  });
  assert.ok(Number.isSafeInteger(handoff.createdAt));
  assert.ok(handoff.createdAt >= handoffStartedAt && handoff.createdAt <= Date.now());
  assert.equal(page.url(), `${baseUrl}/ia.html?handoff=person`);
  assert.deepEqual(consoleErrors, []);
  const directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.ok(directoryRequests.length >= 5);
  assert.equal(directoryRequests.every(entry => (
    entry.query.legajo ? entry.purpose === 'PERSON_LOOKUP' : entry.purpose === 'DIRECTORY_BROWSE'
  )), true);
  const accessRequests = requestLog.filter(entry => entry.path === '/api/grh-directory-access');
  assert.equal(accessRequests.length, 2);
  assert.equal(accessRequests.every(entry => Object.keys(entry.query).length === 0), true);
  assert.equal(requestLog.every(entry => entry.authorization.startsWith('Bearer ')), true);
  const returnStartedAt = Date.now();
  await page.evaluate(createdAt => {
    sessionStorage.removeItem('muni_grh_person_handoff_v1');
    sessionStorage.setItem('muni_grh_person_return_v1', JSON.stringify({
      version: 'grh-person-return-v1', kind: 'PERSON_RETURN', companyCode: 1, legajo: 571, createdAt,
    }));
  }, returnStartedAt);
  await page.goto(`${baseUrl}/rrhh?handoff=person#peopleDirectory`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#personDialogContent:not([hidden])');
  assert.equal(await page.locator('#personDialogTitle').textContent(), 'ALONSO, ARIEL MAURICIO');
  assert.equal(new URL(page.url()).search, '');
  assert.equal(new URL(page.url()).hash, '#peopleDirectory');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('muni_grh_person_return_v1')), null);
  assert.equal(
    requestLog.filter(entry => entry.path === '/api/grh-directory' && entry.query.legajo === '571').at(-1)?.purpose,
    'PERSON_LOOKUP',
  );
  await context.close();
});

test('RRHH access panel fails closed on malformed contracts and recovers from 403 or 503', { skip: !HAS_PRIVATE_GRH }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { mode: 'denied', state: 'denied', status: 'No habilitado', error: /perfil no tiene habilitado/i },
    { mode: 'unavailable', state: 'unavailable', status: 'No disponible', error: /servicio de permisos no responde/i },
    { mode: 'invalid', state: 'invalid', status: 'No verificable', error: /respuesta de acceso no pudo verificarse/i },
  ]) {
    const requestLog = [];
    const directoryAccessState = { mode: scenario.mode };
    const server = await createServer(requestLog, { unavailable: false }, {
      directoryMode: 'allowed',
      directoryAccessState,
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await seedSession(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(expected => (
        document.querySelector('#directoryAccessPanel')?.dataset.state === expected
      ), scenario.state);
      await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');

      const failed = await page.evaluate(() => ({
        status: document.querySelector('#directoryAccessStatus')?.textContent.trim(),
        scope: document.querySelector('#directoryAccessScope')?.textContent.trim(),
        validity: document.querySelector('#directoryAccessValidity')?.textContent.trim(),
        audit: document.querySelector('#directoryAccessAudit')?.textContent.trim(),
        limits: document.querySelector('#directoryAccessLimits')?.textContent.trim(),
        error: document.querySelector('#directoryAccessError')?.textContent.trim(),
        errorHidden: document.querySelector('#directoryAccessError')?.hidden,
        retryHidden: document.querySelector('#directoryAccessRetry')?.hidden,
      }));
      assert.equal(failed.status, scenario.status);
      assert.deepEqual({ scope: failed.scope, validity: failed.validity, audit: failed.audit }, {
        scope: '—', validity: '—', audit: '—',
      });
      assert.equal(failed.limits, 'Sin confirmación');
      assert.match(failed.error, scenario.error);
      assert.equal(failed.errorHidden, false);
      assert.equal(failed.retryHidden, false);

      let accessRequests = requestLog.filter(entry => entry.path === '/api/grh-directory-access');
      assert.equal(accessRequests.length, 1);
      assert.deepEqual(accessRequests[0].query, {});
      assert.match(accessRequests[0].authorization, /^Bearer /);

      directoryAccessState.mode = 'allowed';
      await page.click('#directoryAccessRetry');
      await page.waitForFunction(() => document.querySelector('#directoryAccessPanel')?.dataset.state === 'static');
      const recovered = await page.evaluate(() => ({
        status: document.querySelector('#directoryAccessStatus')?.textContent.trim(),
        retryHidden: document.querySelector('#directoryAccessRetry')?.hidden,
        errorHidden: document.querySelector('#directoryAccessError')?.hidden,
      }));
      assert.deepEqual(recovered, { status: 'Piloto privado actual', retryHidden: true, errorHidden: true });
      accessRequests = requestLog.filter(entry => entry.path === '/api/grh-directory-access');
      assert.equal(accessRequests.length, 2);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('RRHH opens an authorized IA deep-link only after the initial directory authorization', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { unavailable: false }, { directoryMode: 'allowed' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await seedSession(context);
  const page = await context.newPage();
  const target = `${baseUrl}/rrhh?company=1&legajo=571#peopleDirectory`;
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#personDialog[open] #personDialogContent:not([hidden])');

  const result = await page.evaluate(() => ({
    directoryState: document.querySelector('#directoryStatusBadge')?.dataset.state,
    directoryRows: document.querySelectorAll('#directoryTableBody tr').length,
    dialogOpen: document.querySelector('#personDialog')?.open,
    title: document.querySelector('#personDialogTitle')?.textContent.trim(),
    subtitle: document.querySelector('#personDialogSubtitle')?.textContent.trim(),
    search: document.querySelector('#directorySearch')?.value,
    sector: document.querySelector('#directorySector')?.value,
    organization: document.querySelector('#directoryOrganization')?.value,
    position: document.querySelector('#directoryPosition')?.value,
    event: document.querySelector('#directoryEvent')?.value,
  }));
  assert.deepEqual(result, {
    directoryState: 'ready',
    directoryRows: 20,
    dialogOpen: true,
    title: 'ALONSO, ARIEL MAURICIO',
    subtitle: 'Legajo 571 · empresa 1',
    search: '', sector: '', organization: '', position: '', event: '',
  });
  assert.equal(page.url(), target);

  let directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.equal(directoryRequests.length, 2);
  assert.deepEqual(directoryRequests[0].query, { page: '1', limit: '20' });
  assert.deepEqual(directoryRequests[1].query, { legajo: '571', company: '1' });
  assert.equal(directoryRequests[0].purpose, 'DIRECTORY_BROWSE');
  assert.equal(directoryRequests[1].purpose, 'PERSON_LOOKUP');

  await page.click('#personDialogClose');
  await page.fill('#directorySearch', 'ALONSO');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '1');
  assert.equal(await page.inputValue('#directorySearch'), 'ALONSO');
  assert.equal(page.url(), target);
  directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.deepEqual(directoryRequests.at(-1).query, { page: '1', limit: '20', search: 'ALONSO' });
  assert.equal(directoryRequests.at(-1).purpose, 'DIRECTORY_BROWSE');
  await context.close();
});

test('RRHH applies authorized organization and absence deep-links on their first directory request', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { unavailable: false }, { directoryMode: 'allowed' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await seedSession(context);
  const page = await context.newPage();
  const target = `${baseUrl}/rrhh?organization=100&hasAbsence=true#peopleDirectory`;
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');

  const result = await page.evaluate(() => ({
    count: document.querySelector('#directoryResultCount')?.textContent.trim(),
    rows: document.querySelectorAll('#directoryTableBody tr').length,
    organization: document.querySelector('#directoryOrganization')?.value,
    sector: document.querySelector('#directorySector')?.value,
    event: document.querySelector('#directoryEvent')?.value,
    dialogOpen: document.querySelector('#personDialog')?.open,
  }));
  assert.deepEqual(result, {
    count: '5',
    rows: 5,
    organization: '100',
    sector: '',
    event: 'absence',
    dialogOpen: false,
  });
  assert.equal(page.url(), target);
  const directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.equal(directoryRequests.length, 1);
  assert.deepEqual(directoryRequests[0].query, {
    page: '1',
    limit: '20',
    organization: '100',
    hasAbsence: 'true',
  });
  assert.equal(directoryRequests[0].purpose, 'DIRECTORY_BROWSE');

  const zeroCodeTarget = `${baseUrl}/rrhh?organization=0&hasAbsence=true#peopleDirectory`;
  await page.goto(zeroCodeTarget, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');
  assert.deepEqual(
    requestLog.filter(entry => entry.path === '/api/grh-directory').at(-1).query,
    { page: '1', limit: '20', organization: '0', hasAbsence: 'true' },
  );
  assert.equal(requestLog.filter(entry => entry.path === '/api/grh-directory').at(-1).purpose, 'DIRECTORY_BROWSE');
  assert.equal(page.url(), zeroCodeTarget);

  const absenceTarget = `${baseUrl}/rrhh?hasAbsence=true#peopleDirectory`;
  await page.goto(absenceTarget, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');
  assert.deepEqual(await page.evaluate(() => ({
    count: document.querySelector('#directoryResultCount')?.textContent.trim(),
    organization: document.querySelector('#directoryOrganization')?.value,
    sector: document.querySelector('#directorySector')?.value,
    event: document.querySelector('#directoryEvent')?.value,
  })), { count: '8', organization: '', sector: '', event: 'absence' });
  assert.deepEqual(
    requestLog.filter(entry => entry.path === '/api/grh-directory').at(-1).query,
    { page: '1', limit: '20', hasAbsence: 'true' },
  );
  assert.equal(requestLog.filter(entry => entry.path === '/api/grh-directory').at(-1).purpose, 'DIRECTORY_BROWSE');
  assert.equal(page.url(), absenceTarget);

  const movementTarget = `${baseUrl}/rrhh?costCenter=30&hasMovement=true#peopleDirectory`;
  await page.goto(movementTarget, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');
  assert.deepEqual(await page.evaluate(() => ({
    count: document.querySelector('#directoryResultCount')?.textContent.trim(),
    costCenter: document.querySelector('#directoryCostCenter')?.value,
    event: document.querySelector('#directoryEvent')?.value,
  })), { count: '1', costCenter: '30', event: 'movement' });
  assert.deepEqual(
    requestLog.filter(entry => entry.path === '/api/grh-directory').at(-1).query,
    { page: '1', limit: '20', costCenter: '30', hasMovement: 'true' },
  );
  assert.equal(page.url(), movementTarget);

  const movementOnlyTarget = `${baseUrl}/rrhh?hasMovement=true#peopleDirectory`;
  await page.goto(movementOnlyTarget, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'ready');
  assert.deepEqual(await page.evaluate(() => ({
    count: document.querySelector('#directoryResultCount')?.textContent.trim(),
    costCenter: document.querySelector('#directoryCostCenter')?.value,
    event: document.querySelector('#directoryEvent')?.value,
  })), { count: '6', costCenter: '', event: 'movement' });
  assert.deepEqual(
    requestLog.filter(entry => entry.path === '/api/grh-directory').at(-1).query,
    { page: '1', limit: '20', hasMovement: 'true' },
  );
  assert.equal(page.url(), movementOnlyTarget);
  await context.close();
});

test('RRHH does not follow an IA person deep-link after the directory returns 403', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { unavailable: false }, { directoryMode: 'denied' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await seedSession(context);
  const page = await context.newPage();
  const target = `${baseUrl}/rrhh?company=1&legajo=571#peopleDirectory`;
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'denied');
  await page.waitForTimeout(50);

  const denied = await page.evaluate(() => ({
    rows: document.querySelectorAll('#directoryTableBody tr, #directoryMobileList .rrhh-person-card').length,
    dialogOpen: document.querySelector('#personDialog')?.open,
    dialogVisible: document.querySelector('#personDialog')?.getClientRects().length > 0,
    resultsHidden: document.querySelector('#directoryResults')?.hidden,
    visibleMain: document.querySelector('main')?.innerText || '',
  }));
  assert.deepEqual({
    rows: denied.rows,
    dialogOpen: denied.dialogOpen,
    dialogVisible: denied.dialogVisible,
    resultsHidden: denied.resultsHidden,
  }, { rows: 0, dialogOpen: false, dialogVisible: false, resultsHidden: true });
  assert.doesNotMatch(denied.visibleMain, /ALONSO, ARIEL MAURICIO|571/);
  assert.equal(page.url(), target);
  const directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.equal(directoryRequests.length, 1);
  assert.deepEqual(directoryRequests[0].query, { page: '1', limit: '20' });
  assert.equal(directoryRequests[0].purpose, 'DIRECTORY_BROWSE');
  await context.close();
});

test('RRHH rejects malformed or extended person deep-links before every nominal request', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { unavailable: false }, { directoryMode: 'allowed' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const pathAndQuery of [
    '/rrhh?company=1&legajo=0#peopleDirectory',
    '/rrhh?company=1&legajo=571&scope=all#peopleDirectory',
    '/rrhh?company=1&company=2&legajo=571#peopleDirectory',
    '/rrhh?company=1&legajo=9007199254740992#peopleDirectory',
    '/rrhh?company=1&legajo=571#otroDestino',
    '/rrhh?organization=00&hasAbsence=true#peopleDirectory',
    '/rrhh?organization=100&sector=10#peopleDirectory',
    '/rrhh?organization=100&hasAbsence=false#peopleDirectory',
    '/rrhh?sector=10&scope=all#peopleDirectory',
    '/rrhh?costCenter=30&hasMovement=false#peopleDirectory',
    '/rrhh?costCenter=30&hasAbsence=true#peopleDirectory',
    '/rrhh?costCenter=30&costCenter=40#peopleDirectory',
    '/rrhh?hasMovement=true&scope=all#peopleDirectory',
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await seedSession(context);
    const page = await context.newPage();
    const directoryRequestsBefore = requestLog.filter(entry => entry.path === '/api/grh-directory').length;
    await page.goto(`${baseUrl}${pathAndQuery}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'invalid');
    const rejected = await page.evaluate(() => ({
      aggregateVisible: !document.querySelector('#rrhhDashboard')?.hidden,
      rows: document.querySelectorAll('#directoryTableBody tr, #directoryMobileList .rrhh-person-card').length,
      dialogOpen: document.querySelector('#personDialog')?.open,
      resultsHidden: document.querySelector('#directoryResults')?.hidden,
      controlsDisabled: Array.from(document.querySelectorAll('#directoryForm input, #directoryForm select, #directoryForm button'))
        .every(control => control.disabled),
      stateText: document.querySelector('#directoryState')?.textContent.replace(/\s+/g, ' ').trim(),
    }));
    assert.equal(rejected.aggregateVisible, true);
    assert.equal(rejected.rows, 0);
    assert.equal(rejected.dialogOpen, false);
    assert.equal(rejected.resultsHidden, true);
    assert.equal(rejected.controlsDisabled, true);
    assert.match(rejected.stateText, /URL debe identificar una persona o un filtro operativo permitido.*No se consultó ni se muestra información nominal/i);
    assert.equal(page.url(), `${baseUrl}${pathAndQuery}`);
    assert.equal(
      requestLog.filter(entry => entry.path === '/api/grh-directory').length,
      directoryRequestsBefore,
      pathAndQuery,
    );
    await context.close();
  }
});

test('RRHH fails closed on mutated movement identities or a stale directory contract', { skip: !HAS_PRIVATE_GRH }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'rows without a period', directoryMutation: 'rows-without-period' },
    { name: 'period without rows', directoryMutation: 'period-without-rows' },
    { name: 'impossible movement month', directoryMutation: 'impossible-period' },
    { name: 'impossible employment calendar date', directoryMutation: 'impossible-employment-date' },
    { name: 'payroll is not the prior governed month', directoryMutation: 'stale-payroll-period' },
    { name: 'stale v1 header', directoryContract: 'grh-directory-v1' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, { unavailable: false }, {
      directoryMode: 'allowed',
      directoryMutation: scenario.directoryMutation,
      directoryContract: scenario.directoryContract,
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await seedSession(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#directoryStatusBadge')?.dataset.state === 'unavailable');
      const rejected = await page.evaluate(() => ({
        aggregateVisible: !document.querySelector('#rrhhDashboard')?.hidden,
        rows: document.querySelectorAll('#directoryTableBody tr, #directoryMobileList .rrhh-person-card').length,
        resultsHidden: document.querySelector('#directoryResults')?.hidden,
        state: document.querySelector('#directoryStatusBadge')?.dataset.state,
        stateText: document.querySelector('#directoryState')?.textContent.replace(/\s+/g, ' ').trim(),
      }));
      assert.deepEqual({
        aggregateVisible: rejected.aggregateVisible,
        rows: rejected.rows,
        resultsHidden: rejected.resultsHidden,
        state: rejected.state,
      }, {
        aggregateVisible: true,
        rows: 0,
        resultsHidden: true,
        state: 'unavailable',
      }, scenario.name);
      assert.match(rejected.stateText,
        /Directorio temporalmente no disponible.*El tablero agregado sigue operativo.*reintentar la consulta nominal/i,
        scenario.name);
      assert.equal(requestLog.filter(entry => entry.path === '/api/grh-directory').length, 1, scenario.name);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('RRHH source uses one secure experience and contains no raw contract access or source-backed literals', async () => {
  const [html, script] = await Promise.all([
    readFile(path.join(REPO, 'rrhh.html'), 'utf8'),
    readFile(path.join(REPO, 'js', 'rrhh.js'), 'utf8'),
  ]);
  const source = `${html}\n${script}`;
  const authIndex = html.indexOf('src="js/auth-fetch.js"');
  const secureIndex = html.indexOf('src="js/grh-secure-data.js"');
  const pageIndex = html.indexOf('src="js/rrhh.js"');
  assert.ok(authIndex >= 0 && authIndex < secureIndex && secureIndex < pageIndex);
  assert.match(script, /await global\.requireCapability\('navigation\.rrhh'\)/);
  assert.match(script, /async function init\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadDashboard\(\)/);
  assert.match(script, /retryButton\.addEventListener\('click', loadAuthorizedDashboard\)/);
  assert.match(script, /MuniGrhData\.loadExperience\(\{ timeoutMs: 10000 \}\)/);
  assert.doesNotMatch(script, /MuniGrhData\.(?:loadExecutive|loadQuality)/);
  assert.doesNotMatch(source, /\/api\/grh-data|artifact=(?:profile|semantic)|grh-semantic-v[01]/);
  assert.doesNotMatch(script, /(?:^|[^\w.])fetch\s*\(|localStorage/);
  assert.match(script, /MuniAuth\.fetch\(DIRECTORY_ENDPOINT/);
  assert.match(script, /var DIRECTORY_SCHEMA = 'grh-directory-v3'/);
  assert.match(script, /response\.headers\.get\('X-MuniControl-Contract'\) !== DIRECTORY_SCHEMA/);
  assert.match(script, /MuniAuth\.fetch\(DIRECTORY_ACCESS_ENDPOINT[\s\S]*cache: 'no-store'/);
  assert.match(script, /response\.headers\.get\('X-MuniControl-Contract'\) !== DIRECTORY_ACCESS_SCHEMA/);
  assert.match(script, /requestDirectory\(directoryQuery\(page, cursor\), 'DIRECTORY_BROWSE'\)/);
  assert.match(script, /requestDirectory\(\{ legajo: legajo, company: companyCode \}, 'PERSON_LOOKUP'\)/);
  assert.match(script, /'X-MuniControl-Purpose': purpose/);
  assert.match(script, /state\.directory\.deepLink = parseDirectoryDeepLink\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return/);
  assert.match(script, /var directoryReady = await loadDirectory\(1, null, true\)[\s\S]*await openDirectoryDeepLink\(\)/);
  assert.equal((script.match(/sessionStorage/g) || []).length, 5,
    'session storage is limited to the denied-access notice and the two allowlisted person handoffs');
  assert.match(script, /sessionStorage\.getItem\('mjunin_access_notice'\)[\s\S]*sessionStorage\.setItem\('mjunin_access_notice'/);
  assert.match(script, /var PERSON_HANDOFF_STORAGE_KEY = 'muni_grh_person_handoff_v1'/);
  assert.match(script, /var handoff = \{[\s\S]*version: PERSON_HANDOFF_VERSION,[\s\S]*kind: 'PERSON_OVERVIEW',[\s\S]*companyCode: companyCode,[\s\S]*legajo: legajo,[\s\S]*createdAt: Date\.now\(\)[\s\S]*\};/);
  assert.match(script, /sessionStorage\.setItem\(PERSON_HANDOFF_STORAGE_KEY, JSON\.stringify\(handoff\)\)/);
  assert.match(script, /sessionStorage\.getItem\(PERSON_RETURN_STORAGE_KEY\)[\s\S]*sessionStorage\.removeItem\(PERSON_RETURN_STORAGE_KEY\)/);
  assert.doesNotMatch(source, /\b856\b|\b88[.,]99\b|\b2026-07\b|\b2\.450\b|\b20\.534\b/);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('RRHH capability preflight redirects denied or malformed clients before every private contract', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'DEMO' },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, { unavailable: false }, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await seedSession(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`${baseUrl}/inicio.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(75);
      assert.deepEqual(requestLog, [], `${scenario.name} must issue zero private GRH requests`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('RRHH fails closed on 503 and retry recovers only after both projections return', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const availability = { unavailable: true };
  const server = await createServer(requestLog, availability);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  const failed = await page.evaluate(() => ({
    dashboardHidden: document.querySelector('#rrhhDashboard')?.hidden,
    title: document.querySelector('#errorTitle')?.textContent.trim(),
    message: document.querySelector('#errorMessage')?.textContent.trim(),
    displayedNumbers: Array.from(document.querySelectorAll('.rrhh-kpi-value'), node => node.textContent.trim()),
    publishedRows: document.querySelectorAll('.rrhh-bar-row, .rrhh-chart-point, #quarantineTableBody tr').length,
  }));
  assert.equal(failed.dashboardHidden, true);
  assert.equal(failed.title, 'Respaldo municipal no disponible');
  assert.match(failed.message, /No se muestran valores de ejemplo ni datos anteriores/);
  assert.equal(failed.displayedNumbers.every(value => value === '—'), true);
  assert.equal(failed.publishedRows, 0);
  assert.deepEqual(requestLog.map(item => item.path).sort(), ['/api/grh-executive', '/api/grh-quality']);

  availability.unavailable = false;
  await page.click('#retryButton');
  await page.waitForSelector('#rrhhDashboard[aria-busy="false"]:not([hidden])');
  const recovered = await page.evaluate(() => ({
    status: document.querySelector('#connectionStatusText')?.textContent.trim(),
    errorHidden: document.querySelector('#loadError')?.hidden,
    participants: document.querySelector('#kpiWorkforceParticipants')?.textContent.trim(),
  }));
  assert.equal(recovered.status, 'Datos verificados');
  assert.equal(recovered.errorHidden, true);
  assert.equal(recovered.participants, projections.executive.workforce.bySector.participantDisplay);
  assert.equal(requestLog.length, 6);
  assert.deepEqual(requestLog.slice(2).map(item => item.path).sort(), [
    '/api/grh-directory', '/api/grh-directory-access', '/api/grh-executive', '/api/grh-quality',
  ]);
  await context.close();
});
