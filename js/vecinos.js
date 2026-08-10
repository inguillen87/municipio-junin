// ============================================================
// VECINOS.JS — Portal del Vecino: Reclamos y Turnos
// ============================================================

var RECLAMOS = [
  { id:'REC-0892', tipo:'Bache', direccion:'Av. San Martín 1450', desc:'Bache de 50cm en cruce peatonal, peligroso para autos', estado:'En Proceso', fecha:'2026-07-28', vecino:'Juan G.' },
  { id:'REC-0891', tipo:'Luminaria', direccion:'Calle Belgrano 830', desc:'Luminaria apagada hace 3 días, zona muy oscura de noche', estado:'Pendiente', fecha:'2026-07-27', vecino:'Ana M.' },
  { id:'REC-0890', tipo:'Arbolado', direccion:'Av. República 2200', desc:'Árbol caído sobre la vereda bloqueando paso', estado:'Resuelto', fecha:'2026-07-25', vecino:'Carlos R.' },
  { id:'REC-0889', tipo:'Basura', direccion:'Calle Mitre 560', desc:'Contenedor de basura desbordado hace 4 días', estado:'Pendiente', fecha:'2026-07-24', vecino:'María L.' },
  { id:'REC-0888', tipo:'Ruidos', direccion:'Av. Libertad 780', desc:'Bar con música muy alta todos los días hasta las 4am', estado:'En Proceso', fecha:'2026-07-22', vecino:'Roberto F.' },
  { id:'REC-0887', tipo:'Agua', direccion:'Calle Rivadavia 1200', desc:'Pérdida de agua potable en la calzada desde hace una semana', estado:'Resuelto', fecha:'2026-07-20', vecino:'Laura P.' },
  { id:'REC-0886', tipo:'Bache', direccion:'Calle Mendoza 340', desc:'Múltiples baches en mal estado que dañan vehículos', estado:'Pendiente', fecha:'2026-07-19', vecino:'Diego S.' },
  { id:'REC-0885', tipo:'Luminaria', direccion:'Parque Municipal - Sector B', desc:'5 columnas de luz sin funcionar en el parque central', estado:'En Proceso', fecha:'2026-07-18', vecino:'Silvia T.' },
  { id:'REC-0884', tipo:'Otro', direccion:'Av. Perón 450', desc:'Semáforo peatonal sin funcionar en esquina de alta concurrencia', estado:'Resuelto', fecha:'2026-07-15', vecino:'Pablo M.' },
  { id:'REC-0883', tipo:'Gas', direccion:'Calle Urquiza 890', desc:'Olor a gas en la calle, posible pérdida en la red', estado:'Resuelto', fecha:'2026-07-12', vecino:'Claudia V.' },
];

let reclamosFiltrados = [...RECLAMOS];
let filtroEstadoActual = '';

