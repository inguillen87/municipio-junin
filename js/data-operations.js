(function dataOperationsBootstrap(windowRef, documentRef) {
  'use strict';

  var CONTRACT = 'grh-domain-catalog-v1';
  var ENDPOINT = '/api/grh-domain-catalog';
  var NUMBER_FORMAT = new Intl.NumberFormat('es-AR');
  var STATUS_LABELS = Object.freeze({
    operational: 'Disponible para consultar',
    partial: 'Disponible con límites',
    catalogued: 'Identificado para desarrollar'
  });
  var STATUS_CLASSES = Object.freeze({
    operational: 'data-pill-ready',
    partial: 'data-pill-partial',
    catalogued: 'data-pill-catalogued'
  });

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validPeriod(period) {
    if (!isPlainObject(period) || !['certified', 'historical', 'not_available'].includes(period.status)) return false;
    if (period.status === 'not_available') return period.first === null && period.last === null;
    return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(period.first) &&
      /^\d{4}-(?:0[1-9]|1[0-2])$/.test(period.last) && period.first <= period.last;
  }

  function validCatalog(payload) {
    if (!isPlainObject(payload) || payload.schemaVersion !== CONTRACT) return false;
    var source = payload.source;
    var privacy = payload.privacy;
    var counts = payload.counts;
    if (!isPlainObject(source) || typeof source.canonicalSystem !== 'string' || !source.canonicalSystem.trim() ||
        typeof source.sourceFile !== 'string' || !source.sourceFile.trim() ||
        !/^[0-9a-f]{64}$/.test(source.sourceSha256) || !/^\d{4}-\d{2}-\d{2}$/.test(source.snapshotAsOf) ||
        source.realtime !== false) return false;
    if (!isPlainObject(privacy) || privacy.aggregateMetadataOnly !== true ||
        privacy.containsPersonRecords !== false || privacy.containsFinancialAmounts !== false) return false;
    if (!isPlainObject(counts) || !isCount(counts.totalTables) || !isCount(counts.nonEmptyTables) ||
        !isCount(counts.emptyTables) || !isCount(counts.totalRows) || !isCount(counts.domainCount) ||
        counts.nonEmptyTables + counts.emptyTables !== counts.totalTables) return false;
    if (!Array.isArray(payload.domains) || payload.domains.length !== counts.domainCount) return false;

    var ids = new Set();
    return payload.domains.every(function validDomain(domain) {
      if (!isPlainObject(domain) || typeof domain.id !== 'string' || !/^[a-z][a-z0-9_]{2,48}$/.test(domain.id) ||
          ids.has(domain.id) || typeof domain.title !== 'string' || !domain.title.trim() ||
          !Object.hasOwn(STATUS_LABELS, domain.status) || !isPlainObject(domain.counts) ||
          !isCount(domain.counts.tables) || !isCount(domain.counts.nonEmptyTables) || !isCount(domain.counts.rows) ||
          domain.counts.nonEmptyTables > domain.counts.tables || !validPeriod(domain.periods) ||
          !Array.isArray(domain.tables) || domain.tables.length !== domain.counts.tables) return false;
      ids.add(domain.id);
      var nonEmpty = 0;
      var rows = 0;
      var tablesValid = domain.tables.every(function validTable(table) {
        if (!isPlainObject(table) || typeof table.name !== 'string' || !isCount(table.rows) || !isCount(table.columns) ||
            !['available', 'empty'].includes(table.status)) return false;
        if ((table.rows > 0) !== (table.status === 'available')) return false;
        rows += table.rows;
        if (table.rows > 0) nonEmpty += 1;
        return true;
      });
      return tablesValid && rows === domain.counts.rows && nonEmpty === domain.counts.nonEmptyTables;
    });
  }

  function element(tag, className, text) {
    var node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setText(id, value) {
    var node = documentRef.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function humanDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'No informado';
    var parts = value.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
  }

  function humanPeriod(period) {
    if (!validPeriod(period) || period.status === 'not_available') return 'Sin período certificado';
    if (period.first === period.last) return period.first;
    return period.first + ' a ' + period.last;
  }

  function shortHash(value) {
    return value.slice(0, 12) + '…' + value.slice(-8);
  }

  function setStatus(id, state, text) {
    var node = documentRef.getElementById(id);
    if (!node) return;
    node.dataset.state = state;
    var label = node.querySelector('span:last-child');
    if (label) label.textContent = text;
  }

  function statusPill(status) {
    return element('span', 'data-pill ' + STATUS_CLASSES[status], STATUS_LABELS[status]);
  }

  function renderDomainCards(catalog) {
    var container = documentRef.getElementById('domainCards');
    var cards = catalog.domains.map(function buildCard(domain) {
      var card = element('article', 'data-domain-card');
      var copy = element('div');
      copy.appendChild(statusPill(domain.status));
      copy.appendChild(element('h3', '', domain.title));
      var description = domain.status === 'operational'
        ? 'La plataforma ya ofrece consultas y tableros gobernados para esta área.'
        : domain.status === 'partial'
          ? 'Hay evidencia útil, con límites visibles de período, cobertura o interpretación.'
          : 'La base contiene estas tablas, pero todavía no existe un producto validado para operarlas.';
      copy.appendChild(element('p', '', description));
      var stats = element('div', 'data-domain-stats');
      var tableStat = element('span');
      tableStat.append(element('strong', '', NUMBER_FORMAT.format(domain.counts.nonEmptyTables)),
        documentRef.createTextNode(' de ' + NUMBER_FORMAT.format(domain.counts.tables) + ' tablas con datos'));
      var rowStat = element('span');
      rowStat.append(element('strong', '', NUMBER_FORMAT.format(domain.counts.rows)), documentRef.createTextNode(' filas'));
      stats.append(tableStat, rowStat, element('span', '', humanPeriod(domain.periods)));
      copy.appendChild(stats);
      var link = element('a', 'data-button data-button-secondary', 'Ver área');
      link.href = 'areas-grh.html?domain=' + encodeURIComponent(domain.id);
      link.setAttribute('aria-label', 'Ver área ' + domain.title);
      card.append(copy, link);
      return card;
    });
    container.replaceChildren.apply(container, cards);
  }

  function renderDomainTable(catalog) {
    var body = documentRef.querySelector('#datasets-table tbody');
    var rows = catalog.domains.map(function buildRow(domain) {
      var row = documentRef.createElement('tr');
      row.append(
        element('td', '', domain.title),
        element('td', '', STATUS_LABELS[domain.status]),
        element('td', '', NUMBER_FORMAT.format(domain.counts.nonEmptyTables) + ' de ' + NUMBER_FORMAT.format(domain.counts.tables)),
        element('td', '', NUMBER_FORMAT.format(domain.counts.rows)),
        element('td', '', humanPeriod(domain.periods))
      );
      return row;
    });
    body.replaceChildren.apply(body, rows);
  }

  function renderLineage(catalog) {
    var container = documentRef.getElementById('timeline-list');
    var definitions = [
      ['Archivo de origen', catalog.source.sourceFile, false],
      ['Huella SHA-256 completa', catalog.source.sourceSha256, true],
      ['Contrato publicado', catalog.schemaVersion, true]
    ];
    var items = definitions.map(function buildItem(definition) {
      var item = element('div', 'data-lineage-item');
      item.appendChild(element('span', '', definition[0]));
      item.appendChild(element(definition[2] ? 'code' : 'strong', '', definition[1]));
      return item;
    });
    container.replaceChildren.apply(container, items);
  }

  function renderSources(catalog) {
    setStatus('audit-status', 'ready', 'Fuente verificada · corte ' + humanDate(catalog.source.snapshotAsOf) + ' · no tiempo real.');
    setText('sourceName', catalog.source.canonicalSystem);
    setText('sourceCut', humanDate(catalog.source.snapshotAsOf));
    setText('sourceHash', shortHash(catalog.source.sourceSha256));
    setText('metricNonEmpty', NUMBER_FORMAT.format(catalog.counts.nonEmptyTables));
    setText('metricTablesContext', 'de ' + NUMBER_FORMAT.format(catalog.counts.totalTables) + ' tablas catalogadas');
    setText('metricRows', NUMBER_FORMAT.format(catalog.counts.totalRows));
    setText('metricDomains', NUMBER_FORMAT.format(catalog.counts.domainCount));
    documentRef.getElementById('sourceSummary').hidden = false;
    documentRef.getElementById('sourceMetrics').hidden = false;
    renderDomainCards(catalog);
    renderDomainTable(catalog);
    renderLineage(catalog);
  }

  function publicationDefinitions(catalog) {
    var cut = humanDate(catalog.source.snapshotAsOf);
    return [
      {
        id: 'executive-print', status: 'Disponible', title: 'Informe ejecutivo GRH',
        description: 'Síntesis preparada para reunión o expediente interno, con indicadores agregados, calidad, corte y límites de lectura.',
        format: 'Vista imprimible / PDF', use: 'Presentar y compartir', action: 'Generar informe', kind: 'print'
      },
      {
        id: 'executive-web', status: 'Disponible', title: 'Resumen ejecutivo interactivo',
        description: 'Lectura por período para explorar evolución, sectores, control y calidad antes de tomar una decisión.',
        format: 'Tablero web', use: 'Analizar y comparar', action: 'Abrir tablero', href: 'reportes.html'
      },
      {
        id: 'domain-catalog', status: 'Disponible', title: 'Mapa de áreas y datos',
        description: 'Explica qué dominios, tablas y preguntas están cubiertos, cuáles son parciales y qué falta desarrollar.',
        format: 'Catálogo web', use: 'Descubrir información', action: 'Abrir catálogo', href: 'areas-grh.html'
      },
      {
        id: 'quality', status: 'Disponible', title: 'Calidad y trazabilidad',
        description: 'Controles sobre validez, cobertura y conciliación del respaldo antes de circular cifras o conclusiones.',
        format: 'Tablero web', use: 'Validar confianza', action: 'Revisar calidad', href: '/calidad'
      }
    ].map(function withSource(definition) {
      definition.cut = cut;
      return definition;
    });
  }

  function buildPublicationCard(definition) {
    var card = element('article', 'data-publication-card');
    var heading = element('div', 'data-publication-card-head');
    var titleWrap = element('div');
    titleWrap.append(element('span', 'data-pill data-pill-ready', definition.status), element('h3', '', definition.title));
    heading.appendChild(titleWrap);
    card.append(heading, element('p', '', definition.description));
    var meta = element('div', 'data-publication-meta');
    [['Formato', definition.format], ['Sirve para', definition.use], ['Corte', definition.cut], ['Datos personales', 'No incluidos']]
      .forEach(function appendMeta(pair) {
        var item = element('div');
        item.append(element('span', '', pair[0]), element('strong', '', pair[1]));
        meta.appendChild(item);
      });
    card.appendChild(meta);
    if (definition.kind === 'print') {
      var button = element('button', 'data-button data-button-primary', definition.action);
      button.type = 'button';
      button.dataset.publication = definition.id;
      button.addEventListener('click', generateExecutiveReport);
      card.appendChild(button);
    } else {
      var link = element('a', 'data-button data-button-secondary', definition.action);
      link.href = definition.href;
      card.appendChild(link);
    }
    return card;
  }

  function renderPublications(catalog) {
    setStatus('publicationStatus', 'ready', 'Publicaciones vinculadas a una fuente verificada · corte ' + humanDate(catalog.source.snapshotAsOf) + '.');
    setText('publicationCut', humanDate(catalog.source.snapshotAsOf));
    setText('publicationSource', catalog.source.canonicalSystem + ' · ' + shortHash(catalog.source.sourceSha256));
    documentRef.getElementById('publicationSummary').hidden = false;
    var container = documentRef.getElementById('publicationCards');
    var cards = publicationDefinitions(catalog).map(buildPublicationCard);
    container.replaceChildren.apply(container, cards);
  }

  function showToast(message) {
    var toast = documentRef.getElementById('publicationToast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    windowRef.setTimeout(function hideToast() { toast.hidden = true; }, 4500);
  }

  function addSessionPublication(title) {
    var body = documentRef.getElementById('recentTable');
    if (!body) return;
    var empty = documentRef.getElementById('recentEmpty');
    if (empty) empty.remove();
    var row = documentRef.createElement('tr');
    row.append(
      element('td', '', title),
      element('td', '', 'Vista imprimible'),
      element('td', '', new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date())),
      element('td', '', 'Generada · revisar antes de circular')
    );
    body.prepend(row);
  }

  async function generateExecutiveReport(event) {
    var button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Preparando informe…';
    var preview = windowRef.open('', '_blank');
    if (preview) preview.opener = null;
    try {
      var response = await windowRef.MuniAuth.fetch('/api/pdf-report?type=rrhh', { headers: { Accept: 'text/html' } });
      var contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.toLowerCase().includes('text/html')) throw new Error('PUBLICATION_UNAVAILABLE');
      var blob = await response.blob();
      var objectUrl = URL.createObjectURL(blob);
      if (preview) preview.location.replace(objectUrl);
      else windowRef.location.href = objectUrl;
      windowRef.setTimeout(function releaseUrl() { URL.revokeObjectURL(objectUrl); }, 60000);
      addSessionPublication('Informe ejecutivo GRH');
      showToast('Informe generado. Confirmá corte, fuente y límites antes de compartirlo.');
    } catch (error) {
      if (preview) preview.close();
      if (!windowRef.MuniAuth.isAuthError(error)) showToast('No se pudo verificar y generar el informe en este momento.');
    } finally {
      button.disabled = false;
      button.textContent = 'Generar informe';
    }
  }

  function renderUnavailable(page) {
    var statusId = page === 'sources' ? 'audit-status' : 'publicationStatus';
    setStatus(statusId, 'error', 'No se pudo verificar la fuente GRH. No mostramos ceros ni publicaciones como si estuvieran disponibles.');
    var target = documentRef.getElementById(page === 'sources' ? 'domainCards' : 'publicationCards');
    if (target) target.replaceChildren(element('div', 'data-empty', 'La fuente debe volver a estar disponible y superar su contrato de integridad. Intentá nuevamente o revisá Calidad de datos.'));
  }

  async function loadCatalog() {
    var page = documentRef.body.dataset.dataOperationsPage;
    try {
      var response = await windowRef.MuniAuth.fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
      if (!response.ok || response.headers.get('x-municontrol-contract') !== CONTRACT) throw new Error('CATALOG_CONTRACT_UNAVAILABLE');
      var catalog = await response.json();
      if (!validCatalog(catalog)) throw new Error('CATALOG_CONTRACT_INVALID');
      if (page === 'sources') renderSources(catalog);
      else if (page === 'publications') renderPublications(catalog);
    } catch (error) {
      if (!windowRef.MuniAuth.isAuthError(error)) {
        console.error('[DATA-OPERATIONS] Fuente gobernada no disponible');
        renderUnavailable(page);
      }
    }
  }

  documentRef.addEventListener('DOMContentLoaded', loadCatalog);
})(window, document);
