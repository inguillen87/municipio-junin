# Copiloto municipal v2 — síntesis optativa con evidencia

**Estado:** implementado y probado localmente; no desplegado ni probado contra un proveedor real en este corte.

## Objetivo y límite

El copiloto v2 mejora la lectura de respuestas agregadas y del manual sin delegar
el cálculo ni la autorización a un modelo. La respuesta determinista sigue siendo
la autoridad. La síntesis es una capa de redacción opcional y descartable.

No habilita búsquedas de personas, decisiones laborales, predicciones, causalidad,
acciones nuevas ni conocimiento externo. Tampoco reemplaza los contratos GRH, los
permisos server-side ni la validación humana.

## Flujo gobernado

1. `api/ai-analyze.js` clasifica la consulta y construye la respuesta determinista.
2. El servidor verifica rol/capability, intent allowlisted y proveniencia
   `aggregateOnly:true` / `containsPii:false`.
3. Sólo con modo `assisted` y feature flag activa se construye un catálogo acotado
   de hechos y acciones ya autorizadas. No se envían la pregunta original, el
   historial, el tenant, filas raw ni identificadores personales.
4. `api/lib/municipal-copilot.js` realiza como máximo una llamada a OpenAI Responses
   con `store:false`, sin tools ni búsqueda web y con JSON Schema estricto. Incluye
   un `safety_identifier` HMAC estable que no revela tenant, usuario ni correo.
5. El servidor rechaza citas inexistentes, acciones inventadas, inferencias
   causales y afirmaciones cuyos términos materiales o números no aparezcan,
   en el mismo orden, dentro de un único hecho citado (`label + text`). No se
   combinan cifras o palabras entre citas ni contra el catálogo global. La
   normalización sólo cubre flexión mínima controlada; no usa un blacklist
   creciente. Ante cualquier
   rechazo, timeout o caída se entrega la respuesta
   determinista completa.

El manual contextual se resuelve primero con
`api/lib/municipal-assistant-manual.js`; la síntesis nunca concede una capability.

## Configuración y límites de costo

La función queda desactivada por defecto. Para habilitarla en un entorno aprobado:

- `MUNI_AI_SYNTHESIS_ENABLED=true`;
- `OPENAI_API_KEY`: secreto server-side ya administrado por el entorno; nunca se
  expone al navegador, logs, respuesta ni repositorio;
- `MUNI_AI_MODEL`: sólo acepta el modelo allowlisted; cualquier otro valor vuelve
  al modelo configurado por código;
- `MUNI_AI_TIMEOUT_MS`: entre 1.000 y 8.000 ms; 6.000 ms por defecto;
- `MUNI_AI_MAX_OUTPUT_TOKENS`: entre 160 y 480; 360 por defecto.
- `MUNI_AI_SAFETY_HMAC_SECRET`: secreto independiente de al menos 32 bytes,
  obligatorio para toda llamada externa; deriva el identificador opaco por
  `tenantId + userId` y nunca se envía directamente;
- `MUNI_AI_RATE_LIMIT_PER_MINUTE`: llamadas por principal municipal; 6 por defecto,
  con techo técnico de 20;
- `MUNI_AI_DAILY_QUOTA_PER_PRINCIPAL`: intentos externos por principal en una
  ventana de 24 horas; 40 por defecto, con techo técnico de 200;
- `MUNI_AI_MAX_CONCURRENCY_PER_PRINCIPAL`: llamadas simultáneas por principal;
  1 por defecto y techo técnico de 2.

Los límites técnicos son: una llamada por consulta opt-in, entrada de evidencia de
hasta 12.000 caracteres, salida de hasta 480 tokens y respuesta HTTP del proveedor
de hasta 32 KB. El presupuesto aplica rate, cuota y concurrencia sobre una clave
opaca compuesta por municipio y usuario. Sigue el patrón in-memory acotado del
runtime existente: protege cada instancia activa, pero no es un contador global
durable entre instancias serverless. Por eso no equivale a un tope duro de
facturación; el límite de gasto debe configurarse y monitorearse además en OpenAI.

## Modos de degradación

`engine.mode` distingue `grounded-synthesis` de `deterministic-fallback`. Los
códigos de fallback cubren, entre otros: función deshabilitada, credencial o safety
secret ausente, rol/intent/PII no elegible, rate/cuota/concurrencia agotados,
timeout, proveedor no disponible y salida no fundada.
El cliente nunca pierde la evidencia, advertencias, fuente o acciones de la
respuesta determinista.

## Evaluación de proveedores externos

- **OpenAI:** se usa únicamente para redacción acotada, server-side y opt-in. No se
  habilitan tools, búsqueda web ni recuperación externa en este sprint.
- **Hugging Face:** evaluado y no integrado en este sprint. Un clasificador o
  embeddings remotos agregarían otra llamada, latencia y una nueva frontera de
  datos sin una mejora medida frente al clasificador determinista actual. Sólo
  debe reconsiderarse con un benchmark offline de intents que demuestre ganancia
  y conserve fallback local; no como segundo generador redundante.
- **public-apis/public-apis:** es un directorio comunitario, no una garantía de
  licencia, privacidad, SLA, estabilidad ni calidad. No se incorporó ninguna API
  aleatoria. Toda futura integración requiere owner municipal, contrato de datos,
  límites, licencia, observabilidad y degradación segura.

## Evidencia local y smoke remoto pendiente

La validación no usa una API real: el proveedor está mockeado. Los gates mínimos son:

```powershell
node --test tests/municipal-copilot-v2.test.mjs tests/ai-grh-assistant.test.mjs tests/legacy-ai-retirement.test.mjs
node --test tests/ia-assistant.e2e.mjs
```

Antes de habilitar Production falta un smoke remoto con cuenta autorizada que
confirme feature flag, respuesta asistida, timeout/fallback, ausencia de PII en
telemetría y consumo real dentro del presupuesto aprobado.
