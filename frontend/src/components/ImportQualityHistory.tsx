import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { AUTH_TIMEOUT_MS } from '../auth/session';
import {
  buildImportQualityHistoryViewModel,
  fetchImportQualityHistory,
} from '../domain/import-quality-history';
import type { ImportQualityHistoryViewModel } from '../domain/import-quality-history-types';

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly viewModel: ImportQualityHistoryViewModel };

function AnnualHistoryChart({ viewModel }: { readonly viewModel: ImportQualityHistoryViewModel }) {
  const descriptionId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const region = scrollRef.current;
    if (!region) return;
    region.scrollLeft = region.scrollWidth;
  }, [viewModel]);

  return (
    <figure className="import-history-chart" aria-describedby={descriptionId}>
      <div className="import-history-chart__heading">
        <div>
          <h3>Evolución anual</h3>
          <p>Lotes que registraron observaciones durante cada año.</p>
        </div>
        <span>Escala desde cero</span>
      </div>
      <div
        ref={scrollRef}
        className="import-history-chart__scroll"
        role="region"
        aria-label="Evolución anual desplazable, abierta en los años más recientes; usá las flechas izquierda y derecha"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.currentTarget.scrollBy({
            left: event.key === 'ArrowRight' ? 240 : -240,
            behavior: 'auto',
          });
        }}
      >
        <ol className="import-history-chart__plot">
          {viewModel.annual.map(point => (
            <li key={point.year} data-partial={point.partial ? 'true' : 'false'}>
              <span className="import-history-chart__value" title={point.incidentsLabel}>{point.compactIncidentsLabel}</span>
              <span
                className="import-history-chart__well"
                role="img"
                aria-label={point.accessibleLabel}
                title={point.accessibleLabel}
              >
                <i style={{ height: `${Math.max(2, point.relativeHeightPct)}%` }} />
              </span>
              <time dateTime={String(point.year)} title={point.yearLabel}>{point.shortYearLabel}</time>
              <small>{point.importRunsLabel}</small>
            </li>
          ))}
        </ol>
      </div>
      <figcaption id={descriptionId}>{viewModel.detailNote}</figcaption>
    </figure>
  );
}

function CategoryRanking({ viewModel }: { readonly viewModel: ImportQualityHistoryViewModel }) {
  return (
    <figure className="import-history-ranking" aria-labelledby="import-history-ranking-title">
      <div className="import-history-ranking__heading">
        <div>
          <h3 id="import-history-ranking-title">Motivos más frecuentes</h3>
          <p>Ordenados por cantidad dentro del respaldo histórico.</p>
        </div>
        <span>{viewModel.classificationLabel}</span>
      </div>
      <ol className="import-history-ranking__list">
        {viewModel.categories.map(category => (
          <li key={category.key}>
            <div className="import-history-ranking__label">
              <div>
                <strong>{category.label}</strong>
                <small>{category.meaning}</small>
              </div>
              <span>{category.incidentsLabel} · {category.shareLabel}</span>
            </div>
            <div
              className="import-history-ranking__track"
              role="meter"
              aria-label={category.accessibleLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={category.sharePct}
            >
              <i style={{ width: `${Math.max(1, category.relativeWidthPct)}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function HistoryContent({ viewModel }: { readonly viewModel: ImportQualityHistoryViewModel }) {
  return (
    <>
      <header className="import-history__header">
        <div>
          <p className="panel__eyebrow">Historial de cargas GRH</p>
          <h2 id="import-history-title">{viewModel.headline}</h2>
          <p>{viewModel.description}</p>
        </div>
        <span>{viewModel.cutLabel}</span>
      </header>

      <div className="import-history__body">
        <dl className="import-history__kpis" aria-label="Resumen del historial de cargas">
          <div>
            <dt>Observaciones registradas</dt>
            <dd>{viewModel.totalIncidentsLabel}</dd>
            <small>En todo el período disponible</small>
          </div>
          <div>
            <dt>Lotes con observaciones</dt>
            <dd>{viewModel.totalRunsLabel}</dd>
            <small>{viewModel.dateRangeLabel}</small>
          </div>
          <div>
            <dt>{viewModel.currentYearLabel}</dt>
            <dd>{viewModel.currentIncidentsLabel}</dd>
            <small>{viewModel.currentRunsLabel}</small>
          </div>
        </dl>

        <p className="import-history__scope" role="note">{viewModel.scopeNote}</p>

        <div className="import-history__visuals">
          <AnnualHistoryChart viewModel={viewModel} />
          <CategoryRanking viewModel={viewModel} />
        </div>

        <details className="import-history__details">
          <summary>Ver alcance y límites de la lectura</summary>
          <div>
            <p>{viewModel.detailNote}</p>
            {viewModel.limits.length > 0 ? (
              <ul>{viewModel.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
            ) : null}
          </div>
        </details>
      </div>
    </>
  );
}

export function ImportQualityHistory() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setState({ status: 'loading' });

    void fetchImportQualityHistory({ timeoutMs: AUTH_TIMEOUT_MS, signal: controller.signal })
      .then(contract => {
        if (!current) return;
        setState({ status: 'ready', viewModel: buildImportQualityHistoryViewModel(contract) });
      })
      .catch(() => {
        if (!current || controller.signal.aborted) return;
        setState({ status: 'error' });
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);

  return (
    <section
      className="import-history"
      aria-labelledby="import-history-title"
      data-testid="import-quality-history"
    >
      {state.status === 'loading' ? (
        <div className="import-history__state" role="status" aria-live="polite" aria-busy="true" data-testid="import-quality-history-loading">
          <span aria-hidden="true" />
          <div>
            <h2 id="import-history-title">Preparando el historial de cargas</h2>
            <p>El resto de Calidad de datos permanece disponible mientras validamos esta sección.</p>
          </div>
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="import-history__state" role="alert" data-testid="import-quality-history-error">
          <div>
            <h2 id="import-history-title">El historial de cargas no está disponible</h2>
            <p>Los demás controles de esta pantalla siguen funcionando. Podés reintentar sólo esta sección.</p>
          </div>
          <button className="button" type="button" onClick={retry} data-testid="import-quality-history-retry">
            Reintentar historial
          </button>
        </div>
      ) : null}
      {state.status === 'ready' ? <HistoryContent viewModel={state.viewModel} /> : null}
    </section>
  );
}
