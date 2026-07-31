// ============================================================
// VECINOS.JS — Portal del Vecino: Reclamos y Turnos
// ============================================================

const TIPOS_RECLAMO = ['Baches y Pavimento','Alumbrado Público','Recolección de Basura','Poda de Árboles','Agua y Cloacas','Ruidos Molestos','Otros'];
const AREAS_MAP = { 'Baches y Pavimento':'Obras Públicas','Alumbrado Público':'Alumbrado','Recolección de Basura':'Servicios Urbanos','Poda de Árboles':'Medio Ambiente','Agua y Cloacas':'Obras Públicas','Ruidos Molestos':'Seguridad','Otros':'Intendencia' };
const NOMBRES_VECINOS = ['María González','Carlos Fernández','Ana Rodríguez','Jorge Pérez','Laura Martínez','Pablo López','Sofía Torres','Diego Ramírez','Valentina García','Martín Sánchez','Lucía Castro','Federico Morales','Camila Ruiz','Agustín Díaz','Natalia Herrera'];
const CALLES = ['Av. Rivadavia','Calle Mitre','San Martín','Belgrano','Sarmiento','Av. Italia','Pringles','Alsina','Chacabuco','Av. República'];
const ESTADOS_RECLAMO = { 'Pendiente': 'warning', 'En proceso': 'ok', 'Resuelto': 'ok' };
const ESTADO_STYLES = { 'Pendiente': 'warning', 'En proceso': 'ok', 'Resuelto': 'ok' };

function generarReclamos(n = 80) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const tipo = TIPOS_RECLAMO[Math.floor(Math.random() * TIPOS_RECLAMO.length)];
    const estados = ['Pendiente','Pendiente','En proceso','Resuelto','Resuelto','Resuelto'];
    const estado = estados[Math.floor(Math.random() * estados.length)];
    const dia = String(Math.floor(Math.random() * 28) + 1).padStart(2,'0');
    const mes = String(Math.floor(Math.random() * 7) + 1).padStart(2,'0');
    arr.push({
      id: 5000 + i,
      vecino: NOMBRES_VECINOS[Math.floor(Math.random() * NOMBRES_VECINOS.length)],
      tipo,
      direccion: `${CALLES[Math.floor(Math.random() * CALLES.length)]} ${Math.floor(Math.random() * 2000) + 100}`,
      fecha: `${dia}/${mes}/2026`,
      area: AREAS_MAP[tipo],
      estado,
    });
  }
  return arr;
}

let todosReclamos = generarReclamos(318);
let reclamosFiltrados = [...todosReclamos];

