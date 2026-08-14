import { useState } from 'react';

import type { ManagementTimelineViewModel } from './management-timeline-types';

function DecisionCard({
  decision,
}: { readonly decision: ManagementTimelineViewModel['decisions'][number] }) {
  return (
    <article className="timeline-decision" data-tone={decision.tone}>
      <header>
        <span>{decision.priorityLabel}</span>
        <h3>{decision.whatHappened}</h3>
      </header>
      <dl>
        <div>
          <dt>Por qué importa</dt>
          <dd>{decision.whyItMatters}</dd>
        </div>
        <div>
          <dt>Qué hacer</dt>
          <dd>{decision.whatToDo}</dd>
        </div>
      </dl>
      <div className="timeline-decision__actions">
        <a className="timeline-button timeline-button--primary" href={decision.actionHref}>
          {decision.actionLabel}
        </a>
        <a className="timeline-button" href={decision.assistantHref}>
          Preguntar a MuniGuía
        </a>
      </div>
      <details>
        <summary>{decision.detailLabel}</summary>
        <ul>{decision.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
      </details>
    </article>
  );
}

export function ManagementTimelineDashboard({
  viewModel,
}: { readonly viewModel: ManagementTimelineViewModel }) {
  const [selectedYearKey, setSelectedYearKey] = useState(viewModel.comparison.defaultYearKey);
  const selectedYear = viewModel.comparison.years.find(year => year.key === selectedYearKey) ??
    viewModel.comparison.years[0];

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Comparación gobernada de gestiones disponible.
      </p>

      <section className="timeline-hero" id="managementTimeline" aria-labelledby="management-timeline-title">
        <div>
          <p className="timeline-eyebrow">Centro de decisión al corte</p>
          <h1 id="management-timeline-title">Compará gestiones sin perder el contexto</h1>
          <p>
            Una lectura ejecutiva de tramos equivalentes: primero qué requiere atención,
            después la evidencia y, sólo si la necesitás, la metodología completa.
          </p>
        </div>
        <aside className="timeline-source" aria-label="Fuente y corte de la comparación">
          <span>Copia verificada</span>
          <strong>{viewModel.source.snapshotLabel}</strong>
          <p>{viewModel.source.canonicalSystem}</p>
          <small>{viewModel.source.notice}</small>
        </aside>
      </section>

      <section
        className="timeline-decisions"
        id="managementTimelineDecision"
        aria-labelledby="management-timeline-decision-title"
      >
        <header className="timeline-section-heading">
          <div>
            <p className="timeline-eyebrow">Tres asuntos como máximo</p>
            <h2 id="management-timeline-decision-title">Qué mirar y qué hacer ahora</h2>
          </div>
          <span>Lectura ejecutiva gobernada</span>
        </header>
        <div className="timeline-decisions__grid" role="list">
          {viewModel.decisions.map(decision => (
            <div key={decision.code} role="listitem">
              <DecisionCard decision={decision} />
            </div>
          ))}
        </div>
      </section>

      <section
        className="timeline-comparison"
        id="managementTimelineComparison"
        aria-labelledby="management-timeline-comparison-title"
      >
        <header className="timeline-section-heading timeline-section-heading--comparison">
          <div>
            <p className="timeline-eyebrow">Cuatro años × cuatro dominios</p>
            <h2 id="management-timeline-comparison-title">{viewModel.comparison.title}</h2>
            <p>{viewModel.comparison.description}</p>
          </div>
          <span>{viewModel.comparison.equalWindowLabel}</span>
        </header>

        <div className="timeline-year-selector" aria-label="Elegir año de gestión">
          {viewModel.comparison.years.map(year => (
            <button
              key={year.key}
              type="button"
              data-tone={year.tone}
              aria-pressed={year.key === selectedYear.key}
              onClick={() => setSelectedYearKey(year.key)}
            >
              <span>Año {year.ordinal}</span>
              <strong>{year.label}</strong>
              <small>{year.statusLabel}</small>
            </button>
          ))}
        </div>

        <div className="timeline-window-labels" aria-label="Ventanas observadas para el año elegido">
          <div>
            <span>Actual</span>
            <strong>{viewModel.comparison.currentLabel}</strong>
            <small>{selectedYear.currentRangeLabel}</small>
          </div>
          <div>
            <span>Anterior</span>
            <strong>{viewModel.comparison.priorLabel}</strong>
            <small>{selectedYear.priorRangeLabel}</small>
          </div>
        </div>

        <div
          className="timeline-table-region"
          role="region"
          aria-label={`Matriz comparativa del año ${selectedYear.ordinal}`}
          aria-live="polite"
          tabIndex={0}
        >
          <table aria-describedby="management-timeline-reading-note">
            <caption className="sr-only">{selectedYear.accessibleSummary}</caption>
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">{viewModel.comparison.currentLabel}</th>
                <th scope="col">{viewModel.comparison.priorLabel}</th>
                <th scope="col">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {selectedYear.rows.map(row => (
                <tr key={row.code} data-tone={row.tone}>
                  <th scope="row">
                    <strong>{row.label}</strong>
                    <small>{row.explanation}</small>
                  </th>
                  <td data-label={viewModel.comparison.currentLabel}>{row.currentLabel}</td>
                  <td data-label={viewModel.comparison.priorLabel}>{row.priorLabel}</td>
                  <td data-label="Diferencia"><strong>{row.differenceLabel}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="timeline-context-only" aria-label="Contexto adicional no comparable">
          <div>
            <span>Sólo contexto</span>
            <strong>{selectedYear.contextOnlyLabel}</strong>
            <p>{selectedYear.contextOnlyDescription}</p>
          </div>
          <dl>
            <div><dt>{viewModel.comparison.currentLabel}</dt><dd>{selectedYear.contextOnlyCurrentLabel}</dd></div>
            <div><dt>{viewModel.comparison.priorLabel}</dt><dd>{selectedYear.contextOnlyPriorLabel}</dd></div>
          </dl>
        </aside>
        <p className="timeline-reading-note" id="management-timeline-reading-note" role="note">
          {viewModel.comparison.interpretation}
        </p>
      </section>

      <details className="timeline-technical" id="managementTimelineMethodology">
        <summary>Fuente, metodología y límites de lectura</summary>
        <div className="timeline-technical__content">
          <dl>
            {viewModel.methodology.map(item => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
            ))}
            <div><dt>Archivo de origen</dt><dd>{viewModel.source.sourceFile}</dd></div>
            <div><dt>SHA-256</dt><dd><code>{viewModel.source.sourceSha256}</code></dd></div>
            <div><dt>Contrato generado</dt><dd>{viewModel.source.generatedLabel}</dd></div>
          </dl>
          <ul>{viewModel.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
        </div>
      </details>
    </>
  );
}
