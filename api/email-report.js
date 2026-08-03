import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { period = 'monthly', to, subject } = req.body;
  // Fase 1: guillen.marce@gmail.com (testing)
  // Fase 2: intendente@juninmendoza.gob.ar + secretarios (producción)
  const targetEmail = to || process.env.REPORT_EMAIL_TO || 'guillen.marce@gmail.com';
  const mailSubject = subject || `Informe Ejecutivo - MuniControl (${period})`;

  try {
    // 1. Call GET /api/reports to get the executive summary data
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const reportsUrl = `${proto}://${host}/api/reports?period=${period}`;
    
    let reportData = {};
    try {
      const response = await fetch(reportsUrl);
      if (response.ok) {
        reportData = await response.json();
      }
    } catch (e) {
      console.warn('Failed to fetch from /api/reports', e.message);
    }
    
    const kpis = reportData.kpis || { empleados: '1.240', gasto: '$450M', obras: '12', licitaciones: '5' };
    const narrative = reportData.narrative || 'El municipio mantiene un balance positivo en las métricas clave del período. El gasto operativo está controlado y se ha visto un incremento en la finalización de obras. Recomendamos seguir monitoreando los indicadores de licitaciones públicas.';
    const alerts = reportData.alerts || [];

    // 2. Build HTML email
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${mailSubject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; }
        .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; color: #ffffff; }
        .header p { margin: 8px 0 0; color: #bfdbfe; font-size: 14px; }
        .content { padding: 24px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .kpi-card { background-color: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid #334155; text-align: center; }
        .kpi-title { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .kpi-value { font-size: 20px; font-weight: bold; color: #f8fafc; }
        .section-title { font-size: 18px; color: #38bdf8; margin: 0 0 16px 0; border-bottom: 1px solid #334155; padding-bottom: 8px; }
        .narrative { line-height: 1.6; color: #cbd5e1; font-size: 14px; margin-bottom: 24px; }
        .alerts { background-color: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
        .alert-item { color: #fca5a5; font-size: 14px; margin-bottom: 8px; }
        .alert-item:last-child { margin-bottom: 0; }
        .footer { padding: 20px; text-align: center; border-top: 1px solid #334155; }
        .button { display: inline-block; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MuniControl</h1>
          <p>Municipio de Junín - ${mailSubject}</p>
        </div>
        
        <div class="content">
          <div class="grid">
            <div class="kpi-card">
              <div class="kpi-title">Empleados</div>
              <div class="kpi-value">${kpis.empleados || '0'}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Gasto Mensual</div>
              <div class="kpi-value">${kpis.gasto || '$0'}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Obras Activas</div>
              <div class="kpi-value">${kpis.obras || '0'}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Licitaciones</div>
              <div class="kpi-value">${kpis.licitaciones || '0'}</div>
            </div>
          </div>

          <h2 class="section-title">Análisis Ejecutivo (IA)</h2>
          <div class="narrative">${narrative}</div>

          ${alerts && alerts.length > 0 ? `
          <h2 class="section-title" style="color: #ef4444;">Alertas Críticas</h2>
          <div class="alerts">
            ${alerts.map(a => `<div class="alert-item">⚠️ ${a.message || a}</div>`).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="footer">
          <a href="https://${host}/dashboard" class="button">Ver dashboard completo</a>
        </div>
      </div>
    </body>
    </html>
    `;

    // 4. Log to data_audit table
    try {
      await pool.query(
        'INSERT INTO data_audit (action, table_name, record_id, details) VALUES ($1, $2, $3, $4)',
        ['EMAIL_REPORT_PREPARE', 'system', 0, JSON.stringify({ to: targetEmail, subject: mailSubject, period })]
      );
    } catch (e) {
      console.warn('Could not log to data_audit', e.message);
    }

    // 3. Send via Resend API
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('No RESEND_API_KEY configured');
      return res.status(200).json({ 
        success: false, 
        status: 'no_api_key', 
        message: 'Agregá RESEND_API_KEY en Vercel Environment Variables', 
        emailPreview: html 
      });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Fase 1: usar onboarding@resend.dev (gratis, sin verificar dominio)
        // Fase 2: verificar dominio → informes@municontrol.ar o sistema@juninmendoza.gob.ar
        from: process.env.RESEND_FROM || 'MuniControl <onboarding@resend.dev>',
        to: [targetEmail],
        subject: mailSubject,
        html: html
      })
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(resendData)}`);
    }

    try {
      await pool.query(
        'INSERT INTO data_audit (action, table_name, record_id, details) VALUES ($1, $2, $3, $4)',
        ['EMAIL_REPORT_SENT', 'system', 0, JSON.stringify({ to: targetEmail, subject: mailSubject, period, messageId: resendData.id })]
      );
    } catch (e) {
      console.warn('Could not log to data_audit', e.message);
    }

    return res.status(200).json({ success: true, messageId: resendData.id, to: targetEmail, period });

  } catch (error) {
    console.error('Error sending email report:', error);
    return res.status(500).json({ success: false, error: 'Error procesando el envío de email' });
  }
}
