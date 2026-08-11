import { inspectGrhSemanticContract } from './grh-contract.js';
import {
  GRH_EXECUTIVE_AMOUNT_KEYS,
  GRH_EXECUTIVE_SCHEMA_VERSION,
  inspectGrhExecutiveContract,
} from './grh-executive-contract.js';
import {
  GRH_PRIVACY_POLICY_VERSION,
  GRH_PRIVACY_THRESHOLDS,
  GRH_PROTECTED_BUCKET_LABEL,
  protectGrhMonetarySeries,
  protectGrhRanking,
  protectGrhSensitiveCountSeries,
  resolveGrhPrivacyThreshold,
} from './grh-privacy.js';

function projectionError(code, message, details = []) {
  const error = new Error(message);
  error.code = code;
  error.details = Object.freeze([...details]);
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function monetaryRows(semantic) {
  return semantic.payroll.calculation_control_series.map(row => ({
    period: row.period,
    participantCount: row.distinct_payroll_participants,
    amounts: {
      grossWithFamilyAllowancesCents: row.gross_with_family_allowances_cents,
      employeeWithholdingsCents: row.employee_withholdings_cents,
      netPayrollCents: row.net_payroll_cents,
      employerContributionsCents: row.employer_contributions_cents,
    },
  }));
}

function sensitiveAnnualRows(validByYear, distinctParticipantsByYear) {
  return Object.entries(validByYear)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, value]) => ({
      period,
      value,
      participantCount: distinctParticipantsByYear[period],
    }));
}

function sensitiveDomainProjection(domain, audience, domainName) {
  return {
    sourceTable: domain.source_table,
    metric: 'valid_rows_by_year',
    series: protectGrhSensitiveCountSeries(sensitiveAnnualRows(
      domain.valid_by_year,
      domain.distinct_participants_by_year,
    ), {
      audience,
      domain: domainName,
      allowSuppressedPeriod: audience === 'interactive',
    }),
  };
}

export function buildGrhExecutiveProjection(semantic, {
  audience = 'interactive',
  rankingLimit = 10,
} = {}) {
  resolveGrhPrivacyThreshold({ audience, domain: 'workforce' });
  if (!Number.isSafeInteger(rankingLimit) || rankingLimit < 1 || rankingLimit > 100) {
    throw projectionError(
      'GRH_EXECUTIVE_OPTIONS_INVALID',
      'El limite del ranking ejecutivo GRH no es valido.',
    );
  }

  const sourceInspection = inspectGrhSemanticContract(semantic);
  if (!sourceInspection.ok) {
    throw projectionError(
      'GRH_EXECUTIVE_SOURCE_INVALID',
      'El contrato semantico GRH no es apto para la proyeccion ejecutiva.',
      sourceInspection.errors,
    );
  }

  const totalParticipants = semantic.workforce.payroll_participants;
  const rankingOptions = {
    audience,
    domain: 'workforce',
    totalParticipants,
    topN: rankingLimit,
  };
  const projection = {
    schemaVersion: GRH_EXECUTIVE_SCHEMA_VERSION,
    policyVersion: GRH_PRIVACY_POLICY_VERSION,
    source: {
      canonicalSystem: semantic.source.canonical_system,
      sourceFile: semantic.source.file,
      sourceSha256: semantic.source.sha256,
      snapshotAsOf: semantic.source.snapshot_as_of,
      realtime: semantic.source.realtime,
    },
    privacy: {
      audience,
      interactiveThreshold: GRH_PRIVACY_THRESHOLDS.interactive,
      sensitiveThreshold: GRH_PRIVACY_THRESHOLDS.sensitive,
      portableThreshold: GRH_PRIVACY_THRESHOLDS.portable,
      protectedBucketLabel: GRH_PROTECTED_BUCKET_LABEL,
    },
    workforce: {
      definition: semantic.workforce.definition,
      referencePeriod: semantic.workforce.reference_period,
      payrollParticipants: totalParticipants,
      bySector: protectGrhRanking(semantic.workforce.by_sector, rankingOptions),
      byCostCenter: protectGrhRanking(semantic.workforce.by_cost_center, rankingOptions),
      byAgreement: protectGrhRanking(semantic.workforce.by_agreement, rankingOptions),
    },
    compensation: {
      currency: semantic.payroll.currency,
      amountUnit: semantic.payroll.amount_unit,
      metricStatus: semantic.payroll.executive_metric_status,
      series: protectGrhMonetarySeries(monetaryRows(semantic), {
        audience,
        amountKeys: GRH_EXECUTIVE_AMOUNT_KEYS,
        allowSuppressedPeriod: true,
      }),
    },
    absence: sensitiveDomainProjection(semantic.absence, audience, 'absence'),
    leave: sensitiveDomainProjection(semantic.leave, audience, 'leave'),
    movements: sensitiveDomainProjection(semantic.movements, audience, 'movements'),
  };

  const outputInspection = inspectGrhExecutiveContract(projection);
  if (!outputInspection.ok) {
    throw projectionError(
      'GRH_EXECUTIVE_PROJECTION_INVALID',
      'La proyeccion ejecutiva GRH no supera el contrato de privacidad.',
      outputInspection.errors,
    );
  }
  return deepFreeze(projection);
}
