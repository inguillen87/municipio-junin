// ============================================================
// EXPORTAR.JS — Centro de Exportación Profesional
// jsPDF + jsPDF-AutoTable + SheetJS
// ============================================================

const REPORTS = {
  ejecutivo: {
    title: 'Informe Ejecutivo',
    desc:  'Para el Intendente Mario Abed',
    kpis: [
      { value: '1.247', label: 'Empleados activos' },
      { value: '$284.5M', label: 'Gasto agosto' },
      { value: '92%', label: 'Ejecución presup.' },
      { value: '$42M', label: 'Ahorro IT anual' },
      { value: '318', label: 'Reclamos vecinales' },
      { value: '4.312 hs', label: 'Horas extra' },
    ],
    tableHeaders: ['Secretaría', 'Empleados', 'Presupuesto', 'Ejecutado', 'Estado'],
    tableRows: [
      ['Educación', '302', '$61M', '$54.9M', 'ok'],
      ['Obras Públicas', '214', '$38M', '$44.8M', 'crit'],
      ['Salud', '187', '$52M', '$46.8M', 'ok'],
      ['Seguridad', '178', '$44M', '$41.8M', 'ok'],
      ['Talleres', '96', '$12M', '$13.4M', 'warn'],
      ['Medio Ambiente', '96', '$8M', '$9.1M', 'warn'],
      ['Intendencia', '174', '$50M', '$28.5M', 'ok'],
    ],
  },
  rrhh: {
    title: 'Recursos Humanos',
    desc:  'Nómina y gastos salariales',
    kpis: [
      { value: '1.247', label: 'Total empleados' },
      { value: '$186M', label: 'Masa salarial' },
      { value: '4.312 hs', label: 'Horas extra' },
      { value: '3%', label: 'Ausentismo' },
      { value: '47', label: 'Licencias activas' },
      { value: '$18.4M', label: 'Costo hs extra' },
    ],
    tableHeaders: ['Secretaría', 'Empleados', 'Hs Extra', 'Costo HE', 'Ausentes'],
    tableRows: [
      ['Educación', '302', '320 hs', '$1.4M', '9'],
      ['Obras Públicas', '214', '980 hs', '$4.9M', '6'],
      ['Salud', '187', '754 hs', '$3.8M', '14'],
      ['Seguridad', '178', '612 hs', '$3.1M', '5'],
      ['Medio Ambiente', '96', '310 hs', '$1.3M', '3'],
      ['Talleres', '96', '520 hs', '$2.1M', '4'],
      ['Intendencia', '174', '816 hs', '$1.8M', '6'],
    ],
  },
  gastos: {
    title: 'Gastos por Secretaría',
    desc:  'Presupuesto vs ejecutado',
    kpis: [
      { value: '$310M', label: 'Presupuesto total' },
      { value: '$284.5M', label: 'Ejecutado' },
      { value: '92%', label: 'Ejecución' },
      { value: '$25.5M', label: 'Remanente' },
      { value: '3', label: 'Áreas con desvio' },
      { value: '+6%', label: 'Promedio desvio' },
    ],
    tableHeaders: ['Secretaría', 'Presup.', 'Ejecutado', 'Desvio $', 'Desvio %', 'Estado'],
    tableRows: [
      ['Educación', '$61M', '$54.9M', '-$6.1M', '-10%', 'ok'],
      ['Obras Públicas', '$38M', '$44.8M', '+$6.8M', '+18%', 'crit'],
      ['Salud', '$52M', '$46.8M', '-$5.2M', '-10%', 'ok'],
      ['Seguridad', '$44M', '$41.8M', '-$2.2M', '-5%', 'ok'],
      ['Talleres', '$12M', '$13.4M', '+$1.4M', '+12%', 'warn'],
      ['Est. Servicios', '$8M', '$9.1M', '+$1.1M', '+14%', 'warn'],
      ['Intendencia', '$50M', '$28.5M', '-$21.5M', '-43%', 'ok'],
    ],
  },
  reclamos: {
    title: 'Reclamos Vecinales',
    desc:  'Estado y evolución mensual',
    kpis: [
      { value: '318', label: 'Total reclamos' },
      { value: '229', label: 'Resueltos' },
      { value: '89', label: 'Pendientes' },
      { value: '72%', label: 'Tasa resolución' },
      { value: '3.2 días', label: 'Tiempo promedio' },
      { value: '47', label: 'Turnos hoy' },
    ],
    tableHeaders: ['Tipo', 'Cantidad', '% del total', 'Resueltos', 'Pendientes'],
    tableRows: [
      ['Baches y Pavimento', '108', '34%', '75', '33'],
      ['Alumbrado Público', '70', '22%', '52', '18'],
      ['Recolección de Basura', '57', '18%', '44', '13'],
      ['Poda de Árboles', '38', '12%', '28', '10'],
      ['Agua y Cloacas', '25', '8%', '18', '7'],
      ['Ruidos Molestos', '12', '4%', '8', '4'],
      ['Otros', '8', '2%', '4', '2'],
    ],
  },
  flota: {
    title: 'Flota y Combustible',
    desc:  'Consumo y mantenimiento de vehículos',
    kpis: [
      { value: '43', label: 'Vehículos totales' },
      { value: '7', label: 'En taller' },
      { value: '8.640 L', label: 'Consumo/mes' },
      { value: '$9.1M', label: 'Costo combustible' },
      { value: '48%', label: 'Stock nafta' },
      { value: '49%', label: 'Stock gasoil' },
    ],
    tableHeaders: ['Vehículo', 'Cod.', 'Tipo', 'Área', 'KM', 'Estado'],
    tableRows: [
      ['Ford F-100', 'JUN-001', 'Camioneta', 'Obras Públicas', '87.420', 'ok'],
      ['VW Amarok', 'JUN-002', 'Camioneta', 'Medio Ambiente', '54.310', 'ok'],
      ['Toyota Hilux', 'JUN-003', 'Camioneta', 'Seguridad', '112.000', 'warn'],
      ['Volvo FH 460', 'JUN-010', 'Camón', 'Servicios Urbanos', '198.000', 'warn'],
      ['Mercedes Actros', 'JUN-015', 'Basura', 'Higiene Urbana', '234.000', 'crit'],
      ['Fiat Ducato', 'JUN-004', 'Utilitario', 'Salud', '63.200', 'ok'],
      ['Honda CB 190', 'JUN-022', 'Moto', 'Inspección', '18.200', 'ok'],
    ],
  },
  talleres: {
    title: 'Talleres Municipales',
    desc:  'Órdenes de trabajo y stock crítico',
    kpis: [
      { value: '24', label: 'Órdenes activas' },
      { value: '8', label: 'Urgentes' },
      { value: '87', label: 'Completadas/mes' },
      { value: '$13.4M', label: 'Costo mensual' },
      { value: '5', label: 'Stock crítico' },
      { value: '4 días', label: 'Tiempo medio' },
    ],
    tableHeaders: ['Insumo', 'Cód.', 'Stock', 'Mínimo', 'Estado'],
    tableRows: [
      ['Filtro de Aceite Universal', 'INS-002', '8 unid.', '15 unid.', 'crit'],
      ['Pastillas de Freno', 'INS-003', '6 juegos', '10 juegos', 'crit'],
      ['Correa de Distribución', 'INS-004', '3 unid.', '5 unid.', 'crit'],
      ['Batería 12V 80Ah', 'INS-005', '4 unid.', '6 unid.', 'crit'],
      ['Filtro de Aire', 'INS-008', '5 unid.', '8 unid.', 'crit'],
      ['Aceite Motor 15W40', 'INS-001', '45 litros', '20 litros', 'ok'],
      ['Neumático 195/70R15', 'INS-006', '12 unid.', '8 unid.', 'ok'],
    ],
  },
  horasextra: {
    title: 'Informe de Horas Extra',
    desc:  'Por área y resumen mensual',
    kpis: [
      { value: '4.312 hs', label: 'Total horas extra' },
      { value: '$18.4M', label: 'Costo total' },
      { value: '980 hs', label: 'Máx. (Obras)' },
      { value: '310 hs', label: 'Mín. (M. Amb.)' },
      { value: '3%', label: 'Ausentismo' },
      { value: '47', label: 'Licencias activas' },
    ],
    tableHeaders: ['Secretaría', 'Empleados', 'Hs Extra', '% del total', 'Costo HS'],
    tableRows: [
      ['Obras Públicas', '214', '980 hs', '22.7%', '$4.9M'],
      ['Salud', '187', '754 hs', '17.5%', '$3.8M'],
      ['Seguridad', '178', '612 hs', '14.2%', '$3.1M'],
      ['Talleres', '96', '520 hs', '12.1%', '$2.1M'],
      ['Intendencia', '174', '816 hs', '18.9%', '$1.8M'],
      ['Educación', '302', '320 hs', '7.4%', '$1.4M'],
      ['Medio Ambiente', '96', '310 hs', '7.2%', '$1.3M'],
    ],
  },
};

