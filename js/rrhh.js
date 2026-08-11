(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var COLLAPSED_RELEASED_ROWS = 8;
  var DIRECTORY_ENDPOINT = '/api/grh-directory';
  var DIRECTORY_SCHEMA = 'grh-directory-v1';
  var DIRECTORY_ACCESS_ENDPOINT = '/api/grh-directory-access';
  var DIRECTORY_ACCESS_SCHEMA = 'grh-directory-access-v1';
  var DIRECTORY_ACCESS_PURPOSES = Object.freeze(['DIRECTORY_BROWSE', 'PERSON_LOOKUP', 'LEAVE_REVIEW']);
  var DIRECTORY_ACCESS_LIMITS = Object.freeze([
    'private_identity_required', 'purpose_required', 'tenant_bound', 'no_public_demo', 'no_raw_export'
  ]);
  var DIRECTORY_PAGE_SIZE = 20;
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
    agreementExpanded: false,
    directoryAccess: {
      sequence: 0,
      status: 'loading'
    },
    directory: {
      sequence: 0,
      access: 'loading',
      page: 1,
      total: 0,
      hasNext: false,
      nextCursor: null,
      cursors: { 1: null },
      items: [],
      facets: null,
      source: null,
      deepLink: { status: 'none', consumed: false }
    }
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
      'kpiAbsences', 'kpiAbsencesContext', 'kpiLeaves', 'kpiLeavesContext',
      'kpiMovements', 'kpiMovementsContext', 'kpiQuality', 'kpiQuarantine',
      'sectorToggle', 'costToggle', 'agreementToggle', 'sectorBars', 'costBars', 'agreementBars',
      'sectorSummary', 'costSummary', 'agreementSummary', 'absenceCompleteValue', 'absenceDelta',
      'absenceChart', 'absencePartialNote', 'leaveCompleteValue', 'leaveDelta', 'leaveChart', 'leaveRangeNote',
      'movementCompleteValue', 'movementDelta', 'movementChart', 'movementPartialNote', 'qualityScore',
      'qualityComponents', 'qualityScope', 'quarantineTableBody', 'coverageTableBody', 'sourceMetadata',
      'methodSchema', 'openDirectoryAction', 'compareGroupsAction', 'workforceDistribution', 'peopleDirectory',
      'directoryAccessPanel', 'directoryAccessStatus', 'directoryAccessScope', 'directoryAccessValidity',
      'directoryAccessAudit', 'directoryAccessLimits', 'directoryAccessError', 'directoryAccessRetry',
      'directoryStatusBadge', 'directoryForm', 'directorySearch', 'directorySector', 'directoryOrganization',
      'directoryPosition', 'directoryEvent', 'directorySubmit', 'directoryReset', 'directoryState',
      'directoryStateTitle', 'directoryStateMessage', 'directoryPrivateAccess', 'directoryResults', 'directoryResultCount',
      'directoryResultLabel', 'directorySourceLabel', 'directoryTableBody', 'directoryMobileList',
      'directoryPrevious', 'directoryNext', 'directoryPageLabel', 'personDialog', 'personDialogTitle',
      'personDialogSubtitle', 'personDialogClose', 'personDialogLoading', 'personDialogContent',
      'personDimensions', 'personEvents', 'personLeaveHistory', 'personLeaveHistoryTitle', 'personLeaveHistoryList',
      'personHaciendaSector', 'personHaciendaAgreement'
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
      elements.kpiLegajos, elements.kpiWorkforceParticipants, elements.kpiAbsences, elements.kpiLeaves,
      elements.kpiMovements, elements.kpiQuality, elements.kpiQuarantine,
      elements.absenceCompleteValue, elements.absenceDelta, elements.leaveCompleteValue, elements.leaveDelta,
      elements.movementCompleteValue, elements.movementDelta, elements.qualityScore, elements.methodSchema
    ].forEach(function (element) { setText(element, '—'); });
    setText(elements.kpiLegajosContext, 'Registro maestro del snapshot.');
    setText(elements.kpiWorkforceContext, 'Período y definición en verificación.');
    setText(elements.kpiAbsencesContext, 'Serie protegida; no es una tasa.');
    setText(elements.kpiLeavesContext, 'Serie histórica en verificación.');
    setText(elements.kpiMovementsContext, 'Serie protegida de eventos históricos.');
    setText(elements.sectorSummary, 'La proyección permanece cerrada hasta verificar privacidad e identidad de corte.');
    setText(elements.costSummary, 'La proyección permanece cerrada hasta verificar privacidad e identidad de corte.');
    setText(elements.agreementSummary, 'La proyección permanece cerrada hasta verificar privacidad e identidad de corte.');
    setText(elements.qualityScope, 'La puntuación sólo describe el extracto agregado gobernado.');
    [
      elements.sectorBars, elements.costBars, elements.agreementBars, elements.absenceChart, elements.leaveChart,
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
    showDirectoryState('loading', 'Verificando acceso al directorio',
      'El buscador nominal se habilita sólo después de validar la sesión y la fuente GRH.');
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
      class: 'rrhh-chart-line' + (options.movement ? ' rrhh-chart-line--movement' : '') +
        (options.leave ? ' rrhh-chart-line--leave' : ''),
      d: linePath
    }));

    var labelEvery = Math.max(1, Math.ceil(series.length / 7));
    points.forEach(function (point) {
      var partial = point.row.year === options.snapshotYear;
      var circle = createSvgElement('circle', {
        class: 'rrhh-chart-point' + (options.movement ? ' rrhh-chart-point--movement' : '') +
          (options.leave ? ' rrhh-chart-point--leave' : '') +
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
    var leave = latestReleased(releasedSeries(executive.leave));
    var movements = latestReleased(releasedSeries(executive.movements));
    setText(elements.kpiLegajos, numberFormatter.format(legajo.rows));
    setText(elements.kpiLegajosContext, numberFormatter.format(legajo.uniqueKeys) +
      ' claves únicas · unicidad ' + formatPercent(legajo.uniquenessPct, 2) + '.');
    setText(elements.kpiWorkforceParticipants, executive.workforce.bySector.participantDisplay);
    setText(elements.kpiWorkforceContext, executive.workforce.referencePeriod +
      ' · legajos que participaron en cálculo válido.');
    setText(elements.kpiAbsences, absence ? numberFormatter.format(absence.value) : '—');
    setText(elements.kpiAbsencesContext, absence
      ? absence.year + ' · ' + numberFormatter.format(absence.participantCount) + ' participantes agregados · no es tasa.'
      : 'Sin período liberado; no se imputa cero.');
    setText(elements.kpiLeaves, leave ? numberFormatter.format(leave.value) : '—');
    setText(elements.kpiLeavesContext, leave
      ? leave.year + ' · ' + numberFormatter.format(leave.participantCount) + ' participantes agregados · histórico.'
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
    setText(elements.snapshotNote, 'Backup canónico GRH verificado.');
    setText(elements.schemaChip, executive.schemaVersion + ' · ' + quality.schemaVersion);
    setText(elements.privacyLine, 'Agregados protegidos; el directorio nominal exige autorización adicional.');
    setText(elements.methodSchema, executive.schemaVersion + ', ' + quality.schemaVersion + ' y ' + executive.policyVersion);
  }

  function renderDashboard(experience) {
    var executive = experience.executive;
    var quality = experience.quality;
    var workforce = executive.workforce;
    var snapshotYear = Number(executive.source.snapshotAsOf.slice(0, 4));
    var absenceSeries = releasedSeries(executive.absence);
    var leaveSeries = releasedSeries(executive.leave);
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
    renderCompleteYearSummary(leaveSeries, snapshotYear, elements.leaveCompleteValue, elements.leaveDelta);
    renderCompleteYearSummary(movementSeries, snapshotYear, elements.movementCompleteValue, elements.movementDelta);
    renderTrendChart(elements.absenceChart, absenceSeries, {
      snapshotYear: snapshotYear,
      ariaLabel: 'Serie anual de registros de ausencia liberados por privacidad',
      gradientId: 'rrhh-absence-gradient',
      color: 'var(--rrhh-blue)',
      movement: false
    });
    renderTrendChart(elements.leaveChart, leaveSeries, {
      snapshotYear: snapshotYear,
      ariaLabel: 'Serie anual de licencias históricas liberadas por privacidad',
      gradientId: 'rrhh-leave-gradient',
      color: 'var(--rrhh-violet)',
      leave: true,
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
    setText(elements.leaveRangeNote, leaveSeries.length
      ? 'Cobertura histórica publicada: ' + leaveSeries[0].year + '–' + leaveSeries[leaveSeries.length - 1].year +
        '. No describe licencias vigentes en ' + snapshotYear + '.'
      : 'Sin años de licencia liberados; no se imputa cero.');
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

  function exactObjectKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var actual = Object.keys(value).sort();
    var sortedExpected = expected.slice().sort();
    return actual.length === sortedExpected.length && actual.every(function (key, index) {
      return key === sortedExpected[index];
    });
  }

  function validIsoTimestampOrNull(value) {
    if (value === null) return true;
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
  }

  function validDirectoryAccess(payload) {
    if (!exactObjectKeys(payload, [
      'schemaVersion', 'status', 'policyVersion', 'permission', 'scope', 'validity', 'audit', 'limits'
    ]) || payload.schemaVersion !== DIRECTORY_ACCESS_SCHEMA ||
        !['static', 'shadow', 'active'].includes(payload.status) ||
        typeof payload.policyVersion !== 'string' ||
        !/^[A-Za-z0-9._:-]{1,80}$/.test(payload.policyVersion) ||
        payload.permission !== 'grh.directory:read') return false;

    var scope = payload.scope;
    if (!exactObjectKeys(scope, ['kind', 'label', 'organizationCount']) ||
        !['TENANT', 'ORG_UNIT', 'ORG_SUBTREE'].includes(scope.kind) ||
        typeof scope.label !== 'string' || scope.label.trim() !== scope.label || !safeDirectoryText(scope.label, 120) ||
        !(scope.organizationCount === null ||
          (Number.isSafeInteger(scope.organizationCount) && scope.organizationCount >= 0)) ||
        (scope.kind !== 'TENANT' && !(Number.isSafeInteger(scope.organizationCount) && scope.organizationCount > 0))) return false;

    var validity = payload.validity;
    if (!exactObjectKeys(validity, ['validFrom', 'validUntil']) ||
        !validIsoTimestampOrNull(validity.validFrom) || !validIsoTimestampOrNull(validity.validUntil) ||
        (payload.status === 'active' && validity.validFrom === null) ||
        (validity.validUntil !== null && (validity.validFrom === null || validity.validUntil <= validity.validFrom))) return false;
    if (payload.status === 'static' && (
        !payload.policyVersion.startsWith('static:') || scope.kind !== 'TENANT' ||
        scope.organizationCount !== null || validity.validFrom !== null || validity.validUntil !== null
    )) return false;

    var audit = payload.audit;
    if (!exactObjectKeys(audit, ['required', 'purposes', 'storesPersonalQuery']) ||
        audit.required !== (payload.status !== 'static') ||
        audit.storesPersonalQuery !== false || !Array.isArray(audit.purposes) ||
        audit.purposes.length !== DIRECTORY_ACCESS_PURPOSES.length ||
        !audit.purposes.every(function (purpose, index) {
          return purpose === DIRECTORY_ACCESS_PURPOSES[index];
        })) return false;

    return Array.isArray(payload.limits) && payload.limits.length === DIRECTORY_ACCESS_LIMITS.length &&
      payload.limits.every(function (limit, index) { return limit === DIRECTORY_ACCESS_LIMITS[index]; });
  }

  function safeDirectoryText(value, maximum) {
    return value === null || (
      typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f]/.test(value)
    );
  }

  function validDirectoryDate(value) {
    return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  }

  function validDirectoryDimension(value) {
    return value === null || (
      exactObjectKeys(value, ['code', 'label']) && Number.isSafeInteger(value.code) && value.code >= 0 &&
      safeDirectoryText(value.label, 200)
    );
  }

  function validDirectoryRelation(value) {
    return value === null || (
      exactObjectKeys(value, ['code', 'label']) && Number.isSafeInteger(value.code) && value.code > 0 &&
      safeDirectoryText(value.label, 200)
    );
  }

  function validDirectoryPosition(value) {
    return value === null || (
      exactObjectKeys(value, ['code', 'label', 'parent', 'dependsOn']) &&
      Number.isSafeInteger(value.code) && value.code >= 0 && safeDirectoryText(value.label, 200) &&
      validDirectoryRelation(value.parent) && validDirectoryRelation(value.dependsOn)
    );
  }

  function validPositionObservation(value, snapshotAsOf) {
    if (value === null) return true;
    if (!exactObjectKeys(value, ['label', 'observedDate', 'observedPeriod', 'status', 'sourceTable']) ||
        typeof value.label !== 'string' || !safeDirectoryText(value.label, 200) ||
        typeof value.observedDate !== 'string' || !validDirectoryDate(value.observedDate) ||
        typeof value.observedPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(value.observedPeriod) ||
        value.observedDate.slice(0, 7) !== value.observedPeriod ||
        !['historical_observation', 'source_future_effective'].includes(value.status) ||
        value.sourceTable !== 'histolegajo') return false;
    return value.status === 'source_future_effective'
      ? value.observedDate > snapshotAsOf
      : value.observedDate <= snapshotAsOf;
  }

  function validDirectoryEvents(value, snapshotAsOf) {
    if (!exactObjectKeys(value, [
      'absenceCount', 'latestAbsenceDate', 'leaveCount', 'latestLeaveStartDate', 'latestLeaveEndDate'
    ])) return false;
    if (!Number.isSafeInteger(value.absenceCount) || value.absenceCount < 0 ||
        !Number.isSafeInteger(value.leaveCount) || value.leaveCount < 0) return false;
    return ['latestAbsenceDate', 'latestLeaveStartDate', 'latestLeaveEndDate'].every(function (key) {
      return validDirectoryDate(value[key]) && (value[key] === null || value[key] <= snapshotAsOf);
    }) && (value.latestLeaveStartDate === null || value.latestLeaveEndDate === null ||
      value.latestLeaveEndDate >= value.latestLeaveStartDate);
  }

  function validLeaveHistory(history, expectedTotal, snapshotAsOf) {
    if (!exactObjectKeys(history, ['total', 'limit', 'items']) || history.total !== expectedTotal ||
        history.limit !== 24 || !Array.isArray(history.items) ||
        history.items.length !== Math.min(expectedTotal, 24)) return false;
    return history.items.every(function (event) {
      return exactObjectKeys(event, ['startDate', 'endDate', 'days']) &&
        typeof event.startDate === 'string' && validDirectoryDate(event.startDate) &&
        event.startDate <= snapshotAsOf && validDirectoryDate(event.endDate) &&
        (event.endDate === null || (event.endDate >= event.startDate && event.endDate <= snapshotAsOf)) &&
        (event.days === null || (Number.isSafeInteger(event.days) && event.days >= 0));
    });
  }

  function validDirectoryItem(item, snapshotAsOf, mode) {
    var keys = [
      'companyCode', 'legajo', 'displayName', 'sector', 'organization', 'position', 'positionObservation',
      'category', 'agreement', 'events'
    ];
    if (mode === 'detail') keys.push('leaveHistory');
    return exactObjectKeys(item, keys) && Number.isSafeInteger(item.companyCode) && item.companyCode > 0 &&
      Number.isSafeInteger(item.legajo) && item.legajo > 0 && safeDirectoryText(item.displayName, 200) &&
      validDirectoryDimension(item.sector) && validDirectoryDimension(item.organization) &&
      validDirectoryPosition(item.position) && validPositionObservation(item.positionObservation, snapshotAsOf) &&
      validDirectoryDimension(item.category) &&
      validDirectoryDimension(item.agreement) && validDirectoryEvents(item.events, snapshotAsOf) &&
      (mode !== 'detail' || validLeaveHistory(item.leaveHistory, item.events.leaveCount, snapshotAsOf));
  }

  function validDirectoryFacetRow(row, name) {
    var keys = name === 'categories' ? ['agreementCode', 'code', 'label', 'count'] :
      name === 'positionObservations' ? ['label', 'count', 'status'] : ['code', 'label', 'count'];
    return exactObjectKeys(row, keys) &&
      (name === 'positionObservations' || (Number.isSafeInteger(row.code) && row.code >= 0)) &&
      (name !== 'categories' || (Number.isSafeInteger(row.agreementCode) && row.agreementCode >= 0)) &&
      (name !== 'positionObservations' || ['historical_observation', 'source_future_effective'].includes(row.status)) &&
      (name === 'positionObservations'
        ? typeof row.label === 'string' && safeDirectoryText(row.label, 200)
        : safeDirectoryText(row.label, 200)) &&
      Number.isSafeInteger(row.count) && row.count > 0;
  }

  function validDirectoryFacets(facets, mode) {
    if (mode === 'detail') return facets === null;
    return exactObjectKeys(facets, [
      'sectors', 'organizations', 'positions', 'positionObservations', 'categories', 'agreements'
    ]) &&
      Object.keys(facets).every(function (name) {
        if (!Array.isArray(facets[name]) || facets[name].length > 5000) return false;
        var seen = new Set();
        return facets[name].every(function (row) {
          var key = name === 'categories' ? String(row.agreementCode) + ':' + String(row.code) :
            name === 'positionObservations' ? row.status + ':' + row.label : String(row.code);
          if (!validDirectoryFacetRow(row, name) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
  }

  function validDirectoryResponse(payload) {
    if (!exactObjectKeys(payload, ['schemaVersion', 'source', 'privacy', 'query', 'facets', 'items']) ||
        payload.schemaVersion !== DIRECTORY_SCHEMA) return false;
    var source = payload.source;
    if (!exactObjectKeys(source, ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf']) ||
        typeof source.canonicalSystem !== 'string' || !safeDirectoryText(source.canonicalSystem, 100) ||
        typeof source.sourceFile !== 'string' || !source.sourceFile.endsWith('.sql.gz') ||
        !/^[0-9a-f]{64}$/.test(source.sourceSha256 || '') || !validDirectoryDate(source.snapshotAsOf) ||
        source.snapshotAsOf === null) return false;
    var privacy = payload.privacy;
    if (!exactObjectKeys(privacy, ['containsPersonalData', 'excludedFields']) ||
        privacy.containsPersonalData !== true || !Array.isArray(privacy.excludedFields) ||
        privacy.excludedFields.join('|') !== 'dni|cuil|contact|address|bank_account|salary|event_cause') return false;
    var query = payload.query;
    if (!exactObjectKeys(query, ['mode', 'page', 'limit', 'total', 'hasNext', 'cursor', 'nextCursor']) ||
        !['list', 'detail'].includes(query.mode) || !Number.isSafeInteger(query.page) || query.page < 1 ||
        !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100 ||
        !Number.isSafeInteger(query.total) || query.total < 0 || typeof query.hasNext !== 'boolean' ||
        ![query.cursor, query.nextCursor].every(function (cursor) {
          return cursor === null || (typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 512);
        }) || (query.mode === 'list' && Boolean(query.nextCursor) !== query.hasNext)) return false;
    return validDirectoryFacets(payload.facets, query.mode) && Array.isArray(payload.items) &&
      payload.items.length <= query.limit && payload.items.every(function (item) {
        return validDirectoryItem(item, source.snapshotAsOf, query.mode);
      }) && (query.mode !== 'detail' || (payload.items.length === 1 && query.total === 1 && !query.hasNext));
  }

  function directoryError(code, status) {
    var error = new Error(code);
    error.code = code;
    error.status = status || 0;
    return error;
  }

  function resetDirectoryAccessFacts() {
    setText(elements.directoryAccessScope, '—');
    setText(elements.directoryAccessValidity, '—');
    setText(elements.directoryAccessAudit, '—');
  }

  function showDirectoryAccessState(status, label, message) {
    state.directoryAccess.status = status;
    if (elements.directoryAccessPanel) elements.directoryAccessPanel.dataset.state = status;
    setText(elements.directoryAccessStatus, label);
    if (status === 'loading') {
      resetDirectoryAccessFacts();
      setText(elements.directoryAccessLimits, 'Verificando controles');
    }
    if (elements.directoryAccessRetry) {
      elements.directoryAccessRetry.hidden = ['loading', 'static', 'shadow', 'active'].includes(status);
      elements.directoryAccessRetry.disabled = status === 'loading';
    }
    if (elements.directoryAccessError) {
      elements.directoryAccessError.hidden = !message;
      setText(elements.directoryAccessError, message || '');
    }
  }

  function formatDirectoryAccessDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
  }

  function directoryAccessValidityLabel(payload) {
    var validity = payload.validity;
    if (payload.status === 'static') return 'Sin vigencia persistida';
    if (validity.validFrom === null && validity.validUntil === null) return 'Pendiente de activación';
    if (validity.validFrom !== null && validity.validUntil !== null) {
      return formatDirectoryAccessDate(validity.validFrom) + ' a ' + formatDirectoryAccessDate(validity.validUntil);
    }
    if (validity.validFrom !== null) return 'Desde ' + formatDirectoryAccessDate(validity.validFrom);
    return 'Hasta ' + formatDirectoryAccessDate(validity.validUntil);
  }

  function renderDirectoryAccess(payload) {
    var statusLabels = {
      static: 'Piloto privado actual',
      shadow: 'Política en observación',
      active: 'Política activa'
    };
    showDirectoryAccessState(payload.status, statusLabels[payload.status], '');
    setText(elements.directoryAccessScope, payload.scope.kind === 'TENANT' ? 'Municipio completo' :
      payload.scope.kind === 'ORG_SUBTREE' ? 'Área y dependencias' : 'Unidad organizativa');
    setText(elements.directoryAccessValidity, directoryAccessValidityLabel(payload));
    setText(elements.directoryAccessAudit, payload.audit.required ? 'Obligatoria' : 'Pendiente de activación');
    setText(elements.directoryAccessLimits, numberFormatter.format(payload.limits.length) + ' controles activos');
  }

  async function requestDirectoryAccess() {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw directoryError('GRH_DIRECTORY_ACCESS_CLIENT_UNAVAILABLE');
    }
    var controller = new AbortController();
    var timer = global.setTimeout(function () { controller.abort(); }, 10000);
    try {
      var response = await global.MuniAuth.fetch(DIRECTORY_ACCESS_ENDPOINT, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (response.status === 403) throw directoryError('GRH_DIRECTORY_ACCESS_DENIED', 403);
      if (!response.ok) throw directoryError('GRH_DIRECTORY_ACCESS_UNAVAILABLE', response.status);
      if (response.headers.get('X-MuniControl-Contract') !== DIRECTORY_ACCESS_SCHEMA ||
          !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) {
        throw directoryError('GRH_DIRECTORY_ACCESS_RESPONSE_INVALID', 502);
      }
      var payload = await response.json();
      if (!validDirectoryAccess(payload)) throw directoryError('GRH_DIRECTORY_ACCESS_RESPONSE_INVALID', 502);
      return payload;
    } catch (error) {
      if (error && error.name === 'AbortError') throw directoryError('GRH_DIRECTORY_ACCESS_TIMEOUT', 408);
      throw error;
    } finally {
      global.clearTimeout(timer);
    }
  }

  async function loadDirectoryAccess() {
    var sequence = state.directoryAccess.sequence + 1;
    state.directoryAccess.sequence = sequence;
    showDirectoryAccessState('loading', 'Verificando', '');
    try {
      var payload = await requestDirectoryAccess();
      if (sequence !== state.directoryAccess.sequence) return false;
      renderDirectoryAccess(payload);
      return true;
    } catch (error) {
      if (sequence !== state.directoryAccess.sequence) return false;
      resetDirectoryAccessFacts();
      setText(elements.directoryAccessLimits, 'Sin confirmación');
      if (Number(error && error.status) === 403) {
        showDirectoryAccessState('denied', 'No habilitado', 'Tu perfil no tiene habilitado este acceso.');
      } else if (Number(error && error.status) === 503 || Number(error && error.status) === 408) {
        showDirectoryAccessState('unavailable', 'No disponible', 'El servicio de permisos no responde.');
      } else {
        showDirectoryAccessState('invalid', 'No verificable', 'La respuesta de acceso no pudo verificarse.');
      }
      return false;
    }
  }

  function parseDirectoryDeepLink() {
    var params;
    try {
      params = new URLSearchParams(global.location.search || '');
    } catch (error) {
      return { status: 'invalid', consumed: false };
    }
    var keys = Array.from(params.keys());
    if (!keys.length) return { status: 'none', consumed: false };
    var exactPersonKeys = keys.length === 2 && ['company', 'legajo'].every(function (key) {
      return params.getAll(key).length === 1;
    }) && keys.every(function (key) { return key === 'company' || key === 'legajo'; });
    if (global.location.hash !== '#peopleDirectory') {
      return { status: 'invalid', consumed: false };
    }
    if (exactPersonKeys) {
      var companyRaw = params.get('company');
      var legajoRaw = params.get('legajo');
      if (!/^[1-9]\d*$/.test(companyRaw || '') || !/^[1-9]\d*$/.test(legajoRaw || '')) {
        return { status: 'invalid', consumed: false };
      }
      var companyCode = Number(companyRaw);
      var legajo = Number(legajoRaw);
      if (!Number.isSafeInteger(companyCode) || !Number.isSafeInteger(legajo)) {
        return { status: 'invalid', consumed: false };
      }
      return { status: 'person', companyCode: companyCode, legajo: legajo, consumed: false };
    }

    var dimensionKeys = ['organization', 'sector'];
    var dimension = dimensionKeys.find(function (key) { return params.has(key); });
    var absenceOnly = !dimension && keys.length === 1 && keys[0] === 'hasAbsence' &&
      params.getAll('hasAbsence').length === 1 && params.get('hasAbsence') === 'true';
    if (absenceOnly) {
      return { status: 'filter', dimension: null, code: null, hasAbsence: true, consumed: false };
    }
    var allowedFilterKeys = dimension ? [dimension, 'hasAbsence'] : [];
    var exactFilterKeys = Boolean(dimension) && (keys.length === 1 || keys.length === 2) &&
      keys.every(function (key) { return allowedFilterKeys.indexOf(key) !== -1 && params.getAll(key).length === 1; }) &&
      dimensionKeys.filter(function (key) { return params.has(key); }).length === 1;
    var dimensionRaw = dimension ? params.get(dimension) : '';
    var absenceRaw = params.get('hasAbsence');
    if (!exactFilterKeys || !/^(?:0|[1-9]\d*)$/.test(dimensionRaw || '') ||
        (absenceRaw !== null && absenceRaw !== 'true')) {
      return { status: 'invalid', consumed: false };
    }
    var dimensionCode = Number(dimensionRaw);
    if (!Number.isSafeInteger(dimensionCode)) return { status: 'invalid', consumed: false };
    return {
      status: 'filter',
      dimension: dimension,
      code: dimensionCode,
      hasAbsence: absenceRaw === 'true',
      consumed: false
    };
  }

  function setDirectoryControlsDisabled(disabled) {
    [
      elements.directorySearch, elements.directorySector, elements.directoryOrganization,
      elements.directoryPosition, elements.directoryEvent, elements.directorySubmit, elements.directoryReset
    ].forEach(function (element) { if (element) element.disabled = disabled; });
    if (elements.directoryForm) elements.directoryForm.dataset.locked = disabled ? 'true' : 'false';
  }

  function showDirectoryState(status, title, message) {
    state.directory.access = status;
    if (elements.directoryStatusBadge) {
      elements.directoryStatusBadge.dataset.state = status;
      elements.directoryStatusBadge.textContent = status === 'ready' ? 'Directorio habilitado' :
        status === 'denied' ? 'Acceso nominal no habilitado' :
          status === 'invalid' ? 'Enlace nominal inválido' :
            status === 'unavailable' ? 'Directorio no disponible' : 'Verificando acceso';
    }
    setText(elements.directoryStateTitle, title);
    setText(elements.directoryStateMessage, message);
    if (elements.directoryPrivateAccess) elements.directoryPrivateAccess.hidden = status !== 'denied';
    if (elements.directoryState) elements.directoryState.hidden = false;
    if (elements.directoryResults) elements.directoryResults.hidden = true;
    setDirectoryControlsDisabled(status === 'denied' || status === 'invalid' || status === 'loading');
    if (status === 'denied' || status === 'invalid' || status === 'unavailable') {
      state.directory.items = [];
      state.directory.total = 0;
      state.directory.facets = null;
      state.directory.source = null;
      clearNode(elements.directoryTableBody);
      clearNode(elements.directoryMobileList);
    }
  }

  function directoryQuery(page, cursor) {
    var query = { page: page, limit: DIRECTORY_PAGE_SIZE };
    if (cursor) {
      delete query.page;
      query.cursor = cursor;
    }
    var search = String(elements.directorySearch.value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (search) query.search = search;
    [['sector', elements.directorySector], ['organization', elements.directoryOrganization]].forEach(function (entry) {
      if (entry[1].value) query[entry[0]] = Number(entry[1].value);
    });
    if (elements.directoryPosition.value) query.positionObservation = elements.directoryPosition.value;
    var eventFilter = elements.directoryEvent.value;
    if (eventFilter === 'leave' || eventFilter === 'both') query.hasLeave = true;
    if (eventFilter === 'absence' || eventFilter === 'both') query.hasAbsence = true;
    var deepLink = state.directory.deepLink;
    if (!cursor && page === 1 && deepLink && deepLink.status === 'filter' && !deepLink.consumed) {
      if (deepLink.dimension) query[deepLink.dimension] = deepLink.code;
      if (deepLink.hasAbsence) query.hasAbsence = true;
    }
    return query;
  }

  function serializeDirectoryQuery(query) {
    var params = new URLSearchParams();
    Object.keys(query).forEach(function (key) { params.set(key, String(query[key])); });
    return params.toString();
  }

  async function requestDirectory(query, purpose) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw directoryError('GRH_DIRECTORY_CLIENT_UNAVAILABLE');
    }
    if (purpose !== 'DIRECTORY_BROWSE' && purpose !== 'PERSON_LOOKUP') {
      throw directoryError('GRH_DIRECTORY_PURPOSE_INVALID');
    }
    var controller = new AbortController();
    var timer = global.setTimeout(function () { controller.abort(); }, 10000);
    try {
      var response = await global.MuniAuth.fetch(DIRECTORY_ENDPOINT + '?' + serializeDirectoryQuery(query), {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json', 'X-MuniControl-Purpose': purpose },
        signal: controller.signal
      });
      if (response.status === 403) throw directoryError('GRH_DIRECTORY_ACCESS_DENIED', 403);
      if (!response.ok) throw directoryError('GRH_DIRECTORY_UNAVAILABLE', response.status);
      if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) {
        throw directoryError('GRH_DIRECTORY_RESPONSE_INVALID', 502);
      }
      var payload = await response.json();
      if (!validDirectoryResponse(payload)) throw directoryError('GRH_DIRECTORY_RESPONSE_INVALID', 502);
      if (state.experience && (
        payload.source.sourceSha256 !== state.experience.executive.source.sourceSha256 ||
        payload.source.snapshotAsOf !== state.experience.executive.source.snapshotAsOf ||
        payload.source.canonicalSystem !== state.experience.executive.source.canonicalSystem
      )) throw directoryError('GRH_DIRECTORY_SOURCE_MISMATCH', 502);
      return payload;
    } catch (error) {
      if (error && error.name === 'AbortError') throw directoryError('GRH_DIRECTORY_TIMEOUT', 408);
      throw error;
    } finally {
      global.clearTimeout(timer);
    }
  }

  function facetLabel(row, name) {
    var label = row.label || 'Código ' + row.code;
    if (name === 'positionObservations') label += ' · histolegajo';
    return label + ' (' + numberFormatter.format(row.count) + ')';
  }

  function renderFacet(select, rows, fallbackLabel, name) {
    var current = select.value;
    clearNode(select);
    var all = createElement('option', '', fallbackLabel);
    all.value = '';
    select.appendChild(all);
    rows.forEach(function (row) {
      var option = createElement('option', '', facetLabel(row, name));
      option.value = name === 'positionObservations' ? row.label : String(row.code);
      select.appendChild(option);
    });
    if (Array.from(select.options).some(function (option) { return option.value === current; })) select.value = current;
  }

  function dimensionLabel(value) {
    if (!value) return 'Sin dato en el origen';
    return value.label || 'Código ' + value.code;
  }

  function positionPresentation(item) {
    if (item.position !== null) {
      return {
        kind: 'position',
        label: dimensionLabel(item.position),
        context: 'Cargo informado · legajo'
      };
    }
    if (item.positionObservation !== null) {
      return {
        kind: 'observation',
        label: item.positionObservation.label,
        context: 'Cargo informado · histolegajo ' + item.positionObservation.observedPeriod
      };
    }
    return { kind: 'missing', label: 'Sin cargo informado', context: 'Sin observación publicada' };
  }

  function positionObservationStatus(value) {
    return value.status === 'source_future_effective'
      ? 'Vigencia futura informada por la fuente'
      : 'Observación histórica de la fuente';
  }

  function appendPositionCell(row, item) {
    var presentation = positionPresentation(item);
    var cell = createElement('td', 'rrhh-position-cell');
    cell.append(
      createElement('strong', '', presentation.label),
      createElement('span', '', presentation.context)
    );
    row.appendChild(cell);
  }

  function formatEventDate(value) {
    return value ? formatSnapshot(value) : 'Sin fecha publicada';
  }

  function personIdentity(item) {
    return item.displayName || 'Nombre no disponible en el origen';
  }

  function createPersonButton(item, compact) {
    var button = createElement('button', 'rrhh-button rrhh-person-open', compact ? 'Ver' : 'Abrir ficha');
    button.type = 'button';
    button.dataset.company = String(item.companyCode);
    button.dataset.legajo = String(item.legajo);
    button.setAttribute('aria-label', 'Abrir ficha de ' + personIdentity(item) + ', legajo ' + item.legajo);
    return button;
  }

  function renderDirectoryRows(items) {
    clearNode(elements.directoryTableBody);
    clearNode(elements.directoryMobileList);
    items.forEach(function (item) {
      var row = document.createElement('tr');
      appendCell(row, personIdentity(item), 'rrhh-person-name');
      appendCell(row, numberFormatter.format(item.legajo));
      appendPositionCell(row, item);
      appendCell(row, dimensionLabel(item.organization));
      appendCell(row, numberFormatter.format(item.events.leaveCount));
      appendCell(row, numberFormatter.format(item.events.absenceCount));
      var actionCell = document.createElement('td');
      actionCell.appendChild(createPersonButton(item, false));
      row.appendChild(actionCell);
      elements.directoryTableBody.appendChild(row);

      var card = createElement('article', 'rrhh-person-card');
      var positionValue = positionPresentation(item);
      var head = createElement('div', 'rrhh-person-card-head');
      var identity = createElement('div');
      identity.append(
        createElement('strong', '', personIdentity(item)),
        createElement('span', '', 'Legajo ' + numberFormatter.format(item.legajo) + ' · empresa ' + item.companyCode)
      );
      head.append(identity, createPersonButton(item, true));
      card.append(
        head,
        createElement('strong', '', positionValue.label),
        createElement('span', '', positionValue.context),
        createElement('span', '', 'Organización: ' + dimensionLabel(item.organization)),
        createElement('span', '', numberFormatter.format(item.events.leaveCount) + ' licencias · ' +
          numberFormatter.format(item.events.absenceCount) + ' ausencias')
      );
      elements.directoryMobileList.appendChild(card);
    });
  }

  function renderDirectory(payload) {
    state.directory.access = 'ready';
    state.directory.page = payload.query.page;
    state.directory.total = payload.query.total;
    state.directory.hasNext = payload.query.hasNext;
    state.directory.nextCursor = payload.query.nextCursor;
    state.directory.cursors[payload.query.page] = payload.query.cursor;
    if (payload.query.nextCursor) state.directory.cursors[payload.query.page + 1] = payload.query.nextCursor;
    state.directory.items = payload.items;
    state.directory.facets = payload.facets;
    state.directory.source = payload.source;
    setDirectoryControlsDisabled(false);
    elements.directoryStatusBadge.dataset.state = 'ready';
    setText(elements.directoryStatusBadge, 'Directorio habilitado');
    renderFacet(elements.directorySector, payload.facets.sectors, 'Todos', 'sectors');
    renderFacet(elements.directoryOrganization, payload.facets.organizations, 'Todas', 'organizations');
    renderFacet(elements.directoryPosition, payload.facets.positionObservations, 'Todos', 'positionObservations');
    var deepLink = state.directory.deepLink;
    if (deepLink && deepLink.status === 'filter' && !deepLink.consumed) {
      var targetSelect = deepLink.dimension === 'organization'
        ? elements.directoryOrganization
        : (deepLink.dimension === 'sector' ? elements.directorySector : null);
      if (targetSelect && Array.from(targetSelect.options).some(function (option) { return option.value === String(deepLink.code); })) {
        targetSelect.value = String(deepLink.code);
      }
      if (deepLink.hasAbsence) elements.directoryEvent.value = 'absence';
      deepLink.consumed = true;
      elements.peopleDirectory.scrollIntoView({ block: 'start' });
    }
    renderDirectoryRows(payload.items);
    setText(elements.directoryResultCount, numberFormatter.format(payload.query.total));
    setText(elements.directoryResultLabel, payload.query.total === 1 ? 'resultado' : 'resultados');
    setText(elements.directorySourceLabel, 'Corte ' + formatSnapshot(payload.source.snapshotAsOf));
    setText(elements.directoryPageLabel, 'Página ' + payload.query.page + ' de ' +
      Math.max(1, Math.ceil(payload.query.total / payload.query.limit)));
    elements.directoryPrevious.disabled = payload.query.page <= 1;
    elements.directoryNext.disabled = !payload.query.hasNext;
    elements.directoryState.hidden = true;
    elements.directoryResults.hidden = false;
    if (!payload.items.length) {
      elements.directoryMobileList.appendChild(createElement('p', 'rrhh-card-subtitle', 'No hay coincidencias con estos filtros.'));
    }
  }

  async function loadDirectory(page, cursor, resetCursors) {
    if (state.directory.access === 'denied' || state.directory.access === 'invalid') return false;
    if (resetCursors) state.directory.cursors = { 1: null };
    var sequence = state.directory.sequence + 1;
    state.directory.sequence = sequence;
    showDirectoryState('loading', 'Consultando directorio', 'Aplicando búsqueda y filtros sobre el snapshot GRH.');
    try {
      var payload = await requestDirectory(directoryQuery(page, cursor), 'DIRECTORY_BROWSE');
      if (sequence !== state.directory.sequence) return false;
      renderDirectory(payload);
      return true;
    } catch (error) {
      if (sequence !== state.directory.sequence) return false;
      if (Number(error && error.status) === 403 || (error && error.code === 'GRH_DIRECTORY_ACCESS_DENIED')) {
        showDirectoryState('denied', 'Directorio nominal no habilitado para este perfil',
          'Las métricas agregadas continúan disponibles. No se consultaron ni se muestran registros de personas.');
        return false;
      }
      showDirectoryState('unavailable', 'Directorio temporalmente no disponible',
        'El tablero agregado sigue operativo. Usá Buscar para reintentar la consulta nominal.');
      return false;
    }
  }

  function appendPersonDimension(label, value) {
    var item = createElement('div', 'rrhh-person-dimension');
    item.append(createElement('span', '', label), createElement('strong', '', value));
    elements.personDimensions.appendChild(item);
  }

  function appendPersonEvent(label, value) {
    var item = createElement('div', 'rrhh-event-card');
    item.append(createElement('span', '', label), createElement('strong', '', value));
    elements.personEvents.appendChild(item);
  }

  function haciendaCohortHref(item, dimension) {
    var source = dimension === 'sector' ? item.sector : item.agreement;
    if (!source || !Number.isSafeInteger(item.companyCode) || item.companyCode <= 0 ||
        !Number.isSafeInteger(source.code) || source.code < 0) return null;
    var params = new URLSearchParams();
    params.set('cohort', dimension);
    params.set('company', String(item.companyCode));
    params.set('code', String(source.code));
    return 'hacienda.html?' + params.toString() + '#cohortContext';
  }

  function configureHaciendaCohortAction(element, item, dimension) {
    var href = haciendaCohortHref(item, dimension);
    if (!element) return;
    element.hidden = href === null;
    if (href === null) element.removeAttribute('href');
    else element.href = href;
  }

  function renderPerson(item) {
    clearNode(elements.personDimensions);
    clearNode(elements.personEvents);
    clearNode(elements.personLeaveHistoryList);
    setText(elements.personDialogTitle, personIdentity(item));
    setText(elements.personDialogSubtitle, 'Legajo ' + numberFormatter.format(item.legajo) + ' · empresa ' + item.companyCode);
    var positionValue = positionPresentation(item);
    appendPersonDimension(positionValue.context, positionValue.label);
    if (positionValue.kind === 'position') {
      appendPersonDimension('Cargo superior', dimensionLabel(item.position.parent));
      appendPersonDimension('Dependencia jerárquica', dimensionLabel(item.position.dependsOn));
    } else if (positionValue.kind === 'observation') {
      appendPersonDimension('Estado de la observación', positionObservationStatus(item.positionObservation));
      appendPersonDimension('Fecha informada', formatEventDate(item.positionObservation.observedDate));
      appendPersonDimension('Jerarquía del cargo', 'No informada por histolegajo');
    }
    appendPersonDimension('Organización', dimensionLabel(item.organization));
    appendPersonDimension('Sector', dimensionLabel(item.sector));
    appendPersonDimension('Categoría', dimensionLabel(item.category));
    appendPersonDimension('Convenio', dimensionLabel(item.agreement));
    appendPersonDimension('Situación', 'Legajo registrado en el snapshot');
    appendPersonEvent('Licencias históricas', numberFormatter.format(item.events.leaveCount) +
      (item.events.latestLeaveStartDate ? ' · última ' + formatEventDate(item.events.latestLeaveStartDate) +
        (item.events.latestLeaveEndDate ? ' a ' + formatEventDate(item.events.latestLeaveEndDate) : '') : ' · sin fecha publicada'));
    appendPersonEvent('Ausencias históricas', numberFormatter.format(item.events.absenceCount) +
      (item.events.latestAbsenceDate ? ' · última ' + formatEventDate(item.events.latestAbsenceDate) : ' · sin fecha publicada'));
    appendPersonEvent('Movimientos', 'No incluido en esta extracción nominal');
    configureHaciendaCohortAction(elements.personHaciendaSector, item, 'sector');
    configureHaciendaCohortAction(elements.personHaciendaAgreement, item, 'agreement');
    setText(elements.personLeaveHistoryTitle, item.leaveHistory.total
      ? 'Licencias publicadas · últimas ' + item.leaveHistory.items.length + ' de ' + item.leaveHistory.total
      : 'Licencias publicadas');
    if (!item.leaveHistory.items.length) {
      elements.personLeaveHistoryList.appendChild(createElement('li', '', 'Sin licencias históricas asociadas a este legajo.'));
    } else {
      item.leaveHistory.items.forEach(function (event) {
        var period = formatEventDate(event.startDate) + (event.endDate ? ' a ' + formatEventDate(event.endDate) : '');
        var days = event.days === null ? 'días no informados' : numberFormatter.format(event.days) + ' días';
        elements.personLeaveHistoryList.appendChild(createElement('li', '', period + ' · ' + days));
      });
    }
    elements.personDialogLoading.hidden = true;
    elements.personDialogContent.hidden = false;
  }

  async function openPerson(companyCode, legajo) {
    var sequence = state.directory.sequence + 1;
    state.directory.sequence = sequence;
    setText(elements.personDialogTitle, 'Ficha de persona');
    setText(elements.personDialogSubtitle, 'Consultando legajo ' + numberFormatter.format(legajo) + '…');
    setText(elements.personDialogLoading, 'Cargando ficha…');
    elements.personDialogLoading.hidden = false;
    elements.personDialogContent.hidden = true;
    if (typeof elements.personDialog.showModal === 'function') elements.personDialog.showModal();
    else elements.personDialog.setAttribute('open', '');
    try {
      var payload = await requestDirectory({ legajo: legajo, company: companyCode }, 'PERSON_LOOKUP');
      if (sequence !== state.directory.sequence || !elements.personDialog.open) return;
      renderPerson(payload.items[0]);
      return true;
    } catch (error) {
      if (sequence !== state.directory.sequence) return false;
      if (Number(error && error.status) === 403 || (error && error.code === 'GRH_DIRECTORY_ACCESS_DENIED')) {
        clearNode(elements.personDimensions);
        clearNode(elements.personEvents);
        clearNode(elements.personLeaveHistoryList);
        elements.personDialogContent.hidden = true;
        elements.personDialogLoading.hidden = true;
        setText(elements.personDialogTitle, 'Ficha no disponible');
        setText(elements.personDialogSubtitle, 'El acceso nominal no está habilitado.');
        if (typeof elements.personDialog.close === 'function' && elements.personDialog.open) elements.personDialog.close();
        else elements.personDialog.removeAttribute('open');
        showDirectoryState('denied', 'Directorio nominal no habilitado para este perfil',
          'Las métricas agregadas continúan disponibles. No se muestran registros de personas.');
        return false;
      }
      setText(elements.personDialogLoading, 'La ficha no está disponible. Cerrá y reintentá desde el directorio.');
      return false;
    }
  }

  async function openDirectoryDeepLink() {
    var deepLink = state.directory.deepLink;
    if (!deepLink || deepLink.status !== 'person' || deepLink.consumed || state.directory.access !== 'ready') return;
    deepLink.consumed = true;
    elements.peopleDirectory.scrollIntoView({ block: 'start' });
    await openPerson(deepLink.companyCode, deepLink.legajo);
  }

  function closePersonDialog() {
    state.directory.sequence += 1;
    if (typeof elements.personDialog.close === 'function' && elements.personDialog.open) elements.personDialog.close();
    else elements.personDialog.removeAttribute('open');
  }

  function directoryOpenFromEvent(event) {
    var button = event.target.closest('.rrhh-person-open');
    if (!button) return;
    openPerson(Number(button.dataset.company), Number(button.dataset.legajo));
  }

  function expandAllRankings() {
    if (!state.experience) return;
    var workforce = state.experience.executive.workforce;
    state.sectorExpanded = true;
    state.costExpanded = true;
    state.agreementExpanded = true;
    [
      [elements.sectorToggle, workforce.bySector, elements.sectorBars, elements.sectorSummary, 'categorías', false],
      [elements.costToggle, workforce.byCostCenter, elements.costBars, elements.costSummary, 'categorías', false],
      [elements.agreementToggle, workforce.byAgreement, elements.agreementBars, elements.agreementSummary, 'categorías', true]
    ].forEach(function (entry) {
      configureToggle(entry[0], entry[1], true);
      renderRanking(entry[2], entry[1], true);
      setText(entry[3], rankingSummary(entry[1], entry[4], workforce.referencePeriod) +
        (entry[5] ? ' La categoría de origen no acredita por sí sola una relación vigente.' : ''));
    });
    elements.workforceDistribution.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      loadDirectoryAccess();
      if (state.directory.deepLink.status === 'invalid') {
        showDirectoryState('invalid', 'El enlace al directorio no es válido',
          'La URL debe identificar una persona o un filtro operativo permitido, sin parámetros adicionales. No se consultó ni se muestra información nominal.');
        return;
      }
      var directoryReady = await loadDirectory(1, null, true);
      if (sequence !== state.loadSequence || !directoryReady) return;
      await openDirectoryDeepLink();
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
    elements.directoryAccessRetry.addEventListener('click', loadDirectoryAccess);
    bindRankingToggle(elements.sectorToggle, 'sectorExpanded', 'bySector', elements.sectorBars, elements.sectorSummary, 'categorías');
    bindRankingToggle(elements.costToggle, 'costExpanded', 'byCostCenter', elements.costBars, elements.costSummary, 'categorías');
    bindRankingToggle(elements.agreementToggle, 'agreementExpanded', 'byAgreement', elements.agreementBars, elements.agreementSummary, 'categorías');
    elements.openDirectoryAction.addEventListener('click', function () {
      elements.peopleDirectory.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (state.directory.access === 'ready') elements.directorySearch.focus({ preventScroll: true });
    });
    elements.compareGroupsAction.addEventListener('click', expandAllRankings);
    elements.directoryForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.directory.access !== 'denied' && state.directory.access !== 'invalid') loadDirectory(1, null, true);
    });
    elements.directoryPrivateAccess.addEventListener('click', function () {
      if (typeof global.doLogout === 'function') global.doLogout('rrhh.html#peopleDirectory', 'private-grh');
      else global.location.assign('/login.html?access=private-grh&return=rrhh.html%23peopleDirectory');
    });
    elements.directoryReset.addEventListener('click', function () {
      elements.directoryForm.reset();
      if (state.directory.access !== 'denied' && state.directory.access !== 'invalid') loadDirectory(1, null, true);
    });
    elements.directoryPrevious.addEventListener('click', function () {
      if (state.directory.page > 1) {
        var previousPage = state.directory.page - 1;
        loadDirectory(previousPage, state.directory.cursors[previousPage] || null);
      }
    });
    elements.directoryNext.addEventListener('click', function () {
      if (state.directory.hasNext) loadDirectory(state.directory.page + 1, state.directory.nextCursor);
    });
    elements.directoryTableBody.addEventListener('click', directoryOpenFromEvent);
    elements.directoryMobileList.addEventListener('click', directoryOpenFromEvent);
    elements.personDialogClose.addEventListener('click', closePersonDialog);
    elements.personDialog.addEventListener('click', function (event) {
      if (event.target === elements.personDialog) closePersonDialog();
    });
  }

  async function init() {
    cacheElements();
    bindEvents();
    state.directory.deepLink = parseDirectoryDeepLink();
    if (!await requirePageCapability()) return;
    await loadDashboard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
