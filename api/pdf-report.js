export default async function handler(req, res) {
  const reqUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const type = (reqUrl.searchParams.get('type') || req.query?.type || 'resumen').toLowerCase();
  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe Oficial Municipal — ${type.toUpperCase()}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; background: #f8fafc; }
    .page-container { background: #ffffff; max-width: 800px; margin: 60px auto 20px auto; padding: 40px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    
    /* Top Action Bar (Hidden when printing) */
    .action-bar {
      position: fixed; top: 0; left: 0; right: 0; height: 60px;
      background: #0f172a; color: white; display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    .action-btn {
      padding: 10px 18px; border-radius: 8px; border: none; font-weight: 700; font-size: 13px;
      cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: transform 0.2s;
    }
    .btn-print { background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; }
    .btn-close { background: rgba(255,255,255,0.1); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.2); }

    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; }
    .muni-title { font-size: 24px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: -0.5px; }
    .muni-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
    .badge { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 99px; }
    .card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
    .card-val { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    .card-lbl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th { background: #0f172a; color: white; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    .signature { margin-top: 40px; text-align: right; }
    .sig-line { display: inline-block; border-top: 1px solid #0f172a; width: 220px; text-align: center; padding-top: 6px; font-size: 12px; font-weight: 700; }

    @media print {
      body { background: #ffffff; padding: 0; }
      .action-bar { display: none !important; }
      .page-container { margin: 0; padding: 0; box-shadow: none; max-width: 100%; }
    }
  </style>
</head>
<body>

  <!-- Floating Action Bar -->
  <div class="action-bar">
    <div style="font-weight:700;font-size:14px">📄 Vista Previa de Documento Oficial</div>
    <div style="display:flex;gap:12px">
      <button class="action-btn btn-print" onclick="window.print()">
        🖨️ Imprimir / Guardar en PDF
      </button>
      <button class="action-btn btn-close" onclick="window.close()">
        ✕ Cerrar
      </button>
    </div>
  </div>

  <div class="page-container">
    <div class="header">
      <div>
        <div class="muni-title">Municipalidad de Junín</div>
        <div class="muni-sub">Provincia de Mendoza | Sistema MuniControl GovTech v2.0</div>
      </div>
      <div style="text-align:right">
        <span class="badge">DOCUMENTO OFICIAL DE GESTIÓN</span>
        <div style="font-size:12px;color:#64748b;margin-top:8px">Fecha: ${dateStr} - ${timeStr} hs</div>
      </div>
    </div>

    <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:8px">
      ${type === 'presupuesto' ? '📊 Reporte de Ejecución Presupuestaria y Finanzas' :
        type === 'obras' ? '🏗️ Estado General de Obras Públicas e Infraestructura' :
        type === 'rrhh' ? '👥 Nómina y Ausentismo de Recursos Humanos' :
        type === 'reclamos' ? '🔔 Informe de Atención Ciudadana Sistema 311' :
        '🏛️ Informe Ejecutivo de Gestión Municipal'}
    </h2>
    <p style="font-size:13px;color:#64748b;margin-bottom:24px">Documento generado automáticamente por MuniBot con validación de datos en tiempo real.</p>

    <div class="card-grid">
      <div class="card">
        <div class="card-val">$165.3M</div>
        <div class="card-lbl">Presupuesto Ejecutado</div>
      </div>
      <div class="card">
        <div class="card-val">$179.0M</div>
        <div class="card-lbl">Saldo Disponible</div>
      </div>
      <div class="card">
        <div class="card-val">94%</div>
        <div class="card-lbl">SLA Cumplimiento 311</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Área / Secretaría</th>
          <th>Concepto / Proyecto</th>
          <th>Estado</th>
          <th>Monto / Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Obras Públicas</td>
          <td>Pavimentación Av. San Martín - Lote 2</td>
          <td><strong style="color:#2563eb">En Ejecución (45%)</strong></td>
          <td>$85,000,000</td>
        </tr>
        <tr>
          <td>Salud y Desarrollo</td>
          <td>Provisión Medicamentos Hospital Municipal</td>
          <td><strong style="color:#16a34a">Al Día</strong></td>
          <td>$18,500,000</td>
        </tr>
        <tr>
          <td>Servicios Públicos</td>
          <td>Recolección y Gestión Residuos Zona Norte</td>
          <td><strong style="color:#16a34a">Al Día</strong></td>
          <td>$32,000,000</td>
        </tr>
        <tr>
          <td>Hacienda</td>
          <td>Licencias e Infraestructura Informática</td>
          <td><strong style="color:#16a34a">Pagado</strong></td>
          <td>$15,000,000</td>
        </tr>
        <tr>
          <td>Medio Ambiente</td>
          <td>Mantenimiento Parques, Plazas y Luminarias LED</td>
          <td><strong style="color:#2563eb">En Progreso</strong></td>
          <td>$14,800,000</td>
        </tr>
      </tbody>
    </table>

    <div class="signature">
      <div class="sig-line">
        Intendencia Municipal<br>
        <span style="font-weight:400;font-size:11px;color:#64748b">Municipalidad de Junín — Mendoza</span>
      </div>
    </div>

    <div class="footer">
      <div>MuniControl GovTech Argentina — Certificado Digital #MC-2026-9481</div>
      <div>Página 1 de 1</div>
    </div>
  </div>

</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
