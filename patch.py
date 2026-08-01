import os

# --- MAPA.HTML ---
with open('mapa.html', 'r', encoding='utf-8') as f:
    mapa = f.read()

# 1. CSS
mapa_css = """
.obras-panel {
  position: absolute; top: 80px; right: 16px; z-index: 1000;
  width: 280px; background: rgba(11,17,32,0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; padding: 16px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
.obra-item {
  display: flex; flex-direction: column; gap: 6px;
  padding: 12px; border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  margin-bottom: 8px; cursor: pointer;
  transition: all 0.2s ease;
}
.obra-item:hover {
  background: rgba(59,130,246,0.08);
  border-color: rgba(59,130,246,0.2);
}
.obra-progress-bar {
  width: 100%; height: 5px; background: rgba(255,255,255,0.08);
  border-radius: 99px; overflow: hidden; margin-top: 4px;
}
.obra-progress-fill {
  height: 100%; border-radius: 99px;
  transition: width 1.2s cubic-bezier(0.16,1,0.3,1);
}
.mapa-legend {
  position: absolute; bottom: 24px; left: 16px; z-index: 1000;
  background: rgba(11,17,32,0.9); backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
  padding: 12px 16px; font-size: 11px;
}
.legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: rgba(148,163,184,0.8); }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.layer-controls {
  display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;
}
.layer-btn {
  padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
  cursor: pointer; border: 1px solid; transition: all 0.2s;
}
.layer-btn.active { opacity: 1; }
.layer-btn:not(.active) { opacity: 0.4; }
"""
mapa = mapa.replace("  </style>", mapa_css + "\n  </style>")

# 2. HTML map container
mapa_html_old = """      <div class="map-container">
        <div id="map"></div>

        <!-- CONTROLES DE CAPAS -->
        <div class="map-controls">
          <button class="layer-btn active" id="btnCostos" onclick="toggleLayer('costos')">
            <span class="layer-dot" style="background:#3b82f6"></span>
            💰 Costos por Zona
          </button>
          <button class="layer-btn" id="btnObras" onclick="toggleLayer('obras')">
            <span class="layer-dot" style="background:#f59e0b"></span>
            🏗️ Obras Públicas
          </button>
          <button class="layer-btn" id="btnHeatmap" onclick="toggleLayer('heatmap')">
            <span class="layer-dot" style="background:#ef4444"></span>
            🔥 Heatmap Gasto
          </button>
        </div>

        <!-- LEYENDA -->
        <div class="map-legend" id="mapLegend">
          <div class="legend-title">Gasto Mensual</div>
          <div class="legend-item"><div class="legend-box" style="background:rgba(16,185,129,0.7)"></div> Bajo (&lt; $5M)</div>
          <div class="legend-item"><div class="legend-box" style="background:rgba(245,158,11,0.7)"></div> Medio ($5M–$15M)</div>
          <div class="legend-item"><div class="legend-box" style="background:rgba(239,68,68,0.7)"></div> Alto (&gt; $15M)</div>
        </div>

        <!-- KPIs BOTTOM -->
        <div class="map-kpis">
          <div class="map-kpi">
            <div class="map-kpi-label">Presupuesto Total</div>
            <div class="map-kpi-value">$372M</div>
            <div class="map-kpi-sub">Anual 2026</div>
          </div>
          <div class="map-kpi">
            <div class="map-kpi-label">Ejecutado</div>
            <div class="map-kpi-value" style="color:#10b981">$193M</div>
            <div class="map-kpi-sub">52% del total</div>
          </div>
          <div class="map-kpi">
            <div class="map-kpi-label">Obras Activas</div>
            <div class="map-kpi-value" style="color:#f59e0b">8</div>
            <div class="map-kpi-sub">En ejecución</div>
          </div>
          <div class="map-kpi">
            <div class="map-kpi-label">Zonas Monitoreadas</div>
            <div class="map-kpi-value" style="color:#8b5cf6">12</div>
            <div class="map-kpi-sub">Cobertura 100%</div>
          </div>
        </div>
      </div>"""

