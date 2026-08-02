// ============================================================
// TALLERES.JS — Órdenes de trabajo, flota y stock
// ============================================================

const MECANICOS = ['Roberto Díaz','Héctor Moreno','Luis Fernández','Carlos Suárez'];
const VEHICULOS_FLOTA = [
  { id:'JUN-001', nombre:'Ford F-100', tipo:'Camioneta', area:'Obras Públicas', km:87420, estado:'Operativo', color:'#10b981' },
  { id:'JUN-002', nombre:'VW Amarok',  tipo:'Camioneta', area:'Medio Ambiente', km:54310, estado:'Operativo', color:'#10b981' },
  { id:'JUN-003', nombre:'Toyota Hilux', tipo:'Camioneta', area:'Seguridad', km:112000, estado:'En taller', color:'#f59e0b' },
  { id:'JUN-004', nombre:'Fiat Ducato', tipo:'Utilitario', area:'Salud', km:63200, estado:'Operativo', color:'#10b981' },
  { id:'JUN-005', nombre:'Renault Master', tipo:'Utilitario', area:'Educación', km:43100, estado:'Operativo', color:'#10b981' },
  { id:'JUN-010', nombre:'Volvo FH 460', tipo:'Camión', area:'Servicios Urbanos', km:198000, estado:'En taller', color:'#f59e0b' },
  { id:'JUN-011', nombre:'Mercedes Atego', tipo:'Camión', area:'Obras Públicas', km:156000, estado:'Operativo', color:'#10b981' },
  { id:'JUN-015', nombre:'Mercedes Actros', tipo:'Basura', area:'Higiene Urbana', km:234000, estado:'En taller', color:'#ef4444' },
  { id:'JUN-022', nombre:'Honda CB 190', tipo:'Moto', area:'Inspección', km:18200, estado:'Operativo', color:'#10b981' },
  { id:'JUN-023', nombre:'Yamaha FZ', tipo:'Moto', area:'Inspección', km:22100, estado:'Operativo', color:'#10b981' },
];

const STOCK_ITEMS = [
  { cod:'INS-001', nombre:'Aceite Motor 15W40', cat:'Lubricantes', stock:45, minimo:20, unidad:'litros', precio:3800, critico: false },
  { cod:'INS-002', nombre:'Filtro de Aceite Universal', cat:'Filtros', stock:8, minimo:15, unidad:'unidades', precio:2200, critico: true },
  { cod:'INS-003', nombre:'Pastillas de Freno Delantera', cat:'Frenos', stock:6, minimo:10, unidad:'juegos', precio:12000, critico: true },
  { cod:'INS-004', nombre:'Correa de Distribución', cat:'Motor', stock:3, minimo:5, unidad:'unidades', precio:18000, critico: true },
  { cod:'INS-005', nombre:'Batería 12V 80Ah', cat:'Eléctrico', stock:4, minimo:6, unidad:'unidades', precio:35000, critico: true },
  { cod:'INS-006', nombre:'Neumático 195/70R15', cat:'Neumáticos', stock:12, minimo:8, unidad:'unidades', precio:28000, critico: false },
  { cod:'INS-007', nombre:'Líquido de Frenos DOT4', cat:'Frenos', stock:18, minimo:10, unidad:'litros', precio:2800, critico: false },
  { cod:'INS-008', nombre:'Filtro de Aire', cat:'Filtros', stock:5, minimo:8, unidad:'unidades', precio:3500, critico: true },
  { cod:'INS-009', nombre:'Grasa Lubricante', cat:'Lubricantes', stock:30, minimo:15, unidad:'kg', precio:1200, critico: false },
  { cod:'INS-010', nombre:'Bujías NGK', cat:'Encendido', stock:24, minimo:20, unidad:'unidades', precio:1800, critico: false },
];

const DESCRIPCIONES_OT = [
  'Cambio de aceite y filtros',
  'Reparación de sistema de frenos',
  'Cambio de correa de distribución',
  'Revisión pre-inspección técnica',
  'Reparación de sistema eléctrico',
  'Cambio de neumáticos y balanceo',
  'Alineación y balanceo',
  'Reparación de caja de cambios',
  'Servicio de 10.000 km',
  'Reparación de suspensión',
];

function generarOrdenes(n = 30) {
  const prioridades = ['Urgente','Alta','Normal','Normal','Baja'];
  const estados = ['Abierta','En proceso','En proceso','Completada','Pausada'];
  return Array.from({length: n}, (_, i) => {
    const v = VEHICULOS_FLOTA[Math.floor(Math.random() * VEHICULOS_FLOTA.length)];
    const prioridad = prioridades[Math.floor(Math.random() * prioridades.length)];
    const estado    = estados[Math.floor(Math.random() * estados.length)];
    const dia = String(Math.floor(Math.random() * 28) + 1).padStart(2,'0');
    const mes = String(Math.floor(Math.random() * 7) + 1).padStart(2,'0');
    return {
      id: 2000 + i,
      descripcion: DESCRIPCIONES_OT[Math.floor(Math.random() * DESCRIPCIONES_OT.length)],
      vehiculo: `${v.nombre} · ${v.id}`,
      mecanico: MECANICOS[Math.floor(Math.random() * MECANICOS.length)],
      prioridad,
      inicio: `${dia}/${mes}/2026`,
      estado,
      costo: Math.floor(Math.random() * 80000) + 5000,
    };
  });
}

let todasOrdenes = generarOrdenes();

