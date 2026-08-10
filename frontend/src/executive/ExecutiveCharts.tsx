import type {
  AnnualDomainViewModel,
  PayrollPointViewModel,
  PayrollSeriesViewModel,
  SectorRankingViewModel,
} from '../domain/executive-types';

const CHART_WIDTH = 820;
const CHART_HEIGHT = 300;
const CHART_LEFT = 28;
const CHART_RIGHT = 18;
const CHART_TOP = 24;
const CHART_BOTTOM = 52;

interface PositionedPoint {
  readonly point: PayrollPointViewModel;
  readonly index: number;
  readonly x: number;
  readonly y: number | null;
}

const ANNUAL_QUALIFIERS: Record<AnnualDomainViewModel['key'], string> = {
  absence: 'Eventos agregados: no es una tasa de ausentismo.',
  leave: 'Historia publicada: no prueba vigencia actual.',
  movements: 'Volumen agregado: no explica causa ni responsabilidad.',
};

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function positionPayrollPoints(points: readonly PayrollPointViewModel[]): readonly PositionedPoint[] {
  const values = points.flatMap(point => point.valueSourceUnits === null ? [] : [point.valueSourceUnits]);
  const minimum = values.length > 0 ? Math.min(...values) : 0;
  const maximum = values.length > 0 ? Math.max(...values) : 1;
  const baseSpan = maximum - minimum;
  const fallbackSpan = maximum === 0 ? 1 : Math.abs(maximum) * 0.08;
  const span = baseSpan === 0 ? fallbackSpan : baseSpan;
  const domainMinimum = baseSpan === 0 ? Math.max(0, minimum - span) : minimum;
  const domainMaximum = baseSpan === 0 ? maximum + span : maximum;
  const domainSpan = Math.max(domainMaximum - domainMinimum, 1);
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;

  return points.map((point, index) => {
    const x = points.length <= 1
      ? CHART_LEFT + plotWidth / 2
      : CHART_LEFT + index / (points.length - 1) * plotWidth;
    const y = point.valueSourceUnits === null
      ? null
      : CHART_TOP + (domainMaximum - point.valueSourceUnits) / domainSpan * plotHeight;
    return { point, index, x, y };
  });
}

function contiguousSegments(points: readonly PositionedPoint[]): readonly (readonly PositionedPoint[])[] {
  const segments: PositionedPoint[][] = [];
  let active: PositionedPoint[] = [];

  for (const point of points) {
    if (point.y === null) {
      if (active.length > 0) segments.push(active);
      active = [];
    } else {
      active.push(point);
    }
  }
  if (active.length > 0) segments.push(active);
  return segments;
}

