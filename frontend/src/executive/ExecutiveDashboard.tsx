import type { ExecutiveKpiViewModel, ExecutiveViewModel } from '../domain/executive-types';
import { AnnualCollection, PayrollChart, SectorChart } from './ExecutiveCharts';

const KPI_STATUS_LABELS: Record<ExecutiveKpiViewModel['status'], string> = {
  released: 'Disponible',
  protected: 'Dato reservado',
  partial: 'Parcial',
};

interface ExecutiveDashboardProps {
  readonly viewModel: ExecutiveViewModel;
}

export function ExecutiveDashboard({ viewModel }: ExecutiveDashboardProps) {
  const payrollHeaderStatus = viewModel.payroll.latestPeriod === null
    ? 'Sin último mes visible'
    : viewModel.payroll.latestStatus === 'released'
      ? 'Último mes disponible'
      : 'Último mes reservado';

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">Resumen ejecutivo disponible.</p>

      <section className="executive-hero" aria-labelledby="page-title">
        <div className="executive-hero__intro">
          <p className="executive-eyebrow">Resumen ejecutivo GRH</p>
          <h1 id="page-title">Personal, nómina y alertas en una sola vista</h1>
          <p>
            Una lectura simple del último respaldo disponible de Junín: personas incluidas en el cálculo,
            evolución mensual, sectores y novedades de personal.
          </p>
          <nav className="executive-hero__actions" aria-label="Acciones ejecutivas">
            <a href="/rrhh">Gestionar personas</a>
            <a href="/hacienda">Abrir nómina</a>
            <a href="/ia">Consultar GRH</a>
          </nav>
          <div id="periodRange" className="executive-hero__guardrails" aria-label="Alcance de la lectura">
            <span>Datos hasta {viewModel.truth.snapshotLabel}</span>
            <span>Mes analizado {viewModel.truth.referencePeriod}</span>
            <span>Importes en ARS por configuración municipal</span>
          </div>
        </div>

        <aside className="executive-truth" aria-labelledby="truth-title">
          <div className="executive-truth__status">
            <span aria-hidden="true" />
            <p>Información disponible</p>
          </div>
          <h2 id="truth-title">Resumen de {viewModel.truth.referencePeriod}</h2>
          <p>
            Los datos llegan hasta {viewModel.truth.snapshotLabel}. Es información histórica y no se actualiza en tiempo real.
          </p>
          <details
            className="executive-text-alternative"
            data-executive-technical-evidence="closed-by-default"
          >
            <summary>Ver respaldo técnico</summary>
            <dl>
              <div>
                <dt>Sistema de origen</dt>
                <dd>{viewModel.truth.canonicalSystem}</dd>
              </div>
              <div>
                <dt>Fecha del respaldo</dt>
                <dd>{viewModel.truth.snapshotLabel} · corte histórico, no tiempo real</dd>
              </div>
              <div>
                <dt>Universo incluido</dt>
                <dd>{viewModel.truth.workforceDefinition}</dd>
              </div>
              <div>
                <dt>Archivo de origen</dt>
                <dd>{viewModel.truth.sourceFile}</dd>
              </div>
              <div>
                <dt>Tablas de eventos</dt>
                <dd><code>{viewModel.annual.map(domain => domain.sourceTable).join(', ')}</code></dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd><code>{viewModel.truth.sourceHash}</code></dd>
              </div>
            </dl>
          </details>
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

      <div id="executiveInsights" className="executive-dashboard-grid">
        <section className="executive-panel executive-panel--wide" aria-labelledby="payroll-title">
          <header className="executive-panel__header">
            <div>
              <p className="executive-eyebrow">Evolución mensual</p>
              <h2 id="payroll-title">Importes de control de la liquidación</h2>
              <p>
                <strong>Importes mostrados en ARS por configuración municipal.</strong>{' '}
                El respaldo original no declara moneda: son importes de control de liquidación y no confirman pagos.
              </p>
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
              <p className="executive-eyebrow">Distribución por sector</p>
              <h2 id="sector-title">Personas incluidas en el cálculo por sector</h2>
              <p>Los grupos pequeños se reúnen para cuidar identidades. Esta distribución no indica personal activo.</p>
            </div>
            <span>{viewModel.sector.individuallyPublishedCoverageLabel} con sector identificado</span>
          </header>
          <div className="executive-panel__body">
            <SectorChart sector={viewModel.sector} />
          </div>
        </section>

        <section className="executive-panel executive-panel--wide" aria-labelledby="history-title">
          <header className="executive-panel__header">
            <div>
              <p className="executive-eyebrow">Historial disponible</p>
              <h2 id="history-title">Ausencias, licencias y cambios de legajo</h2>
              <p>Cantidades registradas por año. No son tasas, no indican vigencia laboral y no explican causas.</p>
            </div>
          </header>
          <div className="executive-panel__body executive-annual-grid">
            {viewModel.annual.map(domain => <AnnualCollection domain={domain} key={domain.key} />)}
          </div>
        </section>

        <aside className="executive-privacy" aria-labelledby="privacy-title">
          <div>
            <p className="executive-eyebrow">Privacidad aplicada</p>
            <h2 id="privacy-title">Cómo cuidamos la identidad de las personas</h2>
            <p>{viewModel.privacy.note}</p>
          </div>
          <dl>
            <div>
              <dt>Categorías con menos de {viewModel.privacy.rankingThreshold} personas</dt>
              <dd>Se agrupan</dd>
            </div>
            <div>
              <dt>Importes o eventos con menos de {viewModel.privacy.sensitiveThreshold} personas</dt>
              <dd>No se muestran</dd>
            </div>
            <div>
              <dt>Grupos reunidos para proteger identidades</dt>
              <dd>{viewModel.privacy.protectedRankingRows}</dd>
            </div>
            <div>
              <dt>Meses con importes no mostrados</dt>
              <dd>{viewModel.privacy.suppressedMonetaryPeriods}</dd>
            </div>
            <div>
              <dt>Años con eventos no mostrados</dt>
              <dd>{viewModel.privacy.suppressedAnnualPeriods}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
