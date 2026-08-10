// ============================================================
// HF-CLIENT.JS � Hugging Face Inference API Client
// MuniControl v2 � AI-powered municipal assistant
// ============================================================

(function(global) {
  'use strict';

  const HF_BASE = 'https://api-inference.huggingface.co/models';

  // Get API key from localStorage (user can set it)
  function getApiKey() {
    return localStorage.getItem('hf_api_key') || '';
  }

  function getHeaders() {
    const key = getApiKey();
    const h = { 'Content-Type': 'application/json' };
    if (key) h['Authorization'] = 'Bearer ' + key;
    return h;
  }

  // Generic inference call with retry on 503 (model loading)
  async function infer(model, payload, retries = 2) {
    const url = `${HF_BASE}/${model}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (resp.status === 503) {
        // Model is loading
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 3000));
          return infer(model, payload, retries - 1);
        }
        return { error: 'El modelo IA esté cargando. Intenta en 30 segundos.' };
      }

      if (!resp.ok) {
        const err = await resp.text();
        return { error: `Error API: ${resp.status}` };
      }

      return await resp.json();
    } catch (e) {
      return { error: 'Sin conexión a Hugging Face API. Usando modo demo.' };
    }
  }

  const HFClient = {

    // Set API key
    setApiKey(key) {
      localStorage.setItem('hf_api_key', key);
    },

    // -- 1. TEXT GENERATION (Mistral / Zephyr) ----------------
    async generateText(prompt, options = {}) {
      const model = options.model || 'mistralai/Mistral-7B-Instruct-v0.3';
      const payload = {
        inputs: prompt,
        parameters: {
          max_new_tokens: options.maxTokens || 300,
          temperature: options.temperature || 0.7,
          top_p: 0.95,
          do_sample: true,
          return_full_text: false
        }
      };
      const result = await infer(model, payload);
      if (result.error) return result;
      if (Array.isArray(result) && result[0]) return { text: result[0].generated_text };
      return { error: 'Respuesta inesperada del modelo' };
    },

    // -- 2. ZERO-SHOT CLASSIFICATION --------------------------
    async classify(text, labels) {
      const model = 'facebook/bart-large-mnli';
      const payload = {
        inputs: text,
        parameters: { candidate_labels: labels, multi_label: false }
      };
      const result = await infer(model, payload);
      if (result.error) return result;
      // Returns { labels: [...], scores: [...] }
      return {
        label: result.labels?.[0],
        score: result.scores?.[0],
        all: result.labels?.map((l, i) => ({ label: l, score: result.scores[i] }))
      };
    },

    // -- 3. SUMMARIZATION --------------------------------------
    async summarize(text, maxLength = 130) {
      const model = 'facebook/bart-large-cnn';
      const payload = {
        inputs: text,
        parameters: { max_length: maxLength, min_length: 40, do_sample: false }
      };
      const result = await infer(model, payload);
      if (result.error) return result;
      if (Array.isArray(result) && result[0]) return { summary: result[0].summary_text };
      return { error: 'No se pudo resumir' };
    },

    // -- 4. MUNICIPAL ASSISTANT (structured prompt) -----------
    async municipalAssistant(userMessage, context = {}) {
      // Build rich municipal context
      const empleados = context.empleados || 1247;
      const presupuesto = context.presupuesto || '$372M';
      const reclamos = context.reclamos || 47;
      const mes = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

      const systemPrompt = `Eres MuniBot, el asistente de inteligencia artificial del Municipio de Junín, Mendoza, Argentina. 
Tienes acceso a los datos municipales en tiempo real:
- Empleados municipales: ${empleados}
- Presupuesto anual: ${presupuesto}
- Reclamos pendientes: ${reclamos}
- Per�odo: ${mes}
- Secretaráas: Salud, Obras Públicas, Educación, Seguridad, Hacienda, Medio Ambiente, Cultura, RRHH
Responde siempre en español argentino, de manera clara, concisa y �til para funcionarios municipales.
Si no sabes algo, lo dices claramente. Nunca inventes datos.`;

      const prompt = `<s>[INST] ${systemPrompt}\n\nPregunta del usuario: ${userMessage} [/INST]`;

      return this.generateText(prompt, { maxTokens: 400 });
    },

    // -- 5. SIMPLIFICA IA --------------------------------------
    async simplifica(textoLegal) {
      const prompt = `<s>[INST] Eres un experto en simplificar textos legales y administrativos argentinos para que cualquier ciudadano los entienda sin conocimientos técnicos. 
Simplifica este texto en lenguaje claro y amigable, sin tecnicismos, en no m�s de 3 p�rrafos cortos:

${textoLegal} [/INST]`;
      return this.generateText(prompt, { maxTokens: 350, temperature: 0.6 });
    },

    // -- 6. CLASSIFY RECLAMO ----------------------------------
    async clasificarReclamo(descripcion) {
      const labels = ['bache en calle', 'luminaria fundida', 'recolección de residuos', 
                      '�rbol ca�do o peligroso', 'p�rdida de agua', 'problema cloacal',
                      'ruidos molestos', 'problema de tr�nsito', 'animales sueltos', 'otro problema'];
      const result = await this.classify(descripcion, labels);
      if (result.error) return result;
      // Map to our categories
      const mapping = {
        'bache en calle': 'Bache',
        'luminaria fundida': 'Luminaria',
        'recolección de residuos': 'Residuos',
        '�rbol ca�do o peligroso': 'Arbolado',
        'p�rdida de agua': 'Agua',
        'problema cloacal': 'Cloacas',
        'ruidos molestos': 'Ruidos',
        'problema de tr�nsito': 'Tr�nsito',
        'animales sueltos': 'Animales',
        'otro problema': 'Otro'
      };
      return {
        categoria: mapping[result.label] || 'Otro',
        confianza: Math.round((result.score || 0) * 100),
        label: result.label
      };
    },

    // -- 7. RESUMEN DE RECLAMOS --------------------------------
    async resumirReclamos(reclamos) {
      const texto = reclamos.map(r => 
        `${r.tipo} en ${r.calle}: ${r.descripcion} (Estado: ${r.estado})`
      ).join('. ');
      return this.summarize(texto, 150);
    },

    // -- 8. REDACTOR DE NOTAS (para empleados) ----------------
    async redactarNota(instruccion) {
      const prompt = `<s>[INST] Eres asistente de redacción para la administración pública argentina. Redacta de manera formal y profesional: ${instruccion} [/INST]`;
      return this.generateText(prompt, { maxTokens: 400, temperature: 0.5 });
    }
  };

  global.HFClient = HFClient;
  console.log('[HFClient] Hugging Face API client ready.');

})(window);

