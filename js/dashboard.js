// ============================================================
// DASHBOARD.JS — Lógica principal del dashboard
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  setCurrentDate();
  animateKPIs();
  buildAlertasTable();
  buildEntidadesList();
  buildActivityFeed();
  initAllCharts();
  initSidebar();
  animateProgressBars();
});

// ── FECHA ACTUAL ──────────────────────────────────────────
function setCurrentDate() {
  const el = document.getElementById('currentDate');
  const now = new Date();
  el.textContent = now.toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ── ANIMACIÓN DE KPIs ─────────────────────────────────────
function animateKPIs() {
  document.querySelectorAll('.kpi-value[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const isMoney = el.classList.contains('money');
    const isPct   = el.classList.contains('pct');
    const duration = 1600;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(eased * target);

      if (isMoney) {
        el.textContent = '$' + formatMoney(current);
      } else if (isPct) {
        el.textContent = current + '%';
      } else {
        el.textContent = current.toLocaleString('es-AR');
      }

      if (progress < 1) requestAnimationFrame(update);
    }

    // Delay escalonado por card
    const delay = Array.from(document.querySelectorAll('.kpi-value[data-target]')).indexOf(el) * 100;
    setTimeout(() => requestAnimationFrame(update), delay);
  });
}

function formatMoney(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000)    return (num / 1000).toFixed(0) + 'K';
  return num.toLocaleString('es-AR');
}

// ── PROGRESS BAR ─────────────────────────────────────────
function animateProgressBars() {
  setTimeout(() => {
    const pb = document.getElementById('presupProgressBar');
    if (pb) pb.style.width = '72%';
  }, 400);

  // Entidades progress bars
  setTimeout(() => {
    document.querySelectorAll('.entidad-bar[data-pct]').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  }, 600);
}

// ── TABLA DE ALERTAS ─────────────────────────────────────
function buildAlertasTable() {
  const tbody = document.getElementById('alertasBody');
  if (!tbody) return;

  tbody.innerHTML = MUNICIPIO_DATA.alertas.map(a => {
    const isOver = parseFloat(a.desvio) > 0;
    const statusLabel = { critical: 'Crítico', warning: 'Atención', ok: 'Normal' }[a.estado];
    return `
      <tr>
        <td><strong>${a.secretaria}</strong></td>
        <td>$${(a.presupuesto / 1000000).toFixed(1)}M</td>
        <td>$${(a.ejecutado / 1000000).toFixed(1)}M</td>
        <td class="${isOver ? 'deviation-up' : 'deviation-ok'}">${a.desvio}</td>
        <td><span class="status-badge ${a.estado}">${statusLabel}</span></td>
      </tr>
    `;
  }).join('');
}

// ── LISTA DE ENTIDADES ────────────────────────────────────
function buildEntidadesList() {
  const container = document.getElementById('entidadesList');
  if (!container) return;

  container.innerHTML = MUNICIPIO_DATA.entidades.map(e => `
    <div class="entidad-item">
      <div class="entidad-header">
        <span class="entidad-name">
          <span>${e.emoji}</span>
          <span>${e.nombre}</span>
        </span>
        <span class="entidad-pct" style="color:${e.color}">${e.progreso}%</span>
      </div>
      <div class="entidad-bar-wrap">
        <div class="entidad-bar" data-pct="${e.progreso}"
          style="background:${e.color}; width:0%"></div>
      </div>
    </div>
  `).join('');
}

// ── ACTIVIDAD RECIENTE ────────────────────────────────────
function buildActivityFeed() {
  const container = document.getElementById('activityFeed');
  if (!container) return;

  container.innerHTML = MUNICIPIO_DATA.actividad.map(a => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${a.color}; box-shadow: 0 0 6px ${a.color}88"></div>
      <div class="activity-content">
        <div class="activity-text">${a.texto}</div>
        <div class="activity-time">${a.tiempo}</div>
      </div>
    </div>
  `).join('');
}

// ── SIDEBAR TOGGLE ────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const menuBtn = document.getElementById('menuBtn');
  const mainContent = document.getElementById('mainContent');

  // Desktop collapse
  toggleBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
    // Resize charts after transition
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  });

  // Mobile overlay
  menuBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 900) {
      if (!sidebar.contains(e.target) && !menuBtn?.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    }
  });

  // Nav items active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
      if (this.getAttribute('href') === '#') {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
      }
    });
  });
}

// ── EXPORT BUTTON ─────────────────────────────────────────
document.getElementById('btnExport')?.addEventListener('click', () => {
  const blob = new Blob([generateReport()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe-ejecutivo-junin-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

function generateReport() {
  const now = new Date().toLocaleDateString('es-AR');
  const d = MUNICIPIO_DATA;
  const totalEmpleados = d.secretarias.reduce((a,s) => a + s.empleados, 0);
  const totalGasto = d.secretarias.reduce((a,s) => a + s.ejecutado, 0);
  const totalHsExtra = d.horasExtra.reduce((a,h) => a + h.horas, 0);

  return `
MUNICIPIO DE JUNÍN — INFORME EJECUTIVO
Fecha: ${now}
========================================

RESUMEN EJECUTIVO
-----------------
Total empleados:    ${totalEmpleados.toLocaleString('es-AR')}
Gasto agosto 2026:  $${(totalGasto/1000000).toFixed(1)} millones
Horas extra mes:    ${totalHsExtra.toLocaleString('es-AR')} hs
Presupuesto ejec.:  72%

DETALLE POR SECRETARÍA
-----------------------
${d.secretarias.map(s =>
  `${s.nombre.padEnd(20)} ${s.empleados} emp. | $${(s.ejecutado/1000000).toFixed(1)}M ejecutado`
).join('\n')}

ALERTAS PRESUPUESTARIAS
------------------------
${d.alertas.filter(a => a.estado !== 'ok').map(a =>
  `⚠ ${a.secretaria}: desvío ${a.desvio} (presup. $${(a.presupuesto/1000000).toFixed(1)}M | ejec. $${(a.ejecutado/1000000).toFixed(1)}M)`
).join('\n')}

Informe generado por Sistema Municipal Junín v1.0
`;
}

// ── BÚSQUEDA GLOBAL (básica) ───────────────────────────────
document.getElementById('globalSearch')?.addEventListener('input', function() {
  const q = this.value.toLowerCase();
  if (!q) return;
  // Destacar secretarías en la tabla de alertas
  document.querySelectorAll('#alertasBody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.background = text.includes(q) ? 'rgba(59,130,246,0.08)' : '';
  });
});
