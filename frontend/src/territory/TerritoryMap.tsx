import L, {
  type CircleMarker,
  type GeoJSON as LeafletGeoJSON,
  type LatLngBounds,
  type LayerGroup,
  type Map as LeafletMap,
  type TileLayer,
} from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, MultiPolygon } from 'geojson';

import type {
  MunicipalTerritoryContract,
  TerritoryBasemap,
  TerritoryLocality,
} from './territory-contract';

type TileState = 'loading' | 'available' | 'degraded';

const IGN_ATTRIBUTION_URL = 'https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/ServiciosOGC/Leaflet';
const DIACRITICS = /\p{Diacritic}/gu;

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '').toLocaleLowerCase('es-AR').trim();
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function boundaryStyle() {
  const dark = currentTheme() === 'dark';
  return {
    color: dark ? '#7dd3fc' : '#075ea8',
    fillColor: dark ? '#0e7490' : '#38bdf8',
    fillOpacity: dark ? 0.2 : 0.16,
    opacity: 1,
    weight: 3,
  };
}

function markerStyle(selected: boolean) {
  const dark = currentTheme() === 'dark';
  return {
    color: dark ? '#f8fafc' : '#102a43',
    fillColor: selected ? '#f59e0b' : (dark ? '#5eead4' : '#007f78'),
    fillOpacity: 1,
    opacity: 1,
    weight: selected ? 3 : 2,
    radius: selected ? 9 : 7,
  };
}

function toFeature(contract: MunicipalTerritoryContract): Feature<MultiPolygon> {
  return {
    type: 'Feature',
    id: contract.boundary.id,
    bbox: [...contract.boundary.bbox],
    properties: { ...contract.boundary.properties },
    geometry: {
      type: 'MultiPolygon',
      coordinates: contract.boundary.geometry.coordinates.map(polygon =>
        polygon.map(ring => ring.map(position => [...position])),
      ),
    },
  };
}

function initialBounds(contract: MunicipalTerritoryContract): LatLngBounds {
  const [west, south, east, north] = contract.boundary.bbox;
  return L.latLngBounds([south, west], [north, east]);
}

function initialCenter(contract: MunicipalTerritoryContract): [number, number] {
  const [west, south, east, north] = contract.boundary.bbox;
  return [(south + north) / 2, (west + east) / 2];
}

function tileStatusCopy(status: TileState): string {
  if (status === 'available') return 'Mapa base IGN disponible.';
  if (status === 'degraded') return 'Teselas IGN no disponibles; el límite y las localidades oficiales continúan visibles.';
  return 'Cargando mapa base IGN…';
}

interface TerritoryMapProps {
  contract: MunicipalTerritoryContract;
}