function pathForSegment(points: readonly PositionedPoint[]): string {
  return points
    .filter((point): point is PositionedPoint & { y: number } => point.y !== null)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function labelIndexes(length: number): ReadonlySet<number> {
  if (length <= 7) return new Set(Array.from({ length }, (_, index) => index));
  const step = Math.ceil((length - 1) / 5);
  const indexes = new Set<number>([0, length - 1]);
  for (let index = step; index < length - 1; index += step) indexes.add(index);
  return indexes;
}

export function PayrollChart({ payroll }: { payroll: PayrollSeriesViewModel }) {
  const timelinePoints = payroll.points.filter(point => point.period !== null);
  const unknownProtectedPeriods = payroll.points.length - timelinePoints.length;
  const positioned = positionPayrollPoints(timelinePoints);
  const segments = contiguousSegments(positioned);
  const visibleLabels = labelIndexes(positioned.length);
  const publishedLabel = `${payroll.releasedPeriods} de ${payroll.totalPeriods} períodos publicables`;
  const latestStateLabel = payroll.latestPeriod === null
    ? 'Último valor no determinable'
    : payroll.latestStatus === 'released'
      ? 'Publicado'
      : 'Protegido';

  return (
    <figure
      className="executive-chart"
      data-executive-collection="payroll"
      aria-labelledby="payroll-chart-heading"
    >
      <div className="executive-chart__summary">
        <div>
          <span>Serie gobernada</span>
          <strong>{publishedLabel}</strong>
        </div>
        <div>
          <span>Último estado</span>
          <strong>{latestStateLabel}</strong>
        </div>
      </div>

      <div
        className="executive-chart__canvas"
        role="region"
        aria-label="Gráfico temporal desplazable del control de cálculo"
        tabIndex={0}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-labelledby="payroll-chart-title payroll-chart-description"
          preserveAspectRatio="xMidYMid meet"
        >
          <title id="payroll-chart-title">Línea temporal del control de cálculo</title>
          <desc id="payroll-chart-description">
            Los puntos publicados se unen solamente cuando son consecutivos en la serie. Los períodos protegidos aparecen como huecos y nunca como cero.
          </desc>
          <g className="executive-chart__grid" aria-hidden="true">
            {[0, 1, 2, 3].map(index => {
              const y = CHART_TOP + index / 3 * (CHART_HEIGHT - CHART_TOP - CHART_BOTTOM);
              return <line key={index} x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={y} y2={y} />;
            })}
          </g>
          <g className="executive-chart__protected">
            {positioned.filter(point => point.y === null).map(point => (
              <line
                key={`protected-${point.index}`}
                x1={point.x}
                x2={point.x}
                y1={CHART_TOP}
                y2={CHART_HEIGHT - CHART_BOTTOM}
              >
                <title>{point.point.periodLabel}: {point.point.valueLabel}</title>
              </line>
            ))}
          </g>
          <g className="executive-chart__series">
            {segments.filter(segment => segment.length > 1).map((segment, index) => (
              <path key={index} d={pathForSegment(segment)} />
            ))}
            {positioned.filter(point => point.y !== null && visibleLabels.has(point.index)).map(point => (
              <circle key={`point-${point.index}`} cx={point.x} cy={point.y ?? 0} r="5">
                <title>{point.point.periodLabel}: {point.point.valueLabel}</title>
              </circle>
            ))}
          </g>
          <g className="executive-chart__axis" aria-hidden="true">
            {positioned.filter(point => visibleLabels.has(point.index)).map(point => (
              <text key={`label-${point.index}`} x={point.x} y={CHART_HEIGHT - 18} textAnchor="middle">
                {point.point.periodLabel}
              </text>
            ))}
          </g>
        </svg>
      </div>

      <div className="executive-chart__legend" aria-hidden="true">
        <span><i className="executive-chart__legend-line" />Valor publicado</span>
        <span><i className="executive-chart__legend-gap" />Período protegido</span>
      </div>
      <figcaption id="payroll-chart-heading">{payroll.warning}</figcaption>
      {unknownProtectedPeriods > 0 ? (
        <p className="executive-chart__unknown">
          {unknownProtectedPeriods} período(s) protegido(s) no declaran fecha y quedan fuera del eje; por eso el último valor no puede determinarse.
        </p>
      ) : null}
      <details className="executive-text-alternative">
        <summary>Ver alternativa textual por período declarado</summary>
        <div className="executive-table-region" tabIndex={0} role="region" aria-label="Serie del control de cálculo en tabla">
          <table>
            <thead>
              <tr>
                <th scope="col">Período</th>
                <th scope="col">Control</th>
                <th scope="col">Participantes</th>
                <th scope="col">Variación</th>
              </tr>
            </thead>
            <tbody>
              {timelinePoints.map((point, index) => (
                <tr key={`${point.periodLabel}-${index}`}>
                  <th scope="row">{point.periodLabel}</th>
                  <td>{point.valueLabel}</td>
                  <td>{point.participantDisplay}</td>
                  <td>{point.changeLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function SectorChart({ sector }: { sector: SectorRankingViewModel }) {
  return (
    <figure
      className="executive-sector"
      data-executive-collection="sector"
      aria-labelledby="sector-chart-title"
    >
      <div className="executive-sector__summary">
        <div>
          <span>Universo del ranking</span>
          <strong>{sector.totalLabel}</strong>
        </div>
        <div>
          <span>Detalle individual publicable</span>
          <strong>{sector.individuallyPublishedCoverageLabel}</strong>
        </div>
      </div>
      <ol className="executive-sector__list" aria-label="Participación publicada por sector">
        {sector.rows.map((row, index) => (
          <li
            key={`${row.label}-${index}`}
            data-privacy={row.privacyStatus === 'released' ? 'released' : 'protected'}
          >
            <div className="executive-sector__heading">
              <strong>{row.label}</strong>
              <span>{row.shareLabel}</span>
            </div>
            <div className="executive-sector__track" aria-hidden="true">
              <span style={{ width: `${clampPercentage(row.sharePct)}%` }} />
            </div>
            <p>{row.participantDisplay} participantes</p>
          </li>
        ))}
      </ol>
      <figcaption id="sector-chart-title">{sector.note}</figcaption>
    </figure>
  );
}

export function AnnualCollection({ domain }: { domain: AnnualDomainViewModel }) {
  return (
    <article
      className="executive-annual-card"
      data-executive-collection={domain.key}
      aria-labelledby={`annual-${domain.key}-title`}
    >
      <header>
        <div>
          <p>Fuente <code>{domain.sourceTable}</code></p>
          <h3 id={`annual-${domain.key}-title`}>{domain.label}</h3>
        </div>
        <span>{domain.releasedPeriods} períodos publicados</span>
      </header>
      <ul
        className="executive-annual-card__values"
        aria-label={`Serie anual desplazable de ${domain.label}`}
        tabIndex={0}
      >
        {domain.points.map((point, index) => (
          <li key={`${point.periodLabel}-${index}`} data-privacy={point.privacyStatus}>
            <span>{point.periodLabel}</span>
            <strong>{point.valueLabel}</strong>
            <small>{point.participantDisplay} participantes</small>
          </li>
        ))}
      </ul>
      <p className="executive-annual-card__qualifier">{ANNUAL_QUALIFIERS[domain.key]}</p>
      <p className="executive-annual-card__note">{domain.note}</p>
    </article>
  );
}