mapa_html_new = """      <div class="map-container" style="padding: 16px;">
        <div class="layer-controls" style="margin-bottom:12px">
          <button class="layer-btn active" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.3);color:#60a5fa" onclick="toggleLayer('obras',this)">🏗️ Obras</button>
          <button class="layer-btn active" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3);color:#f87171" onclick="toggleLayer('reclamos',this)">📍 Reclamos</button>
          <button onclick="map && map.flyTo([-34.5854,-60.9433],14,{duration:1.5})" style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--text-muted)">🎯 Centrar</button>
        </div>
        <div style="position:relative">
          <div id="map" style="height:480px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)"></div>
          <div class="obras-panel" id="obrasPanel"></div>
          <div class="mapa-legend">
            <div style="font-size:10px;font-weight:800;color:var(--text-muted);margin-bottom:6px">LEYENDA</div>
            <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div> Finalizada</div>
            <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div> Avanzada (+70%)</div>
            <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> En curso</div>
            <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div> Urgente / Inicio</div>
          </div>
        </div>
      </div>"""

mapa = mapa.replace(mapa_html_old, mapa_html_new)

# 3. JS block
js_old = """  // ── DATOS FINANCIEROS POR ZONA ────────────────────────────"""
js_old_end = """  buildSidebar('mapa');"""
idx_start = mapa.find(js_old)
idx_end = mapa.find(js_old_end, idx_start)
if idx_start != -1 and idx_end != -1:
    js_new = """  // Enhanced map data
const OBRAS_DATA = [
  { id: 'O001', nombre: 'Pavimentación Av. San Martín', tipo: 'Pavimentación', estado: 'en_ejecucion', avance: 68, presupuesto: 18500000, ejecutado: 12580000, contratista: 'Construcciones Del Valle SA', barrio: 'Centro', lat: -34.5854, lng: -60.9433, inspector: 'Ing. Rodríguez', fechaInicio: '2026-05-01', fechaFin: '2026-09-30' },
  { id: 'O002', nombre: 'Red Cloacal Villa del Parque', tipo: 'Infraestructura', estado: 'en_ejecucion', avance: 35, presupuesto: 12300000, ejecutado: 4305000, contratista: 'Hidráulica Sur SA', barrio: 'Villa del Parque', lat: -34.5901, lng: -60.9389, inspector: 'Ing. Vargas', fechaInicio: '2026-06-15', fechaFin: '2026-11-30' },
  { id: 'O003', nombre: 'Plaza Belgrano', tipo: 'Espacio Público', estado: 'finalizada', avance: 100, presupuesto: 3800000, ejecutado: 3920000, contratista: 'Parques y Jardines SA', barrio: 'Centro', lat: -34.5823, lng: -60.9445, inspector: 'Arq. Núñez', fechaInicio: '2026-03-01', fechaFin: '2026-06-30' },
  { id: 'O004', nombre: 'Centro Deportivo Municipal', tipo: 'Construcción', estado: 'en_ejecucion', avance: 22, presupuesto: 25000000, ejecutado: 5500000, contratista: 'Obras y Servicios SA', barrio: 'Pueblo Nuevo', lat: -34.5756, lng: -60.9478, inspector: 'Ing. Rodríguez', fechaInicio: '2026-07-01', fechaFin: '2027-03-31' },
  { id: 'O005', nombre: 'Iluminación LED Parque', tipo: 'Iluminación', estado: 'en_ejecucion', avance: 85, presupuesto: 2100000, ejecutado: 1785000, contratista: 'Electro Junín SA', barrio: 'Parque', lat: -34.5780, lng: -60.9460, inspector: 'Téc. Sosa', fechaInicio: '2026-06-01', fechaFin: '2026-08-15' },
];

const RECLAMOS_MAPA = [
  { lat: -34.5854, lng: -60.9433, tipo: 'Bache', estado: 'urgente', direccion: 'San Martín y Mitre' },
  { lat: -34.5901, lng: -60.9389, tipo: 'Luminaria', estado: 'pendiente', direccion: 'Belgrano 1234' },
  { lat: -34.5798, lng: -60.9512, tipo: 'Residuos', estado: 'en_proceso', direccion: 'Rivadavia 567' },
  { lat: -34.5823, lng: -60.9505, tipo: 'Bache', estado: 'pendiente', direccion: 'Sarmiento 234' },
  { lat: -34.5867, lng: -60.9421, tipo: 'Arbolado', estado: 'urgente', direccion: 'Alvear 890' },
];

let map, layerObras, layerReclamos, activeInfoPopup;

function initMapa() {
  map = L.map('map', { zoomControl: false }).setView([-34.5854, -60.9433], 14);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Custom zoom control
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Add layers
  layerObras = L.layerGroup();
  layerReclamos = L.layerGroup();

  addObrasMarkers();
  addReclamosMarkers();

  layerObras.addTo(map);
  layerReclamos.addTo(map);

  // Render obras panel
  renderObrasPanel();
}

function getColorObra(estado, avance) {
  if (estado === 'finalizada') return '#10b981';
  if (avance > 70) return '#3b82f6';
  if (avance > 40) return '#f59e0b';
  return '#ef4444';
}

function addObrasMarkers() {
  OBRAS_DATA.forEach(obra => {
    const color = getColorObra(obra.estado, obra.avance);
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:42px;height:42px;border-radius:50%;background:${color}22;border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:transform 0.2s">🏗️</div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });

    const marker = L.marker([obra.lat, obra.lng], { icon }).addTo(layerObras);
    const pct = (obra.ejecutado / obra.presupuesto * 100).toFixed(0);

    marker.bindPopup(`
      <div style="min-width:220px;font-family:Inter,sans-serif">
        <div style="font-weight:800;font-size:13px;margin-bottom:8px">${obra.nombre}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};border:1px solid ${color}55;font-weight:700">
            ${obra.estado === 'finalizada' ? '✅ Finalizada' : '🔨 En ejecución'}
          </span>
        </div>
        <table style="font-size:11px;width:100%;border-collapse:collapse">
          <tr><td style="color:#94a3b8;padding:3px 0">Avance:</td><td><strong>${obra.avance}%</strong></td></tr>
          <tr><td style="color:#94a3b8;padding:3px 0">Contratista:</td><td>${obra.contratista}</td></tr>
          <tr><td style="color:#94a3b8;padding:3px 0">Presupuesto:</td><td><strong>$${(obra.presupuesto/1000000).toFixed(1)}M</strong></td></tr>
          <tr><td style="color:#94a3b8;padding:3px 0">Ejecutado:</td><td style="color:${color}">$${(obra.ejecutado/1000000).toFixed(1)}M (${pct}%)</td></tr>
          <tr><td style="color:#94a3b8;padding:3px 0">Inspector:</td><td>${obra.inspector}</td></tr>
          <tr><td style="color:#94a3b8;padding:3px 0">Vence:</td><td>${obra.fechaFin}</td></tr>
        </table>
        <div style="margin-top:10px;height:6px;background:#1f2937;border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${obra.avance}%;background:${color};border-radius:99px"></div>
        </div>
      </div>
    `, { maxWidth: 280 });
  });
}

function addReclamosMarkers() {
  const colores = { urgente: '#ef4444', pendiente: '#f59e0b', en_proceso: '#3b82f6', resuelto: '#10b981' };
  const emojis = { Bache: '🕳️', Luminaria: '💡', Residuos: '🗑️', Arbolado: '🌳', Agua: '💧' };

  RECLAMOS_MAPA.forEach(r => {
    const color = colores[r.estado] || '#8b5cf6';
    const emoji = emojis[r.tipo] || '📍';
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:34px;height:34px;border-radius:50%;background:${color}22;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:16px">${emoji}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
    const marker = L.marker([r.lat, r.lng], { icon }).addTo(layerReclamos);
    marker.bindPopup(`
      <div style="font-family:Inter,sans-serif">
        <div style="font-weight:800;margin-bottom:6px">${r.tipo}</div>
        <div style="font-size:12px;color:#94a3b8">${r.direccion}</div>
        <div style="margin-top:6px;font-size:11px;padding:3px 10px;border-radius:99px;background:${color}22;color:${color};display:inline-block;font-weight:700">${r.estado.replace('_',' ')}</div>
      </div>
    `);
  });
}

function renderObrasPanel() {
  const panel = document.getElementById('obrasPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div style="font-size:13px;font-weight:800;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      🏗️ Obras Activas
      <span style="font-size:10px;font-weight:600;color:var(--text-muted)">${OBRAS_DATA.filter(o=>o.estado!=='finalizada').length} en curso</span>
    </div>
    ${OBRAS_DATA.map(obra => {
      const color = getColorObra(obra.estado, obra.avance);
      return `<div class="obra-item" onclick="map.flyTo([${obra.lat},${obra.lng}],16,{duration:1})">
        <div style="font-size:11px;font-weight:700;color:var(--text-primary)">${obra.nombre}</div>
        <div style="font-size:10px;color:var(--text-muted)">${obra.barrio} · ${obra.tipo}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
          <div class="obra-progress-bar" style="flex:1;margin-right:8px">
            <div class="obra-progress-fill" style="width:${obra.avance}%;background:${color}"></div>
          </div>
          <span style="font-size:11px;font-weight:800;color:${color}">${obra.avance}%</span>
        </div>
        <div style="font-size:10px;color:var(--text-muted)">$${(obra.presupuesto/1000000).toFixed(1)}M presupuestado</div>
      </div>`;
    }).join('')}
  `;
}

function toggleLayer(layerName, btn) {
  document.querySelectorAll('.layer-btn').forEach(b => b !== btn && b.classList.remove('active'));
  btn.classList.toggle('active');
  
  if (layerName === 'obras') {
    if (map.hasLayer(layerObras)) { map.removeLayer(layerObras); }
    else { layerObras.addTo(map); }
  } else if (layerName === 'reclamos') {
    if (map.hasLayer(layerReclamos)) { map.removeLayer(layerReclamos); }
    else { layerReclamos.addTo(map); }
  }
}

document.addEventListener('DOMContentLoaded', initMapa);
  buildSidebar('mapa');"""
    mapa = mapa[:idx_start] + js_new + mapa[idx_end + len(js_old_end):]