let currentReport = 'ejecutivo';

// ── RENDER PREVIEW ──────────────────────────────────────
function renderPreview(reportKey) {
  const r = REPORTS[reportKey];
  if (!r) return;

  document.getElementById('previewTitle').textContent  = r.title;
  document.getElementById('previewDate').textContent   = new Date().toLocaleDateString('es-AR');
  const periodo = document.getElementById('optPeriodo')?.value || 'Agosto 2026';
  document.getElementById('previewPeriod').textContent = `Período: ${periodo}`;

  const badgeLabels = { ok: 'Normal', warn: 'Alerta', crit: 'CRÍTICO' };

  const kpiHTML = `
    <div class="preview-kpi-row">
      ${r.kpis.map(k => `
        <div class="preview-kpi">
          <div class="preview-kpi-value">${k.value}</div>
          <div class="preview-kpi-label">${k.label}</div>
        </div>`).join('')}
    </div>`;

  const theadHTML = `<tr>${r.tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr>`;
  const tbodyHTML = r.tableRows.map(row => {
    const lastCell = row[row.length - 1];
    const isStatus = ['ok','warn','crit'].includes(lastCell);
    return `<tr>${row.map((cell, i) => {
      if (i === row.length - 1 && isStatus) {
        return `<td><span class="preview-badge ${cell}">${badgeLabels[cell]}</span></td>`;
      }
      return `<td>${cell}</td>`;
    }).join('')}</tr>`;
  }).join('');

  document.getElementById('previewBody').innerHTML = `
    ${kpiHTML}
    <table class="preview-table">
      <thead>${theadHTML}</thead>
      <tbody>${tbodyHTML}</tbody>
    </table>`;
}