export function TerritoryMap({ contract }: TerritoryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);
  const boundaryLayerRef = useRef<LeafletGeoJSON | null>(null);
  const localitiesLayerRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, CircleMarker>());
  const selectedLocalityIdRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [basemapId, setBasemapId] = useState<TerritoryBasemap['id']>('argenmap');
  const [boundaryVisible, setBoundaryVisible] = useState(true);
  const [localitiesVisible, setLocalitiesVisible] = useState(true);
  const [tileState, setTileState] = useState<TileState>('loading');
  const [search, setSearch] = useState('');
  const [selectedLocality, setSelectedLocality] = useState<TerritoryLocality | null>(null);

  const filteredLocalities = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return contract.localities;
    return contract.localities.filter(locality => normalizeSearch(locality.name).includes(query));
  }, [contract.localities, search]);

  const fitBoundary = useCallback(() => {
    mapRef.current?.fitBounds(initialBounds(contract), {
      animate: !prefersReducedMotion(),
      padding: [24, 24],
    });
  }, [contract]);

  const focusLocality = useCallback((locality: TerritoryLocality) => {
    setSelectedLocality(locality);
    const map = mapRef.current;
    if (map) {
      map.setView(
        [locality.centroid.latitude, locality.centroid.longitude],
        Math.max(map.getZoom(), 13),
        { animate: !prefersReducedMotion() },
      );
    }
  }, []);

  const resetMap = useCallback(() => {
    setBasemapId('argenmap');
    setBoundaryVisible(true);
    setLocalitiesVisible(true);
    setSearch('');
    setSelectedLocality(null);
    fitBoundary();
  }, [fitBoundary]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return undefined;

    const map = L.map(container, {
      attributionControl: false,
      center: initialCenter(contract),
      keyboard: true,
      minZoom: 3,
      scrollWheelZoom: true,
      zoom: 10,
      zoomControl: true,
    });
    mapRef.current = map;
    const markers = markersRef.current;

    const boundaryLayer = L.geoJSON(toFeature(contract), { style: boundaryStyle });
    boundaryLayer.addTo(map);
    boundaryLayerRef.current = boundaryLayer;

    const markerLayer = L.layerGroup();
    for (const locality of contract.localities) {
      const marker = L.circleMarker(
        [locality.centroid.latitude, locality.centroid.longitude],
        markerStyle(false),
      );
      marker.bindTooltip(locality.name, { direction: 'top', offset: [0, -7] });
      marker.on('click', () => focusLocality(locality));
      marker.addTo(markerLayer);
      markers.set(locality.id, marker);
    }
    markerLayer.addTo(map);
    localitiesLayerRef.current = markerLayer;

    map.fitBounds(initialBounds(contract), { animate: false, padding: [24, 24] });
    setMapReady(true);

    const synchronizeVectorTheme = () => {
      boundaryLayer.setStyle(boundaryStyle());
      for (const [id, marker] of markers) {
        marker.setStyle(markerStyle(id === selectedLocalityIdRef.current));
        marker.setRadius(id === selectedLocalityIdRef.current ? 9 : 7);
      }
    };
    const themeObserver = new MutationObserver(synchronizeVectorTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      themeObserver.disconnect();
      markers.clear();
      tileLayerRef.current = null;
      boundaryLayerRef.current = null;
      localitiesLayerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [contract, focusLocality]);

  useEffect(() => {
    selectedLocalityIdRef.current = selectedLocality?.id ?? null;
    for (const [id, marker] of markersRef.current) {
      const selected = id === selectedLocality?.id;
      marker.setStyle(markerStyle(selected));
      marker.setRadius(selected ? 9 : 7);
    }
  }, [selectedLocality]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return undefined;
    const basemap = contract.basemaps.find(candidate => candidate.id === basemapId);
    if (!basemap) return undefined;

    const previousLayer = tileLayerRef.current;
    if (previousLayer) previousLayer.removeFrom(map);
    setTileState('loading');
    let failed = false;
    const layer = L.tileLayer(basemap.tileUrl, {
      minZoom: basemap.minZoom,
      maxZoom: basemap.maxZoom,
      updateWhenIdle: true,
    });
    layer.on('tileerror', () => {
      failed = true;
      setTileState('degraded');
    });
    layer.on('tileload', () => {
      if (!failed) setTileState('available');
    });
    layer.addTo(map);
    layer.bringToBack();
    tileLayerRef.current = layer;

    return () => {
      layer.removeFrom(map);
      if (tileLayerRef.current === layer) tileLayerRef.current = null;
    };
  }, [basemapId, contract.basemaps, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = boundaryLayerRef.current;
    if (!mapReady || !map || !layer) return;
    if (boundaryVisible) layer.addTo(map);
    else layer.removeFrom(map);
  }, [boundaryVisible, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = localitiesLayerRef.current;
    if (!mapReady || !map || !layer) return;
    if (localitiesVisible) layer.addTo(map);
    else layer.removeFrom(map);
  }, [localitiesVisible, mapReady]);

  return (
    <section className="territory-workspace" aria-labelledby="territory-map-title">
      <div className="territory-map-shell">
        <header className="territory-map-toolbar">
          <div>
            <p>Mapa institucional</p>
            <h2 id="territory-map-title">Departamento de Junín</h2>
          </div>
          <div className="territory-map-toolbar__controls" aria-label="Controles del mapa">
            <label className="territory-select">
              <span>Mapa base</span>
              <select
                aria-label="Seleccionar mapa base IGN"
                value={basemapId}
                onChange={event => setBasemapId(event.target.value as TerritoryBasemap['id'])}
              >
                {contract.basemaps.map(basemap => (
                  <option key={basemap.id} value={basemap.id}>{basemap.label}</option>
                ))}
              </select>
            </label>
            <label className="territory-toggle">
              <input
                type="checkbox"
                checked={boundaryVisible}
                onChange={event => setBoundaryVisible(event.target.checked)}
              />
              <span>Límite</span>
            </label>
            <label className="territory-toggle">
              <input
                type="checkbox"
                checked={localitiesVisible}
                disabled={contract.localities.length === 0}
                onChange={event => setLocalitiesVisible(event.target.checked)}
              />
              <span>Localidades</span>
            </label>
            <button className="territory-map-button" type="button" onClick={fitBoundary}>Ajustar departamento</button>
            <button className="territory-map-button" type="button" onClick={resetMap}>Restablecer</button>
          </div>
        </header>

        <div className="territory-map-frame" data-tile-state={tileState}>
          <div
            id="territoryMap"
            ref={mapContainerRef}
            role="region"
            aria-label="Mapa interactivo del departamento de Junín, Mendoza"
            aria-describedby="territory-map-state"
          />
          <div id="territory-map-state" className="territory-map-state" aria-live="polite" data-state={tileState}>
            <span aria-hidden="true" />
            {tileStatusCopy(tileState)}
          </div>
          <div className="territory-map-attribution">
            <a href="https://leafletjs.com/" target="_blank" rel="noreferrer">Leaflet</a>
            <span aria-hidden="true"> · </span>
            <a href={IGN_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
              Instituto Geográfico Nacional · Argenmap
            </a>
          </div>
        </div>
      </div>

      <aside id="territoryLocalities" className="territory-localities" aria-labelledby="territory-localities-title">
        <header>
          <p>Explorador local</p>
          <h2 id="territory-localities-title">Localidades</h2>
          <span>{contract.localities.length} GeoRef</span>
        </header>
        <label className="territory-search" htmlFor="territory-locality-search">
          <span>Buscar localidad</span>
          <input
            id="territory-locality-search"
            type="search"
            value={search}
            disabled={contract.status === 'partial'}
            placeholder={contract.status === 'partial' ? 'Fuente temporalmente no disponible' : 'Ej.: Junín'}
            autoComplete="off"
            onChange={event => setSearch(event.target.value)}
          />
        </label>

        {contract.status === 'ready' ? (
          <ul className="territory-localities__list" aria-label="Resultados de localidades">
            {filteredLocalities.map(locality => (
              <li key={locality.id}>
                <button
                  type="button"
                  data-locality-id={locality.id}
                  aria-pressed={selectedLocality?.id === locality.id}
                  onClick={() => focusLocality(locality)}
                >
                  <span aria-hidden="true" />
                  <strong>{locality.name}</strong>
                  <small>Ver en mapa</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="territory-localities__empty" role="status">
            No se muestran localidades sin una respuesta oficial completa de GeoRef.
          </p>
        )}

        {contract.status === 'ready' && filteredLocalities.length === 0 ? (
          <p className="territory-localities__empty" role="status">No hay coincidencias en las 7 localidades oficiales.</p>
        ) : null}

        <article className="territory-locality-detail" aria-live="polite" data-selected={selectedLocality ? 'true' : 'false'}>
          {selectedLocality ? (
            <>
              <span>Localidad seleccionada</span>
              <h3>{selectedLocality.name}</h3>
              <dl>
                <div><dt>Latitud</dt><dd>{selectedLocality.centroid.latitude.toFixed(5)}</dd></div>
                <div><dt>Longitud</dt><dd>{selectedLocality.centroid.longitude.toFixed(5)}</dd></div>
                <div><dt>Fuente</dt><dd>GeoRef</dd></div>
              </dl>
              <button type="button" onClick={() => focusLocality(selectedLocality)}>Centrar nuevamente</button>
            </>
          ) : (
            <>
              <span>Detalle</span>
              <h3>{contract.status === 'partial' ? 'Localidades no disponibles' : 'Seleccioná una localidad'}</h3>
              <p>
                {contract.status === 'partial'
                  ? 'GeoRef no respondió; no se muestran sustitutos.'
                  : 'Usá el buscador o la lista para centrar el mapa y consultar su centroide oficial.'}
              </p>
            </>
          )}
        </article>
      </aside>
    </section>
  );
}
