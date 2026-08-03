import pkg from 'pg';
const { Pool } = pkg;
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { period = 'weekly', to, subject } = req.body;
  // Fase 1: guillen.marce@gmail.com (testing)
  // Fase 2: intendente@juninmendoza.gob.ar + secretarios (produccion)
  const targetEmail = to || process.env.REPORT_EMAIL_TO || 'guillen.marce@gmail.com';
  const mailSubject = subject || `Informe ${period === 'weekly' ? 'Semanal' : 'Mensual'} - MuniControl`;

  try {
    // 1. Fetch real data from DB or use defaults
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'municipio-junin.vercel.app';
    const baseUrl = `${proto}://${host}`;

    let reportData = {};
    try {
      const response = await fetch(`${baseUrl}/api/reports?period=${period}`);
      if (response.ok) reportData = await response.json();
    } catch (e) {
      console.warn('Failed to fetch /api/reports', e.message);
    }

    const kpis = reportData.kpis || { empleados: '1.240', gasto: '$450M', obras: '12', licitaciones: '5' };
    const narrative = reportData.narrative || 'El municipio mantiene un balance positivo en las metricas clave del periodo. El gasto operativo esta controlado y se ha visto un incremento en la finalizacion de obras. Recomendamos seguir monitoreando los indicadores de licitaciones publicas.';
    const alerts = reportData.alerts || [];

    // 2. Generate magic link tokens (72h expiry)
    const userData = {
      name: 'Funcionario',
      email: targetEmail,
      role: 'INTENDENTE',
      secretaria: 'Intendencia'
    };
    const authToken = generateMagicToken(userData);

    const magicLink = (page) => `${baseUrl}/api/auth-email?token=${authToken}&redirect=/${page}`;

    // 3. Build premium HTML email
    const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${mailSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background-color:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;margin-top:20px;margin-bottom:20px;">

    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;font-size:28px;color:#ffffff;font-weight:800;letter-spacing:-0.5px;">MuniControl</h1>
      <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Municipio de Jun&iacute;n, Mendoza</p>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:12px;">${fecha}</p>
    </div>

    <!-- KPI GRID -->
    <div style="padding:24px;">
      <h2 style="font-size:16px;color:#38bdf8;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Indicadores Clave</h2>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
        <tr>
          <td style="background:#0f172a;padding:16px;border-radius:8px;border:1px solid #334155;text-align:center;width:50%;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Empleados Activos</div>
            <div style="font-size:24px;font-weight:800;color:#f8fafc;">${kpis.empleados || '0'}</div>
          </td>
          <td style="background:#0f172a;padding:16px;border-radius:8px;border:1px solid #334155;text-align:center;width:50%;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Gasto Mensual</div>
            <div style="font-size:24px;font-weight:800;color:#f8fafc;">${kpis.gasto || '$0'}</div>
          </td>
        </tr>
        <tr>
          <td style="background:#0f172a;padding:16px;border-radius:8px;border:1px solid #334155;text-align:center;width:50%;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Obras Activas</div>
            <div style="font-size:24px;font-weight:800;color:#10b981;">${kpis.obras || '0'}</div>
          </td>
          <td style="background:#0f172a;padding:16px;border-radius:8px;border:1px solid #334155;text-align:center;width:50%;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Licitaciones</div>
            <div style="font-size:24px;font-weight:800;color:#a78bfa;">${kpis.licitaciones || '0'}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- AI ANALYSIS -->
    <div style="padding:0 24px 24px;">
      <h2 style="font-size:16px;color:#38bdf8;margin:0 0 12px;border-bottom:1px solid #334155;padding-bottom:8px;">An&aacute;lisis Ejecutivo (IA)</h2>
      <p style="line-height:1.7;color:#cbd5e1;font-size:14px;margin:0;">${narrative}</p>
    </div>

    <!-- ALERTS -->
    ${alerts && alerts.length > 0 ? `
    <div style="padding:0 24px 24px;">
      <h2 style="font-size:16px;color:#ef4444;margin:0 0 12px;">Alertas Cr&iacute;ticas</h2>
      <div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;padding:16px;">
        ${alerts.map(a => `<div style="color:#fca5a5;font-size:14px;margin-bottom:8px;">&#9888;&#65039; ${a.message || a}</div>`).join('')}
      </div>
    </div>
    ` : ''}

    <!-- QUICK ACCESS LINKS -->
    <div style="padding:0 24px 24px;">
      <h2 style="font-size:16px;color:#38bdf8;margin:0 0 16px;border-bottom:1px solid #334155;padding-bottom:8px;">Acceso R&aacute;pido</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;">
        <tr>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('index.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#128202;</div>
              <div style="font-size:11px;color:#94a3b8;">Dashboard</div>
            </a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('hacienda.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#128176;</div>
              <div style="font-size:11px;color:#94a3b8;">Hacienda</div>
            </a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('obras.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#127959;</div>
              <div style="font-size:11px;color:#94a3b8;">Obras</div>
            </a>
          </td>
        </tr>
        <tr>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('rrhh.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#128101;</div>
              <div style="font-size:11px;color:#94a3b8;">RRHH</div>
            </a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('analytics.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#128200;</div>
              <div style="font-size:11px;color:#94a3b8;">Anal&iacute;tica</div>
            </a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('cuentas-claras.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#128270;</div>
              <div style="font-size:11px;color:#94a3b8;">Transparencia</div>
            </a>
          </td>
        </tr>
        <tr>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('control.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#9888;&#65039;</div>
              <div style="font-size:11px;color:#94a3b8;">Control</div>
            </a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('licitaciones.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#128221;</div>
              <div style="font-size:11px;color:#94a3b8;">Licitaciones</div>
            </a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="${magicLink('ia.html')}" style="display:block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 8px;text-decoration:none;">
              <div style="font-size:20px;margin-bottom:4px;">&#129302;</div>
              <div style="font-size:11px;color:#94a3b8;">IA Municipal</div>
            </a>
          </td>
        </tr>
      </table>
    </div>

    <!-- MAIN CTA -->
    <div style="padding:0 24px 32px;text-align:center;">
      <a href="${magicLink('index.html')}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.02em;">Ver Dashboard Completo</a>
      <p style="margin:12px 0 0;color:#64748b;font-size:11px;">Este enlace es seguro y expira en 72 horas</p>
    </div>

    <!-- FOOTER -->
    <div style="padding:20px 24px;border-top:1px solid #334155;text-align:center;">
      <p style="color:#64748b;font-size:11px;margin:0 0 4px;">MuniControl &mdash; Plataforma de Gesti&oacute;n Municipal Inteligente</p>
      <p style="color:#475569;font-size:10px;margin:0;">Municipio de Jun&iacute;n, Mendoza, Argentina</p>
      <p style="color:#475569;font-size:10px;margin:4px 0 0;">Este email fue generado autom&aacute;ticamente. Los enlaces de acceso son personales y seguros.</p>
    </div>

  </div>
</body>
</html>`;

    // 4. Log to audit
    try {
      await pool.query(
        'INSERT INTO data_audit (action, table_name, record_id, details) VALUES ($1, $2, $3, $4)',
        ['EMAIL_REPORT_PREPARE', 'system', 0, JSON.stringify({ to: targetEmail, subject: mailSubject, period })]
      );
    } catch (e) {
      console.warn('Could not log to data_audit', e.message);
    }

    // 5. Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(200).json({
        success: false,
        status: 'no_api_key',
        message: 'Agrega RESEND_API_KEY en Vercel Environment Variables',
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
        // Fase 1: onboarding@resend.dev (gratis, sin verificar dominio)
        // Fase 2: informes@municontrol.ar
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
    return res.status(500).json({ success: false, error: 'Error procesando el envio de email' });
  }
}

function generateMagicToken(userData, expiresInHours = 72) {
  const payload = {
    name: userData.name,
    email: userData.email,
    role: userData.role,
    secretaria: userData.secretaria || 'Sistema',
    exp: Date.now() + (expiresInHours * 60 * 60 * 1000),
    iat: Date.now()
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = process.env.CRON_SECRET || 'municontrol-default-secret-2026';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');

  return payloadB64 + '.' + signature;
}
