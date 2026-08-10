import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import ownershipModule from '../shared/prisma-schema-ownership.cjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(repositoryRoot, 'prisma', 'schema.prisma');
const prismaCli = path.join(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const schema = readFileSync(schemaPath, 'utf8');
const validationUrl = 'postgresql://schema_validation:schema_validation@127.0.0.1:5432/schema_validation?sslmode=disable';
const require = createRequire(import.meta.url);
const EXPECTED_SCHEMA_PROJECTION_SHA256 = '588d171e79b7c7841a01b8850302dee2fdbe98a9923677cb68563ece31ddedf8';

const MODEL_TABLES = Object.freeze({
  AusenciaGrh: 'ausencias_grh',
  Barrio: 'barrios',
  Calle: 'calles',
  CategoriaGrh: 'categorias_grh',
  Ciudadano: 'ciudadanos',
  ConvenioGrh: 'convenios_grh',
  EmpleadoGrh: 'empleados_grh',
  FamiliarGrh: 'familiares_grh',
  GremioGrh: 'gremios_grh',
  LicenciaGrh: 'licencias_grh',
  Localidad: 'localidades',
  MotivoAusencia: 'motivos_ausencia',
  SectorGrh: 'sectores_grh',
});

const TENANT_BACK_RELATIONS = Object.freeze({
  barrios: 'Barrio[]',
  calles: 'Calle[]',
  categoriasGrh: 'CategoriaGrh[]',
  ciudadanos: 'Ciudadano[]',
  conveniosGrh: 'ConvenioGrh[]',
  empleadosGrh: 'EmpleadoGrh[]',
  gremiosGrh: 'GremioGrh[]',
  localidades: 'Localidad[]',
  motivosAusencia: 'MotivoAusencia[]',
  sectoresGrh: 'SectorGrh[]',
});

const RELATION_LINES = Object.freeze({
  AusenciaGrh: [
    'empleado EmpleadoGrh @relation(fields: [empleadoId], references: [id], onDelete: Cascade)',
    'motivo MotivoAusencia? @relation(fields: [motivoId], references: [id])',
  ],
  Barrio: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  Calle: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  CategoriaGrh: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  Ciudadano: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  ConvenioGrh: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  EmpleadoGrh: [
    'categoria CategoriaGrh? @relation(fields: [categoriaId], references: [id])',
    'convenio ConvenioGrh? @relation(fields: [convenioId], references: [id])',
    'gremio GremioGrh? @relation(fields: [gremioId], references: [id])',
    'sector SectorGrh? @relation(fields: [sectorId], references: [id])',
    'tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)',
  ],
  FamiliarGrh: ['empleado EmpleadoGrh @relation(fields: [empleadoId], references: [id], onDelete: Cascade)'],
  GremioGrh: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  LicenciaGrh: ['empleado EmpleadoGrh @relation(fields: [empleadoId], references: [id], onDelete: Cascade)'],
  Localidad: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  MotivoAusencia: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
  SectorGrh: ['tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)'],
});

const EXPECTED_CONTRACT = Object.freeze({
  clientAccess: 'disabled',
  migratePreserved: true,
  provenance: {
    branchId: 'br-proud-hat-achuevv2',
    kind: 'preview-introspection',
    projectId: 'falling-bird-78592221',
    tool: 'prisma-db-pull-print',
  },
  references: [
    ['Barrio', 'barrios'],
    ['Calle', 'calles'],
    ['CategoriaGrh', 'categorias_grh'],
    ['ConvenioGrh', 'convenios_grh'],
    ['GremioGrh', 'gremios_grh'],
    ['Localidad', 'localidades'],
    ['MotivoAusencia', 'motivos_ausencia'],
    ['SectorGrh', 'sectores_grh'],
  ].map(([model, table]) => ({
    classification: 'reference',
    clientAccess: 'disabled',
    migratePreserved: true,
    model,
    provenance: 'preview-introspection',
    table,
  })),
  schemaProjectionSha256: EXPECTED_SCHEMA_PROJECTION_SHA256,
  sensitive: [
    ['Ciudadano', 'ciudadanos'],
    ['EmpleadoGrh', 'empleados_grh'],
    ['FamiliarGrh', 'familiares_grh'],
    ['AusenciaGrh', 'ausencias_grh'],
    ['LicenciaGrh', 'licencias_grh'],
  ].map(([model, table]) => ({
    classification: 'sensitive',
    clientAccess: 'disabled',
    migratePreserved: true,
    model,
    provenance: 'preview-introspection',
    table,
  })),
  version: 'prisma-schema-ownership-v1',
});

function modelBlockFrom(source, model) {
  const match = source.match(new RegExp(`^model\\s+${model}\\s*\\{.*?^\\}`, 'ms'));
  assert.ok(match, `missing model ${model}`);
  return match[0];
}

function modelBlock(model) {
  return modelBlockFrom(schema, model);
}

function normalizedLines(block) {
  return block.split(/\r?\n/u).map(line => line.trim().replace(/\s+/gu, ' '));
}

function schemaProjection(source) {
  const modelProjections = Object.keys(MODEL_TABLES).sort().map(model => (
    `model:${model}\n${normalizedLines(modelBlockFrom(source, model)).filter(Boolean).join('\n')}`
  ));
  const tenantLines = normalizedLines(modelBlockFrom(source, 'Tenant')).filter(Boolean);
  const tenantBackRelations = Object.keys(TENANT_BACK_RELATIONS).sort().map(field => {
    const matches = tenantLines.filter(line => line.startsWith(`${field} `));
    assert.equal(matches.length, 1, `Tenant must have one ${field} back-relation`);
    return matches[0];
  });

  return [
    ...modelProjections,
    `tenant-backrelations\n${tenantBackRelations.join('\n')}`,
  ].join('\n---\n');
}

function schemaProjectionSha256(source) {
  return createHash('sha256').update(schemaProjection(source), 'utf8').digest('hex');
}

function mutateModel(source, model, before, after) {
  const block = modelBlockFrom(source, model);
  assert.equal(block.split(before).length - 1, 1, `${model} mutation fixture must match once`);
  return source.replace(block, block.replace(before, after));
}

function prisma(...args) {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHECKPOINT_DISABLE: '1',
      DATABASE_URL: validationUrl,
      DIRECT_URL: validationUrl,
      PRISMA_HIDE_UPDATE_MESSAGE: 'true',
    },
  });
}

