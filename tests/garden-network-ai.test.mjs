import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildGardenNetworkAssistantAnswer,
  classifyIntent,
  createAiAnalyzeHandler,
  GARDEN_NETWORK_QUESTIONS,
} from '../api/ai-analyze.js';

const ARTIFACT = JSON.parse(await readFile(
  new URL('../api/_data/grh-garden-network.json', import.meta.url),
  'utf8',
));
const SOURCE_SHA = ARTIFACT.source.sourceSha256;
const IA_CLIENT_SOURCE = await readFile(
  new URL('../js/ia-assistant.js', import.meta.url),
  'utf8',
);

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end() { return this; },
  };
}

function request(message, mode = 'deterministic') {
  return { method: 'POST', headers: {}, body: { message, mode } };
}

function caller(role = 'INTENDENTE') {
  return {
    id: `garden-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@example.test`,
    role,
    tenantId: 'tenant-junin',
    tenant: { id: 'tenant-junin', slug: 'junin' },
  };
}

function handlerHarness({ role = 'INTENDENTE', readGarden = async () => ARTIFACT } = {}) {
  const calls = { bundle: 0, garden: [] };
  const handler = createAiAnalyzeHandler({
    requireRoleImpl: async () => caller(role),
    requireDatasetTenantImpl: () => true,
    readArtifactBundleImpl: async () => {
      calls.bundle += 1;
      throw new Error('base GRH bundle must not serve garden_network');
    },
    readGardenNetworkArtifactImpl: async (input) => {
      calls.garden.push(input);
      return readGarden(input);
    },
    environment: {
      GRH_TENANT_ID: 'tenant-junin',
      GRH_SOURCE_SHA256: SOURCE_SHA,
    },
  });
  return { calls, handler };
}

test('only the three frozen questions classify as garden_network', () => {
  assert.deepEqual(GARDEN_NETWORK_QUESTIONS, [
    '¿Qué significa personas observadas en el cálculo?',
    '¿Cómo cambió la observación mensual en jardines?',
    '¿Por qué hay unidades agrupadas como dato protegido?',
  ]);
  for (const question of GARDEN_NETWORK_QUESTIONS) {
    assert.deepEqual(classifyIntent(question), { intent: 'garden_network', policy: 'allowed' });
  }
  assert.deepEqual(
    classifyIntent('¿Cómo uso la Red de jardines maternales?'),
    { intent: 'manual_help', policy: 'allowed', manualTopic: 'gardens' },
  );
  assert.notEqual(
    classifyIntent('¿Cómo cambió la observación mensual en jardines este año?').intent,
    'garden_network',
  );
  assert.notEqual(classifyIntent('Mostrame cualquier dato de jardines').intent, 'garden_network');
});

