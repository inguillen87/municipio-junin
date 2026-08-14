import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';
import { buildGrhAbsenceInsightsProjection } from '../api/lib/grh-absence-insights-projection.js';
import { buildGrhAdministrationComparisonProjection } from '../api/lib/grh-administration-comparison-projection.js';
import { buildGrhDecisionBriefProjection } from '../api/lib/grh-decision-brief-projection.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';
import accessPolicy from '../shared/access-policy.cjs';

const { ACCESS_POLICY_VERSION, getSessionAccessForUser } = accessPolicy;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAS_PRIVATE_GRH = ['profile', 'semantic'].every(name =>
  existsSync(path.join(REPO, 'api', '_data', `grh-${name}.json`))
);
const PROJECTIONS = HAS_PRIVATE_GRH ? await (async () => {
  const [profile, semantic, absenceArtifact] = await Promise.all([
    readFile(path.join(REPO, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
    readFile(path.join(REPO, 'api', '_data', 'grh-semantic.json'), 'utf8').then(JSON.parse),
    readFile(path.join(REPO, 'api', '_data', 'grh-absence-insights.json'), 'utf8').then(JSON.parse),
  ]);
  const executive = buildGrhExecutiveProjection(semantic, { audience: 'interactive' });
  const quality = buildGrhQualityProjection(profile, semantic);
  const close = buildGrhCloseProjection(semantic);
  const administration = buildGrhAdministrationComparisonProjection({
    source: {
      schemaVersion: 'grh-directory-v3',
      canonicalSystem: executive.source.canonicalSystem,
      sourceSha256: executive.source.sourceSha256,
      contentSha256: 'a'.repeat(64),
      snapshotAsOf: executive.source.snapshotAsOf,
      recordCount: 2449,
      absenceEventCount: 31553,
    },
    identity: {
      materializedPeople: 2449,
      uniquePeople: 2449,
      employmentPeople: 2449,
      digestedPeople: 2449,
      materializedAbsenceEvents: 31553,
    },
    current: {
      eventRows: 5936,
      distinctPeople: 752,
      reportedDays: 65847,
      knownEventRows: 5936,
      missingEventRows: 0,
      reportedIngressDates: 281,
      reportedExitDates: 232,
    },
    prior: {
      eventRows: 3395,
      distinctPeople: 662,
      reportedDays: 52190,
      knownEventRows: 3395,
      missingEventRows: 0,
      reportedIngressDates: 216,
      reportedExitDates: 173,
    },
  }, { audience: 'portable' });
  return {
    executive,
    quality,
    close,
    absence: buildGrhAbsenceInsightsProjection(absenceArtifact, {
      expectedSourceSha256: executive.source.sourceSha256,
    }),
    decision: buildGrhDecisionBriefProjection(executive, quality, close),
    administration,
    employment: {
      schemaVersion: 'grh-employment-review-v2',
      source: {
        canonicalSystem: executive.source.canonicalSystem,
        sourceSha256: executive.source.sourceSha256,
        snapshotAsOf: executive.source.snapshotAsOf,
      },
      audience: 'private',
      referencePeriod: executive.workforce.referencePeriod,
      totalDirectoryPeople: 2449,
      reportedCurrentPeople: 867,
      reportedEndedPeople: 1560,
      uncertainPeople: 22,
      referencePayrollParticipants: 856,
      reportedCurrentWithReferencePayroll: 848,
      currentWithoutPayroll: 19,
      endedWithPayroll: 7,
      uncertainWithPayroll: 1,
      totalToReview: 27,
      privacyStatus: 'released',
      categories: [
        {
          key: 'reported_current_without_reference_payroll',
          label: 'Sin participación en el cálculo del mes',
          meaning: 'El legajo no informa egreso al corte, pero no aparece en el cálculo de referencia.',
          count: 19, display: '19', privacyStatus: 'released',
        },
        {
          key: 'reported_ended_with_reference_payroll',
          label: 'Con egreso informado y participación en el cálculo',
          meaning: 'El legajo informa egreso al corte y también aparece en el cálculo de referencia.',
          count: 7, display: '7', privacyStatus: 'released',
        },
        {
          key: 'uncertain_status_with_reference_payroll',
          label: 'Con fechas a revisar y participación en el cálculo',
          meaning: 'Las fechas del legajo no permiten determinar la situación informada y la persona aparece en el cálculo de referencia.',
          count: 1, display: '1', privacyStatus: 'released',
        },
      ],
    },
  };
})() : null;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-index',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

function projectedUser(role = 'INTENDENTE', tenantId = 'tenant-junin-test') {
  const base = {
    id: `qa-index-${role.toLowerCase()}`,
    name: `${role} QA`,
    email: `${role.toLowerCase()}@qa.invalid`,
    role,
    tenantId,
    tenant: tenantId ? { id: tenantId, name: 'Municipio QA', shortName: 'QA' } : null,
  };
  const access = getSessionAccessForUser(base);
  assert.ok(access, `expected a governed session projection for ${role}`);
  return {
    ...base,
    capabilities: [...access.capabilities],
    accessPolicyVersion: ACCESS_POLICY_VERSION,
    homeProfile: {
      variant: access.homeProfile.variant,
      defaultPath: access.homeProfile.defaultPath,
      priorityCapabilities: [...access.homeProfile.priorityCapabilities],
    },
  };
}

function projectedUserWithout(...deniedCapabilities) {
  const user = projectedUser('INTENDENTE');
  const denied = new Set(deniedCapabilities);
  return {
    ...user,
    capabilities: user.capabilities.filter(capability => !denied.has(capability)),
    homeProfile: {
      ...user.homeProfile,
      priorityCapabilities: user.homeProfile.priorityCapabilities
        .filter(capability => !denied.has(capability)),
    },
  };
}

function contrastRatio(foreground, background) {
  const luminance = value => {
    const channels = String(value).match(/[\d.]+/g)?.slice(0, 3).map(Number);
    assert.equal(channels?.length, 3, `expected an RGB color, received ${value}`);
    const linear = channels.map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function parseCssRgba(value) {
  const channels = String(value).match(/[\d.]+/g)?.map(Number);
  assert.ok(channels && channels.length >= 3, `expected CSS rgb/rgba color, received ${value}`);
  return {
    red: channels[0],
    green: channels[1],
    blue: channels[2],
    alpha: channels.length >= 4 ? channels[3] : 1,
  };
}

function compositeCssColor(foreground, background) {
  const front = parseCssRgba(foreground);
  const back = parseCssRgba(background);
  const alpha = front.alpha + back.alpha * (1 - front.alpha);
  assert.ok(alpha > 0, 'composited background must be visible');
  const channel = (frontValue, backValue) =>
    Math.round((frontValue * front.alpha + backValue * back.alpha * (1 - front.alpha)) / alpha);
  return `rgb(${channel(front.red, back.red)}, ${channel(front.green, back.green)}, ${channel(front.blue, back.blue)})`;
}

function cloneProjection(value) {
  return JSON.parse(JSON.stringify(value));
}

function suppressCloseRow(close, period) {
  const row = close.series.find(item => item.period === period);
  assert.ok(row, `expected close row ${period}`);
  row.participantCount = null;
  row.participantDisplay = '<10';
  row.privacyStatus = 'suppressed';
  for (const group of [row.components, row.control, row.reconciliation]) {
    for (const key of Object.keys(group)) group[key] = null;
  }
}

function protectCloseComparison(close) {
  close.comparison.status = 'unavailable';
  close.comparison.reason = 'privacy_protected';
  close.comparison.participantDelta = null;
  for (const group of [close.comparison.componentDeltas, close.comparison.reconciliationDeltas]) {
    for (const key of Object.keys(group)) group[key] = null;
  }
}

function protectedCloseProjection({ current }) {
  const close = cloneProjection(PROJECTIONS.close);
  suppressCloseRow(
    close,
    current ? close.source.latestValidCalculationPeriod : close.comparison.previousPeriod,
  );
  protectCloseComparison(close);
  return close;
}

function protectedDecisionProjection({ current }) {
  const decision = cloneProjection(PROJECTIONS.decision);
  decision.change.status = 'privacy_protected';
  decision.change.participantDelta = null;
  decision.change.runCoverageDeltaPctPoints = null;
  decision.change.metricExactRateDeltaPctPoints = null;
  decision.change.valueAgreementDeltaPctPoints = null;
  if (current) {
    decision.situation.participantCount = null;
    decision.situation.participantDisplay = '<10';
    decision.situation.runCoveragePct = null;
    decision.situation.metricExactRatePct = null;
    decision.situation.valueAgreementPct = null;
    decision.situation.identityWithinRoundingTolerance = null;
  }
  return decision;
}

function reconciledQualityProjection() {
  const quality = cloneProjection(PROJECTIONS.quality);
  const reconciliation = quality.reconciliation;
  reconciliation.status = 'reconciled';
  reconciliation.totpagoRuns = reconciliation.calculationRuns;
  reconciliation.unionRuns = reconciliation.calculationRuns;
  reconciliation.matchedRuns = reconciliation.calculationRuns;
  reconciliation.fullyReconciledRuns = reconciliation.calculationRuns;
  reconciliation.runCoveragePct = 100;
  reconciliation.metricExactRatePct = 100;
  reconciliation.valueAgreementPct = 100;
  reconciliation.scorePct = 100;
  reconciliation.absoluteVarianceCents = 0;
  quality.quality.risks.totpagoCrossSourceMismatch = false;
  return quality;
}

function reconciledDecisionProjection() {
  const decision = cloneProjection(PROJECTIONS.decision);
  decision.status = 'review_recommended';
  decision.priorities = decision.priorities.filter(priority =>
    priority.code !== 'cross_source_material_difference'
  );
  return decision;
}

async function createServer(requestLog, options = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const governedContracts = {
      '/api/grh-executive': 'executive',
      '/api/grh-quality': 'quality',
      '/api/grh-close': 'close',
      '/api/grh-decision-brief': 'decision',
      '/api/grh-employment-review': 'employment',
      '/api/grh-administration-comparison': 'administration',
      '/api/grh-absence-insights': 'absence',
    };
    const contract = governedContracts[url.pathname];
    if (contract) {
      requestLog.push({
        contract,
        pathname: url.pathname,
        requestTarget: request.url,
        authorization: request.headers.authorization || '',
      });
      if (options[`${contract}Unavailable`]) {
        response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: `${contract} projection unavailable` }));
        return;
      }
      let payload = PROJECTIONS[contract];
      if (options.currentCloseProtected) {
        if (contract === 'close') payload = protectedCloseProjection({ current: true });
        if (contract === 'decision') payload = protectedDecisionProjection({ current: true });
      }
      if (options.previousCloseProtected) {
        if (contract === 'close') payload = protectedCloseProjection({ current: false });
        if (contract === 'decision') payload = protectedDecisionProjection({ current: false });
      }
      if (options.globalReconciled) {
        if (contract === 'quality') payload = reconciledQualityProjection();
        if (contract === 'decision') payload = reconciledDecisionProjection();
      }
      if (contract === 'employment' && options.employmentPortable) {
        payload = cloneProjection(payload);
        payload.audience = 'portable';
        payload.privacyStatus = 'partially_protected';
        payload.endedWithPayroll = null;
        payload.uncertainWithPayroll = null;
        payload.categories.slice(1).forEach(row => {
          row.count = null;
          row.display = 'Detalle protegido';
          row.privacyStatus = 'protected';
        });
      }
      if (contract === 'administration' && options.administrationProtected) {
        payload = cloneProjection(payload);
        payload.privacy.status = 'partially_protected';
        payload.comparison.reportedIngressDates.privacyStatus = 'protected';
        payload.comparison.reportedIngressDates.values = { current: null, prior: null, difference: null };
      }
      if (contract === 'close' && options.closeSourceMismatch) {
        payload = cloneProjection(payload);
        payload.source.sourceSha256 = 'f'.repeat(64);
      }
      if (contract === 'decision' && (options.decisionSourceMismatch || options.decisionMalformed || options.decisionUnknownEnum)) {
        payload = cloneProjection(payload);
        if (options.decisionSourceMismatch) payload.source.sourceSha256 = 'f'.repeat(64);
        if (options.decisionMalformed) payload.situation.unexpectedEmployeeField = 'forbidden';
        if (options.decisionUnknownEnum) payload.priorities[0].code = 'automatic_action';
      }
      const contractVersions = {
        executive: 'grh-executive-v2',
        quality: 'grh-quality-v1',
        close: 'grh-close-v1',
        decision: options.decisionContractMismatch ? 'grh-decision-brief-v0' : 'grh-decision-brief-v1',
        employment: options.employmentContractMismatch ? 'grh-employment-review-v0' : 'grh-employment-review-v2',
        administration: options.administrationContractMismatch ? 'grh-administration-comparison-v0' : 'grh-administration-comparison-v1',
        absence: options.absenceContractMismatch ? 'grh-absence-insights-v0' : 'grh-absence-insights-v1',
      };
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
        'X-MuniControl-Contract': contractVersions[contract],
      });
      response.end(JSON.stringify(payload));
      return;
    }
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        user: options.authUser || projectedUser(),
      }));
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
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function seedSession(context) {
  await context.addInitScript(({ token }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'qa-index', name: 'Intendencia QA', role: 'INTENDENTE', tenantId: 'tenant-junin-test',
    }));
  }, { token: fakeBrowserToken() });
}

