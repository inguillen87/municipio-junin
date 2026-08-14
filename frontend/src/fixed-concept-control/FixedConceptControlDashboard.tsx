import type { FixedConceptControlViewModel } from './fixed-concept-control-types';

export function FixedConceptControlDashboard({
  viewModel,
}: { readonly viewModel: FixedConceptControlViewModel }) {
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Control agregado de conceptos fijos disponible.
      </p>

      <section className="fixed-hero" id="fixedConceptControl" aria-labelledby="fixed-concept-title">
        <div className="fixed-hero__copy">
          <p className="fixed-eyebrow">Nómina · control explicable</p>
          <h1 id="fixed-concept-title">Conceptos fijos y cálculo, en una sola lectura</h1>
          <p>
            Compara qué conceptos estaban vigentes por sus fechas con lo observado en el cálculo del período.
            Es una señal para revisar: no confirma autorización, importe, pago ni vínculo laboral activo.
          </p>
          <nav aria-label="Acciones relacionadas">
            <a href="#fixedConceptReconciliation">Ver los tres estados</a>
            <a href="/ia?question=%C2%BFQu%C3%A9%20conceptos%20fijos%20elegibles%20aparecen%20en%20el%20c%C3%A1lculo%20disponible%3F">
              Preguntarle al asistente
            </a>
          </nav>
        </div>
        <aside className="fixed-source-card" aria-label="Fuente del control">
          <span>Copia verificada</span>
          <strong>{viewModel.source.snapshotLabel}</strong>
          <p>{viewModel.source.canonicalSystem}</p>
          <small>{viewModel.source.notice}</small>
        </aside>
      </section>

      <section
        className="fixed-reconciliation"
        id="fixedConceptReconciliation"
        aria-labelledby="fixed-reconciliation-title"
      >
        <header className="fixed-section-heading">
          <div>
            <p className="fixed-eyebrow">Resultado principal · {viewModel.reconciliation.periodLabel}</p>
            <h2 id="fixed-reconciliation-title">¿Qué pasó con las filas elegibles?</h2>
            <p>
              Elegibilidad al {viewModel.reconciliation.anchorLabel}. Cada fila queda en un único estado.
            </p>
          </div>
        </header>

        <div
          className="fixed-state-bar"
          role="img"
          aria-label={viewModel.reconciliation.accessibleSummary}
        >
          {viewModel.reconciliation.states.map(state => (
            <span
              key={state.code}
              data-tone={state.tone}
              style={{ flexBasis: `${state.widthPct}%` }}
              title={`${state.label}: ${state.rowsLabel}`}
            />
          ))}
        </div>
        <dl className="fixed-summary-metrics" aria-label="Universo de conciliación">
          <div><dt>Filas elegibles</dt><dd>{viewModel.reconciliation.eligibleRowsLabel}</dd></div>
          <div><dt>Personas</dt><dd>{viewModel.reconciliation.eligiblePeopleLabel}</dd></div>
          <div><dt>Coincidencia exacta</dt><dd>{viewModel.reconciliation.exactObservationRateLabel}</dd></div>
        </dl>

        <div className="fixed-state-list" role="list" aria-label="Detalle de estados de conciliación">
          {viewModel.reconciliation.states.map(state => (
            <article className="fixed-state" data-tone={state.tone} key={state.code} role="listitem">
              <span className="fixed-state__marker" aria-hidden="true" />
              <div>
                <h3>{state.label}</h3>
                <p>{state.explanation}</p>
              </div>
              <strong>{state.rowsLabel}<small> filas</small></strong>
              <span>{state.peopleLabel} personas</span>
            </article>
          ))}
        </div>
        <p className="fixed-reading-note" role="note">
          “No observado” indica revisión pendiente. No demuestra error, baja, deuda ni incumplimiento.
        </p>
      </section>

      <section className="fixed-snapshot" id="fixedConceptSnapshot" aria-labelledby="fixed-snapshot-title">
        <header className="fixed-section-heading">
          <div>
            <p className="fixed-eyebrow">Foto al {viewModel.snapshot.asOfLabel}</p>
            <h2 id="fixed-snapshot-title">Cómo está documentado el padrón de fijos</h2>
            <p>Resumen agregado del corte; las categorías pequeñas permanecen protegidas.</p>
          </div>
          <span className="fixed-category-badge">{viewModel.snapshot.categorySummary}</span>
        </header>

        <div className="fixed-snapshot__grid">
          <article><span>Filas elegibles</span><strong>{viewModel.snapshot.eligibleRowsLabel}</strong><small>{viewModel.snapshot.eligiblePeopleLabel} personas</small></article>
          <article><span>Estado informado</span><strong>{viewModel.snapshot.stateReportedLabel}</strong><small>{viewModel.snapshot.missingStateLabel} sin estado</small></article>
          <article><span>Tipo de movimiento</span><strong>{viewModel.snapshot.movementTypeLabel}</strong><small>filas con dato informado</small></article>
          <article data-attention="true"><span>Instrumento legal</span><strong>{viewModel.snapshot.legalInstrumentLabel}</strong><small>filas con dato informado</small></article>
          <article><span>Conceptos observados</span><strong>{viewModel.snapshot.conceptsObservedLabel}</strong><small>categorías fuente</small></article>
        </div>

        <div className="fixed-categories" role="list" aria-label="Categorías publicadas del corte">
          {viewModel.snapshot.categories.map(category => (
            <article key={category.label} role="listitem" data-protected={category.protected ? 'true' : 'false'}>
              <div>
                <strong>{category.label}</strong>
                <span>{category.protected ? 'Agrupación protegida' : 'Categoría liberada'}</span>
              </div>
              <p><strong>{category.rowsLabel}</strong> filas · {category.peopleLabel} personas</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="fixed-comparison"
        id="fixedConceptComparison"
        aria-labelledby="fixed-comparison-title"
      >
        <header className="fixed-section-heading">
          <div>
            <p className="fixed-eyebrow">Mismo tiempo para ambos tramos</p>
            <h2 id="fixed-comparison-title">Comparación descriptiva entre administraciones</h2>
            <p>Se comparan altas informadas de conceptos fijos en ventanas exactamente iguales.</p>
          </div>
          <span className="fixed-comparison__badge">No evalúa gestiones</span>
        </header>

        <div className="fixed-comparison__grid">
          {viewModel.comparison.windows.map(window => (
            <article key={window.code} data-window={window.code}>
              <header>
                <div><span>{window.daysLabel}</span><h3>{window.label}</h3></div>
                <small>{window.dateRangeLabel}</small>
              </header>
              <dl>
                <div><dt>Altas de concepto informadas</dt><dd>{window.startRowsLabel}</dd></div>
                <div><dt>Personas distintas</dt><dd>{window.peopleLabel}</dd></div>
                <div><dt>Conceptos</dt><dd>{window.conceptsLabel}</dd></div>
                <div><dt>Estado informado</dt><dd>{window.stateCoverageLabel}</dd></div>
                <div><dt>Tipo de movimiento</dt><dd>{window.movementCoverageLabel}</dd></div>
                <div><dt>Instrumento legal informado</dt><dd>{window.legalInstrumentRowsLabel}</dd></div>
              </dl>
            </article>
          ))}
          <aside aria-label="Diferencia descriptiva entre ventanas">
            <span>Diferencia entre ventanas</span>
            <strong>{viewModel.comparison.differenceRowsLabel}<small> filas</small></strong>
            <strong>{viewModel.comparison.differencePeopleLabel}<small> personas</small></strong>
          </aside>
        </div>
        <p className="fixed-reading-note" role="note">{viewModel.comparison.interpretation}</p>
      </section>

      <section className="fixed-quality" id="fixedConceptQuality" aria-labelledby="fixed-quality-title">
        <header className="fixed-section-heading">
          <div>
            <p className="fixed-eyebrow">Calidad antes de decidir</p>
            <h2 id="fixed-quality-title">Qué se puede usar y qué requiere saneamiento</h2>
          </div>
          <span className="fixed-quality__status">{viewModel.quality.statusLabel}</span>
        </header>

        <div className="fixed-quality__layout">
          <article className="fixed-coverage">
            <h3>Cobertura de la fuente</h3>
            <dl>
              <div><dt>Filas fuente</dt><dd>{viewModel.coverage.sourceRowsLabel}</dd></div>
              <div><dt>Rangos válidos</dt><dd>{viewModel.coverage.validRangeRowsLabel} <small>({viewModel.coverage.validRangeRateLabel})</small></dd></div>
              <div><dt>Vencimiento anterior al alta</dt><dd>{viewModel.coverage.endBeforeStartRowsLabel}</dd></div>
              <div><dt>Vencimiento faltante</dt><dd>{viewModel.coverage.missingEndRowsLabel}</dd></div>
              <div><dt>Enlace con legajo</dt><dd>{viewModel.coverage.legajoJoinCoverageLabel}</dd></div>
              <div><dt>Enlace con catálogo</dt><dd>{viewModel.coverage.catalogCoverageLabel}</dd></div>
            </dl>
          </article>

          <div className="fixed-signals" role="list" aria-label="Señales de calidad">
            {viewModel.quality.signals.map(signal => (
              <article key={signal.code} role="listitem" data-severity={signal.severity}>
                <header><span>{signal.severityLabel}</span><strong>{signal.rowsLabel} filas · {signal.rateLabel}</strong></header>
                <h3>{signal.label}</h3>
                <p>{signal.meaning}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <details className="fixed-technical">
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