test('the browser deep-link allowlist contains only the exact garden questions', () => {
  for (const question of GARDEN_NETWORK_QUESTIONS) {
    assert.equal(IA_CLIENT_SOURCE.includes(`'${question}'`), true, question);
  }
  assert.match(IA_CLIENT_SOURCE, /GARDEN_NETWORK_DEEP_LINK_QUESTIONS\.has\(question\)/);
  assert.match(IA_CLIENT_SOURCE, /keys\.length !== 1[\s\S]{0,120}getAll\('question'\)\.length !== 1/);
  assert.match(IA_CLIENT_SOURCE, /!safeGardenQuestion && \(isPersonLookupQuestion\(question\)/);
  assert.doesNotMatch(IA_CLIENT_SOURCE, /GARDEN_NETWORK_DEEP_LINK_QUESTIONS[\s\S]{0,120}\.(?:add|delete|clear)\(/);
});

test('the deterministic answer derives the frozen figures, limits and CTA only from the contract', () => {
  const result = buildGardenNetworkAssistantAnswer(ARTIFACT);
  assert.equal(result.intent, 'garden_network');
  assert.equal(result.status, 'answered');
  assert.equal(result.resolvedPeriod, '2026-07');
  assert.match(result.answer.summary, /107 personas observadas/i);
  assert.match(result.answer.findings.join(' '), /45 personas[\s\S]*4 unidades/i);
  assert.match(result.answer.findings.join(' '), /62 personas[\s\S]*agregado protegido/i);
  assert.match(result.answer.findings.join(' '), /24 meses[\s\S]*90[\s\S]*107/i);
  assert.match(result.answer.caveats.join(' '), /matrícula/i);
  assert.match(result.answer.caveats.join(' '), /capacidad/i);
  assert.match(result.answer.caveats.join(' '), /presentismo/i);
  assert.match(result.answer.caveats.join(' '), /presupuesto/i);
  assert.match(result.answer.caveats.join(' '), /no establece causalidad/i);
  const humanReadableAnswer = [
    result.answer.summary,
    ...result.answer.findings,
    ...result.answer.evidence.flatMap(item => [item.label, item.value, item.detail]),
    ...result.answer.caveats,
  ].join(' ');
  assert.doesNotMatch(humanReadableAnswer, /\b103\b|assignedPeople|unassignedPeople/iu);
  assert.match(humanReadableAnswer, /45 personas en 4 unidades liberadas/iu);
  assert.doesNotMatch(
    humanReadableAnswer.replaceAll('4 unidades liberadas', ''),
    /\b4\b/u,
  );
  assert.deepEqual(result.answer.actions, [{
    id: 'open_garden_network',
    label: 'Abrir Red de jardines',
    href: '/jardines',
    requiredCapability: 'navigation.organization-analytics',
  }]);
  assert.match(result.answer.source, new RegExp(SOURCE_SHA));

  const invalid = structuredClone(ARTIFACT);
  invalid.summary.people = 108;
  assert.throws(
    () => buildGardenNetworkAssistantAnswer(invalid),
    { code: 'GRH_GARDEN_NETWORK_CONTRACT_INVALID' },
  );
});

test('the handler reads only the pinned garden artifact and exposes exact provenance truth', async () => {
  const { calls, handler } = handlerHarness();
  const res = response();
  await handler(request(GARDEN_NETWORK_QUESTIONS[1]), res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.bundle, 0);
  assert.equal(calls.garden.length, 1);
  assert.equal(calls.garden[0].expectedSourceSha256, SOURCE_SHA);
  assert.equal(calls.garden[0].environment.GRH_SOURCE_SHA256, SOURCE_SHA);
  assert.equal(res.payload.intent, 'garden_network');
  assert.equal(res.payload.dataStatus.source, 'grh_garden_network_governed_contract');
  assert.equal(res.payload.dataStatus.snapshotAsOf, ARTIFACT.source.snapshotAsOf);
  assert.equal(res.payload.dataStatus.historyUsed, false);
  assert.equal(res.payload.provenance.sourceSha256, SOURCE_SHA);
  assert.equal(res.payload.provenance.aggregateOnly, true);
  assert.equal(res.payload.provenance.containsPii, false);
  assert.equal(res.payload.provenance.gardenNetworkSchemaVersion, 'grh-garden-network-v1');
  assert.equal(res.payload.answer.actions[0].href, '/jardines');
});

test('assisted mode declares deterministic fallback when synthesis is unavailable', async () => {
  const { handler } = handlerHarness();
  const res = response();
  await handler(request(GARDEN_NETWORK_QUESTIONS[0], 'assisted'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.engine.id, 'municipal-copilot-v2');
  assert.equal(res.payload.engine.mode, 'deterministic-fallback');
  assert.equal(res.payload.engine.fallbackCode, 'PROVIDER_DISABLED');
  assert.equal(res.payload.engine.generated, false);
  assert.equal(Object.hasOwn(res.payload.answer, 'synthesis'), false);
  assert.match(res.payload.response, /107 personas observadas/i);
});

test('contract drift fails closed without figures or fallback to another GRH source', async () => {
  const { calls, handler } = handlerHarness({
    readGarden: async () => { throw new Error('pin drift'); },
  });
  const res = response();
  await handler(request(GARDEN_NETWORK_QUESTIONS[2]), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'GRH_GARDEN_NETWORK_UNAVAILABLE');
  assert.equal(calls.bundle, 0);
  assert.equal(calls.garden.length, 1);
  assert.doesNotMatch(JSON.stringify(res.payload), /\b(?:107|45|62|90)\b/);
});

test('capability denial happens before the reader and unrelated intents never call it', async () => {
  const denied = handlerHarness({ role: 'TENANT_USER' });
  const deniedRes = response();
  await denied.handler(request(GARDEN_NETWORK_QUESTIONS[0]), deniedRes);
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(deniedRes.payload.code, 'ASSISTANT_CAPABILITY_REQUIRED');
  assert.equal(denied.calls.garden.length, 0);
  assert.doesNotMatch(JSON.stringify(deniedRes.payload), /\b(?:107|45|62|90)\b/);

  const unrelated = handlerHarness();
  const unrelatedRes = response();
  await unrelated.handler(request('Dame un resumen ejecutivo'), unrelatedRes);
  assert.equal(unrelated.calls.garden.length, 0);
  assert.equal(unrelated.calls.bundle, 1);
  assert.equal(unrelatedRes.statusCode, 503);
});
