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
import tenantPresentationPolicy from '../shared/tenant-presentation-policy.cjs';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAS_PRIVATE_GRH = ['profile', 'semantic'].every(name =>
  existsSync(path.join(REPO, 'api', '_data', `grh-${name}.json`))
);
const PROJECTIONS = HAS_PRIVATE_GRH ? await (async () => {
  const [profile, semantic] = await Promise.all([
    readFile(path.join(REPO, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
    readFile(path.join(REPO, 'api', '_data', 'grh-semantic.json'), 'utf8').then(JSON.parse),
  ]);
  return {
    executive: buildGrhExecutiveProjection(semantic, { audience: 'interactive' }),
    quality: buildGrhQualityProjection(profile, semantic),
    close: buildGrhCloseProjection(semantic),
  };
})() : null;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const PRIVATE_DATA_PATHS = new Set([
  '/api/grh-executive',
  '/api/grh-quality',
  '/api/grh-close',
  '/api/grh-data',
  '/api/reports',
  '/api/ai-analyze',
  '/api/raw',
]);

function relativeLuminance(hexColor) {
  let normalized = String(hexColor).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) normalized = normalized.split('').map(channel => channel + channel).join('');
  assert.match(normalized, /^[0-9a-f]{6}$/i, `expected an opaque hex color, received ${hexColor}`);
  const channels = [0, 2, 4].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  return channels.map(channel => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
  ).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first, second) {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

async function readRenderedThemeAudit(page) {
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
    const textNodes = Array.from(document.querySelectorAll('body.hacienda-page *')).filter(node => {
      if (!visible(node) || node.matches('script, style, title, desc, option, .hac-visually-hidden')) return false;
      return node instanceof SVGTextElement || Array.from(node.childNodes).some(child =>
        child.nodeType === Node.TEXT_NODE && child.textContent.trim()
      );
    });
    const textViolations = textNodes.map(node => {
      const style = getComputedStyle(node);
      const background = effectiveBackground(node);
      const rawTextColor = parseColor(node instanceof SVGTextElement ? style.fill : style.color);
      const textColor = rawTextColor ? composite(rawTextColor, background) : null;
      return {
        selector: selectorFor(node),
        text: node.textContent.trim().slice(0, 70),
        ratio: textColor ? Number(ratio(textColor, background).toFixed(2)) : 0,
        size: Number.parseFloat(style.fontSize),
      };
    });
    const boundarySelector = [
      '.hac-topbar', '.hac-menu-btn', '.hac-icon-btn', '.hac-retry-btn', '.hac-source-state',
      '.hac-hero', '.hac-chip', '.hac-select', '.hac-error', '.hac-stat',
      '.hac-panel', '.hac-panel-badge', '.hac-close-figure', '.hac-close-metric', '.hac-close-note',
      '.hac-alert', '.hac-equation-card', '.hac-scenario-banner', '.hac-sim-result', '.hac-table-wrap',
      '.hac-methodology', '[data-muni-shell="primary-nav"]', '[data-muni-shell="bottom-nav"]'
    ].join(',');
    const boundaryViolations = Array.from(document.querySelectorAll(boundarySelector)).filter(visible).map(node => {
      const style = getComputedStyle(node);
      const outside = effectiveBackground(node.parentElement || node);
      const inside = effectiveBackground(node);
      const borderRatios = ['Top', 'Right', 'Bottom', 'Left'].map(side => {
        const width = Number.parseFloat(style[`border${side}Width`]) || 0;
        const rawBorder = parseColor(style[`border${side}Color`]);
        const border = rawBorder ? composite(rawBorder, outside) : outside;
        return width > 0 ? ratio(border, outside) : 1;
      });
      const boundaryRatio = Math.max(
        ratio(inside, outside),
        ...borderRatios,
      );
      return { selector: selectorFor(node), ratio: Number(boundaryRatio.toFixed(2)) };
    }).filter(result => result.ratio < 3 - 0.01);
    const bottomNav = document.querySelector('[data-muni-shell="bottom-nav"]');
    return {
      theme: document.documentElement.dataset.theme,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      mainBackground: getComputedStyle(document.querySelector('#mainContent')).backgroundColor,
      mainColor: getComputedStyle(document.querySelector('#mainContent')).color,
      bottomNavBackground: bottomNav ? getComputedStyle(bottomNav).backgroundColor : null,
      textViolations: textViolations.filter(result => result.ratio < 4.5 - 0.01),
      fontFloorViolations: textViolations.filter(result => result.size < 12),
      boundaryViolations,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      legacyStored: localStorage.getItem('govtech_theme'),
      versionedStored: localStorage.getItem('municontrol-color-theme:v1'),
    };
  });
}

