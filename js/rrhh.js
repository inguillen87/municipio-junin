// ============================================================
// RRHH.JS — Lógica del módulo de Recursos Humanos
// ============================================================

const NOMBRES = ['Ana García','Carlos López','María Fernández','Juan Rodríguez','Laura Martínez',
  'Diego Pérez','Sofía Sánchez','Martín González','Valentina Torres','Pablo Ramírez',
  'Lucía Flores','Federico Castro','Camila Herrera','Agustín Morales','Natalia Jiménez',
  'Sebastián Ruiz','Daniela Romero','Nicolás Díaz','Florencia Vargas','Emanuel Acosta'];

const CARGOS = {
  'Salud': ['Médico/a','Enfermero/a','Administrativo/a Salud','Técnico Laboratorio','Camillero/a'],
  'Obras Públicas': ['Operario/a Vial','Inspector/a Obras','Topógrafo/a','Administrativo/a','Jefe de Cuadrilla'],
  'Educación': ['Docente','Coordinador/a','Auxiliar Escolar','Inspector/a Educativo'],
  'Seguridad': ['Inspector/a Municipal','Coordinador/a Tránsito','Operador/a CCTV'],
  'Hacienda': ['Contador/a','Analista Financiero','Cajero/a','Asesor/a Impositivo'],
  'Medio Ambiente': ['Inspector/a Ambiental','Técnico Reciclaje','Guardaparque'],
  'Cultura y Turismo': ['Promotor/a Cultural','Guía Turístico','Técnico Eventos'],
  'Intendencia': ['Asesor/a','Secretario/a Privado','Coordinador/a General'],
};

const SECRETARIAS = Object.keys(CARGOS);
const COLORES_AVATAR = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'];

// Generar empleados simulados
function generarEmpleados(cantidad = 1247) {
  const empleados = [];
  for (let i = 0; i < cantidad; i++) {
    const sec = SECRETARIAS[Math.floor(Math.random() * SECRETARIAS.length)];
    const cargos = CARGOS[sec];
    const cargo = cargos[Math.floor(Math.random() * cargos.length)];
    const nombre = NOMBRES[Math.floor(Math.random() * NOMBRES.length)];
    const hsExtra = Math.random() > 0.65 ? Math.floor(Math.random() * 80) : 0;
    const sueldo = 200000 + Math.floor(Math.random() * 600000);
    const estados = ['Activo','Activo','Activo','Activo','Licencia','Suspendido'];
    const estado = estados[Math.floor(Math.random() * estados.length)];
    const year = 2010 + Math.floor(Math.random() * 15);
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2,'0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2,'0');

    empleados.push({
      legajo: 1000 + i,
      nombre,
      secretaria: sec,
      cargo,
      ingreso: `${day}/${month}/${year}`,
      hsExtra,
      sueldo,
      estado,
      colorIdx: SECRETARIAS.indexOf(sec),
    });
  }
  return empleados;
}

let todosEmpleados = generarEmpleados();
let empleadosFiltrados = [...todosEmpleados];
const POR_PAGINA = 20;
let paginaActual = 1;

