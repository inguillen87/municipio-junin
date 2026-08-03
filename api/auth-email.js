// api/auth-email.js
// Magic Link authentication - allows email recipients to access the dashboard
// without manual login. Tokens expire after 72 hours for security.

import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token, redirect } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token requerido' });
  }

  try {
    const decoded = decodeToken(token);

    if (!decoded) {
      return res.redirect('/login?error=token_invalid');
    }

    if (decoded.exp < Date.now()) {
      return res.redirect('/login?error=token_expired');
    }

    const sessionData = {
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
      secretaria: decoded.secretaria || 'Sistema',
      tenant: 'municipio-junin',
      authMethod: 'email_magic_link',
      loginAt: new Date().toISOString()
    };

    let rawRedirect = redirect || 'index.html';
    if (rawRedirect.startsWith('/')) rawRedirect = rawRedirect.slice(1);

    const pageMap = {
      'dashboard': 'index.html',
      'index': 'index.html',
      'inicio': 'index.html',
      'hacienda': 'hacienda.html',
      'obras': 'obras.html',
      'rrhh': 'rrhh.html',
      'analytics': 'analytics.html',
      'cuentas-claras': 'cuentas-claras.html',
      'control': 'control.html',
      'licitaciones': 'licitaciones.html',
      'ia': 'ia.html',
      'mapa': 'mapa.html',
      'vecinos': 'vecinos.html',
      'presupuesto': 'presupuesto.html',
      'exportar': 'exportar.html',
      'ciudadano': 'ciudadano.html',
      'whatsapp': 'whatsapp.html',
      'auditoria': 'auditoria.html',
      'importar': 'importar.html',
      'admin': 'admin.html'
    };

    const cleanName = rawRedirect.replace(/\.html$/, '');
    const mappedPage = pageMap[cleanName] || (rawRedirect.endsWith('.html') ? rawRedirect : rawRedirect + '.html');
    const targetPage = mappedPage.startsWith('/') ? mappedPage : '/' + mappedPage;

    const sessionJson = JSON.stringify(sessionData).replace(/'/g, "\\'");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accediendo a MuniControl...</title>
  <style>
    body { margin:0;padding:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f8fafc; }
    .loader { text-align:center; }
    .spinner { width:48px;height:48px;border:4px solid rgba(59,130,246,0.2);border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 24px; }
    @keyframes spin { to { transform:rotate(360deg); } }
    h2 { font-size:20px;margin:0 0 8px; }
    p { color:#94a3b8;font-size:14px;margin:0; }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <h2>Accediendo a MuniControl</h2>
    <p>Verificando credenciales...</p>
  </div>
  <script>
    try {
      sessionStorage.setItem('mjunin_user', '${sessionJson}');
      setTimeout(function() { window.location.replace('${targetPage}'); }, 800);
    } catch(e) {
      document.querySelector('p').textContent = 'Error: ' + e.message;
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Auth email error:', error);
    return res.redirect('/login?error=auth_failed');
  }
}

function getSecret() {
  return process.env.CRON_SECRET || 'municontrol-default-secret-2026';
}

export function generateToken(userData, expiresInHours = 72) {
  const payload = {
    name: userData.name,
    email: userData.email,
    role: userData.role,
    secretaria: userData.secretaria || 'Sistema',
    exp: Date.now() + (expiresInHours * 60 * 60 * 1000),
    iat: Date.now()
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = getSecret();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');

  return payloadB64 + '.' + signature;
}

function decodeToken(token) {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const secret = getSecret();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadB64);
    const expectedSig = hmac.digest('base64url');

    if (signature !== expectedSig) return null;

    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch (e) {
    return null;
  }
}
