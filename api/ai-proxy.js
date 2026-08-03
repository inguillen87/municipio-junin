// api/ai-proxy.js - Vercel Serverless Function
// Proxies requests to HF Inference API keeping the token server-side
// The client never sees the token - it's stored as a Vercel env var

export default async function handler(req, res) {
  // CORS - allow requests from our own domain
  res.setHeader('Access-Control-Allow-Origin', 'https://municipio-junin.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.MUNI_HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const { prompt, model } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const hfModel = model || 'mistralai/Mistral-7B-Instruct-v0.3';

    // Build Mistral instruct format
    const systemContext = 'Eres MuniCopilot, el asistente inteligente del Municipio de Junin, Mendoza, Argentina. ' +
      'Respondes preguntas sobre gestion municipal: presupuesto, empleados, reclamos, obras y servicios. ' +
      'Eres conciso, claro y respondes en espanol rioplatense. ' +
      'Datos del sistema: 1247 empleados, presupuesto $420M/mes, 318 reclamos activos, 8 obras en ejecucion, SLA 94%.';

    const fullPrompt = '<s>[INST] ' + systemContext + '\n\nPregunta: ' + prompt + ' [/INST]';

    const hfRes = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.7,
          return_full_text: false,
          do_sample: true,
        }
      }),
    });

    if (hfRes.status === 503) {
      return res.status(503).json({ loading: true, message: 'El modelo esta cargando, intenta en 20 segundos.' });
    }

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error('HF error:', hfRes.status, errText);
      return res.status(502).json({ error: 'Error en el servicio de IA', status: hfRes.status });
    }

    const data = await hfRes.json();

    if (Array.isArray(data) && data[0] && data[0].generated_text) {
      return res.status(200).json({ response: data[0].generated_text.trim() });
    }

    return res.status(200).json({ response: null, raw: data });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Error interno del proxy' });
  }
}
