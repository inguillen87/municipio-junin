// api/lib/whatsapp-templates.js
// MuniControl — Programación y Disparo de Plantillas Oficiales de WhatsApp Cloud API

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

/**
 * Función genérica para enviar plantillas de Meta
 */
export async function sendMetaTemplate({ to, templateName, languageCode = 'es', components = [], phoneId = process.env.WHATSAPP_PHONE_ID_VECINOS || process.env.WHATSAPP_PHONE_ID }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneId || !to) {
    console.warn('[WA-TEMPLATE] Faltan credenciales de WhatsApp (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_ID)');
    return { success: false, error: 'Credenciales incompletas' };
  }

  const url = `${META_GRAPH_URL}/${phoneId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[WA-TEMPLATE-ERROR]', JSON.stringify(data));
      return { success: false, error: data };
    }
    console.log(`[WA-TEMPLATE-SUCCESS] Plantilla ${templateName} enviada a ${to}`);
    return { success: true, data };
  } catch (err) {
    console.error('[WA-TEMPLATE-EXC]', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 1. Plantilla Oficial: municontrol_alerta
 */
export async function sendMuniControlAlertaTemplate({ to, nombre = 'Gobernante', reporte = 'Hacienda y Finanzas', link = 'https://municipio-junin.vercel.app/inteligencia.html?auth=governante' }) {
  return await sendMetaTemplate({
    to,
    templateName: 'municontrol_alerta',
    phoneId: process.env.WHATSAPP_PHONE_ID,
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre },
          { type: 'text', text: reporte },
          { type: 'text', text: link }
        ]
      }
    ]
  });
}

/**
 * 2. Plantilla Oficial: municontrol_menu
 */
export async function sendMuniControlMenuTemplate({ to, nombre = 'Gobernante', opcion = '1 (Gobernantes) o 2 (Vecinos)' }) {
  return await sendMetaTemplate({
    to,
    templateName: 'municontrol_menu',
    phoneId: process.env.WHATSAPP_PHONE_ID,
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre },
          { type: 'text', text: opcion }
        ]
      }
    ]
  });
}

/**
 * 3. Confirmación de Reclamo 311
 */
export async function sendReclamoConfirmacionTemplate({ to, nombre, ticketId, categoria, estado, link }) {
  return await sendMetaTemplate({
    to,
    templateName: 'confirmacion_reclamo_311',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre || 'Vecino/a' },
          { type: 'text', text: ticketId || '2026-001' },
          { type: 'text', text: categoria || 'Servicios Públicos' },
          { type: 'text', text: estado || 'En Proceso' },
          { type: 'text', text: link || 'https://municipio-junin.vercel.app/ciudadano.html' }
        ]
      }
    ]
  });
}

/**
 * 4. Notificación de Reclamo Resuelto
 */
export async function sendReclamoResolucionTemplate({ to, nombre, ticketId, categoria, solucion }) {
  return await sendMetaTemplate({
    to,
    templateName: 'resolucion_reclamo_311',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre || 'Vecino/a' },
          { type: 'text', text: ticketId || '2026-001' },
          { type: 'text', text: categoria || 'Reclamo 311' },
          { type: 'text', text: solucion || 'Cuadrilla municipal completó la reparación.' }
        ]
      }
    ]
  });
}

/**
 * 5. Confirmación de Turno Municipal
 */
export async function sendTurnoConfirmacionTemplate({ to, nombre, tramite, fecha, hora, lugar, qrCode }) {
  return await sendMetaTemplate({
    to,
    templateName: 'confirmacion_turno_vecino',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nombre || 'Vecino/a' },
          { type: 'text', text: tramite || 'Licencia de Conducir' },
          { type: 'text', text: fecha || '12/08/2026' },
          { type: 'text', text: hora || '09:30' },
          { type: 'text', text: lugar || 'Municipalidad de Junín' }
        ]
      }
    ]
  });
}

/**
 * 6. Alerta Ejecutiva para Gobernantes
 */
export async function sendAlertaEjecutivaTemplate({ to, area, indicador, nivel, porcentaje, link }) {
  return await sendMetaTemplate({
    to,
    templateName: 'alerta_ejecutiva_gobernantes',
    phoneId: process.env.WHATSAPP_PHONE_ID,
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: area || 'Obras Públicas' },
          { type: 'text', text: indicador || 'Ejecución Presupuestaria' },
          { type: 'text', text: nivel || 'ALERTA CRÍTICA' },
          { type: 'text', text: String(porcentaje || '118') },
          { type: 'text', text: link || 'https://municipio-junin.vercel.app/inteligencia.html?auth=governante' }
        ]
      }
    ]
  });
}
