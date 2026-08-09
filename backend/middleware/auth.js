// ============================================================
// middleware/auth.js — Verificación JWT
// ============================================================
const { authenticate, requireCapability } = require('./authMiddleware');
const { hasAnyRole } = require('../../shared/access-policy.cjs');

// Compatibilidad con las rutas legacy: comparte la misma identidad DB-autoritativa.
const requireAuth = authenticate;

function requireRole(...roles) {
  return (req, res, next) => {
    if (!hasAnyRole(req.user?.role || req.user?.rol, roles)) {
      return res.status(403).json({ error: 'Sin permisos suficientes' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireCapability };
