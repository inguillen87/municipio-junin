import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import accessPolicy from '../shared/access-policy.cjs';
import {
  MUNICIPAL_TASK_CATALOG,
  normalizeMunicipalTaskSearch,
  resolveMunicipalTaskCatalog,
  searchMunicipalTasks,
} from '../js/municipal-task-catalog.js';
import {
  MUNIGUIA_ASSISTANT_QUESTIONS,
  MUNIGUIA_CATALOG,
} from '../js/contextual-help-catalog.js';

const { ACCESS_POLICY_VERSION, ROLE_HOME_PROFILE, ROLE_CAPABILITIES } = accessPolicy;
const ROOT = path.resolve(import.meta.dirname, '..');

function inputFor(role, capabilities = ROLE_CAPABILITIES[role]) {
  return {
    role,
    variant: ROLE_HOME_PROFILE[role].variant,
    policyVersion: ACCESS_POLICY_VERSION,
    capabilities: [...capabilities],
  };
}

const EXPECTED_RECOMMENDED = Object.freeze({
  SUPER_ADMIN: ['review-sources', 'import-source', 'verify-quality', 'understand-role'],
  INTENDENTE: ['review-garden-network', 'compare-managements', 'review-priorities', 'follow-decisions'],
  TENANT_ADMIN: ['import-source', 'review-sources', 'verify-quality', 'review-fixed-concepts'],
  TENANT_USER: ['locate-territory', 'understand-role'],
  CONTADOR: ['review-fixed-concepts', 'review-payroll-runs', 'review-payroll', 'create-report'],
  INSPECTOR: ['locate-territory', 'understand-role'],
  DEMO: ['locate-territory', 'understand-role'],
});

