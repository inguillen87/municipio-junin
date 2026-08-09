// MuniControl legacy data retirement boundary.
//
// This file intentionally contains no municipal records, demo seeds or browser
// persistence. It keeps a small compatibility surface so stale pages fail
// closed while they are migrated to authenticated, tenant-bound APIs.
(function exposeRetiredDataBoundary(global) {
  'use strict';

  const EMPTY = Object.freeze([]);
  const EMPTY_GROUP = Object.freeze({});
  const STATUS = Object.freeze({
    code: 'SOURCE_NOT_CONNECTED',
    operational: false,
    source: null,
    message: 'Sin fuente gobernada conectada. Módulo no operativo.'
  });

  const MODULES = Object.freeze({
    analytics: Object.freeze({
      title: 'Analítica transversal',
      description: 'Los indicadores transversales requieren contratos semánticos autenticados por cada dominio.',
      expected: 'Contratos agregados y fechados de RRHH, Hacienda, Obras y Atención Vecinal.',
      destination: 'grh-ejecutivo.html',
      destinationLabel: 'Abrir analítica GRH validada'
    }),
    presupuesto: Object.freeze({
      title: 'Presupuesto y ejecución',
      description: 'No existe todavía una fuente contable gobernada para publicar partidas, crédito, devengado o pagado.',
      expected: 'Sistema de Hacienda con período, moneda, etapa contable y conciliación documentada.'
    }),
    obras: Object.freeze({
      title: 'Obras públicas',
      description: 'El seguimiento de obras permanece bloqueado hasta integrar expedientes y certificaciones verificables.',
      expected: 'Expedientes, contratos, certificados, hitos, ubicación y fecha de actualización.'
    }),
    proveedores: Object.freeze({
      title: 'Registro de proveedores',
      description: 'No se muestran CUIT, contactos, contratos ni calificaciones sin un padrón autenticado y trazable.',
      expected: 'Padrón de proveedores, estado fiscal, contratos y reglas de acceso por tenant.'
    }),
    licitaciones: Object.freeze({
      title: 'Compras y licitaciones',
      description: 'Crear, adjudicar o publicar procesos está deshabilitado hasta contar con expedientes y permisos auditables.',
      expected: 'Expediente de compras, etapas, oferentes, dictámenes y auditoría de cada decisión.'
    }),
    servicios: Object.freeze({
      title: 'Servicios públicos',
      description: 'No se publican niveles de servicio ni alertas sin telemetría o partes operativos gobernados.',
      expected: 'Órdenes de trabajo, cuadrillas, activos, SLA y georreferenciación con fecha de corte.'
    }),
    talleres: Object.freeze({
      title: 'Talleres municipales',
      description: 'La agenda, asistencia y capacidad permanecen no operativas sin un sistema fuente municipal.',
      expected: 'Catálogo, inscripciones, asistencia, responsables y reglas de privacidad.'
    }),
    whatsapp: Object.freeze({
      title: 'WhatsApp institucional',
      description: 'El simulador fue retirado. No se envían mensajes ni se exponen métricas municipales ficticias.',
      expected: 'Cuenta oficial, plantillas aprobadas, consentimiento, webhook verificado y trazabilidad de entrega.'
    }),
    upload: Object.freeze({
      title: 'Ingesta documental',
      description: 'La carga y el procesamiento local quedan bloqueados hasta existir una canalización privada y auditada.',
      expected: 'API autenticada, análisis antimalware, cuarentena, límites y registro de procedencia.'
    }),
    control: Object.freeze({
      title: 'Centro de control',
      description: 'El tablero multidépendencia no calcula estados sobre datos de demostración.',
      expected: 'Contratos semánticos gobernados por dominio, alertas fechadas y permisos institucionales.'
    }),
    forms: Object.freeze({
      title: 'Formularios internos',
      description: 'Diseñar, publicar y recibir formularios está deshabilitado sin almacenamiento institucional.',
      expected: 'Workflow versionado, API autenticada, retención, consentimiento y auditoría.'
    }),
    presentacion: Object.freeze({
      title: 'Presentación ejecutiva',
      description: 'La presentación de demostración fue retirada para evitar cifras sin fuente en ámbitos de decisión.',
      expected: 'Snapshot ejecutivo aprobado, fecha de corte, definiciones y evidencia de calidad.'
    }),
    mapa: Object.freeze({
      title: 'Mapa municipal y análisis territorial',
      description: 'Las capas de obras, reclamos y servicios de demostración fueron retiradas. No se publican ubicaciones ni mapas de calor sin una fuente geográfica gobernada.',
      expected: 'Expedientes o casos con geometría validada, fecha de corte, reglas de privacidad, catálogo territorial y contrato de teselas aprobado.',
      destination: 'grh-ejecutivo.html',
      destinationLabel: 'Abrir heatmap temporal GRH validado'
    }),
    vecinos: Object.freeze({
      title: 'Atención vecinal',
      description: 'No se muestran ni gestionan reclamos, identidades o contactos ficticios.',
      expected: 'Gestor de casos autenticado, consentimiento, SLA, georreferencia y minimización de PII.'
    })
  });

  function sourceError(operation) {
    const error = new Error(`${STATUS.message} Operación bloqueada: ${operation}.`);
    error.name = 'SourceNotConnectedError';
    error.code = STATUS.code;
    error.operation = operation;
    return error;
  }

  function block(operation) {
    throw sourceError(operation);
  }

  function appendText(parent, tagName, className, text) {
    const node = parent.ownerDocument.createElement(tagName);
    if (className) node.className = className;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function installStyles(documentRef) {
    if (documentRef.getElementById('retired-data-boundary-styles')) return;
    const style = documentRef.createElement('style');
    style.id = 'retired-data-boundary-styles';
    style.textContent = `
      .retired-module-shell{min-height:100vh;padding:32px clamp(18px,4vw,56px);margin-left:var(--sidebar-width,260px);background:radial-gradient(circle at 90% 0,rgba(14,165,233,.10),transparent 34%),var(--bg,#07111f);color:var(--text,#e6edf7);box-sizing:border-box}
      .retired-module-wrap{width:min(1040px,100%);margin:0 auto;padding-top:clamp(24px,7vh,84px)}
      .retired-module-kicker{display:inline-flex;align-items:center;gap:9px;padding:7px 11px;border:1px solid rgba(245,158,11,.32);border-radius:999px;background:rgba(245,158,11,.08);color:#fbbf24;font:700 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase}
      .retired-module-kicker::before{content:'';width:7px;height:7px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.12)}
      .retired-module-title{max-width:780px;margin:20px 0 12px;font:800 clamp(34px,5vw,62px)/1.02 Inter,system-ui,sans-serif;letter-spacing:-.045em;color:var(--text,#f8fafc)}
      .retired-module-lead{max-width:760px;margin:0;color:var(--muted,#94a3b8);font:500 clamp(16px,2vw,20px)/1.65 Inter,system-ui,sans-serif}
      .retired-module-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;margin-top:34px}
      .retired-module-card{border:1px solid var(--border,rgba(148,163,184,.18));border-radius:20px;background:linear-gradient(145deg,rgba(15,31,52,.96),rgba(9,20,36,.96));padding:clamp(20px,3vw,30px);box-shadow:0 24px 70px rgba(0,0,0,.22)}
      .retired-module-label{margin:0 0 9px;color:#7dd3fc;font:700 11px/1.3 Inter,system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase}
      .retired-module-card h2{margin:0 0 10px;font:750 20px/1.25 Inter,system-ui,sans-serif;color:var(--text,#f8fafc)}
      .retired-module-card p{margin:0;color:var(--muted,#94a3b8);font:500 14px/1.65 Inter,system-ui,sans-serif}
      .retired-module-list{display:grid;gap:13px;margin:4px 0 0;padding:0;list-style:none}
      .retired-module-list li{display:grid;grid-template-columns:24px 1fr;gap:10px;color:var(--muted,#a8b5c8);font:500 13px/1.55 Inter,system-ui,sans-serif}
      .retired-module-list li::before{content:'✓';display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(14,165,233,.12);color:#38bdf8;font-weight:800}
      .retired-module-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
      .retired-module-link,.retired-module-disabled{min-height:44px;padding:0 17px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;font:700 13px/1 Inter,system-ui,sans-serif;text-decoration:none;box-sizing:border-box}
      .retired-module-link{background:#0ea5e9;color:#031421;box-shadow:0 10px 28px rgba(14,165,233,.2)}
      .retired-module-link:hover{background:#38bdf8;transform:translateY(-1px)}
      .retired-module-disabled{border:1px solid var(--border,rgba(148,163,184,.22));background:rgba(148,163,184,.07);color:#64748b;cursor:not-allowed}
      .retired-module-foot{margin-top:20px;color:#64748b;font:500 12px/1.6 Inter,system-ui,sans-serif}
      @media(max-width:900px){.retired-module-shell{margin-left:0;padding:24px 16px 92px}.retired-module-wrap{padding-top:54px}.retired-module-grid{grid-template-columns:1fr}.retired-module-title{font-size:clamp(32px,11vw,48px)}}
      @media(prefers-reduced-motion:no-preference){.retired-module-card{animation:retired-in .48s ease both}.retired-module-card:nth-child(2){animation-delay:.07s}@keyframes retired-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}}
    `;
    documentRef.head.appendChild(style);
  }

  function mountRetiredModule(options) {
    if (!global.document) return STATUS;
    const documentRef = global.document;
    const requested = (options && options.module) || documentRef.body?.dataset.retiredModule || '';
    const moduleId = Object.prototype.hasOwnProperty.call(MODULES, requested) ? requested : 'control';
    const config = MODULES[moduleId];
    let root = documentRef.getElementById('retired-module-root');
    if (!root) {
      root = documentRef.createElement('main');
      root.id = 'retired-module-root';
      documentRef.body.appendChild(root);
    }

    installStyles(documentRef);
    root.className = 'retired-module-shell';
    root.setAttribute('data-source-status', STATUS.code);
    root.setAttribute('aria-labelledby', 'retired-module-title');
    root.replaceChildren();
    documentRef.body.dataset.sourceState = 'not-connected';

    const wrap = documentRef.createElement('div');
    wrap.className = 'retired-module-wrap';
    root.appendChild(wrap);
    appendText(wrap, 'div', 'retired-module-kicker', 'Sin fuente conectada · no operativo');
    const title = appendText(wrap, 'h1', 'retired-module-title', config.title);
    title.id = 'retired-module-title';
    appendText(wrap, 'p', 'retired-module-lead', config.description);

    const grid = documentRef.createElement('div');
    grid.className = 'retired-module-grid';
    wrap.appendChild(grid);

    const sourceCard = documentRef.createElement('section');
    sourceCard.className = 'retired-module-card';
    appendText(sourceCard, 'p', 'retired-module-label', 'Fuente requerida');
    appendText(sourceCard, 'h2', '', 'Contrato institucional pendiente');
    appendText(sourceCard, 'p', '', config.expected);
    const actions = documentRef.createElement('div');
    actions.className = 'retired-module-actions';
    const disabled = appendText(actions, 'button', 'retired-module-disabled', 'Operaciones bloqueadas');
    disabled.type = 'button';
    disabled.disabled = true;
    disabled.setAttribute('aria-disabled', 'true');
    const link = appendText(actions, 'a', 'retired-module-link', config.destinationLabel || 'Volver al tablero ejecutivo');
    link.href = config.destination || 'dashboard.html';
    sourceCard.appendChild(actions);
    grid.appendChild(sourceCard);

    const policyCard = documentRef.createElement('section');
    policyCard.className = 'retired-module-card';
    appendText(policyCard, 'p', 'retired-module-label', 'Condiciones de habilitación');
    appendText(policyCard, 'h2', '', 'Datos antes que interfaz');
    const list = documentRef.createElement('ul');
    list.className = 'retired-module-list';
    ['Fuente y fecha de corte visibles.', 'Acceso autenticado y aislado por tenant.', 'Calidad, conciliación y auditoría verificables.', 'Sin PII cruda en el navegador.'].forEach((item) => appendText(list, 'li', '', item));
    policyCard.appendChild(list);
    grid.appendChild(policyCard);

    appendText(wrap, 'p', 'retired-module-foot', 'No se muestran ceros, tendencias ni ejemplos como si fueran datos reales. Estado informado por el retiro de la base local de demostración.');
    return STATUS;
  }

  const MuniDB = Object.freeze({
    version: 'retired-3.0',
    operational: false,
    status: STATUS,
    init() { return this; },
    isConnected() { return false; },
    getAll() { return EMPTY; },
    getOne() { return null; },
    query() { return EMPTY; },
    sort() { return EMPTY; },
    paginate() { return Object.freeze({ data: EMPTY, total: null, page: null, perPage: null, pages: null, status: STATUS.code }); },
    sum() { return null; },
    avg() { return null; },
    count() { return null; },
    groupBy() { return EMPTY_GROUP; },
    stats() { return STATUS; },
    insert() { return block('insert'); },
    update() { return block('update'); },
    delete() { return block('delete'); },
    exportJSON() { return block('exportJSON'); },
    exportFull() { return block('exportFull'); },
    mountRetiredModule
  });

  global.MuniDB = MuniDB;
  global.DB = MuniDB;
})(window);
