import { useEffect, useMemo, useState } from 'react';

import type {
  OrganizationAnalyticsViewModel,
  RegistryRankingViewModel,
  WorkforceDimensionKey,
  WorkforceRowViewModel,
} from '../domain/organization-analytics-types';
import {
  ActivityTimeline,
  ExplorerCrossBreakdown,
  MatrixHeatmap,
  WorkforceBars,
} from './StructureCharts';

const WORKFORCE_KEYS: readonly WorkforceDimensionKey[] = ['sector', 'costCenter', 'agreement'];
const EXPLORER_DIMENSIONS: readonly ExplorerDimension[] = ['organization', 'sector', 'costCenter'];

interface StructureDashboardProps {
  readonly capabilities: readonly string[];
  readonly viewModel: OrganizationAnalyticsViewModel;
}

type RegistryExplorerDimension = RegistryRankingViewModel['key'];
type ExplorerDimension = RegistryExplorerDimension | 'costCenter';

interface RegistryExplorerSelection {
  readonly dimension: RegistryExplorerDimension;
  readonly code: number;
}

interface CostCenterExplorerSelection {
  readonly dimension: 'costCenter';
  readonly company: string;
  readonly code: string;
}

type ExplorerSelection = RegistryExplorerSelection | CostCenterExplorerSelection;

interface ExplorerDeepLink {
  readonly invalid: boolean;
  readonly dimension: ExplorerDimension;
  readonly selection: ExplorerSelection | null;
}

function firstRegistryExplorerSelection(
  viewModel: OrganizationAnalyticsViewModel,
  preferredDimension: RegistryExplorerDimension = 'organization',
): RegistryExplorerSelection {
  const registry = viewModel.registries.find(candidate => candidate.key === preferredDimension) ??
    viewModel.registries[0];
  const row = registry?.rows.find(candidate => candidate.privacyStatus === 'released' && candidate.code !== null);
  if (!registry || !row || row.code === null) {
    throw new Error('ORGANIZATION_EXPLORER_WITHOUT_RELEASED_ROWS');
  }
  return { dimension: registry.key, code: row.code };
}

function firstCostCenterExplorerSelection(
  viewModel: OrganizationAnalyticsViewModel,
): CostCenterExplorerSelection | null {
  const row = selectableCostCenters(viewModel.workforce.costCenter.rows)[0];
  return row
    ? { dimension: 'costCenter', company: String(row.companyCode), code: String(row.sourceCode) }
    : null;
}

function safeIdentityToken(value: string | number | null): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return typeof value === 'string' && /^[A-Za-z0-9._/-]{1,64}$/u.test(value) ? value : null;
}

function costCenterIdentity(row: WorkforceRowViewModel): string | null {
  const company = safeIdentityToken(row.companyCode);
  const code = safeIdentityToken(row.sourceCode);
  return company !== null && code !== null ? `${company}:${code}` : null;
}

function selectableCostCenters(rows: readonly WorkforceRowViewModel[]): readonly WorkforceRowViewModel[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.privacyStatus !== 'released') continue;
    const identity = costCenterIdentity(row);
    if (identity) counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return rows.filter(row => {
    const identity = costCenterIdentity(row);
    return row.privacyStatus === 'released' && identity !== null && counts.get(identity) === 1;
  });
}

function readExplorerDeepLink(viewModel: OrganizationAnalyticsViewModel): ExplorerDeepLink {
  const fallback = firstRegistryExplorerSelection(viewModel);
  const parameters = new URLSearchParams(window.location.search);
  const keys = Array.from(parameters.keys());
  if (keys.length === 0) {
    return { invalid: false, dimension: fallback.dimension, selection: fallback };
  }
  const dimension = parameters.get('dimension');
  if (dimension === 'costCenter') {
    const exactShape = keys.length === 3 &&
      keys.every(key => key === 'dimension' || key === 'company' || key === 'code') &&
      parameters.getAll('dimension').length === 1 &&
      parameters.getAll('company').length === 1 &&
      parameters.getAll('code').length === 1 &&
      window.location.hash === '#organizationExplorer';
    const company = parameters.get('company');
    const code = parameters.get('code');
    const exists = exactShape && safeIdentityToken(company) !== null && safeIdentityToken(code) !== null &&
      selectableCostCenters(viewModel.workforce.costCenter.rows).some(row => (
        String(row.companyCode) === company && String(row.sourceCode) === code
      ));
    return exists
      ? { invalid: false, dimension, selection: { dimension, company: company!, code: code! } }
      : { invalid: true, dimension, selection: null };
  }
  const exactShape = keys.length === 2 &&
    keys.every(key => key === 'dimension' || key === 'code') &&
    parameters.getAll('dimension').length === 1 &&
    parameters.getAll('code').length === 1 &&
    window.location.hash === '#organizationExplorer';
  const rawCode = parameters.get('code');
  if (!exactShape || (dimension !== 'organization' && dimension !== 'sector') ||
      !/^(?:0|[1-9]\d*)$/u.test(rawCode ?? '')) {
    return { invalid: true, dimension: 'organization', selection: null };
  }
  const code = Number(rawCode);
  const registry = viewModel.registries.find(candidate => candidate.key === dimension);
  const exists = Number.isSafeInteger(code) && registry?.rows.some(row => (
    row.code === code && row.privacyStatus === 'released'
  ));
  return exists
    ? { invalid: false, dimension, selection: { dimension, code } }
    : { invalid: true, dimension, selection: null };
}