function assertRenderedThemeAudit(audit, expectedTheme, viewportName) {
  assert.equal(audit.theme, expectedTheme, `${viewportName} theme`);
  assert.equal(audit.legacyStored, expectedTheme, `${viewportName} legacy storage`);
  assert.equal(audit.versionedStored, expectedTheme, `${viewportName} canonical storage`);
  assert.deepEqual(audit.textViolations, [], `${viewportName} text contrast: ${JSON.stringify(audit.textViolations)}`);
  assert.deepEqual(audit.fontFloorViolations, [], `${viewportName} font floor: ${JSON.stringify(audit.fontFloorViolations)}`);
  assert.deepEqual(audit.boundaryViolations, [], `${viewportName} boundaries: ${JSON.stringify(audit.boundaryViolations)}`);
  assert.equal(audit.overflow, 0, `${viewportName} must not overflow horizontally`);
  assert.notEqual(audit.bodyBackground, audit.mainColor, `${viewportName} body cannot equal text`);
  assert.notEqual(audit.mainBackground, audit.mainColor, `${viewportName} main cannot equal text`);
  if (viewportName.startsWith('mobile-')) {
    assert.equal(
      audit.bottomNavBackground,
      expectedTheme === 'light' ? 'rgb(248, 250, 252)' : 'rgb(9, 23, 40)',
      `${viewportName} bottom navigation background`,
    );
  }
}

function authoritativeUser(role = 'INTENDENTE', malformedProjection = false) {
  const tenantId = 'tenant-junin-test';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access, `missing test access projection for ${role}`);
  const user = {
    id: 'qa-hacienda',
    name: 'QA Hacienda',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
    presentation: tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' }),
  };
  return malformedProjection ? { ...user, capabilities: 'navigation.hacienda' } : user;
}

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-hacienda',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

