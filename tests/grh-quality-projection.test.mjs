import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_QUALITY_SCHEMA_VERSION,
  inspectGrhQualityContract,
  validateGrhQualityContract,
} from '../api/lib/grh-quality-contract.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

async function realBundle() {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return { profile, semantic };
}

test('the real GRH bundle produces an exact, frozen, browser-safe quality projection', async () => {
  const { profile, semantic } = await realBundle();
  const profileBefore = structuredClone(profile);
  const semanticBefore = structuredClone(semantic);
  const projection = buildGrhQualityProjection(profile, semantic);

  assert.equal(projection.schemaVersion, GRH_QUALITY_SCHEMA_VERSION);
  assert.equal(validateGrhQualityContract(projection), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.temporal.domains.calculo), true);
  assert.deepEqual(profile, profileBefore, 'the profile source must remain immutable');
  assert.deepEqual(semantic, semanticBefore, 'the semantic source must remain immutable');
  assert.deepEqual(projection.source.excludedSources, ['personas_junin']);
  assert.equal(projection.source.realtime, false);
  assert.equal(projection.privacy.rawRowsExported, false);
  assert.equal(projection.privacy.categoricalLabelsExported, false);
  assert.equal(projection.privacy.cellCodesExported, false);
  assert.equal(projection.privacy.monetarySeriesExported, false);
});

test('inventory, temporal quarantine and score identities reconcile on the real GRH data', async () => {
  const { profile, semantic } = await realBundle();
  const projection = buildGrhQualityProjection(profile, semantic);

  assert.deepEqual(projection.inventory.all, {
    totalTables: 257,
    nonEmptyTables: 147,
    emptyTables: 110,
    totalRows: 6_573_057,
  });
  assert.deepEqual(projection.inventory.focal, {
    totalTables: 22,
    nonEmptyTables: 22,
    emptyTables: 0,
    totalRows: 4_908_280,
  });
  assert.deepEqual(projection.inventory.remainder, {
    totalTables: 235,
    nonEmptyTables: 125,
    emptyTables: 110,
    totalRows: 1_664_777,
  });
  assert.equal(projection.temporal.quarantineRows, 20_534);
  assert.equal(projection.quality.risks.quarantinedTemporalRows, 20_534);
  assert.equal(projection.quality.score, 88.99);
  assert.equal(projection.quality.components.payrollReconciliation.score, 63.88);
});

test('temporal and referential facts remain useful without publishing cell dimensions', async () => {
  const { profile, semantic } = await realBundle();
  const projection = buildGrhQualityProjection(profile, semantic);

  assert.deepEqual(Object.keys(projection.temporal.domains), [
    'ausencia', 'calculo', 'legamov', 'licencia', 'totpago',
  ]);
  assert.equal(projection.temporal.domains.calculo.rows, 4_363_790);
  assert.equal(projection.temporal.domains.calculo.quarantineRows, 20_270);
  assert.equal(projection.temporal.domains.calculo.validRatePct, 99.5355);
  assert.deepEqual(Object.keys(projection.referential.facts), [
    'calculo', 'legamov', 'ausencia', 'licencia',
  ]);
  assert.equal(projection.referential.facts.ausencia.orphanRows, 6);
  assert.equal(projection.referential.facts.licencia.employeeCoveragePct, 22.6531);
  assert.equal(projection.referential.legajo.uniquenessPct, 100);
});

test('cross-source controls expose aggregate diagnostics but no runs, periods or concepts', async () => {
  const { profile, semantic } = await realBundle();
  const projection = buildGrhQualityProjection(profile, semantic);
  const reconciliation = projection.reconciliation;

  assert.equal(reconciliation.status, 'material_differences_detected');
  assert.equal(reconciliation.totpagoDiagnosticStatus, 'not_cross_source_reconciled');
  assert.equal(reconciliation.unionRuns, 602);
  assert.equal(reconciliation.matchedRuns, 589);
  assert.equal(reconciliation.runCoveragePct, 97.8405);
  assert.equal(reconciliation.metricExactRatePct, 74.7708);
  assert.equal(reconciliation.valueAgreementPct, 19.0362);
  assert.equal(reconciliation.scorePct, 63.8825);
  assert.equal('periodSeries' in reconciliation, false);
  assert.equal('latestPeriodRuns' in reconciliation, false);
  assert.equal('comparison' in reconciliation, false);
});

