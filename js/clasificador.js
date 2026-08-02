// ============================================================
// CLASIFICADOR.JS — Auto-classify reclamos with HuggingFace
// ============================================================
(function(global) {
  'use strict';

  let classifyTimeout = null;

  // Attach to a textarea/input with debounce
  function attachToInput(inputEl, resultEl) {
    if (!inputEl) return;
    inputEl.addEventListener('input', function() {
      clearTimeout(classifyTimeout);
      const text = this.value.trim();
      if (text.length < 20) {
        if (resultEl) resultEl.style.display = 'none';
        return;
      }
      classifyTimeout = setTimeout(async function() {
        if (!window.HFClient) return;
        const res = await HFClient.clasificarReclamo(text);
        if (res.error || !res.categoria) return;

        if (resultEl) {
          const sla = window.PERM?.getSLA(res.categoria) || { horas: 48, color: '#f59e0b' };
          resultEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:9px">
              <span style="font-size:18px">🤖</span>
              <div>
                <div style="font-size:12px;font-weight:700;color:var(--text-primary)">
                  Categoría detectada: <strong style="color:${sla.color}">${res.categoria}</strong>
                  <span style="font-size:10px;color:var(--text-muted);margin-left:8px">${res.confianza}% confianza</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">SLA: ${sla.horas}hs para resolución</div>
              </div>
            </div>
          `;
          resultEl.style.display = 'block';
        }
      }, 800);
    });
  }

  global.Clasificador = { attachToInput };
})(window);
