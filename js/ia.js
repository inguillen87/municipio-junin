// ============================================================
// IA.JS — Asistente IA Municipal (simulado para demo)
// En producción: conectar a http://localhost:11434 (Ollama)
// ============================================================

const IA_RESPONSES = {
  'gasto': `📊 **Informe de Gastos — Agosto 2026**

El gasto total del municipio en agosto 2026 es de **$284.5 millones**, distribuido así:

| Secretaría | Ejecutado | vs Presupuesto |
|-----------|-----------|----------------|
| Obras Públicas | $44.8M | ⚠️ +18% (ALERTA) |
| Educación | $54.9M | ✅ -10% |
| Salud | $46.8M | ✅ -10% |
| Seguridad | $41.8M | ✅ -5% |
| Intendencia | $28.5M | ✅ -43% |

📌 **Atención**: Obras Públicas y Talleres superaron su presupuesto mensual. Se recomienda revisión urgente.`,

  'presupuesto': `⚠️ **Alertas Presupuestarias — Agosto 2026**

Se detectaron **3 secretarías** con desvíos positivos:

1. 🔴 **Obras Públicas**: +18% sobre presupuesto ($44.8M vs $38M asignado)
   → Causa probable: obras de emergencia + horas extra
   
2. 🟡 **Talleres Municipales**: +12% ($13.4M vs $12M)
   → Repuestos de emergencia para flota

3. 🟡 **Estación de Servicios**: +14% ($9.1M vs $8M)
   → Aumento del precio del combustible

📋 Recomendación: Solicitar informe detallado a los responsables de área antes del 5 de septiembre.`,

  'empleados': `👥 **Resumen de Recursos Humanos — Agosto 2026**

**Total plantel**: 1.247 empleados activos
**Masa salarial mensual**: $186.000.000

Distribución por área:
- 📚 Educación: 302 empleados (más numerosa)
- 🔧 Obras Públicas: 214 empleados
- 🏥 Salud: 187 empleados
- 🔒 Seguridad: 178 empleados
- ♻️ Medio Ambiente: 96 empleados

**Horas extra agosto**: 4.312 horas → costo $18.4M
**Ausentismo**: 3% (dentro del parámetro normal)
**Licencias activas**: 47 empleados`,

  'reclamos': `🏘️ **Análisis de Reclamos Vecinales — 2026**

**Total registrado**: 318 reclamos
**Resueltos**: 229 (72% de tasa de resolución)
**Pendientes**: 89

Ranking por tipo:
1. 🛣️ **Baches y Pavimento**: 34% de los reclamos
2. 💡 **Alumbrado Público**: 22%
3. 🗑️ **Recolección de Basura**: 18%
4. 🌳 **Poda de Árboles**: 12%
5. 💧 **Agua y Cloacas**: 8%
6. 🔊 Otros: 6%

📍 Zonas más afectadas: Centro, Barrio Norte y Av. Rivadavia
⏱ Tiempo promedio de resolución: 3.2 días`,

  'informe': `📋 **INFORME EJECUTIVO — MUNICIPIO DE JUNÍN**
*Agosto 2026 — Para Intendente Mario Abed*

---

**RESUMEN OPERATIVO**

El municipio opera con **1.247 empleados** y un gasto mensual de **$284.5M** sobre un presupuesto de $310M (92% ejecutado). El año va en un 72% de ejecución presupuestaria.

**ALERTAS CRÍTICAS:**
- ⚠️ Obras Públicas: 18% sobre presupuesto → requiere acción
- ⚠️ Stock de combustible al 48% → solicitar reposición

**LOGROS DEL SISTEMA:**
- ✅ Ahorro estimado anual por migración IT: **$42M**
- ✅ 1.247 legajos digitalizados
- ✅ Sistema de reclamos vecinales operativo: 72% resolución
- ✅ Control de flota: 43 vehículos monitoreados
- ✅ Dashboard ejecutivo en tiempo real

**PRÓXIMOS PASOS:**
1. Conectar base de datos PostgreSQL real
2. Implementar lector RFID para fichero de empleados
3. Portal del vecino público (web)
4. Módulo jardines de infantes`,

  'ahorro': `💡 **Análisis de Ahorro IT — 2026**

**Ahorro anual estimado por migración a sistema propio: $42.000.000**

Desglose:
| Concepto | Costo anterior | Costo actual |
|---------|----------------|--------------|
| Sistema de RRHH (tercero) | $18M/año | $0 (propio) |
| CRM de atención vecinal | $8M/año | $0 (propio) |
| Dashboard de gestión | $12M/año | $0 (propio) |
| Licencias de software | $4M/año | $0 (open source) |

📈 **ROI del proyecto**: La inversión se recupera en el primer año.
🔒 **Beneficio extra**: El municipio es ahora dueño de sus propios datos.
🚀 **Potencial**: El sistema puede venderse/licenciarse a otros municipios.`,
};

