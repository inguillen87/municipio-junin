import type { GardenNetworkViewModel } from './garden-network-types';

function PrivacyMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5" />
    </svg>
  );
}

function TrendChart({ trend }: { readonly trend: GardenNetworkViewModel['trend'] }) {
  return (
    <figure className="garden-trend__figure">
      <div
        className="garden-trend__canvas"
        role="region"
        aria-label="Gráfico desplazable de la tendencia mensual"
        tabIndex={0}
      >
        <svg
          viewBox="0 0 720 260"
          role="img"
          aria-labelledby="garden-trend-chart-title garden-trend-chart-description"
          preserveAspectRatio="xMidYMid meet"
        >
          <title id="garden-trend-chart-title">Personas observadas por mes</title>
          <desc id="garden-trend-chart-description">{trend.accessibleSummary}</desc>
          <g className="garden-trend__grid" aria-hidden="true">
            {trend.guides.map(guide => (
              <g key={guide.value}>
                <line x1="50" x2="700" y1={guide.y} y2={guide.y} />
                <text x="8" y={guide.y + 4}>{guide.label}</text>
              </g>
            ))}
          </g>
          <path className="garden-trend__area" d={trend.fillPath} aria-hidden="true" />
          <path className="garden-trend__line" d={trend.path} aria-hidden="true" />
          <g className="garden-trend__points" aria-hidden="true">
            {trend.points.map(point => (
              <circle key={point.period} cx={point.x} cy={point.y} r={point.anchor ? 4 : 2.25} />
            ))}
          </g>
          <g className="garden-trend__axis" aria-hidden="true">
            {trend.points.filter(point => point.anchor).map(point => (
              <text key={point.period} x={point.x} y="248" textAnchor="middle">{point.shortLabel}</text>
            ))}
          </g>
        </svg>
      </div>
      <figcaption>
        Cada punto representa personas distintas con participación observada en el cálculo del mes.
      </figcaption>
      <details className="garden-trend__table">
        <summary>Ver los {trend.periodCountLabel}</summary>
        <div role="region" aria-label="Valores mensuales de la tendencia" tabIndex={0}>
          <table>
            <caption className="sr-only">Personas observadas en cada período mensual</caption>
            <thead><tr><th scope="col">Período</th><th scope="col">Personas observadas</th></tr></thead>
            <tbody>
              {trend.points.map(point => (
                <tr key={point.period}>
                  <th scope="row">{point.periodLabel}</th>
                  <td>{point.peopleLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function GardenNetworkDashboard({
  viewModel,
}: { readonly viewModel: GardenNetworkViewModel }) {
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Red de jardines disponible con datos agregados y protegidos.
      </p>

      <section className="garden-hero" id="gardenNetworkOverview" aria-labelledby="garden-network-title">
        <div className="garden-hero__copy">
          <p className="garden-eyebrow">Organización · lectura ejecutiva</p>
          <h1 id="garden-network-title">La red de jardines, clara de un vistazo</h1>
          <p>
            Una vista simple de las personas que aparecen en el cálculo mensual, con tendencia,
            unidades publicables y protección automática para los grupos pequeños.
          </p>
          <nav aria-label="Atajos de la red de jardines">
            <a className="garden-button garden-button--primary" href="#gardenNetworkTrend">Ver la tendencia</a>
            <a className="garden-button" href="#gardenNetworkUnits">Entender las unidades</a>
          </nav>
        </div>
        <aside className="garden-hero__metric" aria-label={viewModel.summary.accessibleSummary}>
          <span>{viewModel.summary.referencePeriodLabel}</span>
          <strong>{viewModel.summary.peopleLabel}</strong>
          <p>personas observadas en el cálculo</p>
          <small>No equivale a dotación activa ni a puestos presupuestados.</small>
        </aside>
      </section>

      <dl className="garden-trust-strip" aria-label="Resumen de la red observada">
        <div>
          <dt>Personas observadas</dt>
          <dd>{viewModel.summary.peopleLabel}</dd>
          <small>en el último cálculo válido</small>
        </div>
        <div>
          <dt>Jardines identificados</dt>
          <dd>{viewModel.summary.observedUnitsLabel}</dd>
          <small>con participación observada</small>
        </div>
        <div data-tone="released">
          <dt>Lectura por unidad</dt>
          <dd>{viewModel.summary.releasedPeopleLabel}</dd>
          <small>personas en {viewModel.summary.releasedUnitsLabel} unidades publicables</small>
        </div>
        <div data-tone="protected">
          <dt>Grupo protegido</dt>
          <dd>{viewModel.summary.protectedPeopleLabel}</dd>
          <small>sin desagregar grupos pequeños</small>
        </div>
      </dl>

      <section className="garden-trend" id="gardenNetworkTrend" aria-labelledby="garden-trend-title">
        <header className="garden-section-heading">
          <div>
            <p className="garden-eyebrow">Movimiento en el tiempo</p>
            <h2 id="garden-trend-title">Cómo cambió la participación observada</h2>
            <p>{viewModel.trend.rangeLabel}. La línea describe el registro mensual; no presume altas ni bajas laborales.</p>
          </div>
          <div className="garden-trend__summary" aria-label="Extremos de la tendencia">
            <span>{viewModel.trend.periodCountLabel}</span>
            <strong>{viewModel.trend.startPeopleLabel} → {viewModel.trend.endPeopleLabel}</strong>
            <small>{viewModel.trend.changeLabel}</small>
          </div>
        </header>
        <TrendChart trend={viewModel.trend} />
      </section>

      <section className="garden-units" id="gardenNetworkUnits" aria-labelledby="garden-units-title">
        <header className="garden-section-heading">
          <div>
            <p className="garden-eyebrow">Detalle que cuida identidades</p>
            <h2 id="garden-units-title">Qué unidades se muestran y qué queda protegido</h2>
            <p>
              Sólo se separan unidades que cumplen el umbral de privacidad. El resto permanece unido,
              sin nombres ocultos, ceros de reemplazo ni posibilidad de abrirlo desde esta pantalla.
            </p>
          </div>
          <span className="garden-privacy-badge"><PrivacyMark /> Privacidad aplicada</span>
        </header>

        <div className="garden-units__layout" aria-label={viewModel.units.accessibleSummary}>
          <div className="garden-released-units" role="list" aria-label="Unidades publicables">
            {viewModel.units.released.map(unit => (
              <article className="garden-unit-card" key={unit.label} role="listitem">
                <div>
                  <span>Unidad publicable</span>
                  <h3>{unit.label}</h3>
                  <small>{unit.shareLabel}</small>
                </div>
                <strong>{unit.peopleLabel}<small> personas</small></strong>
                <div className="garden-unit-card__track" aria-hidden="true">
                  <i style={{ width: `${unit.widthPct}%` }} />
                </div>
              </article>
            ))}
          </div>

          <aside className="garden-protected" aria-label="Grupo de privacidad protegido">
            <div className="garden-protected__icon"><PrivacyMark /></div>
            <p className="garden-eyebrow">Un único grupo protegido</p>
            <h3>{viewModel.units.protected.label}</h3>
            <strong>{viewModel.units.protected.peopleLabel}<small> personas</small></strong>
            <p>{viewModel.units.protected.shareLabel}.</p>
            <p>Incluye unidades pequeñas y registros sin una unidad específica, sin contar cuánto aporta cada componente.</p>
            <small>Este grupo nunca expone el aporte de cada unidad ni identificadores personales.</small>
          </aside>
        </div>
      </section>

      <section className="garden-trust" aria-labelledby="garden-trust-title">
        <header className="garden-section-heading">
          <div>
            <p className="garden-eyebrow">Confianza antes de decidir</p>
            <h2 id="garden-trust-title">Qué significa esta lectura</h2>
          </div>
          <span className="garden-quality-status">{viewModel.quality.statusLabel}</span>
        </header>
        <div className="garden-trust__layout">
          <article className="garden-reading-rules">
            <h3>Tres reglas importantes</h3>
            <ul>
              <li><strong>Observada no significa activa.</strong> Indica que la persona aparece en el cálculo del mes.</li>
              <li><strong>Unidad no significa cargo.</strong> Es la asignación informada en la fuente para este análisis.</li>
              <li><strong>Protegido no significa faltante.</strong> El total está incluido, pero el detalle pequeño no se publica.</li>
            </ul>
          </article>
          <article className="garden-quality-card">
            <h3>Control del corte</h3>
            <dl>
              <div><dt>Último cálculo válido</dt><dd>{viewModel.quality.latestValidPeriodLabel}</dd></div>
              <div><dt>Claves de empleo fuente</dt><dd>{viewModel.quality.sourceEmploymentKeysLabel}</dd></div>
              <div><dt>Claves vinculadas</dt><dd>{viewModel.quality.linkedEmploymentKeysLabel}</dd></div>
            </dl>
            <p>{viewModel.quality.reconciliationLabel}</p>
          </article>
        </div>
        <div className="garden-limits" role="note" aria-label="Límites de lectura">
          <h3>Límites que no hay que perder de vista</h3>
          <ul>{viewModel.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
        </div>
        <details className="garden-map-readiness">
          <summary>{viewModel.mapReadiness.title}</summary>
          <p>{viewModel.mapReadiness.description}</p>
          <small>Hasta contar con esa fuente oficial, esta vista no dibuja puntos, domicilios ni coberturas inferidas.</small>
        </details>
        <details className="garden-map-readiness">
          <summary>{viewModel.dataGaps.title}</summary>
          <ul>{viewModel.dataGaps.items.map(item => <li key={item}>{item}</li>)}</ul>
        </details>
      </section>

      <details className="garden-technical" id="gardenNetworkMethodology">
        <summary>Fuente, método y trazabilidad</summary>
        <div className="garden-technical__content">
          <dl>
            {viewModel.methodology.map(item => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
            ))}
          </dl>
          <dl>
            <div><dt>Sistema fuente</dt><dd>{viewModel.source.canonicalSystem}</dd></div>
            <div><dt>Corte del respaldo</dt><dd>{viewModel.source.snapshotLabel}</dd></div>
            <div><dt>Archivo de origen</dt><dd>{viewModel.source.sourceFile}</dd></div>
            <div><dt>SHA-256</dt><dd><code>{viewModel.source.sourceSha256}</code></dd></div>
            <div><dt>Contrato generado</dt><dd>{viewModel.source.generatedLabel}</dd></div>
          </dl>
        </div>
        <p>{viewModel.source.notice}</p>
      </details>
    </>
  );
}