test('the projection does not carry source labels, category codes, concepts or monetary series', async () => {
  const { profile, semantic } = await realBundle();
  const serialized = JSON.stringify(buildGrhQualityProjection(profile, semantic));

  assert.doesNotMatch(serialized, /ANGEL DE LA GUARDA|RECURSOS HUMANOS|ORQUESTAS INFANTILES/iu);
  assert.doesNotMatch(serialized, /gross_with_family_allowances|concepto 99[0-9]|company_code|source_code/iu);
  assert.doesNotMatch(serialized, /valid_period_series|calculation_control_series|latest_top_detail_concepts/iu);
  assert.doesNotMatch(serialized, /"label"\s*:|"companyCode"\s*:|"sourceCode"\s*:/u);
});

test('the exact-key contract blocks extra fields, PII and forged privacy claims', async () => {
  const { profile, semantic } = await realBundle();
  const projection = buildGrhQualityProjection(profile, semantic);

  const extra = structuredClone(projection);
  extra.referential.facts.calculo.email = 'persona@junin.gob.ar';
  const extraInspection = inspectGrhQualityContract(extra);
  assert.ok(extraInspection.errors.includes('referential.calculo.structure'));
  assert.ok(extraInspection.errors.includes('privacy.forbidden_property'));
  assert.ok(extraInspection.errors.includes('privacy.forbidden_value'));

  const forged = structuredClone(projection);
  forged.privacy.rawRowsExported = true;
  assert.ok(inspectGrhQualityContract(forged).errors.includes('privacy.rawRowsExported'));

  const labeledIdentifier = structuredClone(projection);
  labeledIdentifier.source.canonicalSystem = 'GRH Junín DNI 12.345.678';
  const piiInspection = inspectGrhQualityContract(labeledIdentifier);
  assert.ok(piiInspection.errors.includes('source.canonical_system'));
  assert.ok(piiInspection.errors.includes('privacy.forbidden_value'));
});

test('the contract fails closed when aggregate identities or ranges are altered', async () => {
  const { profile, semantic } = await realBundle();
  const projection = buildGrhQualityProjection(profile, semantic);

  const cases = [
    ['inventory.totalRows_identity', value => { value.inventory.remainder.totalRows -= 1; }],
    ['temporal.calculo.row_identity', value => { value.temporal.domains.calculo.validRows -= 1; }],
    ['quality.risks.quarantine_identity', value => { value.quality.risks.quarantinedTemporalRows -= 1; }],
    ['referential.ausencia.row_identity', value => { value.referential.facts.ausencia.matchedRows -= 1; }],
    ['reconciliation.union_identity', value => { value.reconciliation.unionRuns -= 1; }],
    ['reconciliation.score_identity', value => { value.reconciliation.scorePct = 99; }],
    ['quality.weight_identity', value => { value.quality.components.temporalValidity.weightPct = 31; }],
  ];

  for (const [expectedError, mutate] of cases) {
    const candidate = structuredClone(projection);
    mutate(candidate);
    assert.ok(
      inspectGrhQualityContract(candidate).errors.includes(expectedError),
      `expected ${expectedError}`,
    );
  }
});

test('the builder rejects invalid sources and any focal inventory drift before projection', async () => {
  const { profile, semantic } = await realBundle();

  const wrongSha = structuredClone(semantic);
  wrongSha.source.sha256 = 'a'.repeat(64);
  assert.throws(
    () => buildGrhQualityProjection(profile, wrongSha),
    error => error?.code === 'GRH_QUALITY_SOURCE_IDENTITY_INVALID' &&
      error.details.includes('source.source_sha256_identity'),
  );

  const driftedDictionary = structuredClone(semantic);
  driftedDictionary.table_dictionary.tables.find(row => row.table === 'cargo').rows += 1;
  assert.throws(
    () => buildGrhQualityProjection(profile, driftedDictionary),
    error => error?.code === 'GRH_QUALITY_SOURCE_IDENTITY_INVALID' &&
      error.details.includes('inventory.focal_row_count_identity'),
  );

  const invalidProfile = structuredClone(profile);
  invalidProfile.email = 'persona@junin.gob.ar';
  assert.throws(
    () => buildGrhQualityProjection(invalidProfile, semantic),
    error => error?.code === 'GRH_QUALITY_SOURCE_INVALID',
  );
});
