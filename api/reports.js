import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { buildPortableGrhViews } from './lib/grh-portable-bundle.js';
import routePolicy from '../shared/route-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const REPORT_SCHEMA_VERSION = 'grh-executive-report-v2';
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const TREND_PERIODS = 12;

const QUALITY_COMPONENTS = Object.freeze([
  Object.freeze({ key: 'temporalValidity', label: 'Validez temporal' }),
  Object.freeze({ key: 'referentialIntegrity', label: 'Integridad referencial' }),
  Object.freeze({ key: 'payrollReconciliation', label: 'Conciliación de controles' }),
  Object.freeze({ key: 'legajoKeyUniqueness', label: 'Unicidad de legajos' }),
]);

const CALCULATION_COMPONENTS = Object.freeze([
  Object.freeze({ key: 'grossWithFamilyAllowancesCents', label: 'Bruto con asignaciones' }),
  Object.freeze({ key: 'employeeWithholdingsCents', label: 'Retenciones del agente' }),
  Object.freeze({ key: 'netPayrollCents', label: 'Neto de control' }),
  Object.freeze({ key: 'employerContributionsCents', label: 'Contribuciones patronales' }),
]);

class ReportPeriodUnavailableError extends Error {
  constructor(period, availablePeriods) {
    super('Período GRH no disponible');
    this.code = 'GRH_REPORT_PERIOD_UNAVAILABLE';
    this.period = period;
    this.availablePeriods = availablePeriods;
  }
}