function getIAResponse(query) {
  const q = query.toLowerCase();
  if (q.includes('gasto') || q.includes('agosto') || q.includes('total')) return IA_RESPONSES['gasto'];
  if (q.includes('presupuesto') || q.includes('supera') || q.includes('alerta')) return IA_RESPONSES['presupuesto'];
  if (q.includes('empleado') || q.includes('rrhh') || q.includes('salarial') || q.includes('masa')) return IA_RESPONSES['empleados'];
  if (q.includes('reclamo') || q.includes('vecino') || q.includes('frecuente')) return IA_RESPONSES['reclamos'];
  if (q.includes('informe') || q.includes('ejecutivo') || q.includes('intendente')) return IA_RESPONSES['informe'];
  if (q.includes('ahorro') || q.includes('migra') || q.includes('it')) return IA_RESPONSES['ahorro'];
  return `🤖 Procesé tu consulta: *"${query}"*\n\nBasado en los datos del sistema municipal, puedo ayudarte con:\n- 📊 Gastos y presupuesto\n- 👥 Recursos Humanos\n- 🏘️ Reclamos de vecinos\n- 📋 Informes ejecutivos\n- 💡 Análisis de ahorro IT\n\n¿Podés ser más específico o usar una de las **consultas rápidas** del panel izquierdo?`;
}

function addMessage(text, isUser = false) {
  const container = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  const div = document.createElement('div');
  div.className = `msg-row ${isUser ? 'user' : 'ai'}`;

  const textFormatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^(#{1,3})\s(.+)$/gm, (_, h, t) => `<strong style="font-size:${h.length===1?'16px':h.length===2?'14px':'13px'}">${t}</strong>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/\|(.+)\|/g, (match) => {
      if (!match.includes('---')) {
        const cells = match.split('|').filter(c => c.trim());
        return '<tr>' + cells.map(c => `<td style="padding:4px 10px;border:1px solid rgba(255,255,255,0.08)">${c.trim()}</td>`).join('') + '</tr>';
      }
      return '';
    });

  div.innerHTML = `
    <div class="msg-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}">${isUser ? '👤' : '🤖'}</div>
    <div class="msg-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}">
      <div class="msg-header">
        <span class="msg-sender">${isUser ? 'Vos' : 'Asistente Municipal IA'}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="msg-text"><p>${textFormatted}</p></div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'msg-row ai'; div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="msg-avatar ai-avatar">🤖</div>
    <div class="msg-bubble ai-bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() { document.getElementById('typingIndicator')?.remove(); }

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, true);
  input.value = '';
  input.style.height = 'auto';
  showTyping();

  // Simulate AI thinking delay (0.8-2s)
  const delay = 800 + Math.random() * 1200;

  setTimeout(() => {
    removeTyping();
    const response = getIAResponse(text);
    addMessage(response, false);
  }, delay);
}

// SEND BUTTON
document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// AUTO RESIZE TEXTAREA
document.getElementById('chatInput')?.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// QUICK QUERIES
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('chatInput').value = btn.dataset.query;
    sendMessage();
  });
});

// CLEAR CHAT
document.getElementById('btnClearChat')?.addEventListener('click', () => {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  addMessage('Chat limpiado. ¿En qué te puedo ayudar?', false);
});

document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('ia');
});
