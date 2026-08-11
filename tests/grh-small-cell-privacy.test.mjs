import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_PRIVACY_POLICY_VERSION,
  GRH_PROTECTED_BUCKET_LABEL,
  protectGrhMonetarySeries,
  protectGrhRanking,
  protectGrhSensitiveCountSeries,
  resolveGrhPrivacyThreshold,
} from '../api/lib/grh-privacy.js';
import {
  GRH_EXECUTIVE_SCHEMA_VERSION,
  inspectGrhExecutiveContract,
  validateGrhExecutiveContract,
} from '../api/lib/grh-executive-contract.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';

async function realSemantic() {
  return readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse);
}

function participantSum(ranking) {
  return ranking.rows.reduce((total, row) => total + (row.participants ?? 0), 0);
}

test('the real 856-participant GRH rankings hide small sector and cost-center identities', async () => {
  const semantic = await realSemantic();
  const projection = buildGrhExecutiveProjection(semantic, {
    audience: 'interactive',
    rankingLimit: 10,
  });

  assert.equal(projection.policyVersion, GRH_PRIVACY_POLICY_VERSION);
  assert.equal(projection.schemaVersion, GRH_EXECUTIVE_SCHEMA_VERSION);
  assert.equal(projection.schemaVersion, 'grh-executive-v2');
  assert.equal(projection.workforce.payrollParticipants, 856);
  assert.equal(validateGrhExecutiveContract(projection), true);

  for (const ranking of [projection.workforce.bySector, projection.workforce.byCostCenter]) {
    assert.equal(ranking.totalParticipants, 856);
    assert.equal(participantSum(ranking), 856);
    assert.equal(ranking.privacyStatus, 'partially_suppressed');
    const bucket = ranking.rows.find(row => row.privacyStatus === 'protected_aggregate');
    assert.ok(bucket);
    assert.equal(bucket.label, GRH_PROTECTED_BUCKET_LABEL);
    assert.equal(bucket.companyCode, null);
    assert.equal(bucket.sourceCode, null);
    assert.ok(bucket.participants >= 5);
  }

  const sector = JSON.stringify(projection.workforce.bySector);
  assert.doesNotMatch(sector, /ANGEL DE LA GUARDA|PICO PICOTERO|CASTILLO DE SUE[NÑ]OS/iu);
  const costCenter = JSON.stringify(projection.workforce.byCostCenter);
  assert.doesNotMatch(costCenter, /RECURSOS HUMANOS|CENTRO DE SALUD|BIBLIOTECA|PENSIONES/iu);
  assert.equal(projection.workforce.byAgreement.privacyStatus, 'released');
  assert.equal(projection.workforce.byAgreement.rows.some(row =>
    row.privacyStatus === 'protected_aggregate'), false);
});

test('ranking privacy is applied before top-N and complementary suppression prevents differencing', () => {
  const source = [
    { company_code: 101, source_code: 1, label: 'Mayor', participants: 90 },
    { company_code: 101, source_code: 2, label: 'Complementaria', participants: 7 },
    { company_code: 101, source_code: 3, label: 'Secreto', participants: 3 },
  ];
  const original = structuredClone(source);
  const protectedRanking = protectGrhRanking(source, {
    audience: 'interactive',
    domain: 'workforce',
    totalParticipants: 100,
    topN: 1,
  });

  assert.deepEqual(source, original, 'the pure helper must not mutate source aggregates');
  assert.equal(protectedRanking.threshold, 5);
  assert.equal(participantSum(protectedRanking), 100);
  assert.deepEqual(protectedRanking.rows.map(row => row.label), [
    'Mayor',
    GRH_PROTECTED_BUCKET_LABEL,
  ]);
  assert.equal(protectedRanking.rows[1].participants, 10);
  assert.doesNotMatch(JSON.stringify(protectedRanking), /Complementaria|Secreto/);
});

