import {
  AUTH_TIMEOUT_MS,
} from '../auth/session';
import { useGovernedSurface } from '../auth/use-governed-surface';
import { fetchQualityContract } from '../domain/quality-contract';
import { buildQualityViewModel } from '../domain/quality-view-model';
import type {
  CoverageRowViewModel,
  QualityViewModel,
  TemporalDomainViewModel,
} from '../domain/quality-types';
import { ActionQueue } from '../components/ActionQueue';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import { KpiCard } from '../components/KpiCard';
import { MetricProgress } from '../components/MetricProgress';
import { ResponsiveTable, type TableColumn } from '../components/ResponsiveTable';
import { RiskList } from '../components/RiskList';
import { SourceStatus } from '../components/SourceStatus';

const REQUIRED_CAPABILITY = 'navigation.data-quality';
const QUALITY_NAVIGATION = Object.freeze({
  activeItemId: 'control',
  itemIds: Object.freeze(['workspace', 'grh-ejecutivo', 'control']),
});

async function loadQualityViewModel(signal: AbortSignal): Promise<QualityViewModel> {
  const contract = await fetchQualityContract({ timeoutMs: AUTH_TIMEOUT_MS, signal });
  return buildQualityViewModel(contract);
}

const TEMPORAL_COLUMNS: readonly TableColumn<TemporalDomainViewModel>[] = [
  { key: 'domain', label: 'Conjunto de datos', render: row => row.label },
  { key: 'source', label: 'Tabla técnica', render: row => row.source },
  { key: 'valid', label: 'Registros válidos', align: 'end', render: row => row.validRowsLabel },
  {
    key: 'quarantine',
    label: 'Apartados',
    align: 'end',
    render: row => <span className={row.quarantineRows > 0 ? 'cell-warning' : undefined}>{row.quarantineRowsLabel}</span>,
  },
  { key: 'rate', label: 'Porcentaje válido', align: 'end', render: row => row.validRateLabel },
  { key: 'first', label: 'Desde', align: 'end', render: row => row.firstValidPeriod },
  { key: 'last', label: 'Hasta', align: 'end', render: row => row.lastValidPeriod },
];

const COVERAGE_COLUMNS: readonly TableColumn<CoverageRowViewModel>[] = [
  { key: 'fact', label: 'Conjunto de datos', render: row => row.label },
  { key: 'rows', label: 'Registros', align: 'end', render: row => row.rowsLabel },
  { key: 'integrity', label: 'Vínculos correctos', align: 'end', render: row => row.joinIntegrityLabel },
  {
    key: 'orphans',
    label: 'Sin legajo relacionado',
    align: 'end',
    render: row => <span className={row.orphanRows > 0 ? 'cell-warning' : undefined}>{row.orphanRowsLabel}</span>,
  },
  { key: 'coverage', label: 'Cobertura del padrón', align: 'end', render: row => row.employeeCoverageLabel },
];

