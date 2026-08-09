import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

const livingManuals = [
  'docs/MANUAL_INTEGRAL.md',
  'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
  'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
  'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
  'docs/MASTER_PLAN_STATUS.md',
  'docs/GRH_OPERATIONS_ROADMAP.md',
  'docs/GRH_PIPELINE_RUN_CONTRACT.md',
  'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
  'docs/RBAC_ABAC_DATA_MODEL.md',
  'docs/PRISMA_BASELINE_Y_DRIFT.md',
  'docs/GRH_PRIVACY_AGGREGATION_POLICY.md',
  'docs/GRH_GEOSPATIAL_READINESS.md',
  'docs/DATA_SOURCE_REGISTER.md',
  'docs/data/grh-semantic.md',
];

test('the living documentation package exists and distinguishes local, conditional and roadmap states', () => {
  for (const relativePath of livingManuals) {
    assert.equal(existsSync(path.join(root, relativePath)), true, `${relativePath} must exist`);
    const source = read(relativePath);
    assert.match(source, /^#\s+/m, `${relativePath} needs a title`);
    assert.doesNotMatch(source, /personas_junin.*(?:cruzad[ao]|integrada|migrada)/i, `${relativePath} must not authorize Personas merging`);
  }

  const integral = read('docs/MANUAL_INTEGRAL.md');
  assert.match(integral, /Versión documental: 1\.9\.0/i);
  assert.match(integral, /v1\.8\.1[\s\S]{0,80}b82c0b3[\s\S]{0,80}master[\s\S]{0,80}tag/i);
  assert.match(integral, /dpl_A19n7grSSyuum3zuSQcdcaVKmt8F[\s\S]{0,80}Ready/i);
  assert.match(integral, /10\/10.*exit `0`/i);
  assert.match(integral, /db:seed[\s\S]*retirado[\s\S]*código `1`/i);
  assert.match(integral, /máquina pura de lifecycle[\s\S]*no persiste ni\s+habilita identidades/i);
  assert.match(integral, /no existe.*entorno de demo por\s+rol certificado/is);
  assert.match(integral, /403.*cross-tenant/i);
  assert.match(integral, /grh-semantic-v2/);
  assert.match(integral, /grh-executive-v2/);
  assert.match(integral, /grh-quality-v1/);
  assert.match(integral, /GET \/api\/grh-close[\s\S]{0,160}grh-close-v1/i);
  assert.match(integral, /\/api\/grh-data[\s\S]{0,180}410 GRH_RAW_CONTRACT_RETIRED[\s\S]{0,120}sin leer artefactos/i);

  const user = read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md');
  assert.match(user, /\| Versión \| 1\.9\.0 \|/);
  for (const state of ['Operativo', 'Condicionado', 'Roadmap']) assert.match(user, new RegExp(state, 'i'));
  assert.match(user, /Tesorería/);
  assert.match(user, /Compras/);
  assert.match(user, /no existe un rol específico/i);
  assert.match(user, /participantes por centro de costo/i);
  assert.match(user, /participantes por sector/i);
  assert.match(user, /participantes por categoría de acuerdo de origen/i);
  assert.match(user, /k=5[\s\S]{0,180}k=10/i);
  assert.match(user, /supresión complementaria/i);
  assert.match(user, /cardinalidad desconocida|cantidad de personas distintas.*protegida/is);
  assert.match(user, /close_explanation[\s\S]{0,180}Cierre explicado/i);
  assert.match(user, /close_explanation[\s\S]{0,420}422/i);

  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  assert.match(technical, /\*\*Versión:\*\* 1\.9\.0/);
  assert.match(technical, /shared\/route-policy\.cjs/);
  assert.match(technical, /recurso:acción/);
  assert.match(technical, /desconocid[oa]s fallan cerrados/i);
  assert.match(technical, /17\.1 Alta administrativa retirada[\s\S]*POST \/api\/admin\/tenants[\s\S]*ACCOUNT_LIFECYCLE_NOT_GOVERNED/i);
  assert.match(technical, /PUT\/PATCH de tenant[\s\S]*TENANT_LIFECYCLE_NOT_GOVERNED/i);
  assert.doesNotMatch(technical, /Ruta administrativa disponible/i);
  assert.match(technical, /78 firmas[\s\S]{0,80}36 Serverless[\s\S]{0,40}42 Express/i);
  assert.match(technical, /GET \/api\/grh-executive[\s\S]{0,240}grh-executive-v2/i);
  assert.match(technical, /GET \/api\/grh-quality[\s\S]{0,240}grh-quality-v1/i);
  assert.match(technical, /GET \/api\/grh-close[\s\S]{0,240}grh-close-v1/i);
  assert.match(technical, /\/api\/grh-data[\s\S]{0,240}410[\s\S]{0,120}sin leer artefactos/i);
  assert.match(technical, /profile[\s\S]{0,100}semantic[\s\S]{0,120}exclusivamente en backend/i);

  const roadmap = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');
  assert.match(roadmap, /Versión: 1\.9\.0/i);
  for (const capability of ['Apache ECharts', 'MapLibre GL JS', 'PostGIS', 'deck.gl', 'OpenTelemetry', 'CDC']) {
    assert.match(roadmap, new RegExp(capability.replace('.', '\\.'), 'i'));
  }
  assert.match(roadmap, /No se publican correos ni contraseñas fijas/i);
  assert.match(roadmap, /grh-close-v1[\s\S]{0,240}conciliación por período/i);

  const semantic = read('docs/data/grh-semantic.md');
  assert.match(semantic, /Capa semántica GRH v2/i);
  assert.match(semantic, /distinct_participants_by_year/);
  assert.match(semantic, /No se exporta\s+ninguna clave individual/i);
  assert.match(semantic, /grh-semantic-v1`?\s+se rechaza/i);

  const privacy = read('docs/GRH_PRIVACY_AGGREGATION_POLICY.md');
  assert.match(privacy, /Ranking interactivo[\s\S]{0,80}\| 5 participantes/i);
  assert.match(privacy, /salida portable[\s\S]{0,80}\| 10 participantes/i);
  assert.match(privacy, /Proteger antes de seleccionar el top/i);
  assert.match(privacy, /Supresión complementaria/i);
  assert.match(privacy, /Cardinalidad desconocida/i);
  assert.match(privacy, /Comparación mensual segura[\s\S]{0,320}mes calendario inmediato/i);

  const geoReadiness = read('docs/GRH_GEOSPATIAL_READINESS.md');
  assert.match(geoReadiness, /pares de coordenadas utilizables \| 0\/872/i);
  assert.match(geoReadiness, /grh-geo-readiness-v1/);
  assert.match(geoReadiness, /k≥10/);
  assert.match(geoReadiness, /layers: \[\] hasta que existan polígonos oficiales/i);
  assert.match(geoReadiness, /no debe activar hoy un mapa GRH/i);
  assert.doesNotMatch(geoReadiness, /ready_for_aggregate_layer[\s\S]{0,120}(?:actual|operativ[oa]|disponible)/i);

  const sourceRegister = read('docs/DATA_SOURCE_REGISTER.md');
  assert.match(sourceRegister, /data-source-register-v1/);
  assert.match(sourceRegister, /grh-junin[\s\S]{0,260}Aprobada para ingeniería local/i);
  assert.match(sourceRegister, /personas-junin[\s\S]{0,160}Excluida/i);
  assert.match(sourceRegister, /personas-junin[\s\S]{0,520}Ninguno:[\s\S]{0,120}no analizar[\s\S]{0,120}perfilar[\s\S]{0,120}cruzar[\s\S]{0,120}migrar[\s\S]{0,120}publicar[\s\S]{0,120}fallback/i);
  assert.match(sourceRegister, /cuentas-claras-candidate-2026[\s\S]{0,220}Cuarentena/i);
  assert.match(sourceRegister, /Encontrar un archivo[\s\S]{0,180}no autoriza/i);
  assert.match(sourceRegister, /hash del payload GZIP[\s\S]{0,100}sin extraerlo a disco/i);
  assert.match(sourceRegister, /CSV[\s\S]{0,12}ley[oó] la cabecera y cont[oó]\s+l[ií]neas/i);
  assert.doesNotMatch(sourceRegister, /C:\\Users\\|[A-Z]:\\/i);
  for (const relativePath of [
    'README.md',
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MASTER_PLAN_STATUS.md',
  ]) {
    assert.match(read(relativePath), /DATA_SOURCE_REGISTER\.md/,
      `${relativePath} must link the governed source register`);
  }

  for (const relativePath of [
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MASTER_PLAN_STATUS.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
  ]) {
    assert.doesNotMatch(read(relativePath), /(?:75|77) firmas|(?:33|35) Serverless/i,
      `${relativePath} contains the retired route ceiling`);
  }

  for (const relativePath of [
    'dashboard.html',
    'grh-ejecutivo.html',
    'control.html',
    'rrhh.html',
    'hacienda.html',
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /\/api\/grh-data|artifact=(?:profile|semantic)/i,
      `${relativePath} must not request a raw GRH contract`);
    assert.match(source, /js\/grh-secure-data\.js/,
      `${relativePath} must use the safe GRH projection client`);
  }

  const roleJourneys = read('docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md');
  assert.match(roleJourneys, /\*\*Versión:\*\* 1\.9\.0/);
  assert.match(roleJourneys, /Operativo local[\s\S]*Condicionado[\s\S]*Roadmap/i);
  assert.match(roleJourneys, /maker[\s\S]*checker/i);
  assert.match(roleJourneys, /FIRST_LOGIN_REQUIRED/);
  assert.match(roleJourneys, /no se deben\s+publicar “usuarios de cada rol”/i);
  assert.match(roleJourneys, /403[\s\S]*cross-tenant/i);
  assert.match(roleJourneys, /shared\/route-policy\.cjs/);
  assert.match(roleJourneys, /reportes\.html[\s\S]*bundle GRH privado `profile \+ semantic`/i);
  assert.doesNotMatch(roleJourneys, /^\| \[`reportes\.html`\]\([^)]*\) \| `data_points`/im);

  const benchmark = read('docs/GOVTECH_BENCHMARK.md');
  assert.match(benchmark, /- Versión: 1\.9\.0/);
  assert.match(benchmark, /seed \*\*no prepara ningún rol\*\*/i);
  assert.doesNotMatch(benchmark, /seed prepara `SUPER_ADMIN`/i);

  const rbacModel = read('docs/RBAC_ABAC_DATA_MODEL.md');
  assert.match(rbacModel, /propuesta técnica; no implementada, no migrada y sin cuentas creadas/i);
  assert.match(rbacModel, /baseline[\s\S]*modo sombra[\s\S]*intersección restrictiva/i);
  assert.match(rbacModel, /no ejecutar `db push`, `migrate dev`, `migrate reset` ni `migrate deploy`/i);
  assert.match(rbacModel, /maker[\s\S]*checker/i);
});

test('O2A real-local evidence is documented without promoting O2B or production claims', () => {
  const operations = read('docs/GRH_OPERATIONS_ROADMAP.md');
  assert.match(operations, /Sprint O2A[\s\S]*completo y probado.*local/i);
  assert.match(operations, /promoted\/PUBLISHED[\s\S]{0,100}105,5 s/i);
  assert.match(operations, /duplicate\/DUPLICATE[\s\S]{0,100}294 ms/i);
  assert.match(operations, /1 versión, 1 activación[\s\S]{0,100}1 receipt de duplicado/i);
  assert.match(operations, /Last-known-good[\s\S]{0,100}Byte-estable/i);
  assert.match(operations, /0 locks, residuos y workspaces activos al cierre/i);
  assert.match(operations, /257 tablas[\s\S]{0,80}6\.573\.057 filas[\s\S]{0,80}88,99\/100/i);
  assert.match(operations, /Sprint O2B[\s\S]*pendiente; O2A no la habilita/i);
  assert.match(operations, /ledger[\s\S]{0,100}no está firmado/i);
  assert.match(operations, /O2A\.1[\s\S]{0,240}descriptor[\s\S]{0,220}`fstat`/i);
  assert.match(operations, /`wx`[\s\S]{0,80}`0600`/i);
  assert.match(operations, /No se repitió[\s\S]{0,120}44 MB/i);

  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  assert.match(technical, /15\.2 Procedimiento y evidencia O2A/i);
  assert.match(technical, /PUBLISHED[\s\S]{0,100}únicamente en\s+`LOCAL_STATE`/i);
  assert.match(technical, /no usó red|no habilitar red/i);
  assert.match(technical, /ledger local no está firmado/i);
  assert.match(technical, /O2A\.1[\s\S]{0,260}descriptor[\s\S]{0,220}`fstat`/i);
  assert.match(technical, /copias privadas[\s\S]{0,100}`wx`[\s\S]{0,60}`0600`/i);

  const user = read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md');
  assert.match(user, /Replay de ingeniería O2A/i);
  assert.match(user, /PUBLISHED` significa “activado en el estado local declarado”/i);
  assert.match(user, /No significa publicación en DB, API o producción/i);

  const enterprise = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');
  assert.match(enterprise, /O2A\/O2A\.1: replay del snapshot GRH[\s\S]{0,260}Replay real previo preservado/i);
  assert.match(enterprise, /O2B: extracción conectada\/programada[\s\S]{0,180}no activada/i);

  for (const relativePath of [
    'docs/GRH_OPERATIONS_ROADMAP.md',
    'docs/MASTER_PLAN_STATUS.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'manuales.html',
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /(?:extracción|actualización) diaria (?:activa|operativa|certificada)/i,
      `${relativePath} must not promote O2B`);
  }
});

test('documentation 1.9.0 preserves the governed close, Bot, immutable replay and release truths', () => {
  const integral = read('docs/MANUAL_INTEGRAL.md');
  const user = read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md');
  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  const master = read('docs/MASTER_PLAN_STATUS.md');
  const enterprise = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');
  const operations = read('docs/GRH_OPERATIONS_ROADMAP.md');
  const pipeline = read('docs/GRH_PIPELINE_RUN_CONTRACT.md');
  const privacy = read('docs/GRH_PRIVACY_AGGREGATION_POLICY.md');
  const inApp = read('manuales.html');
  const roleJourneys = read('docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md');
  const benchmark = read('docs/GOVTECH_BENCHMARK.md');

  for (const source of [integral, user, technical, master, enterprise, roleJourneys, benchmark, inApp]) {
    assert.match(source, /1\.9\.0(?![-+0-9A-Za-z.])/, 'every living manual must expose candidate version 1.9.0');
  }

  for (const source of [integral, user, technical, master, enterprise, operations, pipeline, privacy, inApp]) {
    assert.match(source, /personas_junin[\s\S]{0,260}(?:no se\s+analiza|no analizar)[\s\S]{0,260}fallback/i,
      'Personas must remain absolutely excluded');
  }

  for (const source of [integral, user, technical, master, enterprise, privacy, inApp]) {
    assert.match(source, /grh-close-v1/);
    assert.match(source, /(?:meses? calendario )?consecutiv[oa]s?[\s\S]{0,180}k≥10|k≥10[\s\S]{0,180}consecutiv[oa]s?/i);
    assert.match(source, /(?:moneda no (?:está )?declarada|moneda no disponible|no afirma moneda)/i);
    assert.match(source, /(?:no (?:prueba|certifica|afirma)[\s\S]{0,100}pago|no pago)/i);
  }
  assert.match(technical, /conciliación real por período/i);
  assert.match(master, /P1[\s\S]{0,120}global como mensual|global-como-mensual/i);
  assert.match(user, /close_explanation[\s\S]{0,420}422/i);
  assert.match(user, /13\/13[\s\S]{0,80}sin certificar deployment/i);
  assert.match(technical, /una sola lectura|misma lectura privada/i);
  assert.match(technical, /año sin mes[\s\S]{0,120}422/i);

  for (const source of [integral, technical, master, enterprise, operations, pipeline, inApp]) {
    assert.match(source, /O2A\.1/);
    assert.match(source, /descriptor[\s\S]{0,260}`?fstat`?/i);
    assert.match(source, /`?wx`?[\s\S]{0,100}`?0600`?/i);
    assert.match(source, /(?:host[\s\S]{0,80}comprometido|comprometido[\s\S]{0,80}host)/i);
  }
  assert.match(operations, /54 pases[\s\S]{0,80}1 smoke opt-in/i);
  assert.match(pipeline, /No[\s\S]{0,40}(?:volvió a ejecutar|nuevo replay real)[\s\S]{0,100}44 MB/i);

  for (const source of [integral, user, technical, master, enterprise]) {
    assert.match(source, /login institucional|acceso institucional/i);
    assert.match(source, /sin\s+(?:usuarios\s+)?demo|no\s+publica\s+(?:identidades|usuarios)\s+demo/i);
    assert.match(source, /b82c0b3[\s\S]{0,180}master/i);
    assert.match(source, /10\/10[\s\S]{0,120}(?:exit|código de salida)\s*`?0`?/i);
  }
  assert.match(inApp, /acceso institucional/i);
  assert.match(inApp, /no publica usuarios demo/i);
  assert.match(inApp, /b82c0b3[\s\S]{0,100}master/i);
  assert.match(inApp, /release:truth:check[\s\S]{0,100}10\/10[\s\S]{0,100}exit\s*<code>0<\/code>/i);

  const routePolicy = require('../shared/route-policy.cjs');
  const runtimeCounts = routePolicy.PROTECTED_ROUTES.reduce((counts, route) => {
    counts[route.runtime] = (counts[route.runtime] || 0) + 1;
    return counts;
  }, {});
  assert.equal(routePolicy.PROTECTED_ROUTES.length, 78);
  assert.deepEqual(runtimeCounts, { serverless: 36, express: 42 });
  assert.equal(Object.keys(routePolicy.RESOURCES).length, 26);
  assert.equal(Object.keys(routePolicy.ACTIONS).length, 12);
  assert.equal(Object.keys(routePolicy.PERMISSIONS).length, 46);
  for (const source of [integral, user, technical, master, enterprise, roleJourneys, benchmark, inApp]) {
    assert.match(source, /26\s+recursos[\s\S]{0,80}12\s+acciones[\s\S]{0,80}46\s+permisos/i);
    assert.match(source, new RegExp(`${routePolicy.PROTECTED_ROUTES.length}\\s+firmas`, 'i'));
    assert.match(source, new RegExp(`${runtimeCounts.serverless}\\s+Serverless[\\s\\S]{0,60}${runtimeCounts.express}\\s+Express`, 'i'));
  }
});

test('documentation 1.9.0 records the exact role workspace without claiming accounts from visual guidance', () => {
  const accessPolicy = require('../shared/access-policy.cjs');
  const expectedRoles = [
    'SUPER_ADMIN',
    'TENANT_ADMIN',
    'INTENDENTE',
    'CONTADOR',
    'TENANT_USER',
    'INSPECTOR',
    'DEMO',
  ];
  assert.equal(accessPolicy.ACCESS_POLICY_VERSION, '2026-08-09.1');
  assert.deepEqual(Object.keys(accessPolicy.ROLE_HOME_PROFILE).sort(), expectedRoles.sort());
  assert.ok(expectedRoles.every(role => accessPolicy.ROLE_CAPABILITIES[role].includes('navigation.workspace')));

  const roleJourneys = read('docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md');
  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  const user = read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md');
  const master = read('docs/MASTER_PLAN_STATUS.md');
  const enterprise = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');
  const integral = read('docs/MANUAL_INTEGRAL.md');
  const benchmark = read('docs/GOVTECH_BENCHMARK.md');
  const inApp = read('manuales.html');

  for (const source of [integral, user, technical, master, enterprise, roleJourneys, benchmark, inApp]) {
    assert.match(source, /1\.9\.0(?![-+0-9A-Za-z.])/);
    assert.match(source, /inicio\.html/);
    assert.match(source, /siete roles|siete variantes|siete inicios/i);
    assert.match(source, /(?:sin cuentas|no (?:se )?crea(?:ron)? (?:una )?(?:cuenta|cuentas|usuarios|identidades)|no aprovisiona cuentas|no prueba cuentas|no declara cuentas)/i);
  }

  assert.match(technical, /capabilities: string\[\][\s\S]{0,160}accessPolicyVersion[\s\S]{0,160}homeProfile/i);
  assert.match(technical, /variant[\s\S]{0,120}defaultPath[\s\S]{0,120}priorityCapabilities/i);
  for (const variant of [
    'platform-governance',
    'executive-leadership',
    'municipal-operations',
    'financial-control',
    'municipal-limited',
    'territorial-unassigned',
    'controlled-preview',
  ]) assert.match(roleJourneys, new RegExp(variant));
  assert.match(user, /Reportes y su consumidor está\s+cerrada localmente/i);
  assert.doesNotMatch(user, /Reportes y su consumidor está en\s+curso/i);
  assert.match(benchmark, /db:seed[\s\S]{0,120}retirado[\s\S]{0,120}código `1`/i);

  for (const source of [integral, technical, master, enterprise, benchmark]) {
    assert.match(source, /\/inicio/);
    assert.match(source, /31\/31/);
    assert.match(source, /45\/45/);
    assert.match(source, /(?:digest|SHA-256)/i);
  }

  assert.match(inApp, /10\/10/);
  assert.match(inApp, /\/roles/);
});

test('MuniGuia 1.9.0 is documented as a local-only contextual-help candidate', () => {
  const candidatePaths = [
    'CHANGELOG.md',
    'docs/MASTER_PLAN_STATUS.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
    'docs/GOVTECH_BENCHMARK.md',
    'manuales.html',
  ];

  for (const relativePath of candidatePaths) {
    const source = read(relativePath);
    assert.match(source, /1\.9\.0(?![-+0-9A-Za-z.])/, `${relativePath} must expose 1.9.0`);
    assert.match(source, /MuniGu[ií]a/i);
    assert.match(source, /muniguia-contextual-v1/);
    assert.match(source, /10\/10/);
    assert.match(source, /532/);
    assert.match(source, /1\s+smoke\s+opt-in\s+omitido/i);
    assert.match(source, /backend[\s\S]{0,40}20\/20/i);
    assert.match(source, /(?:todav[ií]a\s+)?(?:no\s+(?:tiene|existe)|sin)\s+push[\s\S]{0,100}tag[\s\S]{0,100}Preview[\s\S]{0,100}Producci[oó]n/i,
      `${relativePath} must keep 1.9.0 local-only`);
  }

  for (const relativePath of [
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
    'docs/GOVTECH_BENCHMARK.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'manuales.html',
  ]) {
    const source = read(relativePath);
    assert.match(source, /proyecci[oó]n\s+en\s+memoria[\s\S]{0,100}\/api\/auth\/me/i);
    assert.match(source, /no agrega requests de IA, GRH u otras APIs[\s\S]{0,80}(?:accesos a )?storage/i);
    assert.match(source, /no lee indicadores/i);
    assert.match(source, /no\s+(?:concede|crea)\s+permisos/i);
  }

  for (const relativePath of [
    'CHANGELOG.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
    'docs/GOVTECH_BENCHMARK.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'manuales.html',
  ]) {
    const source = read(relativePath);
    assert.match(source, /selectors?[\s\S]{0,30}anchors?/i);
    assert.match(source, /target[\s\S]{0,80}(?:omite|se omite)[\s\S]{0,30}Ubicar/i);
  }
});

test('versioned 1.9.0 candidate preserves the exact public 1.8.1 evidence without moving its tag', () => {
  const rootManifest = JSON.parse(read('package.json'));
  const rootLock = JSON.parse(read('package-lock.json'));
  const backendManifest = JSON.parse(read('backend/package.json'));
  assert.equal(rootManifest.name, 'municipio-junin');
  assert.equal(rootManifest.version, '1.9.0');
  assert.equal(rootManifest.private, true);
  assert.equal(rootLock.name, rootManifest.name);
  assert.equal(rootLock.version, rootManifest.version);
  assert.equal(rootLock.packages[''].name, rootManifest.name);
  assert.equal(rootLock.packages[''].version, rootManifest.version);
  assert.equal(backendManifest.version, '1.0.0', 'backend service version remains independent');

  const sources = [
    'CHANGELOG.md',
    'docs/MASTER_PLAN_STATUS.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
    'docs/GOVTECH_BENCHMARK.md',
    'manuales.html',
  ].map(read);

  for (const source of sources) {
    assert.match(source, /1\.8\.1(?![-+0-9A-Za-z.])/);
    assert.match(source, /WP0-L/);
    assert.match(source, /IAM-MAP-01/);
    assert.match(source, /UX-E2A/);
    assert.match(source, /(?:no|todav[ií]a no|a[uú]n no)[^\r\n]{0,160}conectad/i,
      'WP0-L must not be represented as a connected observation');
    assert.match(source, /(?:no persiste|sin persistencia)/i,
      'IAM-MAP-01 must not imply persisted users');
    assert.match(source, /(?:no crea|sin)[^\r\n]{0,120}(?:usuarios|identidades|cuentas)/i,
      'the release must not claim user creation');
    assert.match(source, /(?:no concede|sin autoridad|no autoriza|sin autorización|no acredita seguridad por roles)/i,
      'UX-E2A must not imply client-side authorization');
    assert.match(source, /master/);
  }

  for (const source of [
    read('CHANGELOG.md'),
    read('docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md'),
    read('manuales.html'),
  ]) {
    assert.match(source, /fa5dcc5/);
    assert.match(source, /\/dashboard/);
    assert.match(source, /\/inicio/);
    assert.match(source, /\/manuales/);
    assert.match(source, /única[\s\S]{0,100}inyección[\s\S]{0,100}Vercel Live/i);
    assert.match(source, /cinco[\s\S]{0,180}401/i);
    assert.match(source, /contr(?:ato|actual)[\s\S]{0,120}(?:específic[oa][\s\S]{0,40}ruta|por ruta)/i);
  }

  for (const source of sources) {
    assert.match(source, /b82c0b3/i);
    assert.match(source, /master/i);
    assert.match(source, /tag[\s\S]{0,40}v1\.8\.1|v1\.8\.1[\s\S]{0,40}tag/i);
    assert.match(source, /dpl_A19n7grSSyuum3zuSQcdcaVKmt8F[\s\S]{0,80}Ready/i);
    assert.match(source, /(?:gate|release:truth:check)[\s\S]{0,160}10\/10[\s\S]{0,100}exit\s*`?(?:<code>)?0/i);
    assert.match(source, /390(?:\s*px)?[\s\S]{0,120}1440(?:\s*px)?/i);
    assert.match(source, /overflow/i);
    assert.match(source, /(?:consola|console)/i);
    assert.match(source, /(?:requests? externos?|external)/i);
    assert.match(source, /(?:requests?\s+privados?|destinos\s+privados|links?\s+privados|externos\s*(?:\/|ni)\s*privados)/i);
    assert.match(source, /GitHub Release[\s\S]{0,80}live/i);
    assert.match(source, /no\s+(?:demuestra|declara|acredita|certifica|infiere)[\s\S]{0,180}DB[\s\S]{0,180}cuentas[\s\S]{0,180}autorización\s+positiva[\s\S]{0,180}datos[\s\S]{0,40}remotos/i,
      'public release evidence must not be promoted to DB, account, authorization or remote-data evidence');
    assert.match(source, /(?:s[oó]lo\s+registr(?:a|ó)|registro)[\s\S]{0,100}(?:evidencia documental\s+)?post-release/i);
    assert.match(source, /no (?:mueve|movi[oó])[\s\S]{0,60}(?:el )?tag/i);
    assert.doesNotMatch(source, /v1\.8\.1[\s\S]{0,180}(?:pendiente de push|requiere push|permanece local)/i,
      'released v1.8.1 must not be described as a local candidate');
  }

  const prismaRunbook = read('docs/PRISMA_BASELINE_Y_DRIFT.md');
  assert.match(prismaRunbook, /\*\*Versi\\u00f3n:\*\* 1\.1\.0/);
  assert.match(prismaRunbook, /WP0-L implementado y validado localmente/);
  assert.match(prismaRunbook, /ejecución conectada[\s\S]{0,100}pendiente/i);
});

test('the public role tour is documented as visual-only and cannot impersonate authorization', () => {
  const sources = [
    read('CHANGELOG.md'),
    read('docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md'),
    read('manuales.html'),
  ];

  for (const source of sources) {
    assert.match(source, /1\.8\.1/);
    assert.match(source, /\/roles/);
    assert.match(source, /(?:recorrido|tour) visual/i);
    assert.match(source, /(?:no autenticado|sin autenticación|no solicita (?:autenticación|credenciales|login))/i);
    assert.match(source, /no emite ni acepta\s+JWT/i);
    assert.match(source, /no autoriza\s+acciones/i);
    assert.match(source, /no crea\s+cuentas/i);
    assert.match(source, /no consulta\s+APIs, DB, storage,\s*PII ni datos\s+municipales/i);
  }

  const roleJourneys = sources[1];
  assert.match(roleJourneys, /public-role-tour-v1/);
  assert.match(roleJourneys, /única salida operativa[\s\S]{0,100}`\/login`[\s\S]{0,100}no enlaza superficies privadas/i);
  assert.match(roleJourneys, /no demuestra que el perfil esté\s+aprovisionado/i);
});

test('relative Markdown links in the living O2A documentation resolve inside the repository', () => {
  for (const relativePath of [
    'docs/GRH_OPERATIONS_ROADMAP.md',
    'docs/MASTER_PLAN_STATUS.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
    'docs/GOVTECH_BENCHMARK.md',
  ]) {
    const source = read(relativePath);
    const directory = path.dirname(path.join(root, relativePath));
    const links = [...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
    assert.ok(links.length > 0, `${relativePath} must link its sources`);
    for (const href of links) {
      if (/^(?:https?:|mailto:|#)/i.test(href)) continue;
      const target = href.split('#')[0];
      assert.equal(existsSync(path.resolve(directory, target)), true, `${relativePath} has broken link ${href}`);
    }
  }
});

test('the documented test commands use the cross-platform suite runner', () => {
  const rootManifest = JSON.parse(read('package.json'));
  const backendManifest = JSON.parse(read('backend/package.json'));
  assert.equal(rootManifest.scripts.test, 'node scripts/run-test-suite.mjs root');
  assert.equal(rootManifest.scripts['test:backend'], 'node scripts/run-test-suite.mjs backend');
  assert.equal(rootManifest.scripts['release:truth:check'], 'node scripts/check-deployment-truth.mjs');
  assert.equal(backendManifest.scripts.test, 'node ../scripts/run-test-suite.mjs backend');
  assert.equal(rootManifest.scripts['db:migrate:deploy'],
    'node scripts/assert-prisma-migrations.mjs --release && prisma migrate deploy --schema prisma/schema.prisma');
  assert.equal(backendManifest.scripts['db:migrate'],
    'node ../scripts/assert-prisma-migrations.mjs --release && prisma migrate deploy --schema ../prisma/schema.prisma');
  assert.equal(backendManifest.scripts['db:migrate:dev'], undefined);

  for (const relativePath of ['README.md', 'DEPLOYMENT.md', 'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md']) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /node --test tests\/\*\.mjs|npm --prefix backend exec -- node/i);
  }
  assert.match(read('README.md'), /--out api\/_data\/grh-profile\.json/);
  assert.doesNotMatch(read('README.md'), /--output|--profile api\/_data\/grh-profile/);
  for (const relativePath of ['README.md', 'DEPLOYMENT.md', 'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md']) {
    assert.match(read(relativePath), /release:truth:check[\s\S]{0,120}--base-url/i,
      `${relativePath} must document the release truth gate`);
  }
  const deployment = read('DEPLOYMENT.md');
  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  for (const source of [deployment, technical]) {
    assert.match(source, /huellas? SHA-256 can[oó]nicas?/i);
    assert.match(source, /DNS p[uú]blic[oa][\s\S]{0,40}estable/i);
    assert.match(source, /header contractual[\s\S]{0,40}(?:endpoint|propio)/i);
    assert.match(source, /no (?:demuestra|prueba)[\s\S]{0,30}propiedad institucional del dominio/i);
  }
  assert.match(read('docs/MASTER_PLAN_STATUS.md'), /Gate de verdad del release[\s\S]*b82c0b3[\s\S]{0,180}v1\.8\.1[\s\S]{0,180}10\/10[\s\S]{0,120}exit `0`/i);
  assert.match(read('docs/MASTER_PLAN_STATUS.md'), /(?:incluido|cubiert)[\s\S]{0,80}\/roles|\/roles[\s\S]{0,180}(?:incluido|cubiert)/i);
});

test('runtime baselines are pinned and the current engineering environment passes preflight', () => {
  const rootManifest = JSON.parse(read('package.json'));
  const backendManifest = JSON.parse(read('backend/package.json'));
  assert.equal(rootManifest.engines.node, '>=22.3.0 <25');
  assert.equal(backendManifest.engines.node, rootManifest.engines.node);
  assert.equal(read('.nvmrc').trim(), '24.15.0');
  assert.equal(read('.python-version').trim(), '3.11.9');
  const result = spawnSync(process.execPath, ['scripts/runtime-preflight.mjs'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"ok":true/);
});

test('Prisma release stays blocked until connected baseline and drift evidence exist', () => {
  const result = spawnSync(process.execPath, ['scripts/assert-prisma-migrations.mjs', '--offline', '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env },
  });
  assert.equal(result.status, 1, 'the current checkout must not be migration-ready without prisma/migrations');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.errors.some(error => error.code === 'MIGRATIONS_MISSING'), true);

  const runbook = read('docs/PRISMA_BASELINE_Y_DRIFT.md');
  assert.match(runbook, /integridad offline[\s\S]*evidencia conectada/i);
  assert.match(runbook, /baselineId[\s\S]*migrationSetId/i);
  assert.match(runbook, /receipt[\s\S]*fuera del checkout/i);
  assert.match(runbook, /no se aprovisionan cuentas/i);
  assert.match(runbook, /RELEASE_ATTESTATION_NOT_GOVERNED/);
  assert.match(runbook, /receipt[\s\S]*(?:no|ni) autoriza DDL/i);
  assert.match(runbook, /CI\/KMS\/OIDC/);
});

test('seed stays retired without secrets, environment inventory or database access', () => {
  const envExample = read('backend/.env.example');
  const seed = read('backend/seed.js');
  const readme = read('README.md');
  const requiredNames = [
    'JWT_SECRET',
    'DATABASE_URL',
    'DIRECT_URL',
    'PRISMA_BASELINE_ID',
    'PRISMA_MIGRATION_SET_ID',
    'PRISMA_TARGET_ID',
    'PRISMA_DRIFT_RECEIPT_PATH',
    'PRISMA_DRIFT_RECEIPT_SHA256',
    'GRH_TENANT_ID',
    'LEGACY_ANALYTICS_TENANT_ID',
    'CRON_SECRET',
    'PUBLIC_APP_URL',
    'PUBLIC_APP_ORIGINS',
    'ALLOW_LOCAL_GRH_ARTIFACTS',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_VERIFY_TOKEN',
    'ENABLE_WHATSAPP_DIAGNOSTICS',
    'DATA_CONNECTOR_ALLOWED_HOSTS',
  ];
  for (const name of requiredNames) assert.match(envExample, new RegExp(`^${name}=`, 'm'), `${name} missing from env example`);
  assert.doesNotMatch(envExample, /^SUPERADMIN_(?:EMAIL|PASSWORD)=/m);
  assert.doesNotMatch(envExample, /^SEED_[A-Z0-9_]*=/m);
  assert.doesNotMatch(readme, /secretos?\s+de\s+seed/i);
  assert.match(readme, /db:seed[\s\S]{0,160}no es un mecanismo de aprovisionamiento autorizado/i);
  assert.match(seed, /ACCOUNT_LIFECYCLE_NOT_GOVERNED/);
  assert.doesNotMatch(seed, /process\.env|@prisma|bcrypt|DATABASE_URL|\.(?:create|upsert|update)\s*\(/i);

  const retired = spawnSync(process.execPath, ['backend/seed.js'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: 'postgresql://invalid.invalid/must-not-connect' },
  });
  assert.equal(retired.status, 1);
  assert.equal(retired.stdout, '');
  assert.match(retired.stderr, /ACCOUNT_LIFECYCLE_NOT_GOVERNED/);

  for (const relativePath of [
    'backend/README.md',
    'NEON_SETUP.md',
    'DEPLOYMENT.md',
    'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
    'docs/RBAC_ABAC_DATA_MODEL.md',
    'docs/PRISMA_BASELINE_Y_DRIFT.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/MANUAL_INTEGRAL.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /SEED_[A-Z0-9_]+/, `${relativePath} must not inventory retired seed variables`);
    assert.match(source, /(?:db:seed|seed)[\s\S]{0,240}(?:retirad|gate|código `1`)/i,
      `${relativePath} must state that seed is retired`);
  }

  const runtimeRoots = ['api', 'backend', 'shared', 'scripts'];
  const runtimeFiles = [];
  function walk(directory) {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['tests', 'node_modules', 'generated'].includes(entry.name)) walk(relative);
      } else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
        runtimeFiles.push(relative);
      }
    }
  }
  runtimeRoots.forEach(walk);
  const staticallyUsed = new Set(runtimeFiles.flatMap(relativePath =>
    [...read(relativePath).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map(match => match[1])
  ));
  const platformProvided = new Set(['VERCEL_URL']);
  for (const name of staticallyUsed) {
    if (platformProvided.has(name)) continue;
    assert.match(envExample, new RegExp(`^${name}=`, 'm'), `${name} used by runtime but missing from env example`);
  }
});

test('unsafe legacy on-prem executables stay retired behind an explicit documentation gate', () => {
  for (const relativePath of [
    'infra/docker-compose.yml',
    'infra/.env.example',
    'infra/nginx/default.conf',
  ]) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must stay retired`);
  }
  assert.match(read('infra/README.md'), /no hay un despliegue on-premise certificado/i);
  assert.match(read('docs/DEPLOY_LOCAL.md'), /roadmap; no existe un paquete on-premise/i);
  assert.match(read('DATABASE_SETUP.md'), /procedimiento heredado retirado/i);
});

test('the in-app manual exposes a semantic version and its truth contract separately', () => {
  const source = read('manuales.html');
  assert.match(source, /data-doc-version="1\.9\.0"/);
  assert.match(source, /data-doc-contract="operational-truth-v1"/);
  assert.match(source, /data-primary-source="grh"/);
  assert.match(source, /data-secondary-source-policy="personas-excluded"/);
  assert.match(source, /data-realtime="false"/);
  assert.match(source, /grh-executive-v2/);
  assert.match(source, /grh-quality-v1/);
  assert.match(source, /\/api\/grh-data[\s\S]{0,180}410 GRH_RAW_CONTRACT_RETIRED[\s\S]{0,100}sin leer artefactos/i);
  assert.match(source, /O2A[\s\S]{0,180}105,5 s[\s\S]{0,180}294 ms/i);
  assert.match(source, /PUBLISHED[\s\S]{0,120}no significa DB, API ni producción/i);
});

test('the public landing does not route municipal or commercial data to unapproved contacts', () => {
  const source = read('landing.html');
  assert.match(source, /Canal institucional pendiente de aprobación/);
  assert.doesNotMatch(source, /mailto:|wa\.me\/|Soporte GovTech|WhatsApp Directo/i);
  assert.doesNotMatch(source, /Red de Innovación Municipal de Latinoamérica/i);
});