test('unknown sensitive cardinality fails closed without releasing labels, codes or a forged ranking', () => {
  const protectedRanking = protectGrhRanking([
    { company_code: 101, source_code: 1, label: 'Visible', participants: 80 },
    { company_code: 101, source_code: 42, label: 'Identidad sensible', participants: null },
  ], {
    audience: 'interactive',
    domain: 'workforce',
    totalParticipants: 100,
  });

  assert.equal(protectedRanking.privacyStatus, 'suppressed');
  assert.equal(protectedRanking.rows.length, 1);
  assert.deepEqual(protectedRanking.rows[0], {
    companyCode: null,
    sourceCode: null,
    label: GRH_PROTECTED_BUCKET_LABEL,
    participants: 100,
    participantDisplay: '100',
    sharePct: 100,
    privacyStatus: 'protected_aggregate',
  });
  assert.doesNotMatch(JSON.stringify(protectedRanking), /Visible|Identidad sensible|42/);
});

test('a mismatched ranking sum releases only the independently supplied safe total', () => {
  const result = protectGrhRanking([
    { company_code: 101, source_code: 1, label: 'A', participants: 60 },
    { company_code: 101, source_code: 2, label: 'B', participants: 30 },
  ], {
    audience: 'interactive',
    domain: 'workforce',
    totalParticipants: 100,
  });

  assert.equal(result.privacyStatus, 'suppressed');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].participants, 100);
  assert.doesNotMatch(JSON.stringify(result), /"A"|"B"/);
});

test('legitimate categories at or above k remain available when no top-N remainder exists', () => {
  const result = protectGrhRanking([
    { company_code: 101, source_code: 1, label: 'A', participants: 60 },
    { company_code: 101, source_code: 2, label: 'B', participants: 40 },
  ], {
    audience: 'interactive',
    domain: 'workforce',
    totalParticipants: 100,
  });

  assert.equal(result.privacyStatus, 'released');
  assert.deepEqual(result.rows.map(row => row.label), ['A', 'B']);
  assert.deepEqual(result.rows.map(row => row.participants), [60, 40]);
});

test('portable and sensitive domains use k=10 while interactive workforce uses k=5', () => {
  assert.equal(resolveGrhPrivacyThreshold({ audience: 'interactive', domain: 'workforce' }), 5);
  assert.equal(resolveGrhPrivacyThreshold({ audience: 'portable', domain: 'workforce' }), 10);
  assert.equal(resolveGrhPrivacyThreshold({ audience: 'interactive', domain: 'compensation' }), 10);
  assert.equal(resolveGrhPrivacyThreshold({ audience: 'interactive', domain: 'absence' }), 10);
  assert.equal(resolveGrhPrivacyThreshold({ audience: 'interactive', domain: 'movements' }), 10);
  assert.equal(resolveGrhPrivacyThreshold({ audience: 'interactive', domain: 'geography' }), 10);
  assert.throws(
    () => resolveGrhPrivacyThreshold({ audience: 'email', domain: 'workforce' }),
    error => error?.code === 'GRH_PRIVACY_CONTEXT_INVALID',
  );
});

test('the portable projection upgrades every workforce ranking to k=10', async () => {
  const projection = buildGrhExecutiveProjection(await realSemantic(), {
    audience: 'portable',
    rankingLimit: 10,
  });

  assert.equal(validateGrhExecutiveContract(projection), true);
  for (const ranking of [
    projection.workforce.bySector,
    projection.workforce.byCostCenter,
    projection.workforce.byAgreement,
  ]) {
    assert.equal(ranking.threshold, 10);
    assert.equal(participantSum(ranking), 856);
    assert.ok(ranking.rows.every(row => row.participants >= 10));
  }
  assert.doesNotMatch(JSON.stringify(projection.workforce.byAgreement), /ORQUESTAS INFANTILES/iu);
});

