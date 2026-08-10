// ============================================================
// CHARTS-PREMIUM.JS — Advanced charts for MuniControl
// Uses Chart.js 4.4 + custom plugins
// ============================================================

(function(global) {
  'use strict';

  // ── GLOBAL CHART DEFAULTS ─────────────────────────────────
  Chart.defaults.color = 'rgba(148,163,184,0.8)';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
  Chart.defaults.font.family = "'Inter', 'Outfit', sans-serif";
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(11,17,32,0.95)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(96,165,250,0.2)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.titleFont = { size: 13, weight: '700' };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
  Chart.defaults.plugins.tooltip.titleColor = '#f0f4ff';
  Chart.defaults.plugins.tooltip.bodyColor = 'rgba(148,163,184,0.9)';
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;

  // ── ANIMATED GRADIENT HELPER ──────────────────────────────
  function makeGradient(ctx, color1, color2, height) {
    const g = ctx.createLinearGradient(0, 0, 0, height || 300);
    g.addColorStop(0, color1);
    g.addColorStop(1, color2);
    return g;
  }

  // ── 1. GASTO MENSUAL — Area line chart (12 months) ────────
  function createGastoMensualChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const data2025 = [18.2, 19.5, 21.1, 20.8, 22.4, 21.9, 24.3, 23.7, 25.1, 24.8, 26.2, 28.9];
    const data2026 = [24.1, 26.3, 22.8, 27.5, 29.2, 26.9, 32.4, null, null, null, null, null];

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '2025',
            data: data2025,
            borderColor: 'rgba(100,116,139,0.5)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.4,
          },
          {
            label: '2026',
            data: data2026,
            borderColor: '#3b82f6',
            backgroundColor: makeGradient(ctx, 'rgba(59,130,246,0.15)', 'rgba(59,130,246,0.01)'),
            borderWidth: 2.5,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#0d1526',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 7,
            tension: 0.4,
            fill: true,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeInOutQuart' },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              font: { size: 11 },
              callback: v => '$' + v.toFixed(1) + 'M'
            },
            beginAtZero: false,
          }
        },
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              label: ctx => ' $' + ctx.parsed.y?.toFixed(1) + 'M'
            }
          }
        }
      }
    });
  }

  // ── 2. DISTRIBUCIÓN PRESUPUESTO — Doughnut ────────────────
  function createPresupuestoDoughnut(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    const secretarias = ['Salud', 'Obras P.', 'Educación', 'Seguridad', 'Personal', 'M. Ambiente', 'Cultura', 'Hacienda'];
    const montos = [68.2, 54.1, 48.7, 42.3, 38.6, 18.2, 12.4, 15.8];
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: secretarias,
        datasets: [{
          data: montos,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2,
          hoverBorderWidth: 3,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { animateRotate: true, duration: 1200, easing: 'easeInOutQuart' },
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => ` $${ctx.parsed.toFixed(1)}M (${(ctx.parsed / montos.reduce((a,b)=>a+b,0)*100).toFixed(1)}%)`
            }
          }
        }
      }
    });
  }

  // ── 3. HORAS EXTRA — Horizontal bars ──────────────────────
  function createHorasExtraChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    const secretarias = ['Seguridad', 'Obras P.', 'Salud', 'Personal', 'Hacienda', 'Educación', 'Cultura', 'M. Amb.'];
    const horas = [2340, 1890, 1240, 980, 560, 320, 180, 140];
    const colors = horas.map(h => h > 1500 ? 'rgba(239,68,68,0.8)' : h > 800 ? 'rgba(245,158,11,0.8)' : 'rgba(16,185,129,0.8)');

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: secretarias,
        datasets: [{
          label: 'Horas Extra',
          data: horas,
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.8', '1')),
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeInOutQuart' },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { callback: v => v.toLocaleString('es-AR') + 'hs' }
          },
          y: { grid: { display: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ' ' + ctx.parsed.x.toLocaleString('es-AR') + ' horas extra' }
          }
        }
      }
    });
  }

  // ── 4. EJECUCIÓN POR SECRETARÍA — Radar ───────────────────
  function createEjecucionRadar(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    return new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Salud', 'Obras P.', 'Educación', 'Seguridad', 'Personal', 'M. Amb.'],
        datasets: [
          {
            label: 'Ejecución %',
            data: [89.6, 117.9, 68.0, 92.0, 103.1, 70.9],
            backgroundColor: 'rgba(59,130,246,0.1)',
            borderColor: '#3b82f6',
            borderWidth: 2,
            pointBackgroundColor: '#3b82f6',
            pointRadius: 4,
          },
          {
            label: 'Meta 100%',
            data: [100, 100, 100, 100, 100, 100],
            backgroundColor: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000 },
        scales: {
          r: {
            min: 0, max: 130,
            ticks: { stepSize: 25, backdropColor: 'transparent', font: { size: 10 }, callback: v => v + '%' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            angleLines: { color: 'rgba(255,255,255,0.06)' },
            pointLabels: { font: { size: 11 } }
          }
        },
        plugins: {
          legend: { position: 'top' },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.r.toFixed(1) + '%' } }
        }
      }
    });
  }

  // ── 5. RECLAMOS POR TIPO — Bar ────────────────────────────
  function createReclamosTipoChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    const tipos = ['Bache', 'Luminaria', 'Residuos', 'Arbolado', 'Agua', 'Ruidos', 'Tránsito'];
    const counts = [234, 187, 156, 98, 67, 54, 43];

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: tipos,
        datasets: [{
          label: 'Reclamos',
          data: counts,
          backgroundColor: makeGradient(ctx, 'rgba(59,130,246,0.8)', 'rgba(139,92,246,0.6)', 200),
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeInOutQuart' },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(255,255,255,0.03)' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // ── 6. FLUJO DE CAJA — Mixed bar+line ────────────────────
  function createFlujoCajaChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    const meses = ['Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene 27'];
    const ingresos =  [42.1, 38.5, 44.2, 41.8, 39.6, 43.5];
    const egresos  =  [38.7, 41.2, 39.8, 45.1, 42.3, 40.2];
    const saldo    =  [3.4, 0.7, 4.4, -3.3, -2.7, 3.3];

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [
          {
            type: 'bar', label: 'Ingresos', data: ingresos,
            backgroundColor: 'rgba(16,185,129,0.6)', borderColor: '#10b981', borderWidth: 1, borderRadius: 4,
          },
          {
            type: 'bar', label: 'Egresos', data: egresos,
            backgroundColor: 'rgba(239,68,68,0.6)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4,
          },
          {
            type: 'line', label: 'Balance', data: saldo,
            borderColor: '#f59e0b', backgroundColor: 'transparent',
            borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: '#f59e0b',
            tension: 0.3, yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000 },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { callback: v => '$' + v.toFixed(0) + 'M' }
          },
          y2: {
            position: 'right', grid: { display: false },
            ticks: { callback: v => '$' + v.toFixed(1) + 'M', color: '#f59e0b' }
          }
        },
        plugins: { legend: { position: 'top' } }
      }
    });
  }

  // ── 7. HEATMAP SEMANA (actividad) ────────────────────────
  function createHeatmapSemanal(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const horas = ['08h','09h','10h','11h','12h','13h','14h','15h','16h','17h','18h'];
    const data = [
      [2,8,12,15,18,9,3,2,1,0,0],
      [0,15,22,28,31,24,18,20,25,19,8],
      [0,18,25,30,35,28,22,24,29,22,10],
      [0,12,20,28,32,26,20,22,27,20,9],
      [0,14,23,29,33,27,21,23,28,21,9],
      [0,16,24,31,36,29,23,25,30,23,11],
      [3,5,8,6,4,2,1,0,0,0,0],
    ];

    const maxVal = 36;
    const html = `
      <div style="display:grid;grid-template-columns:30px repeat(${horas.length},1fr);gap:3px;font-size:9px">
        <div></div>${horas.map(h => `<div style="text-align:center;color:var(--text-muted);padding-bottom:4px">${h}</div>`).join('')}
        ${dias.map((d, di) => `
          <div style="display:flex;align-items:center;color:var(--text-muted);font-size:9px">${d}</div>
          ${data[di].map(v => {
            const pct = v / maxVal;
            const alpha = Math.max(0.05, pct * 0.85);
            const color = pct > 0.7 ? `rgba(239,68,68,${alpha})` : pct > 0.4 ? `rgba(245,158,11,${alpha})` : `rgba(59,130,246,${alpha})`;
            return `<div style="background:${color};border-radius:3px;aspect-ratio:1;cursor:default;transition:transform 0.15s" title="${v} acciones" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'"></div>`;
          }).join('')}
        `).join('')}
      </div>
    `;
    container.innerHTML = html;
  }

  // ── 8. GAUGE PRESUPUESTAL ────────────────────────────────
  function createGaugeChart(canvasId, value, max, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const pct = Math.min(value / max, 1);

    // Custom gauge plugin
    const gaugePlugin = {
      id: 'gaugeNeedle',
      afterDatasetDraw(chart) {
        const { ctx: c, chartArea: { top, left, right, bottom } } = chart;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 1.1;
        const angle = Math.PI * (pct - 0.5);
        const r = Math.min(right - left, bottom - top) * 0.38;

        c.save();
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        c.strokeStyle = '#f0f4ff';
        c.lineWidth = 2.5;
        c.stroke();
        c.beginPath();
        c.arc(cx, cy, 5, 0, 2 * Math.PI);
        c.fillStyle = '#f0f4ff';
        c.fill();
        // Label
        c.fillStyle = color || '#3b82f6';
        c.font = 'bold 20px Outfit';
        c.textAlign = 'center';
        c.fillText(Math.round(pct * 100) + '%', cx, cy + 30);
        c.font = '11px Inter';
        c.fillStyle = 'rgba(148,163,184,0.7)';
        c.fillText(label || 'ejecutado', cx, cy + 48);
        c.restore();
      }
    };

    const zones = ['#10b981','#f59e0b','#ef4444'];
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [33, 33, 34],
          backgroundColor: zones.map(c => c + '33'),
          borderColor: zones,
          borderWidth: 2,
          circumference: 180,
          rotation: -90,
        },
        {
          data: [pct * 100, 100 - pct * 100],
          backgroundColor: [color || '#3b82f6', 'transparent'],
          borderColor: 'transparent',
          borderWidth: 0,
          circumference: 180,
          rotation: -90,
          cutout: '78%',
        }]
      },
      plugins: [gaugePlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 1500, easing: 'easeInOutQuart' }
      }
    });
  }

  // ── EXPOSE ────────────────────────────────────────────────
  global.MuniCharts = {
    gastoMensual:    createGastoMensualChart,
    presupuesto:     createPresupuestoDoughnut,
    horasExtra:      createHorasExtraChart,
    ejecucionRadar:  createEjecucionRadar,
    reclamosTipo:    createReclamosTipoChart,
    flujoCaja:       createFlujoCajaChart,
    heatmapSemanal:  createHeatmapSemanal,
    gauge:           createGaugeChart,
    makeGradient,
  };

  console.log('[MuniCharts] Premium charts ready:', Object.keys(global.MuniCharts));

})(window);
