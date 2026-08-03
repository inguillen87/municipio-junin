export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { message, severity = 'critical', module = 'General', to } = req.body;
  const targetPhone = to || '+5492610000000'; // Default admin fallback

  // Check for TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM env vars.
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!sid || !token) {
    return res.status(200).json({ 
      success: false, 
      status: 'not_configured', 
      message: 'Configurá Twilio en Vercel' 
    });
  }

  const alertMessage = `🚨 *MuniControl - Alerta ${severity.toUpperCase()}*
📍 Municipio de Junín, Mendoza
📋 Módulo: ${module}
⚠️ ${message}
🕐 ${new Date().toLocaleString('es-AR')}
_Ver dashboard: https://municipio-junin.vercel.app/inteligencia_`;

  try {
    const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams();
    params.append('From', from);
    params.append('To', targetPhone.startsWith('whatsapp:') ? targetPhone : `whatsapp:${targetPhone}`);
    params.append('Body', alertMessage);

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await twilioRes.json();

    if (!twilioRes.ok) {
      throw new Error(`Twilio Error: ${JSON.stringify(data)}`);
    }

    return res.status(200).json({ success: true, messageId: data.sid, to: targetPhone });
  } catch (error) {
    console.error('Error sending WhatsApp alert:', error);
    return res.status(500).json({ success: false, error: 'Error al enviar alerta de WhatsApp' });
  }
}
