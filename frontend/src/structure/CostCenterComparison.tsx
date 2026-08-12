import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  OrganizationAnalyticsViewModel,
  WorkforceRowViewModel,
} from '../domain/organization-analytics-types';
import {
  loadCostCenterFinanceModel,
  type CostCenterFinanceCell,
  type CostCenterFinanceModel,
} from '../domain/workforce-finance-bridge';
import {
  CostCenterNetComparisonChart,
  type CostCenterComparisonPoint,
} from './StructureCharts';

const COMPARISON_HASH = '#costCenterComparator';
const COMPARISON_KEYS = Object.freeze([
  'compare', 'leftCompany', 'leftCode', 'rightCompany', 'rightCode',
]);

export interface CostCenterComparisonSeed {
  readonly companyCode: number;
  readonly sourceCode: number;
  readonly nonce: number;
}

interface ComparableArea {
  readonly key: string;
  readonly companyCode: number;
  readonly sourceCode: number;
  readonly label: string;
  readonly participants: number;
  readonly participantLabel: string;
  readonly participantSharePct: number;
  readonly participantShareLabel: string;
}

interface ComparisonLocation {
  readonly present: boolean;
  readonly invalid: boolean;
  readonly leftKey: string;
  readonly rightKey: string;
}

interface CostCenterComparisonProps {
  readonly financeEnabled: boolean;
  readonly haciendaEnabled: boolean;
  readonly seed: CostCenterComparisonSeed | null;
  readonly viewModel: OrganizationAnalyticsViewModel;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

function canonicalIdentifier(value: string | number | null, positive = false): number | null {
  const text = String(value ?? '');
  const pattern = positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u;
  if (!pattern.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

function areaKey(companyCode: number, sourceCode: number): string {
  return `${companyCode}:${sourceCode}`;
}

function comparableAreas(rows: readonly WorkforceRowViewModel[]): readonly ComparableArea[] {
  const candidates = rows.flatMap(row => {
    if (row.privacyStatus !== 'released') return [];
    const companyCode = canonicalIdentifier(row.companyCode, true);
    const sourceCode = canonicalIdentifier(row.sourceCode);
    if (companyCode === null || sourceCode === null) return [];
    return [{
      key: areaKey(companyCode, sourceCode),
      companyCode,
      sourceCode,
      label: row.label,
      participants: row.participants,
      participantLabel: row.participantLabel,
      participantSharePct: row.sharePct,
      participantShareLabel: row.shareLabel,
    }];
  });
  const counts = new Map<string, number>();
  for (const row of candidates) counts.set(row.key, (counts.get(row.key) ?? 0) + 1);
  return Object.freeze(candidates
    .filter(row => counts.get(row.key) === 1)
    .map(row => Object.freeze(row)));
}

function defaultPair(rows: readonly ComparableArea[]): Pick<ComparisonLocation, 'leftKey' | 'rightKey'> {
  return {
    leftKey: rows[0]?.key ?? '',
    rightKey: rows[1]?.key ?? '',
  };
}

function readComparisonLocation(rows: readonly ComparableArea[]): ComparisonLocation {
  const fallback = defaultPair(rows);
  const parameters = new URLSearchParams(window.location.search);
  if (!parameters.has('compare')) return { present: false, invalid: false, ...fallback };
  const keys = Array.from(parameters.keys());
  const exactShape = keys.length === COMPARISON_KEYS.length &&
    COMPARISON_KEYS.every(key => parameters.getAll(key).length === 1) &&
    keys.every(key => COMPARISON_KEYS.includes(key)) &&
    parameters.get('compare') === 'costCenter' && window.location.hash === COMPARISON_HASH;
  const leftCompany = canonicalIdentifier(parameters.get('leftCompany'), true);
  const leftCode = canonicalIdentifier(parameters.get('leftCode'));
  const rightCompany = canonicalIdentifier(parameters.get('rightCompany'), true);
  const rightCode = canonicalIdentifier(parameters.get('rightCode'));
  if (!exactShape || leftCompany === null || leftCode === null ||
      rightCompany === null || rightCode === null) {
    return { present: true, invalid: true, ...fallback };
  }
  const leftKey = areaKey(leftCompany, leftCode);
  const rightKey = areaKey(rightCompany, rightCode);
  if (leftKey === rightKey || !rows.some(row => row.key === leftKey) || !rows.some(row => row.key === rightKey)) {
    return { present: true, invalid: true, ...fallback };
  }
  return { present: true, invalid: false, leftKey, rightKey };
}

function pushComparisonLocation(left: ComparableArea, right: ComparableArea) {
  const parameters = new URLSearchParams({
    compare: 'costCenter',
    leftCompany: String(left.companyCode),
    leftCode: String(left.sourceCode),
    rightCompany: String(right.companyCode),
    rightCode: String(right.sourceCode),
  });
  window.history.pushState(window.history.state, '',
    `${window.location.pathname}?${parameters.toString()}${COMPARISON_HASH}`);
}

function formatMonth(period: string, locale: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(locale, {
    month: 'short', year: '2-digit', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1))).replace('.', '');
}

function formatWindow(model: CostCenterFinanceModel): string {
  return `${formatMonth(model.presentation.firstPeriod, model.presentation.locale)}–${formatMonth(
    model.presentation.lastPeriod, model.presentation.locale,
  )}`;
}

function moneyFormatter(model: CostCenterFinanceModel, compact: boolean): Intl.NumberFormat {
  return new Intl.NumberFormat(model.presentation.locale, {
    style: 'currency',
    currency: model.presentation.currencyCode,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
  });
}

function formatMoney(cents: number | null, model: CostCenterFinanceModel, compact = false): string {
  return cents === null ? 'No publicado' : moneyFormatter(model, compact).format(cents / 100);
}

function signedMoney(cents: number, model: CostCenterFinanceModel): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(cents), model, true)}`;
}

function signedNumber(value: number, suffix = ''): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toLocaleString('es-AR', { maximumFractionDigits: 4 })}${suffix}`;
}

