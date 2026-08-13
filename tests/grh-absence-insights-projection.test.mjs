import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION,
  inspectGrhAbsenceInsightsContract,
} from '../api/lib/grh-absence-insights-contract.js';
import {
  buildGrhAbsenceInsightsProjection,
} from '../api/lib/grh-absence-insights-projection.js';

const ARTIFACT = JSON.parse(await readFile(
  new URL('../api/_data/grh-absence-insights.json', import.meta.url),
  'utf8',
));
const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('canonical absence artifact publishes exact historical and equal-period controls', () => {
  const projection = buildGrhAbsenceInsightsProjection(ARTIFACT, {
    expectedSourceSha256: SOURCE_SHA,
  });
  assert.equal(projection.schemaVersion, GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION);
  assert.equal(inspectGrhAbsenceInsightsContract(projection).ok, true);
  assert.deepEqual(projection.summary, {
    rawAbsenceRows: 31572,
    validAbsenceRows: 31559,
    quarantinedRows: 13,
    validReportedDays: 395559,
    motiveCatalogEntries: 27,
  });
  assert.deepEqual(projection.comparison, {
    current: { events: 5936, people: 752, days: 65847 },
    prior: { events: 3395, people: 662, days: 52190 },
    deltas: { events: 2541, people: 90, days: 13657 },
  });
  assert.deepEqual(projection.coverage, {
    current: {
      totalEvents: 5936,
      publishedCategoryEvents: 5885,
      protectedEvents: 51,
      coveragePct: 100,
    },
    prior: {
      totalEvents: 3395,
      publishedCategoryEvents: 3368,
      protectedEvents: 27,
      coveragePct: 100,
    },
  });
  assert.equal(projection.categories.length, 17);
  assert.equal(projection.protectedBucket.label, 'Otros motivos');
  assert.deepEqual(projection.protectedBucket.current, {
    privacyStatus: 'released', events: 51, people: 22, days: 1667,
  });
  assert.deepEqual(projection.protectedBucket.prior, {
    privacyStatus: 'released', events: 27, people: 19, days: 333,
  });
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.categories[0].current), true);
});

test('categories release only period cells with at least ten people and reconcile every event', () => {
  const projection = buildGrhAbsenceInsightsProjection(ARTIFACT, {
    expectedSourceSha256: SOURCE_SHA,
  });
  for (const category of projection.categories) {
    assert.match(category.key, /^reason_\d{2}$/);
    for (const period of ['current', 'prior']) {
      const cell = category[period];
      if (cell.privacyStatus === 'released') {
        assert.ok(cell.people >= 10);
        assert.ok(cell.events >= cell.people);
      } else {
        assert.deepEqual(cell, {
          privacyStatus: 'protected', events: null, people: null, days: null,
        });
      }
    }
  }
  for (const period of ['current', 'prior']) {
    const releasedEvents = projection.categories.reduce((total, category) => (
      total + (category[period].privacyStatus === 'released' ? category[period].events : 0)
    ), 0);
    assert.equal(releasedEvents, projection.coverage[period].publishedCategoryEvents);
    assert.equal(
      releasedEvents + projection.protectedBucket[period].events,
      projection.comparison[period].events,
    );
  }
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized,
    /"(?:displayName|display_name|legajo|companyCode|company_code|dni|cuil|employeeId|employee_id)"\s*:/i);
  assert.doesNotMatch(serialized, /LIC\. RAZ\.|CODI_21|DETA_21|textoReporte/i);
});

test('contract rejects source drift, shape drift, false identities and a released small cell', () => {
  assert.throws(
    () => buildGrhAbsenceInsightsProjection(ARTIFACT, {
      expectedSourceSha256: 'a'.repeat(64),
    }),
    error => error?.code === 'GRH_ABSENCE_INSIGHTS_SOURCE_MISMATCH',
  );
  assert.throws(
    () => buildGrhAbsenceInsightsProjection(ARTIFACT),
    error => error?.code === 'GRH_ABSENCE_INSIGHTS_SOURCE_PIN_INVALID',
  );

  const cases = [
    value => { value.person = { name: 'Dato privado' }; },
    value => { value.summary.validAbsenceRows -= 1; },
    value => { value.comparison.deltas.events = 0; },
    value => { value.coverage.current.publishedCategoryEvents -= 1; },
    value => { value.categories[0].current.people = 9; },
    value => { value.categories[0].current.events += 1; },
    value => { value.protectedBucket.current.events -= 1; },
    value => { value.periods.current.startDate = '2023-12-10'; },
    value => { value.source.tables.historicalLeave = 'ausencia'; },
    value => { value.privacy.rawRowsExported = true; },
    value => { value.limits[1].text = 'Toda ausencia es una licencia.'; },
  ];
  for (const mutate of cases) {
    const value = clone(ARTIFACT);
    mutate(value);
    assert.equal(inspectGrhAbsenceInsightsContract(value).ok, false);
  }
});
