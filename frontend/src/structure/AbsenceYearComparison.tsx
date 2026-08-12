import { useMemo, useState } from 'react';

import type {
  ActivityDomainViewModel,
  ActivityPointViewModel,
} from '../domain/organization-analytics-types';

const integerFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const signedIntegerFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
  signDisplay: 'always',
});
const signedDecimalFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});
const signedPercentageFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
  style: 'percent',
});
const SHORT_MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

interface AbsenceYearComparisonProps {
  readonly domain: ActivityDomainViewModel;
  readonly snapshotAsOf: string;
}

interface ComparisonMetric {
  readonly key: 'events' | 'participants' | 'intensity';
  readonly label: string;
  readonly description: string;
  readonly fromValue: number;
  readonly toValue: number;
  readonly format: (value: number) => string;
  readonly formatDelta: (value: number) => string;
}

function pointYear(point: ActivityPointViewModel): number | null {
  if (!point.period || !/^\d{4}$/.test(point.period)) return null;
  const year = Number(point.period);
  return Number.isSafeInteger(year) ? year : null;
}

function completeReleasedYears(
  domain: ActivityDomainViewModel,
  snapshotAsOf: string,
): readonly ActivityPointViewModel[] {
  const snapshotYear = Number(snapshotAsOf.slice(0, 4));
  if (!Number.isSafeInteger(snapshotYear)) return [];

  return domain.points
    .filter(point => {
      const year = pointYear(point);
      return point.privacyStatus === 'released'
        && year !== null
        && year < snapshotYear
        && point.events !== null
        && point.participants !== null
        && point.participants > 0;
    })
    .sort((left, right) => (pointYear(left) ?? 0) - (pointYear(right) ?? 0));
}

function percentageDelta(fromValue: number, toValue: number): number | null {
  return fromValue === 0 ? null : (toValue - fromValue) / Math.abs(fromValue);
}

function formatSnapshotDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!SHORT_MONTHS[monthIndex] || !Number.isSafeInteger(day) || day < 1 || day > 31) return value;
  return `${day} ${SHORT_MONTHS[monthIndex]} ${match[1]}`;
}

function deltaLabel(metric: ComparisonMetric): string {
  const absoluteDelta = metric.toValue - metric.fromValue;
  const relativeDelta = percentageDelta(metric.fromValue, metric.toValue);
  const relativeLabel = relativeDelta === null
    ? 'sin base porcentual'
    : signedPercentageFormatter.format(relativeDelta);
  return `${metric.formatDelta(absoluteDelta)} · ${relativeLabel}`;
}

