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
  'docs/GRH_PERSONAS_INTEGRATION_BLUEPRINT.md',
  'docs/GRH_PERSONAS_V2_RECONCILIATION.md',
  'docs/DATA_SOURCE_REGISTER.md',
  'docs/data/grh-semantic.md',
];

test('the living documentation package exists and distinguishes local, conditional and roadmap states', () => {
  for (const relativePath of livingManuals) {
    assert.equal(existsSync(path.join(root, relativePath)), true, `${relativePath} must exist`);
    const source = read(relativePath);
    assert.match(source, /^#\s+/m, `${relativePath} needs a title`);
    assert.doesNotMatch(source, /personas_junin[\s\S]{0,180}(?:excluida de forma absoluta|no se analiza[\s\S]{0,120}fallback)/i,
      `${relativePath} must not preserve the obsolete absolute exclusion`);
  }

  const integral = read('docs/MANUAL_INTEGRAL.md');
  assert.match(integral, /Versión documental: 1\.10\.0/i);
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
  assert.match(user, /\| Versión \| 1\.10\.0 \|/);
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
  assert.match(user, /grh-directory-v3/);
  assert.match(user, /sin egreso informado[”"]? no certifica[\s\S]{0,80}vínculo activo/i);
  assert.match(user, /Participación en cálculo 2026-07[\s\S]{0,260}no[\s\S]{0,80}pago efectivo/i);
  assert.match(user, /24 ausencias, licencias\s+y períodos|hasta 24 ausencias/i);

  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  assert.match(technical, /\*\*Versión:\*\* 1\.10\.0/);
  assert.match(technical, /shared\/route-policy\.cjs/);
  assert.match(technical, /recurso:acción/);
  assert.match(technical, /desconocid[oa]s fallan cerrados/i);
  assert.match(technical, /17\.1 Alta administrativa retirada[\s\S]*POST \/api\/admin\/tenants[\s\S]*ACCOUNT_LIFECYCLE_NOT_GOVERNED/i);
  assert.match(technical, /PUT\/PATCH de tenant[\s\S]*TENANT_LIFECYCLE_NOT_GOVERNED/i);
  assert.doesNotMatch(technical, /Ruta administrativa disponible/i);
  assert.match(technical, /79 firmas[\s\S]{0,80}37 Serverless[\s\S]{0,40}42 Express/i);
  assert.match(technical, /GET \/api\/grh-executive[\s\S]{0,240}grh-executive-v2/i);
  assert.match(technical, /GET \/api\/grh-quality[\s\S]{0,240}grh-quality-v1/i);
  assert.match(technical, /GET \/api\/grh-close[\s\S]{0,240}grh-close-v1/i);
  assert.match(technical, /GET \/api\/grh-decision-brief[\s\S]{0,240}grh-decision-brief-v1/i);
  assert.match(technical, /\/api\/grh-data[\s\S]{0,240}410[\s\S]{0,120}sin leer artefactos/i);
  assert.match(technical, /profile[\s\S]{0,100}semantic[\s\S]{0,120}exclusivamente en backend/i);
  assert.match(technical, /004_grh_directory_v2\.sql[\s\S]{0,160}005_grh_directory_v3\.sql/);
  assert.match(technical, /grh-directory-v3[\s\S]{0,500}legajo_reported_dates/);
  assert.match(technical, /referencePayrollParticipation[\s\S]{0,260}no evidencia[\s\S]{0,100}pago/i);
  assert.match(read('manuales.html'), /filas fuente[\s\S]{0,180}legamov/i);

  const roadmap = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');
  assert.match(roadmap, /Versión: 1\.10\.0/i);
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
  assert.match(geoReadiness, /\/territorio[\s\S]{0,240}IGN\/GeoRef/i);
  assert.match(geoReadiness, /no contiene empleados, domicilios, obras, reclamos/i);
  assert.match(geoReadiness, /no activar mapa GRH/i);
  assert.match(geoReadiness, /mapa territorial de referencia[\s\S]{0,180}(?:superficies|contratos)[\s\S]{0,120}independientes/i);
  assert.doesNotMatch(geoReadiness, /ready_for_aggregate_layer[\s\S]{0,120}(?:actual|operativ[oa]|disponible)/i);

  const sourceRegister = read('docs/DATA_SOURCE_REGISTER.md');
  assert.match(sourceRegister, /data-source-register-v3/);
  assert.match(sourceRegister, /grh-junin[\s\S]{0,260}Aprobada para ingeniería local/i);
  assert.match(sourceRegister, /personas-junin[\s\S]{0,180}Auxiliar aislada para ingenier[ií]a local/i);
  assert.match(sourceRegister, /7\.550\.947[\s\S]{0,120}11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c[\s\S]{0,80}2026-08-06/i);
  assert.match(sourceRegister, /1\.699[\s\S]{0,120}157[\s\S]{0,120}493/i);
  assert.match(sourceRegister, /igualdad de `IDPERSONA`[\s\S]{0,100}prohibida/i);
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
  assert.match(roleJourneys, /\*\*Versión:\*\* 1\.10\.0/);
  assert.match(roleJourneys, /Operativo local[\s\S]*Condicionado[\s\S]*Roadmap/i);
  assert.match(roleJourneys, /maker[\s\S]*checker/i);
  assert.match(roleJourneys, /FIRST_LOGIN_REQUIRED/);
  assert.match(roleJourneys, /no se deben\s+publicar “usuarios de cada rol”/i);
  assert.match(roleJourneys, /403[\s\S]*cross-tenant/i);
  assert.match(roleJourneys, /shared\/route-policy\.cjs/);
  assert.match(roleJourneys, /reportes\.html[\s\S]*bundle GRH privado `profile \+ semantic`/i);
  assert.doesNotMatch(roleJourneys, /^\| \[`reportes\.html`\]\([^)]*\) \| `data_points`/im);

  const benchmark = read('docs/GOVTECH_BENCHMARK.md');
  assert.match(benchmark, /- Versión: 1\.10\.0/);
  assert.match(benchmark, /seed \*\*no prepara ningún rol\*\*/i);
  assert.doesNotMatch(benchmark, /seed prepara `SUPER_ADMIN`/i);

  const rbacModel = read('docs/RBAC_ABAC_DATA_MODEL.md');
  assert.match(rbacModel, /propuesta técnica; no implementada, no migrada y sin cuentas creadas/i);
  assert.match(rbacModel, /baseline[\s\S]*modo sombra[\s\S]*intersección restrictiva/i);
  assert.match(rbacModel, /no ejecutar `db push`, `migrate dev`, `migrate reset` ni `migrate deploy`/i);
  assert.match(rbacModel, /maker[\s\S]*checker/i);
});

test('GRH directory v3 documentation keeps the remote release gate closed', () => {
  const deployment = read('DEPLOYMENT.md');
  const readme = read('README.md');
  const runbook = read('docs/GRH_DIRECTORY_PREVIEW_REHEARSAL.md');

  assert.match(runbook, /^# Ensayo descartable del Directorio GRH v3$/m);
  assert.match(runbook, /003 \+ 004 \+[\s\S]{0,20}005/);
  assert.match(runbook, /005_grh_directory_v3\.sql/);
  assert.match(runbook, /grh-directory-v3/);
  assert.match(runbook, /reportedStatus[\s\S]{0,100}contractRegime[\s\S]{0,100}serviceSituation/);
  assert.match(runbook, /no se[\s\S]{0,60}ejecutó DDL[\s\S]{0,120}Preview,[\s\S]{0,40}Production[\s\S]{0,80}base remota/i);
  assert.match(runbook, /huella[\s\S]{0,120}diferente/i);
  assert.match(runbook, /grh-directory-v3\.json/);
  assert.match(deployment, /grh-directory-v3[\s\S]{0,500}003 \+ 004 \+ 005/);
  assert.match(deployment, /no se ejecutaron contra Preview, Production ni una DB[\s\S]{0,20}remota/i);
  assert.match(readme, /Directorio RRHH v3[\s\S]{0,120}003 \+ 004 \+ 005/);
  assert.match(readme, /no se ejecutó la migración `005`[\s\S]{0,160}Preview, Production[\s\S]{0,80}DB remota/i);
});

test('S15 documents the equal management comparison and its Production verification', () => {
  const evidencePaths = [
    'README.md',
    'docs/MASTER_PLAN_STATUS.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    'docs/DEMO_INTENDENCIA_5_7_MIN.md',
  ];
  for (const relativePath of evidencePaths) {
    const source = read(relativePath);
    assert.match(source, /972 días/i, relativePath);
    assert.match(source, /2023(?:-12-09|[\s\S]{0,40}9 (?:de )?diciembre de 2023)/i, relativePath);
    assert.match(source, /2019(?:-12-09|[\s\S]{0,40}9 (?:de )?diciembre de 2019)/i, relativePath);
    assert.match(source, /5\.936[\s\S]{0,80}3\.395/i, relativePath);
    assert.match(source, /(?:no (?:prueban?|demuestran?|constituyen?)|sin)[\s\S]{0,100}(?:causa|desempeño|evaluación|tasa)/i, relativePath);
    assert.match(source, /verificad[oa][\s\S]{0,80}Production|Production[\s\S]{0,80}verificad[oa]/i, relativePath);
  }
  const inAppManual = read('manuales.html');
  assert.match(inAppManual, /grh-administration-comparison-v1/);
  assert.match(inAppManual, /972 días[\s\S]{0,160}no (?:es una tasa|prueba altas o bajas|califica una gestión)/i);
  assert.match(inAppManual, /Verificada en Production/i);
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

test('documentation 1.10.0 preserves the governed close, Bot, immutable replay and release truths', () => {
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
    assert.match(source, /1\.10\.0(?![-+0-9A-Za-z.])/, 'every living manual must expose current version 1.10.0');
  }

  for (const source of [integral, user, technical, master, enterprise, operations, pipeline, privacy, inApp]) {
    assert.match(source, /personas_junin/i, 'each core manual must name the auxiliary source boundary');
    assert.doesNotMatch(source, /personas_junin[\s\S]{0,180}(?:excluida de forma absoluta|no se analiza[\s\S]{0,120}fallback)/i,
      'Personas must not remain globally excluded after the auxiliary-source decision');
  }

  const integration = read('docs/GRH_PERSONAS_INTEGRATION_BLUEPRINT.md');
  assert.match(integration, /grh-personas-integration-blueprint-v1/i);
  assert.match(integration, /GRH es la fuente laboral central/i);
  assert.match(integration, /PERSONAS es una fuente auxiliar/i);
  assert.match(integration, /Nunca se unen GRH y[\s\S]{0,80}PERSONAS por igualdad de `IDPERSONA`/i);
  assert.match(integration, /1\.432[\s\S]{0,160}267[\s\S]{0,220}1\.699[\s\S]{0,220}157[\s\S]{0,160}493/i);
  assert.match(integration, /no (?:es|son)[\s\S]{0,30}(?:un )?crosswalk productivo certificado/i);

  const reconciliationV2 = read('docs/GRH_PERSONAS_V2_RECONCILIATION.md');
  assert.match(reconciliationV2, /grh-personas-v2-reconciliation-v1/i);
  assert.match(reconciliationV2, /b6313cc582d3fac1c03bf6612ba2065043c7dc37b8ad744f4b5303799ccf4fe1/i);
  assert.match(reconciliationV2, /7a192ce04c46677718166c94fa301fcdb37de2798da4f7351dad21ade19f261e/i);
  assert.match(reconciliationV2, /882[\s\S]{0,180}867[\s\S]{0,220}854[\s\S]{0,180}856/i);
  assert.match(reconciliationV2, /40 CUIL[\s\S]{0,100}24 DNI[\s\S]{0,180}58 CUIL[\s\S]{0,100}6 DNI/i);
  assert.match(reconciliationV2, /2\.349[\s\S]{0,140}1\.699[\s\S]{0,100}157[\s\S]{0,100}493/i);
  assert.match(reconciliationV2, /cero aprobaciones/i);
  assert.match(reconciliationV2, /coincidencia por DNI[\s\S]{0,220}respaldo adicional/i);
  assert.match(reconciliationV2, /SQL mínimo[\s\S]{0,160}no se ejecuta/i);
  assert.match(reconciliationV2, /No se calcula presentismo sin denominador/i);
  assert.match(reconciliationV2, /no reemplaza Presupuesto, Tesorer[ií]a ni Contadur[ií]a/i);
  assert.match(reconciliationV2, /errorimportacion[\s\S]{0,120}1\.186\.239[\s\S]{0,100}4\.913/i);
  assert.match(reconciliationV2, /603\.125[\s\S]{0,80}410\.465[\s\S]{0,80}116\.954/i);
  assert.match(reconciliationV2, /TIPOMENSAJE[\s\S]{0,100}no puede inventar severidad/i);

  for (const source of [integral, user, technical, master, enterprise, privacy]) {
    assert.match(source, /grh-close-v1/);
    assert.match(source, /(?:meses? calendario )?consecutiv[oa]s?[\s\S]{0,180}k≥10|k≥10[\s\S]{0,180}consecutiv[oa]s?/i);
    assert.match(source, /(?:moneda no (?:está )?declarada|moneda no disponible|no afirma moneda)/i);
    assert.match(source, /(?:no (?:prueba|certifica|afirma)[\s\S]{0,100}pago|no pago)/i);
  }
  assert.match(inApp, /grh-close-v1/);
  assert.match(inApp, /meses consecutivos[\s\S]{0,180}al menos 10 personas/i);
  assert.match(inApp, /no (?:demuestran|prueban|certifican)[\s\S]{0,100}(?:pago|transferencia bancaria)/i);
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
  assert.match(inApp, /no publica usuarios(?: demo| ni contraseñas de ejemplo)/i);
  assert.match(inApp, /b82c0b3[\s\S]{0,100}master/i);
  assert.match(inApp, /release:truth:check[\s\S]{0,100}10\/10[\s\S]{0,100}exit\s*<code>0<\/code>/i);

  const routePolicy = require('../shared/route-policy.cjs');
  const runtimeCounts = routePolicy.PROTECTED_ROUTES.reduce((counts, route) => {
    counts[route.runtime] = (counts[route.runtime] || 0) + 1;
    return counts;
  }, {});
  assert.equal(routePolicy.ROUTE_POLICY_VERSION, '2026-08-14.18');
  assert.equal(routePolicy.PROTECTED_ROUTES.length, 101);
  assert.deepEqual(runtimeCounts, { serverless: 59, express: 42 });
  assert.equal(Object.keys(routePolicy.RESOURCES).length, 33);
  assert.equal(Object.keys(routePolicy.ACTIONS).length, 12);
  assert.equal(Object.keys(routePolicy.PERMISSIONS).length, 56);
  for (const source of [integral, user, technical, master, enterprise, roleJourneys, benchmark]) {
    assert.match(source, /26\s+recursos[\s\S]{0,80}12\s+acciones[\s\S]{0,80}46\s+permisos/i);
    assert.match(source, /79\s+firmas/i);
    assert.match(source, /37\s+Serverless[\s\S]{0,60}42\s+Express/i);
  }
  assert.match(inApp, /estado operativo condicionado/i);
  assert.match(inApp, /33\s+recursos[\s\S]{0,80}12\s+acciones[\s\S]{0,80}56\s+permisos/i);
  assert.match(inApp, /101\s+(?:rutas|firmas)/i);
  assert.match(inApp, /59\s+Serverless[\s\S]{0,60}42\s+Express/i);
});

test('documentation 1.10.0 records the exact role workspace without claiming accounts from visual guidance', () => {
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
  assert.equal(accessPolicy.ACCESS_POLICY_VERSION, '2026-08-13.4');
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
    assert.match(source, /1\.10\.0(?![-+0-9A-Za-z.])/);
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

test('S13 1.10.0 records the exact public release while private evidence stays local', () => {
  const releasePaths = [
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

  const routePolicy = require('../shared/route-policy.cjs');
  const accessPolicy = require('../shared/access-policy.cjs');
  const releaseTruth = require('../shared/release-truth-contract.cjs');
  const runtimeCounts = routePolicy.PROTECTED_ROUTES.reduce((counts, route) => {
    counts[route.runtime] = (counts[route.runtime] || 0) + 1;
    return counts;
  }, {});
  assert.equal(routePolicy.ROUTE_POLICY_VERSION, '2026-08-14.18');
  assert.equal(accessPolicy.ACCESS_POLICY_VERSION, '2026-08-13.4');
  assert.equal(routePolicy.PROTECTED_ROUTES.length, 101);
  assert.deepEqual(runtimeCounts, { serverless: 59, express: 42 });
  assert.equal(Object.keys(routePolicy.RESOURCES).length, 33);
  assert.equal(Object.keys(routePolicy.ACTIONS).length, 12);
  assert.equal(Object.keys(routePolicy.PERMISSIONS).length, 56);
  assert.equal(Object.keys(releaseTruth.API_CONTRACTS).length, 25);
  assert.equal(
    releaseTruth.SESSION_EXCHANGE_CONTRACTS['/api/auth/evaluation-session'],
    'municontrol-evaluation-session-v1',
  );
  assert.equal(
    releaseTruth.SESSION_EXCHANGE_CONTRACTS['/api/auth/private-link-session'],
    'municontrol-private-link-session-v1',
  );
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-directory'], 'grh-directory-v3');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-directory-access'], 'grh-directory-access-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-domain-catalog'], 'grh-domain-catalog-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-workforce-finance'], 'grh-workforce-finance-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-payroll-run-control'], 'grh-payroll-run-control-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-fixed-concept-control'], 'grh-fixed-concept-control-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-organization-analytics'], 'grh-organization-analytics-v2');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-movement-operations'], 'grh-movement-operations-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-decision-brief'], 'grh-decision-brief-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-action-ledger'], 'grh-action-ledger-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-administration-comparison'], 'grh-administration-comparison-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-management-timeline'], 'grh-management-timeline-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-garden-network'], 'grh-garden-network-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-employment-review'], 'grh-employment-review-v2');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-absence-insights'], 'grh-absence-insights-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-import-quality-history'], 'grh-import-quality-history-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-employment-actions'], 'grh-employment-actions-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-personas-linkage-readiness'], 'grh-personas-linkage-readiness-v1');
  assert.equal(releaseTruth.API_CONTRACTS['/api/municipal-territory'], 'municipal-territory-v2');
  assert.equal(releaseTruth.API_CONTRACTS['/api/source-intake'], 'municipal-source-intake-v1');

  for (const relativePath of releasePaths) {
    const source = read(relativePath);
    assert.match(source, /1\.10\.0(?![-+0-9A-Za-z.])/, relativePath);
    assert.match(source, /release público[\s\S]{0,100}(?:v1\.10\.0[\s\S]{0,50}verificad|verificad[\s\S]{0,50}v1\.10\.0)/i, relativePath);
    assert.match(source, /GET \/api\/grh-decision-brief/i, relativePath);
    assert.match(source, /grh-decision-brief-v1/i, relativePath);
    assert.match(source, /agregados del snapshot\s+aprobado[\s\S]{0,180}validación local/i, relativePath);
    assert.match(source, /se(?:para|paración)[\s\S]{0,100}global[\s\S]{0,100}mensual/i, relativePath);
    if (relativePath === 'manuales.html') {
      assert.match(source, /registros apartados para revisar/i, relativePath);
      assert.match(source, /menos de 10 personas[\s\S]{0,100}(?:no (?:se )?muestran|se ocultan)/i, relativePath);
      assert.match(source, /(?:no|ni) (?:incluye|publica|muestra) datos personales/i, relativePath);
      assert.match(source, /(?:acción|acciones)[\s\S]{0,120}(?:perfil|permiso)/i, relativePath);
      assert.match(source, /503[\s\S]{0,180}(?:reintento manual|reintentar)/i, relativePath);
      assert.match(source, /dato protegido[\s\S]{0,100}nunca[\s\S]{0,80}(?:cero|deducir)/i, relativePath);
    } else {
      assert.match(source, /temporalQuarantineRows/, relativePath);
      assert.match(source, /k=10/, relativePath);
      assert.match(source, /PII[\s\S]{0,100}importes[\s\S]{0,100}códigos de fuente\/celda[\s\S]{0,100}(?:labels|etiquetas)/i, relativePath);
      assert.match(source, /CTA[\s\S]{0,100}capability/i, relativePath);
      assert.match(source, /503[\s\S]{0,160}reintento\s+manual/i, relativePath);
      assert.match(source, /celda[\s\S]{0,80}(?:<10|&lt;10)[\s\S]{0,100}(?:falla|fallar) cerrado/i, relativePath);
    }
    assert.match(source, /#decisionBrief/, relativePath);
    if (relativePath === 'manuales.html') {
      assert.match(source, /estado operativo condicionado/i, relativePath);
      assert.match(source, /2026-08-14\.18[\s\S]{0,100}2026-08-13\.4/, relativePath);
      assert.match(source, /33\s+recursos[\s\S]{0,80}12\s+acciones[\s\S]{0,80}56\s+permisos[\s\S]{0,80}101\s+(?:rutas|firmas)/i, relativePath);
      assert.match(source, /59 Serverless[\s\S]{0,60}42 Express/i, relativePath);
      assert.match(source, /Centro de decisiones[\s\S]{0,1000}Producción · lectura condicionada/i, relativePath);
    } else {
      assert.match(source, /2026-08-09\.2[\s\S]{0,100}2026-08-09\.1/, relativePath);
      assert.match(source, /26\s+recursos[\s\S]{0,80}12\s+acciones[\s\S]{0,80}46\s+permisos[\s\S]{0,80}79\s+(?:rutas|firmas)/i, relativePath);
      assert.match(source, /37 Serverless[\s\S]{0,60}42 Express/i, relativePath);
    }
    assert.match(source, /(?:seis APIs[\s\S]{0,80}11 checks|11\/11)/i, relativePath);
    assert.match(source, /135\/135[\s\S]{0,120}104\/104[\s\S]{0,80}0 P1\/P2/i, relativePath);
    assert.match(source, /591\s+(?:pruebas|totales)[\s\S]{0,100}590\s+aprobadas[\s\S]{0,80}0\s+fallidas[\s\S]{0,100}1\s+smoke\s+opt-in\s+omitido/i, relativePath);
    assert.match(source, /backend[\s\S]{0,40}20\/20/i, relativePath);
    assert.match(source, /producto S13[\s\S]{0,60}(?:commit|está[\s>]+en)[\s\S]{0,30}d11fd39/i, relativePath);
    assert.match(source, /4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7/, relativePath);
    assert.match(source, /07ac9eacf8bd89f27f5c437b99e713e8497b8934/, relativePath);
    assert.match(source, /https:\/\/github\.com\/inguillen87\/municipio-junin\/releases\/tag\/v1\.10\.0/, relativePath);
    assert.match(source, /live[\s\S]{0,40}no draft[\s\S]{0,40}no prerelease/i, relativePath);
    assert.match(source, /dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL/, relativePath);
    assert.match(source, /READY/i, relativePath);
    assert.match(source, /Production/i, relativePath);
    assert.match(source, /https:\/\/municipio-junin\.vercel\.app/, relativePath);
    assert.match(source, /gitSource[\s\S]{0,30}master\/4108ca0/i, relativePath);
    assert.match(source, /11\/11[\s\S]{0,60}exit[\s`<code>]*0/i, relativePath);
    assert.match(source, /checkedAt 2026-08-09T16:33:56\.200Z/, relativePath);
    assert.match(source, /10\/10 estados[\s\S]{0,100}390\/1440 px/i, relativePath);
    assert.match(source, /\/[^\r\n]{0,80}\/roles[\s\S]{0,80}visibles/i, relativePath);
    for (const pathname of ['/dashboard', '/inicio', '/manuales']) assert.match(source, new RegExp(pathname));
    assert.match(source, /anónimos[\s\S]{0,100}redirigen al login/i, relativePath);
    assert.match(source, /0 overflow/i, relativePath);
    assert.match(source, /(?:warnings\/errores de consola|console)/i, relativePath);
    assert.match(source, /overlays/i, relativePath);
    assert.match(source, /requests externos/i, relativePath);
    assert.match(source, /fallas\s+de\s+red/i, relativePath);
    assert.match(source, /logs[\s\S]{0,80}0 errores[\s\S]{0,80}0 (?:respuestas )?500/i, relativePath);
    assert.match(source, /sesión privada positiva[\s\S]{0,100}S13 privado[\s\S]{0,120}validación local[\s\S]{0,80}snapshot aprobado/i, relativePath);
    assert.match(source, /no certifica/i, relativePath);
    assert.match(source, /DB\/baseline/i, relativePath);
    assert.match(source, /cuentas/i, relativePath);
    assert.match(source, /MFA\/lifecycle/i, relativePath);
    assert.match(source, /datos GRH[\s>]+remotos/i, relativePath);
    assert.match(source, /commit documental[\s>]+post-release[\s\S]{0,80}no mueve[\s\S]{0,60}tag[\s\S]{0,40}v1\.10\.0[\s\S]{0,40}4108ca0/i, relativePath);
  }

  const liveManual = read('manuales.html');
  assert.match(liveManual, /409[\s\S]{0,120}evidencia vigente/i);
  assert.match(liveManual, /422[\s\S]{0,100}forma, fecha o transición/i);

  const backendManifest = JSON.parse(read('backend/package.json'));
  assert.equal(backendManifest.version, '1.0.0');
  assert.match(
    read('docs/PRISMA_BASELINE_Y_DRIFT.md'),
    /\*\*Vers(?:ión|i\\u00f3n):\*\* 1\.3\.0/
  );
});

test('S14B records isolated DB targets and connected WP0 discovery without releasing 1.11.0', () => {
  const closurePaths = [
    'CHANGELOG.md',
    'docs/MASTER_PLAN_STATUS.md',
    'docs/ENTERPRISE_PRODUCT_ROADMAP.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MANUAL_INTEGRAL.md',
  ];

  for (const relativePath of closurePaths) {
    const source = read(relativePath);
    assert.match(source, /S14A/, `${relativePath} must preserve S14A as antecedent`);
    assert.match(source, /S14B/, `${relativePath} must identify the connected sprint`);
    assert.match(source, /branches[^\r\n]{0,40}distintos/i,
      `${relativePath} must record distinct Preview/Production DB branches`);
    assert.match(source, /sslmode=verify-full/i,
      `${relativePath} must require verify-full on remote connections`);
    assert.match(source, /DB_CONFIG_ISOLATION=PASS/);
    assert.match(source, /DB_CONFIG_SSLMODE_VERIFY_FULL=true/);
    assert.match(source, /NEON_MAPPING=IDENTIFIED/);
    assert.match(source, /\babsent\b/);
    assert.match(source, /discovery_non_approvable/);
    assert.match(source, /approvalEligible:false/);
    assert.match(source, /credencial owner[\s\S]{0,160}rot(?:ad[ao]|ó)[\s\S]{0,160}invalid/i,
      `${relativePath} must record rotation and invalidation of the exposed owner credential`);
    assert.match(source, /Unreleased/);
    assert.match(source, /(?:no (?:existe|crea|habilita|convierte|produce|es)|sin)[^\r\n]{0,160}baseline/i,
      `${relativePath} must keep the baseline boundary closed`);
    assert.match(source, /v1\.10\.0/);
    assert.match(source, /11\/11/);
    assert.match(source, /v1\.11\.0/);
  }

  const runbook = read('docs/PRISMA_BASELINE_Y_DRIFT.md');
  assert.match(runbook, /\*\*Versi\\u00f3n:\*\* 1\.3\.0/);
  for (const state of ['absent', 'empty', 'inconsistent', 'valid']) {
    assert.match(runbook, new RegExp(`\\b${state}\\b`));
  }
  assert.match(runbook, /discovery_non_approvable/);
  assert.match(runbook, /approvalEligible:false/);
  assert.match(runbook, /definitionSha256/);
  assert.equal(
    runbook.includes('municontrol.wp0.v1|target_class=RESTORED_DISPOSABLE|target_id=target:<id-no-secreto>'),
    true,
    'WP0 must pin the canonical non-secret database-comment marker'
  );
  assert.match(runbook, /`COMMENT ON DATABASE`/i,
    'WP0 must persist the marker as a database comment');
  assert.match(
    runbook,
    /(?:solo|s\\u00f3lo|exclusivamente)[\s\S]{0,100}`pg_catalog\.pg_database`[\s\S]{0,100}`pg_catalog\.shobj_description`/i,
    'WP0 must read the marker only from the two catalog sources'
  );
  assert.match(
    runbook,
    /tampoco demuestra[\s\S]{0,120}(?:proveedor[\s\S]{0,80}(?:creado|creara)[\s\S]{0,60}copia|restore externo)[\s\S]{0,120}evidencia externa/i,
    'the database comment alone must not be presented as proof of the external restore'
  );
  assert.doesNotMatch(runbook, /municontrol\.wp0_target_class=/i,
    'the retired GUC target-class marker must not return');
  assert.doesNotMatch(runbook, /\bpg_db_role_setting\b/i,
    'WP0 must not claim that role settings prove the restored target');
  assert.doesNotMatch(runbook, /ALTER DATABASE[\s\S]{0,100}\bSET\b[\s\S]{0,120}(?:marcador|municontrol\.wp0|RESTORED_DISPOSABLE)/i,
    'ALTER DATABASE ... SET must not be documented as the WP0 marker mechanism');
  assert.match(
    runbook,
    /`TLSSocket`[\s\S]{0,180}exige cifrado, autorizaci\\u00f3n del[\s\S]{0,180}antes de iniciar el\s+inventario/i,
    'WP0 must bind runtime TLS evidence to the authorized client socket before inventory'
  );
  assert.match(
    runbook,
    /No se usa `pg_stat_ssl` como autoridad/i,
    'the backend-side proxy hop must not become the WP0 TLS authority'
  );
  assert.match(runbook, /20\.000 filas[\s\S]{0,100}1 KiB[\s\S]{0,100}256 KiB[\s\S]{0,100}4 MiB/i);
  assert.match(runbook, /WP0-L v2 ejecutado conectado/i);
  assert.match(runbook, /38b25e80e8413cc8688f393de2930e77098eb3f4/);
  assert.match(runbook, /wp0-observation-48054484dbcd80ffbaa46a197a97ccfb3a8a1a97223e868dc1e755d010d8ada4/);
  assert.match(runbook, /64b1571c36adafe6d6b65b11c3fd109131e7e7bcff84c4cd060dfbdea82573a1/);
  assert.match(runbook, /snap-autumn-shape-ac7473wo/);
  assert.match(runbook, /br-flat-waterfall-acylyfjv/);
  assert.match(runbook, /`TLSv1\.3`/);
  assert.match(runbook, /968 filas/);
  assert.match(runbook, /`REPEATABLE READ READ ONLY`/);
  assert.match(runbook, /restore y snapshot ausentes[\s\S]{0,100}main y[\s\S]{0,40}Preview `ready`/i);

  const evidenceFlags = [
    'externalReferencesVerified:false',
    'backupRestoreRelationVerified:false',
    'reviewerIndependenceVerified:false',
    'signedProviderReceiptVerified:false',
  ];
  for (const relativePath of [
    'docs/PRISMA_BASELINE_Y_DRIFT.md',
    'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    'docs/MANUAL_INTEGRAL.md',
  ]) {
    const source = read(relativePath);
    for (const flag of evidenceFlags) {
      assert.match(source, new RegExp(flag), `${relativePath} must keep ${flag}`);
    }
    assert.doesNotMatch(source, /approvalEligible:true/,
      `${relativePath} must never promote the discovery artifact`);
  }

  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  assert.doesNotMatch(technical, /rollback ante cualquier inconsistencia/i);
  assert.match(
    technical,
    /`valid`[\s\S]{0,80}`absent`[\s\S]{0,40}`empty`[\s\S]{0,40}`inconsistent`[\s\S]{0,80}`COMMIT`/
  );
  assert.match(
    technical,
    /`ROLLBACK` s[oó]lo ante un fallo o una violaci[oó]n[\s\S]{0,100}no por el estado sem[aá]ntico no aprobable/i
  );

  for (const relativePath of ['CHANGELOG.md', 'docs/MASTER_PLAN_STATUS.md']) {
    const source = read(relativePath);
    assert.match(
      source,
      /(?:revalidaci[oó]n local S14B|suite ra[ií]z S14B)[\s\S]{0,160}619 pruebas[\s\S]{0,80}618 aprobadas[\s\S]{0,60}0 fallidas[\s\S]{0,100}1 smoke opt-in\s+omitido[\s\S]{0,100}backend(?: cerr[oó])? 20\/20/i,
      `${relativePath} must pin the final S14B QA evidence`
    );
    assert.match(source, /no (?:reemplaz(?:a|an)|sustituye)[\s\S]{0,80}hist[oó]rica 591\/590[\s\S]{0,80}v1\.10\.0/i,
      `${relativePath} must preserve the historical v1.10.0 counts`);
  }

  const rootManifest = JSON.parse(read('package.json'));
  const rootLock = JSON.parse(read('package-lock.json'));
  const backendManifest = JSON.parse(read('backend/package.json'));
  assert.equal(rootManifest.version, '1.10.0');
  assert.equal(rootLock.version, '1.10.0');
  assert.equal(rootLock.packages[''].version, '1.10.0');
  assert.equal(backendManifest.version, '1.0.0');
  assert.doesNotMatch(read('CHANGELOG.md'), /^## \[1\.11\.0\]/m);

  const replayReceiptSha = '613db7889e4e23033927814fa5ee8e4a891e9a91772268e01b08645d3f4ae51b';
  const catalogFingerprintSha = '0388a4871483fdd37286a03ab1d7acd01f25ef0ecae309925dadf912fe589028';
  for (const relativePath of closurePaths) {
    const source = read(relativePath);
    assert.match(source, /S14C/);
    assert.match(source, /13\s+tablas[\s\S]{0,100}5 sensibles[\s\S]{0,80}8 (?:de )?referencia/i);
    assert.match(source, /@@ignore/);
    assert.match(source, /\$queryRaw/);
    assert.match(source, /br-proud-hat-achuevv2/);
    assert.match(source, /0\/307FA88/);
    assert.match(source, /(?:caso )?A[\s\S]{0,180}(?:vac[ií]a|vac[ií]o)/i);
    assert.match(source, /B3[\s\S]{0,220}(?:resolve|resolvi[oó])/i);
    assert.match(source, /449 filas[\s\S]{0,80}140\.715\s+bytes/i);
    assert.match(source, new RegExp(catalogFingerprintSha));
    assert.match(source, /s14c-baseline-disposable-replay-receipt\.json/);
    assert.match(source, new RegExp(replayReceiptSha));
    assert.match(source, /main \+ Preview[\s\S]{0,80}2 endpoints[\s\S]{0,80}0 snapshots/i);
    assert.match(source, /Preview y\s+Production[\s\S]{0,80}cero\s+escrituras/i);
    assert.match(source, /puntolimpio-staging-neon/);
    assert.match(source, /ownership[\s\S]{0,80}naming[\s\S]{0,120}(?:no\s+est[aá]n\s+gobernados|bloquea)/i);
    assert.match(source, /RELEASE_ATTESTATION_NOT_GOVERNED/);
    assert.match(source, /635 pruebas[\s\S]{0,100}634 aprobadas[\s\S]{0,100}1\s+(?:smoke\s+)?opt-in\s+omitido[\s\S]{0,100}backend[\s\S]{0,30}20\/20/i);
    assert.match(source, /e74339c[\s\S]{0,160}12\/12/i);
    assert.match(source, /v1\.10\.0[\s\S]{0,200}4108ca0[\s\S]{0,180}11\/11|v1\.10\.0[\s\S]{0,200}11\/11[\s\S]{0,180}4108ca0/i);
    assert.match(source, /Unreleased/);
  }

  const roadmap = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');
  assert.match(
    roadmap,
    /evidencia\s+productiva vigente de `v1\.10\.0`[\s\S]{0,200}commit\/tag `4108ca0`[\s\S]{0,100}producto `d11fd39`/i
  );
});

test('the public 1.9.0 release is exact while private MuniGuia remains local-only', () => {
  const releasePaths = [
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

  for (const relativePath of releasePaths) {
    const source = read(relativePath);
    assert.match(source, /1\.9\.0(?![-+0-9A-Za-z.])/, `${relativePath} must expose 1.9.0`);
    assert.match(source, /MuniGu[ií]a/i);
    assert.match(source, /muniguia-contextual-v1/);
    assert.match(source, /f9d1f88/);
    assert.match(source, /ed76347/);
    assert.match(source, /dpl_Euk4csdfWw5rayohoW3xXo1vXayY/);
    assert.match(source, /Ready/);
    assert.match(source, /Production/);
    assert.match(source, /https:\/\/municipio-junin\.vercel\.app/);
    assert.match(source, /(?:release:truth:check|gate)[\s\S]{0,120}10\/10[\s\S]{0,80}exit\s*`?(?:<code>)?0/i);
    assert.match(source, /checkedAt 2026-08-09T14:42:10Z/);
    assert.match(source, /\/login/);
    assert.match(source, /\/roles/);
    assert.match(source, /siete perfiles/i);
    assert.match(source, /390(?:\s*px)?[\s\S]{0,80}1440(?:\s*px)?/i);
    assert.match(source, /overflow/i);
    assert.match(source, /errores de consola/i);
    assert.match(source, /requests externos/i);
    for (const pathname of ['/dashboard', '/inicio', '/manuales']) assert.match(source, new RegExp(pathname));
    assert.match(source, /an[oó]nimos[\s\S]{0,100}redirigieron[\s\S]{0,20}al login/i);
    assert.match(source, /https:\/\/github\.com\/inguillen87\/municipio-junin\/releases\/tag\/v1\.9\.0/);
    assert.match(source, /GitHub Release[\s\S]{0,100}live/i);
    assert.match(source, /10\/10/);
    assert.match(source, /532/);
    assert.match(source, /1\s+smoke\s+opt-in\s+omitido/i);
    assert.match(source, /backend[\s\S]{0,40}20\/20/i);
    assert.match(source, /MuniGu[ií]a privada[\s\S]{0,120}(?:s[oó]lo|evidencia)[\s\S]{0,60}local/i);
    assert.match(source, /proyecci[oó]n\s+autoritativa\s+simulada/i);
    assert.match(source, /(?:no certifica|no acredita)/i);
    for (const boundary of [/autorizaci[oó]n positiva/i, /cuentas reales/i, /DB/i, /baseline restaurado/i, /MFA\/lifecycle persistido/i, /GRH remoto/i]) {
      assert.match(source, boundary);
    }
    assert.match(source, /(?:documental|registro)[\s\S]{0,40}post-release[\s\S]{0,100}no\s+mueve[\s\S]{0,60}tag/i);
  }

  for (const relativePath of [
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

test('release 1.10.0 preserves the exact public 1.9.0 and 1.8.1 evidence', () => {
  const rootManifest = JSON.parse(read('package.json'));
  const rootLock = JSON.parse(read('package-lock.json'));
  const backendManifest = JSON.parse(read('backend/package.json'));
  assert.equal(rootManifest.name, 'municipio-junin');
  assert.equal(rootManifest.version, '1.10.0');
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
    assert.match(source, /no\s+(?:demuestra|declara|acredita|certifica|infiere)/i,
      'public release evidence must retain an explicit non-certification boundary');
    for (const boundary of [/DB/i, /cuentas/i, /autorización\s+positiva/i, /datos[\s\S]{0,40}remotos/i]) {
      assert.match(source, boundary, 'public release evidence must not be promoted beyond public surfaces');
    }
    assert.match(source, /(?:s[oó]lo\s+registr(?:a|ó)|registro)[\s\S]{0,100}(?:evidencia documental\s+)?post-release/i);
    assert.match(source, /no (?:mueve|movi[oó])[\s\S]{0,60}(?:el )?tag/i);
    assert.doesNotMatch(source, /v1\.8\.1[\s\S]{0,180}(?:pendiente de push|requiere push|permanece local)/i,
      'released v1.8.1 must not be described as a local candidate');
  }

  const prismaRunbook = read('docs/PRISMA_BASELINE_Y_DRIFT.md');
  assert.match(prismaRunbook, /\*\*Versi\\u00f3n:\*\* 1\.3\.0/);
  assert.match(prismaRunbook, /WP0-L v2 ejecutado conectado/);
  assert.match(prismaRunbook, /Corte conectado S14B[\s\S]{0,2400}`_prisma_migrations` `absent`/i);
  assert.match(prismaRunbook, /S14C[\s\S]{0,180}baseline v2 reproducible/i);
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

  const suiteRunner = read('scripts/run-test-suite.mjs');
  assert.match(suiteRunner, /const concurrency = 3;/);
  assert.match(suiteRunner, /--test-concurrency=\$\{concurrency\}/);
  assert.match(read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md'), /concurrencia a tres procesos/i);

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
  assert.match(read('docs/MASTER_PLAN_STATUS.md'), /browser p[uú]blico[\s\S]{0,120}\/login[\s\S]{0,80}\/roles/i);
});

test('runtime baselines are pinned and the current engineering environment passes preflight', () => {
  const rootManifest = JSON.parse(read('package.json'));
  const backendManifest = JSON.parse(read('backend/package.json'));
  assert.equal(rootManifest.engines.node, '>=22.12.0 <25');
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

test('Prisma baseline is reproducible offline while release stays blocked without governed attestation', () => {
  const manifest = JSON.parse(read('prisma/migrations/baseline-manifest.json'));
  const result = spawnSync(process.execPath, ['scripts/assert-prisma-migrations.mjs', '--offline', '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      PRISMA_BASELINE_ID: manifest.baselineId,
      PRISMA_MIGRATION_SET_ID: manifest.migrationSetId,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.migrationCount, 3);
  assert.equal(payload.prismaVersion, '5.22.0');
  assert.equal(payload.baselinePolicyVersion, 'prisma-baseline-additive-v1');
  assert.equal(manifest.contractVersion, 2);

  const runbook = read('docs/PRISMA_BASELINE_Y_DRIFT.md');
  assert.match(runbook, /integridad offline[\s\S]*evidencia conectada/i);
  assert.match(runbook, /baselineId[\s\S]*migrationSetId/i);
  assert.match(runbook, /receipt[\s\S]*fuera del checkout/i);
  assert.match(runbook, /no se aprovisionan cuentas/i);
  assert.match(runbook, /RELEASE_ATTESTATION_NOT_GOVERNED/);
  assert.match(runbook, /receipt[\s\S]*(?:no|ni) autoriza DDL/i);
  assert.match(runbook, /CI\/KMS\/OIDC/);
});

test('connected GRH ledger rehearsal closes child drift without authorizing stable release', () => {
  const rootManifest = JSON.parse(read('package.json'));
  const migrationManifest = JSON.parse(read('prisma/migrations/baseline-manifest.json'));
  const runbook = read('docs/PRISMA_BASELINE_Y_DRIFT.md');
  const deployment = read('DEPLOYMENT.md');
  const readme = read('README.md');
  const postgresGate = read('docs/GRH_ACTION_LEDGER_POSTGRES_GATE.md');
  const candidateSmoke = read('docs/GRH_ACTION_LEDGER_CANDIDATE_SMOKE.md');

  assert.equal(rootManifest.scripts['db:grh-ledger:verify'],
    'node scripts/verify-grh-action-ledger-postgres.mjs');
  assert.equal(rootManifest.scripts['smoke:grh-ledger:candidate'],
    'node scripts/grh-action-ledger-candidate-smoke.mjs');
  assert.equal(rootManifest.scripts['smoke:grh-ledger:candidate:mutate'],
    'node scripts/grh-action-ledger-candidate-smoke.mjs --mutate-disposable');
  assert.deepEqual(migrationManifest.migrations.map(entry => entry.directory), [
    '20260809220336_baseline',
    '20260811122648_grh_directory_enterprise_authz',
    '20260811190000_grh_action_ledger',
  ]);

  for (const source of [runbook, deployment]) {
    assert.match(source, /br-divine-feather-ac5byb1l/);
    assert.match(source, /migrate status[\s\S]{0,100}up-to-date/i);
    assert.match(source, /PostgreSQL[\s\S]{0,30}170010/i);
    assert.match(source, /dbe339d045e5d09822eac514a528f96f8876f9517c318f6e5db3944026b1efaa/);
    assert.match(source, /migrate diff[\s\S]{0,180}drift nominal[\s\S]{0,160}(?:compound|compuestas?)/i);
    assert.match(source, /No difference detected[\s\S]{0,80}exit `0`/i);
    assert.match(source, /(?:gate de drift[\s\S]{0,60}cerrado|cero drift)/i);
    assert.match(source, /(?:cero DDL[^\n]{0,100}main,\s*Preview\s*y\s*Production|main,\s*Preview\s*(?:y|o)\s*Production[\s\S]{0,100}(?:cero DDL|no se aplic|permanecen|recibieron))/i);
    assert.match(source, /(?:no hay release estable|no es (?:un )?release estable|release estable\s+(?:sigue\s+)?bloqueado|prohibido convertir[\s\S]{0,80}en un\s+release estable)/i);
    assert.match(source, /target[\s\S]{0,180}atestaci[oó]n[\s\S]{0,180}backup[\s\S]{0,240}(?:Preview[\s\S]{0,120}(?:configuraci[oó]n|identidades)|(?:configuraci[oó]n|identidades)[\s\S]{0,120}Preview)/i);
    assert.match(source, /store real[\s\S]{0,120}(?:Prisma\/`pg`|Prisma\/[`]?pg[`]?)[\s\S]{0,220}(?:replay exacto|replay)[\s\S]{0,100}CONTADOR[\s\S]{0,100}(?:complete|versi[oó]n 3)/i);
    assert.match(source, /versi[oó]n 3[\s\S]{0,80}tres eventos[\s\S]{0,80}una (?:fila|fila en la lista|fila listada)/i);
    assert.match(source, /triggers append-only[\s\S]{0,100}(?:rechazaron|bloquearon)[\s\S]{0,40}`UPDATE`[\s\S]{0,40}`DELETE`/i);
    assert.match(source, /(?:datos|identidades\/evidencia)\s+sint[eé]tic/i);
    assert.match(source, /no fue un\s+smoke HTTP/i);
  }

  assert.match(runbook, /20260809220336_baseline[\s\S]{0,500}20260811122648_grh_directory_enterprise_authz[\s\S]{0,180}20260811190000_grh_action_ledger/);
  assert.match(runbook, /grh-action-ledger-postgres-verification-v1[\s\S]{0,120}(?:PASS|read only)/i);
  assert.match(runbook, /2026-08-12T00:01:22\.274Z/);
  assert.match(postgresGate, /REPEATABLE READ READ ONLY/);
  assert.match(postgresGate, /no aplica migraciones[\s\S]{0,100}no autoriza DDL/i);
  assert.match(candidateSmoke, /Candidate read-only, predeterminado/i);
  assert.match(candidateSmoke, /Candidate mutante, s[oó]lo Preview disposable/i);
  assert.match(readme, /db:grh-ledger:verify/);
  assert.match(readme, /GRH_ACTION_LEDGER_POSTGRES_GATE\.md/i);
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
  const platformProvided = new Set(['VERCEL_ENV', 'VERCEL_URL']);
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
  assert.match(source, /data-doc-version="1\.10\.0"/);
  assert.match(source, /data-doc-contract="operational-truth-v1"/);
  assert.match(source, /data-primary-source="grh"/);
  assert.match(source, /data-secondary-source-policy="personas-auxiliary-diagnostic"/);
  assert.match(source, /data-realtime="false"/);
  assert.match(source, /grh-executive-v2/);
  assert.match(source, /grh-quality-v1/);
  assert.match(source, /grh-movement-operations-v1/);
  assert.match(source, /Registros históricos de movimientos/i);
  assert.match(source, /no (?:deben interpretarse|permiten afirmar)[\s\S]{0,40}altas, bajas[\s\S]{0,40}rotación/i);
  assert.match(source, /\/api\/grh-data[\s\S]{0,180}410 GRH_RAW_CONTRACT_RETIRED[\s\S]{0,100}sin leer artefactos/i);
  assert.match(source, /O2A[\s\S]{0,180}105,5 s[\s\S]{0,180}294 ms/i);
  assert.match(source, /PUBLISHED[\s\S]{0,120}no significa DB, API ni producción/i);
  assert.match(source, /Estado operativo actual · 14 de agosto de 2026/i);
  assert.match(source, /MuniGuía reconoce 22 pantallas privadas/i);
  assert.match(source, /Primer día con MuniGuía[\s\S]{0,120}efímero durante la sesión/i);
});

test('S19 documents role-bound onboarding without inventing permissions or employee scoring', () => {
  const userManual = read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md');
  const masterPlan = read('docs/MASTER_PLAN_STATUS.md');

  for (const source of [userManual, masterPlan]) {
    assert.match(source, /munigu[ií]a/i);
    assert.match(source, /capabilit(?:y|ies)/i);
    assert.match(source, /(?:sólo|únicamente) durante la sesión/i);
    assert.match(source, /(?:no|nunca) (?:modifica|concede)[\s\S]{0,80}(?:permisos|roles)/i);
  }
  assert.match(userManual, /Visitar una ruta o cerrar la guía no completa la etapa/i);
  assert.match(userManual, /no crea métricas de desempeño/i);
  assert.match(masterPlan, /muniguia-onboarding-v1/i);
  assert.match(masterPlan, /no incorpora RAG, streaming, un proveedor nuevo/i);
});

test('S20 documents action-first navigation and aggregate payroll-run controls without widening truth', () => {
  const userManual = read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md');
  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  const masterPlan = read('docs/MASTER_PLAN_STATUS.md');
  const roadmap = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');
  const readme = read('README.md');

  for (const source of [userManual, technical, masterPlan, roadmap]) {
    assert.match(source, /corridas y marcas de cierre/i);
    assert.match(source, /(?:no|ni) (?:acredita|demuestra|prueba)[\s\S]{0,100}(?:pago|cierre contable)/i);
  }
  for (const source of [technical, masterPlan]) {
    assert.match(source, /grh-payroll-run-control-v1/i);
    assert.match(source, /625[\s\S]{0,80}612[\s\S]{0,80}13/i);
  }
  assert.match(userManual, /Ctrl\+K[\s\S]{0,120}capabilit(?:y|ies)/i);
  assert.match(masterPlan, /focus=<priorityCode>[\s\S]{0,120}nunca (?:crea|abre|modifica)/i);
  assert.match(readme, /Sólo se\s+versionan y empaquetan los artefactos agregados/i);
  assert.match(readme, /dumps[\s\S]{0,120}no se deben commitear/i);
});

test('S21 remains historical and S22 records its exact Production evidence', () => {
  const technical = read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md');
  const userManual = read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md');
  const masterPlan = read('docs/MASTER_PLAN_STATUS.md');
  const roadmap = read('docs/ENTERPRISE_PRODUCT_ROADMAP.md');

  for (const source of [technical, userManual, masterPlan, roadmap]) {
    assert.match(source, /conceptos fijos/i);
    assert.match(source, /(?:no|ni) (?:publica|muestra|contienen)[\s\S]{0,100}(?:importes|identificadores|legajos)/i);
  }
  assert.match(technical, /legajo\.IDPERSONA/i);
  assert.match(masterPlan, /191[\s\S]{0,80}185[\s\S]{0,120}94\/90[\s\S]{0,80}19\/18[\s\S]{0,80}78\/77/i);
  assert.match(masterPlan, /DEMO[\s\S]{0,80}INSPECTOR[\s\S]{0,80}TENANT_USER[\s\S]{0,120}no heredan/i);
  assert.match(masterPlan, /recorrido completo de 3 a 5 etapas/i);
  for (const source of [technical, userManual, masterPlan, roadmap]) {
    assert.match(source, /5\.936[\s\S]{0,40}3\.395[\s\S]{0,140}749\/662[\s\S]{0,160}legajo\.IDPERSONA/i);
    assert.match(source, /(?:históric[\s\S]{0,160}752\/662|752\/662[\s\S]{0,160}(?:históric|no (?:se )?(?:reescribe|sobreescribe|reemplaza)))/i);
  }
  assert.match(roadmap, /4cd0926627a786634696cbed8e75ecc8934100c6/);
  assert.match(roadmap, /dpl_GdoRTP3iLBFjfbTHt3CRd3Xknio3[\s\S]{0,80}28\/28[\s\S]{0,80}(?:cero|0) respuestas?\s+5xx/i);
  for (const source of [technical, userManual, masterPlan, roadmap]) {
    assert.match(source, /8a1ab580a171e359b05629356353ed6f6e4b7364/);
    assert.match(source, /dpl_CyH6wZuYi5XjaYwqXi1ZF3Yd7wNK[\s\S]{0,100}29\/29[\s\S]{0,100}(?:cero|0)\s+(?:respuestas?\s+)?5xx/i);
  }
  assert.match(roadmap, /S22 fue \*\*verificado en Production el 14 de agosto de 2026\*\*/i);
});

test('S24 records exact Production evidence without weakening garden data limits', () => {
  const sources = [
    read('README.md'),
    read('manuales.html'),
    read('docs/MASTER_PLAN_STATUS.md'),
    read('docs/ENTERPRISE_PRODUCT_ROADMAP.md'),
    read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md'),
    read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md'),
    read('docs/MANUAL_INTEGRAL.md'),
    read('docs/GOVTECH_BENCHMARK.md'),
    read('docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md'),
  ];

  for (const source of sources) {
    assert.match(source, /5b356bf4982f0b3c486ade33e027faa0cf9c8a93/);
    assert.match(source, /dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn/);
    assert.match(source, /30\/30/);
  }
  const joined = sources.join('\n');
  assert.match(joined, /107[\s\S]{0,120}45[\s\S]{0,120}62/);
  assert.match(joined, /(?:no|ni) informa[\s\S]{0,120}(?:matrícula|capacidad|asistencia|PII)/i);
  assert.match(joined, /(?:Usuario|TENANT_USER)[\s\S]{0,80}(?:Inspector|INSPECTOR)[\s\S]{0,80}(?:Demo|DEMO)[\s\S]{0,160}403/i);
  assert.doesNotMatch(joined, /S24\s+(?:permanece|está|sigue|quedó)(?:.{0,60})?(?:sólo|exclusivamente)?\s*(?:en el checkout )?local|S24 local\s*·\s*no Production/i);
});

test('S25 records exact Production evidence without claiming a private remote write', () => {
  const productionEvidenceSources = [
    read('README.md'),
    read('manuales.html'),
    read('docs/MASTER_PLAN_STATUS.md'),
    read('docs/ENTERPRISE_PRODUCT_ROADMAP.md'),
    read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md'),
    read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md'),
    read('docs/MANUAL_INTEGRAL.md'),
  ];
  const sources = [
    ...productionEvidenceSources,
    read('docs/GOVERNED_SOURCE_INTAKE.md'),
    read('docs/DATA_SOURCE_REGISTER.md'),
    read('docs/GOVTECH_BENCHMARK.md'),
    read('docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md'),
  ];
  const joined = sources.join('\n');

  for (const source of productionEvidenceSources) {
    assert.match(source, /2b0411a37ec6474e6988a60b26bd3d3a51da858b/);
    assert.match(source, /dpl_CEDxSq4dWFYekymNzkVBpV876JfX/);
    assert.match(source, /https:\/\/municipio-junin\.vercel\.app/);
    assert.match(source, /102 módulos[\s\S]{0,30}53 HTML[\s\S]{0,30}17 superficies/i);
    assert.match(source, /31\/31/);
    assert.match(source, /2b4da81c-5c40-45f7-8f7b-b3bb0c4a29c4/);
    assert.match(source, /58\/58[\s\S]{0,60}(?:0|cero) findings/i);
    assert.doesNotMatch(source, /S25[^.\n]{0,100}candidate local/i);
  }

  assert.match(joined, /municipal-source-intake-v1/);
  assert.match(joined, /CSV[\s\S]{0,80}XLSX[\s\S]{0,80}XLS[\s\S]{0,80}JSON[\s\S]{0,80}PDF[\s\S]{0,80}TXT/i);
  assert.match(joined, /4 MiB/);
  assert.match(joined, /quarantined|cuarentena/i);
  assert.match(joined, /no (?:conserva|retiene)[\s\S]{0,80}(?:original|archivo)/i);
  assert.match(joined, /(?:no se ejecuta|sin)[\s\S]{0,40}antimalware/i);
  assert.match(joined, /evaluaci[oó]n[\s\S]{0,120}(?:s[oó]lo lectura|read-only)[\s\S]{0,160}(?:no (?:env[ií]a|procesa|analiza)|POST[\s\S]{0,30}403)/i);
  assert.match(joined, /(?:Upload|Google Sheets)[\s\S]{0,120}410/i);
  assert.match(joined, /presupuesto[\s\S]{0,120}(?:bloqueado|no habilita|no publica)/i);
  assert.match(joined, /Evaluaci[oó]n Administrador[\s\S]{0,120}(?:pr[oó]ximo paso )?Calidad/i);
  assert.match(joined, /Task Center\/Ctrl\+K[\s\S]{0,80}(?:sin ingreso|no ofrece ingreso)/i);
  assert.match(joined, /\/importar[\s\S]{0,100}12\/12[\s\S]{0,60}(?:controles )?deshabilitados/i);
  assert.match(joined, /GET[\s`<code>]*200[\s\S]{0,30}vac[ií]o/i);
  assert.match(joined, /POST[\s`<code>]*403[\s\S]{0,40}pre-parser[\s\S]{0,80}PUBLISHED_DEMO_ROUTE_DENIED/i);
  assert.match(joined, /rol(?:es)? bajo(?:s)?[\s\S]{0,40}(?:denegad|403)/i);
  assert.match(joined, /1440\/390\/320 px[\s\S]{0,100}forced-colors[\s\S]{0,80}reduced-motion[\s\S]{0,100}sin overflow[\s\S]{0,40}(?:ni|o) errores/i);
  assert.match(joined, /cero[\s\S]{0,30}OpenAI(?:\/| ni | o )Hugging Face[\s\S]{0,80}cero escrituras DB/i);
  assert.match(joined, /POST[\s`<code>]*privado[\s`<code>]*201[\s\S]{0,100}(?:s[oó]lo|únicamente)[\s\S]{0,30}local[\s\S]{0,100}no[\s\S]{0,20}(?:mut[oó]|ejecut[oó]|ejerció)[\s\S]{0,30}Production/i);
  assert.match(joined, /presupuesto[\s\S]{0,120}(?:bloqueado|no habilita)[\s\S]{0,160}fuente oficial/i);
  assert.doesNotMatch(joined, /S25[^.\n|]{0,100}(?:candidate local|candidato local|no verificado en Production)/i);
});

test('S26 documents the Production published boundary without inventing private receipt evidence', () => {
  const sources = [
    read('manuales.html'),
    read('docs/MASTER_PLAN_STATUS.md'),
    read('docs/ENTERPRISE_PRODUCT_ROADMAP.md'),
    read('docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md'),
    read('docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md'),
    read('docs/MANUAL_INTEGRAL.md'),
  ];
  const joined = sources.join('\n');

  for (const source of sources) {
    assert.match(source, /(?:S26[\s\S]{0,3000}(?:frontera publicada[\s\S]{0,120}Production|Production[\s\S]{0,120}frontera publicada)|Production\s*·\s*S26\s*\(frontera publicada\))/i);
    assert.match(source, /(?:(?:lectura|bandeja|recorrido)[\s\S]{0,160}privad[ao][\s\S]{0,260}(?:sólo|solo)[\s\S]{0,30}local|POST[\s\S]{0,40}201[\s\S]{0,180}(?:sólo|solo)[\s\S]{0,30}local)/i);
    assert.doesNotMatch(source, /S26[^.\n|]{0,120}(?:bandeja privada|POST privado)[^.|\n]{0,120}(?:verificad[ao]|certificad[ao]) en Production/i);
    assert.doesNotMatch(source, /Production\s*·\s*S26(?!\s*\(frontera publicada\))[^.\n|]{0,200}(?:bandeja privada|POST privado)/i);
  }

  assert.match(joined, /S26[\s\S]{0,160}(?:frontera publicada|superficie publicada)[\s\S]{0,80}verificada en Production/i);
  assert.match(joined, /(?:Cuarentena|bandeja)[\s\S]{0,120}(?:Nueva fuente|20 comprobantes|20 receipts)/i);
  assert.match(joined, /(?:últimos|hasta) 20[\s\S]{0,80}(?:tenant|comprobantes|receipts)/i);
  assert.match(joined, /autoridad pendiente/i);
  assert.match(joined, /datos personales declarados|declaran posible presencia de datos personales/i);
  assert.match(joined, /createdAt desc[\s\S]{0,40}id desc/i);
  assert.match(joined, /respuesta[\s\S]{0,100}(?:alterada|duplicada|fuera del contrato)[\s\S]{0,100}falla\s+cerrada/i);
  assert.match(joined, /evaluaci[oó]n (?:pública|publicada|Administrador)[\s\S]{0,160}(?:cero GET\/POST|no ejecuta GET ni POST|no monta ni consulta)/i);
  assert.match(joined, /63d455b708ffddd44a5acc9480b42d8d0c61829d/);
  assert.match(joined, /dpl_ByHJfN26qtnsDT8dBNw9KRgMKnhS/);
  assert.match(joined, /31\/31[\s\S]{0,180}acceso Administrador[\s\S]{0,80}200[\s\S]{0,80}sin reintento/i);
  assert.match(joined, /cero 5xx\/fatal[\s\S]{0,180}390\/320[\s\S]{0,160}(?:sin solapes|sin overlap|sin intersección|no intersect)/i);
  assert.match(joined, /390\/320[\s\S]{0,180}Ayuda[\s\S]{0,100}topbar[\s\S]{0,180}(?:sin intersectar|no intersect|sin intersección)/i);
  assert.match(joined, /9df1f71b-abfe-494b-b71f-08799409fa05[\s\S]{0,100}13\/13[\s\S]{0,80}(?:cero findings|sin findings)/i);
  assert.match(joined, /1d5402f5-208f-4cac-ad72-f6d7632aa67c[\s\S]{0,100}4\/4[\s\S]{0,80}(?:cero findings|sin findings)/i);
  assert.match(joined, /102 m[oó]dulos[\s\S]{0,50}53 HTML[\s\S]{0,50}17 superficies/i);
  assert.match(joined, /(?:storage privado|original retenido)[\s\S]{0,100}antimalware[\s\S]{0,100}maker-checker[\s\S]{0,140}(?:cadena hash|resistente a alteraciones|tamper-evident)/i);
  assert.match(joined, /(?:lectura|bandeja)[\s\S]{0,80}privad[ao][\s\S]{0,160}(?:POST[\s`<code>]*201)[\s\S]{0,120}(?:sólo|solo)[\s\S]{0,30}local/i);
  assert.match(joined, /no (?:hubo|se ejercieron|se leyeron)[\s\S]{0,100}(?:receipts privados|lecturas privadas)[\s\S]{0,100}(?:escrituras DB|se escribió DB)/i);
});

test('the public landing does not route municipal or commercial data to unapproved contacts', () => {
  const source = read('landing.html');
  assert.match(source, /Canal institucional pendiente de aprobación/);
  assert.doesNotMatch(source, /mailto:|wa\.me\/|Soporte GovTech|WhatsApp Directo/i);
  assert.doesNotMatch(source, /Red de Innovación Municipal de Latinoamérica/i);
});
