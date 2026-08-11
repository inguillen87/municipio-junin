import { useMemo, useState } from 'react';

import type {
  OrganizationAnalyticsViewModel,
  RegistryRankingViewModel,
  WorkforceDimensionKey,
} from '../domain/organization-analytics-types';
import {
  ActivityTimeline,
  MatrixHeatmap,
  RegistryBars,
  WorkforceBars,
} from './StructureCharts';

const WORKFORCE_KEYS: readonly WorkforceDimensionKey[] = ['sector', 'costCenter', 'agreement'];

interface StructureDashboardProps {
  readonly capabilities: readonly string[];
  readonly viewModel: OrganizationAnalyticsViewModel;
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
              <small>{row.recordsWithAbsence.toLocaleString('es-AR')} registros con historia</small>
            </span>
            <span className="structure-absence-ranking__value">
              <strong>{row.absenceEvents.toLocaleString('es-AR')}</strong>
              <small>{row.eventShareLabel} de eventos</small>
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

export function StructureDashboard({ capabilities, viewModel }: StructureDashboardProps) {
  const [workforceKey, setWorkforceKey] = useState<WorkforceDimensionKey>('sector');
  const workforceRanking = viewModel.workforce[workforceKey];
  const enabledActions = useMemo(() => {
    const capabilitySet = new Set(capabilities);
    return viewModel.actions.filter(action => capabilitySet.has(action.requiredCapability));
  }, [capabilities, viewModel.actions]);

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Sala de situación validada y disponible.
      </p>

      <section className="structure-hero" aria-labelledby="structure-title">
        <div>
          <p className="structure-eyebrow">Centro Ejecutivo GRH</p>
          <h1 id="structure-title">Sala de situación de dotación y ausencias</h1>
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
            <p className="structure-eyebrow">Cobertura del registro</p>
            <h2 id="registry-title">Distribución de legajos registrados</h2>
          </div>
          <span>Universo distinto de la cohorte de cálculo</span>
        </div>
        <div className="structure-two-column">
          {viewModel.registries.map(registry => (
            <article className="structure-panel" key={registry.key} data-testid={`registry-panel-${registry.key}`}>
              <PanelHeader eyebrow="Registros GRH" title={`Por ${registry.label.toLocaleLowerCase('es-AR')}`} />
              <RegistryBars registry={registry} />
            </article>
          ))}
        </div>
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
