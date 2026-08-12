import { KpiCard } from '../components/KpiCard';
import type { MunicipalTerritoryContract } from './territory-contract';
import { TerritoryMap } from './TerritoryMap';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Mendoza',
});

function sourceCount(contract: MunicipalTerritoryContract): string {
  const available = [contract.source.boundary, contract.source.localities]
    .filter(source => source.status === 'available').length;
  return `${available} / 2`;
}

export function TerritoryDashboard({ contract }: { contract: MunicipalTerritoryContract }) {
  const queriedAt = DATE_TIME_FORMATTER.format(new Date(contract.query.queriedAt));
  const partial = contract.status === 'partial';

  return (
    <div className="territory-dashboard" data-territory-status={contract.status}>
      <header className="territory-hero" aria-labelledby="page-title">
        <div>
          <p className="territory-hero__eyebrow">Inteligencia geográfica municipal</p>
          <h1 id="page-title">Centro Territorial Junín · Mendoza</h1>
          <p>Referencia oficial del departamento y sus localidades GeoRef para explorar el territorio, sin capas operativas inventadas.</p>
        </div>
        <div className="territory-hero__status" data-state={partial ? 'partial' : 'ready'}>
          <span aria-hidden="true" />
          <div>
            <strong>{partial ? 'Cobertura parcial' : 'Fuentes disponibles'}</strong>
            <small>Consulta {queriedAt} · no es tiempo real</small>
          </div>
        </div>
      </header>

      {partial ? (
        <section className="territory-notice" role="status" aria-live="polite">
          <strong>Localidades temporalmente no disponibles.</strong>
          <span> El límite oficial del departamento continúa operativo; el buscador queda deshabilitado sin completar datos.</span>
        </section>
      ) : null}

      <section className="territory-kpis" aria-label="Indicadores de referencia territorial">
        <KpiCard
          label="Jurisdicción"
          value={contract.jurisdiction.name}
          note={`${contract.jurisdiction.province.name} · ${contract.jurisdiction.country.name}`}
          tone="cyan"
        />
        <KpiCard
          label="Localidades GeoRef"
          value={String(contract.localities.length)}
          note={partial ? 'GeoRef no disponible; sin sustitución.' : 'Centroides incluidos en la respuesta oficial.'}
          tone={partial ? 'amber' : 'green'}
        />
        <KpiCard
          label="Sistema de referencia"
          value={contract.query.crs}
          note="Geometría de intercambio; las teselas se presentan en Web Mercator."
          tone="violet"
        />
        <KpiCard
          label="Fuentes disponibles"
          value={sourceCount(contract)}
          note="IGN para el límite y Argenmap; GeoRef para localidades."
          tone={partial ? 'amber' : 'neutral'}
        />
      </section>

      <TerritoryMap contract={contract} />

      <section id="territorySources" className="territory-sources" aria-labelledby="territory-sources-title">
        <header>
          <div>
            <p>Proveniencia</p>
            <h2 id="territory-sources-title">Fuentes y alcance</h2>
          </div>
          <span>Consulta {queriedAt}</span>
        </header>
        <div className="territory-sources__grid">
          <article>
            <span className="territory-source-state" data-state="ready">Disponible</span>
            <h3>IGN · límite departamental</h3>
            <p>{contract.source.boundary.custodian}</p>
            <a href={contract.source.boundary.endpoint} target="_blank" rel="noreferrer">
              Abrir servicio oficial
            </a>
          </article>
          <article>
            <span className="territory-source-state" data-state={contract.source.localities.status === 'available' ? 'ready' : 'partial'}>
              {contract.source.localities.status === 'available' ? 'Disponible' : 'No disponible'}
            </span>
            <h3>GeoRef · localidades</h3>
            <p>{contract.source.localities.custodian}</p>
            <a href={contract.source.localities.endpoint} target="_blank" rel="noreferrer">
              Abrir servicio oficial
            </a>
          </article>
          <article className="territory-sources__limits">
            <span className="territory-source-state">Alcance</span>
            <h3>Referencia territorial</h3>
            <ul>
              <li>Sin datos de RRHH, obras o reclamos.</li>
              <li>Sin seguimiento operativo ni actualización en vivo.</li>
              <li>El corte indica la consulta a las fuentes, no vigencia catastral.</li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
