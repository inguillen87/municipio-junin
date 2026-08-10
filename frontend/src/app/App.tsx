import { useEffect, useState } from 'react';

import { fetchQualityContract } from '../domain/quality-contract';
import { buildQualityViewModel } from '../domain/quality-view-model';
import type {
  CoverageRowViewModel,
  QualityViewModel,
  TemporalDomainViewModel,
} from '../domain/quality-types';
import { ActionQueue } from '../components/ActionQueue';
import { AppShell } from '../components/AppShell';
import { KpiCard } from '../components/KpiCard';
import { MetricProgress } from '../components/MetricProgress';
import { Panel } from '../components/Panel';
import { ResponsiveTable, type TableColumn } from '../components/ResponsiveTable';
import { RiskList } from '../components/RiskList';
import { SourceStatus } from '../components/SourceStatus';
import type { TopbarIdentity } from '../components/Topbar';

const REQUIRED_CAPABILITY = 'navigation.data-quality';
const AUTH_TIMEOUT_MS = 12_000;
const SAFE_WORKSPACE = '/inicio.html';
const DATA_QUALITY_ROLES = new Set([
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'INTENDENTE',
  'CONTADOR',
]);
const KNOWN_CAPABILITIES = new Set([
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.ai-assistant',
  'navigation.audit',
  'navigation.export',
  'navigation.import',
  'navigation.help',
]);

interface AuthClient {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface SessionIdentity extends TopbarIdentity {
  id: string;
  tenantId: string;
  capabilities: readonly string[];
}

type PageState =
  | { status: 'loading'; identity: SessionIdentity | null }
  | { status: 'blocked'; identity: SessionIdentity | null }
  | { status: 'ready'; identity: SessionIdentity; viewModel: QualityViewModel };

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

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function authClient(): AuthClient | null {
  const candidate = (window as Window & { MuniAuth?: unknown }).MuniAuth;
  if (!plainObject(candidate) || typeof candidate.fetch !== 'function') return null;
  return candidate;
}

function parseSession(payload: unknown): SessionIdentity | null {
  if (!plainObject(payload) || !plainObject(payload.user)) return null;
  const { user } = payload;
  if (!nonEmptyString(user.id) || !nonEmptyString(user.name) || !nonEmptyString(user.role) ||
      !nonEmptyString(user.tenantId) || !Array.isArray(user.capabilities)) {
    return null;
  }
  if (!DATA_QUALITY_ROLES.has(user.role)) return null;

  const capabilities = user.capabilities;
  if (!capabilities.every((capability): capability is string =>
    typeof capability === 'string' && KNOWN_CAPABILITIES.has(capability))) {
    return null;
  }
  if (capabilities.length === 0 || new Set(capabilities).size !== capabilities.length) return null;
  if (!capabilities.includes('session.read') || !capabilities.includes('navigation.workspace') ||
      !capabilities.includes(REQUIRED_CAPABILITY)) {
    return null;
  }

  let tenant = user.tenantId;
  if (plainObject(user.tenant)) {
    if (nonEmptyString(user.tenant.id) && user.tenant.id !== user.tenantId) return null;
    if (nonEmptyString(user.tenant.shortName)) tenant = user.tenant.shortName;
    else if (nonEmptyString(user.tenant.name)) tenant = user.tenant.name;
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    tenant,
    tenantId: user.tenantId,
    capabilities: [...capabilities],
  };
}

function redirectToSafeWorkspace() {
  try {
    window.sessionStorage.setItem(
      'mjunin_access_notice',
      'El perfil actual no tiene habilitada la superficie solicitada.',
    );
  } catch {
    // The redirect is the security behavior; the explanatory notice is optional.
  }
  window.location.replace(SAFE_WORKSPACE);
}

async function fetchAuthoritativeSession(signal: AbortSignal): Promise<SessionIdentity | null> {
  const client = authClient();
  if (!client) throw new Error('AUTH_CLIENT_UNAVAILABLE');

  const response = await client.fetch('/api/auth/me', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error('SESSION_UNAVAILABLE');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  return parseSession(payload);
}

function LoadingView() {
  return (
    <section className="loading-state" role="status" aria-live="polite" aria-label="Validando evidencia">
      <div className="state-card">
        <div className="loader" aria-hidden="true" />
        <h1>Validando evidencia gobernada</h1>
        <p>Confirmamos la sesión, el municipio, las capacidades y el contrato antes de presentar cualquier indicador.</p>
      </div>
    </section>
  );
}

function BlockedView({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="blocked-state" role="alert" aria-live="assertive">
      <div className="state-card">
        <div className="state-card__icon" aria-hidden="true">!</div>
        <h1>Evidencia bloqueada</h1>
        <p>La proyección privada no está disponible o no supera su contrato. No se muestra ninguna cifra.</p>
        <div className="state-card__actions">
          <button className="button button--primary" type="button" onClick={onRetry}>Reintentar validación</button>
          <a className="button" href={SAFE_WORKSPACE}>Volver al inicio</a>
        </div>
      </div>
    </section>
  );
}

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
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PageState>({ status: 'loading', identity: null });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const authTimeout = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    async function load() {
      setState({ status: 'loading', identity: null });
      try {
        const identity = await fetchAuthoritativeSession(controller.signal);
        window.clearTimeout(authTimeout);
        if (!active) return;
        if (!identity) {
          redirectToSafeWorkspace();
          return;
        }

        setState({ status: 'loading', identity });
        const contract = await fetchQualityContract({ timeoutMs: AUTH_TIMEOUT_MS, signal: controller.signal });
        const viewModel = buildQualityViewModel(contract);
        if (!active) return;
        setState({ status: 'ready', identity, viewModel });
      } catch {
        if (!active) return;
        setState(current => ({ status: 'blocked', identity: current.identity }));
      }
    }

    void load();
    return () => {
      active = false;
      window.clearTimeout(authTimeout);
      controller.abort();
    };
  }, [attempt]);

  return (
    <AppShell identity={state.identity} busy={state.status === 'loading'}>
      {state.status === 'loading' ? <LoadingView /> : null}
      {state.status === 'blocked' ? <BlockedView onRetry={() => setAttempt(value => value + 1)} /> : null}
      {state.status === 'ready' ? <ReadyDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