// ── REPORT SELECTOR ─────────────────────────────────────
document.querySelectorAll('.report-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.report-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentReport = item.dataset.report;
    renderPreview(currentReport);
  });
});
document.getElementById('optPeriodo')?.addEventListener('change', () => renderPreview(currentReport));

function simulateProgress(filename, type, dataCallback) {
  const container = document.getElementById('exportProgressContainer');
  const bar = document.getElementById('exportProgressBar');
  const status = document.getElementById('exportProgressStatus');
  const pct = document.getElementById('exportProgressPct');
  const dlLink = document.getElementById('exportDownloadLink');
  const anchor = document.getElementById('exportAnchor');
  
  if(!container) {
    dataCallback();
    return;
  }
  
  container.style.display = 'block';
  dlLink.style.display = 'none';
  bar.style.width = '0%';
  pct.textContent = '0%';
  status.textContent = 'Generando ' + type + '...';
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 20 + 5;
    if(progress > 100) progress = 100;
    
    bar.style.width = progress + '%';
    pct.textContent = Math.floor(progress) + '%';
    
    if(progress >= 100) {
      clearInterval(interval);
      status.textContent = '¡Listo!';
      
      const blob = dataCallback();
      if(blob) {
        const url = URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = filename;
        dlLink.style.display = 'block';
        
        // Auto download
        setTimeout(() => anchor.click(), 500);
      }
    }
  }, 200);
}