function rounded(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function releasedCompensationSeries(executive) {
  return executive.compensation.series
    .filter(row => row.privacyStatus === 'released')
    .slice()
    .sort((left, right) => left.period.localeCompare(right.period));
}

function sectorDistribution(executive, period) {
  const workforce = executive.workforce;
  if (workforce.referencePeriod !== period) {
    return {
      available: false,
      reason: 'distribution_only_available_for_workforce_reference_period',
      referencePeriod: workforce.referencePeriod,
      participants: [],
    };
  }

  return {
    available: true,
    reason: null,
    referencePeriod: workforce.referencePeriod,
    privacyStatus: workforce.bySector.privacyStatus,
    threshold: workforce.bySector.threshold,
    participants: workforce.bySector.rows.map(row => ({
      label: row.label,
      participants: row.participants,
      sharePct: rounded(row.sharePct, 2),
      privacyStatus: row.privacyStatus,
    })),
  };
}

function calculationControl(selected, quality, latestReleasedPeriod) {
  return {
    period: selected.period,
    privacyStatus: selected.privacyStatus,
    distinctPayrollParticipants: selected.participantCount,
    participantDisplay: selected.participantDisplay,
    amountUnit: 'source_currency_cents',
    currency: 'not_declared_in_source',
    metricStatus: 'calculation_control_not_bank_disbursement',
    components: CALCULATION_COMPONENTS.map(component => ({
      key: component.key,
      label: component.label,
      valueCents: selected.amounts[component.key],
    })),
    identityWithinRoundingTolerance: selected.period === latestReleasedPeriod
      ? quality.quality.risks.latestCalculationControlWithinRoundingTolerance
      : null,
  };
}

function qualityEvidence(quality) {
  return {
    scorePct: rounded(quality.quality.score, 2),
    scope: quality.quality.scope,
    components: QUALITY_COMPONENTS.map(component => {
      const source = quality.quality.components[component.key];
      return {
        key: component.key,
        label: component.label,
        scorePct: rounded(source.score, 2),
        weightPct: source.weightPct,
      };
    }),
    riskFlags: {
      historicalSnapshotNotRealtime: quality.quality.risks.historicalSnapshotNotRealtime,
      currencyNotDeclared: quality.quality.risks.currencyNotDeclaredInSource,
      totpagoCrossSourceMismatch: quality.quality.risks.totpagoCrossSourceMismatch,
      quarantinedTemporalRows: quality.quality.risks.quarantinedTemporalRows,
      calculationControlAnomalousPeriods: quality.quality.risks.calculationControlAnomalousPeriods,
    },
  };
}

function participantChangeSummary(selected, previous) {
  if (!previous) {
    return `${selected.participantCount.toLocaleString('es-AR')} personas aparecen en cálculos válidos de ${selected.period}; no equivale a dotación contractual activa.`;
  }
  const delta = selected.participantCount - previous.participantCount;
  const rate = previous.participantCount === 0 ? null : rounded((delta / previous.participantCount) * 100, 2);
  const direction = delta === 0 ? 'sin cambio' : `${delta > 0 ? '+' : ''}${delta.toLocaleString('es-AR')}`;
  const rateText = rate === null ? '' : ` (${rate > 0 ? '+' : ''}${rate.toLocaleString('es-AR')}%)`;
  return `${selected.participantCount.toLocaleString('es-AR')} personas aparecen en cálculos válidos de ${selected.period}: ${direction}${rateText} frente a ${previous.period}. No equivale a dotación contractual activa.`;
}

function executiveSummary(selected, previous, distribution, quality, latestReleasedPeriod) {
  const tolerance = selected.period === latestReleasedPeriod
    ? (quality.quality.risks.latestCalculationControlWithinRoundingTolerance
      ? 'queda dentro de la tolerancia de redondeo declarada'
      : 'queda fuera de la tolerancia de redondeo declarada')
    : 'no publica un estado histórico de tolerancia en la proyección portable';
  const topSector = distribution.available
    ? distribution.participants.find(row => row.privacyStatus === 'released')
    : null;
  const sectorSummary = topSector
    ? `${topSector.label} es la clasificación sectorial con mayor participación publicada: ${topSector.participants.toLocaleString('es-AR')} personas (${topSector.sharePct.toLocaleString('es-AR')}%) en ${distribution.referencePeriod}.`
    : `El desglose sectorial sólo está publicado para ${distribution.referencePeriod}; no se extrapola al período ${selected.period}.`;
  const reconciliation = quality.quality.components.payrollReconciliation.score;
  return [
    participantChangeSummary(selected, previous),
    sectorSummary,
    `El control de liquidación ${tolerance}. La consistencia entre fuentes alcanza ${rounded(reconciliation, 2).toLocaleString('es-AR')}/100 y requiere revisión; no acredita un pago bancario.`,
  ];
}

export function buildGrhExecutiveReport(bundle, requestedPeriod = null, generatedAt = new Date().toISOString()) {
  const { executive, quality, provenance } = buildPortableGrhViews(bundle);
  const series = releasedCompensationSeries(executive);
  const availablePeriods = series.map(row => row.period);
  const latestReleasedPeriod = availablePeriods.at(-1) || null;
  const period = requestedPeriod || latestReleasedPeriod;
  const selectedIndex = availablePeriods.indexOf(period);
  if (selectedIndex === -1) throw new ReportPeriodUnavailableError(period, availablePeriods);

  const selected = series[selectedIndex];
  const previous = selectedIndex > 0 ? series[selectedIndex - 1] : null;
  const trendStart = Math.max(0, selectedIndex - TREND_PERIODS + 1);
  const participantTrend = series.slice(trendStart, selectedIndex + 1).map(row => ({
    period: row.period,
    participants: row.participantCount,
  }));

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    period,
    generatedAt,
    availablePeriods,
    availablePeriodRange: {
      first: availablePeriods[0] || null,
      last: latestReleasedPeriod,
      count: availablePeriods.length,
    },
    source: {
      canonicalSystem: executive.source.canonicalSystem,
      approvedSha256: provenance.approvedSourceSha256,
      profileSchemaVersion: provenance.profileSchemaVersion,
      semanticSchemaVersion: provenance.semanticSchemaVersion,
      executiveSchemaVersion: executive.schemaVersion,
      qualitySchemaVersion: quality.schemaVersion,
      privacyPolicyVersion: executive.policyVersion,
      portableThreshold: executive.privacy.portableThreshold,
      snapshotAsOf: executive.source.snapshotAsOf,
      realtime: false,
      aggregateOnly: quality.privacy.aggregateOnly,
      containsPii: quality.privacy.containsPii,
      excludedSources: [...quality.source.excludedSources],
    },
    dataStatus: {
      available: true,
      source: 'grh-executive-portable',
      freshness: 'historical_snapshot',
      period,
      snapshotAsOf: executive.source.snapshotAsOf,
      realtime: false,
      warning: 'Snapshot histórico GRH: no es una conexión en tiempo real.',
    },
    definitions: {
      workforce: executive.workforce.definition,
      calculationControl: 'Agregados de conceptos de cálculo; no acreditan pago bancario.',
      amountUnit: executive.compensation.amountUnit,
      currency: executive.compensation.currency,
      metricStatus: executive.compensation.metricStatus,
      totpagoStatus: quality.reconciliation.totpagoDiagnosticStatus,
    },
    executiveSummary: executiveSummary(
      selected,
      previous,
      sectorDistribution(executive, period),
      quality,
      latestReleasedPeriod,
    ),
    participantTrend,
    workforce: {
      referencePeriod: executive.workforce.referencePeriod,
      payrollParticipants: selected.participantCount,
      distributionBySector: sectorDistribution(executive, period),
    },
    calculationControl: calculationControl(selected, quality, latestReleasedPeriod),
    quality: qualityEvidence(quality),
    recommendedNextSteps: [
      'Abrir Estructura para entender qué sectores y áreas explican la composición del período.',
      'Revisar en Hacienda el control agregado y las diferencias entre fuentes antes de certificar una liquidación.',
      'Usar Directorio y fichas para consultas nominales autorizadas; este informe sólo muestra agregados.',
    ],
    furtherQuestions: [
      '¿Qué maestro institucional definirá el estado contractual activo de cada agente?',
      '¿Qué sectores y conceptos explican la mayor variación del período?',
      '¿Cuándo se habilitará una ingesta GRH incremental auditada para reemplazar el snapshot?',
    ],
    caveats: [
      `La fuente es un snapshot GRH al ${executive.source.snapshotAsOf}; realtime=false.`,
      `La salida portable aplica supresión de celdas pequeñas k=${executive.privacy.portableThreshold}.`,
      'La respuesta contiene sólo agregados y no exporta identificadores personales.',
      'personas_junin está excluida y no se cruza, integra ni usa como fallback.',
      'Los participantes de cálculo no son una dotación contractual activa.',
      'Los importes son controles de cálculo en centavos; Junín los presenta en ARS por configuración del tenant, aunque el dump original no incluía código de moneda.',
      'El control de cálculo no acredita pago bancario y totpago se conserva sólo como diagnóstico.',
    ],
  };
}

