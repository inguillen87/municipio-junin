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
  const legajo = 1000 + index;
  const leaveCount = index === 1 ? 2 : index % 5 === 0 ? 1 : 0;
  const item = {
    companyCode: 1,
    legajo,
    displayName: index === 1 ? 'ALVAREZ, ANA' : `PERSONA PRUEBA ${String(index).padStart(2, '0')}`,
    sector: { code: index % 2 ? 10 : 20, label: index % 2 ? 'ADMINISTRACION' : 'SERVICIOS' },
    organization: { code: index % 2 ? 100 : 200, label: index % 2 ? 'SECRETARIA DE GOBIERNO' : 'SECRETARIA DE SERVICIOS' },
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
    events: {
      absenceCount: index % 3 === 0 ? 2 : 0,
      latestAbsenceDate: index % 3 === 0 ? '2026-07-10' : null,
      leaveCount,
      latestLeaveStartDate: leaveCount ? '2009-05-01' : null,
      latestLeaveEndDate: leaveCount ? '2009-05-05' : null,
    },
  };
  if (detail) {
    item.leaveHistory = {
      total: leaveCount,
      limit: 24,
      items: leaveCount === 2 ? [
        { startDate: '2009-05-01', endDate: '2009-05-05', days: 5 },
        { startDate: '2008-03-10', endDate: '2008-03-12', days: 3 },
      ] : leaveCount === 1 ? [
        { startDate: '2009-05-01', endDate: '2009-05-05', days: 5 },
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
    excludedFields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'event_cause'],
  };
  const detailLegajo = Number(url.searchParams.get('legajo'));
  if (Number.isSafeInteger(detailLegajo) && detailLegajo > 0) {
    const match = all.find(item => item.legajo === detailLegajo);
    const item = directoryItem(all.indexOf(match) + 1, true);
    const payload = {
      schemaVersion: 'grh-directory-v1', source, privacy,
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
  const positionObservation = url.searchParams.get('positionObservation');
  if (positionObservation) {
    filtered = filtered.filter(item => item.positionObservation?.label === positionObservation);
  }
  for (const [parameter, property] of [['sector', 'sector'], ['organization', 'organization'], ['position', 'position']]) {
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
    schemaVersion: 'grh-directory-v1', source, privacy,
    query: {
      mode: 'list', page, limit, total: filtered.length, hasNext,
      cursor: cursor || null,
      nextCursor: hasNext ? 'eyJ2IjoxLCJvIjoyMCwicSI6InFhIn0' : null,
    },
    facets: {
      sectors: [{ code: 10, label: 'ADMINISTRACION', count: 11 }, { code: 20, label: 'SERVICIOS', count: 11 }],
      organizations: [{ code: 100, label: 'SECRETARIA DE GOBIERNO', count: 11 }, { code: 200, label: 'SECRETARIA DE SERVICIOS', count: 11 }],
      positions: [{ code: 1002, label: 'AGENTE MUNICIPAL CODIFICADO', count: 1 }],
      positionObservations: [
        { label: 'AGENTE MUNICIPAL INFORMADO', count: 20, status: 'source_future_effective' },
        { label: 'DIRECTORA DE PERSONAL', count: 1, status: 'source_future_effective' },
        { label: 'OBSERVACION NO PRIORIZADA', count: 1, status: 'source_future_effective' },
      ],
      categories: [{ agreementCode: 1, code: 7, label: 'CATEGORIA 7', count: 22 }],
      agreements: [{ code: 1, label: 'MUNICIPAL', count: 22 }],
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
    if (url.pathname === '/api/grh-directory') {
      requestLog.push({
        path: url.pathname,
        authorization: request.headers.authorization || '',
        unavailable: false,
        query: Object.fromEntries(url.searchParams),
      });
      const directoryMode = options.directoryMode || 'denied';
      if (directoryMode === 'allowed') {
        response.writeHead(200, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store, private',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify(directoryPayload(url)));
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
    const collapsed = await page.evaluate(() => {
      const dashboard = document.querySelector('#rrhhDashboard');
      const mainText = document.querySelector('main')?.textContent || '';
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
        suppressedChartPoints: document.querySelectorAll('.rrhh-chart-point:not([data-privacy-status="released"])').length,
        unsafeHistoricalPoint: document.querySelectorAll('.rrhh-chart-point[data-period="1991"]').length,
        accessibleCharts: document.querySelectorAll('.rrhh-chart-wrap svg[role="img"][aria-label]').length,
        directoryState: document.querySelector('#directoryStatusBadge')?.dataset.state,
        directoryRows: document.querySelectorAll('#directoryTableBody tr, #directoryMobileList .rrhh-person-card').length,
        directorySearchDisabled: document.querySelector('#directorySearch')?.disabled,
        directoryFormLocked: document.querySelector('#directoryForm')?.dataset.locked,
        privateAccessVisible: !document.querySelector('#directoryPrivateAccess')?.hidden,
        actionCount: document.querySelectorAll('.rrhh-actions .rrhh-action').length,
        busy: dashboard?.getAttribute('aria-busy'),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        revealAnimation: getComputedStyle(document.querySelector('.rrhh-reveal')).animationName,
      };
    });

    assert.equal(collapsed.legajos, formatNumber(expectedQuality.referential.legajo.rows));
    assert.equal(collapsed.participants, expectedWorkforce.bySector.participantDisplay);
    assert.match(collapsed.workforceContext, new RegExp(`^${expectedWorkforce.referencePeriod} .* legajos que participaron en cálculo válido\\.$`));
    assert.equal(collapsed.quality, `${formatDecimal(expectedQuality.quality.score)}/100`);
    assert.equal(collapsed.quarantine, formatNumber(expectedQuality.temporal.quarantineRows));
    const latestLeave = projections.executive.leave.series.filter(row => row.privacyStatus === 'released').at(-1);
    assert.equal(collapsed.leaves, formatNumber(latestLeave.value));
    assert.match(collapsed.leaveContext, new RegExp(`^${latestLeave.period} .* histórico\\.$`));
    assert.match(collapsed.leaveRange, /Cobertura histórica publicada:/);
    assert.equal(collapsed.sourceStatus, 'Proyecciones verificadas');
    assert.equal(collapsed.schema, 'grh-executive-v2 · grh-quality-v1');
    assert.match(collapsed.sourceText, /grh-profile-v1 · grh-semantic-v2/);
    assert.match(collapsed.sourceText, /Diferencias materiales detectadas/);
    assert.equal(collapsed.errorVisible, false);
    assert.equal(collapsed.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.equal(collapsed.sectorRows, 9);
    assert.equal(collapsed.costRows, 9);
    assert.equal(collapsed.agreementRows, 8);
    assert.deepEqual(collapsed.protectedLabels, [
      projections.executive.privacy.protectedBucketLabel,
      projections.executive.privacy.protectedBucketLabel,
    ]);
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
    assert.deepEqual(consoleErrors.filter(message => !/status of 403 \(Forbidden\)/.test(message)), []);
    assert.deepEqual(externalRequests, []);
    await context.close();
  }

  assert.equal(requestLog.length, viewports.length * 3);
  assert.deepEqual(requestLog.map(item => item.path).sort(), viewports.flatMap(() => [
    '/api/grh-directory', '/api/grh-executive', '/api/grh-quality',
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

  let directory = await page.evaluate(() => ({
    count: document.querySelector('#directoryResultCount')?.textContent.trim(),
    rows: document.querySelectorAll('#directoryTableBody tr').length,
    page: document.querySelector('#directoryPageLabel')?.textContent.trim(),
    sectorOptions: document.querySelector('#directorySector')?.options.length,
    organizationOptions: document.querySelector('#directoryOrganization')?.options.length,
    positionOptions: document.querySelector('#directoryPosition')?.options.length,
  }));
  assert.deepEqual(directory, {
    count: '22', rows: 20, page: 'Página 1 de 2', sectorOptions: 3, organizationOptions: 3, positionOptions: 4,
  });
  const initialPositions = await page.locator('#directoryTableBody .rrhh-position-cell').allTextContents();
  assert.match(initialPositions[0], /DIRECTORA DE PERSONAL/);
  assert.match(initialPositions[0], /Cargo informado · histolegajo 2026-08/);
  assert.match(initialPositions[1], /AGENTE MUNICIPAL CODIFICADO/);
  assert.doesNotMatch(initialPositions[1], /OBSERVACION NO PRIORIZADA/);
  assert.doesNotMatch(await page.locator('body').innerText(), /cargo actual/i);
  if (process.env.RRHH_CAPTURE === '1') {
    await page.screenshot({ path: path.join(tmpdir(), 'rrhh-directory-authorized-desktop.png'), fullPage: true });
  }

  await page.click('#directoryNext');
  await page.waitForFunction(() => document.querySelector('#directoryPageLabel')?.textContent.trim() === 'Página 2 de 2');
  assert.equal(await page.locator('#directoryTableBody tr').count(), 2);
  await page.click('#directoryPrevious');
  await page.waitForFunction(() => document.querySelector('#directoryPageLabel')?.textContent.trim() === 'Página 1 de 2');

  await page.selectOption('#directoryPosition', 'DIRECTORA DE PERSONAL');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '1');
  assert.match(await page.locator('#directoryTableBody .rrhh-position-cell').innerText(), /Cargo informado · histolegajo 2026-08/);
  assert.ok(requestLog.some(entry => entry.path === '/api/grh-directory' && entry.query?.positionObservation === 'DIRECTORA DE PERSONAL'));
  await page.click('#directoryReset');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '22');

  await page.fill('#directorySearch', 'ALVAREZ');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '1');
  assert.equal(await page.locator('#directoryTableBody tr').count(), 1);
  assert.equal(await page.locator('#directoryTableBody .rrhh-person-name').textContent(), 'ALVAREZ, ANA');

  await page.click('#directoryTableBody .rrhh-person-open');
  await page.waitForSelector('#personDialogContent:not([hidden])');
  const person = await page.evaluate(() => ({
    title: document.querySelector('#personDialogTitle')?.textContent.trim(),
    subtitle: document.querySelector('#personDialogSubtitle')?.textContent.trim(),
    dimensions: document.querySelector('#personDimensions')?.textContent.replace(/\s+/g, ' ').trim(),
    events: document.querySelector('#personEvents')?.textContent.replace(/\s+/g, ' ').trim(),
    leaves: Array.from(document.querySelectorAll('#personLeaveHistoryList li'), item => item.textContent.trim()),
    text: document.querySelector('#personDialog')?.textContent || '',
  }));
  assert.equal(person.title, 'ALVAREZ, ANA');
  assert.match(person.subtitle, /Legajo 1\.001 · empresa 1/);
  assert.match(person.dimensions, /DIRECTORA DE PERSONAL/);
  assert.match(person.dimensions, /Cargo informado · histolegajo 2026-08/);
  assert.match(person.dimensions, /Vigencia futura informada por la fuente/);
  assert.match(person.dimensions, /31 de ago de 2026/);
  assert.match(person.dimensions, /Jerarquía del cargo\s*No informada por histolegajo/);
  assert.doesNotMatch(person.dimensions, /SECRETARIA GENERAL|INTENDENCIA|cargo actual/i);
  assert.match(person.events, /2 · última 0?1 de may de 2009 a 0?5 de may de 2009/);
  assert.match(person.events, /No incluido en esta extracción nominal/);
  assert.equal(person.leaves.length, 2);
  assert.doesNotMatch(person.text, /\b(?:DNI|CUIL|domicilio|salario|cuenta bancaria|causa)\b/i);
  await page.click('#personDialogClose');

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
  if (process.env.RRHH_CAPTURE === '1') {
    await page.screenshot({ path: path.join(tmpdir(), 'rrhh-directory-authorized-mobile.png'), fullPage: true });
  }
  assert.deepEqual(consoleErrors, []);
  assert.ok(requestLog.filter(entry => entry.path === '/api/grh-directory').length >= 5);
  assert.equal(requestLog.every(entry => entry.authorization.startsWith('Bearer ')), true);
  await context.close();
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
  const target = `${baseUrl}/rrhh?company=1&legajo=1001#peopleDirectory`;
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
    title: 'ALVAREZ, ANA',
    subtitle: 'Legajo 1.001 · empresa 1',
    search: '', sector: '', organization: '', position: '', event: '',
  });
  assert.equal(page.url(), target);

  let directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.equal(directoryRequests.length, 2);
  assert.deepEqual(directoryRequests[0].query, { page: '1', limit: '20' });
  assert.deepEqual(directoryRequests[1].query, { legajo: '1001', company: '1' });

  await page.click('#personDialogClose');
  await page.fill('#directorySearch', 'ALVAREZ');
  await page.click('#directorySubmit');
  await page.waitForFunction(() => document.querySelector('#directoryResultCount')?.textContent.trim() === '1');
  assert.equal(await page.inputValue('#directorySearch'), 'ALVAREZ');
  assert.equal(page.url(), target);
  directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.deepEqual(directoryRequests.at(-1).query, { page: '1', limit: '20', search: 'ALVAREZ' });
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
  const target = `${baseUrl}/rrhh?company=1&legajo=1001#peopleDirectory`;
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
  assert.doesNotMatch(denied.visibleMain, /ALVAREZ, ANA|1\.001/);
  assert.equal(page.url(), target);
  const directoryRequests = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.equal(directoryRequests.length, 1);
  assert.deepEqual(directoryRequests[0].query, { page: '1', limit: '20' });
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
    '/rrhh?company=1&legajo=1001&scope=all#peopleDirectory',
    '/rrhh?company=1&company=2&legajo=1001#peopleDirectory',
    '/rrhh?company=1&legajo=9007199254740992#peopleDirectory',
    '/rrhh?company=1&legajo=1001#otroDestino',
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
    assert.match(rejected.stateText, /URL debe incluir únicamente.*No se consultó ni se muestra información nominal/i);
    assert.equal(page.url(), `${baseUrl}${pathAndQuery}`);
    assert.equal(
      requestLog.filter(entry => entry.path === '/api/grh-directory').length,
      directoryRequestsBefore,
      pathAndQuery,
    );
    await context.close();
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
  assert.match(script, /state\.directory\.deepLink = parseDirectoryDeepLink\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return/);
  assert.match(script, /var directoryReady = await loadDirectory\(1, null, true\)[\s\S]*await openDirectoryDeepLink\(\)/);
  assert.equal((script.match(/sessionStorage/g) || []).length, 2, 'session storage is limited to preserving the denied-access notice');
  assert.match(script, /sessionStorage\.getItem\('mjunin_access_notice'\)[\s\S]*sessionStorage\.setItem\('mjunin_access_notice'/);
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
  assert.equal(failed.title, 'Snapshot GRH no disponible');
  assert.match(failed.message, /No se muestran valores de ejemplo, datos crudos ni un corte anterior/);
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
  assert.equal(recovered.status, 'Proyecciones verificadas');
  assert.equal(recovered.errorHidden, true);
  assert.equal(recovered.participants, projections.executive.workforce.bySector.participantDisplay);
  assert.equal(requestLog.length, 5);
  assert.deepEqual(requestLog.slice(2).map(item => item.path).sort(), [
    '/api/grh-directory', '/api/grh-executive', '/api/grh-quality',
  ]);
  await context.close();
});