function assertDeepFrozen(value, pathLabel = 'root', visited = new WeakSet()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  assert.equal(Object.isFrozen(value), true, `${pathLabel} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${pathLabel}.${key}`, visited);
  }
}

test('Preview-owned tables are exact mapped ignored models with the complete relation graph', () => {
  assert.deepEqual(Object.keys(RELATION_LINES).sort(), Object.keys(MODEL_TABLES).sort());

  for (const [model, table] of Object.entries(MODEL_TABLES)) {
    const block = modelBlock(model);
    const lines = normalizedLines(block);
    assert.equal((block.match(/^\s*@@ignore\s*$/gmu) || []).length, 1, `${model} must have one @@ignore`);
    assert.equal((block.match(new RegExp(`^\\s*@@map\\("${table}"\\)\\s*$`, 'gmu')) || []).length, 1, `${model} map drift`);
    for (const relation of RELATION_LINES[model]) assert.ok(lines.includes(relation), `${model} missing ${relation}`);
  }

  const tenant = modelBlock('Tenant');
  const tenantLines = normalizedLines(tenant);
  assert.equal((tenant.match(/^\s*[A-Za-z][A-Za-z0-9]*\s+[A-Za-z][A-Za-z0-9]*\[\]\s+@ignore\s*$/gmu) || []).length, 10);
  for (const [field, type] of Object.entries(TENANT_BACK_RELATIONS)) {
    assert.ok(tenantLines.includes(`${field} ${type} @ignore`), `Tenant missing ignored ${field}`);
  }

  for (const table of Object.values(MODEL_TABLES)) {
    assert.doesNotMatch(schema, new RegExp(`^model\\s+${table}\\s*\\{`, 'mu'));
  }
});