async function createServer(requestLog, options = {}) {
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
    if (PRIVATE_DATA_PATHS.has(url.pathname)) {
      const contract = url.pathname.slice('/api/grh-'.length);
      requestLog.push({
        contract,
        pathname: url.pathname,
        authorization: request.headers.authorization || '',
      });
      if (!['/api/grh-executive', '/api/grh-quality', '/api/grh-close'].includes(url.pathname)) {
        response.writeHead(410, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato no utilizado por Hacienda' }));
        return;
      }
      if (options.failContract === contract) {
        response.writeHead(503, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify({ error: 'Contrato gobernado no disponible' }));
        return;
      }
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
      });
      response.end(JSON.stringify(PROJECTIONS[contract]));
      return;
    }

    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify({ user: authoritativeUser(
        options.authRole || 'INTENDENTE',
        options.malformedProjection === true,
      ) }));
      return;
    }

    const relative = url.pathname === '/' ? 'login.html' : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(REPO, relative);
    if (!target.startsWith(`${REPO}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function authenticatedContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: viewport.reducedMotion,
  });
  await context.addInitScript(({ token, legacyTheme, versionedTheme }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'qa-hacienda',
      name: 'QA Hacienda',
      role: 'INTENDENTE',
      tenantId: 'tenant-junin-test',
    }));
    if (!sessionStorage.getItem('qa-theme-seeded')) {
      if (legacyTheme) localStorage.setItem('govtech_theme', legacyTheme);
      if (versionedTheme) localStorage.setItem('municontrol-color-theme:v1', versionedTheme);
      sessionStorage.setItem('qa-theme-seeded', 'true');
    }
  }, {
    token: fakeBrowserToken(),
    legacyTheme: viewport.legacyTheme || viewport.theme || 'dark',
    versionedTheme: viewport.versionedTheme || null,
  });
  return context;
}

test('Hacienda source uses only the secure GRH experience client and compiles inline scripts', async () => {
  const html = await readFile(path.join(REPO, 'hacienda.html'), 'utf8');
  assert.doesNotMatch(html, /\/api\/grh-data|artifact=semantic|MuniAuth\.fetch|calculation_control_series|cross_source_reconciliation/);
  assert.match(html, /<script src="js\/auth-fetch\.js"><\/script>\s*<script src="js\/tenant-presentation\.js"><\/script>\s*<script src="js\/grh-secure-data\.js"><\/script>/);
  assert.match(html, /<script src="js\/grh-close-data\.js"><\/script>/);
  assert.match(html, /MuniGrhData\.loadExperience\(\{\s*timeoutMs:\s*10000\s*\}\)/);
  assert.match(html, /MuniGrhClose\.load\(\{\s*timeoutMs:\s*10000\s*\}\)/);
  assert.match(html, /MuniTenantPresentation\.load\(\)/);
  assert.match(html, /await window\.requireCapability\('navigation\.hacienda'\)/);
  assert.match(html, /async function init\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadExperience\(\)/);
  assert.match(html, /retryLoad\.addEventListener\('click', loadAuthorizedExperience\)/);
  assert.match(html, /row\.privacyStatus !== 'released'/);
  assert.match(html, /<script src="js\/theme-switcher\.js"><\/script>[\s\S]*<link rel="stylesheet" href="css\/dashboard\.css">/);
  assert.match(html, /id="themeToggleBtn"[^>]+data-muni-theme-control/);
  assert.match(html, /La reconciliación es global/);

  const inlineScripts = [...html.matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
  )].map(match => match[1]);
  assert.ok(inlineScripts.length >= 1);
  inlineScripts.forEach(script => assert.doesNotThrow(() => new Function(script)));
});

test('Hacienda operational typography has a static 12px minimum', async () => {
  const html = await readFile(path.join(REPO, 'hacienda.html'), 'utf8');
  const declarations = [...html.matchAll(/\bfont(?:-size)?\s*:\s*([^;{}]+)/gi)]
    .map(match => match[0]);
  const sizes = declarations.flatMap(declaration =>
    [...declaration.matchAll(/(\d+(?:\.\d+)?)px\b/gi)].map(match => ({
      declaration,
      value: Number(match[1]),
    }))
  );
  assert.ok(sizes.length >= 40, 'the gate must continue covering Hacienda typography declarations');
  assert.deepEqual(
    sizes.filter(size => size.value < 12),
    [],
    'Hacienda operational labels, tables and SVG text cannot fall below 12px',
  );
});

test('Hacienda capability preflight redirects denied or malformed clients before every private contract', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'DEMO' },
    { name: 'malformed authoritative projection', malformedProjection: true },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await authenticatedContext(browser, {
        width: 390,
        height: 844,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`${baseUrl}/inicio.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(75);
      assert.deepEqual(requestLog, [], `${scenario.name} must issue zero private requests`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('Hacienda renders released compensation and global quality on desktop, mobile and print', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const releasedRows = PROJECTIONS.executive.compensation.series.filter(
    row => row.privacyStatus === 'released',
  );
  const suppressedRows = PROJECTIONS.executive.compensation.series.filter(
    row => row.privacyStatus !== 'released',
  );
  const releasedCloseRows = PROJECTIONS.close.series.filter(
    row => row.privacyStatus === 'released',
  );
  const latestClose = releasedCloseRows.at(-1);

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const viewports = [
    { name: 'desktop-dark', width: 1440, height: 1000, reducedMotion: 'no-preference', theme: 'dark', versionedTheme: 'dark', legacyTheme: 'light' },
    { name: 'desktop-light', width: 1440, height: 1000, reducedMotion: 'no-preference', theme: 'light', versionedTheme: 'light', legacyTheme: 'dark' },
    { name: 'mobile-dark', width: 390, height: 844, reducedMotion: 'reduce', theme: 'dark', versionedTheme: 'dark', legacyTheme: 'light' },
    { name: 'mobile-light', width: 390, height: 844, reducedMotion: 'reduce', theme: 'light', versionedTheme: 'light', legacyTheme: 'dark' },
  ];
  for (const viewport of viewports) {
    const context = await authenticatedContext(browser, viewport);
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const externalRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
    });

    await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
    const result = await page.evaluate(() => ({
      dataHidden: document.querySelector('#haciendaDataViews')?.hidden,
      errorHidden: document.querySelector('#loadError')?.hidden,
      source: document.querySelector('#topbarSourceText')?.textContent.trim(),
      sourceFile: document.querySelector('#sourceFile')?.textContent.trim(),
      sourceHash: document.querySelector('#sourceHash')?.textContent.trim(),
      published: document.querySelector('#periodCountChip')?.textContent.trim(),
      protectedCount: document.querySelector('#protectedPeriodChip')?.textContent.trim(),
      protectedNote: document.querySelector('#protectedPeriodsNote')?.textContent.trim(),
      quality: document.querySelector('#equationGross')?.textContent.trim(),
      reconciliation: document.querySelector('#kpiReconciliation')?.textContent.trim(),
      reconciliationNote: document.querySelector('#kpiReconciliationNote')?.textContent.trim(),
      kpiGross: document.querySelector('#kpiGross')?.textContent.trim(),
      tableRows: document.querySelectorAll('#periodRows tr').length,
      qualityBars: document.querySelectorAll('#compositionBars [role="progressbar"]').length,
      chartPaths: document.querySelectorAll('#payrollChart path').length,
      chartCircles: document.querySelectorAll('#payrollChart circle').length,
      closeOptions: document.querySelectorAll('#closePeriodSelect option').length,
      closeYearGroups: document.querySelectorAll('#closePeriodSelect optgroup').length,
      closeSelected: document.querySelector('#closePeriodSelect')?.value,
      closeBars: document.querySelectorAll('#closeBridge rect').length,
      closeViewBoxWidth: Number(document.querySelector('#closeBridge svg')?.getAttribute('viewBox')?.split(' ')[2]),
      closeLabelHeight: document.querySelector('#closeBridge svg text:last-of-type')?.getBoundingClientRect().height,
      closeParticipants: document.querySelector('#closeParticipants')?.textContent.trim(),
      closeCoverage: document.querySelector('#closeCoverage')?.textContent.trim(),
      closeExactRate: document.querySelector('#closeExactRate')?.textContent.trim(),
      closeValueAgreement: document.querySelector('#closeValueAgreement')?.textContent.trim(),
      closeDeltas: document.querySelectorAll('#closeDeltaList .hac-close-delta').length,
      closeCopy: document.querySelector('#closeReconciliationCopy')?.textContent.trim(),
      pageText: document.querySelector('#haciendaDataViews')?.innerText || '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      palette: (() => {
        const style = getComputedStyle(document.documentElement);
        return Object.fromEntries(['bg', 'surface', 'surface-raised', 'muted', 'border'].map(name => [
          name,
          style.getPropertyValue(`--hac-${name}`).trim(),
        ]));
      })(),
      fontFloorFailures: Array.from(document.querySelectorAll('.hac-topbar *, #haciendaDashboard *'))
        .filter(node => {
          const style = getComputedStyle(node);
          const hasOwnText = Array.from(node.childNodes).some(child =>
            child.nodeType === Node.TEXT_NODE && child.textContent.trim()
          );
          return (hasOwnText || node instanceof SVGTextElement) && node.getClientRects().length > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.fontSize) < 12;
        })
        .slice(0, 12)
        .map(node => ({
          selector: `${node.tagName.toLowerCase()}.${node.className?.baseVal || node.className || ''}`,
          size: getComputedStyle(node).fontSize,
          text: node.textContent.trim().slice(0, 60),
        })),
    }));
    const renderedTheme = await readRenderedThemeAudit(page);

    assert.equal(result.dataHidden, false);
    assert.equal(result.errorHidden, true);
    assert.match(result.source, /GRH.*proyecciones conciliadas.*calidad/i);
    assert.equal(result.sourceFile, PROJECTIONS.executive.source.sourceFile);
    assert.equal(result.sourceHash, PROJECTIONS.executive.source.sourceSha256);
    assert.equal(result.published, releasedRows.length.toLocaleString('es-AR'));
    assert.equal(result.protectedCount, suppressedRows.length.toLocaleString('es-AR'));
    assert.match(result.protectedNote, new RegExp(`${suppressedRows.length} períodos.*k=10.*omiten`, 'i'));
    assert.equal(result.quality, '88,99/100');
    assert.equal(result.reconciliation, '63,9%');
    assert.match(result.reconciliationNote, /Global.*acuerdo de valores.*no certifica pago/i);
    assert.match(result.kpiGross, /^ARS\s/);
    assert.equal(result.tableRows, Math.min(10, releasedRows.length));
    assert.equal(result.qualityBars, 4);
    assert.equal(result.chartPaths, 3);
    assert.equal(result.chartCircles, Math.min(12, releasedRows.length) * 3);
    assert.equal(result.closeOptions, releasedCloseRows.length);
    assert.equal(result.closeYearGroups, new Set(releasedCloseRows.map(row => row.period.slice(0, 4))).size);
    assert.equal(result.closeSelected, latestClose.period);
    assert.equal(result.closeBars, 5);
    assert.ok(result.closeViewBoxWidth <= Math.min(760, viewport.width - 56) + 1);
    assert.ok(result.closeLabelHeight >= 7, `${viewport.name} close chart labels must remain legible`);
    assert.equal(result.closeParticipants, latestClose.participantCount.toLocaleString('es-AR'));
    assert.equal(result.closeCoverage, `${latestClose.reconciliation.runCoveragePct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeExactRate, `${latestClose.reconciliation.metricExactRatePct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeValueAgreement, `${latestClose.reconciliation.valueAgreementPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeDeltas, PROJECTIONS.close.comparison.status === 'released' ? 9 : 0);
    assert.match(result.closeCopy, /No reutiliza el score global/i);
    assert.equal(result.pageText.includes('<10'), false);
    for (const row of suppressedRows) {
      if (row.period) assert.equal(result.pageText.includes(row.period), false);
    }
    assert.equal(result.theme, viewport.theme);
    assertRenderedThemeAudit(renderedTheme, viewport.theme, viewport.name);
    assert.deepEqual(result.fontFloorFailures, [], `${viewport.name} must render operational text at 12px or larger`);
    for (const background of ['bg', 'surface', 'surface-raised']) {
      assert.ok(
        contrastRatio(result.palette.muted, result.palette[background]) >= 4.5,
        `${viewport.name} muted text must meet AA against ${background}`,
      );
      assert.ok(
        contrastRatio(result.palette.border, result.palette[background]) >= 3,
        `${viewport.name} borders must meet non-text AA against ${background}`,
      );
    }
    assert.equal(result.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    if (process.env.HACIENDA_CAPTURE === '1') {
      await page.screenshot({
        path: path.join(tmpdir(), `hacienda-legibility-${viewport.name}.png`),
        fullPage: true,
      });
    }

    const oppositeTheme = viewport.theme === 'dark' ? 'light' : 'dark';
    await page.locator('#themeToggleBtn').click();
    await page.waitForFunction(expected => (
      document.documentElement.dataset.theme === expected &&
      localStorage.getItem('municontrol-color-theme:v1') === expected &&
      localStorage.getItem('govtech_theme') === expected
    ), oppositeTheme);
    const immediateTheme = await page.evaluate(() => ({
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      metaTheme: document.querySelector('meta[name="theme-color"]')?.content,
      preference: document.querySelector('#themeToggleBtn')?.dataset.themePreference,
      resolved: document.querySelector('#themeToggleBtn')?.dataset.themeResolved,
    }));
    assert.equal(immediateTheme.colorScheme, oppositeTheme, `${viewport.name} color-scheme`);
    assert.equal(immediateTheme.preference, oppositeTheme, `${viewport.name} button preference`);
    assert.equal(immediateTheme.resolved, oppositeTheme, `${viewport.name} button resolved theme`);
    assert.equal(immediateTheme.metaTheme, oppositeTheme === 'light' ? '#f0f4ff' : '#060b18');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
    assertRenderedThemeAudit(
      await readRenderedThemeAudit(page),
      oppositeTheme,
      `${viewport.name}-reload`,
    );

    const previousClose = releasedCloseRows.at(-2);
    await page.selectOption('#closePeriodSelect', previousClose.period);
    await page.waitForFunction(expected =>
      document.querySelector('#closeValueAgreement')?.textContent.trim() === expected,
    `${previousClose.reconciliation.valueAgreementPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.match(
      await page.locator('#closeBridgeCaption').textContent(),
      new RegExp(previousClose.period.slice(0, 4)),
    );

    await page.selectOption('#periodRange', '24');
    await page.waitForFunction(expected =>
      document.querySelectorAll('#payrollChart circle').length === expected,
    Math.min(24, releasedRows.length) * 3);

    await page.emulateMedia({ media: 'print' });
    const printState = await page.evaluate(() => ({
      dataVisible: getComputedStyle(document.querySelector('#haciendaDataViews')).display !== 'none',
      sidebarHidden: getComputedStyle(document.querySelector('#sidebar')).display === 'none',
      simulatorHidden: getComputedStyle(document.querySelector('.hac-simulator')).display === 'none',
      sourceVisible: document.querySelector('#sourceHash')?.getClientRects().length > 0,
    }));
    assert.deepEqual(printState, {
      dataVisible: true,
      sidebarHidden: true,
      simulatorHidden: true,
      sourceVisible: true,
    });
    await context.close();
  }

  assert.equal(requestLog.length, viewports.length * 6);
  assert.deepEqual(
    requestLog.map(item => item.contract).sort(),
    viewports.flatMap(() => ['close', 'executive', 'quality', 'close', 'executive', 'quality']).sort(),
  );
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
});