function unavailableStatus(reason, warning, period = null) {
  return {
    available: false,
    source: 'grh-executive-portable',
    freshness: 'unavailable',
    period,
    realtime: false,
    reason,
    warning,
  };
}

export function createReportsHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
} = {}) {
  return async function handler(req, res) {
    noStore(res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_REPORT,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    const requestedPeriod = req.query?.period === undefined
      ? null
      : String(req.query.period).trim();
    if (requestedPeriod !== null && !PERIOD_PATTERN.test(requestedPeriod)) {
      return res.status(400).json({
        error: 'Período inválido. Use YYYY-MM.',
        code: 'INVALID_REPORT_PERIOD',
        dataStatus: unavailableStatus('invalid_period', 'El período solicitado no cumple el formato YYYY-MM.', requestedPeriod),
      });
    }

    try {
      const bundle = await readArtifactBundleImpl(process.env.GRH_TENANT_ID);
      const report = buildGrhExecutiveReport(bundle, requestedPeriod);
      return res.status(200).json(report);
    } catch (error) {
      if (error instanceof ReportPeriodUnavailableError) {
        return res.status(404).json({
          error: 'El período solicitado no existe en la serie GRH portable gobernada.',
          code: error.code,
          availablePeriodRange: {
            first: error.availablePeriods[0] || null,
            last: error.availablePeriods.at(-1) || null,
            count: error.availablePeriods.length,
          },
          dataStatus: unavailableStatus(
            'period_not_available',
            'No se sustituyó el período solicitado por otro período ni se publicó una celda protegida.',
            error.period,
          ),
        });
      }

      console.error('[GRH-REPORTS] Proyección portable no disponible');
      return res.status(503).json({
        error: 'El contrato agregado GRH no está disponible.',
        code: 'GRH_REPORT_CONTRACT_UNAVAILABLE',
        dataStatus: unavailableStatus(
          'contract_unavailable',
          'No hay evidencia GRH agregada, validada y segura disponible para este informe.',
          requestedPeriod,
        ),
      });
    }
  };
}

export default createReportsHandler();