function renderTabla() {
  const tbody = document.getElementById('empleadosBody');
  const start = (paginaActual - 1) * POR_PAGINA;
  const slice = empleadosFiltrados.slice(start, start + POR_PAGINA);

  tbody.innerHTML = slice.map(e => {
    const initials = e.nombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const color = COLORES_AVATAR[e.colorIdx % COLORES_AVATAR.length];
    const estadoBadge = {
      'Activo':     '<span class="status-badge ok">Activo</span>',
      'Licencia':   '<span class="status-badge warning">Licencia</span>',
      'Suspendido': '<span class="status-badge critical">Suspendido</span>',
    }[e.estado];

    return `
      <tr>
        <td class="emp-legajo">#${e.legajo}</td>
        <td>
          <span class="emp-avatar" style="background:${color}22;border:1px solid ${color}66;color:${color}">${initials}</span>
          <span class="emp-name">${e.nombre}</span>
        </td>
        <td>${e.secretaria}</td>
        <td style="color:var(--text-secondary)">${e.cargo}</td>
        <td style="color:var(--text-muted);font-size:12px">${e.ingreso}</td>
        <td>
          <span class="hs-pill ${e.hsExtra === 0 ? 'zero' : ''}">
            ${e.hsExtra === 0 ? '—' : e.hsExtra + ' hs'}
          </span>
        </td>
        <td><strong>$${e.sueldo.toLocaleString('es-AR')}</strong></td>
        <td>${estadoBadge}</td>
        <td>
          <button class="action-btn" onclick="verLegajo(${e.legajo})" title="Ver legajo">👁</button>
          <button class="action-btn" onclick="generarRecibo(${e.legajo})" title="Recibo de sueldo">📄</button>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('tableCount').textContent =
    `Mostrando ${start + 1}–${Math.min(start + POR_PAGINA, empleadosFiltrados.length)} de ${empleadosFiltrados.length.toLocaleString('es-AR')} empleados`;
}

// ── FILTROS ───────────────────────────────────────────────
document.getElementById('filtroSecretaria')?.addEventListener('change', aplicarFiltros);
document.getElementById('filtroEstado')?.addEventListener('change', aplicarFiltros);
document.getElementById('searchEmpleado')?.addEventListener('input', aplicarFiltros);

function aplicarFiltros() {
  const sec   = document.getElementById('filtroSecretaria').value;
  const estado = document.getElementById('filtroEstado').value;
  const q     = document.getElementById('searchEmpleado').value.toLowerCase();

  empleadosFiltrados = todosEmpleados.filter(e => {
    const matchSec   = !sec   || e.secretaria === sec;
    const matchEst   = !estado || e.estado === estado;
    const matchQ     = !q     || e.nombre.toLowerCase().includes(q) || String(e.legajo).includes(q);
    return matchSec && matchEst && matchQ;
  });

  paginaActual = 1;
  renderTabla();
}

// ── MODAL ─────────────────────────────────────────────────
document.getElementById('btnNuevoEmpleado')?.addEventListener('click', () => {
  document.getElementById('modalOverlay').style.display = 'flex';
  document.getElementById('empIngreso').value = new Date().toISOString().slice(0,10);
});

const cerrarModal = () => { document.getElementById('modalOverlay').style.display = 'none'; };
document.getElementById('modalClose')?.addEventListener('click', cerrarModal);
document.getElementById('btnCancelar')?.addEventListener('click', cerrarModal);
document.getElementById('modalOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) cerrarModal();
});

document.getElementById('btnGuardar')?.addEventListener('click', () => {
  const nombre = `${document.getElementById('empNombre').value} ${document.getElementById('empApellido').value}`.trim();
  const sec    = document.getElementById('empSecretaria').value;
  const cargo  = document.getElementById('empCargo').value || 'Sin cargo';
  const sueldo = parseInt(document.getElementById('empSueldo').value) || 300000;

  if (!nombre || nombre.trim().length < 3) {
    alert('Por favor ingresá el nombre y apellido del empleado.');
    return;
  }

  const newEmp = {
    legajo: todosEmpleados.length + 1001,
    nombre,
    secretaria: sec,
    cargo,
    ingreso: new Date().toLocaleDateString('es-AR'),
    hsExtra: 0,
    sueldo,
    estado: 'Activo',
    colorIdx: SECRETARIAS.indexOf(sec),
  };

  todosEmpleados.unshift(newEmp);
  aplicarFiltros();
  cerrarModal();

  // Feedback visual
  const banner = document.createElement('div');
  banner.className = 'alert-banner';
  banner.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.1))';
  banner.style.borderBottomColor = 'rgba(16,185,129,0.3)';
  banner.innerHTML = `<span>✅</span> <span>Legajo <strong>#${newEmp.legajo}</strong> — <strong>${newEmp.nombre}</strong> creado exitosamente en ${sec}</span>`;
  document.querySelector('.content-wrapper').prepend(banner);
  setTimeout(() => banner.remove(), 4000);
});

// ── ACCIONES ─────────────────────────────────────────────
function verLegajo(legajo) {
  const e = todosEmpleados.find(x => x.legajo === legajo);
  if (!e) return;
  alert(`📋 LEGAJO #${e.legajo}\n\n👤 ${e.nombre}\n🏢 ${e.secretaria} · ${e.cargo}\n📅 Ingreso: ${e.ingreso}\n⏱ Horas extra: ${e.hsExtra} hs\n💰 Sueldo bruto: $${e.sueldo.toLocaleString('es-AR')}\n✅ Estado: ${e.estado}`);
}

function generarRecibo(legajo) {
  const e = todosEmpleados.find(x => x.legajo === legajo);
  if (!e) return;
  const descuentos = Math.floor(e.sueldo * 0.27);
  const neto = e.sueldo - descuentos + (e.hsExtra * 5000);

  const contenido = `
RECIBO DE HABERES — MUNICIPIO DE JUNÍN
========================================
Mes: Agosto 2026
Legajo: #${e.legajo}
Empleado: ${e.nombre}
Área: ${e.secretaria} — ${e.cargo}
Ingreso: ${e.ingreso}

CONCEPTOS
---------
Sueldo básico:       $${e.sueldo.toLocaleString('es-AR')}
Horas extra (${e.hsExtra}hs): $${(e.hsExtra * 5000).toLocaleString('es-AR')}
Descuentos (27%):   -$${descuentos.toLocaleString('es-AR')}
────────────────────────────────────────
NETO A COBRAR:       $${neto.toLocaleString('es-AR')}

Municipio de Junín — Sistema RRHH Digital v1.0
`;

  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recibo-${e.legajo}-agosto2026.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── INIT ─────────────────────────────────────────────────
function loadEmpleadosFromDB() {
    if (!window.MuniDB) return;
    const empleados = MuniDB.sort(MuniDB.getAll('empleados'), 'apellido', 'asc');
    const tbody = document.getElementById('empleadosBody') || document.querySelector('#tablaEmpleados tbody');
    if (!tbody || empleados.length === 0) return;
    
    tbody.innerHTML = empleados.map(e => `
        <tr>
            <td><strong>${e.legajo}</strong></td>
            <td>${e.apellido}, ${e.nombre}</td>
            <td>${e.secretaria}</td>
            <td>${e.cargo}</td>
            <td><span class="badge-status badge-${e.estado}">${e.estado}</span></td>
            <td>$${(e.salario/1000).toFixed(0)}k</td>
            <td style="color:${e.horasExtra > 30 ? '#ef4444' : '#f59e0b'}">${e.horasExtra}hs</td>
            <td>
                <button onclick="verEmpleado('${e.id}')" style="padding:4px 10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">Ver</button>
                <button onclick="editarEmpleado('${e.id}')" style="padding:4px 10px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);color:#f59e0b;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;margin-left:4px">Editar</button>
            </td>
        </tr>
    `).join('');
    
    // Update count display
    const counter = document.querySelector('.table-count, #empleadosCount');
    if (counter) counter.textContent = `${empleados.length} empleados`;
}

function verEmpleado(id) {
    const e = MuniDB.getOne('empleados', id);
    if (!e) return;
    const detalle = `${e.apellido}, ${e.nombre}\nLegajo: ${e.legajo}\nSecretaría: ${e.secretaria}\nCargo: ${e.cargo}\nSalario: $${e.salario.toLocaleString('es-AR')}\nHoras extra: ${e.horasExtra}hs\nAusentismo: ${e.ausentismo} días\nEmail: ${e.email}`;
    if (typeof showToast !== 'undefined') showToast(`👤 ${e.apellido}, ${e.nombre} — ${e.cargo}`, 'info');
}

document.addEventListener('DOMContentLoaded', () => {
  renderTabla();

  // Sidebar toggle (reutilizar lógica de dashboard.js)
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  toggleBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    document.getElementById('mainContent').classList.toggle('expanded');
  });

  loadEmpleadosFromDB();
});
