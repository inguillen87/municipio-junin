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
import { Panel } from '../components/Panel';
import { ResponsiveTable, type TableColumn } from '../components/ResponsiveTable';
import { RiskList } from '../components/RiskList';
import { SourceStatus } from '../components/SourceStatus';
import type { TopbarLink } from '../components/Topbar';

const REQUIRED_CAPABILITY = 'navigation.data-quality';
const QUALITY_NAVIGATION: readonly TopbarLink[] = Object.freeze([
  { href: '/inicio.html', label: 'Inicio' },
  { href: '/calidad', label: 'Calidad', current: true },
  { href: '/control.html', label: 'Estable' },
]);

async function loadQualityViewModel(signal: AbortSignal): Promise<QualityViewModel> {
  const contract = await fetchQualityContract({ timeoutMs: AUTH_TIMEOUT_MS, signal });
  return buildQualityViewModel(contract);
}

const TEMPORAL_COLUMNS: readonly TableColumn<TemporalDomainViewModel>[] = [
  { key: 'domain', label: 'Dominio', render: row => row.label },
  { key: 'source', label: 'Fuente', render: row => row.source },
  { key: 'valid', label: 'Válidas', align: 'end', render: row => row.validRowsLabel },
  {
    key: 'quarantine',
    label: 'Cuarentena',
    align: 'end',
    render: row => <span className={row.quarantineRows > 0 ? 'cell-warning' : undefined}>{row.quarantineRowsLabel}</span>,
  },
  { key: 'rate', label: 'Tasa válida', align: 'end', render: row => row.validRateLabel },
  { key: 'first', label: 'Primer período', align: 'end', render: row => row.firstValidPeriod },
  { key: 'last', label: 'Último período', align: 'end', render: row => row.lastValidPeriod },
];

const COVERAGE_COLUMNS: readonly TableColumn<CoverageRowViewModel>[] = [
  { key: 'fact', label: 'Hecho GRH', render: row => row.label },
  { key: 'rows', label: 'Filas', align: 'end', render: row => row.rowsLabel },
  { key: 'integrity', label: 'Integridad join', align: 'end', render: row => row.joinIntegrityLabel },
  {
    key: 'orphans',
    label: 'Huérfanas',
    align: 'end',
    render: row => <span className={row.orphanRows > 0 ? 'cell-warning' : undefined}>{row.orphanRowsLabel}</span>,
  },
  { key: 'coverage', label: 'Cobertura legajo', align: 'end', render: row => row.employeeCoverageLabel },
];

function ReadyDashboard({ viewModel }: { viewModel: QualityViewModel }) {
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">Proyección de calidad validada y disponible.</p>
      <section className="page-hero" aria-labelledby="page-title">
        <div className="page-hero__intro">
          <p className="page-hero__eyebrow">Gobierno de datos · GRH</p>
          <h1 id="page-title">Calidad y linaje con evidencia verificable</h1>
          <p>Una lectura ejecutiva del respaldo histórico: procedencia, consistencia y límites visibles antes de tomar decisiones.</p>
        </div>
        <SourceStatus source={viewModel.source} />
      </section>

      <section className="kpi-grid" aria-label="Indicadores principales de calidad">
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

      <div className="dashboard-grid">
        <Panel
          id="quality-composition-title"
          eyebrow="Confianza del extracto"
          title="Composición del score de calidad"
          description="Cada componente conserva su peso y evidencia de origen."
          badge={viewModel.quality.badge}
        >
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
        </Panel>

        <Panel
          id="reconciliation-title"
          eyebrow="Control entre fuentes"
          title="Conciliación cálculo · totpago"
          description={viewModel.reconciliation.context}
        >
          <div className="reconciliation-score">
            <strong>{viewModel.reconciliation.score}</strong>
            <span>Resultado del control agregado</span>
          </div>
          <dl className="source-status__facts" aria-label="Métricas de conciliación">
            {viewModel.reconciliation.metrics.map(metric => (
              <div key={metric.key}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
          <p className="warning-note">{viewModel.reconciliation.warning}</p>
        </Panel>

        <Panel
          id="temporal-title"
          eyebrow="Cuarentena explícita"
          title="Validez temporal por dominio"
          description="Los períodos inválidos permanecen fuera del universo gobernado."
          badge={viewModel.temporal.badge}
          className="panel--wide"
        >
          <ResponsiveTable
            label="Validez temporal por dominio GRH"
            columns={TEMPORAL_COLUMNS}
            rows={viewModel.temporal.domains}
            rowKey={row => row.key}
          />
          <p className="table-note">{viewModel.temporal.reasonNote}</p>
        </Panel>

        <Panel
          id="coverage-title"
          eyebrow="Integridad referencial"
          title="Cobertura de legajos"
          description="Uniones agregadas, huérfanas visibles y cobertura trazable."
          badge={viewModel.coverage.badge}
          className="panel--wide"
        >
          <ResponsiveTable
            label="Cobertura referencial de legajos"
            columns={COVERAGE_COLUMNS}
            rows={viewModel.coverage.rows}
            rowKey={row => row.key}
          />
        </Panel>

        <Panel
          id="lineage-title"
          eyebrow="Trazabilidad"
          title="Cadena de validación"
          description="La evidencia avanza por controles explícitos antes de llegar al navegador."
        >
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
        </Panel>

        <Panel
          id="risk-title"
          eyebrow="Lectura responsable"
          title="Registro de riesgos"
          description="Las limitaciones acompañan al indicador; no quedan ocultas detrás del score."
          badge={viewModel.risks.badge}
        >
          <RiskList items={viewModel.risks.items} />
        </Panel>

        <Panel
          id="action-title"
          eyebrow="Siguiente movimiento"
          title="Cola de acciones recomendadas"
          description="Orden propuesto para elevar confiabilidad sin reescribir la historia."
          className="panel--wide"
        >
          <ActionQueue items={viewModel.actions} />
        </Panel>

        <p className="privacy-note" role="note">{viewModel.privacyStatus}</p>
      </div>
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
      links={QUALITY_NAVIGATION}
      busy={state.status === 'loading'}
    >
      {state.status === 'loading' ? (
        <GovernedLoading description="Confirmamos la sesión, el municipio, las capacidades y el contrato antes de presentar cualquier indicador." />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          description="La proyección privada no está disponible o no supera su contrato. No se muestra ninguna cifra."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <ReadyDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