with open('mapa.html', 'w', encoding='utf-8') as f:
    f.write(mapa)

# --- VECINOS.HTML ---
with open('vecinos.html', 'r', encoding='utf-8') as f:
    vec = f.read()

vec_sla = """      </section>

      <!-- SLA DASHBOARD (NYC 311 style) -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <h3 style="font-size:13px;margin:0">⏱️ SLA por Tipo de Reclamo</h3>
          <span style="font-size:11px;color:var(--text-muted)">Compromisos de respuesta públicos</span>
        </div>
        <div style="padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
          <div style="padding:12px;border-radius:10px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);text-align:center">
            <div style="font-size:9px;font-weight:800;color:#ef4444;text-transform:uppercase;letter-spacing:0.5px">Crítico</div>
            <div style="font-size:20px;margin:6px 0">💧</div>
            <div style="font-size:11px;font-weight:800">Agua / Cloacas</div>
            <div style="font-size:18px;font-weight:900;color:#ef4444;font-family:'Outfit',sans-serif">4-8hs</div>
          </div>
          <div style="padding:12px;border-radius:10px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);text-align:center">
            <div style="font-size:9px;font-weight:800;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px">Alta</div>
            <div style="font-size:20px;margin:6px 0">🕳️</div>
            <div style="font-size:11px;font-weight:800">Bache / Arbolado</div>
            <div style="font-size:18px;font-weight:900;color:#f59e0b;font-family:'Outfit',sans-serif">48-72hs</div>
          </div>
          <div style="padding:12px;border-radius:10px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);text-align:center">
            <div style="font-size:9px;font-weight:800;color:#3b82f6;text-transform:uppercase;letter-spacing:0.5px">Media</div>
            <div style="font-size:20px;margin:6px 0">💡</div>
            <div style="font-size:11px;font-weight:800">Luminaria / Tránsito</div>
            <div style="font-size:18px;font-weight:900;color:#3b82f6;font-family:'Outfit',sans-serif">48hs</div>
          </div>
          <div style="padding:12px;border-radius:10px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);text-align:center">
            <div style="font-size:9px;font-weight:800;color:#10b981;text-transform:uppercase;letter-spacing:0.5px">Normal</div>
            <div style="font-size:20px;margin:6px 0">🗑️</div>
            <div style="font-size:11px;font-weight:800">Residuos / Ruidos</div>
            <div style="font-size:18px;font-weight:900;color:#10b981;font-family:'Outfit',sans-serif">24-168hs</div>
          </div>
        </div>
      </div>"""
