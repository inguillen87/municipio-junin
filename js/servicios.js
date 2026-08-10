// ============================================================
// SERVICIOS.JS — Estación de Servicios Municipal
// ============================================================

const VEHICULOS_SVC = [
  'Ford F-100 · JUN-001','VW Amarok · JUN-002','Toyota Hilux · JUN-003',
  'Fiat Ducato · JUN-004','Renault Master · JUN-005','Volvo FH 460 · JUN-010',
  'Mercedes Atego · JUN-011','Mercedes Actros · JUN-015','Honda CB 190 · JUN-022','Yamaha FZ · JUN-023',
];
const CONDUCTORES = ['Roberto Díaz','Carlos Herrera','Miguel Torres','Ana Sánchez','Pablo Fernández','Luis García'];

function genPatente(id) {
  const n = parseInt(id.split('-')[1]);
  return `AB ${(100 + n).toString().padStart(3,'0')} CD`;
}

function generarCargas(n = 60) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const v = VEHICULOS_SVC[Math.floor(Math.random() * VEHICULOS_SVC.length)];
    const tipo = Math.random() > 0.4 ? 'Gasoil' : 'Nafta';
    const litros = Math.round((Math.random() * 60 + 10) * 2) / 2;
    const precio = tipo === 'Gasoil' ? 980 : 1100;
    const dia = String(Math.floor(Math.random() * 28) + 1).padStart(2,'0');
    const mes = String(Math.floor(Math.random() * 7) + 1).padStart(2,'0');
    const hora = `${String(Math.floor(Math.random() * 10) + 7).padStart(2,'0')}:${Math.random() > 0.5 ? '30' : '00'}`;
    arr.push({
      fecha: `${dia}/${mes}/2026 ${hora}`,
      vehiculo: v,
      patente: genPatente(v),
      tipo,
      litros,
      precio,
      total: Math.round(litros * precio),
      conductor: CONDUCTORES[Math.floor(Math.random() * CONDUCTORES.length)],
      km: Math.floor(Math.random() * 150000) + 20000,
    });
  }
  return arr.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

let todasCargas = generarCargas();
let cargasFiltradas = [...todasCargas];

function renderCargas() {
  const fv = document.getElementById('filtroVehiculo')?.value;
  const ft = document.getElementById('filtroTipoC')?.value;
  cargasFiltradas = todasCargas.filter(c =>
    (!fv || c.vehiculo === fv) &&
    (!ft || c.tipo === ft)
  );
  const tipoColor = { 'Gasoil': '#3b82f6', 'Nafta': '#f59e0b' };
  document.getElementById('cargasBody').innerHTML = cargasFiltradas.slice(0, 25).map(c => `
    <tr>
      <td style="font-size:12px;color:var(--text-muted)">${c.fecha}</td>
      <td style="font-size:12px"><strong>${c.vehiculo}</strong></td>
      <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${c.patente}</td>
      <td><span style="background:${tipoColor[c.tipo]}22;color:${tipoColor[c.tipo]};border:1px solid ${tipoColor[c.tipo]}55;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700">${c.tipo}</span></td>
      <td style="font-weight:700">${c.litros} L</td>
      <td style="color:var(--text-secondary)">$${c.precio.toLocaleString('es-AR')}</td>
      <td style="font-weight:700;color:var(--amber)">$${c.total.toLocaleString('es-AR')}</td>
      <td style="font-size:12px">${c.conductor}</td>
      <td style="font-size:12px;color:var(--text-muted)">${c.km.toLocaleString('es-AR')} km</td>
    </tr>`).join('');
}

