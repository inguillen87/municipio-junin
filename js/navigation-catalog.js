(function installMuniNavigationDefinition(global) {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  var definition = {
    version: '2026-08-13.3',
    groups: [
      { id: 'executive', label: 'Gestión ejecutiva', shortLabel: 'Gestión', icon: 'chart' },
      { id: 'people', label: 'Personas y nómina', shortLabel: 'Personas', icon: 'people' },
      { id: 'territory', label: 'Territorio y comunidad', shortLabel: 'Territorio', icon: 'map' },
      { id: 'data', label: 'Datos y control', shortLabel: 'Datos', icon: 'database' }
    ],
    items: [
      { id: 'workspace', href: 'inicio.html', label: 'Inicio', shortLabel: 'Inicio', icon: 'home', groupId: null, placement: 'top', capability: 'navigation.workspace', primary: true },
      { id: 'dashboard', href: 'dashboard.html', label: 'Panorama de personal', shortLabel: 'Panorama', icon: 'chart', groupId: 'executive', placement: 'group', capability: 'navigation.dashboard', primary: true },
      { id: 'grh-ejecutivo', href: '/ejecutivo', label: 'Resumen ejecutivo GRH', shortLabel: 'Resumen GRH', icon: 'people', groupId: 'executive', placement: 'group', capability: 'navigation.grh-executive', primary: true },
      { id: 'decisiones-grh', href: 'decisiones-grh.html', label: 'Decisiones GRH', shortLabel: 'Decisiones', icon: 'check', groupId: 'executive', placement: 'group', capability: 'navigation.grh-decisions', primary: true },
      { id: 'ia', href: 'ia.html', label: 'BOT IA para GRH', shortLabel: 'BOT IA', icon: 'ai', groupId: 'executive', placement: 'group', capability: 'navigation.ai-assistant', primary: true },
      { id: 'reportes', href: 'reportes.html', label: 'Reportes', shortLabel: 'Reportes', icon: 'doc', groupId: 'executive', placement: 'group', capability: 'navigation.reports', primary: true },
      { id: 'hacienda', href: 'hacienda.html', label: 'Hacienda y nómina', shortLabel: 'Hacienda', icon: 'bank', groupId: 'people', placement: 'group', capability: 'navigation.hacienda', primary: true },
      { id: 'corridas-grh', href: '/corridas-grh', label: 'Corridas y marcas de cierre', shortLabel: 'Corridas', icon: 'check', groupId: 'people', placement: 'group', capability: 'navigation.hacienda', primary: false },
      { id: 'estructura', href: '/estructura', label: 'Estructura y áreas de costo', shortLabel: 'Estructura', icon: 'organization', groupId: 'people', placement: 'group', capability: 'navigation.organization-analytics', primary: true },
      { id: 'trayectoria', href: '/trayectoria', label: 'Trayectoria laboral', shortLabel: 'Trayectoria', icon: 'movement', groupId: 'people', placement: 'group', capability: 'navigation.employment-actions', primary: true },
      { id: 'movimientos-grh', href: 'movimientos-grh.html', label: 'Movimientos de legajo', shortLabel: 'Movimientos', icon: 'movement', groupId: 'people', placement: 'group', capability: 'navigation.organization-analytics', primary: false },
      { id: 'rrhh', href: 'rrhh.html', label: 'Directorio y fichas', shortLabel: 'Directorio', icon: 'people', groupId: 'people', placement: 'group', capability: 'navigation.rrhh', primary: true },
      { id: 'areas-grh', href: 'areas-grh.html', label: 'Mapa de datos GRH', shortLabel: 'Mapa GRH', icon: 'database', groupId: 'people', placement: 'group', capability: 'navigation.rrhh', primary: false },
      { id: 'territorio', href: '/territorio', label: 'Centro territorial', shortLabel: 'Territorio', icon: 'map', groupId: 'territory', placement: 'group', capability: 'navigation.territory', primary: true },
      { id: 'cuentas', href: 'cuentas-claras.html', label: 'Cuentas Claras', shortLabel: 'Cuentas', icon: 'eye', groupId: 'territory', placement: 'group', public: true, primary: false },
      { id: 'ciudadano', href: 'ciudadano.html', label: 'Portal Ciudadano', shortLabel: 'Ciudadanía', icon: 'home', groupId: 'territory', placement: 'group', public: true, primary: false },
      { id: 'importar', href: 'importar.html', label: 'Importar datos', shortLabel: 'Importar', icon: 'upload', groupId: 'data', placement: 'group', capability: 'navigation.import', primary: true },
      { id: 'auditoria', href: 'auditoria.html', label: 'Fuentes de datos', shortLabel: 'Fuentes', icon: 'shield', groupId: 'data', placement: 'group', capability: 'navigation.audit', primary: true },
      { id: 'control', href: '/calidad', label: 'Calidad de datos', shortLabel: 'Calidad', icon: 'gauge', groupId: 'data', placement: 'group', capability: 'navigation.data-quality', primary: true },
      { id: 'exportar', href: 'exportar.html', label: 'Publicaciones', shortLabel: 'Publicar', icon: 'export', groupId: 'data', placement: 'group', capability: 'navigation.export', primary: true },
      { id: 'manuales', href: 'manuales.html', label: 'Manual y ayuda', shortLabel: 'Ayuda', icon: 'help', groupId: null, placement: 'footer', capability: 'navigation.help', primary: true }
    ]
  };

  deepFreeze(definition);
  global.MuniNavigationDefinition = definition;

  var catalog = definition.items.reduce(function(result, item) {
    if (item.capability && item.primary === true && !Object.prototype.hasOwnProperty.call(result, item.capability)) {
      result[item.capability] = deepFreeze({
        id: item.id,
        href: item.href,
        icon: item.icon,
        label: item.label,
        shortLabel: item.shortLabel,
        groupId: item.groupId
      });
    }
    return result;
  }, Object.create(null));

  global.MuniNavigationCatalog = Object.freeze(catalog);
}(window));