document.getElementById('btnPreviewModal')?.addEventListener('click', () => {
  const r = REPORTS[currentReport];
  if(!r) return;
  document.getElementById('modalTitle').textContent = 'Vista Previa: ' + r.title;
  
  // Clone preview body content but style for light theme
  const content = document.getElementById('previewBody').innerHTML;
  const modalContent = document.getElementById('modalContent');
  modalContent.innerHTML = content;
  
  // Apply inline styles to make tables visible in light background
  modalContent.querySelectorAll('table').forEach(t => {
    t.style.width = '100%';
    t.style.borderCollapse = 'collapse';
    t.style.marginTop = '20px';
    t.style.color = '#333';
  });
  modalContent.querySelectorAll('th').forEach(th => {
    th.style.borderBottom = '2px solid #ccc';
    th.style.padding = '8px';
    th.style.textAlign = 'left';
    th.style.color = '#000';
  });
  modalContent.querySelectorAll('td').forEach(td => {
    td.style.borderBottom = '1px solid #eee';
    td.style.padding = '8px';
  });
  modalContent.querySelectorAll('.preview-kpi').forEach(k => {
    k.style.background = '#f5f5f5';
    k.style.color = '#333';
    k.style.padding = '10px';
    k.style.borderRadius = '8px';
    k.style.display = 'inline-block';
    k.style.margin = '5px';
    k.style.minWidth = '120px';
    k.style.border = '1px solid #ddd';
  });
  
  document.getElementById('modalVistaPrevia').style.display = 'flex';
});

// ── PDF PROFESIONAL ──────────────────────────────────────
document.getElementById('btnExportPDF')?.addEventListener('click', () => {
  const r      = REPORTS[currentReport];
  const periodo = document.getElementById('optPeriodo')?.value || 'Agosto 2026';
  const { jsPDF } = window.jspdf;
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── HEADER ──
  doc.setFillColor(6, 11, 24);
  doc.rect(0, 0, 210, 42, 'F');

  // Franja azul lateral
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 6, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MUNICIPIO DE JUNÍN', 14, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 230);
  doc.text('Sistema de Gestión Municipal · Reporte Oficial', 14, 21);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(r.title.toUpperCase(), 14, 31);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(180, 200, 220);
  doc.text(`Período: ${periodo}`, 14, 38);
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 130, 38);

  // ── KPI BOXES ──
  let y = 52;
  const kpiW = 58; const kpiH = 18;
  r.kpis.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x   = 14 + col * (kpiW + 4);
    const ky  = y + row * (kpiH + 4);

    doc.setFillColor(245, 247, 255);
    doc.setDrawColor(210, 220, 240);
    doc.roundedRect(x, ky, kpiW, kpiH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(17, 29, 53);
    doc.text(kpi.value, x + 4, ky + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 110, 130);
    doc.text(kpi.label, x + 4, ky + 15);
  });

  y += Math.ceil(r.kpis.length / 3) * 22 + 6;

  // ── TABLA ──
  const statusColors = {
    ok:   { fill: [209, 250, 229], text: [6, 95, 70] },
    warn: { fill: [254, 243, 199], text: [146, 64, 14] },
    crit: { fill: [254, 226, 226], text: [153, 27, 27] },
  };
  const statusLabels = { ok: 'Normal', warn: 'Alerta', crit: 'CRÍTICO' };

  doc.autoTable({
    startY: y,
    head:   [r.tableHeaders],
    body:   r.tableRows.map(row => {
      const last = row[row.length - 1];
      if (['ok','warn','crit'].includes(last)) {
        return [...row.slice(0,-1), statusLabels[last]];
      }
      return row;
    }),
    headStyles:  { fillColor: [17, 29, 53], textColor: 255, fontSize: 9, fontStyle: 'bold', cellPadding: 5 },
    bodyStyles:  { fontSize: 8, cellPadding: 4 },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    columnStyles: { [r.tableHeaders.length - 1]: { halign: 'center' } },
    willDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === r.tableHeaders.length - 1) {
        const cell = r.tableRows[data.row.index]?.[r.tableRows[0].length - 1];
        if (statusColors[cell]) {
          const c = statusColors[cell];
          doc.setFillColor(...c.fill);
          doc.setTextColor(...c.text);
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  // ── FOOTER ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(240, 242, 248);
    doc.rect(0, 282, 210, 15, 'F');
    doc.setFontSize(7);
    doc.setTextColor(140, 150, 160);
    doc.text('Municipio de Junín · Sistema Digital Municipal v1.0 · Documento oficial · Confidencial', 14, 289);
    doc.text(`Página ${i} de ${pageCount}`, 185, 289, { align: 'right' });
  }

  const filename = `municipio-junin-${currentReport}-${periodo.replace(/\s/g, '-')}.pdf`;
  simulateProgress(filename, 'PDF', () => {
    addRecentExport(r.title, 'pdf', periodo);
    return doc.output('blob');
  });
});