function initConsumoCharts() {
  if (window.consumoInited) return;
  window.consumoInited = true;

  // Top 10 consumidores
  const consumoPorVehiculo = {};
  todasCargas.forEach(c => {
    consumoPorVehiculo[c.vehiculo] = (consumoPorVehiculo[c.vehiculo] || 0) + c.litros;
  });
  const sorted = Object.entries(consumoPorVehiculo).sort((a,b) => b[1]-a[1]).slice(0,10);
  new Chart(document.getElementById('consumoBarChart'), {
    type: 'bar',
    data: {
      labels: sorted.map(x => x[0].split(' · ')[0]),
      datasets: [{ label:'Litros', data: sorted.map(x => x[1].toFixed(0)), backgroundColor: 'rgba(59,130,246,0.4)', borderColor: '#3b82f6', borderWidth:1.5, borderRadius:6 }]
    },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#111d35',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,callbacks:{label:ctx=>` ${ctx.parsed.x} litros`}} }, scales:{ x:{grid:{color:'rgba(255,255,255,0.05)'},border:{display:false}}, y:{grid:{display:false},border:{display:false},ticks:{font:{size:11}}} } },
  });

  // Consumo diario
  const dias = Array.from({length:10}, (_,i) => `${22-i}/08`).reverse();
  const litrosDia = dias.map(() => Math.floor(Math.random() * 300) + 150);
  const grad = document.getElementById('consumoDiarioChart').getContext('2d').createLinearGradient(0,0,0,200);
  grad.addColorStop(0,'rgba(245,158,11,0.3)'); grad.addColorStop(1,'rgba(245,158,11,0)');
  new Chart(document.getElementById('consumoDiarioChart'), {
    type:'line',
    data:{ labels:dias, datasets:[{ label:'Litros', data:litrosDia, borderColor:'#f59e0b', backgroundColor:grad, borderWidth:2.5, fill:true, tension:0.4, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#f59e0b' }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#111d35',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,callbacks:{label:ctx=>` ${ctx.parsed.y} L`}} }, scales:{ x:{grid:{display:false},border:{display:false}}, y:{grid:{color:'rgba(255,255,255,0.05)'},border:{display:false},ticks:{callback:v=>v+'L'}} } },
  });
}

function renderTanques() {
  const tanques = [
    { nombre:'Nafta Premium', capacidad:10000, actual:4820, color:'#f59e0b' },
    { nombre:'Gasoil',        capacidad:15000, actual:7340, color:'#3b82f6' },
    { nombre:'Aceite Motor',  capacidad:500,   actual:380,  color:'#10b981' },
  ];
  document.getElementById('tanquesList').innerHTML = tanques.map(t => {
    const pct = Math.round((t.actual / t.capacidad) * 100);
    const critico = pct < 50;
    return `<div class="entidad-item" style="margin-bottom:16px">
      <div class="entidad-header">
        <span class="entidad-name"><span>${t.nombre}</span></span>
        <span class="entidad-pct" style="color:${critico ? 'var(--red)' : t.color}">${t.actual.toLocaleString('es-AR')} / ${t.capacidad.toLocaleString('es-AR')} L (${pct}%)</span>
      </div>
      <div class="entidad-bar-wrap"><div class="entidad-bar" style="width:${pct}%;background:${critico ? 'var(--red)' : t.color}"></div></div>
      ${critico ? '<span style="font-size:11px;color:var(--red)">⚠ Nivel bajo — solicitar reposición</span>' : ''}
    </div>`;
  }).join('');

  document.getElementById('reposicionFeed').innerHTML = [
    { texto: 'Recepción <strong>5.000 L Gasoil</strong> — Proveedor YPF', tiempo: 'Hace 3 días', color: '#3b82f6' },
    { texto: 'Recepción <strong>3.000 L Nafta Premium</strong> — Proveedor Shell', tiempo: 'Hace 8 días', color: '#f59e0b' },
    { texto: 'Pedido de reposición enviado a <strong>YPF</strong>', tiempo: 'Hace 10 días', color: '#10b981' },
    { texto: 'Recepción <strong>200 L Aceite Motor</strong>', tiempo: 'Hace 15 días', color: '#8b5cf6' },
    { texto: 'Recepción <strong>8.000 L Gasoil</strong> — Proveedor YPF', tiempo: 'Hace 22 días', color: '#3b82f6' },
  ].map(a => `<div class="activity-item">
    <div class="activity-dot" style="background:${a.color};box-shadow:0 0 6px ${a.color}88"></div>
    <div class="activity-content">
      <div class="activity-text">${a.texto}</div>
      <div class="activity-time">${a.tiempo}</div>
    </div></div>`).join('');
}

// PROGRESS BARS on load
function animateProgressBars() {
  setTimeout(() => {
    const sb = document.getElementById('stockBar');
    const gb = document.getElementById('gasoilBar');
    if (sb) sb.style.width = '48%';
    if (gb) gb.style.width = '49%';
  }, 500);
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
      if (this.dataset.tab === 'consumo') initConsumoCharts();
      if (this.dataset.tab === 'stock')   renderTanques();
    }
  });
});

// FILTROS
['filtroVehiculo','filtroTipoC'].forEach(id => document.getElementById(id)?.addEventListener('change', renderCargas));

// MODAL CARGA
document.getElementById('btnNuevaCarga')?.addEventListener('click', () => { document.getElementById('modalCarga').style.display='flex'; });
document.getElementById('btnGuardarCarga')?.addEventListener('click', () => {
  const litros  = parseFloat(document.getElementById('cLitros').value);
  const vehiculo = document.getElementById('cVehiculo').value;
  if (!litros || litros <= 0) { alert('Ingresá los litros cargados'); return; }
  const tipo   = document.getElementById('cTipo').value;
  const precio = parseInt(document.getElementById('cPrecio').value) || (tipo === 'Gasoil' ? 980 : 1100);
  const cond   = document.getElementById('cConductor').value;
  const km     = parseInt(document.getElementById('cKm').value) || 0;
  todasCargas.unshift({ fecha: new Date().toLocaleString('es-AR'), vehiculo, patente: genPatente(vehiculo), tipo, litros, precio, total: Math.round(litros * precio), conductor: cond, km });
  renderCargas();
  document.getElementById('modalCarga').style.display = 'none';
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
  buildSidebar('servicios');
  animateKPIs();
  animateProgressBars();
  renderCargas();
  renderTanques();
});

