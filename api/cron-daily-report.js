import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export default async function handler(req, res) {
  // Verify Vercel cron secret
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('Unauthorized cron invocation', authHeader);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const baseUrl = `${proto}://${host}`;

    // 2. Call email-report to send to configured recipients
    const emailRes = await fetch(`${baseUrl}/api/email-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'daily', subject: 'MuniControl - Reporte Diario' })
    });
    const emailData = await emailRes.json();

    // 3. Check for any critical alerts (alert_level='critical' in intelligence_reports)
    let criticalAlerts = [];
    try {
      const result = await pool.query(`
        SELECT title, message, module 
        FROM intelligence_reports 
        WHERE alert_level = 'critical' 
          AND created_at >= NOW() - INTERVAL '24 hours'
      `);
      criticalAlerts = result.rows;
    } catch (e) {
      console.warn('Could not fetch critical alerts or table does not exist', e.message);
    }

    // 4. If critical alerts found, also call whatsapp-alert
    let whatsappResults = [];
    for (const alert of criticalAlerts) {
      try {
        const waRes = await fetch(`${baseUrl}/api/whatsapp-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: alert.message || alert.title, 
            severity: 'critical', 
            module: alert.module || 'General' 
          })
        });
        const waData = await waRes.json();
        whatsappResults.push(waData);
      } catch (e) {
        console.warn('Failed to send whatsapp alert', e.message);
      }
    }

    // 5. Log to data_audit
    try {
      await pool.query(
        'INSERT INTO data_audit (action, table_name, record_id, details) VALUES ($1, $2, $3, $4)',
        ['CRON_DAILY_REPORT', 'system', 0, JSON.stringify({ emailSent: !!emailData.success, alertsSent: whatsappResults.length })]
      );
    } catch (e) {
      console.warn('Could not log to data_audit', e.message);
    }

    // 6. Return summary of what was done
    return res.status(200).json({
      success: true,
      summary: 'Reporte diario ejecutado con éxito',
      email: emailData,
      whatsapp: whatsappResults
    });

  } catch (error) {
    console.error('Error in daily cron:', error);
    return res.status(500).json({ success: false, error: 'Error ejecutando cron daily report' });
  }
}
