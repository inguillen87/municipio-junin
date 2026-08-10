(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var COLLAPSED_RELEASED_ROWS = 8;
  var numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  var decimalFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var percentFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var compactFormatter = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
  var dateFormatter = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
  var dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires'
  });

  var state = {
    experience: null,
    loadSequence: 0,
    sectorExpanded: false,
    costExpanded: false,
    agreementExpanded: false
  };
  var elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      'connectionStatus', 'connectionStatusText', 'schemaChip', 'snapshotDate', 'snapshotNote', 'privacyLine',
      'loadingState', 'loadError', 'errorTitle', 'errorMessage', 'retryButton', 'rrhhDashboard',
      'kpiLegajos', 'kpiLegajosContext', 'kpiWorkforceParticipants', 'kpiWorkforceContext',
      'kpiAbsences', 'kpiAbsencesContext', 'kpiMovements', 'kpiMovementsContext', 'kpiQuality', 'kpiQuarantine',
      'sectorToggle', 'costToggle', 'agreementToggle', 'sectorBars', 'costBars', 'agreementBars',
      'sectorSummary', 'costSummary', 'agreementSummary', 'absenceCompleteValue', 'absenceDelta',
      'absenceChart', 'absencePartialNote', 'movementCompleteValue', 'movementDelta', 'movementChart',
      'movementPartialNote', 'qualityScore', 'qualityComponents', 'qualityScope', 'quarantineTableBody',
      'coverageTableBody', 'sourceMetadata', 'methodSchema'
    ].forEach(function (id) { elements[id] = byId(id); });
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function setConnection(stateName, label) {
    if (elements.connectionStatus) elements.connectionStatus.dataset.state = stateName;
    setText(elements.connectionStatusText, label);
  }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createSvgElement(tag, attributes) {
    var element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], String(entry[1]));
    });
    return element;
  }

  function formatPercent(value, digits) {
    var formatter = digits === 2 ? decimalFormatter : percentFormatter;
    return formatter.format(value) + '%';
  }

  function parseUtcDate(value) {
    var date = new Date(String(value) + 'T12:00:00Z');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatSnapshot(value) {
    var date = parseUtcDate(value);
    return date ? dateFormatter.format(date) : '—';
  }

  function formatGeneratedAt(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
  }

  function clearNode(element) {
    if (element) element.replaceChildren();
  }

  function resetToggle(toggle) {
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Ver proyección completa';
    toggle.hidden = false;
  }

  function resetOutputs() {
    [
      elements.kpiLegajos, elements.kpiWorkforceParticipants, elements.kpiAbsences,
      elements.kpiMovements, elements.kpiQuality, elements.kpiQuarantine,
      elements.absenceCompleteValue, elements.absenceDelta, elements.movementCompleteValue,
      elements.movementDelta, elements.qualityScore, elements.methodSchema
    ].forEach(function (element) { setText(element, '—'); });
    setText(elements.kpiLegajosContext, 'Registro maestro del snapshot; no equivale a planta activa.');
    setText(elements.kpiWorkforceContext, 'Período y definición en verificación.');
    setText(elements.kpiAbsencesContext, 'Serie protegida; no es una tasa.');
    setText(elements.kpiMovementsContext, 'Serie protegida de eventos históricos.');
    setText(elements.sectorSummary, 'La proyección permanece cerrada hasta verificar privacidad e identidad de corte.');
    setText(elements.costSummary, 'La proyección permanece cerrada hasta verificar privacidad e identidad de corte.');
    setText(elements.agreementSummary, 'La proyección permanece cerrada hasta verificar privacidad e identidad de corte.');
    setText(elements.qualityScope, 'La puntuación sólo describe el extracto agregado gobernado.');
    [
      elements.sectorBars, elements.costBars, elements.agreementBars, elements.absenceChart,
      elements.movementChart, elements.qualityComponents, elements.quarantineTableBody,
      elements.coverageTableBody, elements.sourceMetadata
    ].forEach(clearNode);
    state.sectorExpanded = false;
    state.costExpanded = false;
    state.agreementExpanded = false;
    [elements.sectorToggle, elements.costToggle, elements.agreementToggle].forEach(resetToggle);
  }

  function showLoading() {
    resetOutputs();
    if (elements.loadingState) elements.loadingState.hidden = false;
    if (elements.loadError) elements.loadError.hidden = true;
    if (elements.rrhhDashboard) {
      elements.rrhhDashboard.hidden = true;
      elements.rrhhDashboard.setAttribute('aria-busy', 'true');
    }
    setText(elements.snapshotDate, '—');
    setText(elements.snapshotNote, 'La vista permanecerá cerrada hasta verificar las dos proyecciones privadas.');
    setText(elements.schemaChip, 'Contrato en verificación');
    setText(elements.privacyLine, 'Acceso autenticado; ninguna celda se publica antes de aplicar la política de privacidad.');
    setConnection('loading', 'Verificando proyecciones');
  }

  function describeError(error) {
    var status = Number(error && error.status) || 0;
    var code = String(error && error.code || '');
    if (status === 401 || code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED') {
      return {
        title: 'Sesión requerida',
        message: 'No se cargó ningún indicador. Iniciá sesión para consultar las proyecciones privadas de GRH.'
      };
    }
    if (status === 403) {
      return {
        title: 'Acceso no autorizado',
        message: 'Tu sesión no tiene el rol o tenant habilitado para esta lectura ejecutiva de RRHH.'
      };
    }
    if (status === 404 || status === 503) {
      return {
        title: 'Snapshot GRH no disponible',
        message: 'Una de las proyecciones gobernadas no está disponible. No se muestran valores de ejemplo, datos crudos ni un corte anterior como reemplazo.'
      };
    }
    if (code === 'GRH_EXECUTIVE_CONTRACT_INVALID' || code === 'GRH_QUALITY_CONTRACT_INVALID' ||
        code === 'GRH_SOURCE_IDENTITY_MISMATCH') {
      return {
        title: 'Contrato GRH no verificable',
        message: 'La proyección fue rechazada por contrato, privacidad o identidad de corte. El tablero permanece cerrado y no expone resultados parciales.'
      };
    }
    if (code === 'GRH_REQUEST_TIMEOUT') {
      return {
        title: 'Tiempo de consulta agotado',
        message: 'Las proyecciones no respondieron dentro del límite seguro. El tablero permanece cerrado; podés reintentar.'
      };
    }
    return {
      title: 'Datos no verificables',
      message: 'No fue posible validar las proyecciones privadas de GRH. No hay fallback local, datos sintéticos ni valores parciales.'
    };
  }

  function showError(error) {
    var detail = describeError(error);
    resetOutputs();
    state.experience = null;
    if (elements.loadingState) elements.loadingState.hidden = true;
    if (elements.rrhhDashboard) {
      elements.rrhhDashboard.hidden = true;
      elements.rrhhDashboard.setAttribute('aria-busy', 'false');
    }
    if (elements.loadError) elements.loadError.hidden = false;
    setText(elements.errorTitle, detail.title);
    setText(elements.errorMessage, detail.message);
    setText(elements.snapshotDate, '—');
    setText(elements.snapshotNote, 'Sin contrato completo no se afirma ningún indicador.');
    setText(elements.schemaChip, 'Contrato cerrado');
    setText(elements.privacyLine, 'Fallo cerrado: no se cargaron categorías, series ni valores de calidad.');
    setConnection('error', 'Fuente no disponible');
  }

  function visibleRankingRows(ranking, expanded) {
    var released = ranking.rows.filter(function (row) { return row.privacyStatus === 'released'; });
    var protectedRow = ranking.rows.find(function (row) { return row.privacyStatus === 'protected_aggregate'; });
    var visible = expanded ? released : released.slice(0, COLLAPSED_RELEASED_ROWS);
    if (protectedRow) visible = visible.concat([protectedRow]);
    return visible;
  }

  function renderRanking(container, ranking, expanded) {
    clearNode(container);
    var rows = visibleRankingRows(ranking, expanded);
    var maximum = Math.max.apply(Math, rows.map(function (row) { return row.participants; }));
    container.dataset.totalParticipants = String(ranking.totalParticipants);
    container.dataset.publishedGroups = String(ranking.rows.length);
    container.dataset.privacyStatus = ranking.privacyStatus;
    container.dataset.threshold = String(ranking.threshold);

    rows.forEach(function (row) {
      var protectedAggregate = row.privacyStatus === 'protected_aggregate';
      var item = createElement('div', 'rrhh-bar-row' + (protectedAggregate ? ' rrhh-bar-row--protected' : ''));
      item.dataset.participants = String(row.participants);
      item.dataset.sharePct = String(row.sharePct);
      item.dataset.privacyStatus = row.privacyStatus;

      var label = createElement('span', 'rrhh-bar-label', row.label);
      var track = createElement('span', 'rrhh-bar-track');
      track.setAttribute('aria-hidden', 'true');
      var fill = createElement('span', 'rrhh-bar-fill');
      fill.dataset.width = maximum > 0 ? Math.max(2.5, row.participants / maximum * 100).toFixed(2) + '%' : '0%';
      track.appendChild(fill);
      var value = createElement('span', 'rrhh-bar-value', row.participantDisplay + ' · ' + formatPercent(row.sharePct, 1));
      item.append(label, track, value);
      container.appendChild(item);
    });

    global.requestAnimationFrame(function () {
      container.querySelectorAll('.rrhh-bar-fill').forEach(function (fill) {
        fill.style.width = fill.dataset.width;
      });
    });
  }

  function rankingSummary(ranking, noun, referencePeriod) {
    var releasedCount = ranking.rows.filter(function (row) { return row.privacyStatus === 'released'; }).length;
    var protectedCount = ranking.rows.filter(function (row) { return row.privacyStatus === 'protected_aggregate'; }).length;
    var privacyCopy = protectedCount
      ? 'Incluye Otros (celdas protegidas); no permite reconstruir categorías pequeñas.'
      : 'Todas las categorías publicadas superan el umbral interactivo.';
    return ranking.participantDisplay + ' participantes · ' + releasedCount + ' ' + noun +
      ' liberadas · ' + referencePeriod + '. ' + privacyCopy;
  }

  function configureToggle(toggle, ranking, expanded) {
    var releasedCount = ranking.rows.filter(function (row) { return row.privacyStatus === 'released'; }).length;
    toggle.hidden = releasedCount <= COLLAPSED_RELEASED_ROWS;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Ver principales' : 'Ver proyección completa';
  }

  function releasedSeries(domain) {
    return domain.series.filter(function (row) {
      return row.privacyStatus === 'released' && Number.isSafeInteger(row.value);
    }).map(function (row) {
      return { year: Number(row.period), value: row.value, participantCount: row.participantCount };
    }).sort(function (left, right) { return left.year - right.year; });
  }

  function niceMaximum(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    var power = Math.pow(10, Math.floor(Math.log10(value)));
    var normalized = value / power;
    var nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * power;
  }

  function renderTrendChart(container, series, options) {
    clearNode(container);
    if (!series.length) {
      container.appendChild(createElement('p', 'rrhh-card-subtitle', 'No hay períodos liberados para representar; no se imputa cero.'));
      return;
    }

    var width = 660;
    var height = 250;
    var margin = { top: 20, right: 18, bottom: 34, left: 48 };
    var plotWidth = width - margin.left - margin.right;
    var plotHeight = height - margin.top - margin.bottom;
    var maximum = niceMaximum(Math.max.apply(Math, series.map(function (row) { return row.value; })) * 1.05);
    var xAt = function (index) {
      return margin.left + (series.length === 1 ? plotWidth / 2 : index / (series.length - 1) * plotWidth);
    };
    var yAt = function (value) { return margin.top + plotHeight - value / maximum * plotHeight; };
    var svg = createSvgElement('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      role: 'img',
      'aria-label': options.ariaLabel,
      preserveAspectRatio: 'xMidYMid meet'
    });
    var defs = createSvgElement('defs');
    var gradient = createSvgElement('linearGradient', { id: options.gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
    gradient.append(
      createSvgElement('stop', { offset: '0%', 'stop-color': options.color, 'stop-opacity': '.32' }),
      createSvgElement('stop', { offset: '100%', 'stop-color': options.color, 'stop-opacity': '0' })
    );
    defs.appendChild(gradient);
    svg.appendChild(defs);

    for (var tick = 0; tick <= 4; tick += 1) {
      var tickValue = maximum * (4 - tick) / 4;
      var y = margin.top + plotHeight * tick / 4;
      svg.appendChild(createSvgElement('line', { class: 'rrhh-chart-grid', x1: margin.left, x2: width - margin.right, y1: y, y2: y }));
      var label = createSvgElement('text', { class: 'rrhh-chart-label', x: margin.left - 8, y: y + 3, 'text-anchor': 'end' });
      label.textContent = compactFormatter.format(tickValue);
      svg.appendChild(label);
    }

    var points = series.map(function (row, index) {
      return { x: xAt(index), y: yAt(row.value), row: row, index: index };
    });
    var linePath = points.map(function (point, index) {
      return (index ? 'L' : 'M') + point.x.toFixed(2) + ',' + point.y.toFixed(2);
    }).join(' ');
    var areaPath = linePath + ' L' + points[points.length - 1].x.toFixed(2) + ',' + (margin.top + plotHeight) +
      ' L' + points[0].x.toFixed(2) + ',' + (margin.top + plotHeight) + ' Z';
    svg.appendChild(createSvgElement('path', { class: 'rrhh-chart-area', d: areaPath, fill: 'url(#' + options.gradientId + ')' }));
    svg.appendChild(createSvgElement('path', {
      class: 'rrhh-chart-line' + (options.movement ? ' rrhh-chart-line--movement' : ''), d: linePath
    }));

    var labelEvery = Math.max(1, Math.ceil(series.length / 7));
    points.forEach(function (point) {
      var partial = point.row.year === options.snapshotYear;
      var circle = createSvgElement('circle', {
        class: 'rrhh-chart-point' + (options.movement ? ' rrhh-chart-point--movement' : '') +
          (partial ? ' rrhh-chart-point--partial' : ''),
        cx: point.x,
        cy: point.y,
        r: partial ? 4.2 : 3.1,
        'data-period': String(point.row.year),
        'data-privacy-status': 'released'
      });
      var title = createSvgElement('title');
      title.textContent = point.row.year + ': ' + numberFormatter.format(point.row.value) +
        ' registros · ' + numberFormatter.format(point.row.participantCount) + ' participantes agregados';
      circle.appendChild(title);
      svg.appendChild(circle);
      if (point.index % labelEvery === 0 || point.index === points.length - 1) {
        var yearLabel = createSvgElement('text', {
          class: 'rrhh-chart-label', x: point.x, y: height - 11, 'text-anchor': 'middle'
        });
        yearLabel.textContent = String(point.row.year);
        svg.appendChild(yearLabel);
      }
    });
    container.appendChild(svg);
  }

  function renderCompleteYearSummary(series, snapshotYear, valueElement, deltaElement) {
    var complete = series.filter(function (row) { return row.year < snapshotYear; });
    if (!complete.length) {
      setText(valueElement, '—');
      setText(deltaElement, 'Sin año completo liberado');
      return;
    }
    var latest = complete[complete.length - 1];
    var previous = complete.length > 1 ? complete[complete.length - 2] : null;
    setText(valueElement, numberFormatter.format(latest.value) + ' · ' + latest.year);
    if (!previous || previous.value === 0) {
      setText(deltaElement, 'Sin base anual comparable');
      return;
    }
    var delta = (latest.value - previous.value) / previous.value * 100;
    setText(deltaElement, (delta > 0 ? '+' : '') + formatPercent(delta, 1) + ' interanual');
  }

  function latestReleased(series) {
    return series.length ? series[series.length - 1] : null;
  }

  function renderKpis(executive, quality) {
    var legajo = quality.referential.legajo;
    var absence = latestReleased(releasedSeries(executive.absence));
    var movements = latestReleased(releasedSeries(executive.movements));
    setText(elements.kpiLegajos, numberFormatter.format(legajo.rows));
    setText(elements.kpiLegajosContext, numberFormatter.format(legajo.uniqueKeys) +
      ' claves únicas · unicidad ' + formatPercent(legajo.uniquenessPct, 2) + ' · no es planta activa.');
    setText(elements.kpiWorkforceParticipants, executive.workforce.bySector.participantDisplay);
    setText(elements.kpiWorkforceContext, executive.workforce.referencePeriod +
      ' · participantes de cálculo válido · no es planta activa.');
    setText(elements.kpiAbsences, absence ? numberFormatter.format(absence.value) : '—');
    setText(elements.kpiAbsencesContext, absence
      ? absence.year + ' · ' + numberFormatter.format(absence.participantCount) + ' participantes agregados · no es tasa.'
      : 'Sin período liberado; no se imputa cero.');
    setText(elements.kpiMovements, movements ? numberFormatter.format(movements.value) : '—');
    setText(elements.kpiMovementsContext, movements
      ? movements.year + ' · ' + numberFormatter.format(movements.participantCount) + ' participantes agregados.'
      : 'Sin período liberado; no se imputa cero.');
    setText(elements.kpiQuality, decimalFormatter.format(quality.quality.score) + '/100');
    setText(elements.kpiQuarantine, numberFormatter.format(quality.temporal.quarantineRows));
  }

  function renderQuality(quality) {
    var labels = {
      temporalValidity: 'Validez temporal',
      referentialIntegrity: 'Integridad referencial',
      payrollReconciliation: 'Reconciliación entre fuentes',
      legajoKeyUniqueness: 'Unicidad de clave de legajo'
    };
    setText(elements.qualityScore, decimalFormatter.format(quality.quality.score));
    clearNode(elements.qualityComponents);
    Object.entries(quality.quality.components).forEach(function (entry) {
      var component = entry[1];
      var row = createElement('div', 'rrhh-quality-row');
      var head = createElement('div', 'rrhh-quality-row-head');
      head.append(
        createElement('span', '', labels[entry[0]] + ' · peso ' + numberFormatter.format(component.weightPct) + '%'),
        createElement('strong', '', decimalFormatter.format(component.score))
      );
      var track = createElement('div', 'rrhh-quality-track');
      track.setAttribute('aria-hidden', 'true');
      var fill = createElement('div', 'rrhh-quality-fill');
      fill.dataset.width = Math.max(0, Math.min(100, component.score)).toFixed(2) + '%';
      track.appendChild(fill);
      row.append(head, track);
      elements.qualityComponents.appendChild(row);
    });
    global.requestAnimationFrame(function () {
      elements.qualityComponents.querySelectorAll('.rrhh-quality-fill').forEach(function (fill) {
        fill.style.width = fill.dataset.width;
      });
    });
    setText(elements.qualityScope,
      'Alcance: extracto agregado gobernado. No certifica aptitud de cada tabla cruda ni reemplaza controles administrativos.');
  }

  function appendCell(row, value, className) {
    row.appendChild(createElement('td', className || '', value));
  }

  function renderTemporal(quality) {
    var labels = { ausencia: 'Ausencias', calculo: 'Cálculo', legamov: 'Movimientos', licencia: 'Licencias', totpago: 'Totpago diagnóstico' };
    clearNode(elements.quarantineTableBody);
    Object.entries(quality.temporal.domains).forEach(function (entry) {
      var domain = entry[1];
      var row = document.createElement('tr');
      appendCell(row, labels[entry[0]], 'rrhh-table-domain');
      appendCell(row, numberFormatter.format(domain.rows));
      appendCell(row, numberFormatter.format(domain.validRows));
      appendCell(row, numberFormatter.format(domain.quarantineRows), domain.quarantineRows ? 'rrhh-table-warning' : '');
      appendCell(row, formatPercent(domain.validRatePct, 2));
      appendCell(row, domain.lastValidPeriod);
      elements.quarantineTableBody.appendChild(row);
    });
  }

  function renderCoverage(quality) {
    var labels = { calculo: 'Cálculo', legamov: 'Movimientos', ausencia: 'Ausencias', licencia: 'Licencias' };
    clearNode(elements.coverageTableBody);
    Object.entries(quality.referential.facts).forEach(function (entry) {
      var fact = entry[1];
      var row = document.createElement('tr');
      appendCell(row, labels[entry[0]], 'rrhh-table-domain');
      appendCell(row, numberFormatter.format(fact.rows));
      appendCell(row, numberFormatter.format(fact.validMatchedEmployeeKeys));
      appendCell(row, formatPercent(fact.employeeCoveragePct, 2));
      appendCell(row, numberFormatter.format(fact.orphanRows), fact.orphanRows ? 'rrhh-table-warning' : '');
      appendCell(row, formatPercent(fact.joinIntegrityPct, 2));
      elements.coverageTableBody.appendChild(row);
    });
  }

  function addSourceItem(fragment, label, value) {
    var item = createElement('div', 'rrhh-source-item');
    item.append(createElement('dt', '', label), createElement('dd', '', value));
    fragment.appendChild(item);
  }

  function reconciliationStatus(value) {
    return value === 'reconciled' ? 'Reconciliado' : 'Diferencias materiales detectadas';
  }

  function renderSource(executive, quality) {
    var fragment = document.createDocumentFragment();
    var source = quality.source;
    var reconciliation = quality.reconciliation;
    var shortSha = source.sourceSha256.slice(0, 12) + '…' + source.sourceSha256.slice(-8);
    addSourceItem(fragment, 'Sistema canónico', source.canonicalSystem);
    addSourceItem(fragment, 'Archivo de origen', source.sourceFile);
    addSourceItem(fragment, 'Corte', source.snapshotAsOf + ' · histórico');
    addSourceItem(fragment, 'Identidad SHA-256', shortSha);
    addSourceItem(fragment, 'Linaje de contratos', quality.lineage.profileSchemaVersion + ' · ' + quality.lineage.semanticSchemaVersion);
    addSourceItem(fragment, 'Perfil generado', formatGeneratedAt(quality.lineage.profileGeneratedAt));
    addSourceItem(fragment, 'Semántica generada', formatGeneratedAt(quality.lineage.semanticGeneratedAt));
    addSourceItem(fragment, 'Fuente excluida', source.excludedSources.join(', '));
    addSourceItem(fragment, 'Reconciliación', reconciliationStatus(reconciliation.status));
    addSourceItem(fragment, 'Cobertura de corridas', formatPercent(reconciliation.runCoveragePct, 2) +
      ' · ' + numberFormatter.format(reconciliation.matchedRuns) + '/' + numberFormatter.format(reconciliation.unionRuns));
    addSourceItem(fragment, 'Exactitud de métricas', formatPercent(reconciliation.metricExactRatePct, 2));
    addSourceItem(fragment, 'Acuerdo entre fuentes', formatPercent(reconciliation.valueAgreementPct, 2) +
      ' · score ' + formatPercent(reconciliation.scorePct, 2));
    clearNode(elements.sourceMetadata);
    elements.sourceMetadata.appendChild(fragment);

    setText(elements.snapshotDate, formatSnapshot(source.snapshotAsOf));
    setText(elements.snapshotNote, 'Backup canónico verificado; el modo en línea todavía no está activo.');
    setText(elements.schemaChip, executive.schemaVersion + ' · ' + quality.schemaVersion);
    setText(elements.privacyLine, 'Umbral interactivo k≥5 y sensible k≥10; las celdas pequeñas se agrupan u omiten.');
    setText(elements.methodSchema, executive.schemaVersion + ', ' + quality.schemaVersion + ' y ' + executive.policyVersion);
  }

  function renderDashboard(experience) {
    var executive = experience.executive;
    var quality = experience.quality;
    var workforce = executive.workforce;
    var snapshotYear = Number(executive.source.snapshotAsOf.slice(0, 4));
    var absenceSeries = releasedSeries(executive.absence);
    var movementSeries = releasedSeries(executive.movements);

    renderKpis(executive, quality);
    renderRanking(elements.sectorBars, workforce.bySector, state.sectorExpanded);
    renderRanking(elements.costBars, workforce.byCostCenter, state.costExpanded);
    renderRanking(elements.agreementBars, workforce.byAgreement, state.agreementExpanded);
    configureToggle(elements.sectorToggle, workforce.bySector, state.sectorExpanded);
    configureToggle(elements.costToggle, workforce.byCostCenter, state.costExpanded);
    configureToggle(elements.agreementToggle, workforce.byAgreement, state.agreementExpanded);
    setText(elements.sectorSummary, rankingSummary(workforce.bySector, 'categorías', workforce.referencePeriod));
    setText(elements.costSummary, rankingSummary(workforce.byCostCenter, 'categorías', workforce.referencePeriod));
    setText(elements.agreementSummary, rankingSummary(workforce.byAgreement, 'categorías', workforce.referencePeriod) +
      ' La categoría de origen no acredita por sí sola una relación vigente.');

    renderCompleteYearSummary(absenceSeries, snapshotYear, elements.absenceCompleteValue, elements.absenceDelta);
    renderCompleteYearSummary(movementSeries, snapshotYear, elements.movementCompleteValue, elements.movementDelta);
    renderTrendChart(elements.absenceChart, absenceSeries, {
      snapshotYear: snapshotYear,
      ariaLabel: 'Serie anual de registros de ausencia liberados por privacidad',
      gradientId: 'rrhh-absence-gradient',
      color: 'var(--rrhh-blue)',
      movement: false
    });
    renderTrendChart(elements.movementChart, movementSeries, {
      snapshotYear: snapshotYear,
      ariaLabel: 'Serie anual de movimientos de legajo liberados por privacidad',
      gradientId: 'rrhh-movement-gradient',
      color: 'var(--rrhh-cyan)',
      movement: true
    });
    setText(elements.absencePartialNote, snapshotYear +
      ' puede ser parcial al corte. Los períodos bajo umbral se omiten y nunca se representan como cero.');
    setText(elements.movementPartialNote, snapshotYear +
      ' puede ser parcial al corte. La serie contiene exclusivamente períodos liberados.');

    renderQuality(quality);
    renderTemporal(quality);
    renderCoverage(quality);
    renderSource(executive, quality);
    setConnection('ready', 'Proyecciones verificadas');
    if (elements.loadingState) elements.loadingState.hidden = true;
    if (elements.loadError) elements.loadError.hidden = true;
    elements.rrhhDashboard.hidden = false;
    elements.rrhhDashboard.setAttribute('aria-busy', 'false');
  }

  function uiError(code, status) {
    var error = new Error(code);
    error.code = code;
    error.status = status || 0;
    return error;
  }

  function redirectToSafeWorkspace() {
    try {
      if (!global.sessionStorage.getItem('mjunin_access_notice')) {
        global.sessionStorage.setItem('mjunin_access_notice', 'El perfil actual no tiene habilitada la superficie solicitada.');
      }
    } catch (error) {}
    var currentPage = global.location.pathname.split('/').pop() || '';
    if (currentPage !== 'inicio.html') global.location.replace('inicio.html');
  }

  async function requirePageCapability() {
    if (typeof global.requireCapability !== 'function') {
      redirectToSafeWorkspace();
      return false;
    }
    try {
      var allowed = await global.requireCapability('navigation.rrhh');
      if (allowed !== true) {
        redirectToSafeWorkspace();
        return false;
      }
      return true;
    } catch (error) {
      redirectToSafeWorkspace();
      return false;
    }
  }

  async function loadDashboard() {
    var sequence = state.loadSequence + 1;
    state.loadSequence = sequence;
    state.experience = null;
    showLoading();
    try {
      if (global.MuniAuthReady && typeof global.MuniAuthReady.then === 'function') {
        var authenticated = await global.MuniAuthReady;
        if (!authenticated) throw uiError('AUTH_REQUIRED', 401);
      }
      if (!global.MuniGrhData || typeof global.MuniGrhData.loadExperience !== 'function') {
        throw uiError('GRH_CLIENT_UNAVAILABLE');
      }
      var experience = await global.MuniGrhData.loadExperience({ timeoutMs: 10000 });
      if (sequence !== state.loadSequence) return;
      state.experience = experience;
      renderDashboard(experience);
    } catch (error) {
      if (sequence !== state.loadSequence) return;
      showError(error);
    }
  }

  async function loadAuthorizedDashboard() {
    if (!await requirePageCapability()) return;
    await loadDashboard();
  }

  function bindRankingToggle(toggle, stateKey, rankingKey, container, summary, noun) {
    toggle.addEventListener('click', function () {
      if (!state.experience) return;
      state[stateKey] = !state[stateKey];
      var workforce = state.experience.executive.workforce;
      var ranking = workforce[rankingKey];
      configureToggle(toggle, ranking, state[stateKey]);
      renderRanking(container, ranking, state[stateKey]);
      setText(summary, rankingSummary(ranking, noun, workforce.referencePeriod) +
        (rankingKey === 'byAgreement' ? ' La categoría de origen no acredita por sí sola una relación vigente.' : ''));
    });
  }

  function bindEvents() {
    elements.retryButton.addEventListener('click', loadAuthorizedDashboard);
    bindRankingToggle(elements.sectorToggle, 'sectorExpanded', 'bySector', elements.sectorBars, elements.sectorSummary, 'categorías');
    bindRankingToggle(elements.costToggle, 'costExpanded', 'byCostCenter', elements.costBars, elements.costSummary, 'categorías');
    bindRankingToggle(elements.agreementToggle, 'agreementExpanded', 'byAgreement', elements.agreementBars, elements.agreementSummary, 'categorías');
  }

  async function init() {
    cacheElements();
    bindEvents();
    if (!await requirePageCapability()) return;
    await loadDashboard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