test('Hacienda fails closed and retries when the monthly close projection returns 503', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { failContract: 'close' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await authenticatedContext(browser, {
    width: 390,
    height: 844,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#haciendaDataViews')?.hidden,
    kpiVisible: document.querySelector('#kpiGross')?.getClientRects().length > 0,
    errorHidden: document.querySelector('#loadError')?.hidden,
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
    source: document.querySelector('#topbarSourceText')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  assert.equal(result.dataHidden, true);
  assert.equal(result.kpiVisible, false);
  assert.equal(result.errorHidden, false);
  assert.match(result.error, /No se muestran datos parciales, antiguos ni simulados/i);
  assert.doesNotMatch(result.error, /grh-data|profile|semantic/i);
  assert.match(result.source, /proyecciones GRH no disponibles/i);
  assert.ok(result.overflow <= 1);
  assert.ok(
    consoleErrors.every(message => /503|Service Unavailable/i.test(message)),
    `only the expected 503 browser diagnostic is allowed: ${consoleErrors.join(' | ')}`,
  );
  assert.deepEqual(pageErrors, []);

  const requestsBeforeRetry = requestLog.length;
  const retryResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/grh-close' && response.status() === 503
  );
  await page.click('#retryLoad');
  await retryResponse;
  await page.waitForSelector('#loadError:not([hidden])');
  assert.ok(requestLog.length > requestsBeforeRetry);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});