test('small and unknown monetary series preserve only safe periods and never emit zero-like disclosure', () => {
  const rows = protectGrhMonetarySeries([
    {
      period: '2026-07',
      participantCount: 9,
      amounts: { netPayrollCents: 123_456 },
    },
    {
      period: '2026-08',
      participantCount: null,
      amounts: { netPayrollCents: 987_654 },
    },
    {
      period: 'legajo-42',
      participantCount: 2,
      amounts: { netPayrollCents: 42 },
    },
    {
      period: '2026-09',
      participantCount: 10,
      amounts: { netPayrollCents: 1_000_000 },
    },
  ], {
    audience: 'interactive',
    amountKeys: ['netPayrollCents'],
    allowSuppressedPeriod: true,
  });

  for (const row of rows.slice(0, 3)) {
    assert.equal(row.participantCount, null);
    assert.equal(row.participantDisplay, '<10');
    assert.equal(row.privacyStatus, 'suppressed');
    assert.equal(row.amounts.netPayrollCents, null);
    assert.notEqual(row.participantDisplay, '0');
  }
  assert.equal(rows[0].period, '2026-07');
  assert.equal(rows[1].period, '2026-08');
  assert.equal(rows[2].period, null, 'an identifying period label must also be removed');
  assert.deepEqual(rows[3], {
    period: '2026-09',
    participantCount: 10,
    participantDisplay: '10',
    privacyStatus: 'released',
    amounts: { netPayrollCents: 1_000_000 },
  });
});

test('sensitive yearly counts release at k=10 and suppress small or unknown cardinality', () => {
  const rows = protectGrhSensitiveCountSeries([
    { period: '2024', value: 1559, participantCount: 10 },
    { period: '2025', value: 1559, participantCount: 9 },
    { period: '2026', value: 1559, participantCount: undefined },
    { period: '2027', value: 9, participantCount: 10 },
  ], {
    audience: 'interactive',
    domain: 'absence',
    allowSuppressedPeriod: true,
  });

  assert.deepEqual(rows, [
    {
      period: '2024',
      value: 1559,
      participantCount: 10,
      participantDisplay: '10',
      privacyStatus: 'released',
    },
    {
      period: '2025',
      value: null,
      participantCount: null,
      participantDisplay: '<10',
      privacyStatus: 'suppressed',
    },
    {
      period: '2026',
      value: null,
      participantCount: null,
      participantDisplay: '<10',
      privacyStatus: 'suppressed',
    },
    {
      period: '2027',
      value: null,
      participantCount: null,
      participantDisplay: '<10',
      privacyStatus: 'suppressed',
    },
  ]);
});

test('a single protected year forces one complementary suppression', () => {
  const rows = protectGrhSensitiveCountSeries([
    { period: '2023', value: 100, participantCount: 20 },
    { period: '2024', value: 80, participantCount: 10 },
    { period: '2025', value: 7, participantCount: 7 },
  ], {
    audience: 'portable',
    domain: 'absence',
    allowSuppressedPeriod: false,
  });

  assert.equal(rows.filter(row => row.privacyStatus === 'suppressed').length, 2);
  assert.deepEqual(rows.filter(row => row.privacyStatus === 'suppressed'), [
    {
      period: null,
      value: null,
      participantCount: null,
      participantDisplay: '<10',
      privacyStatus: 'suppressed',
    },
    {
      period: null,
      value: null,
      participantCount: null,
      participantDisplay: '<10',
      privacyStatus: 'suppressed',
    },
  ]);
  assert.equal(rows[0].period, '2023');
});

test('the real semantic v2 projection includes privacy-protected movements', async () => {
  const semantic = await realSemantic();
  const projection = buildGrhExecutiveProjection(semantic, {
    audience: 'interactive',
    rankingLimit: 10,
  });

  assert.equal(semantic.schema_version, 'grh-semantic-v2');
  assert.equal(projection.movements.sourceTable, 'legamov');
  assert.equal(projection.movements.metric, 'valid_rows_by_year');
  assert.equal(projection.movements.series.length, Object.keys(semantic.movements.valid_by_year).length);
  assert.equal(validateGrhExecutiveContract(projection), true);

  for (const [domainName, source] of [
    ['absence', semantic.absence],
    ['leave', semantic.leave],
    ['movements', semantic.movements],
  ]) {
    const rowsByPeriod = new Map(projection[domainName].series.map(row => [row.period, row]));
    for (const [period, participantCount] of Object.entries(source.distinct_participants_by_year)) {
      const row = rowsByPeriod.get(period);
      assert.ok(row, `${domainName} must preserve the non-identifying year`);
      if (participantCount >= 10) {
        assert.equal(row.privacyStatus, 'released');
        assert.equal(row.participantCount, participantCount);
        assert.equal(row.value, source.valid_by_year[period]);
      } else {
        assert.equal(row.privacyStatus, 'suppressed');
        assert.equal(row.participantCount, null);
        assert.equal(row.participantDisplay, '<10');
        assert.equal(row.value, null);
      }
    }
  }
});