function renderOrdenes() {
  const filtroEst  = document.getElementById('filtroOrdenEstado')?.value;
  const filtroPrio = document.getElementById('filtroOrdenPrioridad')?.value;
  const filtradas  = todasOrdenes.filter(o =>
    (!filtroEst  || o.estado === filtroEst) &&
    (!filtroPrio || o.prioridad === filtroPrio)
  );
  const prioColor = { 'Urgente':'#ef4444','Alta':'#f59e0b','Normal':'#3b82f6','Baja':'#6b7280' };
  const estBadge  = { 'Abierta':'warning','En proceso':'ok','Completada':'ok','Pausada':'critical' };
  document.getElementById('ordenesBody').innerHTML = filtradas.slice(0,20).map(o => `
    <tr>
      <td style="font-family:monospace;color:var(--text-muted)">#${o.id}</td>
      <td><strong>${o.descripcion}</strong></td>
      <td style="font-size:12px;color:var(--text-secondary)">${o.vehiculo}</td>
      <td style="font-size:12px">${o.mecanico}</td>
      <td><span style="color:${prioColor[o.prioridad]};font-weight:700;font-size:12px">${o.prioridad}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${o.inicio}</td>
      <td><span class="status-badge ${estBadge[o.estado]}">${o.estado}</span></td>
      <td style="font-weight:600">$${o.costo.toLocaleString('es-AR')}</td>
      <td>
        <button class="action-btn" title="Ver detalle">👁</button>
        <button class="action-btn" title="Editar">✏️</button>
      </td>
    </tr>`).join('');
}

function renderVehiculos() {
  const grid = document.getElementById('vehiculosGrid');
  if (!grid) return;
  grid.innerHTML = VEHICULOS_FLOTA.map(v => `
    <div class="vehiculo-card">
      <div class="vehiculo-header">
        <span class="vehiculo-tipo">${v.tipo === 'Camión' || v.tipo === 'Basura' ? '🚛' : v.tipo === 'Moto' ? '🏍️' : '🚙'}</span>
        <div>
          <div class="vehiculo-nombre">${v.nombre}</div>
          <div class="vehiculo-id">${v.id} · ${v.area}</div>
        </div>
        <span class="status-badge ${v.estado === 'Operativo' ? 'ok' : v.estado === 'En taller' ? 'warning' : 'critical'}">${v.estado}</span>
      </div>
      <div class="vehiculo-km">
        <span class="km-label">Kilometraje</span>
        <span class="km-value">${v.km.toLocaleString('es-AR')} km</span>
      </div>
      <div class="vehiculo-bar-wrap">
        <div class="vehiculo-bar" style="width:${Math.min((v.km/250000)*100,100)}%;background:${v.color}"></div>
      </div>
    </div>`).join('');
}

function renderStock() {
  document.getElementById('stockBody').innerHTML = STOCK_ITEMS.map(s => {
    const pct = (s.stock / (s.minimo * 2)) * 100;
    const critico = s.stock < s.minimo;
    return `
      <tr>
        <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${s.cod}</td>
        <td><strong>${s.nombre}</strong></td>
        <td style="font-size:12px;color:var(--text-secondary)">${s.cat}</td>
        <td style="font-weight:700;color:${critico ? 'var(--red)' : 'var(--text-primary)'}">${s.stock} ${s.unidad}</td>
        <td style="color:var(--text-muted);font-size:12px">${s.minimo} ${s.unidad}</td>
        <td style="color:var(--text-muted);font-size:12px">${s.unidad}</td>
        <td>$${s.precio.toLocaleString('es-AR')}</td>
        <td><span class="status-badge ${critico ? 'critical' : 'ok'}">${critico ? '⚠ Crítico' : '✅ OK'}</span></td>
      </tr>`;
  }).join('');
}

// FILTROS
['filtroOrdenEstado','filtroOrdenPrioridad'].forEach(id => document.getElementById(id)?.addEventListener('change', renderOrdenes));

// TABS
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('tab-' + this.dataset.tab)?.classList.add('active');
  });
});

// MODAL
document.getElementById('btnNuevaOrden')?.addEventListener('click', () => { document.getElementById('modalOrden').style.display = 'flex'; });
document.getElementById('btnGuardarOrden')?.addEventListener('click', () => {
  const desc = document.getElementById('otDesc').value;
  if (!desc) { alert('Ingresá una descripción'); return; }
  todasOrdenes.unshift({
    id: 2000 + todasOrdenes.length,
    descripcion: desc,
    vehiculo: document.getElementById('otVehiculo').value,
    mecanico: document.getElementById('otMecanico').value,
    prioridad: document.getElementById('otPrioridad').value,
    inicio: new Date().toLocaleDateString('es-AR'),
    estado: 'Abierta',
    costo: parseInt(document.getElementById('otCosto').value) || 0,
  });
  renderOrdenes();
  document.getElementById('modalOrden').style.display = 'none';
});

// ANIMATE KPIs
function animateKPIs() {
  document.querySelectorAll('.kpi-value[data-target]').forEach((el, i) => {
    const target = parseInt(el.dataset.target);
    const isMoney = el.classList.contains('money');
    const duration = 1400;
    const start = performance.now();
    setTimeout(() => {
      function update(now) {
        const p = Math.min((now - start) / duration, 1);
        const e = 1 - Math.pow(1 - p, 4);
        const v = Math.floor(e * target);
        el.textContent = isMoney ? '$' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v.toLocaleString('es-AR')) : v.toLocaleString('es-AR');
        if (p < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    }, i * 80);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('talleres');
  animateKPIs();
  renderOrdenes();
  renderVehiculos();
  renderStock();
});