function latestCell(model: CostCenterFinanceModel, key: string): CostCenterFinanceCell | null {
  return model.periods.at(-1)?.cells[key] ?? null;
}

function haciendaHref(area: ComparableArea): string {
  return `/hacienda?cohort=costCenter&company=${area.companyCode}&code=${area.sourceCode}#cohortContext`;
}

export function CostCenterComparison({
  financeEnabled,
  haciendaEnabled,
  seed,
  viewModel,
}: CostCenterComparisonProps) {
  const areas = useMemo(() => comparableAreas(viewModel.workforce.costCenter.rows), [viewModel]);
  const initial = useMemo(() => readComparisonLocation(areas), [areas]);
  const [leftKey, setLeftKey] = useState(initial.leftKey);
  const [rightKey, setRightKey] = useState(initial.rightKey);
  const [active, setActive] = useState(initial.present && !initial.invalid);
  const [invalidLocation, setInvalidLocation] = useState(initial.invalid);
  const [model, setModel] = useState<CostCenterFinanceModel | null>(null);
  const [status, setStatus] = useState<LoadStatus>(initial.present && !initial.invalid ? 'loading' : 'idle');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lastSeedNonceRef = useRef<number | null>(null);

  const left = areas.find(row => row.key === leftKey) ?? null;
  const right = areas.find(row => row.key === rightKey) ?? null;

  const activate = useCallback((nextLeft = left, nextRight = right) => {
    if (!financeEnabled || !nextLeft || !nextRight || nextLeft.key === nextRight.key) return;
    setLeftKey(nextLeft.key);
    setRightKey(nextRight.key);
    setInvalidLocation(false);
    setActive(true);
    setStatus(current => model ? 'ready' : current === 'error' ? 'error' : 'loading');
    pushComparisonLocation(nextLeft, nextRight);
  }, [financeEnabled, left, model, right]);

  useEffect(() => {
    if (!active || invalidLocation || model || !financeEnabled) return;
    const controller = new AbortController();
    let current = true;
    setStatus('loading');
    void loadCostCenterFinanceModel({
      signal: controller.signal,
      timeoutMs: 15_000,
      expectedSource: {
        canonicalSystem: viewModel.truth.canonicalSystem,
        sourceSha256: viewModel.truth.sourceHash,
        snapshotAsOf: viewModel.truth.snapshotAsOf,
      },
      expectedReferencePeriod: viewModel.truth.referencePeriod,
    }).then(nextModel => {
      if (!current) return;
      setModel(nextModel);
      setStatus('ready');
    }).catch(() => {
      if (!current || controller.signal.aborted) return;
      setStatus('error');
    });
    return () => {
      current = false;
      controller.abort();
    };
  }, [active, attempt, financeEnabled, invalidLocation, model,
    viewModel.truth.canonicalSystem, viewModel.truth.referencePeriod,
    viewModel.truth.snapshotAsOf, viewModel.truth.sourceHash]);

  useEffect(() => {
    const restore = () => {
      const next = readComparisonLocation(areas);
      setLeftKey(next.leftKey);
      setRightKey(next.rightKey);
      setInvalidLocation(next.invalid);
      setActive(next.present && !next.invalid);
      setStatus(next.present && !next.invalid ? model ? 'ready' : 'loading' : 'idle');
      setExpanded(false);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [areas, model]);

  useEffect(() => {
    if (!seed || lastSeedNonceRef.current === seed.nonce) return;
    const seeded = areas.find(row => row.companyCode === seed.companyCode && row.sourceCode === seed.sourceCode);
    const companion = areas.find(row => row.key !== seeded?.key);
    if (!seeded || !companion) return;
    lastSeedNonceRef.current = seed.nonce;
    activate(seeded, companion);
    window.requestAnimationFrame(() => {
      titleRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
      titleRef.current?.focus({ preventScroll: true });
    });
  }, [activate, areas, seed]);

  const updatePair = (nextLeftKey: string, nextRightKey: string) => {
    const nextLeft = areas.find(row => row.key === nextLeftKey);
    const nextRight = areas.find(row => row.key === nextRightKey);
    if (!nextLeft || !nextRight || nextLeft.key === nextRight.key) return;
    setLeftKey(nextLeft.key);
    setRightKey(nextRight.key);
    setExpanded(false);
    if (active) pushComparisonLocation(nextLeft, nextRight);
  };

  const retry = () => {
    setModel(null);
    setStatus('loading');
    setAttempt(value => value + 1);
  };

  const leftFinance = model ? latestCell(model, leftKey) : null;
  const rightFinance = model ? latestCell(model, rightKey) : null;
  const points: readonly CostCenterComparisonPoint[] = model ? model.periods.map(period => {
    const leftCell = period.cells[leftKey] ?? null;
    const rightCell = period.cells[rightKey] ?? null;
    return {
      period: period.period,
      periodLabel: formatMonth(period.period, model.presentation.locale),
      leftNetCents: leftCell?.components.netPayrollCents ?? null,
      leftValueLabel: formatMoney(leftCell?.components.netPayrollCents ?? null, model),
      rightNetCents: rightCell?.components.netPayrollCents ?? null,
      rightValueLabel: formatMoney(rightCell?.components.netPayrollCents ?? null, model),
    };
  }) : [];
  const tablePoints = (expanded ? [...points] : points.slice(-6)).reverse();

  return (
    <section
      className="structure-section cost-comparison"
      id="costCenterComparator"
      aria-labelledby="cost-center-comparison-title"
      data-testid="cost-center-comparison"
    >
      <div className="structure-section__heading cost-comparison__heading">
        <div>
          <p className="structure-eyebrow">Comparador ejecutivo</p>
          <h2 id="cost-center-comparison-title" ref={titleRef} tabIndex={-1}>
            Comparar dos áreas de costo observadas
          </h2>
          <p>Participación en la cohorte y niveles financieros de control, con identidades exactas de la fuente.</p>
        </div>
        <span>{model ? `${model.presentation.windowMonths} meses · ${formatWindow(model)}` : 'Ventana gobernada · 24 meses'}</span>
      </div>

      {areas.length < 2 ? (
        <p className="structure-empty">No hay dos áreas publicadas con identidad suficiente para comparar.</p>
      ) : (
        <div className="cost-comparison__controls">
          <label>
            Área A
            <select
              value={leftKey}
              onChange={event => updatePair(event.target.value, rightKey)}
              data-testid="cost-center-comparison-left"
            >
              {areas.map(area => (
                <option key={area.key} value={area.key} disabled={area.key === rightKey}>{area.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="structure-action cost-comparison__swap"
            onClick={() => updatePair(rightKey, leftKey)}
            disabled={!left || !right}
            aria-label="Intercambiar Área A y Área B"
            data-testid="cost-center-comparison-swap"
          >
            Intercambiar áreas
          </button>
          <label>
            Área B
            <select
              value={rightKey}
              onChange={event => updatePair(leftKey, event.target.value)}
              data-testid="cost-center-comparison-right"
            >
              {areas.map(area => (
                <option key={area.key} value={area.key} disabled={area.key === leftKey}>{area.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {left && right ? `Comparación preparada: ${left.label} frente a ${right.label}.` : ''}
      </p>

      {areas.length < 2 ? null : invalidLocation ? (
        <div className="cost-comparison__state" role="alert" data-testid="cost-center-comparison-invalid">
          <strong>Enlace de comparación no válido</strong>
          <p>Elegí dos áreas distintas y publicadas para iniciar una comparación verificable.</p>
          <button type="button" className="structure-action" onClick={() => {
            setInvalidLocation(false);
            setActive(false);
            setStatus('idle');
          }}>Elegir áreas</button>
        </div>
      ) : !financeEnabled ? (
        <div className="cost-comparison__state" data-testid="cost-center-comparison-disabled">
          <strong>Comparación financiera no habilitada para este acceso</strong>
          <p>La estructura y la participación permanecen disponibles en esta pantalla.</p>
        </div>
      ) : status === 'idle' ? (
        <div className="cost-comparison__state" data-testid="cost-center-comparison-idle">
          <strong>Dos áreas, una misma base de decisión</strong>
          <p>La carga agrega 24 meses de importes de control. Después, cambiar o intercambiar áreas no vuelve a consultar.</p>
          <button
            type="button"
            className="structure-action structure-action--primary"
            onClick={() => activate()}
            disabled={!left || !right}
            data-testid="cost-center-comparison-load"
          >
            Cargar comparación de 24 meses
          </button>
        </div>
      ) : status === 'loading' ? (
        <div className="cost-comparison__state" aria-busy="true" data-testid="cost-center-comparison-loading">
          <strong>Preparando comparación</strong>
          <p>Validamos fuente, período e identidades antes de mostrar cifras.</p>
        </div>
      ) : status === 'error' ? (
        <div className="cost-comparison__state" role="alert" data-testid="cost-center-comparison-error">
          <strong>No se pudo cargar la comparación financiera</strong>
          <p>El resto de Estructura sigue disponible. Podés reintentar sólo este panel.</p>
          <button type="button" className="structure-action" onClick={retry} data-testid="cost-center-comparison-retry">
            Reintentar comparación
          </button>
        </div>
      ) : status === 'ready' && model && left && right && (!leftFinance || !rightFinance) ? (
        <div className="cost-comparison__state" role="alert" data-testid="cost-center-comparison-pair-unavailable">
          <strong>El par elegido no tiene cifras comparables publicadas</strong>
          <p>La cohorte actual sigue visible. Elegí otras dos áreas para consultar sus niveles financieros.</p>
        </div>
      ) : model && left && right && leftFinance && rightFinance ? (
        <div className="cost-comparison__content" data-testid="cost-center-comparison-content">
          <div className="cost-comparison__actions">
            {haciendaEnabled ? <>
              <a className="structure-action" href={haciendaHref(left)} data-testid="cost-center-comparison-hacienda-left">
                Ver A en Hacienda
              </a>
              <a className="structure-action" href={haciendaHref(right)} data-testid="cost-center-comparison-hacienda-right">
                Ver B en Hacienda
              </a>
            </> : null}
          </div>
          <div className="cost-comparison__kpis" aria-label="Indicadores comparados del último período">
            <ComparisonKpi
              label={`Participantes · ${viewModel.truth.referencePeriod}`}
              left={left.participantLabel}
              right={right.participantLabel}
              difference={signedNumber(left.participants - right.participants)}
              note="Claves con cálculo válido; no headcount activo."
            />
            <ComparisonKpi
              label="Participación en la cohorte"
              left={left.participantShareLabel}
              right={right.participantShareLabel}
              difference={signedNumber(left.participantSharePct - right.participantSharePct, ' pp')}
              note="Mismo denominador de participantes del período."
            />
            <ComparisonKpi
              label={`Neto de control · ${model.presentation.lastPeriod}`}
              left={formatMoney(leftFinance.components.netPayrollCents, model, true)}
              right={formatMoney(rightFinance.components.netPayrollCents, model, true)}
              difference={signedMoney(
                leftFinance.components.netPayrollCents - rightFinance.components.netPayrollCents, model,
              )}
              note="Nivel publicado; no certifica pago bancario."
            />
            <ComparisonKpi
              label="Asignación del neto global"
              left={`${leftFinance.allocationSharePct.toLocaleString('es-AR', { maximumFractionDigits: 4 })}%`}
              right={`${rightFinance.allocationSharePct.toLocaleString('es-AR', { maximumFractionDigits: 4 })}%`}
              difference={signedNumber(leftFinance.allocationSharePct - rightFinance.allocationSharePct, ' pp')}
              note="Participación del importe neto; no de personas."
            />
          </div>
          <CostCenterNetComparisonChart
            currencyCode={model.presentation.currencyCode}
            leftLabel={left.label}
            points={points}
            rightLabel={right.label}
            windowLabel={formatWindow(model)}
          />
          <ComparisonTable
            expanded={expanded}
            leftLabel={left.label}
            model={model}
            onToggle={() => setExpanded(value => !value)}
            points={tablePoints}
            rightLabel={right.label}
          />
          <p className="structure-panel__note cost-comparison__note">
            Evolución mensual de importes de control de cálculo por centro de costo observado. Cada mes es un nivel
            publicado independiente: no certifica pago bancario, planta activa, inflación ni gasto contable devengado.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ComparisonKpi({
  difference,
  label,
  left,
  note,
  right,
}: {
  readonly difference: string;
  readonly label: string;
  readonly left: string;
  readonly note: string;
  readonly right: string;
}) {
  return (
    <article className="cost-comparison-kpi">
      <span>{label}</span>
      <div><strong>A · {left}</strong><strong>B · {right}</strong></div>
      <b>Brecha A − B · {difference}</b>
      <small>{note}</small>
    </article>
  );
}

function ComparisonTable({
  expanded,
  leftLabel,
  model,
  onToggle,
  points,
  rightLabel,
}: {
  readonly expanded: boolean;
  readonly leftLabel: string;
  readonly model: CostCenterFinanceModel;
  readonly onToggle: () => void;
  readonly points: readonly CostCenterComparisonPoint[];
  readonly rightLabel: string;
}) {
  return (
    <div className="cost-comparison-table-block">
      <div className="cost-comparison-table-block__heading">
        <div><h3>Detalle mensual exacto</h3><p>Últimos {expanded ? 24 : 6} meses, del más reciente al más antiguo.</p></div>
        <button type="button" className="structure-disclosure" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? 'Ver últimos 6 meses' : 'Ver los 24 meses'}
        </button>
      </div>
      <div className="cost-comparison-table__scroll" role="region" aria-label="Tabla mensual comparada" tabIndex={0}>
        <table className="cost-comparison-table">
          <thead><tr><th>Mes</th><th>A · {leftLabel}</th><th>B · {rightLabel}</th><th>Brecha A − B</th></tr></thead>
          <tbody>
            {points.map(point => {
              const difference = point.leftNetCents === null || point.rightNetCents === null
                ? null : point.leftNetCents - point.rightNetCents;
              return (
                <tr key={point.period}>
                  <th scope="row"><time dateTime={point.period}>{point.periodLabel}</time></th>
                  <td>{formatMoney(point.leftNetCents, model)}</td>
                  <td>{formatMoney(point.rightNetCents, model)}</td>
                  <td>{difference === null ? 'No comparable' : signedMoney(difference, model)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