function pushExplorerDeepLink(selection: ExplorerSelection) {
  const parameters = selection.dimension === 'costCenter'
    ? new URLSearchParams({ dimension: selection.dimension, company: selection.company, code: selection.code })
    : new URLSearchParams({ dimension: selection.dimension, code: String(selection.code) });
  window.history.pushState(
    window.history.state,
    '',
    `${window.location.pathname}?${parameters.toString()}#organizationExplorer`,
  );
}

function filteredDirectoryHref(baseHref: string, selection: RegistryExplorerSelection): string {
  const basePath = baseHref.split(/[?#]/u)[0] || '/rrhh';
  const parameters = new URLSearchParams({ [selection.dimension]: String(selection.code) });
  return `${basePath}?${parameters.toString()}#peopleDirectory`;
}

function explorerDimensionLabel(dimension: ExplorerDimension): string {
  if (dimension === 'organization') return 'Organización informada';
  if (dimension === 'sector') return 'Sector informado';
  return 'Área de costo observada';
}

function referencePeriodLabel(period: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(period);
  if (!match) return period;
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function safeNumericIdentifier(value: string | number | null, { positive = false } = {}): number | null {
  const normalized = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^(?:0|[1-9]\d*)$/u.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(normalized) || normalized < (positive ? 1 : 0)) return null;
  return normalized;
}

function normalizedClassificationLabel(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es-AR');
}

function containsConflictingFinanceDimensionToken(value: string): boolean {
  const normalized = value.normalize('NFKD').replace(/\p{M}+/gu, '')
    .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es-AR');
  return /\b(?:sector(?:es)?|convenio(?:s)?|acuerdo(?:s)?|categoria(?:s)?)\b/u.test(normalized);
}

function PanelHeader({
  eyebrow,
  title,
  meta,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly meta?: string;
}) {
  return (
    <header className="structure-panel__header">
      <div>
        <p className="structure-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {meta ? <span>{meta}</span> : null}
    </header>
  );
}

function RegistryComparator({ registries }: { readonly registries: readonly RegistryRankingViewModel[] }) {
  const [dimensionKey, setDimensionKey] = useState<RegistryRankingViewModel['key']>('organization');
  const registry = registries.find(candidate => candidate.key === dimensionKey) ?? registries[0];
  const comparableRows = registry?.rows.filter(row => row.privacyStatus === 'released') ?? [];
  const [leftKey, setLeftKey] = useState(comparableRows[0]?.key ?? '');
  const [rightKey, setRightKey] = useState(comparableRows[1]?.key ?? comparableRows[0]?.key ?? '');
  const effectiveLeftKey = comparableRows.some(row => row.key === leftKey) ? leftKey : comparableRows[0]?.key ?? '';
  const effectiveRightKey = comparableRows.some(row => row.key === rightKey) && rightKey !== effectiveLeftKey
    ? rightKey
    : comparableRows.find(row => row.key !== effectiveLeftKey)?.key ?? effectiveLeftKey;
  const left = comparableRows.find(row => row.key === effectiveLeftKey);
  const right = comparableRows.find(row => row.key === effectiveRightKey);

  const changeDimension = (key: RegistryRankingViewModel['key']) => {
    const next = registries.find(candidate => candidate.key === key);
    const released = next?.rows.filter(row => row.privacyStatus === 'released') ?? [];
    setDimensionKey(key);
    setLeftKey(released[0]?.key ?? '');
    setRightKey(released[1]?.key ?? released[0]?.key ?? '');
  };

  return (
    <div className="structure-comparator" data-testid="registry-comparator">
      <div className="structure-comparator__controls">
        <label>
          Clasificación
          <select
            value={dimensionKey}
            onChange={event => changeDimension(event.target.value as RegistryRankingViewModel['key'])}
            data-testid="comparator-dimension"
          >
            {registries.map(candidate => (
              <option value={candidate.key} key={candidate.key}>{candidate.label}</option>
            ))}
          </select>
        </label>
        <label>
          Primera categoría
          <select
            value={effectiveLeftKey}
            onChange={event => setLeftKey(event.target.value)}
            data-testid="comparator-left"
          >
            {comparableRows.map(row => <option value={row.key} key={row.key}>{row.label}</option>)}
          </select>
        </label>
        <label>
          Segunda categoría
          <select
            value={effectiveRightKey}
            onChange={event => setRightKey(event.target.value)}
            data-testid="comparator-right"
          >
            {comparableRows.map(row => (
              <option value={row.key} disabled={row.key === effectiveLeftKey} key={row.key}>{row.label}</option>
            ))}
          </select>
        </label>
      </div>
      {left && right ? (
        <div className="structure-comparator__result" aria-live="polite">
          {[left, right].map(row => (
            <article key={row.key}>
              <strong>{row.label}</strong>
              <b>{row.registeredLabel}</b>
              <span>registros · {row.shareLabel} de la base</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="structure-empty">No hay dos categorías publicables para comparar.</p>
      )}
    </div>
  );
}

function AbsenceRanking({ viewModel }: Pick<StructureDashboardProps, 'viewModel'>) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? viewModel.absenceRanking : viewModel.absenceRanking.slice(0, 6);
  const hiddenCount = Math.max(0, viewModel.absenceRanking.length - 6);
  return (
    <>
      <ol className="structure-absence-ranking" data-testid="absence-ranking">
        {rows.map(row => (
          <li key={row.key} data-protected={row.privacyStatus === 'released' ? 'false' : 'true'}>
            <span className="structure-absence-ranking__rank">{row.rank}</span>
            <span className="structure-absence-ranking__label">
              <strong>{row.label}</strong>
              <small>{row.recordsWithAbsence === null
                ? 'Desglose protegido'
                : `${row.recordsWithAbsence.toLocaleString('es-AR')} registros con historia`}</small>
            </span>
            <span className="structure-absence-ranking__value">
              <strong>{row.absenceEvents === null ? 'Protegido' : row.absenceEvents.toLocaleString('es-AR')}</strong>
              <small>{row.absenceEvents === null ? 'Sin cifra publicada' : `${row.eventShareLabel} de eventos`}</small>
            </span>
          </li>
        ))}
      </ol>
      {hiddenCount > 0 ? (
        <button
          className="structure-disclosure"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          data-testid="absence-ranking-toggle"
        >
          {expanded ? 'Ver principales' : `Ver ${hiddenCount} organizaciones más`}
        </button>
      ) : null}
    </>
  );
}

function OrganizationExplorer({
  aiAssistantEnabled,
  directoryActionHref,
  haciendaEnabled,
  viewModel,
}: {
  readonly aiAssistantEnabled: boolean;
  readonly directoryActionHref: string | null;
  readonly haciendaEnabled: boolean;
  readonly viewModel: OrganizationAnalyticsViewModel;
}) {
  const initial = useMemo(() => readExplorerDeepLink(viewModel), [viewModel]);
  const [dimension, setDimension] = useState<ExplorerDimension>(initial.dimension);
  const [selection, setSelection] = useState<ExplorerSelection | null>(initial.selection);
  const [invalidDeepLink, setInvalidDeepLink] = useState(initial.invalid);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const restoreFromLocation = () => {
      const next = readExplorerDeepLink(viewModel);
      setDimension(next.dimension);
      setSelection(next.selection);
      setInvalidDeepLink(next.invalid);
      setQuery('');
    };
    window.addEventListener('popstate', restoreFromLocation);
    return () => window.removeEventListener('popstate', restoreFromLocation);
  }, [viewModel]);

  const registry = dimension === 'costCenter'
    ? null
    : viewModel.registries.find(candidate => candidate.key === dimension) ?? null;
  const registrySelection = selection?.dimension === 'organization' || selection?.dimension === 'sector'
    ? selection
    : null;
  const selectedRegistry = registry && registrySelection
    ? registry.rows.find(row => row.code === registrySelection.code && row.privacyStatus === 'released') ?? null
    : null;
  const costCenterRanking = viewModel.workforce.costCenter;
  const costCenterRows = selectableCostCenters(costCenterRanking.rows);
  const costCenterSelection = selection?.dimension === 'costCenter' ? selection : null;
  const selectedCostCenter = costCenterSelection
    ? costCenterRows.find(row => (
      String(row.companyCode) === costCenterSelection.company &&
      String(row.sourceCode) === costCenterSelection.code
    )) ?? null
    : null;
  const normalizedQuery = query.normalize('NFKC').trim().toLocaleLowerCase('es-AR');
  const selectableRows = registry?.rows.filter(row => row.privacyStatus === 'released' && row.code !== null) ?? [];
  const protectedAggregate = registry?.rows.find(row => (
    row.code === null && row.privacyStatus !== 'released'
  )) ?? null;
  const visibleRows = selectableRows.filter(row => !normalizedQuery ||
    row.label.toLocaleLowerCase('es-AR').includes(normalizedQuery) ||
    String(row.code).includes(normalizedQuery));
  const visibleCostCenters = costCenterRows.filter(row => !normalizedQuery ||
    normalizedClassificationLabel(row.label).includes(normalizedQuery) ||
    String(row.companyCode).includes(normalizedQuery) || String(row.sourceCode).includes(normalizedQuery));
  const protectedCostCenters = costCenterRanking.rows.find(row => row.privacyStatus === 'protected_aggregate') ?? null;
  const absence = selectedRegistry && dimension === 'organization'
    ? viewModel.absenceRanking.find(row => row.organizationCode === selectedRegistry.code &&
      row.privacyStatus === 'released' && row.absencePrivacyStatus === 'released' &&
      row.recordsWithAbsence !== null && row.absenceEvents !== null)
    : null;

  const select = (next: ExplorerSelection) => {
    setDimension(next.dimension);
    setSelection(next);
    setInvalidDeepLink(false);
    pushExplorerDeepLink(next);
  };
  const changeDimension = (dimension: ExplorerDimension) => {
    setQuery('');
    if (dimension === 'costCenter') {
      const next = firstCostCenterExplorerSelection(viewModel);
      setDimension(dimension);
      setSelection(next);
      setInvalidDeepLink(false);
      if (next) pushExplorerDeepLink(next);
      return;
    }
    select(firstRegistryExplorerSelection(viewModel, dimension));
  };
  const effectiveSelection = selectedRegistry?.code === null || !selectedRegistry || !registry
    ? null
    : { dimension: registry.key, code: selectedRegistry.code } as const;
  const detailDirectoryHref = directoryActionHref && effectiveSelection
    ? filteredDirectoryHref(directoryActionHref, effectiveSelection)
    : null;
  const matchingPayrollSectors = selectedRegistry && registry?.key === 'sector'
    ? viewModel.workforce.sector.rows.filter(row => (
      row.privacyStatus === 'released' &&
      safeNumericIdentifier(row.sourceCode) === selectedRegistry.code &&
      normalizedClassificationLabel(row.label) === normalizedClassificationLabel(selectedRegistry.label)
    ))
    : [];
  const payrollSector = matchingPayrollSectors.length === 1 ? matchingPayrollSectors[0] : null;
  const payrollCompanyCode = payrollSector ? safeNumericIdentifier(payrollSector.companyCode, { positive: true }) : null;
  const payrollSectorCode = payrollSector ? safeNumericIdentifier(payrollSector.sourceCode) : null;
  const haciendaHref = haciendaEnabled && payrollCompanyCode !== null && payrollSectorCode !== null
    ? `/hacienda?cohort=sector&company=${payrollCompanyCode}&code=${payrollSectorCode}#cohortContext`
    : null;
  const assistantHref = aiAssistantEnabled && selectedRegistry && payrollSector
    ? `/ia.html?${new URLSearchParams({ question: `Mostrá el neto de ${selectedRegistry.label} por sector` }).toString()}`
    : null;
  const costCenterCompany = selectedCostCenter
    ? safeNumericIdentifier(selectedCostCenter.companyCode, { positive: true })
    : null;
  const costCenterCode = selectedCostCenter ? safeNumericIdentifier(selectedCostCenter.sourceCode) : null;
  const costCenterHaciendaHref = haciendaEnabled && costCenterCompany !== null && costCenterCode !== null
    ? `/hacienda?cohort=costCenter&company=${costCenterCompany}&code=${costCenterCode}#cohortContext`
    : null;
  const matchingCostCenterLabels = selectedCostCenter
    ? costCenterRows.filter(row => (
      normalizedClassificationLabel(row.label) === normalizedClassificationLabel(selectedCostCenter.label)
    ))
    : [];
  const costCenterAssistantHref = aiAssistantEnabled && selectedCostCenter && matchingCostCenterLabels.length === 1 &&
    !containsConflictingFinanceDimensionToken(selectedCostCenter.label)
    ? `/ia.html?${new URLSearchParams({
      question: `Mostrá los componentes del cálculo de ${selectedCostCenter.label} por centro de costo en ${viewModel.truth.referencePeriod}`,
    }).toString()}`
    : null;
  const selectedCostCenterPosition = selectedCostCenter
    ? costCenterRows.findIndex(row => row.key === selectedCostCenter.key) + 1
    : 0;
  const hasSelection = dimension === 'costCenter' ? selectedCostCenter !== null : selectedRegistry !== null;

  return (
    <div className="structure-explorer" data-testid="organization-explorer">
      <aside className="structure-explorer__master" aria-labelledby="organization-explorer-list-title">
        <div className="structure-explorer__dimension" role="group" aria-label="Dimensión del explorador">
          {EXPLORER_DIMENSIONS.map(candidate => (
            <button
              type="button"
              aria-pressed={dimension === candidate}
              data-testid={`organization-explorer-dimension-${candidate}`}
              key={candidate}
              onClick={() => changeDimension(candidate)}
            >
              {explorerDimensionLabel(candidate)}
            </button>
          ))}
        </div>
        <label className="structure-explorer__search" htmlFor="organization-explorer-search">
          <span id="organization-explorer-list-title">
            Buscar en {dimension === 'costCenter' ? 'áreas de costo observadas' : registry?.label.toLocaleLowerCase('es-AR')}
          </span>
          <input
            id="organization-explorer-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Nombre o código"
            autoComplete="off"
            data-testid="organization-explorer-search"
          />
        </label>
        <p className="structure-explorer__result-count" role="status">
          {dimension === 'costCenter'
            ? `${visibleCostCenters.length} de ${costCenterRows.length} áreas observadas seleccionables`
            : `${visibleRows.length} de ${registry?.releasedCategoryCount ?? 0} clasificaciones seleccionables${
              (registry?.protectedCategoryCount ?? 0) > 0
                ? ` · ${registry?.protectedCategoryCount} categorías agrupadas`
                : ''}`}
        </p>
        {dimension === 'costCenter' && visibleCostCenters.length > 0 ? (
          <ul className="structure-explorer__list" data-testid="organization-explorer-list">
            {visibleCostCenters.map(row => {
              const company = String(row.companyCode);
              const code = String(row.sourceCode);
              const current = selectedCostCenter &&
                String(selectedCostCenter.companyCode) === company && String(selectedCostCenter.sourceCode) === code;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    data-testid={`organization-explorer-option-costCenter-${company}-${code}`}
                    onClick={() => select({ dimension: 'costCenter', company, code })}
                  >
                    <span>
                      <strong>{row.label}</strong>
                      <small>Empresa {company} · código {code}</small>
                    </span>
                    <span>
                      <b>{row.participantLabel}</b>
                      <small>{row.shareLabel}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : dimension !== 'costCenter' && visibleRows.length > 0 ? (
          <ul className="structure-explorer__list" data-testid="organization-explorer-list">
            {visibleRows.map(row => (
              <li key={row.key}>
                <button
                  type="button"
                  aria-current={row.code === selectedRegistry?.code ? 'true' : undefined}
                  data-testid={`organization-explorer-option-${registry?.key}-${row.code}`}
                  onClick={() => row.code !== null && registry && select({ dimension: registry.key, code: row.code })}
                >
                  <span>
                    <strong>{row.label}</strong>
                    <small>Código {row.code}</small>
                  </span>
                  <span>
                    <b>{row.registeredLabel}</b>
                    <small>{row.shareLabel}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="structure-explorer__empty">
            {dimension === 'costCenter' && costCenterRows.length === 0
              ? 'No hay áreas de costo publicadas para seleccionar.'
              : 'No hay coincidencias en las categorías publicadas.'}
          </p>
        )}
        {dimension === 'costCenter' && protectedCostCenters ? (
          <section
            className="structure-explorer__protected-summary"
            aria-label="Resumen protegido de centros de costo"
            data-testid="organization-explorer-protected-costCenter"
          >
            <span>
              <strong>Otros centros protegidos</strong>
              <small>Agrupado sin identidades ni cantidad de categorías</small>
            </span>
            <span>
              <b>{protectedCostCenters.participantLabel}</b>
              <small>{protectedCostCenters.shareLabel}</small>
            </span>
          </section>
        ) : protectedAggregate && registry ? (
          <section
            className="structure-explorer__protected-summary"
            aria-label="Resumen de categorías protegidas"
            data-testid={`organization-explorer-protected-${registry.key}`}
          >
            <span>
              <strong>{registry.protectedCategoryCount === 1 ? 'Grupo protegido' : 'Otros grupos protegidos'}</strong>
              <small>
                {registry.protectedCategoryCount}{' '}
                {registry.protectedCategoryCount === 1 ? 'categoría de origen agrupada' : 'categorías de origen agrupadas'};
                {' '}sin selección individual
              </small>
            </span>
            <span>
              <b>{protectedAggregate.registeredLabel}</b>
              <small>{protectedAggregate.shareLabel}</small>
            </span>
          </section>
        ) : null}
      </aside>

      <article
        className="structure-explorer__detail"
        aria-labelledby="organization-explorer-detail-title"
        aria-live="polite"
        data-testid="organization-explorer-detail"
      >
        {!hasSelection ? (
          <div className="structure-explorer__invalid">
            <p className="structure-eyebrow">
              {dimension === 'costCenter' && costCenterRows.length === 0 && !invalidDeepLink
                ? 'Publicación protegida'
                : 'Selección requerida'}
            </p>
            <h3 id="organization-explorer-detail-title">
              {dimension === 'costCenter' && costCenterRows.length === 0 && !invalidDeepLink
                ? 'Sin áreas de costo publicadas'
                : `Elegí ${dimension === 'costCenter'
                  ? 'un área de costo observada'
                  : 'una clasificación GRH publicada'}`}
            </h3>
            <p role={invalidDeepLink ? 'alert' : undefined} data-testid={invalidDeepLink
              ? 'organization-explorer-invalid-link'
              : undefined}>
              {invalidDeepLink
                ? `El enlace no identifica ${dimension === 'costCenter' ? 'un área de costo observada' : 'una clasificación GRH publicable'}. No se muestran cifras hasta que elijas una opción.`
                : dimension === 'costCenter' && costCenterRows.length === 0
                  ? 'La proyección sólo publica un resumen agregado protegido. No hay identidades seleccionables ni acciones disponibles.'
                : 'Seleccioná una opción para consultar su contexto agregado.'}
            </p>
          </div>
        ) : dimension === 'costCenter' && selectedCostCenter ? (
          <>
            <header className="structure-explorer__detail-header">
              <div>
                <p className="structure-eyebrow">Área de costo observada</p>
                <h3 id="organization-explorer-detail-title">{selectedCostCenter.label}</h3>
                <span>
                  Empresa {selectedCostCenter.companyCode} · código de origen {selectedCostCenter.sourceCode}
                  {' '}· período {viewModel.truth.referencePeriod}
                </span>
              </div>
              <div className="structure-explorer__actions">
                {costCenterHaciendaHref ? (
                  <a
                    className="structure-action structure-action--primary structure-explorer__action"
                    href={costCenterHaciendaHref}
                    data-testid="organization-explorer-hacienda-action"
                  >
                    Cruzar cohorte en Hacienda
                  </a>
                ) : null}
                {costCenterAssistantHref ? (
                  <a
                    className="structure-action structure-explorer__action"
                    href={costCenterAssistantHref}
                    data-testid="organization-explorer-assistant-action"
                  >
                    Analizar cálculo con BOT IA
                  </a>
                ) : null}
              </div>
            </header>
            <dl className="structure-explorer__metrics structure-explorer__metrics--cost-center">
              <div>
                <dt>Participantes con cálculo válido en {referencePeriodLabel(viewModel.truth.referencePeriod)}</dt>
                <dd>{selectedCostCenter.participantLabel}</dd>
                <small>Área observada en la cohorte del período</small>
              </div>
              <div>
                <dt>Participación en la cohorte</dt>
                <dd>{selectedCostCenter.shareLabel}</dd>
                <small>Sobre {costCenterRanking.denominatorLabel}</small>
              </div>
              <div>
                <dt>Posición entre áreas publicadas</dt>
                <dd>{selectedCostCenterPosition} de {costCenterRows.length}</dd>
                <small>Orden de la proyección publicada</small>
              </div>
            </dl>
            <p className="structure-explorer__context-note" data-testid="cost-center-scope-note">
              Clasificación observada en el cálculo: no describe un departamento vigente, headcount/FTE, planta,
              presupuesto ejecutado ni pago. Base: {costCenterRanking.denominatorLabel}; período{' '}
              {viewModel.truth.referencePeriod}.
            </p>
          </>
        ) : selectedRegistry && registry ? (
          <>
            <header className="structure-explorer__detail-header">
              <div>
                <p className="structure-eyebrow">
                  {explorerDimensionLabel(registry.key)}
                </p>
                <h3 id="organization-explorer-detail-title">{selectedRegistry.label}</h3>
                <span>Código de origen {selectedRegistry.code}</span>
              </div>
              <div className="structure-explorer__actions">
                {detailDirectoryHref ? (
                  <a
                    className="structure-action structure-action--primary structure-explorer__action"
                    href={detailDirectoryHref}
                    data-testid="organization-explorer-directory-action"
                  >
                    Ver legajos filtrados
                  </a>
                ) : null}
                {haciendaHref ? (
                  <a
                    className="structure-action structure-explorer__action"
                    href={haciendaHref}
                    data-testid="organization-explorer-hacienda-action"
                  >
                    Cruzar cohorte en Hacienda
                  </a>
                ) : null}
                {assistantHref ? (
                  <a
                    className="structure-action structure-explorer__action"
                    href={assistantHref}
                    data-testid="organization-explorer-assistant-action"
                  >
                    Analizar sector con BOT IA
                  </a>
                ) : null}
              </div>
            </header>

            <dl className="structure-explorer__metrics">
              <div>
                <dt>Legajos registrados</dt>
                <dd>{selectedRegistry.registeredLabel}</dd>
                <small>Snapshot histórico</small>
              </div>
              <div>
                <dt>Participación en la clasificación GRH</dt>
                <dd>{selectedRegistry.shareLabel}</dd>
                <small>Base: {registry.denominatorLabel}</small>
              </div>
              {absence ? (
                <>
                  <div>
                    <dt>Registros con historia de ausencias</dt>
                    <dd>{absence.recordsWithAbsence?.toLocaleString('es-AR')}</dd>
                    <small>Historia agregada; no dotación activa</small>
                  </div>
                  <div>
                    <dt>Eventos históricos de ausencia</dt>
                    <dd>{absence.absenceEvents?.toLocaleString('es-AR')}</dd>
                    <small>{absence.eventShareLabel} de los eventos publicados</small>
                  </div>
                  <div>
                    <dt>Eventos por legajo registrado</dt>
                    <dd>{absence.eventIntensityLabel}</dd>
                    <small>Intensidad histórica; no es una tasa de ausentismo</small>
                  </div>
                </>
              ) : null}
            </dl>

            {!absence ? (
              <p className="structure-explorer__context-note" data-testid="organization-explorer-absence-unavailable">
                <strong>Sin desglose publicado.</strong>{' '}
                {registry.key === 'sector'
                  ? 'La proyección no publica ausencias por sector informado; no se deriva una tasa ni se cruzan universos.'
                  : 'Esta organización informada no integra el ranking publicable de ausencias; esto no equivale a cero.'}
              </p>
            ) : null}

            <section className="structure-explorer__breakdown" aria-labelledby="organization-explorer-cross-title">
              <div>
                <p className="structure-eyebrow">Cruce de clasificaciones publicado</p>
                <h4 id="organization-explorer-cross-title">
                  {registry.key === 'organization'
                    ? 'Distribución por sector informado'
                    : 'Distribución por organización informada'}
                </h4>
              </div>
              <ExplorerCrossBreakdown
                code={selectedRegistry.code!}
                dimension={registry.key}
                matrix={viewModel.matrix}
              />
            </section>
            <p className="structure-panel__note">
              Registros del snapshot: no certifican planta activa, puesto vigente ni jerarquía actual.
            </p>
          </>
        ) : null}
      </article>
    </div>
  );
}

export function StructureDashboard({ capabilities, viewModel }: StructureDashboardProps) {
  const [workforceKey, setWorkforceKey] = useState<WorkforceDimensionKey>('sector');
  const workforceRanking = viewModel.workforce[workforceKey];
  const enabledActions = useMemo(() => {
    const capabilitySet = new Set(capabilities);
    return viewModel.actions.filter(action => capabilitySet.has(action.requiredCapability));
  }, [capabilities, viewModel.actions]);
  const directoryActionHref = enabledActions.find(action => action.id === 'open_workforce_dashboard')?.href ?? null;
  const haciendaEnabled = capabilities.includes('navigation.hacienda');
  const aiAssistantEnabled = capabilities.includes('navigation.ai-assistant');

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Sala de situación validada y disponible.
      </p>

      <section className="structure-hero" aria-labelledby="structure-title">
        <div>
          <p className="structure-eyebrow">Centro Ejecutivo GRH</p>
          <h1 id="structure-title">Estructura, dotación y áreas de costo</h1>
          <p className="structure-hero__description">
            Participación en el cálculo, cobertura de registros y novedades históricas en una lectura operativa.
          </p>
          <div
            className="structure-hero__chips"
            id="organizationSnapshotStatus"
            aria-label="Corte de la información"
          >
            <span>Corte {viewModel.truth.snapshotLabel}</span>
            <span>Cálculo {viewModel.truth.referencePeriod}</span>
            <span>Corte histórico</span>
          </div>
        </div>
        <aside className="structure-hero__decisions" aria-label="Acciones disponibles">
          <strong>Pasar a la acción</strong>
          <div>
            {enabledActions.map((action, index) => (
              <a
                className={index === 0 ? 'structure-action structure-action--primary' : 'structure-action'}
                href={action.href}
                key={action.id}
                data-testid={`structure-action-${action.id}`}
              >
                {action.label}
              </a>
            ))}
          </div>
        </aside>
      </section>

      <section className="structure-kpis" aria-label="Indicadores principales">
        {viewModel.kpis.map(kpi => (
          <article
            className="structure-kpi"
            data-tone={kpi.tone}
            data-testid={`structure-kpi-${kpi.key}`}
            key={kpi.key}
          >
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <p>{kpi.note}</p>
          </article>
        ))}
      </section>

      <section
        className="structure-panel structure-panel--workforce"
        id="dotacion-liquidada"
        aria-labelledby="workforce-title"
        data-testid="workforce-panel"
      >
        <div className="structure-panel__header structure-panel__header--controls">
          <div>
            <p className="structure-eyebrow">Cohorte de cálculo</p>
            <h2 id="workforce-title">Participación en el último cálculo válido</h2>
          </div>
          <div className="structure-segmented" role="group" aria-label="Clasificar participantes del cálculo">
            {WORKFORCE_KEYS.map(key => (
              <button
                type="button"
                aria-pressed={workforceKey === key}
                onClick={() => setWorkforceKey(key)}
                key={key}
                data-testid={`workforce-tab-${key}`}
              >
                {viewModel.workforce[key].label}
              </button>
            ))}
          </div>
        </div>
        <WorkforceBars ranking={workforceRanking} />
        <p className="structure-panel__note">{viewModel.truth.definition}</p>
      </section>

      <section className="structure-section" aria-labelledby="activity-title" id="novedades-historicas">
        <div className="structure-section__heading">
          <div>
            <p className="structure-eyebrow">Novedades históricas</p>
            <h2 id="activity-title">Eventos y participantes, con escalas separadas</h2>
          </div>
          <span>Fuente GRH · corte {viewModel.truth.snapshotLabel}</span>
        </div>
        <div className="structure-two-column">
          {viewModel.activity.map(domain => (
            <article className="structure-panel structure-panel--activity" key={domain.key}>
              <PanelHeader
                eyebrow="Serie histórica GRH"
                title={domain.label}
                meta={`${domain.releasedPeriods} períodos`}
              />
              <ActivityTimeline domain={domain} />
            </article>
          ))}
        </div>
      </section>

      <section
        className="structure-section"
        aria-labelledby="registry-title"
        id="organizationExplorer"
      >
        <div className="structure-section__heading">
          <div>
            <p className="structure-eyebrow">Explorador operativo</p>
            <h2 id="registry-title">Clasificaciones informadas, del resumen al detalle</h2>
          </div>
          <span>Selección local · sin nueva consulta</span>
        </div>
        <OrganizationExplorer
          aiAssistantEnabled={aiAssistantEnabled}
          directoryActionHref={directoryActionHref}
          haciendaEnabled={haciendaEnabled}
          viewModel={viewModel}
        />
      </section>

      <section className="structure-two-column structure-two-column--uneven" aria-label="Cruces y ausencias">
        <article className="structure-panel">
          <PanelHeader
            eyebrow="Cruce organizativo"
            title="Organización × sector"
            meta={`${viewModel.matrix.releasedCellCount} celdas publicadas`}
          />
          <MatrixHeatmap matrix={viewModel.matrix} />
          <p className="structure-panel__note">
            Los valores protegidos permanecen ocultos y no se reemplazan por cero.
          </p>
        </article>

        <article className="structure-panel" id="absenceRiskPanel">
          <PanelHeader eyebrow="Historia agregada" title="Ausencias por organización" />
          <AbsenceRanking viewModel={viewModel} />
        </article>
      </section>

      <section className="structure-two-column" aria-label="Comparación y calidad">
        <article className="structure-panel" id="organizationCompare">
          <PanelHeader eyebrow="Comparador" title="Contrastar dos categorías" />
          <RegistryComparator registries={viewModel.registries} />
        </article>

        <article className="structure-panel" data-testid="quality-facts">
          <PanelHeader eyebrow="Preparación de datos" title="Registros para revisar" />
          <dl className="structure-quality-facts">
            {viewModel.qualityFacts.map(fact => (
              <div key={fact.key}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          {enabledActions.some(action => action.id === 'open_data_quality') ? (
            <a className="structure-inline-link" href="/calidad">Abrir calidad de datos →</a>
          ) : null}
        </article>
      </section>

      <details className="structure-source" data-testid="structure-source-details">
        <summary>Fuente y alcance del corte</summary>
        <dl>
          <div><dt>Sistema</dt><dd>{viewModel.truth.canonicalSystem}</dd></div>
          <div><dt>Archivo</dt><dd>{viewModel.truth.sourceFile}</dd></div>
          <div><dt>SHA-256</dt><dd><code>{viewModel.truth.sourceHash}</code></dd></div>
        </dl>
        <p>Snapshot histórico con agregados de registro, cálculo y actividad; cada universo conserva su denominador.</p>
      </details>
    </>
  );
}
