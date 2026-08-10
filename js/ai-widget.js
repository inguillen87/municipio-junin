/**
 * ai-widget.js — Widget IA flotante para GovTech Platform
 * Soporta texto + voz. Se inyecta en TODAS las páginas via <script src="js/ai-widget.js">
 */
(function() {
  'use strict';

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── KNOWLEDGE BASE ────────────────────────────────────────
  const KB = [
    // Dashboard / General
    { patterns: ['hola','buenos','buenas','como estas','que tal'], response: '¡Hola! 👋 Soy el Asistente IA de GovTech. Podés preguntarme sobre presupuesto, contratos, empleados, reclamos o cualquier aspecto del municipio. ¿En qué te ayudo?' },
    { patterns: ['ayuda','que podes','que sabes','opciones','funciones'], response: '🤖 Puedo ayudarte con:\n\n💰 **Presupuesto y gastos**\n📄 **Contratos y proveedores**\n👤 **Empleados y RRHH**\n🏘️ **Reclamos vecinales**\n🗺️ **Mapa financiero**\n📊 **Reportes y exportaciones**\n🏛️ **Navegación del sistema**\n\n¡Preguntame lo que necesites!' },

    // Presupuesto
    { patterns: ['presupuesto','cuanto hay','dinero','fondos','plata'], response: '💰 El presupuesto total 2026 es **$372 millones**. Hasta julio se ejecutaron **$193M (52%)**. Quedan **$179M disponibles** para el segundo semestre.\n\nLa IA proyecta un **ahorro de $31M** al cierre de año. ¿Querés ver el detalle por partida?' },
    { patterns: ['partida','partidas','area','areas','rubro'], response: '📋 Hay **14 partidas presupuestarias**:\n\n🔴 **En riesgo:** Personal (103%), Cargas Sociales (104%)\n🟡 **En seguimiento:** Asistencia Social (84%)\n🟢 **En marcha:** Obras, Servicios, IT, Salud, Educación\n\nIr a 💰 [Presupuesto](presupuesto.html) para ver el detalle completo.' },
    { patterns: ['gasto','gastamos','gasto mensual','cuanto gasto'], response: '📊 Gasto promedio mensual: **$27.5M**. El mes de mayor gasto histórico fue diciembre ($48M proyectado). Julio cerró con $17M.\n\nEl 39% del gasto total corresponde a **Personal y Cargas Sociales**.' },

    // Contratos
    { patterns: ['contrato','contratos','proveedor','proveedores'], response: '📄 Hay **47 contratos activos** con un valor total de **$28.3M mensuales**. \n\n⚠️ **3 contratos vencen en menos de 30 días** — revisalos en el módulo de Contratos urgente!\n\n🔎 El auditor IA detectó posibles ahorros en 6 contratos.' },
    { patterns: ['vence','vencimiento','vencen','renovar'], response: '⚠️ **Contratos próximos a vencer:**\n\n🔴 Limpieza Zona Norte → vence en 12 días\n🟡 Mantenimiento Flota → vence en 18 días\n🟡 Seguridad Edificios → vence en 25 días\n\nEl sistema envía alertas automáticas por WhatsApp 30, 15 y 7 días antes.' },
    { patterns: ['licitacion','licitaciones','pliego','pliegos'], response: '⚖️ El módulo de **Licitaciones** tiene:\n\n🤖 **AI Pliego Generator** → genera pliegos legales automáticamente\n🔎 **AI Auditor** → analiza contratos buscando irregularidades\n📋 **Historial** → todas las licitaciones pasadas y en curso\n\n👉 Ir a [Licitaciones](licitaciones.html)' },

    // Empleados
    { patterns: ['empleado','empleados','personal','staff','trabajador','nomina','nómina'], response: '👥 La nómina actual tiene **1.247 empleados municipales** activos.\n\n📊 Distribución por área:\n• Obras y Servicios: 380\n• Salud: 210\n• Educación: 185\n• Administración: 290\n• Seguridad: 182\n\n💰 Costo mensual total de personal: **$152M** (103% del presupuesto asignado — en alerta)' },
    { patterns: ['sueldo','sueldos','salario','salarios','liquidacion','liquidación'], response: '💰 El costo mensual de sueldos es **$152M** incluyendo cargas sociales. Representa el **41% del presupuesto total**.\n\n⚠️ Esta partida está al **103% del presupuesto asignado** — hay que revisar con Hacienda.\n\nIr a 👤 [RRHH](rrhh.html) para el detalle de liquidaciones.' },
    { patterns: ['falt','ausente','ausentismo','licencia'], response: '📋 Esta semana registramos **3 ausencias sin aviso** y **12 licencias médicas** activas.\n\nEl presentismo promedio del mes es del **94.2%**. Podés ver el detalle en [RRHH](rrhh.html) → Presentismo.' },

    // Reclamos
    { patterns: ['reclamo','reclamos','vecino','vecinos','queja','quejas'], response: '🏘️ Estado actual de reclamos:\n\n🔴 **Urgentes:** 12\n🟡 **Pendientes:** 47\n🟢 **Resueltos esta semana:** 23\n\n📍 **Zona con más reclamos:** Centro (28%) y Norte (22%)\n🔥 **Tipo más frecuente:** Baches y pavimento (34%)\n\nIr a [Atención Vecinal](vecinos.html)' },
    { patterns: ['bache','pavimento','calle','asfalto'], response: '🛣️ Los reclamos de **baches y pavimento** son los más frecuentes: **34% del total**.\n\n🏗️ Obra en curso: Pavimentación Calle San Martín (65% avanzada, entrega dic 2026).\n\nPodés ver en el [Mapa Financiero](mapa.html) todas las obras activas.' },

    // Mapa
    { patterns: ['mapa','zona','barrio','geograf','calor','heatmap'], response: '🗺️ El **Mapa Financiero** muestra el gasto del municipio por zona geográfica con 3 capas:\n\n💰 **Costos por zona** → 12 zonas con presupuesto y ejecución\n🏗️ **Obras públicas** → 8 obras activas con progreso en tiempo real\n🔥 **Heatmap de gasto** → densidad de inversión por área\n\n👉 Ver [Mapa Financiero](mapa.html)' },
    { patterns: ['obra','obras','infraestructura','construc'], response: '🏗️ Hay **8 obras municipales** en ejecución:\n\n✅ Iluminación LED Centro → 100% (finalizada)\n🟢 Parque Recreativo Norte → 80%\n🟡 Pavimentación San Martín → 65%\n🟡 Red Cloacal Sur → 45%\n🔴 Hospital Municipal → 30%\n🔴 CIC Medrano → 20%\n\nPresupuesto total obras: $53.8M' },

    // Sistema / Navegación
    { patterns: ['login','acceso','ingresar','usuario','usuario'],  response: '🔐 El sistema tiene **4 niveles de acceso**:\n\n⚡ **superadmin@govtech.ar** → Panel plataforma completo\n🏛️ **intendente@junin.gob.ar** → Control ejecutivo\n💰 **hacienda@junin.gob.ar** → Finanzas\n🌐 **demo@demo.com / demo123** → Solo lectura\n\n👉 Ir a [Login](login.html)' },
    { patterns: ['exportar','export','pdf','excel','informe','reporte'], response: '📤 Podés exportar datos desde cualquier módulo:\n\n📄 **PDF ejecutivo** → listo para el concejo deliberante\n📊 **Excel detallado** → datos crudos para análisis\n📝 **Word** → plantillas narrativas con tablas\n🖨️ **Imprimir** → cada módulo tiene vista de impresión optimizada\n\n👉 Centro de exportación: [Exportar](exportar.html)' },
    { patterns: ['whatsapp','notificacion','alerta','alertas'], response: '📱 El sistema envía alertas automáticas por **WhatsApp** para:\n\n⚠️ Contratos que vencen en 30/15/7 días\n💸 Partidas que superan el 80% del presupuesto\n🏘️ Reclamos vecinales urgentes\n📊 Informe semanal de KPIs al intendente\n\nConfigurar en: Ajustes → WhatsApp Bot' },
    { patterns: ['manual','ayuda','guia','cómo','como usar'], response: '📖 El **Manual Completo** de GovTech Platform incluye:\n\n👤 Guía de usuario por módulo\n💻 Documentación técnica para ingenieros\n🗄️ Schema de base de datos\n🚀 Guía de deploy\n🌍 Customización multi-tenant\n\n👉 Ver [Manual Completo](manuales.html) (también imprimible como PDF)' },
    { patterns: ['super admin','superadmin','admin panel','admin.html'], response: '⚡ El **Panel Super Admin** permite:\n\n🏛️ Ver y gestionar TODOS los municipios\n👥 Crear/suspender usuarios y tenants\n💰 Ver MRR/ARR y proyección de ingresos\n📋 Auditoría global de acciones\n\n👉 Ir a [Super Admin](admin.html) (requiere rol SUPER_ADMIN)' },
    { patterns: ['landing','vender','saas','precio','plan'], response: '🌍 GovTech Platform es vendible a cualquier gobierno del mundo:\n\n💼 **Starter** → hasta 500 empleados → $299/mes USD\n🚀 **Professional** → hasta 2.000 empleados → $799/mes USD\n🏢 **Enterprise** → sin límite → $1.999/mes USD\n\n👉 Ver [Landing comercial](landing.html)' },

    // Default
    { patterns: ['*'], response: '🤔 No encontré información específica sobre eso. Podés preguntarme sobre:\n\n💰 Presupuesto y gastos\n📄 Contratos y proveedores\n👤 Empleados y RRHH\n🏘️ Reclamos vecinales\n🗺️ Mapa financiero\n🚀 Navegación del sistema\n\nO escribí /ayuda para ver todas las opciones.' }
  ];

  // ── QUICK ACTIONS ──────────────────────────────────────────
  const QUICK = [
    { label: '💰 Presupuesto', q: 'presupuesto' },
    { label: '📄 Contratos', q: 'contratos' },
    { label: '👤 Empleados', q: 'empleados' },
    { label: '🏘️ Reclamos', q: 'reclamos' },
    { label: '🏗️ Obras', q: 'obras' },
    { label: '📤 Exportar', q: 'exportar' },
  ];

  // ── FIND RESPONSE ─────────────────────────────────────────
  function findResponse(text) {
    const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const entry of KB) {
      if (entry.patterns[0] === '*') continue;
      if (entry.patterns.some(p => t.includes(p.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
        return entry.response;
      }
    }
    return null;
  }

  // ── FORMAT MARKDOWN ───────────────────────────────────────
  function fmt(text) {
    let out = String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#60a5fa">$1</a>');

    // Renderear listas "-" y "•" como <ul><li>
    const lines = out.split('\n');
    out = '';
    let inList = false;
    lines.forEach(function(line) {
      const m = line.match(/^\s*(?:-|•)\s+(.*)$/);
      if (m) {
        if (!inList) { out += '<ul style="margin:6px 0 2px;padding-left:16px">'; inList = true; }
        out += '<li style="margin:3px 0;line-height:1.5">' + m[1] + '</li>';
      } else {
        if (inList) { out += '</ul>'; inList = false; }
        out += line + '\n';
      }
    });
    if (inList) out += '</ul>';
    return out.replace(/\n/g, '<br>');
  }

  // ── INJECT CSS ────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* AI WIDGET */
    #ai-widget-toggle {
      position: fixed; bottom: 80px; right: 20px; z-index: 9998;
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border: none; cursor: pointer; font-size: 22px;
      box-shadow: 0 4px 20px rgba(59,130,246,0.45);
      transition: all 0.2s; display: flex; align-items: center; justify-content: center;
      animation: widgetPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
    }
    #ai-widget-toggle:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(59,130,246,0.6); }
    #ai-widget-toggle.open { background: linear-gradient(135deg, #ef4444, #f97316); }
    @keyframes widgetPop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .ai-widget-badge {
      position: absolute; top: -4px; right: -4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #ef4444; color: white;
      font-size: 10px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #060b18;
    }

    #ai-widget-panel {
      position: fixed; bottom: 144px; right: 20px; z-index: 9999;
      width: 360px; max-height: 520px;
      background: rgba(9,15,30,0.97);
      border: 1px solid rgba(59,130,246,0.2);
      border-radius: 20px; overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05);
      display: none; flex-direction: column;
      backdrop-filter: blur(20px);
      animation: panelSlide 0.25s ease;
      font-family: Inter, sans-serif;
    }
    #ai-widget-panel.show { display: flex; }
    @keyframes panelSlide { from { opacity: 0; transform: translateY(12px) scale(0.96); } to { opacity: 1; transform: none; } }

    .aw-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1));
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .aw-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
    }
    .aw-title { font-size: 14px; font-weight: 700; color: #f0f4ff; }
    .aw-sub { font-size: 11px; color: rgba(148,163,184,0.7); margin-top: 1px; }
    .aw-online { display: flex; align-items: center; gap: 4px; }
    .aw-dot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .aw-close { margin-left: auto; background: none; border: none; color: rgba(148,163,184,0.5); font-size: 18px; cursor: pointer; padding: 2px; transition: color 0.15s; }
    .aw-close:hover { color: #f0f4ff; }

    .aw-messages {
      flex: 1; overflow-y: auto; padding: 12px 14px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    .aw-messages::-webkit-scrollbar { width: 3px; }
    .aw-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }

    .aw-msg { display: flex; gap: 8px; animation: msgIn 0.2s ease; }
    @keyframes msgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .aw-msg.user { flex-direction: row-reverse; }

    .aw-bubble {
      max-width: 78%; padding: 10px 13px; border-radius: 14px;
      font-size: 12.5px; line-height: 1.5; word-break: break-word;
    }
    .aw-msg.bot .aw-bubble {
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
      color: #e2e8f0; border-top-left-radius: 4px;
    }
    .aw-msg.user .aw-bubble {
      background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2));
      border: 1px solid rgba(59,130,246,0.25);
      color: #f0f4ff; border-top-right-radius: 4px;
    }
    .aw-msg-icon {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 14px;
      margin-top: 2px;
    }
    .aw-msg.bot .aw-msg-icon { background: linear-gradient(135deg,#3b82f6,#8b5cf6); }
    .aw-msg.user .aw-msg-icon { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); }

    .aw-typing {
      display: flex; align-items: center; gap: 4px; padding: 10px 13px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px; border-top-left-radius: 4px; width: fit-content;
    }
    .aw-dot-typing {
      width: 6px; height: 6px; border-radius: 50%; background: rgba(148,163,184,0.5);
      animation: dotBounce 1.4s infinite;
    }
    .aw-dot-typing:nth-child(2) { animation-delay: 0.2s; }
    .aw-dot-typing:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

    .aw-quick {
      display: flex; flex-wrap: wrap; gap: 5px;
      padding: 8px 14px; border-top: 1px solid rgba(255,255,255,0.06);
    }
    .aw-quick-btn {
      font-size: 10.5px; font-weight: 600; padding: 4px 10px; border-radius: 99px;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      color: rgba(148,163,184,0.8); cursor: pointer; transition: all 0.15s;
    }
    .aw-quick-btn:hover { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.25); color: #93c5fd; }

    .aw-feedback {
      display: flex; gap: 4px; margin: -2px 0 4px;
      padding-left: 36px; opacity: 0; transition: opacity 0.2s;
    }
    .aw-msg.bot:hover .aw-feedback, .aw-feedback.show { opacity: 1; }
    .aw-fb-btn {
      background: none; border: 1px solid transparent; color: rgba(148,163,184,0.5);
      font-size: 12px; padding: 2px 6px; border-radius: 6px; cursor: pointer; transition: all 0.15s;
    }
    .aw-fb-btn:hover { color: #f0f4ff; border-color: rgba(255,255,255,0.12); }
    .aw-fb-btn.sel { color: #60a5fa; border-color: rgba(59,130,246,0.35); background: rgba(59,130,246,0.1); }
    .aw-clear {
      background: none; border: none; color: rgba(148,163,184,0.5);
      font-size: 15px; cursor: pointer; padding: 3px; transition: color 0.15s; margin-left: auto;
    }
    .aw-clear:hover { color: #fbbf24; }
    .aw-close { margin-left: 0; }

    .aw-input-row {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.07);
    }
    .aw-input {
      flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; padding: 9px 12px; color: #f0f4ff; font-size: 12.5px;
      outline: none; transition: border-color 0.15s; resize: none;
      font-family: Inter, sans-serif; height: 38px; line-height: 20px;
    }
    .aw-input:focus { border-color: rgba(59,130,246,0.4); }
    .aw-input::placeholder { color: rgba(148,163,184,0.4); }
    .aw-mic-btn, .aw-send-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 15px;
      transition: all 0.15s; flex-shrink: 0;
    }
    .aw-mic-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(148,163,184,0.7); }
    .aw-mic-btn:hover { background: rgba(255,255,255,0.1); color: #f0f4ff; }
    .aw-mic-btn.listening { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); color: #ef4444; animation: micPulse 1s infinite; }
    @keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.3)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
    .aw-send-btn { background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: white; box-shadow: 0 2px 10px rgba(59,130,246,0.3); }
    .aw-send-btn:hover { transform: scale(1.05); box-shadow: 0 4px 16px rgba(59,130,246,0.4); }

    @media (max-width: 480px) {
      #ai-widget-panel { width: calc(100vw - 24px); right: 12px; bottom: 130px; }
    }
  `;
  document.head.appendChild(style);

  // ── BUILD HTML ────────────────────────────────────────────
  const toggle = document.createElement('button');
  toggle.id = 'ai-widget-toggle';
  toggle.innerHTML = `<span id="ai-widget-icon">🤖</span><div class="ai-widget-badge" id="ai-badge">1</div>`;
  toggle.title = 'Asistente IA Municipal';

  const panel = document.createElement('div');
  panel.id = 'ai-widget-panel';
  panel.innerHTML = `
    <div class="aw-header">
      <div class="aw-avatar">🤖</div>
      <div>
        <div class="aw-title">Asistente IA Municipal</div>
        <div class="aw-sub aw-online"><span class="aw-dot"></span> GovTech Platform · En línea</div>
      </div>
      <button class="aw-clear" id="aw-clear-btn" title="Limpiar conversación">🗑️</button>
      <button class="aw-close" id="aw-close-btn">✕</button>
    </div>
    <div class="aw-messages" id="aw-messages"></div>
    <div class="aw-quick" id="aw-quick"></div>
    <div class="aw-input-row">
      <input class="aw-input" id="aw-input" placeholder="Escribí o usá el micrófono..." autocomplete="off" />
      <button class="aw-mic-btn" id="aw-mic" title="Hablar">🎙️</button>
      <button class="aw-send-btn" id="aw-send" title="Enviar">➤</button>
    </div>
  `;

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  // ── QUICK ACTIONS ─────────────────────────────────────────
  const quickEl = panel.querySelector('#aw-quick');
  QUICK.forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'aw-quick-btn';
    btn.textContent = q.label;
    btn.onclick = () => sendMessage(q.q);
    quickEl.appendChild(btn);
  });

  // ── MESSAGES ──────────────────────────────────────────────
  const messagesEl = panel.querySelector('#aw-messages');

  // Persistencia de conversación
  const STORE_KEY = 'mjunin_ai_chat_v1';
  let store = [];
  function loadStore() { try { const d = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); store = Array.isArray(d) ? d : []; } catch (e) { store = []; } }
  function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store.slice(-40))); } catch (e) {} }

  function escapeHtml(t) {
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function addMessage(text, isUser, opts) {
    opts = opts || {};
    const msg = document.createElement('div');
    msg.className = 'aw-msg ' + (isUser ? 'user' : 'bot');
    msg.innerHTML =
      '<div class="aw-msg-icon">' + (isUser ? '👤' : '🤖') + '</div>' +
      '<div class="aw-bubble">' + (isUser ? escapeHtml(text) : (opts.typing && !reducedMotion ? '' : fmt(text))) + '</div>';
    if (!isUser) {
      const fb = document.createElement('div');
      fb.className = 'aw-feedback';
      fb.innerHTML = '<button class="aw-fb-btn" data-v="up" title="Útil">👍</button><button class="aw-fb-btn" data-v="down" title="No útil">👎</button>';
      fb.addEventListener('click', (e) => {
        const b = e.target.closest('.aw-fb-btn');
        if (!b) return;
        fb.querySelectorAll('.aw-fb-btn').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        try { localStorage.setItem('mjunin_ai_feedback', String(Date.now()).slice(0,10)); } catch (err) {}
      });
      msg.appendChild(fb);
    }
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (opts.typing && !reducedMotion) {
      typewriter(msg.querySelector('.aw-bubble'), text);
    }
    store.push({ role: isUser ? 'user' : 'bot', text: String(text) });
    saveStore();
    return msg;
  }

  // Efecto máquina de escribir (typewriter)
  function typewriter(el, raw) {
    const full = fmt(raw);
    if (!el || !full) return;
    let i = 0, opening = false, openedAt = 0;
    el.textContent = '';
    function tick() {
      i += 1 + Math.floor(Math.random() * 2);
      if (i > full.length) { el.innerHTML = full; messagesEl.scrollTop = messagesEl.scrollHeight; return; }
      const chunk = full.slice(0, i);
      const left = chunk.match(/<[^>]*$/g);
      if (left && !/<[^>]*>/.test(left[0])) {
        const close = full.indexOf('>', i);
        if (close !== -1) i = close + 1;
      }
      el.innerHTML = full.slice(0, i);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function showTyping() {
    const msg = document.createElement('div');
    msg.className = 'aw-msg bot';
    msg.id = 'aw-typing';
    msg.innerHTML = `
      <div class="aw-msg-icon">🤖</div>
      <div class="aw-typing">
        <div class="aw-dot-typing"></div>
        <div class="aw-dot-typing"></div>
        <div class="aw-dot-typing"></div>
      </div>
    `;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  // Sugerencias contextuales según la consulta
  const SUGGEST = [
    { match: ['presupuesto','partida','ejecutado'], chips: ['Riesgo de partidas','Ejecutado por secretaría','Disponible restante'] },
    { match: ['empleado','personal','rrhh','sueldo','nomina'], chips: ['Costo total de personal','Presentismo del mes','Licencias activas'] },
    { match: ['reclamo','vecino','queja','311'], chips: ['Zona con más reclamos','Tipo más frecuente','SLA promedio'] },
    { match: ['obra','infraestructura','paviment'], chips: ['Presupuesto total obras','Avance promedio','Obra más atrasada'] },
    { match: ['contrato','proveedor','licitacion'], chips: ['Próximos vencimientos','Posibles ahorros','Total de contratos'] },
    { match: ['hacienda','gasto','ingreso','financiero'], chips: ['Balance del mes','Gasto por secretaría','Deuda flotante'] },
  ];
  function renderSuggestions(text) {
    const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let chips = QUICK.map(q => q.label);
    for (const s of SUGGEST) {
      if (s.match.some(m => t.includes(m))) { chips = s.chips; break; }
    }
    quickEl.innerHTML = '';
    chips.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'aw-quick-btn';
      btn.textContent = label;
      btn.onclick = () => sendMessage(label);
      quickEl.appendChild(btn);
    });
  }

  async function sendMessage(text) {
    const input = panel.querySelector('#aw-input');
    const userText = text || input.value.trim();
    if (!userText) return;

    input.value = '';
    addMessage(userText, true);

    // Hide badge
    const badge = document.getElementById('ai-badge');
    if (badge) badge.style.display = 'none';

    const typing = showTyping();
    const delay = 600 + Math.random() * 800;

    const kbResponse = findResponse(userText);
    
    if (kbResponse) {
      setTimeout(() => {
        typing.remove();
        addMessage(kbResponse, false, { typing: true });
        renderSuggestions(userText);
      }, delay);
      return;
    }

    try {
      const history = store.slice(-5).map(m => ({ 
        role: m.role === 'bot' ? 'assistant' : 'user', 
        content: m.text 
      }));
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userText,
          history: history
        })
      });
      const data = await res.json();
      const aiResponse = data.response || data.reply || 'Estoy procesando tu consulta...';
      typing.remove();
      addMessage(aiResponse, false, { typing: true });
      renderSuggestions(userText);
    } catch (err) {
      typing.remove();
      addMessage('🤖 No pude conectarme al servidor de IA. Intenta de nuevo en unos segundos.', false, { typing: true });
    }
  }

  // ── TOGGLE PANEL ──────────────────────────────────────────
  let isOpen = false;

  function openWidget() {
    isOpen = true;
    panel.classList.add('show');
    toggle.classList.add('open');
    panel.querySelector('#ai-widget-icon') && (document.getElementById('ai-widget-icon').textContent = '✕');
    // Restaurar conversación previa o saludar
    if (messagesEl.children.length === 0) {
      const prev = loadStore();
      if (prev.length) {
        prev.forEach(m => {
          const msg = document.createElement('div');
          msg.className = 'aw-msg ' + (m.role === 'user' ? 'user' : 'bot');
          msg.innerHTML =
            '<div class="aw-msg-icon">' + (m.role === 'user' ? '👤' : '🤖') + '</div>' +
            '<div class="aw-bubble">' + (m.role === 'user' ? escapeHtml(m.text) : fmt(m.text)) + '</div>';
          messagesEl.appendChild(msg);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else {
        const page = document.title.split('—')[0].trim() || 'el sistema';
        setTimeout(() => addMessage(`¡Hola! 👋 Estás en **${page}**. Soy tu Asistente IA Municipal.\n\nPodés preguntarme sobre presupuesto, contratos, empleados, reclamos o cualquier módulo. También podés hablar usando el 🎙️ micrófono. ¿En qué te ayudo?`), 300);
      }
    }
  }

  function closeWidget() {
    isOpen = false;
    panel.classList.remove('show');
    toggle.classList.remove('open');
    document.getElementById('ai-widget-icon').textContent = '🤖';
  }

  toggle.addEventListener('click', () => isOpen ? closeWidget() : openWidget());
  panel.querySelector('#aw-close-btn').addEventListener('click', closeWidget);
  panel.querySelector('#aw-clear-btn').addEventListener('click', () => {
    messagesEl.innerHTML = '';
    store = [];
    saveStore();
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    if (typeof showToast !== 'undefined') showToast('🧹 Conversación limpiada', 'info');
  });

  // ── SEND ──────────────────────────────────────────────────
  panel.querySelector('#aw-send').addEventListener('click', () => sendMessage());
  panel.querySelector('#aw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // ── VOICE (Web Speech API) ────────────────────────────────
  const micBtn = panel.querySelector('#aw-mic');
  let recognition = null;
  let isListening = false;

  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'es-AR';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      panel.querySelector('#aw-input').value = transcript;
      sendMessage(transcript);
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎙️';
    };

    recognition.onerror = () => {
      isListening = false;
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎙️';
    };

    micBtn.addEventListener('click', () => {
      if (isListening) {
        recognition.stop();
      } else {
        isListening = true;
        micBtn.classList.add('listening');
        micBtn.textContent = '🔴';
        recognition.start();
        if (!isOpen) openWidget();
      }
    });
  } else {
    micBtn.style.opacity = '0.3';
    micBtn.title = 'Voz no disponible en este navegador';
  }

  // ── KEYBOARD SHORTCUT (Ctrl+Space) ───────────────────────
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      isOpen ? closeWidget() : openWidget();
    }
  });

})();
