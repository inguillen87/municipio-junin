import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'reportes.html'), 'utf8');

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
}

test('reportes ships four local source-backed SVG surfaces without a chart CDN', () => {
  const chartIds = ['chart-participantes', 'chart-sectores', 'chart-control', 'chart-calidad'];
  for (const id of chartIds) {
    assert.match(source, new RegExp(`id="${id}"[^>]+data-source="grh-executive-portable"[^>]+data-chart-state="loading"`));
  }

  assert.match(source, /data-source-contract="grh-executive-report-v2"/);
  assert.match(source, /data-canonical-source="grh"/);
  assert.match(source, /class="skip-link" href="#main-content"/);
  assert.match(source, /id="main-content" tabindex="-1"/);
  for (const tab of ['resumen', 'dotacion', 'control', 'calidad']) {
    assert.match(source, new RegExp(`id="tab-btn-${tab}"[^>]+tabindex="${tab === 'resumen' ? '0' : '-1'}"`));
    assert.match(source, new RegExp(`id="tab-${tab}"[^>]+aria-labelledby="tab-btn-${tab}"`));
  }
  assert.match(source, /event\.key === 'ArrowRight'/);
  assert.match(source, /event\.key === 'ArrowLeft'/);
  assert.match(source, /event\.key === 'Home'/);
  assert.match(source, /event\.key === 'End'/);
  assert.match(source, /candidate\.tabIndex = active \? 0 : -1/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /renderReportPanel\(lastAvailableReport, tabId\)/);
  assert.match(source, /const SVG_NS = 'http:\/\/www\.w3\.org\/2000\/svg'/);
  assert.match(source, /document\.createElementNS\(SVG_NS, name\)/);
  assert.match(source, /role:\s*'img'/);
  assert.match(source, /svg\.appendChild\(svgElement\('title'/);
  assert.match(source, /svg\.appendChild\(svgElement\('desc'/);
  assert.match(source, /MuniAuth\.fetch\(endpoint\)/);
  assert.match(source, /<select class="period-selector" id="period-selector" disabled/);
  assert.match(source, /syncPeriodSelector\(report\.availablePeriods, report\.period\)/);
  assert.match(source, /nunca se sustituye un período ausente/i);
  assert.match(source, /Executive Summary/);
  assert.match(source, /calculation_control_not_bank_disbursement/);
  assert.match(source, /not_declared_in_source/);
  assert.match(source, /source\?\.profileSchemaVersion === 'grh-profile-v1'/);
  assert.match(source, /source\?\.semanticSchemaVersion === 'grh-semantic-v2'/);
  assert.match(source, /source\?\.executiveSchemaVersion === 'grh-executive-v2'/);
  assert.match(source, /source\?\.qualitySchemaVersion === 'grh-quality-v1'/);
  assert.match(source, /source\?\.privacyPolicyVersion === 'grh-small-cell-v1'/);
  assert.match(source, /source\?\.portableThreshold === 10/);
  assert.match(source, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(source, /shortSha\(source\.approvedSha256\)/);
  assert.match(source, /personas_junin/);
  assert.match(source, /realtime === false/);
  assert.doesNotMatch(source, /type="month"|offset\s*<\s*6|data_points|rrhh-table-body|finance-table-body/i);
  assert.doesNotMatch(source, /<canvas\b|\bnew Chart\b|Chart\.defaults|chart\.js|cdn\.jsdelivr|Visualización no habilitada/i);
  assert.doesNotMatch(source, /currency:\s*['"]ARS['"]|\$\s*\d|\bDEMO\b|\bmock(?:ed)?\b/i);
  assert.doesNotMatch(source, /calculationRows|controlRows|netIdentityVarianceCents|netToPayVarianceCents|roundingToleranceCents|identityReconciledExactly/);
  assert.doesNotMatch(source, /e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9/i);
});

test('reportes fails closed before creating an SVG when source or view data is absent', () => {
  assert.match(source, /if \(!response\.ok\)\s*\{\s*setUnavailable/);
  assert.match(source, /if \(!isGovernedReport\(data\)\)\s*\{\s*setUnavailable/);
  assert.match(source, /source\?\.aggregateOnly === true && source\?\.containsPii === false/);
  assert.match(source, /source\.excludedSources\[0\] === 'personas_junin'/);
  assert.match(source, /if \(!container \|\| !points\.length \|\| !points\.some/);
  assert.match(source, /container\.dataset\.chartState = 'empty'/);
  assert.match(source, /container\.replaceChildren\(note\)/);
  assert.match(source, /lastAvailableReport = null/);
  assert.match(source, /No se muestran cifras, tendencias ni comparaciones cuando la fuente falla/);
});

test('reportes inline JavaScript parses without a runtime chart library', () => {
  for (const [index, script] of inlineScripts(source).entries()) {
    assert.doesNotThrow(() => new Function(script), `reportes inline script ${index + 1} must parse`);
  }
});
