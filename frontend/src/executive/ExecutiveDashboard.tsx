import type { ExecutiveKpiViewModel, ExecutiveViewModel } from '../domain/executive-types';
import { AnnualCollection, PayrollChart, SectorChart } from './ExecutiveCharts';

const KPI_STATUS_LABELS: Record<ExecutiveKpiViewModel['status'], string> = {
  released: 'Publicado',
  protected: 'Protegido',
  partial: 'Lectura parcial',
};

interface ExecutiveDashboardProps {
  readonly viewModel: ExecutiveViewModel;
}

export function ExecutiveDashboard({ viewModel }: ExecutiveDashboardProps) {
  const payrollHeaderStatus = viewModel.payroll.latestPeriod === null
    ? 'Último valor no determinable'
    : viewModel.payroll.latestStatus === 'released'
      ? 'Último período publicado'
      : 'Último período conocido protegido';

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">Tablero ejecutivo validado y disponible.</p>

      <section className="executive-hero" aria-labelledby="page-title">
        <div className="executive-hero__intro">
          <p className="executive-eyebrow">Intendencia · evidencia GRH gobernada</p>
          <h1 id="page-title">Decisiones ejecutivas con el límite de la fuente a la vista</h1>
          <p>
            Una síntesis para conducción que prioriza señales publicables, conserva los huecos protegidos y separa hechos de interpretaciones.
          </p>
          <div className="executive-hero__guardrails" aria-label="Alcance de la lectura">
            <span>No es tiempo real</span>
            <span>No equivale a pago bancario</span>
            <span>No representa dotación activa</span>
          </div>
        </div>

        <aside className="executive-truth" aria-labelledby="truth-title">
          <div className="executive-truth__status">
            <span aria-hidden="true" />
            <p>Corte histórico declarado</p>
          </div>
          <h2 id="truth-title">{viewModel.truth.snapshotLabel}</h2>
          <p>{viewModel.truth.freshnessLabel}</p>
          <dl>
            <div>
              <dt>Sistema canónico</dt>
              <dd>{viewModel.truth.canonicalSystem}</dd>
            </div>
            <div>
              <dt>Período de referencia</dt>
              <dd>{viewModel.truth.referencePeriod}</dd>
            </div>
            <div>
              <dt>Universo</dt>
              <dd>{viewModel.truth.workforceDefinition}</dd>
            </div>
            <div>
              <dt>Archivo fuente</dt>
              <dd>{viewModel.truth.sourceFile}</dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd><code>{viewModel.truth.sourceHash}</code></dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="kpi-grid executive-kpi-grid" aria-label="Indicadores ejecutivos principales">
        {viewModel.kpis.map(kpi => (
          <article
            className="kpi-card executive-kpi-card"
            data-kpi={kpi.key}
            data-tone={kpi.tone}
            key={kpi.key}
          >
            <div className="executive-kpi-card__top">
              <span className="kpi-card__label">{kpi.label}</span>
              <span className="executive-kpi-card__status" data-status={kpi.status}>
                {KPI_STATUS_LABELS[kpi.status]}
              </span>
            </div>
            <strong className="kpi-card__value">{kpi.value}</strong>
            <p>{kpi.note}</p>
          </article>
        ))}
      </section>

      <div className="executive-dashboard-grid">
        <section className="executive-panel executive-panel--wide" aria-labelledby="payroll-title">
          <header className="executive-panel__header">
            <div>
              <p className="executive-eyebrow">Control temporal</p>
              <h2 id="payroll-title">Evolución del control de cálculo</h2>
              <p>Importes agregados en unidades de la fuente, sin atribuir moneda ni acreditar pago.</p>
            </div>
            <span>{payrollHeaderStatus}</span>
          </header>
          <div className="executive-panel__body">
            <PayrollChart payroll={viewModel.payroll} />
          </div>
        </section>

        <section className="executive-panel executive-panel--wide" aria-labelledby="sector-title">
          <header className="executive-panel__header">
            <div>
              <p className="executive-eyebrow">Composición publicable</p>
              <h2 id="sector-title">Participación en liquidación por sector</h2>
              <p>El ranking conserva el agregado protegido y no se presenta como padrón de personas activas.</p>
            </div>
            <span>{viewModel.sector.individuallyPublishedCoverageLabel} con categoría individual</span>
          </header>
          <div className="executive-panel__body">
            <SectorChart sector={viewModel.sector} />
          </div>
        </section>

        <section className="executive-panel executive-panel--wide" aria-labelledby="history-title">
          <header className="executive-panel__header">
            <div>
              <p className="executive-eyebrow">Historia agregada</p>
              <h2 id="history-title">Ausencias, licencias y movimientos</h2>
              <p>Volúmenes válidos por año: no son tasas, no prueban vigencia y no explican causas.</p>
            </div>
          </header>
          <div className="executive-panel__body executive-annual-grid">
            {viewModel.annual.map(domain => <AnnualCollection domain={domain} key={domain.key} />)}
          </div>
        </section>

        <aside className="executive-privacy" aria-labelledby="privacy-title">
          <div>
            <p className="executive-eyebrow">Privacidad aplicada</p>
            <h2 id="privacy-title">Los límites viajan con el indicador</h2>
            <p>{viewModel.privacy.note}</p>
          </div>
          <dl>
            <div>
              <dt>Rankings</dt>
              <dd>k ≥ {viewModel.privacy.rankingThreshold}</dd>
            </div>
            <div>
              <dt>Datos sensibles</dt>
              <dd>k ≥ {viewModel.privacy.sensitiveThreshold}</dd>
            </div>
            <div>
              <dt>Filas de ranking protegidas</dt>
              <dd>{viewModel.privacy.protectedRankingRows}</dd>
            </div>
            <div>
              <dt>Períodos monetarios protegidos</dt>
              <dd>{viewModel.privacy.suppressedMonetaryPeriods}</dd>
            </div>
            <div>
              <dt>Períodos anuales protegidos</dt>
              <dd>{viewModel.privacy.suppressedAnnualPeriods}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