vec = vec.replace("      </section>", vec_sla)

vec = vec.replace("<th>Estado</th>", "<th>Estado</th>\n                <th>SLA</th>")

vec_portal = """
      <div class="card" style="margin-top:16px;background:linear-gradient(135deg,rgba(59,130,246,0.04),rgba(16,185,129,0.04));border-color:rgba(59,130,246,0.15)">
        <div style="padding:20px;display:flex;flex-wrap:wrap;gap:20px;align-items:center">
          <div style="flex:1;min-width:200px">
            <div style="font-size:16px;font-weight:900;margin-bottom:8px">🔍 Consultar reclamo sin login</div>
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">El vecino puede consultar el estado de su reclamo con el número de seguimiento.</div>
            <div style="display:flex;gap:8px">
              <input id="consultaNumero" placeholder="JUN-2026-001247" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:9px;padding:10px 14px;color:var(--text-primary);font-size:13px;outline:none">
              <button onclick="consultarReclamo()" style="padding:10px 16px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;border-radius:9px;cursor:pointer;font-weight:700">🔍 Consultar</button>
            </div>
          </div>
          <div style="text-align:center">
            <div style="font-size:48px;margin-bottom:4px">📱</div>
            <div style="font-size:11px;color:var(--text-muted)">Portal vecinos:<br><strong style="color:#60a5fa">junin.gob.ar/vecinos</strong></div>
          </div>
        </div>
      </div>
"""
vec = vec.replace("    </div>\n  </main>", vec_portal + "\n    </div>\n  </main>")

