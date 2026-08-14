import type { EmploymentActionsCategoryViewModel, EmploymentActionsViewModel } from './employment-actions-types';

function CategoryRow({ category }: { readonly category: EmploymentActionsCategoryViewModel }) {
  if (category.protected) {
    return (
      <article className="actions-category actions-category--protected">
        <div><strong>{category.label}</strong><p>{category.meaning}</p></div>
        <span>Grupo pequeño</span>
      </article>
    );
  }
  const currentWidth = `${Math.max(3, (Number(category.currentEvents) / category.maxEvents) * 100)}%`;
  const priorWidth = `${Math.max(3, (Number(category.priorEvents) / category.maxEvents) * 100)}%`;
  return (
    <article className="actions-category">
      <header>
        <div><strong>{category.label}</strong><p>{category.meaning}</p></div>
        <span data-tone={Number(category.deltaEvents) >= 0 ? 'up' : 'down'}>{category.deltaLabel}</span>
      </header>
      <div className="actions-category__bar" aria-label={`${category.currentLabel} actuaciones en el período actual`}>
        <i style={{ width: currentWidth }} /><span>Actual</span><b>{category.currentLabel}</b>
      </div>
      <div className="actions-category__bar actions-category__bar--prior" aria-label={`${category.priorLabel} actuaciones en el período anterior`}>
        <i style={{ width: priorWidth }} /><span>Anterior</span><b>{category.priorLabel}</b>
      </div>
    </article>
  );
}

export function EmploymentActionsDashboard({ viewModel }: { readonly viewModel: EmploymentActionsViewModel }) {
  const primaryCategories = viewModel.categories.slice(0, 6);
  const remainingCategories = viewModel.categories.slice(6);
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">Trayectoria laboral documentada disponible.</p>
      <section className="actions-hero" id="employmentActionsSummary" aria-labelledby="actions-title">
        <div>
          <p className="actions-eyebrow">Trayectoria laboral documentada</p>
          <h1 id="actions-title">Qué actuaciones se registraron y cómo cambió su volumen</h1>
          <p>Comparamos dos períodos de exactamente 972 días. Las actuaciones reflejan registros administrativos con instrumento; no son altas, bajas ni una evaluación de gestión.</p>
          <nav aria-label="Acciones relacionadas">
            <a href="/ia?question=Compará%20las%20actuaciones%20laborales%20documentadas">Preguntarle al asistente</a>
            <a href="/rrhh">Abrir directorio privado</a>
          </nav>
        </div>
        <aside>
          <span>Respaldo verificado</span>
          <strong>{viewModel.source.snapshotLabel}</strong>
          <p>{viewModel.source.historicalLabel}</p>
        </aside>
      </section>

      <section className="actions-period-grid" id="employmentActionsPeriods" aria-label="Comparación de períodos iguales">
        <article className="actions-period actions-period--current">
          <p>{viewModel.periods.current.label}</p>
          <h2>{viewModel.comparison.currentEvents} actuaciones</h2>
          <strong>{viewModel.comparison.currentPersons} personas</strong>
          <span>{viewModel.periods.current.rangeLabel} · {viewModel.periods.current.days} días</span>
        </article>
        <article className="actions-period actions-period--delta">
          <p>Diferencia registrada</p>
          <h2>{viewModel.comparison.eventDelta} actuaciones</h2>
          <strong>{viewModel.comparison.personsDelta} personas</strong>
          <span>Describe registros; no explica causas.</span>
        </article>
        <article className="actions-period actions-period--prior">
          <p>{viewModel.periods.prior.label}</p>
          <h2>{viewModel.comparison.priorEvents} actuaciones</h2>
          <strong>{viewModel.comparison.priorPersons} personas</strong>
          <span>{viewModel.periods.prior.rangeLabel} · {viewModel.periods.prior.days} días</span>
        </article>
      </section>

      <section className="actions-panel" id="employmentActionsCategories" aria-labelledby="categories-title">
        <header className="actions-panel__heading">
          <div><p className="actions-eyebrow">Motivo administrativo informado</p><h2 id="categories-title">Qué tipo de actuación aparece en cada período</h2></div>
          <p>Las barras comparan cantidades de registros, no personas únicas ni actos vigentes.</p>
        </header>
        <div className="actions-category-grid">
          {primaryCategories.map((category) => <CategoryRow category={category} key={category.key} />)}
          {viewModel.protectedBucket ? <CategoryRow category={viewModel.protectedBucket} /> : null}
        </div>
        {remainingCategories.length ? (
          <details className="actions-more">
            <summary>Ver {remainingCategories.length} categorías adicionales</summary>
            <div className="actions-category-grid">
              {remainingCategories.map((category) => <CategoryRow category={category} key={category.key} />)}
            </div>
          </details>
        ) : null}
      </section>

      <section className="actions-evidence" aria-label="Cobertura y límites">
        <article><span>Registros válidos</span><strong>{viewModel.coverage.validRows}</strong><p>Actuaciones históricas incluidas.</p></article>
        <article><span>Vínculo con legajo</span><strong>{viewModel.coverage.joinIntegrity}</strong><p>Coincidencia técnica con la clave laboral.</p></article>
        <article><span>Cobertura clasificada</span><strong>{viewModel.coverage.categoryCoverage}</strong><p>Registros incluidos en categorías explicadas.</p></article>
      </section>

      <details className="actions-technical">
        <summary>Fuente y límites de lectura</summary>
        <dl>
          <div><dt>Archivo de origen</dt><dd>{viewModel.source.sourceFile}</dd></div>
          <div><dt>SHA-256</dt><dd><code>{viewModel.source.sourceSha256}</code></dd></div>
        </dl>
        <ul>{viewModel.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </details>
    </>
  );
}
