import re

content = open('mapa.html', 'r', encoding='utf-8').read()

# 1. Update coordinates
content = content.replace('.setView([-34.5854, -60.9433], 14)', '.setView([-34.5875, -60.9458], 14)')
content = content.replace('map = L.map', 'window.mapInstance = map = L.map')

# 2. Add loadObrasOnMap
js_code = '''
function loadObrasOnMap() {
  if (!window.MuniDB || !window.mapInstance) return;
  const obras = MuniDB.getAll('obras');
  obras.forEach(function(o) {
    if (!o.lat || !o.lng) return;
    const colors = { en_ejecucion: '#f59e0b', finalizada: '#10b981', licitacion: '#8b5cf6', planificacion: '#3b82f6' };
    const color = colors[o.estado] || '#64748b';
    const marker = L.circleMarker([o.lat, o.lng], {
      radius: 10, fillColor: color, color: 'white',
      weight: 2, opacity: 1, fillOpacity: 0.9
    }).addTo(window.mapInstance);
    marker.bindPopup(`
      <div style="min-width:200px;font-family:'Inter',sans-serif">
        <div style="font-weight:800;margin-bottom:4px">${o.nombre}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:8px">${o.barrio}</div>
        <div style="margin-bottom:6px">
          <div style="height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${o.avance||0}%;background:${color}"></div>
          </div>
          <div style="font-size:11px;margin-top:2px">${o.avance||0}% avance</div>
        </div>
        <div style="font-size:11px">Contratista: ${o.contratista||'-'}</div>
      </div>
    `);
  });
  console.log('[Mapa] Loaded', obras.length, 'obras on map');
}
document.addEventListener('DOMContentLoaded', () => { setTimeout(loadObrasOnMap, 1000); });
'''

content = content.replace('</body>', f'<script>\n{js_code}\n</script>\n</body>')

with open('mapa.html', 'w', encoding='utf-8') as f:
    f.write(content)