function renderReclamos() {
  const tbody = document.getElementById('reclamosBody');
  if (!tbody) return;
  tbody.innerHTML = reclamosFiltrados.map(r => {
    let badgeClass = 'warning';
    if (r.estado === 'En Proceso') badgeClass = 'info';
    if (r.estado === 'Resuelto') badgeClass = 'ok';
    
    return `<tr>
      <td style="color:var(--text-muted);font-size:11px">${r.id}</td>
      <td><strong>${r.vecino}</strong></td>
      <td>${r.tipo}</td>
      <td style="color:var(--text-secondary);font-size:12px">${r.direccion}</td>
      <td style="color:var(--text-secondary);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.desc}">${r.desc}</td>
      <td style="color:var(--text-muted);font-size:12px">${r.fecha}</td>
      <td><span class="status-badge ${badgeClass}">${r.estado}</span></td>
      <td><span style="font-size:10px;padding:3px 6px;border-radius:6px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2)">A tiempo</span></td>
      <td><span style="font-size:10px;padding:3px 6px;border-radius:6px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2)">A tiempo</span></td>
      <td>
        <button class="action-btn" onclick="verDetalle('${r.id}')" title="Ver Detalle">👁</button>
        ${r.estado === 'Pendiente' ? `<button class="action-btn" onclick="escalarReclamo('${r.id}')" title="Escalar a En Proceso">⬆️</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  
  const countEl = document.getElementById('reclamosCount');
  if (countEl) countEl.textContent = `Mostrando ${reclamosFiltrados.length} reclamos`;
  actualizarKPIs();
}

function verDetalle(id) {
  const r = RECLAMOS.find(x => x.id === id);
  if (!r) return;
  
  const body = document.getElementById('detalleBody');
  body.innerHTML = `
    <div style="margin-bottom: 15px;">
      <strong>ID:</strong> ${r.id} <br/>
      <strong>Vecino:</strong> ${r.vecino} <br/>
      <strong>Fecha:</strong> ${r.fecha} <br/>
      <strong>Tipo:</strong> ${r.tipo} <br/>
      <strong>Dirección:</strong> ${r.direccion} <br/>
      <strong>Estado:</strong> <span style="font-weight:bold; color:var(--primary)">${r.estado}</span>
    </div>
    <div style="background: var(--bg-card-alt, #f8fafc); padding: 12px; border-radius: 6px; margin-bottom: 15px;">
      <strong>Descripción:</strong><br/>
      ${r.desc}
    </div>
    <div>
      <h4>Historial</h4>
      <ul style="padding-left:20px; font-size:13px; color:var(--text-secondary)">
        <li>${r.fecha} - Reclamo creado (${r.estado})</li>
      </ul>
    </div>
  `;
  document.getElementById('modalDetalle').style.display = 'flex';
}

function escalarReclamo(id) {
  const r = RECLAMOS.find(x => x.id === id);
  if (r && r.estado === 'Pendiente') {
    r.estado = 'En Proceso';
    filtrarReclamos();
    if(typeof showToast !== 'undefined') showToast(`Reclamo ${id} escalado a En Proceso`, 'success');
  }
}

// FILTROS
document.getElementById('filtroTipo')?.addEventListener('change', filtrarReclamos);
document.getElementById('searchReclamo')?.addEventListener('input', filtrarReclamos);

document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    filtroEstadoActual = this.dataset.status;
    filtrarReclamos();
  });
});