test('ownership contract has exact keys, classification, provenance and deep immutability', () => {
  assert.deepEqual(Object.keys(ownershipModule).sort(), ['OWNERSHIP_KEYS', 'PRISMA_SCHEMA_OWNERSHIP']);
  assert.deepEqual(ownershipModule.OWNERSHIP_KEYS, {
    contract: [
      'clientAccess',
      'migratePreserved',
      'provenance',
      'references',
      'schemaProjectionSha256',
      'sensitive',
      'version',
    ],
    entry: ['classification', 'clientAccess', 'migratePreserved', 'model', 'provenance', 'table'],
    provenance: ['branchId', 'kind', 'projectId', 'tool'],
  });
  assert.deepEqual(ownershipModule.PRISMA_SCHEMA_OWNERSHIP, EXPECTED_CONTRACT);
  assert.deepEqual(Object.keys(ownershipModule.PRISMA_SCHEMA_OWNERSHIP).sort(), ownershipModule.OWNERSHIP_KEYS.contract);
  assert.deepEqual(Object.keys(ownershipModule.PRISMA_SCHEMA_OWNERSHIP.provenance).sort(), ownershipModule.OWNERSHIP_KEYS.provenance);

  const entries = [
    ...ownershipModule.PRISMA_SCHEMA_OWNERSHIP.references,
    ...ownershipModule.PRISMA_SCHEMA_OWNERSHIP.sensitive,
  ];
  assert.equal(entries.length, 13);
  assert.equal(new Set(entries.map(entry => entry.model)).size, 13);
  assert.equal(new Set(entries.map(entry => entry.table)).size, 13);
  for (const entry of entries) assert.deepEqual(Object.keys(entry).sort(), ownershipModule.OWNERSHIP_KEYS.entry);
  assertDeepFrozen(ownershipModule);

  assert.throws(() => {
    ownershipModule.PRISMA_SCHEMA_OWNERSHIP.sensitive[0].clientAccess = 'enabled';
  }, TypeError);
  assert.throws(() => {
    ownershipModule.PRISMA_SCHEMA_OWNERSHIP.references.push({});
  }, TypeError);
  assert.throws(() => {
    ownershipModule.PRISMA_SCHEMA_OWNERSHIP.schemaProjectionSha256 = '0'.repeat(64);
  }, TypeError);
});

test('ownership schema projection pins complete models, Tenant back-relations and migration semantics', () => {
  assert.equal(schemaProjectionSha256(schema), EXPECTED_SCHEMA_PROJECTION_SHA256);
  assert.equal(
    ownershipModule.PRISMA_SCHEMA_OWNERSHIP.schemaProjectionSha256,
    EXPECTED_SCHEMA_PROJECTION_SHA256,
  );

  const mutations = [
    {
      after: 'sueldoBasico    String?',
      before: 'sueldoBasico    Float?',
      label: 'type',
      model: 'EmpleadoGrh',
    },
    {
      after: 'activo          Boolean       @default(false)',
      before: 'activo          Boolean       @default(true)',
      label: 'default',
      model: 'EmpleadoGrh',
    },
    {
      after: '@@index([tenantId])',
      before: '@@index([tenantId, activo])',
      label: 'index',
      model: 'EmpleadoGrh',
    },
    {
      after: 'empleado      EmpleadoGrh     @relation(fields: [empleadoId], references: [id], onDelete: Restrict)',
      before: 'empleado      EmpleadoGrh     @relation(fields: [empleadoId], references: [id], onDelete: Cascade)',
      label: 'foreign key',
      model: 'AusenciaGrh',
    },
  ];

  for (const mutation of mutations) {
    const mutatedSchema = mutateModel(schema, mutation.model, mutation.before, mutation.after);
    assert.notEqual(
      schemaProjectionSha256(mutatedSchema),
      EXPECTED_SCHEMA_PROJECTION_SHA256,
      `${mutation.label} mutation escaped ownership projection`,
    );
  }
});

test('ignored ownership models remain materialized in Prisma migration SQL', () => {
  const result = prisma('migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaPath, '--script');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const table of Object.values(MODEL_TABLES)) {
    assert.match(result.stdout, new RegExp(`^CREATE TABLE "${table}"`, 'mu'), `migration omits ${table}`);
  }
});

test('Prisma validates and both generated clients omit every ignored model delegate', async () => {
  const validation = prisma('validate', '--schema', schemaPath);
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);

  const generation = prisma('generate', '--schema', schemaPath);
  assert.equal(generation.status, 0, generation.stderr || generation.stdout);

  const rootGenerated = require('@prisma/client');
  const backendGenerated = require(path.join(repositoryRoot, 'backend', 'generated', 'prisma'));
  const clients = [
    new rootGenerated.PrismaClient({ datasourceUrl: validationUrl }),
    new backendGenerated.PrismaClient({ datasourceUrl: validationUrl }),
  ];

  try {
    for (const [generated, client] of [[rootGenerated, clients[0]], [backendGenerated, clients[1]]]) {
      const generatedModels = generated.Prisma.dmmf.datamodel.models.map(model => model.name);
      assert.ok(generatedModels.includes('Tenant'));
      assert.ok(client.tenant);
      for (const model of Object.keys(MODEL_TABLES)) {
        const delegate = `${model[0].toLowerCase()}${model.slice(1)}`;
        assert.equal(generatedModels.includes(model), false, `${model} leaked into DMMF`);
        assert.equal(delegate in client, false, `${delegate} leaked into PrismaClient`);
        assert.equal(client[delegate], undefined, `${delegate} must be unavailable`);
      }
    }
  } finally {
    await Promise.all(clients.map(client => client.$disconnect()));
  }
});