test('main executive dashboard renders only source-backed GRH contracts', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000, reducedMotion: 'no-preference' },
    { name: 'mobile', width: 390, height: 844, reducedMotion: 'reduce' },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: viewport.reducedMotion });
    await seedSession(context);
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    const rawContractRequests = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
      const pathname = new URL(request.url()).pathname;
      if (/\/api\/(?:grh-data|.*profile|.*semantic)/i.test(pathname)) rawContractRequests.push(pathname);
    });

    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#executiveDashboard[aria-busy="false"]');
    const result = await page.evaluate(() => ({
      snapshot: document.querySelector('#snapshotChip')?.textContent.trim(),
      participants: document.querySelector('#kpiParticipants')?.textContent.trim(),
      participantsNote: document.querySelector('#kpiParticipantsNote')?.textContent.trim(),
      quality: document.querySelector('#kpiQuality')?.textContent.trim(),
      qualityNote: document.querySelector('#kpiQualityNote')?.textContent.trim(),
      comparisonStatus: document.querySelector('#kpiCrossStatus')?.textContent.trim(),
      comparisonStatusNote: document.querySelector('#kpiCrossStatusNote')?.textContent.trim(),
      cross: document.querySelector('#kpiCrossScore')?.textContent.trim(),
      agreement: document.querySelector('#kpiAgreement')?.textContent.trim(),
      coverage: document.querySelector('#kpiCoverage')?.textContent.trim(),
      rows: document.querySelector('#kpiRows')?.textContent.trim(),
      rowsNote: document.querySelector('#kpiRowsNote')?.textContent.trim(),
      rowsContext: document.querySelector('#kpiRowsContext')?.textContent.trim(),
      controlDetailsOpen: document.querySelector('#sourceControlDetails')?.open,
      controlDetailsSummary: document.querySelector('#sourceControlDetails summary')?.textContent.trim(),
      technicalDetailVisible: document.querySelector('.exec-control-details-body')?.getClientRects().length > 0,
      controlCtas: Array.from(document.querySelectorAll('#sourceControlDetails .exec-control-action:not([hidden])')).map(node => ({
        href: node.getAttribute('href'),
        text: node.textContent.trim(),
      })),
      employmentTotal: document.querySelector('#employmentReviewTotal')?.textContent.trim(),
      employmentTitle: document.querySelector('#employmentReviewTitle')?.textContent.trim(),
      employmentPeriod: document.querySelector('#employmentReviewPeriod')?.textContent.trim(),
      employmentHeadline: document.querySelector('#employmentReviewHeadline')?.textContent.replace(/\s+/g, ' ').trim(),
      employmentCurrent: document.querySelector('#employmentReviewCurrent')?.textContent.trim(),
      employmentMatched: document.querySelector('#employmentReviewMatched')?.textContent.trim(),
      employmentPayroll: document.querySelector('#employmentReviewPayroll')?.textContent.trim(),
      employmentPayrollNote: document.querySelector('#employmentReviewPayrollNote')?.textContent.replace(/\s+/g, ' ').trim(),
      employmentCategories: Array.from(document.querySelectorAll('#employmentReviewCategories strong')).map(node => node.textContent.trim()),
      employmentStatus: document.querySelector('#employmentReviewStatus')?.textContent.replace(/\s+/g, ' ').trim(),
      employmentTechnicalOpen: document.querySelector('#employmentReviewTechnical')?.open,
      employmentTechnicalVisible: document.querySelector('#employmentReviewTechnical > div')?.getClientRects().length > 0,
      employmentCta: document.querySelector('#employmentReviewCta:not([hidden])')?.getAttribute('href') || null,
      administrationContract: document.querySelector('#administrationComparison')?.dataset.contract,
      administrationThreshold: document.querySelector('#administrationComparison')?.dataset.privacyThreshold,
      administrationHeadline: document.querySelector('#administrationComparisonHeadline')?.textContent.replace(/\s+/g, ' ').trim(),
      administrationDays: document.querySelector('#administrationComparisonDays')?.textContent.trim(),
      administrationCurrentDates: document.querySelector('#administrationCurrentDates')?.textContent.trim(),
      administrationPriorDates: document.querySelector('#administrationPriorDates')?.textContent.trim(),
      administrationRows: Array.from(document.querySelectorAll('#administrationComparisonMetrics .exec-administration-row')).map(row => ({
        label: row.querySelector('dt strong')?.textContent.trim(),
        meaning: row.querySelector('dt span')?.textContent.replace(/\s+/g, ' ').trim(),
        values: Array.from(row.querySelectorAll('dd')).map(node => node.textContent.trim()),
      })),
      administrationAdditionalRows: Array.from(document.querySelectorAll('#administrationComparisonAdditionalMetrics .exec-administration-row')).map(row => ({
        label: row.querySelector('dt strong')?.textContent.trim(),
        meaning: row.querySelector('dt span')?.textContent.replace(/\s+/g, ' ').trim(),
        values: Array.from(row.querySelectorAll('dd')).map(node => node.textContent.trim()),
      })),
      administrationStatus: document.querySelector('#administrationComparisonStatus')?.textContent.replace(/\s+/g, ' ').trim(),
      administrationCoverage: document.querySelector('#administrationComparisonCoverage')?.textContent.replace(/\s+/g, ' ').trim(),
      administrationTechnicalOpen: document.querySelector('#administrationComparisonTechnical')?.open,
      administrationTechnicalVisible: document.querySelector('#administrationComparisonTechnical div')?.getClientRects().length > 0,
      administrationCta: document.querySelector('#administrationComparisonCta:not([hidden])')?.getAttribute('href') || null,
      absenceContract: document.querySelector('#absenceInsights')?.dataset.contract,
      absenceTitle: document.querySelector('#absenceInsightsTitle')?.textContent.trim(),
      absenceTopRows: Array.from(document.querySelectorAll('#absenceInsightsCategories .exec-absence-reason')).map(row => ({
        label: row.querySelector('.exec-absence-reason-title strong')?.textContent.trim(),
        values: Array.from(row.querySelectorAll('.exec-absence-bar-line > strong')).map(node => node.textContent.trim()),
      })),
      absenceStatus: document.querySelector('#absenceInsightsStatus')?.textContent.replace(/\s+/g, ' ').trim(),
      absenceAllOpen: document.querySelector('#absenceInsightsAll')?.open,
      absenceAllVisible: document.querySelector('#absenceInsightsAll > div')?.getClientRects().length > 0,
      absenceAllRows: Array.from(document.querySelectorAll('#absenceInsightsAllCategories .exec-administration-row')).map(row => ({
        label: row.querySelector('dt strong')?.textContent.trim(),
        values: Array.from(row.querySelectorAll('dd')).map(node => node.textContent.trim()),
      })),
      absenceTechnicalOpen: document.querySelector('#absenceInsightsTechnical')?.open,
      absenceTechnicalVisible: document.querySelector('#absenceInsightsTechnical > div')?.getClientRects().length > 0,
      absenceText: document.querySelector('#absenceInsights')?.textContent.replace(/\s+/g, ' ').trim(),
      sourceCount: document.querySelector('#sourceCountChip')?.textContent.trim(),
      decisionTitle: document.querySelector('#decisionBriefTitle')?.textContent.trim(),
      decisionStatus: document.querySelector('#decisionBriefStatus')?.textContent.trim(),
      decisionBoundary: document.querySelector('#decisionBriefBoundary')?.textContent.trim(),
      decisionAgreement: document.querySelector('#decisionAgreement')?.textContent.trim(),
      decisionChange: document.querySelector('#decisionChange')?.textContent.trim(),
      decisionQuality: document.querySelector('#decisionQuality')?.textContent.trim(),
      decisionQualityNote: document.querySelector('#decisionQualityNote')?.textContent.trim(),
      decisionPriorityCount: document.querySelectorAll('#decisionPriorities .exec-decision-priority').length,
      decisionPriorityTitles: Array.from(document.querySelectorAll('#decisionPriorities .exec-decision-priority strong')).map(node => node.textContent.trim()),
      decisionCtas: Array.from(document.querySelectorAll('#decisionPriorities .exec-decision-cta')).map(node => node.getAttribute('href')),
      decisionText: document.querySelector('#decisionBrief')?.textContent.replace(/\s+/g, ' ').trim(),
      decisionTop: document.querySelector('#decisionBrief')?.getBoundingClientRect().top,
      decisionContract: document.querySelector('#decisionBrief')?.dataset.contract,
      decisionLabelledBy: document.querySelector('#decisionBrief')?.getAttribute('aria-labelledby'),
      decisionDescribedBy: document.querySelector('#decisionBrief')?.getAttribute('aria-describedby'),
      decisionStatusRole: document.querySelector('#decisionBriefStatus')?.getAttribute('role'),
      decisionEvidenceTag: document.querySelector('.exec-decision-evidence')?.tagName,
      decisionPriorityTag: document.querySelector('#decisionPriorities')?.tagName,
      decisionEyebrowColor: getComputedStyle(document.querySelector('.exec-decision-eyebrow')).color,
      decisionHeadlineColor: getComputedStyle(document.querySelector('.exec-decision-headline')).color,
      theme: document.documentElement.getAttribute('data-theme'),
      decisionAnimationDuration: getComputedStyle(document.querySelector('.exec-decision-priority')).animationDuration,
      closePrivacy: document.querySelector('#monthlyCloseBrief')?.dataset.privacyThreshold,
      closeTitle: document.querySelector('#monthlyCloseTitle')?.textContent.trim(),
      closeSummary: document.querySelector('.exec-close-summary')?.textContent.replace(/\s+/g, ' ').trim(),
      closePeriod: document.querySelector('#closePeriodBadge')?.textContent.trim(),
      closeParticipants: document.querySelector('#closeParticipants')?.textContent.trim(),
      closeControl: document.querySelector('#closeControlStatus')?.textContent.trim(),
      closeControlNote: document.querySelector('#closeControlNote')?.textContent.trim(),
      closeCoverage: document.querySelector('#closeCoverage')?.textContent.trim(),
      closeExactness: document.querySelector('#closeExactness')?.textContent.trim(),
      closeAgreement: document.querySelector('#closeAgreement')?.textContent.trim(),
      closeComparison: document.querySelector('#closeComparisonTitle')?.textContent.trim(),
      closeParticipantDelta: document.querySelector('#closeParticipantDelta')?.textContent.trim(),
      closeCoverageDelta: document.querySelector('#closeCoverageDelta')?.textContent.trim(),
      closeExactnessDelta: document.querySelector('#closeExactnessDelta')?.textContent.trim(),
      closeAgreementDelta: document.querySelector('#closeAgreementDelta')?.textContent.trim(),
      closeBriefText: document.querySelector('#monthlyCloseBrief')?.textContent.replace(/\s+/g, ' ').trim(),
      closeTechnicalOpen: document.querySelector('.exec-close-technical')?.open,
      closeTechnicalVisible: document.querySelector('.exec-close-technical-grid')?.getClientRects().length > 0,
      analyticsOpen: document.querySelector('#analyticsExploration')?.open,
      analyticsSummary: document.querySelector('#analyticsExploration > summary')?.textContent.trim(),
      analyticsSummaryHeight: document.querySelector('#analyticsExploration > summary')?.getBoundingClientRect().height,
      analyticsVisible: document.querySelector('#analyticsExplorationBody')?.getClientRects().length > 0,
      chartVisible: document.querySelector('#calculationChart')?.getClientRects().length > 0,
      dataOriginOpen: document.querySelector('#dataOriginDetails')?.open,
      dataOriginSummary: document.querySelector('#dataOriginDetails > summary')?.textContent.trim(),
      dataOriginSummaryHeight: document.querySelector('#dataOriginDetails > summary')?.getBoundingClientRect().height,
      dataOriginVisible: document.querySelector('#dataOriginDetailsBody')?.getClientRects().length > 0,
      sourceListVisible: document.querySelector('#sourceList')?.getClientRects().length > 0,
      globalLabels: Array.from(document.querySelectorAll('.exec-stat-label')).map(node => node.textContent.trim()),
      kpiCount: document.querySelectorAll('.exec-stat').length,
      chartCount: document.querySelectorAll('#calculationChart svg').length,
      costRows: document.querySelectorAll('#costCenterRanks .exec-rank-item').length,
      sectorRows: document.querySelectorAll('#sectorRanks .exec-rank-item').length,
      costProtected: document.querySelector('#costCenterRanks [data-privacy-status="protected_aggregate"] .exec-rank-label')?.textContent.trim(),
      sectorProtected: document.querySelector('#sectorRanks [data-privacy-status="protected_aggregate"] .exec-rank-label')?.textContent.trim(),
      sourceTitles: Array.from(document.querySelectorAll('#sourceList .exec-source-row strong')).map(node => node.textContent.trim()),
      sourceText: document.querySelector('#sourceList')?.textContent.replace(/\s+/g, ' ').trim(),
      defaultText: document.querySelector('#dataViews')?.innerText.replace(/\s+/g, ' ').trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorVisible: !document.querySelector('#loadError')?.hidden,
    }));

    assert.equal(result.snapshot, '6 ago 2026');
    assert.equal(result.participants, '856');
    assert.equal(result.participantsNote, 'Legajos que aparecen al menos una vez en los cálculos de jul 2026.');
    assert.equal(result.quality, '88,99 de 100');
    assert.equal(result.qualityNote, 'Combina fechas válidas, relación con legajos y comparación entre fuentes.');
    assert.equal(result.comparisonStatus, 'Requiere revisión');
    assert.match(result.comparisonStatusNote, /encontró diferencias.+antes de decidir/i);
    assert.equal(result.cross, '63,9%');
    assert.equal(result.agreement, '19,0%');
    assert.equal(result.coverage, '97,8%');
    assert.match(result.rows, /^6,57\sM$/);
    assert.equal(result.rowsNote, '6.573.057 registros · 257 tablas.');
    assert.equal(result.rowsContext, 'Respaldo del 6 ago 2026');
    assert.equal(result.controlDetailsOpen, false);
    assert.equal(result.controlDetailsSummary, 'Cómo se controlaron los datos');
    assert.equal(result.technicalDetailVisible, false, 'technical reconciliation metrics must stay collapsed by default');
    assert.deepEqual(result.controlCtas, [
      { href: '/calidad', text: 'Abrir Calidad de datos' },
      { href: '/hacienda', text: 'Revisar en Hacienda' },
    ]);
    assert.equal(result.employmentTotal, '27');
    assert.equal(result.employmentTitle, '27 situaciones para confirmar');
    assert.equal(result.employmentPeriod, 'jul 2026');
    assert.equal(result.employmentHeadline, 'De 867 legajos sin egreso informado, 848 también aparecen en el cálculo de jul 2026.');
    assert.equal(result.employmentCurrent, '867');
    assert.equal(result.employmentMatched, '848');
    assert.equal(result.employmentPayroll, '856');
    assert.match(result.employmentPayrollNote, /848 coincidencias anteriores.+conviene confirmar/i);
    assert.deepEqual(result.employmentCategories, [
      '19 · Sin participación en el cálculo del mes',
      '7 · Con egreso informado y participación en el cálculo',
      '1 · Con fechas a revisar y participación en el cálculo',
    ]);
    assert.match(result.employmentStatus, /27.+orienta la revisión.+no reemplaza el legajo/i);
    assert.equal(result.employmentTechnicalOpen, false);
    assert.equal(result.employmentTechnicalVisible, false);
    assert.equal(result.employmentCta, '/rrhh#peopleDirectory');
    assert.equal(result.administrationContract, 'grh-administration-comparison-v1');
    assert.equal(result.administrationThreshold, '10');
    assert.match(result.administrationHeadline, /mismo tiempo transcurrido.+6 ago 2026/i);
    assert.equal(result.administrationDays, '972 días por período');
    assert.equal(result.administrationCurrentDates, '9 dic 2023 a 6 ago 2026');
    assert.equal(result.administrationPriorDates, '9 dic 2019 a 6 ago 2022');
    assert.deepEqual(result.administrationRows, [
      { label: 'Registros de ausencia', meaning: 'Registros de ausencia encontrados en cada período.', values: ['5.936', '3.395', '+2.541'] },
      { label: 'Personas distintas con ausencias', meaning: 'Personas diferentes con al menos un registro de ausencia.', values: ['752', '662', '+90'] },
      { label: 'Días informados en los registros', meaning: 'Suma de días informados; no son días laborables perdidos.', values: ['65.847', '52.190', '+13.657'] },
    ]);
    assert.deepEqual(result.administrationAdditionalRows, [
      { label: 'Fechas de ingreso informadas', meaning: 'Cuenta legajos cuya fecha de ingreso informada cae dentro de cada tramo; no prueba altas de personal.', values: ['281', '216', '+65'] },
      { label: 'Fechas de egreso informadas', meaning: 'Cuenta legajos cuya fecha de egreso informada cae dentro de cada tramo; no prueba bajas de personal.', values: ['232', '173', '+59'] },
    ]);
    assert.match(result.administrationStatus, /no califica una gestión ni explica causas/i);
    assert.equal(result.administrationCoverage, 'Todos los registros de ausencia de ambos períodos incluyen días informados.');
    assert.equal(result.administrationTechnicalOpen, false);
    assert.equal(result.administrationTechnicalVisible, false);
    assert.equal(result.administrationCta, '/estructura#novedades-historicas');
    assert.equal(result.absenceContract, 'grh-absence-insights-v1');
    assert.equal(result.absenceTitle, 'Motivos informados en los registros');
    assert.deepEqual(result.absenceTopRows, [
      { label: 'Descanso anual con régimen de riesgo', values: ['1.871 registros', '1.093 registros'] },
      { label: 'Descanso anual', values: ['1.478 registros', '1.252 registros'] },
      { label: 'Salud con familiar a cargo · antigüedad mayor a 5 años', values: ['677 registros', '237 registros'] },
      { label: 'Compensación de horas trabajadas', values: ['424 registros', '68 registros'] },
      { label: 'Razones particulares', values: ['418 registros', '182 registros'] },
      { label: 'Cuidado de familiar enfermo', values: ['231 registros', '102 registros'] },
      { label: 'Otros motivos', values: ['51 registros', '27 registros'] },
    ]);
    assert.match(result.absenceStatus, /motivos con más registros.+5\.936.+3\.395.+grupos pequeños.+Otros motivos/i);
    assert.equal(result.absenceAllOpen, false);
    assert.equal(result.absenceAllVisible, false);
    assert.equal(result.absenceAllRows.length, 11);
    assert.deepEqual(result.absenceAllRows.find(row => row.label === 'Fallecimiento de familiar')?.values, ['23', 'Protegido', 'Protegido']);
    assert.deepEqual(result.absenceAllRows.find(row => row.label === 'Períodos inactivos')?.values, ['Protegido', '11', 'Protegido']);
    assert.equal(result.absenceAllRows.flatMap(row => row.values).includes('0'), false, 'protected motives must never become false zeroes');
    assert.equal(result.absenceTechnicalOpen, false);
    assert.equal(result.absenceTechnicalVisible, false);
    assert.match(result.absenceText, /licencias.+otra fuente.+no reúne todas las ausencias/i);
    assert.match(result.absenceText, /días informados.+no equivale automáticamente a jornadas/i);
    assert.equal(result.sourceCount, '4/4');
    assert.equal(result.decisionTitle, 'Revisiones recomendadas');
    assert.equal(result.decisionStatus, 'Revisión prioritaria');
    assert.equal(result.decisionBoundary, 'Datos protegidos · respaldo del 6 ago 2026');
    assert.equal(result.decisionAgreement, '6,5%');
    assert.equal(result.decisionChange, '+5,8 pp');
    assert.equal(result.decisionQuality, '88,99 de 100');
    assert.match(result.decisionQualityNote, /combina fechas.+no mide cuánto.+completo/i);
    assert.equal(result.decisionPriorityCount, 3);
    assert.deepEqual(result.decisionPriorityTitles, [
      'Hay diferencias entre las dos fuentes',
      'Hay registros con fechas para revisar',
      'Los datos no se actualizan en tiempo real',
    ]);
    assert.deepEqual(result.decisionCtas, ['/hacienda', '/calidad']);
    assert.equal(result.decisionContract, 'grh-decision-brief-v1');
    assert.equal(result.decisionLabelledBy, 'decisionBriefTitle');
    assert.equal(result.decisionDescribedBy, 'decisionBriefHeadline');
    assert.equal(result.decisionStatusRole, 'status');
    assert.equal(result.decisionEvidenceTag, 'DL');
    assert.equal(result.decisionPriorityTag, 'OL');
    assert.equal(result.theme, 'dark');
    assert.ok(result.decisionTop >= 0 && result.decisionTop < viewport.height, `${viewport.name} decision brief heading must start above the fold`);
    assert.match(result.decisionText, /comparación entre las dos fuentes.+decisión administrativa/i);
    assert.doesNotMatch(result.decisionText, /(?:\$|\bARS\b|\bCBU\b|\bCUIL\b|\bDNI\b|nombre|apellido|companyCode|sourceCode|\blabel\b|concepto|u\. fuente|importe|responsable|plazo)/i);
    const conservativeDarkBackground = 'rgb(31, 25, 40)';
    assert.ok(
      contrastRatio(result.decisionEyebrowColor, conservativeDarkBackground) >= 4.5,
      `dark decision eyebrow contrast must pass AA: ${JSON.stringify(result)}`,
    );
    assert.ok(
      contrastRatio(result.decisionHeadlineColor, conservativeDarkBackground) >= 4.5,
      `dark decision headline contrast must pass AA: ${JSON.stringify(result)}`,
    );
    if (viewport.reducedMotion === 'reduce') assert.ok(
      Number.parseFloat(result.decisionAnimationDuration) <= 0.00001,
      `reduced motion must collapse decision animations: ${result.decisionAnimationDuration}`,
    );
    assert.equal(result.closePrivacy, '10');
    assert.equal(result.closeTitle, 'Qué muestran los cálculos de julio');
    assert.match(result.closeSummary, /último mes disponible.+no confirma pagos.+padrón de personal/i);
    assert.equal(result.closePeriod, 'jul 2026');
    assert.equal(result.closeParticipants, '856');
    assert.equal(result.closeControl, 'Dentro del margen esperado');
    assert.equal(result.closeControlNote, 'Las sumas no son idénticas, pero la diferencia está dentro del margen definido.');
    assert.equal(result.closeCoverage, '100,0%');
    assert.equal(result.closeExactness, '40,0%');
    assert.equal(result.closeAgreement, '6,5%');
    assert.equal(result.closeComparison, 'jun 2026 frente a jul 2026');
    assert.equal(result.closeParticipantDelta, '+1');
    assert.equal(result.closeCoverageDelta, '0,0 pp');
    assert.equal(result.closeExactnessDelta, '0,0 pp');
    assert.equal(result.closeAgreementDelta, '+5,8 pp');
    assert.deepEqual(result.globalLabels, [
      'Personas incluidas en el cálculo de julio',
      'Resultado de los controles de calidad',
      'Comparación entre las dos fuentes',
      'Base analizada',
    ]);
    assert.equal(result.closeTechnicalOpen, false);
    assert.equal(result.closeTechnicalVisible, false, 'monthly technical metrics must stay collapsed by default');
    assert.equal(result.analyticsOpen, false);
    assert.equal(result.analyticsSummary, 'Explorar tendencias y áreas');
    assert.ok(result.analyticsSummaryHeight >= 44, `${viewport.name} analytics disclosure target must be at least 44px tall`);
    assert.equal(result.analyticsVisible, false, 'trends and area rankings must stay collapsed by default');
    assert.equal(result.chartVisible, false, 'the trend chart must not lengthen the default mobile reading');
    assert.equal(result.dataOriginOpen, false);
    assert.equal(result.dataOriginSummary, 'Ver origen y límites de los datos');
    assert.ok(result.dataOriginSummaryHeight >= 44, `${viewport.name} data-origin disclosure target must be at least 44px tall`);
    assert.equal(result.dataOriginVisible, false, 'source, roadmap and definitions must stay collapsed by default');
    assert.equal(result.sourceListVisible, false);
    assert.doesNotMatch(result.closeBriefText, /(?:\$|\bARS\b|\bCBU\b|\bCUIL\b|\bDNI\b|companyCode|sourceCode|\blabel\b|u\. fuente)/i);
    assert.equal(result.kpiCount, 4);
    assert.equal(result.chartCount, 1);
    assert.equal(result.costRows, 6);
    assert.equal(result.sectorRows, 6);
    assert.equal(result.costProtected, 'Otros (celdas protegidas)');
    assert.equal(result.sectorProtected, 'Otros (celdas protegidas)');
    assert.equal(result.sourceTitles.includes('Comparación entre fuentes con diferencias'), true);
    assert.match(result.sourceText, /respaldo completo/i);
    assert.doesNotMatch(result.sourceText, /material_differences_detected|\breconciled\b/);
    assert.doesNotMatch(result.defaultText, /score cross-source|cross-source|acuerdo de valores|corridas|snapshot|extracto|gobernad[oa]|k≥10|totpago/i);
    assert.doesNotMatch(result.defaultText, /285 de 589/i, 'technical reconciliation values must not appear in the default reading');
    assert.doesNotMatch(result.defaultText, /Tendencia del control|Centros de costo con más|Sectores con más|Estado de los datos|Qué está disponible y qué falta/i);
    assert.equal(result.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.equal(result.errorVisible, false);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(rawContractRequests, []);
    await page.screenshot({
      path: path.join(os.tmpdir(), `municontrol-administration-comparison-${viewport.name}.png`),
      fullPage: true,
    });

    await page.click('#sourceControlDetails summary');
    const controlDetail = await page.evaluate(() => ({
      open: document.querySelector('#sourceControlDetails')?.open,
      visible: document.querySelector('.exec-control-details-body')?.getClientRects().length > 0,
      text: document.querySelector('.exec-control-details-body')?.innerText.replace(/\s+/g, ' ').trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ctaHeights: Array.from(document.querySelectorAll('.exec-control-action:not([hidden])')).map(node => node.getBoundingClientRect().height),
    }));
    assert.equal(controlDetail.open, true);
    assert.equal(controlDetail.visible, true);
    assert.match(controlDetail.text, /285 de 589 grupos comparados coincidieron por completo/i);
    assert.match(controlDetail.text, /Valores que coinciden 19,0%/i);
    assert.match(controlDetail.text, /no demuestra que un sueldo haya sido pagado, transferido o contabilizado/i);
    assert.equal(controlDetail.ctaHeights.every(height => height >= 44), true);
    assert.equal(controlDetail.overflow, 0, `${viewport.name} opened control detail must not overflow horizontally`);

    await page.click('#analyticsExploration > summary');
    await page.click('#dataOriginDetails > summary');
    const secondaryDetails = await page.evaluate(() => ({
      analyticsOpen: document.querySelector('#analyticsExploration')?.open,
      analyticsVisible: document.querySelector('#analyticsExplorationBody')?.getClientRects().length > 0,
      analyticsText: document.querySelector('#analyticsExplorationBody')?.innerText.replace(/\s+/g, ' ').trim(),
      dataOriginOpen: document.querySelector('#dataOriginDetails')?.open,
      dataOriginVisible: document.querySelector('#dataOriginDetailsBody')?.getClientRects().length > 0,
      dataOriginText: document.querySelector('#dataOriginDetailsBody')?.innerText.replace(/\s+/g, ' ').trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.equal(secondaryDetails.analyticsOpen, true);
    assert.equal(secondaryDetails.analyticsVisible, true);
    assert.match(secondaryDetails.analyticsText, /Tendencia del control de cálculo.+Centros de costo con más personas incluidas.+Sectores con más personas incluidas/i);
    assert.equal(secondaryDetails.dataOriginOpen, true);
    assert.equal(secondaryDetails.dataOriginVisible, true);
    assert.match(secondaryDetails.dataOriginText, /Estado de los datos.+Qué está disponible y qué falta.+Definiciones, alcance y límites de interpretación/i);
    assert.equal(secondaryDetails.overflow, 0, `${viewport.name} opened secondary details must not overflow horizontally`);

    const firstCta = page.locator('#decisionPriorities .exec-decision-cta').first();
    await firstCta.focus();
    const firstFocus = await page.evaluate(() => ({
      href: document.activeElement?.getAttribute('href'),
      height: document.activeElement?.getBoundingClientRect().height,
      outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
    }));
    assert.equal(firstFocus.href, '/hacienda');
    assert.ok(firstFocus.height >= 44, `${viewport.name} CTA target must be at least 44px tall`);
    await page.keyboard.press('Tab');
    const keyboardFocus = await page.evaluate(() => ({
      href: document.activeElement?.getAttribute('href'),
      focused: document.activeElement?.matches(':focus'),
    }));
    assert.equal(keyboardFocus.href, '/calidad');
    assert.equal(keyboardFocus.focused, true);

    await page.click('#execThemeToggle');
    await page.waitForFunction(() => {
      const summary = document.querySelector('.exec-close-summary');
      const eyebrow = document.querySelector('.exec-close-eyebrow');
      return document.documentElement.getAttribute('data-theme') === 'light' &&
        getComputedStyle(summary).color !== 'rgb(131, 148, 173)' &&
        getComputedStyle(eyebrow).color !== 'rgb(80, 211, 196)';
    });
    const lightTheme = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const decision = document.querySelector('#decisionBrief');
      const statusTag = document.querySelector('#decisionBriefStatus');
      const originalStatus = statusTag.dataset.status;
      const statusStyles = {};
      for (const status of ['attention_required', 'review_recommended', 'context_only']) {
        statusTag.dataset.status = status;
        const style = getComputedStyle(statusTag);
        statusStyles[status] = { color: style.color, backgroundColor: style.backgroundColor };
      }
      statusTag.dataset.status = originalStatus;
      const cta = document.querySelector('.exec-decision-cta');
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        mutedVariable: rootStyle.getPropertyValue('--exec-muted').trim(),
        tealVariable: rootStyle.getPropertyValue('--exec-teal').trim(),
        focusVariable: rootStyle.getPropertyValue('--exec-focus').trim(),
        summaryColor: getComputedStyle(document.querySelector('.exec-close-summary')).color,
        eyebrowColor: getComputedStyle(document.querySelector('.exec-close-eyebrow')).color,
        labelColor: getComputedStyle(document.querySelector('.exec-close-metric span')).color,
        decisionEyebrowColor: getComputedStyle(document.querySelector('.exec-decision-eyebrow')).color,
        decisionHeadlineColor: getComputedStyle(document.querySelector('.exec-decision-headline')).color,
        decisionSurface: getComputedStyle(decision).backgroundColor,
        ctaColor: getComputedStyle(cta).color,
        ctaContainerBackground: getComputedStyle(cta.closest('.exec-decision-priority')).backgroundColor,
        statusStyles,
      };
    });
    assert.equal(lightTheme.theme, 'light');
    const conservativeLightBackground = 'rgb(234, 245, 244)';
    assert.ok(
      contrastRatio(lightTheme.summaryColor, conservativeLightBackground) >= 4.5,
      `summary contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    assert.ok(
      contrastRatio(lightTheme.eyebrowColor, conservativeLightBackground) >= 4.5,
      `eyebrow contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    assert.ok(
      contrastRatio(lightTheme.labelColor, conservativeLightBackground) >= 4.5,
      `label contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    const conservativeDecisionBackground = 'rgb(255, 245, 246)';
    assert.ok(
      contrastRatio(lightTheme.decisionEyebrowColor, conservativeDecisionBackground) >= 4.5,
      `decision eyebrow contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    assert.ok(
      contrastRatio(lightTheme.decisionHeadlineColor, conservativeDecisionBackground) >= 4.5,
      `decision headline contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    for (const [surfaceName, surface] of [
      ['actual', lightTheme.decisionSurface],
      ['conservative', conservativeDecisionBackground],
    ]) {
      const ctaBackground = compositeCssColor(lightTheme.ctaContainerBackground, surface);
      assert.ok(
        contrastRatio(lightTheme.ctaColor, ctaBackground) >= 4.5,
        `light CTA contrast must pass AA on ${surfaceName} background: ${JSON.stringify({ lightTheme, ctaBackground })}`,
      );
      for (const [status, styles] of Object.entries(lightTheme.statusStyles)) {
        const statusBackground = compositeCssColor(styles.backgroundColor, surface);
        assert.ok(
          contrastRatio(styles.color, statusBackground) >= 4.5,
          `light ${status} tag contrast must pass AA on ${surfaceName} background: ${JSON.stringify({ styles, statusBackground })}`,
        );
      }
    }

    await page.evaluate(() => document.activeElement?.blur());
    let lightFocus = null;
    for (let step = 0; step < 60 && !lightFocus; step += 1) {
      await page.keyboard.press('Tab');
      lightFocus = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active?.matches('.exec-decision-cta')) return null;
        const style = getComputedStyle(active);
        return {
          color: style.outlineColor,
          style: style.outlineStyle,
          width: style.outlineWidth,
          offset: style.outlineOffset,
        };
      });
    }
    assert.ok(lightFocus, `${viewport.name} must reach a decision CTA by keyboard`);
    assert.equal(lightFocus.style, 'solid');
    assert.ok(Number.parseFloat(lightFocus.width) >= 3);
    assert.equal(parseCssRgba(lightFocus.color).alpha, 1);
    assert.ok(
      contrastRatio(lightFocus.color, 'rgb(255, 255, 255)') >= 3,
      `light focus contrast must pass 3:1 on white: ${JSON.stringify(lightFocus)}`,
    );
    assert.ok(
      contrastRatio(lightFocus.color, lightTheme.decisionSurface) >= 3,
      `light focus contrast must pass 3:1 on surface: ${JSON.stringify({ lightFocus, lightTheme })}`,
    );

    await page.emulateMedia({ media: 'print', colorScheme: 'light', reducedMotion: 'reduce' });
    const printView = await page.evaluate(() => ({
      briefDisplay: getComputedStyle(document.querySelector('#decisionBrief')).display,
      ctaDisplays: Array.from(document.querySelectorAll('.exec-decision-cta')).map(node => getComputedStyle(node).display),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.notEqual(printView.briefDisplay, 'none');
    assert.equal(printView.ctaDisplays.every(value => value === 'none'), true);
    assert.equal(printView.overflow, 0, `${viewport.name} print view must not overflow horizontally`);
    await context.close();
  }

  assert.equal(requestLog.length, 14);
  assert.deepEqual(requestLog.map(item => item.contract).sort(), ['absence', 'absence', 'administration', 'administration', 'close', 'close', 'decision', 'decision', 'employment', 'employment', 'executive', 'executive', 'quality', 'quality']);
  assert.deepEqual([...new Set(requestLog.map(item => item.pathname))].sort(), [
    '/api/grh-absence-insights',
    '/api/grh-administration-comparison',
    '/api/grh-close',
    '/api/grh-decision-brief',
    '/api/grh-employment-review',
    '/api/grh-executive',
    '/api/grh-quality',
  ]);
  assert.equal(requestLog.every(item => item.requestTarget === item.pathname), true, 'governed requests must use exact endpoints without query variants');
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
});

test('administration comparison remains operable at 320px with forced colors', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({
    viewport: { width: 320, height: 720 },
    reducedMotion: 'reduce',
    forcedColors: 'active',
  });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#administrationComparison:not([hidden])');

  const compact = await page.evaluate(() => {
    const section = document.querySelector('#administrationComparison');
    const matrix = document.querySelector('#administrationComparisonMetrics');
    const summary = document.querySelector('#administrationComparisonTechnical > summary');
    const cta = document.querySelector('#administrationComparisonCta:not([hidden])');
    return {
      sectionVisible: Boolean(section?.getClientRects().length),
      matrixVisible: Boolean(matrix?.getClientRects().length),
      rows: matrix?.querySelectorAll('.exec-administration-row').length,
      values: Array.from(matrix?.querySelectorAll('dd') || [], node => node.textContent.trim()),
      summaryHeight: summary?.getBoundingClientRect().height || 0,
      ctaHeight: cta?.getBoundingClientRect().height || 0,
      ctaHref: cta?.getAttribute('href'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sectionOverflow: Math.max(0, (section?.scrollWidth || 0) - (section?.clientWidth || 0)),
      matrixOverflow: Math.max(0, (matrix?.scrollWidth || 0) - (matrix?.clientWidth || 0)),
    };
  });
  assert.equal(compact.sectionVisible, true);
  assert.equal(compact.matrixVisible, true);
  assert.equal(compact.rows, 3);
  assert.deepEqual(compact.values, ['5.936', '3.395', '+2.541', '752', '662', '+90', '65.847', '52.190', '+13.657']);
  assert.ok(compact.summaryHeight >= 44);
  assert.ok(compact.ctaHeight >= 44);
  assert.equal(compact.ctaHref, '/estructura#novedades-historicas');
  assert.equal(compact.overflow, 0);
  assert.equal(compact.sectionOverflow, 0);
  assert.equal(compact.matrixOverflow, 0);

  await page.click('#administrationComparisonTechnical > summary');
  await page.focus('#administrationComparisonTechnical > summary');
  await page.keyboard.press('Tab');
  const opened = await page.evaluate(() => {
    const active = document.activeElement;
    const outline = active ? getComputedStyle(active) : null;
    return {
      open: document.querySelector('#administrationComparisonTechnical')?.open,
      additionalRows: document.querySelectorAll('#administrationComparisonAdditionalMetrics .exec-administration-row').length,
      focused: active?.id,
      outlineStyle: outline?.outlineStyle,
      outlineWidth: Number.parseFloat(outline?.outlineWidth || '0'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert.equal(opened.open, true);
  assert.equal(opened.additionalRows, 2);
  assert.equal(opened.focused, 'administrationComparisonCta');
  assert.notEqual(opened.outlineStyle, 'none');
  assert.ok(opened.outlineWidth >= 1);
  assert.equal(opened.overflow, 0);
  await context.close();
});

test('employment review protects small groups and never blocks the municipal panorama', { skip: !HAS_PRIVATE_GRH }, async t => {
  await t.test('portable detail', async t => {
    const requestLog = [];
    const server = await createServer(requestLog, { employmentPortable: true });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => ({
      total: document.querySelector('#employmentReviewTotal')?.textContent.trim(),
      current: document.querySelector('#employmentReviewCurrent')?.textContent.trim(),
      matched: document.querySelector('#employmentReviewMatched')?.textContent.trim(),
      payroll: document.querySelector('#employmentReviewPayroll')?.textContent.trim(),
      rows: Array.from(document.querySelectorAll('#employmentReviewCategories strong')).map(node => node.textContent.trim()),
      text: document.querySelector('#employmentReview')?.textContent.replace(/\s+/g, ' ').trim(),
      coreVisible: !document.querySelector('#dataViews')?.hidden,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.equal(result.total, '27');
    assert.equal(result.current, '867');
    assert.equal(result.matched, '848');
    assert.equal(result.payroll, '856');
    assert.deepEqual(result.rows, [
      '19 · Sin participación en el cálculo del mes',
      'Otros casos · detalle protegido',
    ]);
    assert.match(result.text, /muy pocas personas.+permitir identificarlas/i);
    assert.doesNotMatch(result.text, /7 ·|1 ·/);
    assert.equal(result.coreVisible, true);
    assert.equal(result.overflow, 0);
    await context.close();
  });

  await t.test('scoped failure and retry', async t => {
    const requestLog = [];
    const server = await createServer(requestLog, { employmentUnavailable: true });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#employmentReviewRetry:not([hidden])');
    assert.equal(await page.locator('#dataViews').getAttribute('hidden'), null);
    assert.equal(await page.locator('#kpiParticipants').textContent(), '856');
    assert.equal(await page.locator('#employmentReviewRetry').isVisible(), true);
    assert.match(await page.locator('#employmentReviewStatus').textContent(), /resto del panorama sigue disponible/i);
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/grh-employment-review' && response.status() === 503),
      page.locator('#employmentReviewRetry').click(),
    ]);
    assert.equal(requestLog.filter(item => item.contract === 'employment').length, 2);
    assert.equal(requestLog.filter(item => item.contract !== 'employment').length, 6);
    await context.close();
  });

  await t.test('contract drift stays scoped', async t => {
    const requestLog = [];
    const server = await createServer(requestLog, { employmentContractMismatch: true });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#employmentReviewRetry:not([hidden])');
    assert.equal(await page.locator('#kpiParticipants').textContent(), '856');
    assert.equal(await page.locator('#employmentReviewTotal').textContent(), '—');
    assert.equal(await page.locator('#employmentReviewCategories').locator('li').count(), 0);
    assert.equal(await page.locator('#employmentReviewCta').isVisible(), false);
    assert.equal(requestLog.filter(item => item.contract === 'employment').length, 1);
    await context.close();
  });
});

test('administration comparison protects small differences and fails independently', { skip: !HAS_PRIVATE_GRH }, async t => {
  await t.test('protected row never leaks the hidden counts', async t => {
    const requestLog = [];
    const server = await createServer(requestLog, { administrationProtected: true });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => ({
      rows: Array.from(document.querySelectorAll('#administrationComparisonMetrics .exec-administration-row')).map(row => ({
        label: row.querySelector('dt strong')?.textContent.trim(),
        values: Array.from(row.querySelectorAll('dd')).map(node => node.textContent.trim()),
      })),
      additionalRows: Array.from(document.querySelectorAll('#administrationComparisonAdditionalMetrics .exec-administration-row')).map(row => ({
        label: row.querySelector('dt strong')?.textContent.trim(),
        values: Array.from(row.querySelectorAll('dd')).map(node => node.textContent.trim()),
      })),
      status: document.querySelector('#administrationComparisonStatus')?.textContent.replace(/\s+/g, ' ').trim(),
      text: document.querySelector('#administrationComparison')?.textContent.replace(/\s+/g, ' ').trim(),
      coreVisible: !document.querySelector('#dataViews')?.hidden,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.deepEqual(result.additionalRows.at(0), {
      label: 'Fechas de ingreso informadas',
      values: ['Protegido', 'Protegido', 'Protegido'],
    });
    assert.match(result.status, /no se muestran para proteger grupos pequeños/i);
    assert.doesNotMatch(result.text, /\b281\b|\b216\b|\+65\b/);
    assert.equal(result.coreVisible, true);
    assert.equal(result.overflow, 0);
    assert.equal(requestLog.filter(item => item.contract === 'administration').length, 1);
    await context.close();
  });

  await t.test('scoped failure and retry', async t => {
    const requestLog = [];
    const server = await createServer(requestLog, { administrationUnavailable: true });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#administrationComparisonRetry:not([hidden])');
    assert.equal(await page.locator('#dataViews').getAttribute('hidden'), null);
    assert.equal(await page.locator('#kpiParticipants').textContent(), '856');
    assert.equal(await page.locator('#administrationComparisonMetrics').locator('.exec-administration-row').count(), 0);
    assert.match(await page.locator('#administrationComparisonStatus').textContent(), /resto del panorama sigue disponible/i);
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/grh-administration-comparison' && response.status() === 503),
      page.locator('#administrationComparisonRetry').click(),
    ]);
    assert.equal(requestLog.filter(item => item.contract === 'administration').length, 2);
    assert.equal(requestLog.filter(item => item.contract !== 'administration').length, 5);
    await context.close();
  });
});

test('absence motive detail fails independently and keeps verified totals visible', { skip: !HAS_PRIVATE_GRH }, async t => {
  await t.test('scoped failure and retry', async t => {
    const requestLog = [];
    const server = await createServer(requestLog, { absenceUnavailable: true });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#absenceInsightsRetry:not([hidden])');
    assert.equal(await page.locator('#dataViews').getAttribute('hidden'), null);
    assert.equal(await page.locator('#administrationComparisonMetrics .exec-administration-row').count(), 3);
    assert.equal(await page.locator('#absenceInsightsCategories').locator('li').count(), 0);
    assert.match(await page.locator('#absenceInsightsStatus').textContent(), /comparación general sigue disponible/i);
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/grh-absence-insights' && response.status() === 503),
      page.locator('#absenceInsightsRetry').click(),
    ]);
    assert.equal(requestLog.filter(item => item.contract === 'absence').length, 2);
    assert.equal(requestLog.filter(item => item.contract !== 'absence').length, 6);
    await context.close();
  });

  await t.test('contract drift never clears the comparison', async t => {
    const requestLog = [];
    const server = await createServer(requestLog, { absenceContractMismatch: true });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#absenceInsightsRetry:not([hidden])');
    assert.equal(await page.locator('#administrationComparisonMetrics .exec-administration-row').count(), 3);
    assert.equal(await page.locator('#absenceInsightsCategories').locator('li').count(), 0);
    assert.equal(await page.locator('#absenceInsightsRetry').isVisible(), true);
    assert.equal(requestLog.filter(item => item.contract === 'absence').length, 1);
    await context.close();
  });

  await t.test('protected motive cells never render as zero', async t => {
    const requestLog = [];
    const server = await createServer(requestLog);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#absenceInsightsAllCategories .exec-administration-row').length === 11);
    await page.locator('#absenceInsightsAll > summary').click();
    const protectedRows = await page.evaluate(() => ['Fallecimiento de familiar', 'Períodos inactivos'].map(label => {
      const row = Array.from(document.querySelectorAll('#absenceInsightsAllCategories .exec-administration-row'))
        .find(candidate => candidate.querySelector('dt strong')?.textContent.trim() === label);
      return {
        label,
        values: Array.from(row?.querySelectorAll('dd') || [], node => node.textContent.trim()),
      };
    }));
    assert.deepEqual(protectedRows, [
      { label: 'Fallecimiento de familiar', values: ['23', 'Protegido', 'Protegido'] },
      { label: 'Períodos inactivos', values: ['Protegido', '11', 'Protegido'] },
    ]);
    assert.equal(protectedRows.flatMap(row => row.values).includes('0'), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    await context.close();
  });
});

test('main executive dashboard performs zero GRH requests for a role without dashboard capability', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { authUser: projectedUser('TENANT_USER') });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(`${baseUrl}/inicio.html`);
  await page.waitForSelector('#workspaceMain[aria-busy="false"]');

  assert.deepEqual(requestLog, []);
  assert.equal(await page.locator('[data-capability="navigation.dashboard"]').count(), 0);
  await context.close();
});

test('main executive dashboard revalidates dashboard capability before every retry and redirects to the authorized Inicio brief', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const override of ['missing', 'truthy-malformed', 'throws']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#executiveDashboard[aria-busy="false"]');
    const requestsBeforeRetry = requestLog.length;
    await page.evaluate(mode => {
      window.requireCapability = mode === 'missing'
        ? undefined
        : mode === 'throws'
          ? async function () { throw new Error('capability helper unavailable'); }
          : async function () { return { allowed: true }; };
    }, override);
    await page.locator('#retryLoad').dispatchEvent('click');
    await page.waitForURL(`${baseUrl}/inicio.html`);
    await page.waitForSelector('#accessNotice:not([hidden])');
    await page.waitForFunction(() => document.activeElement?.id === 'accessNotice');
    assert.match(await page.textContent('#accessNotice'), /no tiene habilitada/i, override);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessNotice', override);
    assert.deepEqual(
      requestLog.slice(requestsBeforeRetry).map(item => item.contract),
      ['decision'],
      `${override} retry may load only the aggregate Inicio brief after the safe redirect`,
    );
    await context.close();
  }
});

test('main executive dashboard fails closed and retries when the monthly close returns 503', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { closeUnavailable: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#dataViews')?.hidden,
    busy: document.querySelector('#executiveDashboard')?.getAttribute('aria-busy'),
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
  }));
  assert.equal(result.dataHidden, true);
  assert.equal(result.busy, 'false');
  assert.match(result.error, /proyecciones|GRH|disponible/i);
  const requestsBeforeRetry = requestLog.length;
  const retryResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/grh-close' && response.status() === 503
  );
  await page.click('#retryLoad');
  await retryResponse;
  await page.waitForSelector('#loadError:not([hidden])');
  assert.ok(requestLog.length > requestsBeforeRetry, 'retry must start a new governed projection request');
  assert.equal(requestLog.filter(item => item.contract === 'close').length >= 2, true);
  assert.equal(requestLog.every(item => item.requestTarget === item.pathname), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});

test('main executive dashboard fails closed and performs one manual retry when the decision brief returns 503', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { decisionUnavailable: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  assert.equal(await page.locator('#dataViews').evaluate(node => node.hidden), true);
  assert.equal(await page.locator('#decisionPriorities .exec-decision-priority').count(), 0);
  assert.equal(requestLog.filter(item => item.contract === 'decision').length, 1);

  const retryResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/grh-decision-brief' && response.status() === 503
  );
  await page.click('#retryLoad');
  await retryResponse;
  await page.waitForSelector('#loadError:not([hidden])');
  assert.equal(requestLog.filter(item => item.contract === 'decision').length, 2);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});

test('a protected current close keeps the integral dashboard fail-closed without leaking S13 figures', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { currentCloseProtected: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#dataViews')?.hidden,
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
    sourceCount: document.querySelector('#sourceCountChip')?.textContent.trim(),
    decisionStatus: document.querySelector('#decisionBriefStatus')?.textContent.trim(),
    agreement: document.querySelector('#decisionAgreement')?.textContent.trim(),
    change: document.querySelector('#decisionChange')?.textContent.trim(),
    quality: document.querySelector('#decisionQuality')?.textContent.trim(),
    closePeriod: document.querySelector('#closePeriodBadge')?.textContent.trim(),
    priorityCount: document.querySelectorAll('#decisionPriorities .exec-decision-priority').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(result.dataHidden, true);
  assert.match(result.error, /último mes.+al menos 10 personas.+proteger identidades/i);
  assert.equal(result.sourceCount, '—/4');
  assert.equal(result.decisionStatus, '—');
  assert.equal(result.agreement, '—');
  assert.equal(result.change, '—');
  assert.equal(result.quality, '—');
  assert.equal(result.closePeriod, '—');
  assert.equal(result.priorityCount, 0);
  assert.equal(result.overflow, 0);
  assert.deepEqual(requestLog.map(item => item.contract).sort(), ['close', 'decision', 'executive', 'quality']);
  await context.close();
});

test('privacy_protected comparison copy refers only to the previous month after current release', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { previousCloseProtected: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#executiveDashboard[aria-busy="false"]');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#dataViews')?.hidden,
    errorHidden: document.querySelector('#loadError')?.hidden,
    agreement: document.querySelector('#decisionAgreement')?.textContent.trim(),
    change: document.querySelector('#decisionChange')?.textContent.trim(),
    note: document.querySelector('#decisionChangeNote')?.textContent.trim(),
    closeComparison: document.querySelector('#closeComparisonTitle')?.textContent.trim(),
  }));
  assert.equal(result.dataHidden, false);
  assert.equal(result.errorHidden, true);
  assert.equal(result.agreement, '6,5%');
  assert.equal(result.change, 'Protegido');
  assert.equal(result.note, 'El mes anterior no puede mostrarse porque el grupo es demasiado pequeño.');
  assert.equal(result.closeComparison, 'Comparación no disponible');
  await context.close();
});

test('global reconciliation copy stays independent from a monthly agreement difference', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { globalReconciled: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#executiveDashboard[aria-busy="false"]');
  const result = await page.evaluate(() => ({
    globalScore: document.querySelector('#kpiCrossScore')?.textContent.trim(),
    comparisonStatus: document.querySelector('#kpiCrossStatus')?.textContent.trim(),
    monthlyAgreement: document.querySelector('#decisionAgreement')?.textContent.trim(),
    decisionStatus: document.querySelector('#decisionBriefStatus')?.textContent.trim(),
    priorityTitles: Array.from(document.querySelectorAll('#decisionPriorities strong')).map(node => node.textContent.trim()),
    ctas: Array.from(document.querySelectorAll('#decisionPriorities .exec-decision-cta')).map(node => node.getAttribute('href')),
    sourceTitles: Array.from(document.querySelectorAll('#sourceList .exec-source-row strong')).map(node => node.textContent.trim()),
    sourceText: document.querySelector('#sourceList')?.textContent.replace(/\s+/g, ' ').trim(),
  }));
  assert.equal(result.globalScore, '100,0%');
  assert.equal(result.comparisonStatus, 'Sin diferencias relevantes');
  assert.equal(result.monthlyAgreement, '6,5%');
  assert.equal(result.decisionStatus, 'Revisión recomendada');
  assert.equal(result.priorityTitles.includes('Hay diferencias entre las dos fuentes'), false);
  assert.deepEqual(result.ctas, ['/calidad']);
  assert.equal(result.sourceTitles.includes('Comparación entre fuentes sin diferencias relevantes'), true);
  assert.equal(result.sourceTitles.includes('Comparación entre fuentes con diferencias'), false);
  assert.match(result.sourceText, /no encontró diferencias relevantes/i);
  assert.doesNotMatch(result.sourceText, /material_differences_detected|\breconciled\b/);
  await context.close();
});

test('main executive dashboard rejects malformed, unknown, header-drifted and SHA-mismatched decision briefs', { skip: !HAS_PRIVATE_GRH }, async t => {
  const cases = [
    ['malformed exact schema', { decisionMalformed: true }],
    ['unknown enum', { decisionUnknownEnum: true }],
    ['contract header mismatch', { decisionContractMismatch: true }],
    ['source SHA mismatch', { decisionSourceMismatch: true }],
  ];

  for (const [name, options] of cases) {
    await t.test(name, async () => {
      const requestLog = [];
      const server = await createServer(requestLog, options);
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        await seedSession(context);
        const page = await context.newPage();
        await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#loadError:not([hidden])');
        const result = await page.evaluate(() => ({
          dataHidden: document.querySelector('#dataViews')?.hidden,
          busy: document.querySelector('#executiveDashboard')?.getAttribute('aria-busy'),
          priorityCount: document.querySelectorAll('#decisionPriorities .exec-decision-priority').length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        assert.equal(result.dataHidden, true, name);
        assert.equal(result.busy, 'false', name);
        assert.equal(result.priorityCount, 0, name);
        assert.equal(result.overflow, 0, name);
        assert.equal(requestLog.filter(item => item.contract === 'decision').length, 1, name);
        assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false, name);
        await context.close();
      } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
      }
    });
  }
});

test('decision brief CTAs are derived only from the current validated navigation capabilities', { skip: !HAS_PRIVATE_GRH }, async t => {
  const cases = [
    ['Hacienda denied', ['navigation.hacienda'], ['/calidad']],
    ['data quality denied', ['navigation.data-quality'], ['/hacienda']],
    ['both destinations denied', ['navigation.hacienda', 'navigation.data-quality'], []],
  ];

  for (const [name, denied, expectedHrefs] of cases) {
    await t.test(name, async () => {
      const requestLog = [];
      const server = await createServer(requestLog, { authUser: projectedUserWithout(...denied) });
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        await seedSession(context);
        const page = await context.newPage();
        await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#executiveDashboard[aria-busy="false"]');
        const hrefs = await page.locator('#decisionPriorities .exec-decision-cta').evaluateAll(nodes =>
          nodes.map(node => node.getAttribute('href'))
        );
        assert.deepEqual(hrefs, expectedHrefs, name);
        const controlHrefs = await page.locator('#sourceControlDetails .exec-control-action:not([hidden])').evaluateAll(nodes =>
          nodes.map(node => node.getAttribute('href')).sort()
        );
        assert.deepEqual(controlHrefs, [...expectedHrefs].sort(), `${name} control detail`);
        assert.equal(await page.locator('#decisionPriorities .exec-decision-priority').count(), 3, name);
        assert.equal(requestLog.filter(item => item.contract === 'decision').length, 1, name);
        await context.close();
      } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
      }
    });
  }
});

test('main executive dashboard fails closed when close provenance mismatches the executive source', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { closeSourceMismatch: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#dataViews')?.hidden,
    busy: document.querySelector('#executiveDashboard')?.getAttribute('aria-busy'),
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(result.dataHidden, true);
  assert.equal(result.busy, 'false');
  assert.match(result.error, /misma fuente|mismo corte|proyecciones GRH/i);
  assert.equal(result.overflow, 0);
  assert.deepEqual(requestLog.map(item => item.contract).sort(), ['close', 'decision', 'executive', 'quality']);
  assert.equal(requestLog.every(item => item.requestTarget === item.pathname), true);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});
