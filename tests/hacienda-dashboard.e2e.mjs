import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import accessPolicy from '../shared/access-policy.cjs';
import routePolicy from '../shared/route-policy.cjs';
import tenantPresentationPolicy from '../shared/tenant-presentation-policy.cjs';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';
import { buildGrhWorkforceFinanceProjection } from '../api/lib/grh-workforce-finance-projection.js';
import {
  computeGrhWorkforceFinanceProjectionReleaseId,
  GRH_WORKFORCE_FINANCE_COMPONENT_KEYS,
  inspectGrhWorkforceFinanceContract,
} from '../api/lib/grh-workforce-finance-contract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAS_PRIVATE_GRH = ['profile', 'semantic', 'workforce-finance'].every(name =>
  existsSync(path.join(REPO, 'api', '_data', `grh-${name}.json`))
);
const PROJECTIONS = HAS_PRIVATE_GRH ? await (async () => {
  const [profile, semantic, workforceFinanceSource] = await Promise.all([
    readFile(path.join(REPO, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
    readFile(path.join(REPO, 'api', '_data', 'grh-semantic.json'), 'utf8').then(JSON.parse),
    readFile(path.join(REPO, 'api', '_data', 'grh-workforce-finance.json'), 'utf8').then(JSON.parse),
  ]);
  const configuredPresentation = tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' });
  const workforcePresentation = {
    schemaVersion: configuredPresentation.schemaVersion,
    locale: configuredPresentation.locale,
    displayCurrencyCode: configuredPresentation.displayCurrencyCode,
    basis: configuredPresentation.displayCurrencyBasis,
    effectiveFrom: configuredPresentation.displayCurrencyEffectiveOn,
    sourceCurrencyStatus: configuredPresentation.sourceCurrencyStatus,
  };
  return {
    executive: buildGrhExecutiveProjection(semantic, { audience: 'interactive' }),
    quality: buildGrhQualityProjection(profile, semantic),
    close: buildGrhCloseProjection(semantic),
    workforceFinance: buildGrhWorkforceFinanceProjection(workforceFinanceSource, {
      presentation: workforcePresentation,
    }),
  };
})() : null;

const WORKFORCE_DIMENSIONS = ['sector', 'costCenter', 'agreement'];
const WORKFORCE_PERIODS = Array.from({ length: 24 }, (_, index) => {
  const absolute = 2024 * 12 + 7 + index;
  const year = Math.floor(absolute / 12);
  const month = absolute % 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
});

function previousWorkforceMonth(period) {
  const [year, month] = period.split('-').map(Number);
  return month === 1
    ? `${String(year - 1).padStart(4, '0')}-12`
    : `${String(year).padStart(4, '0')}-${String(month - 1).padStart(2, '0')}`;
}

function syntheticComponents(index) {
  const contributory = 600_000 + index * 6_000;
  const nonContributory = 200_000 + index * 2_000;
  const family = 100_000 + index * 1_000;
  return {
    grossWithFamilyAllowancesCents: contributory + nonContributory + family,
    contributoryEarningsCents: contributory,
    nonContributoryEarningsCents: nonContributory,
    familyAllowancesCents: family,
    employeeWithholdingsCents: 200_000 + index * 2_000,
    netPayrollCents: 700_000 + index * 7_000,
    netToPayCents: 700_000 + index * 7_000,
    employerContributionsCents: 150_000 + index * 1_500,
  };
}

function splitComponents(components, percentage) {
  return Object.fromEntries(GRH_WORKFORCE_FINANCE_COMPONENT_KEYS.map(key => [
    key,
    Math.round(components[key] * percentage / 100),
  ]));
}

function zeroComponents() {
  return Object.fromEntries(GRH_WORKFORCE_FINANCE_COMPONENT_KEYS.map(key => [key, 0]));
}

function syntheticControl(components, participants) {
  const netVariance = components.netPayrollCents -
    (components.grossWithFamilyAllowancesCents - components.employeeWithholdingsCents);
  const payVariance = components.netToPayCents - components.netPayrollCents;
  const tolerance = participants === null ? null : Math.max(1, participants);
  return {
    netIdentityVarianceCents: netVariance,
    netToPayVarianceCents: payVariance,
    roundingToleranceCents: tolerance,
    identityExactlyReconciled: Math.abs(netVariance) <= 1 && Math.abs(payVariance) <= 1,
    identityWithinRoundingTolerance: tolerance === null
      ? null
      : Math.abs(netVariance) <= tolerance && Math.abs(payVariance) <= tolerance,
  };
}

function unavailableWorkforceChange(period, reason) {
  return {
    status: 'unavailable',
    reason,
    previousPeriod: previousWorkforceMonth(period),
    distinctParticipantsDelta: null,
    grossWithFamilyAllowancesDeltaCents: null,
    employeeWithholdingsDeltaCents: null,
    netPayrollDeltaCents: null,
    employerContributionsDeltaCents: null,
    netPayrollDeltaPct: null,
  };
}

function releasedWorkforceChange(period, current, previous, participants, previousParticipants) {
  const netDelta = current.netPayrollCents - previous.netPayrollCents;
  return {
    status: 'released',
    reason: 'both_consecutive_periods_released',
    previousPeriod: previousWorkforceMonth(period),
    distinctParticipantsDelta: participants - previousParticipants,
    grossWithFamilyAllowancesDeltaCents:
      current.grossWithFamilyAllowancesCents - previous.grossWithFamilyAllowancesCents,
    employeeWithholdingsDeltaCents:
      current.employeeWithholdingsCents - previous.employeeWithholdingsCents,
    netPayrollDeltaCents: netDelta,
    employerContributionsDeltaCents:
      current.employerContributionsCents - previous.employerContributionsCents,
    netPayrollDeltaPct: Number((netDelta / Math.abs(previous.netPayrollCents) * 100).toFixed(4)),
  };
}

function syntheticWorkforceCell({
  dimensionIndex,
  periodIndex,
  slot,
  share,
  components,
  previousComponents,
}) {
  const period = WORKFORCE_PERIODS[periodIndex];
  const labels = [
    ['Sector Alfa', 'Sector Beta'],
    ['Centro Alfa', 'Centro Beta'],
    ['Convenio Alfa', 'Convenio Beta'],
  ];
  if (slot === 2) {
    return {
      companyCode: null,
      sourceCode: null,
      label: 'Otros (celdas protegidas)',
      distinctParticipantsObserved: 15,
      participantDisplay: '15',
      participantPrivacyStatus: 'released',
      allocationSharePct: share,
      privacyStatus: 'protected_aggregate',
      components,
      control: syntheticControl(components, 15),
      change: unavailableWorkforceChange(period, 'protected_bucket_composition'),
    };
  }

  const firstCellCountProtected = slot === 0 && periodIndex === 10;
  const secondCellCountProtected = slot === 1 && periodIndex !== 10;
  const countProtected = firstCellCountProtected || secondCellCountProtected;
  const participants = slot === 0 ? 50 : 30;
  let change;
  if (periodIndex === 0) {
    change = unavailableWorkforceChange(period, countProtected
      ? 'membership_change_protected'
      : 'previous_period_missing');
  } else if (countProtected) {
    change = unavailableWorkforceChange(period, 'membership_change_protected');
  } else if ((slot === 0 && periodIndex === 11) || (slot === 1 && periodIndex === 10)) {
    change = unavailableWorkforceChange(period, 'participant_count_protected');
  } else {
    change = releasedWorkforceChange(
      period,
      components,
      previousComponents,
      participants,
      participants,
    );
  }
  return {
    companyCode: 101 + dimensionIndex,
    sourceCode: 11 + dimensionIndex + slot * 10,
    label: labels[dimensionIndex][slot],
    distinctParticipantsObserved: countProtected ? null : participants,
    participantDisplay: countProtected ? 'Protegido' : String(participants),
    participantPrivacyStatus: countProtected ? 'protected_difference_attack' : 'released',
    allocationSharePct: share,
    privacyStatus: 'released',
    components,
    control: syntheticControl(components, countProtected ? null : participants),
    change,
  };
}

function buildSyntheticWorkforceProjection(experience) {
  if (!experience) return null;
  const presentation = tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' });
  const periodTotals = WORKFORCE_PERIODS.map((period, index) => {
    const components = syntheticComponents(index);
    const participantCount = 80 + index % 3;
    return {
      period,
      participantCount,
      participantDisplay: String(participantCount),
      privacyStatus: 'released',
      components,
      control: syntheticControl(components, participantCount),
      reconciliation: {
        calculationRuns: 100,
        totpagoRuns: 100,
        matchedRuns: 100,
        fullyReconciledRuns: 99,
        runCoveragePct: 100,
        metricExactRatePct: 99,
        valueAgreementPct: Number((98.5 + index / 100).toFixed(2)),
        absoluteVarianceCents: 500 + index,
      },
    };
  });
  const sharesByDimension = [
    [50, 30, 20],
    [47, 34, 19],
    [43, 32, 25],
  ];
  const dimensionViews = WORKFORCE_DIMENSIONS.map((dimension, dimensionIndex) => ({
    dimension,
    assignmentSemantics: 'dimension_observed_on_calculo_run_not_contract_status',
    periods: WORKFORCE_PERIODS.map((period, periodIndex) => {
      const total = periodTotals[periodIndex].components;
      const previousTotal = periodIndex ? periodTotals[periodIndex - 1].components : total;
      const cells = sharesByDimension[dimensionIndex].map((share, slot) => syntheticWorkforceCell({
        dimensionIndex,
        periodIndex,
        slot,
        share,
        components: splitComponents(total, share),
        previousComponents: splitComponents(previousTotal, share),
      }));
      return {
        period,
        privacyStatus: 'released',
        participantAccounting: {
          periodDistinctParticipants: periodTotals[periodIndex].participantCount,
          sumCellDistinctParticipantsObserved: null,
          multiCategoryParticipants: null,
          multiCategoryParticipantDisplay: '<10',
          multiCategoryPrivacyStatus: 'protected',
          participantsMayOverlap: true,
        },
        cells,
      };
    }),
  }));
  const participantPeriodTotal = periodTotals.reduce(
    (sum, period) => sum + period.participantCount,
    0,
  );
  const source = experience.executive.source;
  const dimensionQuality = WORKFORCE_DIMENSIONS.map(dimension => ({ dimension }));
  const projection = {
    schemaVersion: 'grh-workforce-finance-v1',
    policyVersion: 'grh-workforce-finance-privacy-v1',
    releaseId: '0'.repeat(64),
    source: {
      canonicalSystem: source.canonicalSystem,
      sourceFile: source.sourceFile,
      sourceSha256: source.sourceSha256,
      compressedSizeBytes: 44_537_741,
      snapshotAsOf: source.snapshotAsOf,
      generatedAt: '2026-08-11T00:00:00.000Z',
      latestValidCalculationPeriod: WORKFORCE_PERIODS.at(-1),
      profileSchemaVersion: 'grh-profile-v1',
      semanticSchemaVersion: 'grh-semantic-v2',
      realtime: false,
    },
    metric: {
      grain: 'calendar_month_x_observed_run_dimension',
      sourceCurrencyStatus: presentation.sourceCurrencyStatus,
      amountUnit: 'source_currency_cents',
      presentationSchemaVersion: presentation.schemaVersion,
      presentationCurrency: presentation.displayCurrencyCode,
      presentationCurrencyBasis: presentation.displayCurrencyBasis,
      presentationCurrencyEffectiveOn: presentation.displayCurrencyEffectiveOn,
      presentationLocale: presentation.locale,
      status: 'calculation_control_not_bank_disbursement',
      allocationBasis: 'net_payroll_cents',
      allocationRule: 'released_only_when_all_period_cell_components_nonnegative_and_period_net_positive',
      interpretation: 'run_observed_allocation_not_exclusive_workforce_distribution',
    },
    cohort: {
      participantDefinition: 'distinct_company_employee_key_observed_in_allowlisted_control_concepts',
      assignmentMode: 'calculo_row_observed',
      assignmentGrain: 'company_employee_period_calculation_date_run_type',
      assignmentSemantics: 'dimension_observed_on_calculo_run_not_contract_status',
      publishedWindowMonths: 24,
      firstPeriod: WORKFORCE_PERIODS[0],
      lastPeriod: WORKFORCE_PERIODS.at(-1),
      oneWayDimensions: [...WORKFORCE_DIMENSIONS],
      participantsMayOverlapAcrossCategories: true,
    },
    privacy: {
      threshold: 10,
      aggregateOnly: true,
      containsPii: false,
      employeeIdentifiersExported: false,
      rawRowsExported: false,
      arbitraryFiltersAllowed: false,
      intersectionsAllowed: false,
      primarySuppression: true,
      complementarySuppression: true,
      crossPeriodProtection: 'consecutive_participant_count_difference_protection',
      smallOverlapProtection: true,
      releasedAmountsRemainArithmeticallyComparable: true,
      protectedBucketLabel: 'Otros (celdas protegidas)',
    },
    capabilities: {
      cohortFinance: 'released',
      cellArithmeticControl: 'released',
      periodCrossSourceReconciliation: 'released',
      cohortCrossSourceReconciliation: 'unavailable_no_dimensional_totpago_join',
      cohortAbsence: 'not_in_source_v1',
      cohortLeave: 'not_in_source_v1',
    },
    periodTotals,
    dimensionViews,
    quality: {
      calculation: {
        sourceRows: 1_000,
        validRows: 1_000,
        quarantineRows: 0,
        validRatePct: 100,
        windowRows: 1_000,
        windowControlRows: 1_000,
        windowPeriods: 24,
      },
      references: dimensionQuality.map(({ dimension }) => ({
        dimension,
        observedCodes: 3,
        resolvedCodes: 3,
        unresolvedCodes: 0,
        observedControlRuns: 1_000,
        resolvedControlRuns: 1_000,
        coveragePct: 100,
      })),
      assignment: {
        employeePeriodRuns: 1_000,
        invalidEmployeePeriodRuns: 0,
        dimensionRunChecks: dimensionQuality.map(({ dimension }) => ({
          dimension,
          employeePeriodRuns: 1_000,
          validRuns: 1_000,
          ambiguousRuns: 0,
          missingCodeRuns: 0,
          unresolvedReferenceRuns: 0,
          invalidEmployeeKeyRuns: 0,
          coveragePct: 100,
        })),
        multiCategoryEmployeePeriods: dimensionQuality.map(({ dimension }) => ({
          dimension,
          employeePeriods: participantPeriodTotal,
          multiCategoryEmployeePeriods: 5,
          multiCategoryPct: Number((5 / participantPeriodTotal * 100).toFixed(4)),
        })),
      },
      participantSetReconciliation: {
        periodsChecked: 24,
        exactPeriods: 24,
        mismatchedPeriods: 0,
        allCalculoEmployeePeriods: participantPeriodTotal,
        controlEmployeePeriods: participantPeriodTotal,
        controlCohortUsedForFinance: true,
      },
      amountSigns: {
        periodsChecked: 24,
        periodsWithNonpositiveNetPayroll: 0,
        negativePeriodComponents: zeroComponents(),
        dimensions: dimensionQuality.map(({ dimension }) => ({
          dimension,
          cellsChecked: 72,
          negativeComponentCells: zeroComponents(),
          allocationPeriodsAvailable: 24,
          allocationPeriodsUnavailable: 0,
        })),
      },
      partitionChecks: dimensionQuality.map(({ dimension }) => ({
        dimension,
        periodsChecked: 24,
        componentIdentityFailures: 0,
        netAllocationIdentityFailures: 0,
        allocationShareFailures: 0,
      })),
      warnings: [
        'source_currency_not_declared',
        'participants_may_overlap_across_run_categories',
        'cross_view_single_cell_difference_gate_passed',
        'cross_view_remaining_single_cell_risks:0',
        'cross_view_subset_difference_gate_passed',
        'cross_view_max_observables_per_view:3',
        'cross_view_max_protected_target_states_per_period:3',
        'cross_view_subset_equations_checked:1',
        'cross_view_max_subset_equations_per_period:1',
        'cross_view_remaining_subset_difference_risks:0',
      ],
    },
  };
  projection.releaseId = computeGrhWorkforceFinanceProjectionReleaseId(projection);
  const inspection = inspectGrhWorkforceFinanceContract(projection);
  assert.deepEqual(inspection.errors, [], `synthetic workforce contract: ${inspection.errors.join(', ')}`);
  return projection;
}

const WORKFORCE_PROJECTION = PROJECTIONS?.workforceFinance || null;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const PRIVATE_DATA_PATHS = new Set([
  '/api/grh-executive',
  '/api/grh-quality',
  '/api/grh-close',
  '/api/grh-workforce-finance',
  '/api/grh-data',
  '/api/reports',
  '/api/ai-analyze',
  '/api/raw',
]);

function relativeLuminance(hexColor) {
  let normalized = String(hexColor).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) normalized = normalized.split('').map(channel => channel + channel).join('');
  assert.match(normalized, /^[0-9a-f]{6}$/i, `expected an opaque hex color, received ${hexColor}`);
  const channels = [0, 2, 4].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  return channels.map(channel => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
  ).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first, second) {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

async function readRenderedThemeAudit(page) {
  return page.evaluate(() => {
    const parseColor = value => {
      if (!value || value === 'none' || value === 'transparent') return [0, 0, 0, 0];
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    };
    const composite = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map(index =>
        (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha
      ).concat(alpha);
    };
    const luminance = color => color.slice(0, 3).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (first, second) => {
      const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const effectiveBackground = node => {
      const layers = [];
      let current = node;
      while (current instanceof Element) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
        if (color && color[3] >= 1) break;
        current = current.parentElement;
      }
      let result = [255, 255, 255, 1];
      for (let index = layers.length - 1; index >= 0; index -= 1) result = composite(layers[index], result);
      return result;
    };
    const selectorFor = node => {
      const classes = typeof node.className === 'string' ? node.className : node.className?.baseVal || '';
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes ? `.${classes.trim().replace(/\s+/g, '.')}` : ''}`;
    };
    const visible = node => {
      const style = getComputedStyle(node);
      return node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0;
    };
    const textNodes = Array.from(document.querySelectorAll('body.hacienda-page *')).filter(node => {
      if (!visible(node) || node.matches('script, style, title, desc, option, .hac-visually-hidden')) return false;
      return node instanceof SVGTextElement || Array.from(node.childNodes).some(child =>
        child.nodeType === Node.TEXT_NODE && child.textContent.trim()
      );
    });
    const textViolations = textNodes.map(node => {
      const style = getComputedStyle(node);
      const background = effectiveBackground(node);
      const rawTextColor = parseColor(node instanceof SVGTextElement ? style.fill : style.color);
      const textColor = rawTextColor ? composite(rawTextColor, background) : null;
      return {
        selector: selectorFor(node),
        text: node.textContent.trim().slice(0, 70),
        ratio: textColor ? Number(ratio(textColor, background).toFixed(2)) : 0,
        size: Number.parseFloat(style.fontSize),
      };
    });
    const boundarySelector = [
      '.hac-topbar', '.hac-menu-btn', '.hac-icon-btn', '.hac-retry-btn', '.hac-source-state',
      '.hac-hero', '.hac-chip', '.hac-select', '.hac-error', '.hac-stat',
      '.hac-panel', '.hac-panel-badge', '.hac-close-figure', '.hac-close-metric', '.hac-close-note',
      '.hac-alert', '.hac-equation-card', '.hac-scenario-banner', '.hac-sim-result', '.hac-table-wrap',
      '.hac-methodology', '#radarWindow', '#radarFilter',
      '.hac-cohort-state', '.hac-cohort-kpi', '.hac-cohort-figure', '.hac-cohort-decision',
      '.hac-cohort-rank[data-selected="true"]', '.hac-cohort-track', '.hac-cohort-bar',
      '.hac-cohort-insight', '.hac-cohort-global',
      '#reconciliationHeatmap [data-radar-period]',
      '#reconciliationHeatmap [data-radar-privacy="protected"]',
      '#varianceRanking [data-radar-open-period]',
      '[data-muni-shell="primary-nav"]', '[data-muni-shell="bottom-nav"]'
    ].join(',');
    const boundaryViolations = Array.from(document.querySelectorAll(boundarySelector)).filter(visible).map(node => {
      const style = getComputedStyle(node);
      const outside = effectiveBackground(node.parentElement || node);
      const inside = effectiveBackground(node);
      const borderRatios = ['Top', 'Right', 'Bottom', 'Left'].map(side => {
        const width = Number.parseFloat(style[`border${side}Width`]) || 0;
        const rawBorder = parseColor(style[`border${side}Color`]);
        const border = rawBorder ? composite(rawBorder, outside) : outside;
        return width > 0 ? ratio(border, outside) : 1;
      });
      const boundaryRatio = Math.max(
        ratio(inside, outside),
        ...borderRatios,
      );
      return { selector: selectorFor(node), ratio: Number(boundaryRatio.toFixed(2)) };
    }).filter(result => result.ratio < 3 - 0.01);
    const bottomNav = document.querySelector('[data-muni-shell="bottom-nav"]');
    return {
      theme: document.documentElement.dataset.theme,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      mainBackground: getComputedStyle(document.querySelector('#mainContent')).backgroundColor,
      mainColor: getComputedStyle(document.querySelector('#mainContent')).color,
      bottomNavBackground: bottomNav ? getComputedStyle(bottomNav).backgroundColor : null,
      textViolations: textViolations.filter(result => result.ratio < 4.5 - 0.01),
      fontFloorViolations: textViolations.filter(result => result.size < 12),
      boundaryViolations,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      legacyStored: localStorage.getItem('govtech_theme'),
      versionedStored: localStorage.getItem('municontrol-color-theme:v1'),
    };
  });
}

function assertRenderedThemeAudit(audit, expectedTheme, viewportName) {
  assert.equal(audit.theme, expectedTheme, `${viewportName} theme`);
  assert.equal(audit.legacyStored, expectedTheme, `${viewportName} legacy storage`);
  assert.equal(audit.versionedStored, expectedTheme, `${viewportName} canonical storage`);
  assert.deepEqual(audit.textViolations, [], `${viewportName} text contrast: ${JSON.stringify(audit.textViolations)}`);
  assert.deepEqual(audit.fontFloorViolations, [], `${viewportName} font floor: ${JSON.stringify(audit.fontFloorViolations)}`);
  assert.deepEqual(audit.boundaryViolations, [], `${viewportName} boundaries: ${JSON.stringify(audit.boundaryViolations)}`);
  assert.equal(audit.overflow, 0, `${viewportName} must not overflow horizontally`);
  assert.notEqual(audit.bodyBackground, audit.mainColor, `${viewportName} body cannot equal text`);
  assert.notEqual(audit.mainBackground, audit.mainColor, `${viewportName} main cannot equal text`);
  if (viewportName.startsWith('mobile-')) {
    assert.equal(
      audit.bottomNavBackground,
      expectedTheme === 'light' ? 'rgb(248, 250, 252)' : 'rgb(9, 23, 40)',
      `${viewportName} bottom navigation background`,
    );
  }
}

async function readRadarSnapshot(page) {
  return page.evaluate(() => ({
    window: document.querySelector('#radarWindow')?.value,
    filter: document.querySelector('#radarFilter')?.value,
    kpis: Object.fromEntries([
      'radarPublishedCount',
      'radarBelow50Count',
      'radarProtectedCount',
      'radarLatestAgreement',
    ].map(id => {
      const node = document.getElementById(id);
      return [id, {
        text: node?.textContent.trim() || '',
        value: node?.dataset.radarValue || '',
      }];
    })),
    heatmap: Array.from(document.querySelectorAll('#reconciliationHeatmap [data-radar-period]')).map(node => ({
      tag: node.tagName,
      period: node.dataset.radarPeriod,
      status: node.dataset.radarStatus,
      pressed: node.getAttribute('aria-pressed'),
      text: node.textContent.trim(),
    })),
    protectedCells: Array.from(document.querySelectorAll(
      '#reconciliationHeatmap [data-radar-privacy="protected"]',
    )).map(node => ({
      tag: node.tagName,
      period: node.dataset.radarPeriod || '',
      openPeriod: node.dataset.radarOpenPeriod || '',
      datasetKeys: Object.keys(node.dataset).sort(),
      tabIndex: node.tabIndex,
      text: node.textContent.trim(),
    })),
    trendPaths: Array.from(document.querySelectorAll('#reconciliationTrend path[data-radar-series]')).map(node => ({
      series: node.dataset.radarSeries,
      d: node.getAttribute('d') || '',
    })),
    trendPoints: Array.from(document.querySelectorAll(
      '#reconciliationTrend circle[data-radar-series][data-radar-point]',
    )).map(node => ({
      series: node.dataset.radarSeries,
      period: node.dataset.radarPoint,
      value: node.dataset.radarValue,
    })),
    trendLabels: Array.from(document.querySelectorAll('#reconciliationTrend svg text'))
      .map(node => node.textContent.trim()),
    ranking: Array.from(document.querySelectorAll('#varianceRanking [data-radar-open-period]')).map(node => ({
      tag: node.tagName,
      period: node.dataset.radarOpenPeriod,
      cents: node.dataset.radarVarianceCents,
      text: node.textContent.trim().replace(/\s+/g, ' '),
    })),
    summary: {
      text: document.querySelector('#radarSummary')?.textContent.trim() || '',
      visibleCount: document.querySelector('#radarSummary')?.dataset.radarVisibleCount || '',
      windowCount: document.querySelector('#radarSummary')?.dataset.radarWindowCount || '',
    },
    radarText: document.querySelector('#reconciliationRadar')?.innerText || '',
  }));
}

function expectedTrendPoints(rows) {
  const fields = {
    coverage: 'runCoveragePct',
    exactness: 'metricExactRatePct',
    agreement: 'valueAgreementPct',
  };
  return Object.entries(fields).flatMap(([series, field]) => rows
    .filter(row => row.privacyStatus === 'released')
    .map(row => ({
      series,
      period: row.period,
      value: String(row.reconciliation[field]),
    })))
    .sort((left, right) => (
      left.series.localeCompare(right.series) || left.period.localeCompare(right.period)
    ));
}

function normalizeTrendPoints(points) {
  return points.map(point => ({
    series: point.series,
    period: point.period,
    value: String(Number(point.value)),
  })).sort((left, right) => (
    left.series.localeCompare(right.series) || left.period.localeCompare(right.period)
  ));
}

function formatArsCents(cents) {
  const presentation = tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' });
  return new Intl.NumberFormat(presentation.locale, {
    style: 'currency',
    currency: presentation.displayCurrencyCode,
    currencyDisplay: 'code',
  }).format(cents / 100).replace(/\s+/g, ' ');
}

function assertRadarSnapshot(snapshot, windowRows, filter, label) {
  const filteredRows = radarRowsForFilter(windowRows, filter);
  const releasedRows = filteredRows.filter(row => row.privacyStatus === 'released');
  const protectedRows = filteredRows.filter(row => row.privacyStatus !== 'released');
  assert.equal(snapshot.filter, filter, `${label} filter`);
  assert.equal(snapshot.summary.visibleCount, String(filteredRows.length), `${label} visible summary`);
  assert.equal(snapshot.summary.windowCount, String(windowRows.length), `${label} window summary`);
  assert.deepEqual(
    snapshot.heatmap.map(item => ({ period: item.period, status: item.status })),
    releasedRows.map(row => ({ period: row.period, status: radarStatus(row) })),
    `${label} heatmap rows and statuses`,
  );
  assert.equal(
    snapshot.heatmap.every(item => item.tag === 'BUTTON'),
    true,
    `${label} released heatmap cells must be buttons`,
  );
  assert.equal(snapshot.protectedCells.length, protectedRows.length, `${label} protected heatmap count`);
  assert.equal(
    snapshot.protectedCells.every(cell => (
      cell.tag === 'SPAN' && !cell.period && !cell.openPeriod && cell.tabIndex < 0 &&
      JSON.stringify(cell.datasetKeys) === JSON.stringify(['radarPrivacy']) &&
      !/\bARS\b|\$|\d/.test(cell.text)
    )),
    true,
    `${label} protected cells cannot expose amounts or click targets`,
  );
  assert.deepEqual(
    normalizeTrendPoints(snapshot.trendPoints),
    expectedTrendPoints(filteredRows),
    `${label} trend points`,
  );
  assert.equal(
    snapshot.trendPoints.every(point => Number(point.value) >= 0 && Number(point.value) <= 100),
    true,
    `${label} trend values must use the contractual 0-100 scale`,
  );
  const expectedRanking = radarRanking(filteredRows);
  assert.deepEqual(
    snapshot.ranking.map(item => ({ period: item.period, cents: Number(item.cents) })),
    expectedRanking.map(row => ({
      period: row.period,
      cents: row.reconciliation.absoluteVarianceCents,
    })),
    `${label} variance ranking`,
  );
  snapshot.ranking.forEach((item, index) => {
    const expectedAmount = formatArsCents(expectedRanking[index].reconciliation.absoluteVarianceCents);
    assert.equal(item.tag, 'BUTTON', `${label} ranking entry must be actionable`);
    assert.ok(
      item.text.includes(expectedAmount),
      `${label} ranking must convert source cents to visible ARS: ` +
        `${JSON.stringify(item.text)} does not include ${JSON.stringify(expectedAmount)}`,
    );
  });
  assert.match(
    snapshot.radarText,
    /\bno p[eé]rdida\s*\/\s*pago\s*\/\s*fraude\b/i,
    `${label} must state the diagnostic limitation`,
  );
  const radarClaims = snapshot.radarText.replace(
    /\bno p[eé]rdida\s*\/\s*pago\s*\/\s*fraude\b/gi,
    '',
  );
  assert.doesNotMatch(radarClaims, /\b(?:p[eé]rdida|fraude)\b/i, `${label} neutral radar language`);
  assert.doesNotMatch(
    snapshot.radarText,
    /\b(?:pago|causa)\s+(?:confirmad[oa]|realizad[oa]|detectad[oa]|identificad[oa]|demostrad[oa])\b/i,
    `${label} cannot assert payment or causality`,
  );
}

async function assertClosePeriodSelection(page, series, row, label) {
  const rendered = await page.evaluate(() => ({
    selected: document.querySelector('#closePeriodSelect')?.value,
    participants: document.querySelector('#closeParticipants')?.textContent.trim(),
    agreement: document.querySelector('#closeValueAgreement')?.textContent.trim(),
    badge: document.querySelector('#closeComparisonBadge')?.textContent.trim(),
    copy: document.querySelector('#closeComparisonCopy')?.textContent.trim(),
    pressedPeriods: Array.from(document.querySelectorAll(
      '#reconciliationHeatmap [data-radar-period][aria-pressed="true"]',
    )).map(node => node.dataset.radarPeriod),
  }));
  assert.equal(rendered.selected, row.period, `${label} close selector`);
  assert.equal(rendered.participants, row.participantCount.toLocaleString('es-AR'), `${label} participants`);
  assert.equal(
    rendered.agreement,
    `${row.reconciliation.valueAgreementPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    `${label} value agreement`,
  );
  const expectedComparison = expectedCloseComparison(series, row.period);
  if (expectedComparison.released) {
    assert.equal(rendered.badge, expectedComparison.badge, `${label} historical comparison`);
  } else {
    assert.match(rendered.badge, /protegida|no disponible/i, `${label} protected comparison`);
    assert.match(rendered.copy, /proteg|no existe|faltante|no hay un mes anterior disponible/i, `${label} protected comparison reason`);
  }
  assert.deepEqual(rendered.pressedPeriods, [row.period], `${label} radar selection`);
}

function authoritativeUser(role = 'INTENDENTE', malformedProjection = false) {
  const tenantId = 'tenant-junin-test';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access, `missing test access projection for ${role}`);
  const user = {
    id: 'qa-hacienda',
    name: 'QA Hacienda',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
    presentation: tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' }),
  };
  return malformedProjection ? { ...user, capabilities: 'navigation.hacienda' } : user;
}

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-hacienda',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

const RADAR_DEFAULT_WINDOW = 36;
function radarRowsForWindow(series, value = String(RADAR_DEFAULT_WINDOW)) {
  const size = value === 'all' ? series.length : Number.parseInt(value, 10);
  assert.ok(Number.isSafeInteger(size) && size > 0, `invalid radar window ${value}`);
  return series.slice(-Math.min(size, series.length));
}

function radarStatus(row) {
  if (row.privacyStatus !== 'released') return 'protected';
  if (row.reconciliation.matchedRuns === 0) return 'noCounterpart';
  if (row.reconciliation.valueAgreementPct < 50) return 'below50';
  if (row.reconciliation.valueAgreementPct < 90) return 'below90';
  return 'atLeast90';
}

function radarRowsForFilter(rows, filter) {
  if (filter === 'all') return rows;
  if (filter === 'protected') return rows.filter(row => row.privacyStatus !== 'released');
  if (filter === 'noCounterpart') {
    return rows.filter(row => (
      row.privacyStatus === 'released' && row.reconciliation.matchedRuns === 0
    ));
  }
  if (filter === 'below50') {
    return rows.filter(row => (
      row.privacyStatus === 'released' && row.reconciliation.valueAgreementPct < 50
    ));
  }
  if (filter === 'below90') {
    return rows.filter(row => (
      row.privacyStatus === 'released' && row.reconciliation.valueAgreementPct < 90
    ));
  }
  assert.fail(`unsupported radar filter ${filter}`);
}

function radarRanking(rows) {
  return rows
    .filter(row => row.privacyStatus === 'released')
    .slice()
    .sort((left, right) => (
      right.reconciliation.absoluteVarianceCents - left.reconciliation.absoluteVarianceCents ||
      right.period.localeCompare(left.period)
    ))
    .slice(0, 6);
}

function previousCalendarMonth(period) {
  const [year, month] = period.split('-').map(Number);
  return month === 1
    ? `${String(year - 1).padStart(4, '0')}-12`
    : `${String(year).padStart(4, '0')}-${String(month - 1).padStart(2, '0')}`;
}

function monthLabel(period) {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(Date.UTC(year, month - 1, 15, 12))).replace('.', '');
}

function formatArsCentsCompact(cents) {
  const presentation = tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' });
  return new Intl.NumberFormat(presentation.locale, {
    style: 'currency',
    currency: presentation.displayCurrencyCode,
    currencyDisplay: 'code',
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(cents / 100).replace(/\s+/g, ' ');
}

function workforceView(dimension) {
  return WORKFORCE_PROJECTION.dimensionViews.find(view => view.dimension === dimension);
}

function workforceReleasedCells(row) {
  return row.cells.filter(cell => cell.privacyStatus === 'released').slice().sort((left, right) => (
    right.components.netPayrollCents - left.components.netPayrollCents ||
    left.label.localeCompare(right.label, 'es')
  ));
}

function cohortRequestPath(dimension, cell, extra = '') {
  assert.ok(WORKFORCE_DIMENSIONS.includes(dimension));
  assert.equal(cell.privacyStatus, 'released');
  const params = new URLSearchParams([
    ['cohort', dimension],
    ['company', String(cell.companyCode)],
    ['code', String(cell.sourceCode)],
  ]);
  if (extra) params.set(extra, 'all');
  return `/hacienda.html?${params.toString()}#cohortContext`;
}

async function readCohortSnapshot(page) {
  return page.evaluate(() => ({
    contextHidden: document.querySelector('#cohortContext')?.hidden,
    stateHidden: document.querySelector('#cohortState')?.hidden,
    contentHidden: document.querySelector('#cohortContent')?.hidden,
    title: document.querySelector('#cohortTitle')?.textContent.trim() || '',
    subtitle: document.querySelector('#cohortSubtitle')?.textContent.trim() || '',
    badge: document.querySelector('#cohortBadge')?.textContent.trim() || '',
    state: document.querySelector('#cohortState')?.textContent.replace(/\s+/g, ' ').trim() || '',
    retryHidden: document.querySelector('#cohortRetry')?.hidden,
    dataset: {
      contract: document.querySelector('#cohortContext')?.dataset.contract || '',
      sourceSha256: document.querySelector('#cohortContext')?.dataset.sourceSha256 || '',
      releaseId: document.querySelector('#cohortContext')?.dataset.releaseId || '',
      dimension: document.querySelector('#cohortContent')?.dataset.dimension || '',
      period: document.querySelector('#cohortContent')?.dataset.period || '',
      companyCode: document.querySelector('#cohortContent')?.dataset.companyCode || '',
      sourceCode: document.querySelector('#cohortContent')?.dataset.sourceCode || '',
    },
    selects: {
      dimension: document.querySelector('#cohortDimensionSelect')?.value || '',
      dimensions: Array.from(document.querySelectorAll('#cohortDimensionSelect option')).map(node => node.value),
      period: document.querySelector('#cohortPeriodSelect')?.value || '',
      periods: Array.from(document.querySelectorAll('#cohortPeriodSelect option')).map(node => node.value),
      category: document.querySelector('#cohortCategorySelect')?.value || '',
      categories: Array.from(document.querySelectorAll('#cohortCategorySelect option')).map(node => ({
        value: node.value,
        text: node.textContent.trim(),
      })),
    },
    participants: document.querySelector('#cohortParticipants')?.textContent.trim() || '',
    share: document.querySelector('#cohortShare')?.textContent.trim() || '',
    rank: document.querySelector('#cohortRank')?.textContent.trim() || '',
    period: document.querySelector('#cohortPeriod')?.textContent.trim() || '',
    gross: document.querySelector('#cohortGross')?.textContent.trim() || '',
    withholdings: document.querySelector('#cohortWithholdings')?.textContent.trim() || '',
    net: document.querySelector('#cohortNet')?.textContent.trim() || '',
    employer: document.querySelector('#cohortEmployer')?.textContent.trim() || '',
    change: document.querySelector('#cohortChange')?.textContent.trim() || '',
    control: document.querySelector('#cohortControl')?.textContent.trim() || '',
    accounting: document.querySelector('#cohortParticipantAccounting')?.textContent.trim() || '',
    privacy: document.querySelector('#cohortPrivacy')?.textContent.trim() || '',
    composition: Array.from(document.querySelectorAll('#cohortComposition [data-component]')).map(node => ({
      component: node.dataset.component,
      cents: Number(node.dataset.valueCents),
      width: Number.parseFloat(node.querySelector('.hac-cohort-component-bar')?.style.width || '0'),
      aria: node.getAttribute('aria-label') || '',
    })),
    trend: {
      role: document.querySelector('#cohortTrend')?.getAttribute('role') || '',
      tabIndex: document.querySelector('#cohortTrend')?.tabIndex,
      aria: document.querySelector('#cohortTrend')?.getAttribute('aria-label') || '',
      slots: document.querySelector('#cohortTrend')?.dataset.periodSlots || '',
      available: document.querySelector('#cohortTrend')?.dataset.availablePeriods || '',
      periodSlots: Array.from(document.querySelectorAll('#cohortTrend [data-period-slot]'))
        .map(node => node.dataset.periodSlot),
      paths: Array.from(document.querySelectorAll('#cohortTrend path[data-series]')).map(node => ({
        series: node.dataset.series,
        d: node.getAttribute('d') || '',
      })),
      points: Array.from(document.querySelectorAll('#cohortTrend circle[data-series][data-period]')).map(node => ({
        series: node.dataset.series,
        period: node.dataset.period,
        cents: Number(node.dataset.valueCents),
      })),
      caption: document.querySelector('#cohortTrendCaption')?.textContent.trim() || '',
    },
    ranks: Array.from(document.querySelectorAll('#cohortRanking .hac-cohort-rank')).map(node => ({
      tag: node.tagName,
      label: node.querySelector('.hac-cohort-rank-label')?.textContent.trim() || '',
      value: node.querySelector('.hac-cohort-rank-value')?.textContent.trim() || '',
      privacy: node.dataset.privacy,
      selected: node.dataset.selected,
      netPayrollCents: Number(node.dataset.netPayrollCents),
      allocationSharePct: Number(node.dataset.allocationSharePct),
      companyCode: node.dataset.companyCode || '',
      sourceCode: node.dataset.sourceCode || '',
      width: Number.parseFloat(node.querySelector('.hac-cohort-bar')?.style.width || '0'),
      aria: node.getAttribute('aria-label') || '',
    })),
    rankingCaption: document.querySelector('#cohortRankingCaption')?.textContent.trim() || '',
    evidence: {
      assignment: document.querySelector('#cohortAssignmentEvidence')?.textContent.trim() || '',
      release: document.querySelector('#cohortReleaseEvidence')?.textContent.trim() || '',
      presentation: document.querySelector('#cohortPresentationEvidence')?.textContent.trim() || '',
    },
    global: {
      participants: document.querySelector('#cohortGlobalParticipants')?.textContent.trim() || '',
      gross: document.querySelector('#cohortGlobalGross')?.textContent.trim() || '',
      net: document.querySelector('#cohortGlobalNet')?.textContent.trim() || '',
      agreement: document.querySelector('#cohortGlobalAgreement')?.textContent.trim() || '',
    },
    cta: {
      href: document.querySelector('#cohortBackToRrhh')?.getAttribute('href') || '',
      text: document.querySelector('#cohortBackToRrhh')?.textContent.trim() || '',
    },
    caveat: document.querySelector('#cohortContext .hac-cohort-caveat')?.textContent.replace(/\s+/g, ' ').trim() || '',
    text: document.querySelector('#cohortContext')?.innerText.replace(/\s+/g, ' ').trim() || '',
  }));
}

function formatWorkforcePercent(value) {
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

function expectedTrendSegmentCount(view, identity) {
  let segments = 0;
  let activeLength = 0;
  for (const row of view.periods) {
    const cell = row.cells.find(candidate => (
      candidate.privacyStatus === 'released' &&
      `${candidate.companyCode}:${candidate.sourceCode}` === identity
    ));
    if (!cell) {
      if (activeLength > 1) segments += 1;
      activeLength = 0;
    } else if (activeLength > 0 && cell.change.status === 'released') {
      activeLength += 1;
    } else {
      if (activeLength > 1) segments += 1;
      activeLength = 1;
    }
  }
  if (activeLength > 1) segments += 1;
  return segments;
}

function assertCohortSnapshot(snapshot, { dimension, period, selected }, label) {
  const view = workforceView(dimension);
  const row = view.periods.find(item => item.period === period);
  const released = workforceReleasedCells(row);
  const identity = `${selected.companyCode}:${selected.sourceCode}`;
  const ordered = row.cells.slice().sort((left, right) => (
    right.components.netPayrollCents - left.components.netPayrollCents ||
    left.label.localeCompare(right.label, 'es')
  ));
  const dimensionLabel = ({ sector: 'sector', costCenter: 'centro de costo', agreement: 'convenio' })[dimension];
  const maximum = Math.max(...ordered.map(cell => cell.components.netPayrollCents));

  assert.equal(snapshot.contextHidden, false, `${label} context`);
  assert.equal(snapshot.stateHidden, true, `${label} state`);
  assert.equal(snapshot.contentHidden, false, `${label} content`);
  assert.equal(snapshot.title, `Análisis financiero · ${selected.label}`, `${label} title`);
  assert.match(
    snapshot.subtitle,
    new RegExp(`del ${dimensionLabel}.*informaci.n agregada.*no salario individual.*situaci.n laboral actual`, 'i'),
  );
  assert.equal(snapshot.badge, `${dimensionLabel} · Privacidad aplicada`, `${label} badge`);
  assert.deepEqual(snapshot.dataset, {
    contract: WORKFORCE_PROJECTION.schemaVersion,
    sourceSha256: WORKFORCE_PROJECTION.source.sourceSha256,
    releaseId: WORKFORCE_PROJECTION.releaseId,
    dimension,
    period,
    companyCode: String(selected.companyCode),
    sourceCode: String(selected.sourceCode),
  }, `${label} governed identity`);
  assert.deepEqual(snapshot.selects.dimensions, WORKFORCE_DIMENSIONS, `${label} dimensions`);
  assert.deepEqual(snapshot.selects.periods, [...WORKFORCE_PERIODS].reverse(), `${label} 24 periods`);
  assert.equal(snapshot.selects.dimension, dimension);
  assert.equal(snapshot.selects.period, period);
  assert.equal(snapshot.selects.category, identity);
  assert.equal(snapshot.selects.categories.length, released.length);
  assert.equal(snapshot.participants, selected.participantDisplay, `${label} participants`);
  assert.equal(snapshot.share, formatWorkforcePercent(selected.allocationSharePct), `${label} allocation`);
  assert.equal(snapshot.rank, `${released.indexOf(selected) + 1} de ${released.length} liberadas`, `${label} rank`);
  assert.equal(snapshot.period, monthLabel(period), `${label} period`);
  assert.equal(snapshot.gross, formatArsCentsCompact(selected.components.grossWithFamilyAllowancesCents));
  assert.equal(snapshot.withholdings, formatArsCentsCompact(selected.components.employeeWithholdingsCents));
  assert.equal(snapshot.net, formatArsCentsCompact(selected.components.netPayrollCents));
  assert.equal(snapshot.employer, formatArsCentsCompact(selected.components.employerContributionsCents));
  assert.match(snapshot.privacy, selected.participantPrivacyStatus === 'released'
    ? /Datos agregados publicados.*al menos 10 personas/i
    : /Importes agregados liberados; conteo protegido/i);
  assert.deepEqual(snapshot.composition.map(item => item.component), GRH_WORKFORCE_FINANCE_COMPONENT_KEYS);
  assert.deepEqual(
    snapshot.composition.map(item => item.cents),
    GRH_WORKFORCE_FINANCE_COMPONENT_KEYS.map(key => selected.components[key]),
    `${label} exact eight components`,
  );
  snapshot.composition.forEach(item => {
    assert.ok(item.width >= 0 && item.width <= 100, `${label} component width`);
    assert.doesNotMatch(item.aria, /legajo|DNI|CUIL/i);
  });
  assert.deepEqual(
    snapshot.ranks.map(item => ({
      label: item.label,
      privacy: item.privacy,
      selected: item.selected,
      netPayrollCents: item.netPayrollCents,
      allocationSharePct: item.allocationSharePct,
    })),
    ordered.map(cell => ({
      label: cell.label,
      privacy: cell.privacyStatus,
      selected: cell === selected ? 'true' : 'false',
      netPayrollCents: cell.components.netPayrollCents,
      allocationSharePct: cell.allocationSharePct,
    })),
    `${label} net allocation ranking`,
  );
  snapshot.ranks.forEach((item, index) => {
    const cell = ordered[index];
    assert.ok(Math.abs(item.width - cell.components.netPayrollCents / maximum * 100) < 0.01);
    assert.equal(item.tag, cell.privacyStatus === 'released' ? 'BUTTON' : 'DIV');
    assert.equal(item.companyCode, cell.privacyStatus === 'released' ? String(cell.companyCode) : '');
    assert.doesNotMatch(item.aria, /participación exclusiva|legajo|DNI|CUIL/i);
  });
  assert.equal(snapshot.ranks.filter(row => row.selected === 'true').length, 1, `${label} selection`);
  assert.match(snapshot.rankingCaption, /Asignación del neto.*no participación exclusiva.*conteos.*no se suman/i);
  assert.equal(snapshot.trend.role, 'region');
  assert.equal(snapshot.trend.tabIndex, 0);
  assert.match(snapshot.trend.aria, /desplazable/i);
  assert.equal(snapshot.trend.slots, '24');
  assert.deepEqual(snapshot.trend.periodSlots, WORKFORCE_PERIODS);
  const available = view.periods.filter(item => item.cells.some(cell => (
    cell.privacyStatus === 'released' && `${cell.companyCode}:${cell.sourceCode}` === identity
  ))).length;
  assert.equal(snapshot.trend.available, String(available));
  assert.equal(snapshot.trend.points.length, available * 3);
  const expectedSegments = expectedTrendSegmentCount(view, identity);
  for (const series of ['gross', 'net', 'employer']) {
    assert.equal(snapshot.trend.paths.filter(path => path.series === series).length, expectedSegments);
  }
  assert.match(snapshot.trend.caption, /24 meses.*niveles monetarios visibles.*aritméticamente comparables/i);
  assert.match(snapshot.evidence.assignment, /Clasificación usada.*puede no coincidir con el destino actual/i);
  assert.match(snapshot.evidence.release, /grupos con menos de 10 personas.*otra vista.*deducirlos/i);
  assert.match(snapshot.evidence.presentation, /ARS por configuración municipal.*no declara moneda de origen/i);
  const total = WORKFORCE_PROJECTION.periodTotals.find(item => item.period === period);
  assert.deepEqual(snapshot.global, {
    participants: total.participantCount.toLocaleString('es-AR'),
    gross: formatArsCentsCompact(total.components.grossWithFamilyAllowancesCents),
    net: formatArsCentsCompact(total.components.netPayrollCents),
    agreement: formatWorkforcePercent(total.reconciliation.valueAgreementPct),
  }, `${label} same-month global close`);
  assert.deepEqual(snapshot.cta, dimension === 'sector'
    ? { href: `rrhh.html?sector=${selected.sourceCode}#peopleDirectory`, text: 'Abrir directorio general del sector (universo distinto)' }
    : { href: 'rrhh.html#workforceDistribution', text: 'Abrir distribución general en RRHH' }, `${label} CTA`);
  assert.match(snapshot.caveat, /No representan el salario de una persona, un pago bancario ni la ejecución del presupuesto.*no prueban las causas/i);
  assert.match(snapshot.caveat, /cantidades no deben sumarse como si fueran grupos exclusivos/i);
  assert.doesNotMatch(snapshot.text, /\b(?:legajo|DNI|CUIL)\b/i, `${label} no PII`);
}

function assertCohortFailClosed(snapshot, { title, message, retry = false }, label) {
  assert.equal(snapshot.contextHidden, false, `${label} context`);
  assert.equal(snapshot.stateHidden, false, `${label} state`);
  assert.equal(snapshot.contentHidden, true, `${label} content`);
  assert.equal(snapshot.title, title, `${label} title`);
  assert.match(snapshot.state, message, `${label} message`);
  assert.equal(snapshot.retryHidden, !retry, `${label} retry`);
  assert.deepEqual({
    participants: snapshot.participants,
    share: snapshot.share,
    rank: snapshot.rank,
    period: snapshot.period,
    global: snapshot.global,
  }, {
    participants: '—',
    share: '—',
    rank: '—',
    period: '—',
    global: { participants: '—', gross: '—', net: '—', agreement: '—' },
  }, `${label} no stale figures`);
  assert.deepEqual(snapshot.ranks, [], `${label} no ranking`);
  assert.deepEqual(snapshot.composition, [], `${label} no components`);
  assert.doesNotMatch(snapshot.state, /ARS|\$|%|DNI|CUIL/i, `${label} no financial or personal figures`);
}

function expectedCloseComparison(series, period) {
  const current = series.find(row => row.period === period);
  const previousPeriod = previousCalendarMonth(period);
  const previous = series.find(row => row.period === previousPeriod);
  if (!current || !previous || current.privacyStatus !== 'released' || previous.privacyStatus !== 'released') {
    return { released: false, previousPeriod };
  }
  return {
    released: true,
    previousPeriod,
    badge: `${monthLabel(previousPeriod)} → ${monthLabel(period)}`,
  };
}

function releasedSegments(rows) {
  let count = 0;
  let previousReleasedPeriod = null;
  for (const row of rows) {
    if (row.privacyStatus === 'released') {
      if (!previousReleasedPeriod || previousReleasedPeriod !== previousCalendarMonth(row.period)) {
        count += 1;
      }
      previousReleasedPeriod = row.period;
    } else {
      previousReleasedPeriod = null;
    }
  }
  return count;
}

async function createServer(requestLog, options = {}) {
  const failureCounts = new Map();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/js/nav.js' && options.navMode) {
      const malformed = options.navMode === 'malformed'
        ? "window.requireCapability = async function () { return { allowed: true }; };"
        : '';
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'], 'Cache-Control': 'no-store' });
      response.end(`window.__muniAuthValidated = true; window.MuniAuthReady = Promise.resolve(true); ${malformed}`);
      return;
    }
    if (PRIVATE_DATA_PATHS.has(url.pathname)) {
      const contract = url.pathname.slice('/api/grh-'.length);
      requestLog.push({
        contract,
        pathname: url.pathname,
        search: url.search,
        authorization: request.headers.authorization || '',
      });
      if (![
        '/api/grh-executive',
        '/api/grh-quality',
        '/api/grh-close',
        '/api/grh-workforce-finance',
      ].includes(url.pathname)) {
        response.writeHead(410, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato no utilizado por Hacienda' }));
        return;
      }
      const failureCount = failureCounts.get(contract) || 0;
      const shouldFail = options.failContract === contract ||
        (options.failOnceContract === contract && failureCount === 0);
      failureCounts.set(contract, failureCount + 1);
      if (shouldFail) {
        response.writeHead(503, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify({ error: 'Contrato gobernado no disponible' }));
        return;
      }
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
        ...(contract === 'workforce-finance'
          ? { 'X-MuniControl-Contract': 'grh-workforce-finance-v1' }
          : {}),
      });
      const payload = contract === 'workforce-finance'
        ? (options.workforceFinanceProjection || WORKFORCE_PROJECTION)
        : (options.projections?.[contract] || PROJECTIONS[contract]);
      response.end(JSON.stringify(payload));
      return;
    }

    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify({ user: authoritativeUser(
        options.authRole || 'INTENDENTE',
        options.malformedProjection === true,
      ) }));
      return;
    }

    const relative = url.pathname === '/' ? 'login.html' : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(REPO, relative);
    if (!target.startsWith(`${REPO}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function authenticatedContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: viewport.reducedMotion,
  });
  await context.addInitScript(({ token, legacyTheme, versionedTheme }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'qa-hacienda',
      name: 'QA Hacienda',
      role: 'INTENDENTE',
      tenantId: 'tenant-junin-test',
    }));
    if (!sessionStorage.getItem('qa-theme-seeded')) {
      if (legacyTheme) localStorage.setItem('govtech_theme', legacyTheme);
      if (versionedTheme) localStorage.setItem('municontrol-color-theme:v1', versionedTheme);
      sessionStorage.setItem('qa-theme-seeded', 'true');
    }
  }, {
    token: fakeBrowserToken(),
    legacyTheme: viewport.legacyTheme || viewport.theme || 'dark',
    versionedTheme: viewport.versionedTheme || null,
  });
  return context;
}

test('Hacienda source uses only the secure GRH experience client and compiles inline scripts', async () => {
  const html = await readFile(path.join(REPO, 'hacienda.html'), 'utf8');
  assert.doesNotMatch(html, /\/api\/grh-data|artifact=semantic|MuniAuth\.fetch|calculation_control_series|cross_source_reconciliation/);
  assert.match(html, /<script src="js\/auth-fetch\.js"><\/script>\s*<script src="js\/tenant-presentation\.js"><\/script>\s*<script src="js\/grh-secure-data\.js"><\/script>/);
  assert.match(html, /<script src="js\/grh-close-data\.js"><\/script>/);
  assert.match(html, /<script src="js\/grh-workforce-finance-data\.js"><\/script>/);
  assert.match(html, /MuniGrhData\.loadExperience\(\{\s*timeoutMs:\s*10000\s*\}\)/);
  assert.match(html, /MuniGrhClose\.load\(\{\s*timeoutMs:\s*10000\s*\}\)/);
  assert.match(html, /MuniGrhWorkforceFinance\.load\(\{\s*timeoutMs:\s*12000\s*\}\)/);
  assert.match(html, /MuniTenantPresentation\.load\(\)/);
  assert.match(html, /await window\.requireCapability\('navigation\.hacienda'\)/);
  assert.match(html, /async function init\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadExperience\(\)/);
  assert.match(html, /retryLoad\.addEventListener\('click', loadAuthorizedExperience\)/);
  assert.match(html, /row\.privacyStatus !== 'released'/);
  assert.match(html, /<script src="js\/theme-switcher\.js"><\/script>[\s\S]*<link rel="stylesheet" href="css\/dashboard\.css">/);
  assert.match(html, /id="themeToggleBtn"[^>]+data-muni-theme-control/);
  assert.match(html, /La comparación entre las dos fuentes de liquidación es general/);
  assert.match(html, /Comparación mensual entre las dos fuentes de liquidación/);
  assert.match(html, /Grupos de cálculo comparables/);
  assert.match(html, /grupos de cálculo aparecieron en ambas fuentes/);
  assert.match(html, /Abrir directorio general del sector \(universo distinto\)/);
  assert.match(html, /Fuente técnica “totpago”/);
  assert.doesNotMatch(html, />Cálculo frente a totpago|>Cruce con totpago|calculo ↔ totpago|Liquidaciones comparables|liquidaciones (?:pudieron|tuvieron)/i);

  const inlineScripts = [...html.matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
  )].map(match => match[1]);
  assert.ok(inlineScripts.length >= 1);
  inlineScripts.forEach(script => assert.doesNotThrow(() => new Function(script)));
});

test('Hacienda operational typography has a static 12px minimum', async () => {
  const html = await readFile(path.join(REPO, 'hacienda.html'), 'utf8');
  const declarations = [...html.matchAll(/\bfont(?:-size)?\s*:\s*([^;{}]+)/gi)]
    .map(match => match[0]);
  const sizes = declarations.flatMap(declaration =>
    [...declaration.matchAll(/(\d+(?:\.\d+)?)px\b/gi)].map(match => ({
      declaration,
      value: Number(match[1]),
    }))
  );
  assert.ok(sizes.length >= 40, 'the gate must continue covering Hacienda typography declarations');
  assert.deepEqual(
    sizes.filter(size => size.value < 12),
    [],
    'Hacienda operational labels, tables and SVG text cannot fall below 12px',
  );
});

test('Hacienda capability preflight redirects denied or malformed clients before every private contract', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'DEMO' },
    { name: 'territorial role denied by authoritative /me', authRole: 'INSPECTOR' },
    { name: 'malformed authoritative projection', malformedProjection: true },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await authenticatedContext(browser, {
        width: 390,
        height: 844,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`${baseUrl}/inicio.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(75);
      assert.deepEqual(requestLog, [], `${scenario.name} must issue zero private requests`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('Hacienda resolves exact workforce-finance deep links for all three one-way dimensions', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  async function openScenario(pathname, expectedContracts) {
    const context = await authenticatedContext(browser, {
      width: 1440, height: 1000, reducedMotion: 'reduce', theme: 'dark',
    });
    const page = await context.newPage();
    const requestUrls = [];
    page.on('request', request => requestUrls.push(request.url()));
    const requestStart = requestLog.length;
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
    const privateRequests = requestLog.slice(requestStart);
    assert.deepEqual(
      privateRequests.map(item => item.contract).sort(),
      expectedContracts.slice().sort(),
      `${pathname} governed contracts`,
    );
    assert.equal(privateRequests.every(item => item.search === ''), true, `${pathname} private APIs receive no query`);
    assert.equal(privateRequests.every(item => item.authorization.startsWith('Bearer ')), true);
    assert.doesNotMatch(requestUrls.join('\n'), /[?&](?:name|nombre|apellido|legajo|dni|cuil|search)=/i);
    return { context, page };
  }

  for (const dimension of WORKFORCE_DIMENSIONS) {
    const view = workforceView(dimension);
    const period = WORKFORCE_PERIODS.at(-1);
    const row = view.periods.find(item => item.period === period);
    const selected = workforceReleasedCells(row)[0];
    const validPath = cohortRequestPath(dimension, selected);
    const valid = await openScenario(validPath, ['close', 'executive', 'quality', 'workforce-finance']);
    await valid.page.waitForSelector('#cohortContent:not([hidden])');
    assert.equal(valid.page.url(), `${baseUrl}${validPath}`);
    assert.deepEqual(Array.from(new URL(valid.page.url()).searchParams), [
      ['cohort', dimension],
      ['company', String(selected.companyCode)],
      ['code', String(selected.sourceCode)],
    ]);
    assertCohortSnapshot(await readCohortSnapshot(valid.page), {
      dimension, period, selected,
    }, `${dimension} deep link`);
    await valid.context.close();
  }

  const agreementRow = workforceView('agreement').periods.at(-1);
  const agreementSelected = workforceReleasedCells(agreementRow)[0];
  const invalidPath = cohortRequestPath('agreement', agreementSelected, 'extra');
  const invalid = await openScenario(invalidPath, ['close', 'executive', 'quality']);
  assert.equal(invalid.page.url(), `${baseUrl}${invalidPath}`);
  assertCohortFailClosed(await readCohortSnapshot(invalid.page), {
    title: 'Enlace financiero no válido',
    message: /sólo se admiten empresa y código.*nunca nombres ni legajos/i,
  }, 'extra query fail closed');
  await invalid.context.close();

  assert.equal(requestLog.length, 15, 'three exact deep links plus invalid link use only governed contracts');
});

test('Hacienda explores 24 months and three dimensions locally while protecting counts and deltas', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const context = await authenticatedContext(browser, {
    width: 1440, height: 1000, reducedMotion: 'reduce', theme: 'light',
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cohortContent:not([hidden])');
  assert.deepEqual(requestLog.map(item => item.contract).sort(), [
    'close', 'executive', 'quality', 'workforce-finance',
  ]);
  const requestCount = requestLog.length;

  for (const dimension of WORKFORCE_DIMENSIONS) {
    await page.selectOption('#cohortDimensionSelect', dimension);
    await page.waitForFunction(value => document.querySelector('#cohortContent')?.dataset.dimension === value, dimension);
    const row = workforceView(dimension).periods.at(-1);
    const selected = workforceReleasedCells(row)[0];
    assertCohortSnapshot(await readCohortSnapshot(page), {
      dimension, period: row.period, selected,
    }, `${dimension} local selector`);
    assert.equal(requestLog.length, requestCount, `${dimension} selector must not refetch`);
  }

  await page.selectOption('#cohortDimensionSelect', 'sector');
  const protectedRow = workforceView('sector').periods.find(row => {
    const released = workforceReleasedCells(row);
    return released.length >= 2 &&
      row.participantAccounting.multiCategoryPrivacyStatus === 'protected' &&
      released.some(cell => (
        cell.participantPrivacyStatus === 'protected_difference_attack' &&
        cell.change.reason === 'membership_change_protected'
      ));
  });
  assert.ok(protectedRow, 'real approved source must include a released sector with protected membership');
  const protectedPeriod = protectedRow.period;
  await page.selectOption('#cohortPeriodSelect', protectedPeriod);
  await page.waitForFunction(period => document.querySelector('#cohortContent')?.dataset.period === period, protectedPeriod);
  const protectedSelected = workforceReleasedCells(protectedRow)
    .find(cell => (
      cell.participantPrivacyStatus === 'protected_difference_attack' &&
      cell.change.reason === 'membership_change_protected'
    ));
  assert.equal(protectedSelected.participantPrivacyStatus, 'protected_difference_attack');
  await page.selectOption(
    '#cohortCategorySelect',
    `${protectedSelected.companyCode}:${protectedSelected.sourceCode}`,
  );
  await page.waitForFunction(identity => (
    `${document.querySelector('#cohortContent')?.dataset.companyCode}:${document.querySelector('#cohortContent')?.dataset.sourceCode}` === identity
  ), `${protectedSelected.companyCode}:${protectedSelected.sourceCode}`);
  const protectedSnapshot = await readCohortSnapshot(page);
  assertCohortSnapshot(protectedSnapshot, {
    dimension: 'sector', period: protectedPeriod, selected: protectedSelected,
  }, 'protected participant count');
  assert.equal(protectedSnapshot.participants, 'Protegido');
  assert.equal(protectedSnapshot.change,
    'Membresía protegida; sin indicador de delta. Los niveles monetarios visibles siguen siendo comparables.');
  assert.match(protectedSnapshot.control, /tolerancia ligada al conteo protegida/i);
  assert.match(protectedSnapshot.accounting, /solapamiento.*magnitud.*protegida/i);
  assert.doesNotMatch(protectedSnapshot.change, /ARS|\$|%|\d/);

  const alternate = workforceReleasedCells(protectedRow).find(cell => cell !== protectedSelected);
  assert.ok(alternate, 'protected membership period must retain another released category');
  await page.selectOption('#cohortCategorySelect', `${alternate.companyCode}:${alternate.sourceCode}`);
  await page.waitForFunction(identity => (
    `${document.querySelector('#cohortContent')?.dataset.companyCode}:${document.querySelector('#cohortContent')?.dataset.sourceCode}` === identity
  ), `${alternate.companyCode}:${alternate.sourceCode}`);
  assert.equal((await readCohortSnapshot(page)).net, formatArsCentsCompact(alternate.components.netPayrollCents));
  const protectedRankingButton = page.locator(
    `#cohortRanking button[data-company-code="${protectedSelected.companyCode}"][data-source-code="${protectedSelected.sourceCode}"]`,
  );
  await protectedRankingButton.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(identity => document.querySelector('#cohortCategorySelect')?.value === identity,
    `${protectedSelected.companyCode}:${protectedSelected.sourceCode}`);
  assert.equal(requestLog.length, requestCount, 'period, category and ranking controls remain client-local');
  assert.equal(requestLog.every(item => item.search === ''), true);
  await context.close();
});

test('Hacienda permits the three high-trust profiles and denies low-trust profiles before private reads', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());
  for (const role of ['TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']) {
    const requestLog = [];
    const server = await createServer(requestLog, { authRole: role });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await authenticatedContext(browser, {
        width: 390, height: 844, reducedMotion: 'reduce', theme: 'dark',
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#cohortContent:not([hidden])');
      assert.deepEqual(requestLog.map(item => item.contract).sort(), [
        'close', 'executive', 'quality', 'workforce-finance',
      ], `${role} governed reads`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('Hacienda keeps source or presentation mismatches scoped to workforce finance', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const sourceMismatch = structuredClone(WORKFORCE_PROJECTION);
  sourceMismatch.source.sourceSha256 = 'a'.repeat(64);
  sourceMismatch.releaseId = computeGrhWorkforceFinanceProjectionReleaseId(sourceMismatch);
  const presentationMismatch = structuredClone(WORKFORCE_PROJECTION);
  presentationMismatch.metric.presentationCurrencyEffectiveOn = '2026-01-01';
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const [name, projection] of [
    ['source', sourceMismatch],
    ['presentation', presentationMismatch],
  ]) {
    const inspection = inspectGrhWorkforceFinanceContract(projection);
    if (name === 'source') {
      assert.equal(inspection.ok, false, 'source mismatch is rejected by the exact contract');
      assert.equal(inspection.errors.some(error => error.includes('source.sha256')), true);
    } else {
      assert.deepEqual(inspection.errors, [], 'presentation fixture remains contract-valid');
    }
    const requestLog = [];
    const server = await createServer(requestLog, { workforceFinanceProjection: projection });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await authenticatedContext(browser, {
        width: 390, height: 844, reducedMotion: 'reduce', theme: 'light',
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#cohortState:not([hidden])');
      await page.waitForFunction(() => document.querySelector('#cohortTitle')?.textContent.includes('temporalmente'));
      assert.equal(await page.locator('#haciendaDataViews').isVisible(), true, `${name} mismatch keeps Hacienda visible`);
      assert.equal(await page.locator('#loadError').isHidden(), true, `${name} mismatch does not poison base dashboard`);
      assertCohortFailClosed(await readCohortSnapshot(page), {
        title: 'Análisis financiero temporalmente no disponible',
        message: /resto de Hacienda continúa operativo.*fuente, contrato o permisos/i,
        retry: true,
      }, `${name} mismatch`);
      assert.deepEqual(requestLog.map(item => item.contract).sort(), [
        'close', 'executive', 'quality', 'workforce-finance',
      ]);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('Hacienda scopes a workforce-finance 503 and retries only that contract', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { failOnceContract: 'workforce-finance' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const context = await authenticatedContext(browser, {
    width: 390, height: 844, reducedMotion: 'reduce', theme: 'dark',
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#cohortTitle')?.textContent.includes('temporalmente'));
  assert.equal(await page.locator('#haciendaDataViews').isVisible(), true);
  assert.equal(await page.locator('#loadError').isHidden(), true);
  assertCohortFailClosed(await readCohortSnapshot(page), {
    title: 'Análisis financiero temporalmente no disponible',
    message: /resto de Hacienda continúa operativo.*fuente, contrato o permisos/i,
    retry: true,
  }, 'workforce 503');
  assert.deepEqual(requestLog.map(item => item.contract).sort(), [
    'close', 'executive', 'quality', 'workforce-finance',
  ]);
  const beforeRetry = requestLog.length;
  const retryResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/grh-workforce-finance' && response.status() === 200
  ));
  await page.click('#cohortRetry');
  await retryResponse;
  await page.waitForSelector('#cohortContent:not([hidden])');
  assert.deepEqual(requestLog.slice(beforeRetry).map(item => item.contract), ['workforce-finance']);
  assert.equal(requestLog.length, 5);
  assert.equal(requestLog.every(item => item.search === ''), true);
  await context.close();
});

test('Hacienda renders released compensation and global quality on desktop, mobile and print', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const releasedRows = PROJECTIONS.executive.compensation.series.filter(
    row => row.privacyStatus === 'released',
  );
  const suppressedRows = PROJECTIONS.executive.compensation.series.filter(
    row => row.privacyStatus !== 'released',
  );
  const releasedCloseRows = PROJECTIONS.close.series.filter(
    row => row.privacyStatus === 'released',
  );
  const latestClose = releasedCloseRows.at(-1);
  const defaultRadarRows = radarRowsForWindow(PROJECTIONS.close.series);
  const defaultRadarReleased = defaultRadarRows.filter(row => row.privacyStatus === 'released');
  const defaultRadarProtected = defaultRadarRows.filter(row => row.privacyStatus !== 'released');
  const defaultRadarBelow50 = defaultRadarReleased.filter(
    row => row.reconciliation.valueAgreementPct < 50,
  );
  const latestDefaultRadar = defaultRadarReleased.at(-1);
  const sectorView = workforceView('sector');
  const sectorPeriod = WORKFORCE_PERIODS.at(-1);
  const sectorRow = sectorView.periods.find(row => row.period === sectorPeriod);
  const sectorSelected = workforceReleasedCells(sectorRow)[0];
  assert.ok(sectorSelected, 'fixture must publish a sector finance category');
  const sectorPath = cohortRequestPath('sector', sectorSelected);

  assert.equal(PROJECTIONS.close.schemaVersion, 'grh-close-v1');
  assert.ok(PROJECTIONS.close.series.length >= RADAR_DEFAULT_WINDOW);

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const viewports = [
    { name: 'desktop-dark', width: 1440, height: 1000, reducedMotion: 'no-preference', theme: 'dark', versionedTheme: 'dark', legacyTheme: 'light' },
    { name: 'desktop-light', width: 1440, height: 1000, reducedMotion: 'no-preference', theme: 'light', versionedTheme: 'light', legacyTheme: 'dark' },
    { name: 'mobile-dark', width: 390, height: 844, reducedMotion: 'reduce', theme: 'dark', versionedTheme: 'dark', legacyTheme: 'light' },
    { name: 'mobile-light', width: 390, height: 844, reducedMotion: 'reduce', theme: 'light', versionedTheme: 'light', legacyTheme: 'dark' },
  ];
  for (const viewport of viewports) {
    const context = await authenticatedContext(browser, viewport);
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const externalRequests = [];
    const sameOriginSearches = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) {
        externalRequests.push(request.url());
        return;
      }
      const requestUrl = new URL(request.url());
      if (requestUrl.search) sameOriginSearches.push({
        pathname: requestUrl.pathname,
        search: requestUrl.search,
      });
    });

    await page.goto(`${baseUrl}${sectorPath}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
    await page.waitForSelector('#reconciliationRadar:not([hidden])');
    await page.waitForSelector('#cohortContent:not([hidden])');
    const result = await page.evaluate(() => ({
      dataHidden: document.querySelector('#haciendaDataViews')?.hidden,
      errorHidden: document.querySelector('#loadError')?.hidden,
      source: document.querySelector('#topbarSourceText')?.textContent.trim(),
      sourceFile: document.querySelector('#sourceFile')?.textContent.trim(),
      sourceHash: document.querySelector('#sourceHash')?.textContent.trim(),
      published: document.querySelector('#periodCountChip')?.textContent.trim(),
      protectedCount: document.querySelector('#protectedPeriodChip')?.textContent.trim(),
      protectedNote: document.querySelector('#protectedPeriodsNote')?.textContent.trim(),
      quality: document.querySelector('#equationGross')?.textContent.trim(),
      reconciliation: document.querySelector('#kpiReconciliation')?.textContent.trim(),
      reconciliationNote: document.querySelector('#kpiReconciliationNote')?.textContent.trim(),
      kpiGross: document.querySelector('#kpiGross')?.textContent.trim(),
      tableRows: document.querySelectorAll('#periodRows tr').length,
      qualityBars: document.querySelectorAll('#compositionBars [role="progressbar"]').length,
      chartPaths: document.querySelectorAll('#payrollChart path').length,
      chartCircles: document.querySelectorAll('#payrollChart circle').length,
      closeOptions: document.querySelectorAll('#closePeriodSelect option').length,
      closeYearGroups: document.querySelectorAll('#closePeriodSelect optgroup').length,
      closeSelected: document.querySelector('#closePeriodSelect')?.value,
      closeBars: document.querySelectorAll('#closeBridge rect').length,
      closeViewBoxWidth: Number(document.querySelector('#closeBridge svg')?.getAttribute('viewBox')?.split(' ')[2]),
      closeLabelHeight: document.querySelector('#closeBridge svg text:last-of-type')?.getBoundingClientRect().height,
      closeParticipants: document.querySelector('#closeParticipants')?.textContent.trim(),
      closeCoverage: document.querySelector('#closeCoverage')?.textContent.trim(),
      closeExactRate: document.querySelector('#closeExactRate')?.textContent.trim(),
      closeValueAgreement: document.querySelector('#closeValueAgreement')?.textContent.trim(),
      closeDeltas: document.querySelectorAll('#closeDeltaList .hac-close-delta').length,
      closeCopy: document.querySelector('#closeReconciliationCopy')?.textContent.trim(),
      radarHeatmapColumns: getComputedStyle(
        document.querySelector('.hac-radar-heatmap-grid'),
      ).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      radarTrendTabIndex: document.querySelector('#reconciliationTrend')?.tabIndex,
      pageText: document.querySelector('#haciendaDataViews')?.innerText || '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      palette: (() => {
        const style = getComputedStyle(document.documentElement);
        return Object.fromEntries(['bg', 'surface', 'surface-raised', 'muted', 'border'].map(name => [
          name,
          style.getPropertyValue(`--hac-${name}`).trim(),
        ]));
      })(),
      fontFloorFailures: Array.from(document.querySelectorAll('.hac-topbar *, #haciendaDashboard *'))
        .filter(node => {
          const style = getComputedStyle(node);
          const hasOwnText = Array.from(node.childNodes).some(child =>
            child.nodeType === Node.TEXT_NODE && child.textContent.trim()
          );
          return (hasOwnText || node instanceof SVGTextElement) && node.getClientRects().length > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.fontSize) < 12;
        })
        .slice(0, 12)
        .map(node => ({
          selector: `${node.tagName.toLowerCase()}.${node.className?.baseVal || node.className || ''}`,
          size: getComputedStyle(node).fontSize,
          text: node.textContent.trim().slice(0, 60),
        })),
    }));
    const radar = await readRadarSnapshot(page);
    const cohort = await readCohortSnapshot(page);
    const renderedTheme = await readRenderedThemeAudit(page);

    assert.equal(page.url(), `${baseUrl}${sectorPath}`, `${viewport.name} exact cohort URL`);
    assertCohortSnapshot(cohort, {
      dimension: 'sector',
      period: sectorPeriod,
      selected: sectorSelected,
    }, `${viewport.name} sector cohort`);
    assert.equal(result.dataHidden, false);
    assert.equal(result.errorHidden, true);
    assert.match(result.source, /GRH.*liquidaciones comparadas.*calidad/i);
    assert.equal(result.sourceFile, PROJECTIONS.executive.source.sourceFile);
    assert.equal(result.sourceHash, PROJECTIONS.executive.source.sourceSha256);
    assert.equal(result.published, releasedRows.length.toLocaleString('es-AR'));
    assert.equal(result.protectedCount, suppressedRows.length.toLocaleString('es-AR'));
    assert.match(result.protectedNote, new RegExp(`${suppressedRows.length} períodos.*menos de 10 personas.*omiten`, 'i'));
    assert.equal(
      result.quality,
      `${PROJECTIONS.quality.quality.score.toLocaleString('es-AR', { maximumFractionDigits: 2 })}/100`,
    );
    assert.equal(
      result.reconciliation,
      `${PROJECTIONS.quality.quality.components.payrollReconciliation.score.toLocaleString('es-AR', {
        maximumFractionDigits: 1,
      })}%`,
    );
    assert.match(result.reconciliationNote, /Comparación general entre las dos fuentes de liquidación.*acuerdo de valores.*no certifica pago/i);
    assert.doesNotMatch(result.pageText, /totpago|cálculo\s*(?:↔|frente a)\s*totpago/i);
    assert.match(result.pageText, /comparación mensual entre las dos fuentes de liquidación/i);
    assert.match(result.kpiGross, /^ARS\s/);
    assert.equal(result.tableRows, Math.min(10, releasedRows.length));
    assert.equal(result.qualityBars, 4);
    assert.equal(result.chartPaths, 3);
    assert.equal(result.chartCircles, Math.min(12, releasedRows.length) * 3);
    assert.equal(result.closeOptions, releasedCloseRows.length);
    assert.equal(result.closeYearGroups, new Set(releasedCloseRows.map(row => row.period.slice(0, 4))).size);
    assert.equal(result.closeSelected, latestClose.period);
    assert.equal(result.closeBars, 5);
    assert.ok(result.closeViewBoxWidth <= Math.min(760, viewport.width - 56) + 1);
    assert.ok(result.closeLabelHeight >= 7, `${viewport.name} close chart labels must remain legible`);
    assert.equal(result.closeParticipants, latestClose.participantCount.toLocaleString('es-AR'));
    assert.equal(result.closeCoverage, `${latestClose.reconciliation.runCoveragePct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeExactRate, `${latestClose.reconciliation.metricExactRatePct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeValueAgreement, `${latestClose.reconciliation.valueAgreementPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeDeltas, PROJECTIONS.close.comparison.status === 'released' ? 9 : 0);
    assert.match(result.closeCopy, /No reutiliza el resultado general/i);
    assert.equal(result.radarHeatmapColumns, 12, `${viewport.name} radar keeps its 12-month grid`);
    assert.equal(result.radarTrendTabIndex, 0, `${viewport.name} radar trend is keyboard focusable`);
    assert.equal(radar.window, String(RADAR_DEFAULT_WINDOW), `${viewport.name} default radar window`);
    assert.equal(radar.kpis.radarPublishedCount.value, String(defaultRadarReleased.length));
    assert.equal(radar.kpis.radarBelow50Count.value, String(defaultRadarBelow50.length));
    assert.equal(radar.kpis.radarProtectedCount.value, String(defaultRadarProtected.length));
    assert.equal(
      Number(radar.kpis.radarLatestAgreement.value),
      latestDefaultRadar.reconciliation.valueAgreementPct,
    );
    assert.equal(
      Number(radar.kpis.radarPublishedCount.value) + Number(radar.kpis.radarProtectedCount.value),
      defaultRadarRows.length,
      `${viewport.name} radar released plus protected must reconcile to its window`,
    );
    assertRadarSnapshot(radar, defaultRadarRows, 'all', `${viewport.name} default radar`);
    assert.deepEqual(
      radar.trendPaths.map(path => path.series).sort(),
      ['agreement', 'coverage', 'exactness'],
      `${viewport.name} default radar trend series`,
    );
    assert.equal(result.pageText.includes('<10'), false);
    for (const row of suppressedRows) {
      if (row.period) assert.equal(result.pageText.includes(row.period), false);
    }
    assert.equal(result.theme, viewport.theme);
    assertRenderedThemeAudit(renderedTheme, viewport.theme, viewport.name);
    assert.deepEqual(result.fontFloorFailures, [], `${viewport.name} must render operational text at 12px or larger`);
    for (const background of ['bg', 'surface', 'surface-raised']) {
      assert.ok(
        contrastRatio(result.palette.muted, result.palette[background]) >= 4.5,
        `${viewport.name} muted text must meet AA against ${background}`,
      );
      assert.ok(
        contrastRatio(result.palette.border, result.palette[background]) >= 3,
        `${viewport.name} borders must meet non-text AA against ${background}`,
      );
    }
    assert.equal(result.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    if (viewport.name.startsWith('mobile-')) {
      const trend = page.locator('#reconciliationTrend');
      await trend.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('#reconciliationTrend')?.scrollLeft > 0);
      await page.evaluate(() => { document.querySelector('#reconciliationTrend').scrollLeft = 0; });
      const cohortTrend = page.locator('#cohortTrend');
      await cohortTrend.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('#cohortTrend')?.scrollLeft > 0);
      await page.evaluate(() => { document.querySelector('#cohortTrend').scrollLeft = 0; });
    }
    if (process.env.HACIENDA_CAPTURE === '1') {
      await page.screenshot({
        path: path.join(tmpdir(), `hacienda-legibility-${viewport.name}.png`),
        fullPage: true,
      });
      await page.locator('#reconciliationRadar').screenshot({
        path: path.join(tmpdir(), `hacienda-radar-${viewport.name}.png`),
      });
      await page.locator('#cohortContext').screenshot({
        path: path.join(tmpdir(), `hacienda-workforce-finance-${viewport.name}.png`),
      });
    }

    const oppositeTheme = viewport.theme === 'dark' ? 'light' : 'dark';
    await page.locator('#themeToggleBtn').click();
    await page.waitForFunction(expected => (
      document.documentElement.dataset.theme === expected &&
      localStorage.getItem('municontrol-color-theme:v1') === expected &&
      localStorage.getItem('govtech_theme') === expected
    ), oppositeTheme);
    const immediateTheme = await page.evaluate(() => ({
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      metaTheme: document.querySelector('meta[name="theme-color"]')?.content,
      preference: document.querySelector('#themeToggleBtn')?.dataset.themePreference,
      resolved: document.querySelector('#themeToggleBtn')?.dataset.themeResolved,
    }));
    assert.equal(immediateTheme.colorScheme, oppositeTheme, `${viewport.name} color-scheme`);
    assert.equal(immediateTheme.preference, oppositeTheme, `${viewport.name} button preference`);
    assert.equal(immediateTheme.resolved, oppositeTheme, `${viewport.name} button resolved theme`);
    assert.equal(immediateTheme.metaTheme, oppositeTheme === 'light' ? '#f0f4ff' : '#060b18');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
    await page.waitForSelector('#cohortContent:not([hidden])');
    assertCohortSnapshot(await readCohortSnapshot(page), {
      dimension: 'sector',
      period: sectorPeriod,
      selected: sectorSelected,
    }, `${viewport.name} sector cohort reload`);
    assertRenderedThemeAudit(
      await readRenderedThemeAudit(page),
      oppositeTheme,
      `${viewport.name}-reload`,
    );

    const historicalRadarRow = defaultRadarReleased.at(-2);
    await page.locator(
      `#reconciliationHeatmap [data-radar-period="${historicalRadarRow.period}"]`,
    ).click();
    await page.waitForFunction(period => (
      document.querySelector('#closePeriodSelect')?.value === period &&
      document.querySelector(
        `#reconciliationHeatmap [data-radar-period="${period}"]`,
      )?.getAttribute('aria-pressed') === 'true'
    ), historicalRadarRow.period);
    assert.deepEqual(pageErrors, [], `${viewport.name} heatmap interaction errors`);
    await assertClosePeriodSelection(
      page,
      PROJECTIONS.close.series,
      historicalRadarRow,
      `${viewport.name} heatmap open`,
    );
    await page.waitForFunction(() => {
      const closeTitle = document.querySelector('#closeTitle')?.getBoundingClientRect();
      const topbar = document.querySelector('.hac-topbar')?.getBoundingClientRect();
      return closeTitle && topbar && closeTitle.top >= topbar.bottom - 1;
    });

    const leadingVarianceRow = radarRanking(defaultRadarRows)[0];
    await page.locator(
      `#varianceRanking [data-radar-open-period="${leadingVarianceRow.period}"]`,
    ).click();
    await page.waitForFunction(period => (
      document.querySelector('#closePeriodSelect')?.value === period
    ), leadingVarianceRow.period);
    await assertClosePeriodSelection(
      page,
      PROJECTIONS.close.series,
      leadingVarianceRow,
      `${viewport.name} ranking open`,
    );

    if (viewport.name === 'desktop-dark') {
      await page.selectOption('#radarWindow', 'all');
      await page.waitForFunction(count => (
        document.querySelector('#radarSummary')?.dataset.radarWindowCount === String(count)
      ), PROJECTIONS.close.series.length);
      const allRowsRadar = await readRadarSnapshot(page);
      const allReleasedRows = PROJECTIONS.close.series.filter(row => row.privacyStatus === 'released');
      const allProtectedRows = PROJECTIONS.close.series.filter(row => row.privacyStatus !== 'released');
      const allBelow50Rows = allReleasedRows.filter(row => row.reconciliation.valueAgreementPct < 50);
      assert.equal(allRowsRadar.window, 'all');
      assert.equal(allRowsRadar.kpis.radarPublishedCount.value, String(allReleasedRows.length));
      assert.equal(allRowsRadar.kpis.radarBelow50Count.value, String(allBelow50Rows.length));
      assert.equal(allRowsRadar.kpis.radarProtectedCount.value, String(allProtectedRows.length));
      assert.equal(
        Number(allRowsRadar.kpis.radarPublishedCount.value) +
          Number(allRowsRadar.kpis.radarProtectedCount.value),
        PROJECTIONS.close.series.length,
      );
      assertRadarSnapshot(
        allRowsRadar,
        PROJECTIONS.close.series,
        'all',
        `${viewport.name} all-window radar`,
      );
      for (const row of allProtectedRows) {
        assert.equal(
          allRowsRadar.trendLabels.includes(monthLabel(row.period)),
          false,
          `${viewport.name} protected period cannot appear on the trend axis`,
        );
      }
      const expectedSegments = releasedSegments(PROJECTIONS.close.series);
      for (const pathResult of allRowsRadar.trendPaths) {
        assert.equal(
          (pathResult.d.match(/\bM/g) || []).length,
          expectedSegments,
          `${viewport.name} ${pathResult.series} trend must break at protected periods`,
        );
      }

      const unavailableComparisonRow = PROJECTIONS.close.series.find(row => (
        row.privacyStatus === 'released' &&
        !expectedCloseComparison(PROJECTIONS.close.series, row.period).released
      ));
      assert.ok(unavailableComparisonRow, 'fixture must exercise a protected or missing prior month');
      await page.locator(
        `#reconciliationHeatmap [data-radar-period="${unavailableComparisonRow.period}"]`,
      ).click();
      await page.waitForFunction(period => (
        document.querySelector('#closePeriodSelect')?.value === period
      ), unavailableComparisonRow.period);
      await assertClosePeriodSelection(
        page,
        PROJECTIONS.close.series,
        unavailableComparisonRow,
        `${viewport.name} protected historical comparison`,
      );

      for (const filter of ['below90', 'below50', 'noCounterpart', 'protected']) {
        await page.selectOption('#radarFilter', filter);
        const expectedFiltered = radarRowsForFilter(PROJECTIONS.close.series, filter);
        await page.waitForFunction(count => (
          document.querySelector('#radarSummary')?.dataset.radarVisibleCount === String(count)
        ), expectedFiltered.length);
        assertRadarSnapshot(
          await readRadarSnapshot(page),
          PROJECTIONS.close.series,
          filter,
          `${viewport.name} ${filter} radar`,
        );
      }

      await page.selectOption('#radarFilter', 'all');
      await page.selectOption('#radarWindow', String(RADAR_DEFAULT_WINDOW));
      await page.waitForFunction(count => (
        document.querySelector('#radarSummary')?.dataset.radarWindowCount === String(count)
      ), defaultRadarRows.length);
    }

    const previousClose = releasedCloseRows.at(-2);
    await page.selectOption('#closePeriodSelect', previousClose.period);
    await page.waitForFunction(expected =>
      document.querySelector('#closeValueAgreement')?.textContent.trim() === expected,
    `${previousClose.reconciliation.valueAgreementPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.match(
      await page.locator('#closeBridgeCaption').textContent(),
      new RegExp(previousClose.period.slice(0, 4)),
    );
    const previousComparison = expectedCloseComparison(PROJECTIONS.close.series, previousClose.period);
    assert.equal(
      await page.locator('#closeComparisonBadge').textContent(),
      previousComparison.badge,
      `${viewport.name} close selector comparison must follow the selected month`,
    );

    await page.selectOption('#periodRange', '24');
    await page.waitForFunction(expected =>
      document.querySelectorAll('#payrollChart circle').length === expected,
    Math.min(24, releasedRows.length) * 3);

    await page.emulateMedia({ media: 'print' });
    const printState = await page.evaluate(() => ({
      dataVisible: getComputedStyle(document.querySelector('#haciendaDataViews')).display !== 'none',
      sidebarHidden: getComputedStyle(document.querySelector('#sidebar')).display === 'none',
      simulatorHidden: getComputedStyle(document.querySelector('.hac-simulator')).display === 'none',
      sourceVisible: document.querySelector('#sourceHash')?.getClientRects().length > 0,
    }));
    assert.deepEqual(printState, {
      dataVisible: true,
      sidebarHidden: true,
      simulatorHidden: true,
      sourceVisible: true,
    });
    assert.deepEqual(consoleErrors, [], `${viewport.name} final console errors`);
    assert.deepEqual(pageErrors, [], `${viewport.name} final page errors`);
    assert.deepEqual(externalRequests, [], `${viewport.name} final external requests`);
    assert.deepEqual(sameOriginSearches, [
      { pathname: '/hacienda.html', search: new URL(`${baseUrl}${sectorPath}`).search },
      { pathname: '/hacienda.html', search: new URL(`${baseUrl}${sectorPath}`).search },
    ], `${viewport.name} only the exact cohort navigation may carry a query`);
    await context.close();
  }

  assert.equal(requestLog.length, viewports.length * 8);
  assert.deepEqual(
    requestLog.map(item => item.contract).sort(),
    viewports.flatMap(() => [
      'close', 'executive', 'quality', 'workforce-finance',
      'close', 'executive', 'quality', 'workforce-finance',
    ]).sort(),
  );
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.every(item => item.search === ''), true, 'private API requests cannot carry cohort or PII queries');
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
});

test('Hacienda fails closed and retries when the monthly close projection returns 503', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { failContract: 'close' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await authenticatedContext(browser, {
    width: 390,
    height: 844,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#haciendaDataViews')?.hidden,
    kpiVisible: document.querySelector('#kpiGross')?.getClientRects().length > 0,
    errorHidden: document.querySelector('#loadError')?.hidden,
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
    source: document.querySelector('#topbarSourceText')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  assert.equal(result.dataHidden, true);
  assert.equal(result.kpiVisible, false);
  assert.equal(result.errorHidden, false);
  assert.match(result.error, /No se muestran datos parciales, antiguos ni simulados/i);
  assert.doesNotMatch(result.error, /grh-data|profile|semantic/i);
  assert.match(result.source, /proyecciones GRH no disponibles/i);
  assert.ok(result.overflow <= 1);
  assert.ok(
    consoleErrors.every(message => /503|Service Unavailable/i.test(message)),
    `only the expected 503 browser diagnostic is allowed: ${consoleErrors.join(' | ')}`,
  );
  assert.deepEqual(pageErrors, []);

  const requestsBeforeRetry = requestLog.length;
  const retryResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/grh-close' && response.status() === 503
  );
  await page.click('#retryLoad');
  await retryResponse;
  await page.waitForSelector('#loadError:not([hidden])');
  assert.ok(requestLog.length > requestsBeforeRetry);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});