test('the task contract projects every role only through its effective capabilities', () => {
  for (const role of Object.keys(ROLE_CAPABILITIES)) {
    const resolved = resolveMunicipalTaskCatalog(inputFor(role));
    assert.ok(resolved, role);
    assert.equal(resolved.contract, 'municipal-task-catalog-v1');
    assert.equal(resolved.roleId, role);
    assert.equal(Object.isFrozen(resolved), true);
    assert.equal(Object.isFrozen(resolved.tasks), true);
    assert.equal(new Set(resolved.tasks.map(task => task.id)).size, resolved.tasks.length);
    assert.ok(resolved.tasks.length > 0);
    for (const task of resolved.tasks) {
      assert.ok(ROLE_CAPABILITIES[role].includes(task.capability), `${role}:${task.id}`);
      assert.match(task.href, /^\/[a-z0-9/?=&.%#-]+$/);
      assert.equal(Object.isFrozen(task), true);
      assert.equal(task.helpHref === null || task.helpHref.startsWith('/manuales.html#'), true);
      if (task.assistant) {
        assert.ok(ROLE_CAPABILITIES[role].includes('navigation.ai-assistant'));
        assert.equal(task.assistant.question, MUNIGUIA_ASSISTANT_QUESTIONS[task.pageId]);
        const url = new URL(task.assistant.href, 'https://municontrol.local');
        assert.equal(url.pathname, '/ia.html');
        assert.deepEqual([...url.searchParams.keys()], ['question']);
        assert.equal(url.searchParams.get('question'), task.assistant.question);
      }
    }
    assert.deepEqual(resolved.recommendedTaskIds, EXPECTED_RECOMMENDED[role].slice(0, 4), role);
    assert.deepEqual(
      resolved.tasks.slice(0, resolved.recommendedTaskIds.length).map(task => task.id),
      resolved.recommendedTaskIds,
      role,
    );
  }
});

test('limited roles and tenantless platform support never inherit private tasks', () => {
  const limitedIds = ['locate-territory', 'understand-role'];
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.deepEqual(resolveMunicipalTaskCatalog(inputFor(role)).tasks.map(task => task.id), limitedIds, role);
  }
  const tenantless = resolveMunicipalTaskCatalog(inputFor('SUPER_ADMIN', [
    'session.read',
    'navigation.workspace',
    'navigation.help',
  ]));
  assert.deepEqual(tenantless.tasks.map(task => task.id), ['understand-role']);
  assert.deepEqual(tenantless.recommendedTaskIds, ['understand-role']);
});

test('A to B projections are stateless and do not retain tasks from the prior identity', () => {
  const executive = resolveMunicipalTaskCatalog(inputFor('INTENDENTE'));
  const limited = resolveMunicipalTaskCatalog(inputFor('TENANT_USER'));
  assert.ok(executive.tasks.some(task => task.id === 'review-priorities'));
  assert.equal(limited.tasks.some(task => task.id === 'review-priorities'), false);
  assert.deepEqual(limited.tasks.map(task => task.id), ['locate-territory', 'understand-role']);
  assert.notEqual(executive.tasks, limited.tasks);
});

test('the resolver fails closed on malformed, stale or ambiguous projections', () => {
  const valid = inputFor('INTENDENTE');
  for (const candidate of [
    null,
    {},
    { ...valid, extra: true },
    { ...valid, role: 'intendente' },
    { ...valid, variant: 'municipal-operations' },
    { ...valid, policyVersion: 'stale' },
    { ...valid, capabilities: [...valid.capabilities, valid.capabilities[0]] },
    { ...valid, capabilities: [...valid.capabilities, 'navigation.future'] },
    { ...valid, capabilities: valid.capabilities.filter(capability => capability !== 'session.read') },
    { ...valid, capabilities: valid.capabilities.filter(capability => capability !== 'navigation.workspace') },
  ]) assert.equal(resolveMunicipalTaskCatalog(candidate), null);
});

test('search is local, accent-insensitive, deterministic and bounded', () => {
  const tasks = resolveMunicipalTaskCatalog(inputFor('INTENDENTE')).tasks;
  assert.equal(normalizeMunicipalTaskSearch('  NÓmina / Cálculo  '), 'nomina calculo');
  assert.equal(searchMunicipalTasks(tasks, '  PERSÓNAL ').some(task => task.id === 'review-grh-summary'), true);
  assert.deepEqual(searchMunicipalTasks(tasks, 'decisiones compromisos').map(task => task.id), ['follow-decisions']);
  assert.deepEqual(searchMunicipalTasks(tasks, 'termino inexistente'), []);
  assert.equal(searchMunicipalTasks(tasks, '', 3).length, 3);
  assert.equal(searchMunicipalTasks(tasks, 'a', 999).length <= 12, true);
  assert.deepEqual(searchMunicipalTasks(null, 'personal'), []);
});

test('payroll run task uses the canonical page and appears only with navigation.hacienda', () => {
  const page = MUNIGUIA_CATALOG.pages.payrollRunControl;
  assert.ok(page);
  assert.equal(page.requiredCapability, 'navigation.hacienda');
  assert.equal(page.href, 'corridas-grh.html');
  assert.deepEqual(page.aliases, ['/corridas-grh', '/corridas-grh.html']);
  assert.ok(MUNICIPAL_TASK_CATALOG.taskDefinitions.some(task =>
    task.id === 'review-payroll-runs' && task.pageId === 'payrollRunControl'));
  const allowed = resolveMunicipalTaskCatalog(inputFor('CONTADOR'));
  const task = allowed.tasks.find(candidate => candidate.id === 'review-payroll-runs');
  assert.ok(task);
  assert.equal(task.label, 'Revisar corridas y marcas de cierre');
  assert.equal(task.description,
    'Revisá por período cabeceras válidas, detalle asociado, marcas informadas y registros en cuarentena.');
  assert.equal(task.capability, 'navigation.hacienda');
  assert.equal(task.href, `/${page.href}`);
  assert.equal(task.helpHref, '/manuales.html#corridas-grh');
  assert.equal(task.assistant.capability, 'navigation.ai-assistant');
  assert.equal(task.assistant.question, MUNIGUIA_ASSISTANT_QUESTIONS.payrollRunControl);

  const denied = resolveMunicipalTaskCatalog(inputFor('CONTADOR',
    ROLE_CAPABILITIES.CONTADOR.filter(capability => capability !== 'navigation.hacienda')));
  assert.equal(denied.tasks.some(candidate => candidate.id === 'review-payroll-runs'), false);
});

test('fixed-concept task uses the governed page and remains capability-bound', () => {
  const page = MUNIGUIA_CATALOG.pages.fixedConceptControl;
  assert.ok(page);
  assert.equal(page.requiredCapability, 'navigation.hacienda');
  assert.equal(page.href, 'conceptos-fijos.html');
  assert.deepEqual(page.aliases, ['/conceptos-fijos', '/conceptos-fijos.html']);
  const allowed = resolveMunicipalTaskCatalog(inputFor('CONTADOR'));
  const task = allowed.tasks.find(candidate => candidate.id === 'review-fixed-concepts');
  assert.ok(task);
  assert.equal(task.capability, 'navigation.hacienda');
  assert.equal(task.href, '/conceptos-fijos.html');
  assert.equal(task.helpHref, '/manuales.html#conceptos-fijos');
  assert.equal(task.assistant.question, MUNIGUIA_ASSISTANT_QUESTIONS.fixedConceptControl);

  const denied = resolveMunicipalTaskCatalog(inputFor('CONTADOR',
    ROLE_CAPABILITIES.CONTADOR.filter(capability => capability !== 'navigation.hacienda')));
  assert.equal(denied.tasks.some(candidate => candidate.id === 'review-fixed-concepts'), false);
});

test('management comparison is a nontechnical executive task without a new grant', () => {
  const page = MUNIGUIA_CATALOG.pages.managementTimeline;
  assert.ok(page);
  assert.equal(page.requiredCapability, 'navigation.dashboard');
  assert.equal(page.href, 'gestiones.html');
  assert.deepEqual(page.aliases, ['/gestiones', '/gestiones.html']);

  const allowed = resolveMunicipalTaskCatalog(inputFor('INTENDENTE'));
  const task = allowed.tasks.find(candidate => candidate.id === 'compare-managements');
  assert.ok(task);
  assert.equal(task.capability, 'navigation.dashboard');
  assert.equal(task.href, '/gestiones.html');
  assert.equal(task.helpHref, '/manuales.html#gestiones');
  assert.equal(task.assistant.question, MUNIGUIA_ASSISTANT_QUESTIONS.managementTimeline);

  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(resolveMunicipalTaskCatalog(inputFor(role)).tasks.some(candidate =>
      candidate.id === 'compare-managements'), false, role);
  }
});