export function AbsenceYearComparison({
  domain,
  snapshotAsOf,
}: AbsenceYearComparisonProps) {
  const years = useMemo(
    () => completeReleasedYears(domain, snapshotAsOf),
    [domain, snapshotAsOf],
  );
  const snapshotYear = snapshotAsOf.slice(0, 4);
  const partialYear = domain.points.find(point => (
    point.period === snapshotYear && point.privacyStatus === 'released'
  )) ?? null;
  const excludedSummary = [
    partialYear ? `${partialYear.periodLabel} parcial al ${formatSnapshotDate(snapshotAsOf)}` : null,
    domain.protectedPeriods > 0
      ? `${domain.protectedPeriods} período${domain.protectedPeriods === 1 ? '' : 's'} protegido${domain.protectedPeriods === 1 ? '' : 's'} omitido${domain.protectedPeriods === 1 ? '' : 's'}`
      : null,
  ].filter((value): value is string => Boolean(value)).join(' · ');
  const defaults = years.slice(-2);
  const [fromPeriod, setFromPeriod] = useState<string | null>(defaults[0]?.period ?? null);
  const [toPeriod, setToPeriod] = useState<string | null>(defaults[1]?.period ?? null);

  const fromPoint = years.find(point => point.period === fromPeriod) ?? null;
  const toPoint = years.find(point => point.period === toPeriod) ?? null;
  const comparisonReady = Boolean(fromPoint && toPoint && fromPoint.period !== toPoint.period);

  if (years.length < 2) {
    return (
      <section
        className="structure-section absence-comparison"
        id="ausencias"
        aria-labelledby="absence-comparison-title"
        data-testid="absence-year-comparison"
      >
        <div className="structure-section__heading">
          <div>
            <p className="structure-eyebrow">Comparación anual</p>
            <h2 id="absence-comparison-title">Ausencias históricas</h2>
          </div>
          <span>{excludedSummary || 'Fuente GRH · sin tiempo real'}</span>
        </div>
        <div className="absence-comparison__empty" role="status" data-testid="absence-compare-notice">
          <strong>No hay dos años completos publicados para comparar.</strong>
          <p>Los períodos parciales o protegidos no se convierten en cero.</p>
        </div>
      </section>
    );
  }

  const metrics: readonly ComparisonMetric[] = comparisonReady && fromPoint && toPoint
    ? [
        {
          key: 'events',
          label: 'Eventos registrados',
          description: 'Filas válidas de ausencia en cada año.',
          fromValue: fromPoint.events!,
          toValue: toPoint.events!,
          format: value => integerFormatter.format(value),
          formatDelta: value => signedIntegerFormatter.format(value),
        },
        {
          key: 'participants',
          label: 'Participantes distintos',
          description: 'Legajos distintos con al menos un evento válido.',
          fromValue: fromPoint.participants!,
          toValue: toPoint.participants!,
          format: value => integerFormatter.format(value),
          formatDelta: value => signedIntegerFormatter.format(value),
        },
        {
          key: 'intensity',
          label: 'Eventos por participante',
          description: 'Relación descriptiva; no es una tasa de ausentismo.',
          fromValue: fromPoint.events! / fromPoint.participants!,
          toValue: toPoint.events! / toPoint.participants!,
          format: value => decimalFormatter.format(value),
          formatDelta: value => signedDecimalFormatter.format(value),
        },
      ]
    : [];

  const changeAnnouncement = comparisonReady && fromPoint && toPoint
    ? `Comparación actualizada: ${fromPoint.periodLabel} frente a ${toPoint.periodLabel}.`
    : 'Elegí dos años distintos para comparar.';

  return (
    <section
      className="structure-section absence-comparison"
      id="ausencias"
      aria-labelledby="absence-comparison-title"
      data-testid="absence-year-comparison"
    >
      <div className="structure-section__heading absence-comparison__heading">
        <div>
          <p className="structure-eyebrow">Comparación anual</p>
          <h2 id="absence-comparison-title">Comparar ausencias históricas</h2>
          <p>Lectura ejecutiva de años completos publicados, sin nuevas consultas.</p>
        </div>
        <span>{excludedSummary || `Fuente GRH · corte ${formatSnapshotDate(snapshotAsOf)}`}</span>
      </div>

      <div className="absence-comparison__controls" aria-label="Años a comparar">
        <label>
          <span>Año base</span>
          <select
            value={fromPeriod ?? ''}
            onChange={event => {
              const nextPeriod = event.currentTarget.value;
              if (nextPeriod && nextPeriod !== toPeriod) setFromPeriod(nextPeriod);
            }}
            data-testid="absence-compare-from"
          >
            {years.map(point => (
              <option key={`from-${point.key}`} value={point.period ?? ''} disabled={point.period === toPeriod}>
                {point.periodLabel}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="absence-comparison__swap"
          onClick={() => {
            setFromPeriod(toPeriod);
            setToPeriod(fromPeriod);
          }}
          aria-label="Intercambiar año base y año comparado"
          data-testid="absence-compare-swap"
        >
          Intercambiar
        </button>
        <label>
          <span>Año comparado</span>
          <select
            value={toPeriod ?? ''}
            onChange={event => {
              const nextPeriod = event.currentTarget.value;
              if (nextPeriod && nextPeriod !== fromPeriod) setToPeriod(nextPeriod);
            }}
            data-testid="absence-compare-to"
          >
            {years.map(point => (
              <option key={`to-${point.key}`} value={point.period ?? ''} disabled={point.period === fromPeriod}>
                {point.periodLabel}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="sr-only" aria-live="polite" data-testid="absence-compare-announcement">
        {changeAnnouncement}
      </p>

      {comparisonReady ? (
        <div className="absence-comparison__metrics">
          {metrics.map(metric => (
            <article
              className="absence-comparison-metric"
              key={metric.key}
              data-testid={`absence-compare-${metric.key}`}
            >
              <div className="absence-comparison-metric__heading">
                <h3>{metric.label}</h3>
                <span>{fromPoint!.periodLabel} → {toPoint!.periodLabel}</span>
              </div>
              <div className="absence-comparison-metric__values">
                <div>
                  <span>{fromPoint!.periodLabel}</span>
                  <strong>{metric.format(metric.fromValue)}</strong>
                </div>
                <div>
                  <span>{toPoint!.periodLabel}</span>
                  <strong>{metric.format(metric.toValue)}</strong>
                </div>
              </div>
              <p className="absence-comparison-metric__delta">
                <span>Diferencia {toPoint!.periodLabel} − {fromPoint!.periodLabel}</span>
                <strong>{deltaLabel(metric)}</strong>
              </p>
              <small>{metric.description}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="absence-comparison__empty" role="status" data-testid="absence-compare-notice">
          Elegí dos años distintos para comparar.
        </div>
      )}

      <p className="absence-comparison__note">
        Estos son eventos históricos registrados, no días perdidos ni una tasa sobre planta activa. La variación es descriptiva: no prueba causas, desempeño ni impacto operativo. {partialYear ? `${partialYear.periodLabel} se excluye por estar parcial al ${formatSnapshotDate(snapshotAsOf)}.` : 'El año del corte se excluye si está incompleto.'}
      </p>
    </section>
  );
}
