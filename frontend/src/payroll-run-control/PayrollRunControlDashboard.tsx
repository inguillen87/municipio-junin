import { useState } from 'react';

import type { PayrollRunControlViewModel } from './payroll-run-control-types';

type WindowSize = 24 | 60 | 'all';

const WINDOW_OPTIONS: readonly { readonly value: WindowSize; readonly label: string }[] = Object.freeze([
  { value: 24, label: 'Últimos 24 meses' },
  { value: 60, label: 'Últimos 5 años' },
  { value: 'all', label: 'Todo el historial' },
]);

export function PayrollRunControlDashboard({
  viewModel,
}: { readonly viewModel: PayrollRunControlViewModel }) {
  const [windowSize, setWindowSize] = useState<WindowSize>(24);
  const visibleMonths = windowSize === 'all'
    ? viewModel.monthly
    : viewModel.monthly.slice(-windowSize);

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">Control agregado de corridas GRH disponible.</p>
      <section className="run-hero" id="payrollRunSummary" aria-labelledby="run-title">
        <div className="run-hero__copy">
          <p className="run-eyebrow">Nómina · trazabilidad de proceso</p>
          <h1 id="run-title">Corridas y marcas de cierre, explicadas sin vueltas</h1>
          <p>
            Esta vista une cabeceras de corrida, presencia de cálculo y marca operativa de cierre.
            Sirve para detectar huecos técnicos; no afirma pago, cierre contable ni transferencia bancaria.
          </p>
          <nav aria-label="Acciones relacionadas">
            <a href="/hacienda.html">Ver Hacienda y nómina</a>
            <a href="/ia?question=Explic%C3%A1%20el%20control%20agregado%20de%20corridas%20GRH">Preguntarle al asistente</a>
          </nav>
        </div>
        <aside className="run-source-card">
          <span>Respaldo verificado</span>
          <strong>{viewModel.source.snapshotLabel}</strong>
          <p>{viewModel.source.historicalRangeLabel}</p>
          <small>{viewModel.source.historicalNotice}</small>
        </aside>
      </section>

      <section className="run-current" id="payrollRunCurrentYear" aria-labelledby="current-year-title">
        <header>
          <div>
            <p className="run-eyebrow">Lectura más reciente disponible</p>
            <h2 id="current-year-title">{viewModel.currentYear.title}</h2>
          </div>
          <span>{viewModel.currentYear.throughLabel}</span>
        </header>
        <div className="run-current__grid">
          <article>
            <span>Corridas informadas</span>
            <strong>{viewModel.currentYear.runHeaders}</strong>
            <p>Cabeceras válidas observadas.</p>
          </article>
          <article data-status={viewModel.currentYear.allWithCalculation ? 'ok' : 'attention'}>
            <span>Con detalle de cálculo</span>
            <strong>{viewModel.currentYear.headersWithCalculation}</strong>
            <p>{viewModel.currentYear.allWithCalculation ? 'Todas las corridas observadas.' : 'Hay corridas sin detalle asociado.'}</p>
          </article>
          <article data-status={viewModel.currentYear.allWithCloseFlag ? 'ok' : 'attention'}>
            <span>Con marca informada</span>
            <strong>{viewModel.currentYear.headersWithCloseFlag}</strong>
            <p>{viewModel.currentYear.allWithCloseFlag ? 'Todas las corridas observadas.' : 'Hay corridas sin marca informada.'}</p>
          </article>
        </div>
      </section>

      <section className="run-panel" id="payrollRunTimeline" aria-labelledby="timeline-title">
        <header className="run-panel__heading">
          <div>
            <p className="run-eyebrow">Serie histórica gobernada</p>
            <h2 id="timeline-title">Corridas informadas por período</h2>
            <p>La fecha mostrada es el rango efectivo real de las cabeceras de cada período.</p>
          </div>
          <div className="run-window" role="group" aria-label="Ventana de tiempo">
            {WINDOW_OPTIONS.map(option => (
              <button
                type="button"
                key={option.label}
                aria-pressed={windowSize === option.value}
                onClick={() => setWindowSize(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>
        <div className="run-timeline" role="list" aria-label={`${visibleMonths.length} períodos de corridas`}>
          {visibleMonths.map(row => (
            <article className="run-month" role="listitem" key={row.period}>
              <div className="run-month__label">
                <strong>{row.periodLabel}</strong>
                <span>{row.dateRangeLabel}</span>
              </div>
              <div className="run-month__track" aria-label={`${row.runHeadersLabel} corridas`}>
                <i style={{ width: `${row.barWidthPct}%` }} />
              </div>
              <strong className="run-month__count">{row.runHeadersLabel}</strong>
              <span className="run-month__status" data-status={row.completeObservedControls ? 'ok' : 'attention'}>
                {row.completeObservedControls
                  ? 'Detalle y marca observados'
                  : `${row.headersWithoutCalculation} sin detalle · ${row.headersWithoutCloseFlag} sin marca`}
              </span>
              <small>{row.calculationRowsLabel} filas de cálculo</small>
            </article>
          ))}
        </div>
      </section>

      <section className="run-diagnostics" id="payrollRunReview" aria-label="Controles de cobertura y cuarentena">
        <article className="run-coverage">
          <header>
            <p className="run-eyebrow">Cobertura de la fuente</p>
            <h2>Qué pudo reconciliarse</h2>
          </header>
          <dl>
            <div><dt>Cabeceras válidas</dt><dd>{viewModel.coverage.validHeaders} <small>de {viewModel.coverage.sourceHeaders}</small></dd></div>
            <div><dt>Validez temporal</dt><dd>{viewModel.coverage.validRate}</dd></div>
            <div><dt>Válidas con cálculo</dt><dd>{viewModel.coverage.detailCoverage}</dd></div>
            <div><dt>Claves de cálculo enlazadas</dt><dd>{viewModel.coverage.calculationJoin}</dd></div>
            <div><dt>Períodos válidos</dt><dd>{viewModel.coverage.observedPeriods}</dd></div>
          </dl>
        </article>

        <article className="run-quarantine" data-status={viewModel.quarantine.attentionRequired ? 'attention' : 'ok'}>
          <header>
            <p className="run-eyebrow">Control temporal explícito</p>
            <h2>{viewModel.quarantine.runHeaders} corridas requieren saneamiento</h2>
            <p>
              Incluyen {viewModel.quarantine.calculationRows} filas de cálculo ({viewModel.quarantine.calculationRowRate} del total).
              No se mezclan con la serie válida.
            </p>
          </header>
          <div className="run-quarantine__split">
            <span><strong>{viewModel.quarantine.headersWithCalculation}</strong> con detalle asociado</span>
            <span><strong>{viewModel.quarantine.headersWithoutCalculation}</strong> sin detalle asociado</span>
          </div>
          <ul>
            {viewModel.quarantine.reasons.map(reason => (
              <li key={reason.code}><span>{reason.label}</span><strong>{reason.count}</strong></li>
            ))}
          </ul>
          <small>Los motivos no son excluyentes: una misma corrida puede activar más de un control.</small>
        </article>
      </section>

      <section className="run-log" aria-labelledby="technical-log-title">
        <div>
          <p className="run-eyebrow">Cobertura técnica adicional</p>
          <h2 id="technical-log-title">liquidacionlog, sin exponer mensajes ni personas</h2>
          <p>Sólo se informa su cobertura agregada. Un registro técnico no equivale a un error confirmado.</p>
        </div>
        <dl>
          <div><dt>Filas técnicas</dt><dd>{viewModel.logCoverage.sourceRows}</dd></div>
          <div><dt>Corridas observadas</dt><dd>{viewModel.logCoverage.runKeys}</dd></div>
          <div><dt>Corridas enlazadas</dt><dd>{viewModel.logCoverage.joinedRunKeys}</dd></div>
          <div><dt>Cobertura de enlace</dt><dd>{viewModel.logCoverage.joinCoverage}</dd></div>
          <div><dt>Fecha observada</dt><dd>{viewModel.logCoverage.observedDate}</dd></div>
        </dl>
      </section>

      <details className="run-technical">
        <summary>Fuente, privacidad y límites de lectura</summary>
        <dl>
          <div><dt>Archivo de origen</dt><dd>{viewModel.source.sourceFile}</dd></div>
          <div><dt>SHA-256</dt><dd><code>{viewModel.source.sourceSha256}</code></dd></div>
          <div><dt>Contrato generado</dt><dd>{viewModel.source.generatedLabel}</dd></div>
        </dl>
        <ul>{viewModel.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
      </details>
    </>
  );
}