function filtrarReclamos() {
  const tipo  = document.getElementById('filtroTipo')?.value || '';
  const q     = document.getElementById('searchReclamo')?.value.toLowerCase() || '';
  
  reclamosFiltrados = RECLAMOS.filter(r =>
    (!tipo || r.tipo === tipo) &&
    (!filtroEstadoActual || r.estado === filtroEstadoActual) &&
    (!q || r.direccion.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.vecino.toLowerCase().includes(q))
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

// CHARTS
function initTiposCharts() {
  if (window.tiposChartInited) return;
  window.tiposChartInited = true;
  
  const TIPOS = ['Bache', 'Luminaria', 'Arbolado', 'Ruidos', 'Basura', 'Agua', 'Gas', 'Otro'];
  const conteos = TIPOS.map(t => RECLAMOS.filter(r => r.tipo === t).length);
  const colores = ['#3b82f6','#f59e0b','#10b981','#8b5cf6','#06b6d4','#ef4444','#ec4899','#64748b'];

  new Chart(document.getElementById('tiposChart'), {
    type: 'doughnut',
    data: { labels: TIPOS, datasets: [{ data: conteos, backgroundColor: colores.map(c => c+'bb'), borderColor: colores, borderWidth: 1.5, hoverOffset: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout:'60%', plugins: { legend: { position:'right', labels:{boxWidth:12,boxHeight:12,padding:12} }, tooltip: { backgroundColor:'#111d35', borderColor:'rgba(255,255,255,0.1)', borderWidth:1 } } },
  });

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago'];
  const evol = meses.map(() => Math.floor(Math.random() * 60) + 20);
  const ctx = document.getElementById('evolucionChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0,0,0,220);
  gradient.addColorStop(0,'rgba(139,92,246,0.3)');
  gradient.addColorStop(1,'rgba(139,92,246,0)');
  new Chart(document.getElementById('evolucionChart'), {
    type: 'line',
    data: { labels: meses, datasets: [{ label:'Reclamos', data: evol, borderColor:'#8b5cf6', backgroundColor: gradient, borderWidth:2.5, fill:true, tension:0.4, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#8b5cf6' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#111d35',borderColor:'rgba(255,255,255,0.1)',borderWidth:1} }, scales:{ x:{grid:{display:false},border:{display:false}}, y:{grid:{color:'rgba(255,255,255,0.05)'},border:{display:false}} } },
  });
}

// MODAL NUEVO RECLAMO
document.getElementById('btnNuevoReclamo')?.addEventListener('click', () => { 
  document.getElementById('modalReclamo').style.display='flex'; 
});

document.getElementById('btnGuardarReclamo')?.addEventListener('click', () => {
  const vecino = document.getElementById('rNombre')?.value || 'Usuario Anónimo';
  const tipo   = document.getElementById('rTipo').value;
  const dir    = document.getElementById('rDireccion').value;
  const desc   = document.getElementById('rDescripcion').value;
  
  if (!dir || !desc) { 
    alert('Completá la dirección y descripción del reclamo'); 
    return; 
  }
  
  const idStr = 'REC-' + String(Math.floor(Math.random() * 9000) + 1000);
  
  RECLAMOS.unshift({ 
    id: idStr, 
    vecino, 
    tipo, 
    direccion: dir, 
    desc: desc,
    fecha: new Date().toISOString().split('T')[0], 
    estado: 'Pendiente' 
  });
  
  filtrarReclamos();
  document.getElementById('modalReclamo').style.display = 'none';
  
  // Limpiar campos
  document.getElementById('rDireccion').value = '';
  document.getElementById('rDescripcion').value = '';
  if(document.getElementById('rNombre')) document.getElementById('rNombre').value = '';
  
  if(typeof showToast !== 'undefined') showToast('✅ Reclamo enviado correctamente', 'success');
});

// EXPORTAR
document.querySelector('.btn-export')?.addEventListener('click', () => {
  if (typeof XLSX === 'undefined') {
    if(typeof showToast !== 'undefined') showToast('Error: SheetJS no cargado', 'error');
    else alert('Error: SheetJS no cargado');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(RECLAMOS);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reclamos");
  XLSX.writeFile(wb, "Reclamos_Vecinales.xlsx");
  if(typeof showToast !== 'undefined') showToast('✅ Excel exportado', 'success');
});

// ANIMACIÓN KPIs
function actualizarKPIs() {
  const total = RECLAMOS.length;
  const pendientes = RECLAMOS.filter(r => r.estado === 'Pendiente').length;
  const enProceso = RECLAMOS.filter(r => r.estado === 'En Proceso').length;
  const resueltos = RECLAMOS.filter(r => r.estado === 'Resuelto').length;
  
  const vals = document.querySelectorAll('.kpi-value[data-target]');
  if(vals[0]) { vals[0].dataset.target = total; vals[0].textContent = total; }
  if(vals[1]) { vals[1].dataset.target = pendientes; vals[1].textContent = pendientes; }
  if(vals[2]) { vals[2].dataset.target = resueltos; vals[2].textContent = resueltos; }
  
  // Animación simple para los números
  vals.forEach(el => {
    const target = parseInt(el.dataset.target);
    const current = parseInt(el.textContent) || 0;
    if(target !== current) {
      el.textContent = target; // Omitimos animación compleja para simplicidad
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof buildSidebar !== 'undefined') buildSidebar('vecinos');
  renderReclamos();
});