test('the executive contract is exact-keyed and rejects privacy bypasses', async () => {
  const projection = buildGrhExecutiveProjection(await realSemantic(), {
    audience: 'interactive',
    rankingLimit: 10,
  });

  const extraKey = structuredClone(projection);
  extraKey.workforce.bySector.rows[0].rawLabel = 'no permitido';
  assert.ok(inspectGrhExecutiveContract(extraKey).errors.includes('workforce.bySector.row_structure'));

  const wrongPolicy = structuredClone(projection);
  wrongPolicy.policyVersion = 'legacy-no-suppression';
  assert.ok(inspectGrhExecutiveContract(wrongPolicy).errors.includes('policy.version'));

  const legacyV1 = structuredClone(projection);
  legacyV1.schemaVersion = 'grh-executive-v1';
  assert.ok(inspectGrhExecutiveContract(legacyV1).errors.includes('schema.version'));

  const missingMovements = structuredClone(projection);
  delete missingMovements.movements;
  const missingMovementsInspection = inspectGrhExecutiveContract(missingMovements);
  assert.ok(missingMovementsInspection.errors.includes('executive.structure'));
  assert.ok(missingMovementsInspection.errors.includes('legamov.structure'));

  const leakedBucket = structuredClone(projection);
  const bucket = leakedBucket.workforce.byCostCenter.rows.find(row => row.privacyStatus === 'protected_aggregate');
  bucket.sourceCode = 13;
  bucket.label = 'RECURSOS HUMANOS';
  const leakedInspection = inspectGrhExecutiveContract(leakedBucket);
  assert.ok(leakedInspection.errors.includes('workforce.byCostCenter.protected_identity'));

  const leakedAmount = structuredClone(projection);
  leakedAmount.compensation.series[0].participantCount = null;
  leakedAmount.compensation.series[0].participantDisplay = '0';
  leakedAmount.compensation.series[0].privacyStatus = 'suppressed';
  const amountInspection = inspectGrhExecutiveContract(leakedAmount);
  assert.ok(amountInspection.errors.includes('compensation.series.suppressed_display'));
  assert.ok(amountInspection.errors.includes('compensation.series.suppressed_amounts'));

  const brokenIdentity = structuredClone(projection);
  brokenIdentity.workforce.bySector.rows[0].participants -= 1;
  assert.ok(inspectGrhExecutiveContract(brokenIdentity).errors.includes('workforce.bySector.total_identity'));

  const portable = buildGrhExecutiveProjection(await realSemantic(), {
    audience: 'portable',
    rankingLimit: 10,
  });
  const firstSuppressedIndex = portable.absence.series.findIndex(row => row.privacyStatus === 'suppressed');
  assert.notEqual(firstSuppressedIndex, -1);

  const leakedPortablePeriod = structuredClone(portable);
  leakedPortablePeriod.absence.series[firstSuppressedIndex].period = '1991';
  assert.ok(inspectGrhExecutiveContract(leakedPortablePeriod).errors.includes(
    'ausencia.series.portable_suppressed_period',
  ));

  const reorderedPortable = structuredClone(portable);
  const [suppressedRow] = reorderedPortable.absence.series.splice(firstSuppressedIndex, 1);
  reorderedPortable.absence.series.unshift(suppressedRow);
  assert.ok(inspectGrhExecutiveContract(reorderedPortable).errors.includes(
    'ausencia.series.portable_order',
  ));
});
