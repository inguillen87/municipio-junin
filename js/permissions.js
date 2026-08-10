// ============================================================
// PERMISSIONS.JS — RBAC granular para MuniControl
// Roles: SUPER_ADMIN > TENANT_ADMIN > INTENDENTE > 
//        HACIENDA > RRHH_ADMIN > TENANT_USER > DEMO
// ============================================================

(function(global) {
  'use strict';

  // Permission matrix: role -> module -> actions[]
  const PERMISSION_MATRIX = {
    SUPER_ADMIN: {
      '*': ['read','write','delete','export','admin']
    },
    TENANT_ADMIN: {
      'dashboard': ['read','export'],
      'presupuesto': ['read','write','export'],
      'rrhh': ['read','write','delete','export'],
      'licitaciones': ['read','write','export'],
      'vecinos': ['read','write','export'],
      'mapa': ['read','export'],
      'analytics': ['read','export'],
      'control': ['read','export'],
      'hacienda': ['read','write','export'],
      'exportar': ['read','write'],
      'ia': ['read','write'],
      'whatsapp': ['read','write'],
      'manuales': ['read'],
      'admin': ['read','write'],
      'obras': ['read','write','export'],
      'proveedores': ['read','write'],
      'pagos': ['read','write','export'],
    },
        INTENDENTE: {
      'dashboard': ['read','export'],
      'presupuesto': ['read','export'],
      'rrhh': ['read','export'],
      'licitaciones': ['read','export'],
      'vecinos': ['read','export'],
      'mapa': ['read','export'],
      'analytics': ['read','export'],
      'reportes': ['read','export'],
      'control': ['read','export'],
      'hacienda': ['read','export'],
      'exportar': ['read','export'],
      'ia': ['read','write'],
      'whatsapp': ['read'],
      'obras': ['read','export'],
      'proveedores': ['read'],
      'pagos': ['read','export'],
      'cuentas-claras': ['read','export'],
      'ciudadano': ['read'],
      'index': ['read']
    },

    HACIENDA: {
      'dashboard': ['read'],
      'presupuesto': ['read','write','export'],
      'hacienda': ['read','write','export'],
      'licitaciones': ['read','write','export'],
      'analytics': ['read','export'],
      'control': ['read'],
      'exportar': ['read','write'],
      'pagos': ['read','write','export'],
      'proveedores': ['read','write'],
    },
    RRHH_ADMIN: {
      'dashboard': ['read'],
      'rrhh': ['read','write','delete','export'],
      'analytics': ['read'],
      'exportar': ['read'],
    },
    TENANT_USER: {
      'dashboard': ['read'],
      'vecinos': ['read','write'],
      'mapa': ['read'],
      'manuales': ['read'],
      'ia': ['read'],
    },
    DEMO: {
      'dashboard': ['read'],
      'presupuesto': ['read'],
      'analytics': ['read'],
      'mapa': ['read'],
      'vecinos': ['read'],
    }
  };

  // SLA definitions for reclamos (NYC 311 inspired)
  const SLA_MATRIX = {
    'Bache':      { horas: 72,  color: '#ef4444', prioridad: 'alta' },
    'Luminaria':  { horas: 48,  color: '#f59e0b', prioridad: 'media' },
    'Residuos':   { horas: 24,  color: '#f59e0b', prioridad: 'alta' },
    'Arbolado':   { horas: 48,  color: '#10b981', prioridad: 'media' },
    'Agua':       { horas: 4,   color: '#ef4444', prioridad: 'critica' },
    'Cloacas':    { horas: 8,   color: '#ef4444', prioridad: 'critica' },
    'Ruidos':     { horas: 168, color: '#3b82f6', prioridad: 'baja' },
    'Tránsito':   { horas: 24,  color: '#f59e0b', prioridad: 'media' },
    'Animales':   { horas: 12,  color: '#f59e0b', prioridad: 'media' },
    'Otro':       { horas: 120, color: '#8b5cf6', prioridad: 'baja' },
  };

  const Permissions = {

    // Get current user from session
    currentUser() {
      try { return JSON.parse(sessionStorage.getItem('mjunin_user') || 'null'); } catch { return null; }
    },

    // Get current user role
    currentRole() {
      const u = this.currentUser();
      return u ? u.role : null;
    },

    // Check if user can perform action on module
    can(module, action) {
      const role = this.currentRole();
      if (!role) return false;

      const matrix = PERMISSION_MATRIX[role];
      if (!matrix) return false;

      // Wildcard (SUPER_ADMIN)
      if (matrix['*'] && matrix['*'].includes(action)) return true;

      // Check specific module
      const allowed = matrix[module];
      if (!allowed) return false;
      return allowed.includes(action);
    },

    // Check read permission
    canRead(module) { return this.can(module, 'read'); },
    canWrite(module) { return this.can(module, 'write'); },
    canDelete(module) { return this.can(module, 'delete'); },
    canExport(module) { return this.can(module, 'export'); },
    isAdmin() { const r = this.currentRole(); return r === 'SUPER_ADMIN' || r === 'TENANT_ADMIN'; },

    // Apply permissions to DOM — hide/disable elements
    applyToDOM() {
      // Hide elements that require specific permissions
      document.querySelectorAll('[datírequire-role]').forEach(el => {
        const required = el.dataset.requireRole.split(',').map(s => s.trim());
        const role = this.currentRole();
        if (!required.includes(role) && !required.includes('*')) {
          el.style.display = 'none';
        }
      });

      // Disable write actions for read-only users
      document.querySelectorAll('[datírequire-action]').forEach(el => {
        const parts = (el.dataset.requireAction || '').split(':');
        const module = parts[0];
        const action = parts[1] || 'write';
        if (!this.can(module, action)) {
          el.disabled = true;
          el.style.opacity = '0.4';
          el.style.cursor = 'not-allowed';
          el.title = 'Sin permiso para esta acción';
        }
      });
    },

    // Get SLA for reclamo type
    getSLA(tipo) {
      return SLA_MATRIX[tipo] || { horas: 120, color: '#8b5cf6', prioridad: 'baja' };
    },

    // Calculate SLA status
    slaStatus(fechaIngreso, tipo) {
      const sla = this.getSLA(tipo);
      const ingreso = new Date(fechaIngreso);
      const limite = new Date(ingreso.getTime() + sla.horas * 3600000);
      const ahora = new Date();
      const remaining = limite - ahora;
      const totalMs = sla.horas * 3600000;
      const pct = Math.max(0, Math.min(100, ((totalMs - (ahora - ingreso)) / totalMs) * 100));

      if (remaining < 0) return { estado: 'vencido', color: '#ef4444', pct: 0, label: 'VENCIDO' };
      if (pct < 25) return { estado: 'critico', color: '#ef4444', pct, label: 'CRÍTICO' };
      if (pct < 50) return { estado: 'advertencia', color: '#f59e0b', pct, label: 'URGENTE' };
      return { estado: 'normal', color: '#10b981', pct, label: 'EN PLAZO' };
    }
  };

  // Auto-apply on DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    Permissions.applyToDOM();
  });

  global.Permissions = Permissions;
  global.PERM = Permissions; // shorthand

  console.log('[Permissions] Ready. Role:', Permissions.currentRole());

})(window);


