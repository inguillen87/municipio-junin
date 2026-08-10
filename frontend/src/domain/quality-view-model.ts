import { QualityContractError, validateQualityContract } from './quality-contract';
import type {
  ActionViewModel,
  CoverageRowViewModel,
  LineageStepViewModel,
  QualityComponentKey,
  QualityComponentViewModel,
  QualityContract,
  QualityKpiViewModel,
  QualityViewModel,
  ReferentialFactKey,
  RiskViewModel,
  TemporalDomainKey,
  TemporalDomainViewModel,
} from './quality-types';

const DOMAIN_ORDER: readonly TemporalDomainKey[] = [
  'ausencia',
  'calculo',
  'legamov',
  'licencia',
  'totpago',
];
const FACT_ORDER: readonly ReferentialFactKey[] = ['calculo', 'legamov', 'ausencia', 'licencia'];
const COMPONENT_ORDER: readonly QualityComponentKey[] = [
  'temporalValidity',
  'referentialIntegrity',
  'payrollReconciliation',
  'legajoKeyUniqueness',
];

const domainLabels: Readonly<Record<TemporalDomainKey, string>> = Object.freeze({
  ausencia: 'Ausencias',
  calculo: 'Control de cálculo',
  legamov: 'Movimientos',
  licencia: 'Licencias históricas',
  totpago: 'totpago diagnóstico',
});

const componentLabels: Readonly<Record<QualityComponentKey, string>> = Object.freeze({
  temporalValidity: 'Validez temporal',
  referentialIntegrity: 'Integridad referencial',
  payrollReconciliation: 'Conciliación entre fuentes',
  legajoKeyUniqueness: 'Unicidad de clave de legajo',
});

const numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const decimalFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`)).replace(/\s+de\s+/g, ' ');
}

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

function formatBytes(value: number): string {
  return `${decimalFormatter.format(value / 1_000_000)} MB`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  const keyedValue = value as Record<string, unknown>;
  for (const key of Object.keys(keyedValue)) deepFreeze(keyedValue[key], seen);
  return Object.freeze(value);
}

function hasMaterialReconciliationDifferences(data: QualityContract): boolean {
  return data.reconciliation.status === 'material_differences_detected' &&
    data.quality.risks.totpagoCrossSourceMismatch;
}

function buildKpis(data: QualityContract): readonly QualityKpiViewModel[] {
  const reconciliationDiffers = hasMaterialReconciliationDifferences(data);
  return [
    {
      key: 'quality',
      label: 'Calidad gobernada',
      value: `${decimalFormatter.format(data.quality.score)}/100`,
      note: 'Extracto agregado gobernado; alcance explícito.',
      tone: 'green',
    },
    {
      key: 'quarantine',
      label: 'Cuarentena temporal',
      value: formatNumber(data.temporal.quarantineRows),
      note: 'Excluidas del universo válido por reglas temporales.',
      tone: 'amber',
    },
    {
      key: 'reconciliation',
      label: 'Conciliación cruzada',
      value: `${decimalFormatter.format(data.reconciliation.scorePct)}/100`,
      note: reconciliationDiffers
        ? 'Diferencias materiales entre cálculo y totpago.'
        : 'Corridas conciliadas dentro del contrato agregado.',
      tone: reconciliationDiffers ? 'red' : 'green',
    },
    {
      key: 'referential',
      label: 'Integridad referencial',
      value: formatPercent(data.quality.components.referentialIntegrity.score),
      note: 'Componente ponderado del extracto gobernado.',
      tone: 'cyan',
    },
    {
      key: 'tables',
      label: 'Inventario de fuente',
      value: formatNumber(data.inventory.all.totalTables),
      note: `${formatNumber(data.inventory.all.nonEmptyTables)} con filas · ${formatNumber(data.inventory.all.emptyTables)} vacías.`,
      tone: 'violet',
    },
    {
      key: 'rows',
      label: 'Filas inventariadas',
      value: formatCompact(data.inventory.all.totalRows),
      note: 'Diccionario semántico completo; no es la suma del subconjunto focal del perfil ni implica aptitud de cada tabla.',
      title: `${formatNumber(data.inventory.all.totalRows)} filas inventariadas`,
      tone: 'neutral',
    },
  ];
}

function buildComponents(data: QualityContract): readonly QualityComponentViewModel[] {
  return COMPONENT_ORDER.map((key) => {
    const component = data.quality.components[key];
    return {
      key,
      label: componentLabels[key],
      score: component.score,
      weightPct: component.weightPct,
      scoreLabel: decimalFormatter.format(component.score),
      weightLabel: `Peso ${decimalFormatter.format(component.weightPct)}%`,
    };
  });
}

function buildTemporalDomains(data: QualityContract): readonly TemporalDomainViewModel[] {
  return DOMAIN_ORDER.map((key) => {
    const domain = data.temporal.domains[key];
    return {
      key,
      label: domainLabels[key],
      source: key,
      validRows: domain.validRows,
      validRowsLabel: formatNumber(domain.validRows),
      quarantineRows: domain.quarantineRows,
      quarantineRowsLabel: formatNumber(domain.quarantineRows),
      validRatePct: domain.validRatePct,
      validRateLabel: formatPercent(domain.validRatePct),
      firstValidPeriod: domain.firstValidPeriod,
      lastValidPeriod: domain.lastValidPeriod,
    };
  });
}

function buildCoverageRows(data: QualityContract): readonly CoverageRowViewModel[] {
  return FACT_ORDER.map((key) => {
    const fact = data.referential.facts[key];
    return {
      key,
      label: domainLabels[key],
      rows: fact.rows,
      rowsLabel: formatNumber(fact.rows),
      joinIntegrityPct: fact.joinIntegrityPct,
      joinIntegrityLabel: formatPercent(fact.joinIntegrityPct),
      orphanRows: fact.orphanRows,
      orphanRowsLabel: formatNumber(fact.orphanRows),
      employeeCoveragePct: fact.employeeCoveragePct,
      employeeCoverageLabel: formatPercent(fact.employeeCoveragePct),
    };
  });
}

function buildLineage(data: QualityContract): readonly LineageStepViewModel[] {
  return [
    {
      index: '01',
      title: 'Identidad del backup aprobada',
      detail: 'Archivo, SHA-256, tamaño, corte, fuente canónica y exclusiones fueron validados en el servidor.',
      state: 'Validado',
    },
    {
      index: '02',
      title: 'Inventario focal reconciliado',
      detail: `${formatNumber(data.inventory.focal.totalTables)} tablas de foco y ${formatNumber(data.inventory.focal.totalRows)} filas coinciden con el diccionario completo.`,
      state: 'Validado',
    },
    {
      index: '03',
      title: 'Calidad agregada validada',
      detail: `Contrato ${data.schemaVersion} derivado de ${data.lineage.semanticSchemaVersion}; personas_junin permanece excluida.`,
      state: 'Validado',
    },
    {
      index: '04',
      title: 'Entrega mínima al navegador',
      detail: 'La sesión recibió sólo /api/grh-quality, sin profile, semantic, filas crudas, etiquetas, códigos ni series monetarias.',
      state: 'Validado',
    },
  ];
}

function buildRisks(data: QualityContract): readonly RiskViewModel[] {
  const risks = data.quality.risks;
  const reconciliationDiffers = hasMaterialReconciliationDifferences(data);
  return [
    {
      level: 'guarded',
      mark: 'P',
      title: 'PII contenida en la frontera del servidor',
      detail: 'Esta proyección no exporta identificadores, etiquetas, códigos, filas crudas ni personas_junin.',
    },
    reconciliationDiffers
      ? {
          level: 'high',
          mark: 'C',
          title: 'Conciliación cruzada con diferencias materiales',
          detail: `El score ${decimalFormatter.format(data.reconciliation.scorePct)}/100 exige revisión; totpago sigue siendo diagnóstico.`,
        }
      : {
          level: 'guarded',
          mark: 'C',
          title: 'Conciliación cruzada dentro del contrato',
          detail: 'Las corridas agregadas conciliaron; totpago continúa siendo diagnóstico y no acredita pago bancario.',
        },
    {
      level: 'high',
      mark: 'Q',
      title: `${formatNumber(risks.quarantinedTemporalRows)} filas en cuarentena`,
      detail: 'No alimentan los universos válidos hasta revisar las reglas temporales.',
    },
    {
      level: 'medium',
      mark: 'H',
      title: 'Snapshot histórico, no tiempo real',
      detail: `El corte es ${formatDate(data.source.snapshotAsOf)}; los cambios posteriores no están incluidos.`,
    },
    {
      level: 'medium',
      mark: 'U',
      title: 'Moneda no declarada en la fuente',
      detail: 'No se rotula ningún importe como moneda, pago bancario o ejecución presupuestaria.',
    },
    {
      level: 'medium',
      mark: 'L',
      title: `${formatNumber(risks.legacyImportErrorRows)} filas en errorimportacion`,
      detail: 'Es volumen histórico legacy; no equivale a errores activos de la plataforma.',
    },
    risks.latestCalculationControlWithinRoundingTolerance
      ? {
          level: 'medium',
          mark: 'A',
          title: `${formatNumber(risks.calculationControlAnomalousPeriods)} períodos de cálculo anómalos`,
          detail: 'Las anomalías permanecen visibles; el último control está dentro de tolerancia de redondeo.',
        }
      : {
          level: 'high',
          mark: 'A',
          title: `${formatNumber(risks.calculationControlAnomalousPeriods)} períodos anómalos y último control fuera de tolerancia`,
          detail: 'El último control agregado excede la tolerancia de redondeo y requiere revisión antes de usar el corte.',
        },
    {
      level: 'medium',
      mark: 'T',
      title: `${formatNumber(risks.suspiciousTextEncodingLabelCount)} etiqueta con codificación sospechosa`,
      detail: 'Debe conciliarse con un catálogo aprobado; no se corrige silenciosamente.',
    },
  ];
}

function buildActions(data: QualityContract): readonly ActionViewModel[] {
  const risks = data.quality.risks;
  const reconciliation = data.reconciliation;
  const reconciliationDiffers = hasMaterialReconciliationDifferences(data);
  return [
    reconciliationDiffers
      ? {
          index: '1',
          title: 'Conciliar cálculo con totpago',
          detail: `Priorizar corridas no conciliadas: acuerdo de valores ${formatPercent(reconciliation.valueAgreementPct)} y score ${decimalFormatter.format(reconciliation.scorePct)}/100.`,
        }
      : {
          index: '1',
          title: 'Sostener la conciliación entre fuentes',
          detail: 'Conservar el control en cada nuevo corte y alertar ante cualquier regresión antes de publicar indicadores.',
        },
    {
      index: '2',
      title: 'Resolver cuarentena temporal',
      detail: `Investigar ${formatNumber(risks.quarantinedTemporalRows)} filas sin alterar el backup histórico; documentar corrección o exclusión.`,
    },
    {
      index: '3',
      title: 'Clasificar el legado de importación',
      detail: `Determinar origen y vigencia de ${formatNumber(risks.legacyImportErrorRows)} filas de errorimportacion antes de tratarlas como señal operativa.`,
    },
    {
      index: '4',
      title: 'Revisar anomalías y catálogo de textos',
      detail: `Tratar ${formatNumber(risks.calculationControlAnomalousPeriods)} períodos y ${formatNumber(risks.suspiciousTextEncodingLabelCount)} etiqueta sospechosa con evidencia de fuente.`,
    },
    {
      index: '5',
      title: 'Preparar el siguiente corte gobernado',
      detail: 'Diseñar ingesta incremental, backup propio y restore probado antes de anunciar actualización diaria o tiempo real.',
    },
  ];
}

export function buildQualityViewModel(contract: QualityContract): QualityViewModel {
  if (!validateQualityContract(contract)) {
    throw new QualityContractError('GRH_QUALITY_CONTRACT_INVALID', 502);
  }

  const components = buildComponents(contract);
  const formula = COMPONENT_ORDER.map((key) => {
    const component = contract.quality.components[key];
    return `${decimalFormatter.format(component.weightPct)}% ${componentLabels[key].toLowerCase()}`;
  }).join(' + ');
  const risks = buildRisks(contract);

  return deepFreeze({
    source: {
      snapshotDate: formatDate(contract.source.snapshotAsOf),
      snapshotMeta: 'Snapshot histórico validado mediante una proyección privada de calidad; no es tiempo real.',
      profileSchema: contract.lineage.profileSchemaVersion,
      semanticSchema: contract.lineage.semanticSchemaVersion,
      sourceFile: contract.source.sourceFile,
      sourceHash: contract.source.sourceSha256,
      sourceSize: formatBytes(contract.source.compressedSizeBytes),
      sourceSnapshot: formatDate(contract.source.snapshotAsOf),
      profileGeneratedAt: formatDateTime(contract.lineage.profileGeneratedAt),
      semanticGeneratedAt: formatDateTime(contract.lineage.semanticGeneratedAt),
    },
    kpis: buildKpis(contract),
    quality: {
      badge: `${decimalFormatter.format(contract.quality.score)} / 100`,
      components,
      formula: `Puntaje = suma de cada componente × su peso (${formula}). Evalúa el extracto agregado gobernado, no la aptitud de cada tabla cruda.`,
    },
    reconciliation: {
      score: decimalFormatter.format(contract.reconciliation.scorePct),
      context: `${formatNumber(contract.reconciliation.fullyReconciledRuns)} de ${formatNumber(contract.reconciliation.matchedRuns)} corridas vinculadas conciliaron completamente.`,
      metrics: [
        {
          key: 'runCoverage',
          label: 'Cobertura de corridas',
          value: formatPercent(contract.reconciliation.runCoveragePct),
        },
        {
          key: 'metricExactness',
          label: 'Exactitud de métricas',
          value: formatPercent(contract.reconciliation.metricExactRatePct),
        },
        {
          key: 'valueAgreement',
          label: 'Acuerdo de valores',
          value: formatPercent(contract.reconciliation.valueAgreementPct),
        },
      ],
      warning: 'Este bloque es control de consistencia de GRH. No acredita transferencia bancaria, pago efectivo, asiento contable ni moneda.',
    },
    temporal: {
      badge: `${formatNumber(contract.temporal.quarantineRows)} filas`,
      domains: buildTemporalDomains(contract),
      reasonNote: `Las razones registran ${formatNumber(contract.temporal.quarantineReasonOccurrences)} ocurrencias no excluyentes; no representan filas adicionales. Licencias termina en ${contract.temporal.domains.licencia.lastValidPeriod} y se presenta como historia, no como vigencia actual.`,
    },
    coverage: {
      badge: `${formatNumber(contract.referential.legajo.uniqueKeys)} claves únicas`,
      rows: buildCoverageRows(contract),
    },
    lineage: buildLineage(contract),
    risks: {
      badge: `${formatNumber(risks.length)} señales`,
      items: risks,
    },
    actions: buildActions(contract),
    privacyStatus: `La proyección ${contract.schemaVersion} es sólo agregada: no contiene PII, identificadores, filas crudas, etiquetas de categorías, códigos de celdas ni series monetarias. personas_junin está excluida y el contrato bruto no llega al DOM.`,
  });
}