function ReadyDashboard({ viewModel }: { viewModel: QualityViewModel }) {
  const executive = viewModel.executive;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">Proyección de calidad validada y disponible.</p>
      <section className="page-hero page-hero--quality" aria-labelledby="page-title">
        <div className="page-hero__intro">
          <p className="page-hero__eyebrow">Lectura simple · evidencia GRH</p>
          <h1 id="page-title">Calidad del corte GRH</h1>
          <p>Una respuesta clara sobre qué datos se pueden leer, qué necesita atención y cuál es el próximo paso.</p>
        </div>
        <SourceStatus source={viewModel.source} />
      </section>

      <section
        className="quality-decision"
        data-tone={executive.tone}
        aria-labelledby="quality-decision-title"
        data-testid="quality-executive-summary"
      >
        <header className="quality-decision__header">
          <div>
            <p className="panel__eyebrow">Resultado ejecutivo</p>
            <span className="quality-status">{executive.statusLabel}</span>
            <h2 id="quality-decision-title">{executive.headline}</h2>
            <p>{executive.description}</p>
          </div>
        </header>

        <div className="quality-decision__grid">
          <article className="quality-decision__card quality-decision__card--positive">
            <h3>Qué está bien</h3>
            <ul>
              {executive.strengths.map(item => <li key={item}>{item}</li>)}
            </ul>
          </article>
          <article className="quality-decision__card quality-decision__card--attention">
            <h3>Qué requiere atención</h3>
            <strong>{executive.attentionTitle}</strong>
            <p>{executive.attentionDetail}</p>
          </article>
          <article className="quality-decision__card">
            <h3>Qué impacto tiene</h3>
            <p>{executive.impact}</p>
          </article>
        </div>

        <footer className="quality-next-step">
          <span aria-hidden="true">1</span>
          <div>
            <p>Próximo paso recomendado</p>
            <strong>{executive.nextActionTitle}</strong>
            <small>{executive.nextActionDetail}</small>
          </div>
        </footer>
      </section>

      <section className="kpi-grid kpi-grid--quality" aria-label="Indicadores principales de calidad">
        {viewModel.kpis.map(kpi => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            note={kpi.note}
            title={kpi.title}
            tone={kpi.tone}
          />
        ))}
      </section>

      <section className="quality-evidence" aria-labelledby="quality-evidence-title">
        <header className="quality-evidence__header">
          <div>
            <p className="panel__eyebrow">Evidencia disponible</p>
            <h2 id="quality-evidence-title">Abrí el detalle sólo cuando lo necesites</h2>
            <p>La lectura ejecutiva queda arriba. Las tablas, la metodología y los nombres técnicos se conservan para auditoría.</p>
          </div>
        </header>

        <div className="quality-disclosures">
          <details className="quality-disclosure" data-testid="quality-reconciliation-details">
            <summary>
              <span><strong>Comparación del control de liquidaciones</strong><small>Por qué algunos controles no coinciden entre fuentes</small></span>
              <span>{viewModel.reconciliation.context}</span>
            </summary>
            <div className="quality-disclosure__body">
              <div className="reconciliation-score">
                <strong>{viewModel.reconciliation.score}</strong>
                <span>Puntaje técnico del control agregado sobre 100</span>
              </div>
              <dl className="source-status__facts" aria-label="Métricas técnicas de comparación">
                {viewModel.reconciliation.metrics.map(metric => (
                  <div key={metric.key}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="table-note">La fuente auxiliar figura en el backup con el nombre técnico <strong>totpago</strong>.</p>
              <p className="warning-note">{viewModel.reconciliation.warning}</p>
            </div>
          </details>

          <details className="quality-disclosure" data-testid="quality-temporal-details">
            <summary>
              <span><strong>Fechas y períodos fuera de regla</strong><small>Qué registros se apartaron antes de calcular indicadores</small></span>
              <span>{viewModel.temporal.badge}</span>
            </summary>
            <div className="quality-disclosure__body">
              <ResponsiveTable
                label="Validez temporal por dominio GRH"
                columns={TEMPORAL_COLUMNS}
                rows={viewModel.temporal.domains}
                rowKey={row => row.key}
              />
              <p className="table-note">{viewModel.temporal.reasonNote}</p>
            </div>
          </details>

          <details className="quality-disclosure" data-testid="quality-coverage-details">
            <summary>
              <span><strong>Vínculos con legajos</strong><small>Cuántos registros se pueden relacionar con el padrón</small></span>
              <span>{viewModel.coverage.badge}</span>
            </summary>
            <div className="quality-disclosure__body">
              <ResponsiveTable
                label="Cobertura referencial de legajos"
                columns={COVERAGE_COLUMNS}
                rows={viewModel.coverage.rows}
                rowKey={row => row.key}
              />
              <p className="table-note">“Sin legajo relacionado” indica que el registro no encontró una clave válida en el padrón del mismo corte. No identifica por sí solo la causa.</p>
            </div>
          </details>

          <details className="quality-disclosure" data-testid="quality-method-details">
            <summary id="riskTitle">
              <span><strong>Metodología y límites</strong><small>Cómo se armó el indicador y qué no demuestra</small></span>
              <span>Ver cálculo técnico</span>
            </summary>
            <div className="quality-disclosure__body quality-disclosure__body--split">
              <div>
                <h3>Componentes del indicador técnico</h3>
                <div className="metric-stack">
                  {viewModel.quality.components.map(component => (
                    <MetricProgress
                      key={component.key}
                      label={component.label}
                      value={component.score}
                      valueLabel={component.scoreLabel}
                      detail={component.weightLabel}
                      tone={component.key === 'payrollReconciliation' ? 'warning' : 'positive'}
                    />
                  ))}
                </div>
                <p className="formula-note">{viewModel.quality.formula}</p>
              </div>
              <div>
                <h3>Limitaciones que acompañan al corte</h3>
                <RiskList items={viewModel.risks.items} />
              </div>
            </div>
          </details>

          <details className="quality-disclosure" data-testid="quality-lineage-details">
            <summary id="lineageTitle">
              <span><strong>Origen y trazabilidad</strong><small>Controles aplicados desde el backup hasta esta pantalla</small></span>
              <span>4 controles</span>
            </summary>
            <div className="quality-disclosure__body">
              <ol className="lineage-list">
                {viewModel.lineage.map(step => (
                  <li className="lineage-item" key={`${step.index}-${step.title}`}>
                    <span className="lineage-item__index" aria-hidden="true">{step.index}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                    <span className="lineage-item__state">{step.state}</span>
                  </li>
                ))}
              </ol>
              <p className="privacy-note" role="note">{viewModel.privacyStatus}</p>
            </div>
          </details>

          <details className="quality-disclosure" data-testid="quality-actions-details">
            <summary>
              <span><strong>Plan completo de mejora</strong><small>Orden sugerido para cerrar las observaciones</small></span>
              <span>{viewModel.actions.length} acciones</span>
            </summary>
            <div className="quality-disclosure__body">
              <ActionQueue items={viewModel.actions} />
            </div>
          </details>
        </div>
      </section>
    </>
  );
}

export function App() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadQualityViewModel,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell
      identity={state.identity}
      navigation={QUALITY_NAVIGATION}
      busy={state.status === 'loading'}
    >
      {state.status === 'loading' ? (
        <GovernedLoading description="Estamos verificando que la información esté disponible para este municipio." />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          description="No pudimos validar el respaldo; no mostramos cifras para evitar errores."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <ReadyDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
