// api/ai-proxy.js — MuniCopilot AI Proxy
// Uses HuggingFace Inference API (Qwen2.5-72B or Llama-3.3-70B)
// Token stored server-side as MUNI_HF_TOKEN env var

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.MUNI_HF_TOKEN;
  if (!token) {
    console.error('MUNI_HF_TOKEN not set');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  // Accept both 'message' (from ia.html) and 'prompt' (legacy)
  const userMessage = req.body?.message || req.body?.prompt;
  const systemCtx   = req.body?.system  || null;

  if (!userMessage) {
    return res.status(400).json({ error: 'message is required' });
  }

  const SYSTEM = systemCtx || `Sos MuniCopilot, el asistente inteligente del Municipio de Junín, Mendoza, Argentina.
Ayudás a empleados municipales y funcionarios con consultas sobre gestión municipal.
Respondés en español rioplatense, de forma clara, concisa y profesional.
Contexto del sistema actual:
- Empleados activos: 1.247
- Presupuesto mensual: $420.000.000
- Presupuesto anual 2026: $4.200.000.000 (67% ejecutado)
- Reclamos vecinos activos: 318 (23 sin resolver, SLA 94%)
- Obras en ejecución: 8 (inversión total $142M)
- Secretarías: Intendencia, Hacienda, RRHH, Obras Públicas, Servicios, Cultura
- Municipio: Junín, Mendoza, Argentina
Siempre respondé en español. Sé útil y preciso.`;

  // Try models in order of preference
  const MODELS = [
    'Qwen/Qwen2.5-72B-Instruct',
    'meta-llama/Llama-3.3-70B-Instruct',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
  ];

  let lastError = null;

  for (const modelId of MODELS) {
    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user',   content: userMessage }
            ],
            max_tokens: 600,
            temperature: 0.7,
            stream: false,
          }),
        }
      );

      if (response.status === 503) {
        // Model loading — try next
        lastError = 'Model loading';
        continue;
      }

      if (response.status === 429) {
        lastError = 'Rate limit';
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error(`HF error [${modelId}]:`, response.status, errText);
        lastError = `HF ${response.status}`;
        continue;
      }

      const data = await response.json();

      // OpenAI-compatible response format
      const text = data?.choices?.[0]?.message?.content;
      if (text && text.trim()) {
        return res.status(200).json({
          response: text.trim(),
          model: modelId,
        });
      }

      lastError = 'Empty response';
    } catch (err) {
      console.error(`Fetch error [${modelId}]:`, err.message);
      lastError = err.message;
    }
  }

  // All models failed
  console.error('All models failed. Last error:', lastError);
  return res.status(502).json({
    error: 'No se pudo conectar con el servicio de IA. Intenta nuevamente.',
    detail: lastError,
  });
}
