// ============================================================
// CHARTS.JS — Inicialización de gráficos con Chart.js
// ============================================================

const CHART_DEFAULTS = {
  font: { family: "'Inter', sans-serif", size: 12 },
  color: '#8ea3c3',
  borderColor: 'rgba(255,255,255,0.06)',
  gridColor: 'rgba(255,255,255,0.05)',
};

Chart.defaults.color = CHART_DEFAULTS.color;
Chart.defaults.font.family = CHART_DEFAULTS.font.family;

function initGastosLineChart() {
  const d = MUNICIPIO_DATA.gastosAnuales;
  const ctx = document.getElementById('gastosLineChart').getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(59,130,246,0.3)');
  gradient.addColorStop(1, 'rgba(59,130,246,0.0)');

  const gradient2 = ctx.createLinearGradient(0, 0, 0, 220);
  gradient2.addColorStop(0, 'rgba(139,92,246,0.15)');
  gradient2.addColorStop(1, 'rgba(139,92,246,0.0)');

  window.gastosLineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [
        {
          label: 'Gasto Real',
          data: d.gasto,
          borderColor: '#3b82f6',
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3b82f6',
          pointRadius: 4,
          pointHoverRadius: 7,
        },
        {
          label: 'Presupuesto',
          data: d.presupuesto,
          borderColor: '#8b5cf6',
          backgroundColor: gradient2,
          borderWidth: 2,
          borderDash: [6,4],
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#8b5cf6',
          pointRadius: 3,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { boxWidth: 12, boxHeight: 12, borderRadius: 4, padding: 16, usePointStyle: true, pointStyleWidth: 12 },
        },
        tooltip: {
          backgroundColor: '#111d35',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: ctx => ` $${ctx.parsed.y.toLocaleString('es-AR')}M`,
          },
        },
      },
      scales: {
        x: { grid: { color: CHART_DEFAULTS.gridColor }, border: { display: false } },
        y: {
          grid: { color: CHART_DEFAULTS.gridColor },
          border: { display: false },
          ticks: { callback: v => `$${v}M` },
        },
      },
    },
  });
}

function initEmpleadosPieChart() {
  const secretarias = MUNICIPIO_DATA.secretarias;
  const ctx = document.getElementById('empleadosPieChart').getContext('2d');
  const legendEl = document.getElementById('donutLegend');

  window.empleadosPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: secretarias.map(s => s.nombre),
      datasets: [{
        data: secretarias.map(s => s.empleados),
        backgroundColor: secretarias.map(s => s.color + 'cc'),
        borderColor: secretarias.map(s => s.color),
        borderWidth: 1.5,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111d35',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} empleados`,
          },
        },
      },
    },
  });

  // Custom legend
  const total = secretarias.reduce((a, s) => a + s.empleados, 0);
  legendEl.innerHTML = secretarias.map(s => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${s.color}"></span>
      <span class="legend-label">${s.nombre}</span>
      <span class="legend-val">${s.empleados}</span>
    </div>
  `).join('');
}

function initGastosBarChart() {
  const secretarias = MUNICIPIO_DATA.secretarias;
  const ctx = document.getElementById('gastosBarChart').getContext('2d');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: secretarias.map(s => s.nombre),
      datasets: [{
        label: 'Gasto agosto',
        data: secretarias.map(s => (s.ejecutado / 1000000).toFixed(1)),
        backgroundColor: secretarias.map(s => s.color + '99'),
        borderColor: secretarias.map(s => s.color),
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111d35',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: { label: ctx => ` $${ctx.parsed.y}M` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { maxRotation: 40, font: { size: 11 } },
        },
        y: {
          grid: { color: CHART_DEFAULTS.gridColor },
          border: { display: false },
          ticks: { callback: v => `$${v}M` },
        },
      },
    },
  });
}

function initHorasExtraChart() {
  const d = MUNICIPIO_DATA.horasExtra;
  const ctx = document.getElementById('horasExtraChart').getContext('2d');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.map(x => x.area),
      datasets: [{
        label: 'Horas Extra',
        data: d.map(x => x.horas),
        backgroundColor: 'rgba(245,158,11,0.25)',
        borderColor: '#f59e0b',
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111d35',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} hs · $${(d[ctx.dataIndex].costo / 1000000).toFixed(1)}M`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_DEFAULTS.gridColor },
          border: { display: false },
        },
        y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

function initPresupuestoChart() {
  const secretarias = MUNICIPIO_DATA.secretarias;
  const ctx = document.getElementById('presupuestoChart').getContext('2d');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: secretarias.map(s => s.nombre),
      datasets: [
        {
          label: 'Presupuesto',
          data: secretarias.map(s => (s.presupuesto / 1000000).toFixed(1)),
          backgroundColor: 'rgba(139,92,246,0.2)',
          borderColor: '#8b5cf6',
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: 'Ejecutado',
          data: secretarias.map(s => (s.ejecutado / 1000000).toFixed(1)),
          backgroundColor: secretarias.map(s =>
            s.ejecutado > s.presupuesto ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'
          ),
          borderColor: secretarias.map(s =>
            s.ejecutado > s.presupuesto ? '#ef4444' : '#3b82f6'
          ),
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: '#111d35',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: { label: ctx => ` $${ctx.parsed.y}M` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { maxRotation: 45, font: { size: 10 } },
        },
        y: {
          grid: { color: CHART_DEFAULTS.gridColor },
          border: { display: false },
          ticks: { callback: v => `$${v}M` },
        },
      },
    },
  });
}

// Inicializar todos los charts
function initAllCharts() {
  initGastosLineChart();
  initEmpleadosPieChart();
  initGastosBarChart();
  initHorasExtraChart();
  initPresupuestoChart();
}