// ── EXCEL PROFESIONAL ───────────────────────────────────
document.getElementById('btnExportExcel')?.addEventListener('click', () => {
  const r = REPORTS[currentReport];
  const periodo = document.getElementById('optPeriodo')?.value || 'Agosto 2026';
  const wb = XLSX.utils.book_new();

  // Hoja de datos
  const data = [
    ['MUNICIPIO DE JUNÍN'],
    [`Reporte: ${r.title}`],
    [`Período: ${periodo}`],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [],
    ['=== INDICADORES CLAVE ==='],
    ...r.kpis.map(k => [k.label, k.value]),
    [],
    ['=== DETALLE ==='],
    r.tableHeaders,
    ...r.tableRows.map(row => {
      const last = row[row.length-1];
      const labels = { ok:'Normal', warn:'Alerta', crit:'CRÍTICO' };
      return labels[last] ? [...row.slice(0,-1), labels[last]] : row;
    }),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = r.tableHeaders.map(() => ({ wch: 20 }));
  ws['!cols'][0] = { wch: 30 };
  XLSX.utils.book_append_sheet(wb, ws, r.title.slice(0,31));

  // Hoja resumen ejecutivo
  const resumen = [
    ['RESUMEN EJECUTIVO'],
    [],
    ['Indicador', 'Valor'],
    ['Total empleados', 1247],
    ['Masa salarial', '$186M'],
    ['Gasto agosto', '$284.5M'],
    ['Presupuesto', '$310M'],
    ['Ejecución %', '92%'],
    ['Horas extra', '4.312 hs'],
    ['Reclamos', 318],
    ['Ahorro IT', '$42M'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen Ejecutivo');

  const filename = `municipio-junin-${currentReport}-${periodo.replace(/\s/g,'-')}.xlsx`;
  
  simulateProgress(filename, 'Excel', () => {
    addRecentExport(r.title, 'excel', periodo);
    const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    return new Blob([wbout], {type:"application/octet-stream"});
  });
});

document.getElementById('btnPrint')?.addEventListener('click', () => window.print());

// ── RECENT EXPORTS ───────────────────────────────────────
function addRecentExport(title, type, periodo) {
  const list = document.getElementById('recentList');
  const item = document.createElement('div');
  item.className = 'recent-item';
  const ext = type === 'pdf' ? 'PDF' : 'XLS';
  item.innerHTML = `
    <span class="recent-icon ${type}">${ext}</span>
    <div class="recent-info">
      <span class="recent-name">${title} — ${periodo}</span>
      <span class="recent-time">Ahora mismo</span>
    </div>
    <button class="recent-download">↓</button>`;
  list.prepend(item);
}

document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('exportar');
  renderPreview('ejecutivo');
});
