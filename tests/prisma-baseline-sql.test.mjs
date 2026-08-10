import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { inspectBaselineSql } from '../shared/prisma-migration-contract.mjs';

function inspect(sql) {
  const errors = [];
  const result = inspectBaselineSql(sql, errors, 'fixture_baseline');
  return { result, errors };
}

test('real baseline is additive DDL with the exact reconciled object counts', () => {
  const sql = fs.readFileSync(
    path.resolve('prisma/migrations/20260809220336_baseline/migration.sql'),
    'utf8',
  );
  const { result, errors } = inspect(sql);
  assert.deepEqual(errors, []);
  assert.deepEqual(result, {
    statementCount: 82,
    enum: 3,
    table: 25,
    index: 25,
    foreignKey: 29,
  });
  assert.doesNotMatch(sql, /^(?:INSERT|UPDATE|DELETE|MERGE|COPY|TRUNCATE|DROP|GRANT|REVOKE)\b/im);
});

test('lexer permits semicolons and dangerous words only inside literals or comments', () => {
  const sql = [
    '-- DROP TABLE is documentation, never execution',
    'CREATE TABLE "safe" (',
    '  "id" TEXT NOT NULL DEFAULT \'insert;drop\',',
    '  CONSTRAINT "safe_pkey" PRIMARY KEY ("id")',
    ');',
    '',
  ].join('\n');
  const { result, errors } = inspect(sql);
  assert.deepEqual(errors, []);
  assert.equal(result.table, 1);
  assert.equal(result.statementCount, 1);
});

test('baseline allowlist rejects mutations, privilege changes and executable blocks', () => {
  const forbidden = [
    'INSERT INTO "safe" VALUES (\'1\');\n',
    'COPY "safe" FROM STDIN;\n',
    'DROP TABLE "safe";\n',
    'CREATE ROLE dangerous;\n',
    'GRANT SELECT ON "safe" TO PUBLIC;\n',
    'CREATE TABLE "copy" AS SELECT * FROM "safe";\n',
    'DO $$ BEGIN PERFORM 1; END $$;\n',
    'CREATE TABLE "safe" ("id" TEXT); DELETE FROM "safe";\n',
  ];
  for (const sql of forbidden) {
    const { result, errors } = inspect(sql);
    assert.equal(result, null, sql);
    assert.ok(errors.some(error => error.code === 'BASELINE_SQL_POLICY_VIOLATION'), sql);
  }
});

test('baseline rejects Prisma history DDL and unterminated SQL lexemes', () => {
  for (const sql of [
    'CREATE TABLE "_prisma_migrations" ("id" TEXT);\n',
    'CREATE TABLE "safe" ("id" TEXT DEFAULT \'unterminated);\n',
    '/* unterminated\nCREATE TABLE "safe" ("id" TEXT);\n',
  ]) {
    const { result, errors } = inspect(sql);
    assert.equal(result, null);
    assert.ok(errors.some(error => error.code === 'BASELINE_SQL_POLICY_VIOLATION'));
  }
});
