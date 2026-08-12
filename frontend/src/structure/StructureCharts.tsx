import { useId, useState, type CSSProperties } from 'react';

import type {
  ActivityDomainViewModel,
  MatrixViewModel,
  RegistryRankingViewModel,
  WorkforceRankingViewModel,
} from '../domain/organization-analytics-types';

const DEFAULT_VISIBLE_ROWS = 6;

interface ExpandableBarsProps {
  readonly collection: string;
  readonly denominatorLabel: string;
  readonly rows: readonly {
    key: string;
    label: string;
    value: number;
    valueLabel: string;
    sharePct: number;
    shareLabel: string;
    protected: boolean;
  }[];
}

function ExpandableBars({ collection, denominatorLabel, rows }: ExpandableBarsProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE_ROWS);
  const hiddenCount = Math.max(0, rows.length - DEFAULT_VISIBLE_ROWS);

  return (
    <div className="structure-bars" data-testid={`${collection}-bars`}>
      <p className="structure-denominator">Base: {denominatorLabel}</p>
      <ol className="structure-bars__list">
        {visibleRows.map(row => (
          <li
            className="structure-bar"
            data-protected={row.protected ? 'true' : 'false'}
            key={row.key}
          >
            <div className="structure-bar__heading">
              <span title={row.label}>{row.label}</span>
              <strong>{row.valueLabel} · {row.shareLabel}</strong>
            </div>
            <div
              className="structure-bar__track"
              role="meter"
              aria-label={`${row.label}: ${row.valueLabel}, ${row.shareLabel}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.sharePct}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, row.sharePct))}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {hiddenCount > 0 ? (
        <button
          className="structure-disclosure"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          data-testid={`${collection}-toggle`}
        >
          {expanded ? 'Ver principales' : `Ver ${hiddenCount} categorías más`}
        </button>
      ) : null}
    </div>
  );
}

export function WorkforceBars({ ranking }: { readonly ranking: WorkforceRankingViewModel }) {
  return (
    <ExpandableBars
      collection={`workforce-${ranking.key}`}
      denominatorLabel={ranking.denominatorLabel}
      rows={ranking.rows.map(row => ({
        key: row.key,
        label: row.label,
        value: row.participants,
        valueLabel: `${row.participantLabel} participantes`,
        sharePct: row.sharePct,
        shareLabel: row.shareLabel,
        protected: row.privacyStatus === 'protected_aggregate',
      }))}
    />
  );
}

export function RegistryBars({ registry }: { readonly registry: RegistryRankingViewModel }) {
  return (
    <ExpandableBars
      collection={`registry-${registry.key}`}
      denominatorLabel={registry.denominatorLabel}
      rows={registry.rows.map(row => ({
        key: row.key,
        label: row.label,
        value: row.registeredRecords,
        valueLabel: `${row.registeredLabel} registros`,
        sharePct: row.sharePct,
        shareLabel: row.shareLabel,
        protected: row.privacyStatus !== 'released',
      }))}
    />
  );
}

function heightPercentage(value: number | null, maximum: number): number {
  if (value === null || maximum <= 0) return 0;
  return Math.max(3, value / maximum * 100);
}

interface ActivityPlotProps {
  readonly domain: ActivityDomainViewModel;
  readonly metric: 'events' | 'participants';
}

function ActivityPlot({ domain, metric }: ActivityPlotProps) {
  const isEvents = metric === 'events';
  const label = isEvents ? 'Eventos válidos' : 'Participantes distintos';
  const maximum = isEvents ? domain.maxEvents : domain.maxParticipants;
  return (
    <div className="activity-plot" aria-label={`${label} por año`}>
      <div className="activity-plot__heading">
        <strong>{label}</strong>
        <span>Escala 0–{maximum.toLocaleString('es-AR')}</span>
      </div>
      <ol
        className="activity-plot__series"
        style={{ '--activity-points': Math.max(domain.points.length, 1) } as CSSProperties}
      >
        {domain.points.map(point => {
          const value = isEvents ? point.events : point.participants;
          const valueLabel = isEvents ? point.eventLabel : point.participantLabel;
          return (
            <li
              className="activity-point"
              data-protected={point.privacyStatus === 'suppressed' ? 'true' : 'false'}
              key={`${metric}-${point.key}`}
              aria-label={`${point.periodLabel}: ${valueLabel} ${isEvents ? 'eventos' : 'participantes'}`}
            >
              <span className="activity-point__value">{valueLabel}</span>
              <span className="activity-point__well" aria-hidden="true">
                <i style={{ height: `${heightPercentage(value, maximum)}%` }} />
              </span>
              <span className="activity-point__period">{point.periodLabel}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ActivityTimeline({ domain }: { readonly domain: ActivityDomainViewModel }) {
  const descriptionId = useId();
  return (
    <figure
      className="activity-chart"
      data-testid={`activity-${domain.key}`}
      aria-describedby={descriptionId}
    >
      <div
        className="activity-chart__scroll"
        role="region"
        aria-label={`${domain.label}: series desplazables`}
        tabIndex={0}
      >
        <ActivityPlot domain={domain} metric="events" />
        <ActivityPlot domain={domain} metric="participants" />
      </div>
      <figcaption id={descriptionId}>
        {domain.releasedPeriods} períodos publicados
        {domain.protectedPeriods > 0 ? ` · ${domain.protectedPeriods} protegido(s)` : ''}. {domain.note}
      </figcaption>
    </figure>
  );
}

export function MatrixHeatmap({ matrix }: { readonly matrix: MatrixViewModel }) {
  const columnCount = matrix.columns.length + 1;
  const cellMap = new Map(matrix.cells.map(cell => [
    `${cell.organizationCode}:${cell.sectorCode}`,
    cell,
  ]));
  return (
    <div
      className="structure-heatmap-scroll"
      role="region"
      aria-label="Cruce de registros por organización y sector"
      tabIndex={0}
      data-testid="organization-sector-heatmap"
    >
      <div
        className="structure-heatmap"
        style={{ gridTemplateColumns: `minmax(9rem, 1.45fr) repeat(${columnCount - 1}, minmax(5.25rem, 1fr))` }}
      >
        <span className="structure-heatmap__corner">Organización / sector</span>
        {matrix.columns.map(column => (
          <span className="structure-heatmap__column" key={`column-${column.code}`} title={column.label}>
            {column.label}
          </span>
        ))}
        {matrix.rows.flatMap(row => [
          <span className="structure-heatmap__row" key={`row-${row.code}`} title={row.label}>{row.label}</span>,
          ...matrix.columns.map(column => {
            const cell = cellMap.get(`${row.code}:${column.code}`);
            if (!cell) return null;
            return (
              <span
                className="structure-heatmap__cell"
                data-level={cell.level}
                data-privacy={cell.privacyStatus}
                key={cell.key}
                aria-label={cell.accessibleLabel}
                title={cell.accessibleLabel}
              >
                {cell.display}
              </span>
            );
          }),
        ])}
      </div>
    </div>
  );
}

export function ExplorerCrossBreakdown({
  code,
  dimension,
  matrix,
}: {
  readonly code: number;
  readonly dimension: RegistryRankingViewModel['key'];
  readonly matrix: MatrixViewModel;
}) {
  const axis = dimension === 'organization' ? matrix.rows : matrix.columns;
  const selectedAxis = axis.find(item => item.code === code);
  if (!selectedAxis) {
    return (
      <p className="structure-explorer__empty" data-testid="organization-explorer-cross-unavailable">
        <strong>Sin cruce publicado.</strong> Esta categoría no integra los ejes acotados; eso no equivale a cero registros.
      </p>
    );
  }

  const labels = new Map(
    (dimension === 'organization' ? matrix.columns : matrix.rows).map(item => [item.code, item.label]),
  );
  const cells = matrix.cells
    .filter(cell => dimension === 'organization'
      ? cell.organizationCode === code
      : cell.sectorCode === code)
    .map(cell => ({
      ...cell,
      label: labels.get(dimension === 'organization' ? cell.sectorCode : cell.organizationCode) ?? 'Categoría',
    }));
  const maximum = Math.max(0, ...cells
    .filter(cell => cell.privacyStatus === 'released')
    .map(cell => cell.registeredRecords ?? 0));

  return (
    <ol
      className="structure-explorer__cross"
      aria-label={dimension === 'organization'
        ? 'Sectores informados publicados para la organización informada'
        : 'Organizaciones informadas publicadas para el sector informado'}
      data-testid="organization-explorer-cross"
    >
      {cells.map(cell => {
        const released = cell.privacyStatus === 'released' && cell.registeredRecords !== null;
        const notObserved = cell.privacyStatus === 'not_observed';
        const width = released && maximum > 0 ? cell.registeredRecords! / maximum * 100 : 0;
        return (
          <li
            key={cell.key}
            data-protected={!released && !notObserved ? 'true' : 'false'}
            data-status={cell.privacyStatus}
          >
            <div className="structure-explorer__cross-heading">
              <span title={cell.label}>{cell.label}</span>
              <strong>{cell.display}</strong>
            </div>
            {released ? (
              <div
                className="structure-explorer__cross-track"
                role="meter"
                aria-label={`${cell.label}: ${cell.display} registros`}
                aria-valuemin={0}
                aria-valuemax={maximum}
                aria-valuenow={cell.registeredRecords ?? 0}
              >
                <span style={{ width: `${Math.max(0, Math.min(100, width))}%` }} />
              </div>
            ) : notObserved ? (
              <span className="structure-explorer__not-observed">Sin observación en este cruce.</span>
            ) : (
              <span className="structure-explorer__protected">Dato protegido; no se interpreta como cero.</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