function renderReclamos() {
  const tbody = document.getElementById('reclamosBody');
  const slice = reclamosFiltrados.slice(0, 25);
  tbody.innerHTML = slice.map(r => {
    const badge = { 'Pendiente': 'warning', 'En proceso': 'ok', 'Resuelto': 'ok' }[r.estado];
    const label = { 'Pendiente': 'Pendiente', 'En proceso': 'En proceso', 'Resuelto': 'Resuelto' }[r.estado];
    return `<tr>
      <td style="color:var(--text-muted);font-size:11px">#${r.id}</td>
      <td><strong>${r.vecino}</strong></td>
      <td>${r.tipo}</td>
      <td style="color:var(--text-secondary);font-size:12px">${r.direccion}</td>
      <td style="color:var(--text-muted);font-size:12px">${r.fecha}</td>
      <td style="font-size:12px">${r.area}</td>
      <td><span class="status-badge ${badge}">${label}</span></td>
      <td>
        <button class="action-btn" onclick="alert('Reclamo #${r.id}\\n${r.vecino}\\n${r.tipo}\\n${r.direccion}\\nEstado: ${r.estado}')">👁</button>
        <button class="action-btn" onclick="cambiarEstado(${r.id})">✏️</button>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('reclamosCount').textContent = `Mostrando ${Math.min(25, reclamosFiltrados.length)} de ${reclamosFiltrados.length} reclamos`;
}

function cambiarEstado(id) {
  const r = todosReclamos.find(x => x.id === id);
  if (!r) return;
  const estados = ['Pendiente','En proceso','Resuelto'];
  const idx = (estados.indexOf(r.estado) + 1) % 3;
  r.estado = estados[idx];
  reclamosFiltrados = [...todosReclamos];
  renderReclamos();
}

// FILTROS
['filtroTipo','filtroEstadoR'].forEach(id => document.getElementById(id)?.addEventListener('change', filtrarReclamos));
document.getElementById('searchReclamo')?.addEventListener('input', filtrarReclamos);
function filtrarReclamos() {
  const tipo  = document.getElementById('filtroTipo').value;
  const estado = document.getElementById('filtroEstadoR').value;
  const q     = document.getElementById('searchReclamo').value.toLowerCase();
  reclamosFiltrados = todosReclamos.filter(r =>
    (!tipo   || r.tipo === tipo) &&
    (!estado || r.estado === estado) &&
    (!q      || r.vecino.toLowerCase().includes(q) || r.direccion.toLowerCase().includes(q))
  );
  renderReclamos();
}

// TABS
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    const tab = document.getElementById('tab-' + this.dataset.tab);
    if (tab) {
      tab.classList.add('active');
      if (this.dataset.tab === 'tipos') initTiposCharts();
    }
  });
});

// TURNOS
const TIPOS_TRAMITE = ['Habilitación Comercial','Certificado de Residencia','Libre Deuda','Permiso de Obra','Reclamo de Servicio','Consulta Catastral','Trámite RRHH'];
function generarTurnos() {
  const horas = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','14:00','14:30','15:00','15:30'];
  const estados = ['Confirmado','Pendiente','Atendido'];
  return Array.from({length: 20}, (_, i) => ({
    hora: horas[i % horas.length],
    tramite: TIPOS_TRAMITE[Math.floor(Math.random() * TIPOS_TRAMITE.length)],
    vecino: NOMBRES_VECINOS[Math.floor(Math.random() * NOMBRES_VECINOS.length)],
    estado: estados[Math.floor(Math.random() * estados.length)],
  }));
}

function renderTurnos() {
  const grid = document.getElementById('turnosGrid');
  if (!grid) return;
  const turnos = generarTurnos();
  grid.innerHTML = turnos.map(t => {
    const color = { 'Confirmado':'#10b981','Pendiente':'#f59e0b','Atendido':'#3b82f6' }[t.estado];
    return `<div class="turno-card" style="border-left:3px solid ${color}">
      <div class="turno-hora">${t.hora}</div>
      <div class="turno-info">
        <span class="turno-vecino">${t.vecino}</span>
        <span class="turno-tramite">${t.tramite}</span>
      </div>
      <span class="status-badge" style="background:${color}22;color:${color};border-color:${color}55">${t.estado}</span>
    </div>`;
  }).join('');
}

// CHARTS
function initTiposCharts() {
  if (window.tiposChartInited) return;
  window.tiposChartInited = true;
  const conteos = TIPOS_RECLAMO.map(t => todosReclamos.filter(r => r.tipo === t).length);
  const colores = ['#3b82f6','#f59e0b','#10b981','#8b5cf6','#06b6d4','#ef4444','#ec4899'];

  new Chart(document.getElementById('tiposChart'), {
    type: 'doughnut',
    data: { labels: TIPOS_RECLAMO, datasets: [{ data: conteos, backgroundColor: colores.map(c => c+'bb'), borderColor: colores, borderWidth: 1.5, hoverOffset: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout:'60%', plugins: { legend: { position:'right', labels:{boxWidth:12,boxHeight:12,padding:12} }, tooltip: { backgroundColor:'#111d35', borderColor:'rgba(255,255,255,0.1)', borderWidth:1 } } },
  });

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago'];
  const evol = meses.map(() => Math.floor(Math.random() * 60) + 20);
  const gradient = document.getElementById('evolucionChart').getContext('2d').createLinearGradient(0,0,0,220);
  gradient.addColorStop(0,'rgba(139,92,246,0.3)');
  gradient.addColorStop(1,'rgba(139,92,246,0)');
  new Chart(document.getElementById('evolucionChart'), {
    type: 'line',
    data: { labels: meses, datasets: [{ label:'Reclamos', data: evol, borderColor:'#8b5cf6', backgroundColor: gradient, borderWidth:2.5, fill:true, tension:0.4, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#8b5cf6' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#111d35',borderColor:'rgba(255,255,255,0.1)',borderWidth:1} }, scales:{ x:{grid:{display:false},border:{display:false}}, y:{grid:{color:'rgba(255,255,255,0.05)'},border:{display:false}} } },
  });
}

// MODAL RECLAMO
document.getElementById('btnNuevoReclamo')?.addEventListener('click', () => { document.getElementById('modalReclamo').style.display='flex'; });
document.getElementById('btnGuardarReclamo')?.addEventListener('click', () => {
  const vecino = document.getElementById('rNombre').value;
  const tipo   = document.getElementById('rTipo').value;
  const dir    = document.getElementById('rDireccion').value;
  if (!vecino || !dir) { alert('Completá nombre y dirección'); return; }
  todosReclamos.unshift({ id: 5000 + todosReclamos.length, vecino, tipo, direccion: dir, fecha: new Date().toLocaleDateString('es-AR'), area: AREAS_MAP[tipo], estado: 'Pendiente' });
  reclamosFiltrados = [...todosReclamos];
  renderReclamos();
  document.getElementById('modalReclamo').style.display = 'none';
});

// ANIMACIÓN KPIs
function animateKPIs() {
  document.querySelectorAll('.kpi-value[data-target]').forEach((el, i) => {
    const target = parseInt(el.dataset.target);
    const isMoney = el.classList.contains('money');
    const isPct   = el.classList.contains('pct');
    const duration = 1400;
    const start = performance.now();
    setTimeout(() => {
      function update(now) {
        const p = Math.min((now - start) / duration, 1);
        const e = 1 - Math.pow(1 - p, 4);
        const v = Math.floor(e * target);
        el.textContent = isMoney ? '$' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v.toLocaleString('es-AR'))
                       : isPct ? v + '%' : v.toLocaleString('es-AR');
        if (p < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    }, i * 80);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('vecinos');
  animateKPIs();
  renderReclamos();
  renderTurnos();
});