test('garden-network review is capability-bound and reuses the exact governed handoffs', () => {
  const page = MUNIGUIA_CATALOG.pages.gardenNetwork;
  assert.ok(page);
  assert.equal(page.requiredCapability, 'navigation.organization-analytics');
  assert.equal(page.href, 'jardines.html');
  assert.deepEqual(page.aliases, ['/jardines', '/jardines.html']);

  const allowed = resolveMunicipalTaskCatalog(inputFor('INTENDENTE'));
  const task = allowed.tasks.find(candidate => candidate.id === 'review-garden-network');
  assert.ok(task);
  assert.equal(task.label, 'Revisar red de jardines');
  assert.equal(task.capability, 'navigation.organization-analytics');
  assert.equal(task.href, '/jardines.html');
  assert.equal(task.helpHref, '/manuales.html#jardines');
  assert.equal(task.assistant.question, '¿Cómo cambió la observación mensual en jardines?');

  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(resolveMunicipalTaskCatalog(inputFor(role)).tasks.some(candidate =>
      candidate.id === 'review-garden-network'), false, role);
  }
});

test('MuniGuía and Assistant handoffs remain independently capability-bound', () => {
  const capabilities = ROLE_CAPABILITIES.INTENDENTE.filter(capability => capability !== 'navigation.help');
  const projected = resolveMunicipalTaskCatalog(inputFor('INTENDENTE', capabilities));
  assert.ok(projected);
  assert.ok(projected.tasks.length > 0);
  assert.ok(projected.tasks.every(task => task.helpHref === null));
  assert.ok(projected.tasks.some(task => task.assistant));
  const withoutAssistant = resolveMunicipalTaskCatalog(inputFor('INTENDENTE',
    ROLE_CAPABILITIES.INTENDENTE.filter(capability => capability !== 'navigation.ai-assistant')));
  assert.ok(withoutAssistant.tasks.every(task => task.assistant === null));
});

test('task center integration is local, sink-free and mounted once across legacy and React shells', async () => {
  const [runtime, inicio, manuals, appShell, bridge, ...reactEntries] = await Promise.all([
    readFile(path.join(ROOT, 'js', 'municipal-task-center.js'), 'utf8'),
    readFile(path.join(ROOT, 'inicio.html'), 'utf8'),
    readFile(path.join(ROOT, 'manuales.html'), 'utf8'),
    readFile(path.join(ROOT, 'frontend', 'src', 'components', 'AppShell.tsx'), 'utf8'),
    readFile(path.join(ROOT, 'frontend', 'src', 'components', 'MunicipalTaskCenterBridge.tsx'), 'utf8'),
    ...['calidad', 'conceptos-fijos', 'ejecutivo', 'estructura', 'gestiones', 'jardines', 'territorio', 'trayectoria'].map(name =>
      readFile(path.join(ROOT, 'frontend', `${name}.html`), 'utf8')),
  ]);
  assert.doesNotMatch(runtime, /\.innerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(/u);
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest)\s*\(|localStorage|sessionStorage/u);
  assert.match(inicio, /id="workspaceActions"[\s\S]*data-municipal-task-finder/);
  assert.ok(inicio.indexOf('id="muniguiaOnboardingMount"') < inicio.indexOf('id="workspaceActions"'));
  assert.doesNotMatch(inicio, /Tus accesos principales|id="journeyList"/);
  assert.match(manuals, /id="tareas"[\s\S]*data-task-finder-mode="catalog"/);
  assert.match(appShell, /MunicipalTaskCenterBridge/);
  assert.doesNotMatch(bridge, /\.then\([\s\S]{0,240}runtime\.unmount\(\)/);
  assert.match(bridge, /return \(\) => \{[\s\S]{0,80}runtime\.unmount\(\)/);
  for (const entry of reactEntries) {
    assert.equal((entry.match(/\/js\/municipal-task-center\.js/g) || []).length, 1);
  }
});