vec_geo = """
          <div class="form-group" style="grid-column:1/-1">
            <label>📍 Ubicación</label>
            <div style="display:flex;gap:8px">
              <input type="text" id="rDireccion" placeholder="Dirección o intersección" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 12px;color:var(--text-primary);font-size:13px;outline:none">
              <button type="button" onclick="geolocalizarReclamo()" style="padding:10px 12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;border-radius:8px;cursor:pointer;font-size:13px" title="Obtener mi ubicación">
                🎯
              </button>
            </div>
          </div>"""
vec = vec.replace("""          <div class="form-group" style="grid-column:1/-1">
            <label>Dirección</label>
            <input type="text" id="rDireccion" placeholder="Ej. Av. San Martín 1450" />
          </div>""", vec_geo)

vec_js = """
  <script>
    function geolocalizarReclamo() {
      if (!navigator.geolocation) {
        if (typeof showToast !== 'undefined') showToast('Tu navegador no soporta geolocalización', 'error');
        return;
      }
      if (typeof showToast !== 'undefined') showToast('📍 Obteniendo ubicación...', 'info');
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          const lat = pos.coords.latitude.toFixed(6);
          const lng = pos.coords.longitude.toFixed(6);
          const input = document.getElementById('rDireccion');
          if (input) input.value = `Lat: ${lat}, Lng: ${lng} (Junín)`;
          if (typeof showToast !== 'undefined') showToast('✅ Ubicación obtenida', 'success');
        },
        function() {
          if (typeof showToast !== 'undefined') showToast('No se pudo obtener la ubicación', 'error');
        }
      );
    }

    function consultarReclamo() {
      const numero = document.getElementById('consultaNumero')?.value?.trim();
      if (!numero) {
        if (typeof showToast !== 'undefined') showToast('⚠️ Ingresá el número de reclamo', 'warning');
        return;
      }
      const reclamo = window.MuniDB ? MuniDB.query('reclamos', {numero}).find(r=>r.numero===numero) : null;
      if (reclamo) {
        if (typeof showToast !== 'undefined') showToast(`✅ Reclamo ${numero}: ${reclamo.estado} — ${reclamo.tipo}`, 'success');
      } else {
        const demos = ['JUN-2026-001247', 'JUN-2026-001248', 'JUN-2026-001249'];
        if (demos.includes(numero)) {
          if (typeof showToast !== 'undefined') showToast(`🔍 Reclamo ${numero}: EN PROCESO — SLA cumpliendo`, 'info');
        } else {
          if (typeof showToast !== 'undefined') showToast(`❌ Reclamo ${numero} no encontrado. Verificá el número.`, 'error');
        }
      }
    }
  </script>
</body>"""
vec = vec.replace("</body>", vec_js)

with open('vecinos.html', 'w', encoding='utf-8') as f:
    f.write(vec)

# --- JS/VECINOS.JS ---
with open('js/vecinos.js', 'r', encoding='utf-8') as f:
    js_v = f.read()

js_v = js_v.replace("""      <td><span class="status-badge ${badgeClass}">${r.estado}</span></td>
      <td>""", """      <td><span class="status-badge ${badgeClass}">${r.estado}</span></td>
      <td><span style="font-size:10px;padding:3px 6px;border-radius:6px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2)">A tiempo</span></td>
      <td>""")

with open('js/vecinos.js', 'w', encoding='utf-8') as f:
    f.write(js_v)
