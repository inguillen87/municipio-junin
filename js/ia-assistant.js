(function bootstrapGrhAssistant(global) {
  'use strict';

  var EXECUTIVE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
  var ENDPOINT = '/api/ai-analyze';
  var MAX_LENGTH = 1200;
  var REQUEST_TIMEOUT_MS = 18000;
  var busy = false;
  var typingNode = null;

  function byId(id) { return document.getElementById(id); }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function currentUser() {
    try {
      return JSON.parse(global.sessionStorage.getItem('mjunin_user') || 'null');
    } catch (_) {
      return null;
    }
  }

  function canUseExecutiveAssistant() {
    var user = currentUser();
    return Boolean(user && EXECUTIVE_ROLES.indexOf(user.role) !== -1);
  }

  function appendUserMessage(text) {
    removeWelcome();
    var row = createElement('article', 'message-row user');
    row.setAttribute('aria-label', 'Tu consulta');
    row.appendChild(createElement('div', 'message-avatar', 'VOS'));
    row.appendChild(createElement('div', 'user-bubble', text));
    appendToLog(row);
  }

  function appendTyping() {
    removeTyping();
    var row = createElement('article', 'message-row assistant');
    row.setAttribute('aria-label', 'El asistente está consultando el contrato GRH');
    row.appendChild(createElement('div', 'message-avatar', 'GRH'));
    var indicator = createElement('div', 'typing-card');
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-label', 'Consultando contrato privado');
    indicator.appendChild(document.createElement('span'));
    indicator.appendChild(document.createElement('span'));
    indicator.appendChild(document.createElement('span'));
    row.appendChild(indicator);
    typingNode = row;
    appendToLog(row);
  }

  function removeTyping() {
    if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);
    typingNode = null;
  }

  function appendAnswer(payload) {
    removeTyping();
    removeWelcome();

    var answer = payload && payload.answer;
    if (!answer || typeof answer !== 'object') {
      appendUnavailable('Respuesta no verificable', 'El servidor no devolvió un contrato de respuesta válido.');
      return;
    }

    var row = createElement('article', 'message-row assistant');
    row.setAttribute('aria-label', 'Respuesta del asistente GRH');
    row.appendChild(createElement('div', 'message-avatar', 'GRH'));

    var card = createElement('div', 'answer-card');
    var header = createElement('header', 'answer-header');
    var headingLine = createElement('div', 'answer-heading-line');
    headingLine.appendChild(createElement('h3', '', answer.title || 'Respuesta GRH'));
    var state = createElement('span', 'answer-state ' + safeState(payload.status), stateLabel(payload.status));
    headingLine.appendChild(state);
    header.appendChild(headingLine);
    header.appendChild(createElement('p', 'answer-summary', answer.summary || 'Sin resumen verificable.'));
    card.appendChild(header);

    var body = createElement('div', 'answer-body');
    var findings = safeArray(answer.findings);
    if (findings.length) {
      var list = createElement('ul', 'finding-list');
      findings.forEach(function(finding) { list.appendChild(createElement('li', '', finding)); });
      body.appendChild(list);
    }

    var evidence = safeArray(answer.evidence);
    if (evidence.length) {
      var evidenceGrid = createElement('div', 'evidence-grid');
      evidence.slice(0, 8).forEach(function(item) {
        if (!item || typeof item !== 'object') return;
        var evidenceItem = createElement('div', 'evidence-item');
        evidenceItem.appendChild(createElement('span', 'evidence-label', item.label || 'Métrica'));
        evidenceItem.appendChild(createElement('strong', 'evidence-value', item.value || 'Sin dato'));
        if (item.detail) evidenceItem.appendChild(createElement('span', 'evidence-detail', item.detail));
        evidenceGrid.appendChild(evidenceItem);
      });
      body.appendChild(evidenceGrid);
    }

    var caveats = safeArray(answer.caveats);
    if (caveats.length) {
      var limits = createElement('section', 'answer-limits');
      limits.appendChild(createElement('strong', '', 'Límites de lectura'));
      caveats.forEach(function(caveat) { limits.appendChild(createElement('p', '', caveat)); });
      body.appendChild(limits);
    }

    if (answer.source) body.appendChild(createElement('p', 'answer-source', answer.source));
    card.appendChild(body);
    row.appendChild(card);
    appendToLog(row, 'start');
    updateProvenance(payload.provenance);
  }

  function appendUnavailable(title, detail) {
    removeTyping();
    removeWelcome();

    var row = createElement('article', 'message-row assistant');
    row.setAttribute('aria-label', 'Fuente GRH no disponible');
    row.appendChild(createElement('div', 'message-avatar', 'GRH'));

    var card = createElement('div', 'answer-card');
    var header = createElement('header', 'answer-header');
    var headingLine = createElement('div', 'answer-heading-line');
    headingLine.appendChild(createElement('h3', '', title));
    headingLine.appendChild(createElement('span', 'answer-state refused', 'Sin fuente'));
    header.appendChild(headingLine);
    header.appendChild(createElement('p', 'answer-summary', detail));
    card.appendChild(header);

    var body = createElement('div', 'answer-body');
    var limits = createElement('section', 'answer-limits');
    limits.appendChild(createElement('strong', '', 'Respuesta bloqueada'));
    limits.appendChild(createElement('p', '', 'No se usaron cifras demo, caché pública ni un proveedor externo como reemplazo.'));
    body.appendChild(limits);
    card.appendChild(body);
    row.appendChild(card);
    appendToLog(row, 'start');
  }

  function appendToLog(node, alignment) {
    var log = byId('conversationLog');
    if (!log) return;
    log.appendChild(node);
    global.requestAnimationFrame(function() {
      if (alignment === 'start') {
        log.scrollTop = Math.max(0, node.offsetTop - 10);
        global.scrollTo({ top: 0, left: global.scrollX, behavior: 'auto' });
      } else {
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  function removeWelcome() {
    var welcome = byId('welcomeCard');
    if (welcome && welcome.parentNode) welcome.parentNode.removeChild(welcome);
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value.filter(function(item) { return item !== null && item !== undefined; })
      : [];
  }

  function safeState(value) {
    return ['answered', 'limited', 'unsupported', 'refused'].indexOf(value) !== -1 ? value : 'answered';
  }

  function stateLabel(value) {
    var labels = {
      answered: 'Verificado',
      limited: 'Alcance limitado',
      unsupported: 'Fuera de contrato',
      refused: 'Consulta rechazada',
    };
    return labels[value] || labels.answered;
  }

  function updateProvenance(provenance) {
    if (!provenance || typeof provenance !== 'object') return;
    var snapshot = byId('snapshotStatus');
    var period = byId('periodStatus');
    if (snapshot && /^\d{4}-\d{2}-\d{2}$/.test(provenance.snapshotAsOf || '')) {
      snapshot.textContent = provenance.snapshotAsOf + ' · snapshot histórico';
      activateTrustDot('snapshotDot');
    }
    if (period && /^\d{4}-\d{2}$/.test(provenance.latestValidCalculationPeriod || '')) {
      period.textContent = provenance.latestValidCalculationPeriod + ' · último válido';
      activateTrustDot('periodDot');
    }
  }

  function activateTrustDot(id) {
    var dot = byId(id);
    if (dot) dot.classList.remove('pending');
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    var submit = byId('sendQuery');
    var input = byId('assistantInput');
    var suggestions = byId('querySuggestions');
    if (submit) submit.disabled = nextBusy;
    if (input) input.setAttribute('aria-busy', nextBusy ? 'true' : 'false');
    if (suggestions) {
      suggestions.setAttribute('aria-busy', nextBusy ? 'true' : 'false');
      suggestions.querySelectorAll('[data-question]').forEach(function(button) {
        button.disabled = nextBusy;
      });
    }
  }

  function redirectToSafeWorkspace() {
    try {
      if (!global.sessionStorage.getItem('mjunin_access_notice')) {
        global.sessionStorage.setItem('mjunin_access_notice', 'El perfil actual no tiene habilitada la superficie solicitada.');
      }
    } catch (_) {}
    var currentPage = global.location.pathname.split('/').pop() || '';
    if (currentPage !== 'inicio.html') global.location.replace('inicio.html');
  }

  async function requirePageCapability() {
    if (typeof global.requireCapability !== 'function') {
      redirectToSafeWorkspace();
      return false;
    }
    try {
      var allowed = await global.requireCapability('navigation.ai-assistant');
      if (allowed !== true) {
        if (allowed !== false) redirectToSafeWorkspace();
        return false;
      }
      return true;
    } catch (_) {
      redirectToSafeWorkspace();
      return false;
    }
  }

  async function ask(question) {
    if (busy) return;
    if (!await requirePageCapability()) return;
    var text = String(question || '').trim();
    if (!text) {
      var emptyInput = byId('assistantInput');
      if (emptyInput) emptyInput.focus();
      return;
    }
    if (text.length > MAX_LENGTH) {
      appendUnavailable('Consulta demasiado extensa', 'Reducí la consulta a 1200 caracteres o menos.');
      return;
    }
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      appendUnavailable('Sesión no verificable', 'No se pudo iniciar el canal autenticado del asistente.');
      return;
    }

    appendUserMessage(text);
    appendTyping();
    setBusy(true);

    var controller = new AbortController();
    var timeout = global.setTimeout(function() { controller.abort(); }, REQUEST_TIMEOUT_MS);

    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ message: text, mode: 'deterministic' }),
        signal: controller.signal,
      });

      var contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('INVALID_RESPONSE_TYPE');
      }
      var payload = await response.json();

      if (payload && payload.answer) {
        appendAnswer(payload);
      } else if (response.status === 503) {
        appendUnavailable('Contrato GRH no disponible', payload.error || 'No se pudo leer el artefacto privado para este municipio.');
      } else if (response.status === 403) {
        appendUnavailable('Acceso no habilitado', 'Tu perfil o municipio no está autorizado para consultar este contrato GRH.');
      } else {
        appendUnavailable('Consulta no procesada', payload.error || 'No existe una respuesta verificable para esta consulta.');
      }
    } catch (error) {
      if (global.MuniAuth && global.MuniAuth.isAuthError && global.MuniAuth.isAuthError(error)) return;
      var detail = error && error.name === 'AbortError'
        ? 'La validación del contrato excedió el tiempo disponible. Intentá nuevamente.'
        : 'No se pudo verificar el contrato GRH. La respuesta quedó bloqueada.';
      appendUnavailable('Fuente no verificada', detail);
    } finally {
      global.clearTimeout(timeout);
      setBusy(false);
      var input = byId('assistantInput');
      if (input) input.focus();
    }
  }

  function resizeInput(input) {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 116) + 'px';
    var counter = byId('characterCount');
    if (counter) counter.textContent = input.value.length + ' / ' + MAX_LENGTH;
  }

  function disableForRole() {
    var input = byId('assistantInput');
    var submit = byId('sendQuery');
    if (input) {
      input.disabled = true;
      input.placeholder = 'Tu perfil no está habilitado para consultas ejecutivas GRH.';
    }
    if (submit) submit.disabled = true;
    appendUnavailable('Perfil no habilitado', 'Esta vista requiere un rol ejecutivo autorizado. El servidor volverá a validar el rol y el tenant en cada solicitud.');
  }

  function bindInterface() {
    if (typeof global.buildSidebar === 'function') global.buildSidebar('ia');
    if (!canUseExecutiveAssistant()) {
      disableForRole();
      return;
    }

    var form = byId('assistantForm');
    var input = byId('assistantInput');
    var suggestions = byId('querySuggestions');

    if (form) {
      form.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (!input) return;
        var text = input.value;
        input.value = '';
        resizeInput(input);
        await ask(text);
      });
    }

    if (input) {
      input.addEventListener('input', function() { resizeInput(input); });
      input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (form) form.requestSubmit();
        }
      });
      resizeInput(input);
    }

    if (suggestions) {
      suggestions.addEventListener('click', async function(event) {
        var button = event.target.closest('[data-question]');
        if (!button || busy) return;
        await ask(button.getAttribute('data-question'));
      });
    }
  }

  async function start() {
    if (!await requirePageCapability()) return;
    Promise.resolve(global.MuniAuthReady)
      .then(function(valid) {
        if (valid === false) return;
        bindInterface();
      })
      .catch(function() {
        appendUnavailable('Sesión no verificable', 'No se pudo validar la sesión institucional.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(window);
