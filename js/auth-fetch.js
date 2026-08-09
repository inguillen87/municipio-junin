(function (global) {
  'use strict';

  var TOKEN_KEY = 'mjunin_token';
  var USER_KEY = 'mjunin_user';
  var LOGIN_PATH = '/login.html';
  var CLOCK_SKEW_SECONDS = 30;

  function AuthError(message, code, status) {
    this.name = 'AuthError';
    this.message = message;
    this.code = code;
    this.status = status || 0;
    if (Error.captureStackTrace) Error.captureStackTrace(this, AuthError);
  }

  AuthError.prototype = Object.create(Error.prototype);
  AuthError.prototype.constructor = AuthError;

  function clearSession() {
    try {
      global.sessionStorage.removeItem(TOKEN_KEY);
      global.sessionStorage.removeItem(USER_KEY);
    } catch (_) {
      // Access to sessionStorage can be unavailable in privacy-restricted contexts.
    }
  }

  function decodePayload(token) {
    var segment = token.split('.')[1];
    var normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    normalized += '='.repeat((4 - (normalized.length % 4)) % 4);
    var binary = global.atob(normalized);
    var bytes = new Uint8Array(binary.length);

    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function getToken() {
    var token;

    try {
      token = global.sessionStorage.getItem(TOKEN_KEY);
    } catch (_) {
      return null;
    }

    if (typeof token !== 'string') return null;
    token = token.trim();

    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      clearSession();
      return null;
    }

    try {
      var payload = decodePayload(token);
      var now = Math.floor(Date.now() / 1000);

      if (!Number.isFinite(payload.exp) || payload.exp <= now + CLOCK_SKEW_SECONDS) {
        clearSession();
        return null;
      }

      if (Number.isFinite(payload.nbf) && payload.nbf > now + CLOCK_SKEW_SECONDS) {
        clearSession();
        return null;
      }
    } catch (_) {
      clearSession();
      return null;
    }

    return token;
  }

  function redirectToLogin() {
    var currentPath = global.location && global.location.pathname;
    if (currentPath === LOGIN_PATH || currentPath === '/login') return;
    global.location.replace(LOGIN_PATH);
  }

  function resolveSameOrigin(input) {
    var rawUrl = input instanceof Request ? input.url : input;
    var url = new URL(rawUrl, global.location.href);

    if (url.origin !== global.location.origin) {
      throw new AuthError('La solicitud autenticada debe usar el mismo origen.', 'UNSAFE_ORIGIN');
    }

    return url;
  }

  async function authenticatedFetch(input, init) {
    resolveSameOrigin(input);

    var token = getToken();
    if (!token) {
      clearSession();
      redirectToLogin();
      throw new AuthError('Se requiere una sesión válida.', 'AUTH_REQUIRED', 401);
    }

    var options = Object.assign({}, init || {});
    var headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', 'Bearer ' + token);

    options.headers = headers;
    options.credentials = 'same-origin';
    if (!options.cache) options.cache = 'no-store';

    var response = await global.fetch(input, options);
    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      throw new AuthError('La sesión venció o dejó de ser válida.', 'AUTH_EXPIRED', 401);
    }

    return response;
  }

  function sanitizeFilename(value) {
    return String(value || 'exportacion')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 140) || 'exportacion';
  }

  function responseFilename(response, fallback) {
    var disposition = response.headers.get('content-disposition') || '';
    var utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    var basicMatch = disposition.match(/filename="?([^";]+)"?/i);
    var candidate = fallback;

    if (utf8Match) {
      try {
        candidate = decodeURIComponent(utf8Match[1]);
      } catch (_) {
        candidate = utf8Match[1];
      }
    } else if (basicMatch) {
      candidate = basicMatch[1];
    }

    return sanitizeFilename(candidate);
  }

  async function download(url, filename) {
    var response = await authenticatedFetch(url, {
      headers: { Accept: 'text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream' }
    });

    if (!response.ok) {
      throw new AuthError('No se pudo generar la descarga.', 'DOWNLOAD_FAILED', response.status);
    }

    var blob = await response.blob();
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = responseFilename(response, filename);
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
  }

  function isAuthError(error) {
    return Boolean(error && (
      error.code === 'AUTH_REQUIRED' ||
      error.code === 'AUTH_EXPIRED'
    ));
  }

  global.MuniAuth = Object.freeze({
    getToken: getToken,
    fetch: authenticatedFetch,
    download: download,
    isAuthError: isAuthError
  });
})(window);
