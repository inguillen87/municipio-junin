// ============================================================
// api.js — Cliente API Frontend — Municipalidad de Junín
// Detecta automáticamente si el backend está disponible.
// Si no: usa datos mock del sistema.
// ============================================================

const API = (function () {

  // ── CONFIG ──────────────────────────────────────────
  const BACKEND_URL = 'http://localhost:3001';
  const SESSION_KEY = 'mjunin_user';
  const TOKEN_KEY   = 'mjunin_token';

  let _backendAvailable = null; // null = no chequeado, true/false
  let _checkPromise     = null;

  // ── DETECCION DE BACKEND ─────────────────────────────
  async function checkBackend() {
    if (_backendAvailable !== null) return _backendAvailable;
    if (_checkPromise) return _checkPromise;
    _checkPromise = fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.json())
      .then(d => {
        _backendAvailable = d.ok === true;
        if (_backendAvailable) console.log(`✅ Backend conectado: ${BACKEND_URL} (DB: ${d.db})`);
        return _backendAvailable;
      })
      .catch(() => {
        _backendAvailable = false;
        console.log('⚠️  Backend no disponible — modo demo');
        return false;
      });
    return _checkPromise;
  }

  // Chequear backend al cargar la página
  checkBackend();

  // ── HTTP HELPERS ────────────────────────────────────
  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  async function http(method, path, body, isFormData = false) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(`${BACKEND_URL}${path}`, opts);
    if (res.status === 401) {
      // Token expirado — limpiar y redirigir al login
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  const GET    = (path)        => http('GET',    path);
  const POST   = (path, body)  => http('POST',   path, body);
  const PUT    = (path, body)  => http('PUT',    path, body);
  const PATCH  = (path, body)  => http('PATCH',  path, body);
  const DELETE = (path)        => http('DELETE', path);

  // ── AUTH ────────────────────────────────────────────
  async function login(email, password) {
    const backendUp = await checkBackend();
    if (backendUp) {
      // Login real con JWT
      const data = await POST('/api/auth/login', { email, password });
      if (data.token) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          name: data.user.nombre,
          email: data.user.email,
          rol: data.user.rol,
          loginAt: new Date().toISOString(),
          mode: 'jwt',
        }));
      }
      return data;
    } else {
      // Login demo (sin backend)
      const DEMO_USERS = [
        { email: 'demo@demo.com',            password: 'demo123',   name: 'Demo — Intendencia',    rol: 'admin',      redirect: 'index.html' },
        { email: 'intendente@junin.gob.ar',  password: 'junin2026', name: 'Mario Abed — Intendente', rol: 'intendente', redirect: 'control.html' },
        { email: 'tecnologia@junin.gob.ar',  password: 'tech2026',  name: 'Jefe de Tecnología',     rol: 'admin',      redirect: 'control.html' },
      ];
      const user = DEMO_USERS.find(u => u.email === email.toLowerCase() && u.password === password);
      if (!user) throw new Error('Credenciales incorrectas');
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        name: user.name, email: user.email, rol: user.rol,
        loginAt: new Date().toISOString(), mode: 'demo',
      }));
      return { ok: true, user, redirect: user.redirect };
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'login.html';
  }

  function currentUser() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch { return null; }
  }

  function isAuthenticated() {
    return !!currentUser();
  }

  // ── CONTRATOS ───────────────────────────────────────
  async function getContratos(params = {}) {
    const available = await checkBackend();
    if (available) {
      const qs = new URLSearchParams(params).toString();
      return GET(`/api/contratos${qs ? '?' + qs : ''}`);
    }
    // Fallback: datos del window.CONTRATOS_DATA (de control.js)
    return { ok: true, contratos: window.CONTRATOS_DATA || [], mock: true };
  }

  async function createContrato(data) {
    if (await checkBackend()) return POST('/api/contratos', data);
    return { ok: true, mock: true };
  }

  // ── EMPLEADOS ──────────────────────────────────────
  async function getEmpleados(params = {}) {
    const available = await checkBackend();
    if (available) {
      const qs = new URLSearchParams(params).toString();
      return GET(`/api/empleados${qs ? '?' + qs : ''}`);
    }
    return { ok: true, empleados: window.EMPLEADOS_DATA || [], mock: true };
  }

  async function createEmpleado(data) {
    if (await checkBackend()) return POST('/api/empleados', data);
    return { ok: true, mock: true };
  }

  // ── RECLAMOS ───────────────────────────────────────
  async function getReclamos(params = {}) {
    const available = await checkBackend();
    if (available) {
      const qs = new URLSearchParams(params).toString();
      return GET(`/api/reclamos${qs ? '?' + qs : ''}`);
    }
    return { ok: true, reclamos: window.RECLAMOS_DATA || [], mock: true };
  }

  async function createReclamo(data) {
    if (await checkBackend()) return POST('/api/reclamos', data);
    return { ok: true, mock: true };
  }

  async function updateReclamoEstado(id, estado) {
    if (await checkBackend()) return PATCH(`/api/reclamos/${id}/estado`, { estado });
    return { ok: true, mock: true };
  }

  // ── ARCHIVOS (UPLOAD) ──────────────────────────────
  async function uploadFiles(fileList) {
    const available = await checkBackend();
    if (available) {
      const formData = new FormData();
      Array.from(fileList).forEach(f => formData.append('files', f));
      return http('POST', '/api/archivos/upload', formData, true);
    }
    // Fallback: parseo local con SheetJS (ya implementado en upload.js)
    return { ok: false, error: 'Backend no disponible. Usar el módulo de carga local.', mock: true };
  }

  async function getFiles() {
    if (await checkBackend()) return GET('/api/archivos');
    return { ok: true, files: [], mock: true };
  }

  // ── HEALTH ──────────────────────────────────────────
  async function health() {
    try { return await GET('/api/health'); } catch { return { ok: false }; }
  }

  // ── STATUS UI ───────────────────────────────────────
  // Muestra un badge de estado del backend en la topbar
  function renderBackendStatus(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    checkBackend().then(ok => {
      el.innerHTML = ok
        ? `<div class="backend-badge online">
             <span class="bd-dot"></span>Backend Conectado
           </div>`
        : `<div class="backend-badge offline">
             <span class="bd-dot"></span>Modo Demo
           </div>`;
    });
  }

  // ── PUBLIC API ──────────────────────────────────────
  return {
    // Auth
    login,
    logout,
    currentUser,
    isAuthenticated,
    getToken,
    checkBackend,
    // Contratos
    getContratos,
    createContrato,
    // Empleados
    getEmpleados,
    createEmpleado,
    // Reclamos
    getReclamos,
    createReclamo,
    updateReclamoEstado,
    // Archivos
    uploadFiles,
    getFiles,
    // Misc
    health,
    renderBackendStatus,
  };
})();

// Hacer disponible globalmente
window.API = API;
