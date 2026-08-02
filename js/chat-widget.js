// ============================================================
// chat-widget.js — MuniBot Floating Chat Widget
// Appears on all pages, uses HF or demo responses
// ============================================================

(function() {
  const DEMO_RESPONSES = {
    'hola': 'Hola! Soy MuniBot, el asistente virtual de la Municipalidad de Junín. ¿En qué te puedo ayudar hoy?',
    'reclamo': 'Pods realizar un reclamo en la sección "Vecinos 311". Aceptá baches, luminarias, basura, ruidos molestos y más. \n\n➡️ <a href="vecinos.html" style="color:#60a5fa">Ir a Reclamos</a>',
    'tasa': 'Para consultar o pagar tasas municipales, podés acceder al Portal Ciudadano o comunicarte con Hacienda al (236) 2-480000.\n\n➡️ <a href="ciudadano.html" style="color:#60a5fa">Portal Ciudadano</a>',
    'obra': 'Tenemos 18 obras activas en Junín. Podés ver el estado y ubicación de todas en el mapa.\n\n➡️ <a href="obras.html" style="color:#60a5fa">Ver obras</a>',
    'horario': 'El municipio atiende de lunes a viernes de 7:30 a 13:30hs. Para trámites online, este portal funciona las 24hs.',
    'turno': 'Pods sacar turno online en el Portal Ciudadano para atención personalizada.\n\n➡️ <a href="ciudadano.html#servicios" style="color:#60a5fa">Sacar turno</a>',
    'presupuesto': 'El presupuesto municipal 2026 es de $4.200M. La ejecución actual es del 67.3%. Ver detalle:\n\n➡️ <a href="presupuesto.html" style="color:#60a5fa">Presupuesto municipal</a>',
    'default': 'Entendí tu consulta. Para una respuesta más precisa, podés:\n\n• Ir a <a href="vecinos.html" style="color:#60a5fa">Reclamos 311</a>\n• Consultar <a href="cuentas-claras.html" style="color:#60a5fa">Cuentas Claras</a>\n• Llamar al: (236) 2-480000'
  };

  function getResponse(msg) {
    const ml = msg.toLowerCase();
    for (const [key, resp] of Object.entries(DEMO_RESPONSES)) {
      if (key !== 'default' && ml.includes(key)) return resp;
    }
    return DEMO_RESPONSES.default;
  }

  function timeNow() {
    return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function init() {
    if (document.getElementById('munibot-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'munibot-widget';
    widget.innerHTML = `
      <style>
        #munibot-fab {
          position: fixed; bottom: 84px; right: 20px;
          width: 56px; height: 56px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border-radius: 50%; cursor: pointer;
          box-shadow: 0 4px 20px rgba(59,130,246,0.5);
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; z-index: 9990;
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
          border: none;
          animation: pulse-fab 2.5s ease-in-out infinite;
        }
        @keyframes pulse-fab {
          0%, 100% { box-shadow: 0 4px 20px rgba(59,130,246,0.5); }
          50% { box-shadow: 0 4px 32px rgba(59,130,246,0.8), 0 0 0 8px rgba(59,130,246,0.1); }
        }
        #munibot-fab:hover { transform: scale(1.1); animation: none; box-shadow: 0 8px 32px rgba(59,130,246,0.7); }
        #munibot-fab.open { transform: rotate(90deg) scale(1.05); animation: none; }
        #munibot-panel {
          position: fixed; bottom: 152px; right: 20px;
          width: 320px; max-height: 460px;
          background: #0d1526;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          display: none; flex-direction: column;
          z-index: 9989; overflow: hidden;
          transform-origin: bottom right;
          transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
          opacity: 0; transform: scale(0.8) translateY(20px);
        }
        #munibot-panel.open {
          display: flex; opacity: 1; transform: scale(1) translateY(0);
        }
        .munibot-header {
          padding: 14px 16px;
          background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1));
          border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; gap: 10px;
        }
        .munibot-avatar {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 18px; flex-shrink: 0;
        }
        .munibot-title { font-size: 13px; font-weight: 800; font-family: 'Outfit', sans-serif; }
        .munibot-status { font-size: 10px; color: #10b981; font-weight: 700; }
        #munibot-close {
          margin-left: auto; background: rgba(255,255,255,0.06);
          border: none; color: rgba(148,163,184,0.7);
          width: 28px; height: 28px; border-radius: 8px;
          cursor: pointer; font-size: 14px;
        }
        #munibot-messages {
          flex: 1; padding: 12px; overflow-y: auto;
          display: flex; flex-direction: column; gap: 10px;
          max-height: 300px;
        }
        .msg-bot, .msg-user {
          max-width: 85%; padding: 10px 14px;
          border-radius: 14px; font-size: 12px; line-height: 1.5;
          animation: msgIn 0.2s ease;
        }
        @keyframes msgIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .msg-bot { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.15); color: #f0f4ff; align-self: flex-start; }
        .msg-user { background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: white; align-self: flex-end; }
        .msg-time { font-size: 9px; opacity: 0.5; margin-top: 4px; display: block; }
        .munibot-typing {
          display: flex; gap: 4px; padding: 10px 14px;
          background: rgba(59,130,246,0.1); border-radius: 14px;
          align-self: flex-start; align-items: center;
        }
        .munibot-typing span {
          width: 6px; height: 6px; background: #60a5fa;
          border-radius: 50%; animation: typing 1.2s ease-in-out infinite;
        }
        .munibot-typing span:nth-child(2) { animation-delay: 0.2s; }
        .munibot-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
        .munibot-chips {
          display: flex; gap: 6px; padding: 8px 12px;
          overflow-x: auto; border-top: 1px solid rgba(255,255,255,0.05);
        }
        .munibot-chips::-webkit-scrollbar { display: none; }
        .chip {
          padding: 5px 12px; border-radius: 99px; font-size: 10px; font-weight: 700;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(148,163,184,0.9); cursor: pointer; white-space: nowrap;
          transition: all 0.15s;
        }
        .chip:hover { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); color: #60a5fa; }
        #munibot-input-row {
          display: flex; gap: 6px; padding: 10px 12px;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        #munibot-input {
          flex: 1; padding: 9px 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: #f0f4ff;
          font-size: 12px; font-family: 'Inter', sans-serif;
          outline: none;
        }
        #munibot-input:focus { border-color: rgba(59,130,246,0.4); background: rgba(59,130,246,0.05); }
        #munibot-send {
          padding: 9px 14px;
          background: linear-gradient(135deg,#3b82f6,#8b5cf6);
          border: none; border-radius: 10px; color: white;
          cursor: pointer; font-size: 15px;
          transition: opacity 0.2s;
        }
        #munibot-send:hover { opacity: 0.85; }
        @media (max-width: 480px) {
          #munibot-panel { width: calc(100vw - 24px); right: 12px; bottom: 140px; }
          #munibot-fab { bottom: 76px; right: 12px; }
        }
      </style>

      <button id="munibot-fab" onclick="MuniBot.toggle()" title="Asistente virtual">🤖</button>

      <div id="munibot-panel">
        <div class="munibot-header">
          <div class="munibot-avatar">🤖</div>
          <div>
            <div class="munibot-title">MuniBot</div>
            <div class="munibot-status">● En línea</div>
          </div>
          <button id="munibot-close" onclick="MuniBot.toggle()">×</button>
        </div>
        <div id="munibot-messages"></div>
        <div class="munibot-chips">
          <div class="chip" onclick="MuniBot.send('Hacer un reclamo')">📞 Reclamo</div>
          <div class="chip" onclick="MuniBot.send('Pagar tasas')">💳 Tasas</div>
          <div class="chip" onclick="MuniBot.send('Estado de una obra')">🏗️ Obras</div>
          <div class="chip" onclick="MuniBot.send('Horarios de atención')">🕒 Horarios</div>
          <div class="chip" onclick="MuniBot.send('Sacar turno')">🗓️ Turno</div>
        </div>
        <div id="munibot-input-row">
          <input id="munibot-input" placeholder="Escribi tu consulta..." />
          <button id="munibot-send" onclick="MuniBot.sendInput()">➤</button>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Initial bot message
    setTimeout(function() {
      MuniBot.addMessage('bot', '👋 ¡Hola! Soy MuniBot, el asistente de la Municipalidad de Junín. ¿En qué te puedo ayudar?');
    }, 600);

    // Enter key
    const input = document.getElementById('munibot-input');
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') MuniBot.sendInput();
      });
    }
  }

  window.MuniBot = {
    isOpen: false,

    toggle: function() {
      const panel = document.getElementById('munibot-panel');
      const fab = document.getElementById('munibot-fab');
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        panel.style.display = 'flex';
        requestAnimationFrame(function() { panel.classList.add('open'); });
        fab.classList.add('open');
        fab.textContent = '✕';
      } else {
        panel.classList.remove('open');
        fab.classList.remove('open');
        fab.textContent = '🤖';
        setTimeout(function() { panel.style.display = 'none'; }, 250);
      }
    },

    addMessage: function(role, text) {
      const messages = document.getElementById('munibot-messages');
      if (!messages) return;
      const div = document.createElement('div');
      div.className = role === 'bot' ? 'msg-bot' : 'msg-user';
      div.innerHTML = text.replace(/\n/g, '<br>') + \`<span class="msg-time">\${timeNow()}</span>\`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    },

    send: function(text) {
      if (!this.isOpen) this.toggle();
      this.addMessage('user', text);
      this.showTyping();
      const self = this;
      setTimeout(function() {
        self.hideTyping();
        const response = getResponse(text);
        self.addMessage('bot', response);
      }, 800 + Math.random() * 600);
    },

    sendInput: function() {
      const input = document.getElementById('munibot-input');
      if (!input || !input.value.trim()) return;
      const text = input.value.trim();
      input.value = '';
      this.send(text);
    },

    showTyping: function() {
      const messages = document.getElementById('munibot-messages');
      if (!messages) return;
      const div = document.createElement('div');
      div.id = 'munibot-typing';
      div.className = 'munibot-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    },

    hideTyping: function() {
      const t = document.getElementById('munibot-typing');
      if (t) t.remove();
    }
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();
