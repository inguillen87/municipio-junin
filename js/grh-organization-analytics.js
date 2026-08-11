(function bootstrapOrganizationAnalytics(global) {
  'use strict';

  var ENDPOINT = '/api/grh-organization-analytics';
  var CONTRACT = 'grh-organization-analytics-v1';
  var PAGE_CAPABILITY = 'navigation.organization-analytics';
  var PRIVACY_THRESHOLD = 10;
  var REQUEST_TIMEOUT_MS = 15000;
  var MAX_RANKING_ROWS = 12;
  var MAX_MATRIX_DIMENSIONS = 8;
  var MAX_MATRIX_CELLS = MAX_MATRIX_DIMENSIONS * MAX_MATRIX_DIMENSIONS;
  var currentRequest = null;
  var currentPayload = null;
  var capabilities = [];

  function byId(id) { return document.getElementById(id); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function replaceChildren(target, children) {
    if (!target) return;
    var nodes = Array.isArray(children) ? children : [children];
    target.replaceChildren.apply(target, nodes.filter(Boolean));
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var actual = Object.keys(value).sort();
    var keys = expected.slice().sort();
    return actual.length === keys.length && actual.every(function(key, index) {
      return key === keys[index];
    });
  }

  function safeText(value, maximum, nullable) {
    if (nullable && value === null) return true;
    return typeof value === 'string' && value === value.trim() && value.length > 0 &&
      value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function percentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function dateValue(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T00:00:00Z'));
  }

  function sha256(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }

  function validSource(value) {
    return exactKeys(value, ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf']) &&
      safeText(value.canonicalSystem, 100, false) && safeText(value.sourceFile, 240, false) &&
      value.sourceFile.endsWith('.sql.gz') && !/[\\/]/u.test(value.sourceFile) &&
      sha256(value.sourceSha256) && dateValue(value.snapshotAsOf);
  }

  function validPrivacy(value) {
    return exactKeys(value, [
      'threshold', 'containsPii', 'identifiersExported',
      'labelsProtectedBeforeRanking', 'complementarySuppression'
    ]) && value.threshold === PRIVACY_THRESHOLD && value.containsPii === false &&
      value.identifiersExported === false && value.labelsProtectedBeforeRanking === true &&
      value.complementarySuppression === true;
  }

  function validCoverageMetric(value, total) {
    return exactKeys(value, ['records', 'sharePct']) && nonNegativeInteger(value.records) &&
      value.records <= total && percentage(value.sharePct) &&
      value.sharePct === Number((total === 0 ? 0 : value.records / total * 100).toFixed(4));
  }

  function validCoverage(value) {
    if (!exactKeys(value, [
      'registeredRecords', 'withOrganization', 'withSector', 'withOrganizationAndSector',
      'withAbsenceHistory', 'absenceEvents'
    ]) || !positiveInteger(value.registeredRecords) || !nonNegativeInteger(value.absenceEvents)) return false;
    if (!['withOrganization', 'withSector', 'withOrganizationAndSector', 'withAbsenceHistory']
      .every(function(name) { return validCoverageMetric(value[name], value.registeredRecords); })) return false;
    return value.withOrganizationAndSector.records <= value.withOrganization.records &&
      value.withOrganizationAndSector.records <= value.withSector.records &&
      value.absenceEvents >= value.withAbsenceHistory.records &&
      value.withAbsenceHistory.records >= PRIVACY_THRESHOLD;
  }

  function validRankingRow(value, denominator, shareMode) {
    if (!exactKeys(value, [
      'code', 'label', 'registeredRecords', 'sharePct', 'recordsWithAbsence',
      'absenceEvents', 'eventsPerRegisteredRecord', 'absencePrivacyStatus', 'privacyStatus'
    ]) || !safeText(value.label, 200, false) || !nonNegativeInteger(value.registeredRecords) ||
        value.registeredRecords < PRIVACY_THRESHOLD || value.registeredRecords > denominator ||
        !['released', 'protected'].includes(value.absencePrivacyStatus) ||
        !['released', 'protected_aggregate', 'suppressed'].includes(value.privacyStatus)) return false;
    if (value.privacyStatus === 'released') {
      if (!nonNegativeInteger(value.code)) return false;
    } else if (value.code !== null || value.label !== 'Otros grupos protegidos') return false;
    if (shareMode !== 'events' || value.absencePrivacyStatus === 'released') {
      var numerator = shareMode === 'events' ? value.absenceEvents : value.registeredRecords;
      if (!percentage(value.sharePct) || value.sharePct !== Number((numerator / denominator * 100).toFixed(4))) return false;
    } else if (value.sharePct !== null) return false;
    if (value.absencePrivacyStatus === 'protected') {
      return value.recordsWithAbsence === null && value.absenceEvents === null &&
        value.eventsPerRegisteredRecord === null;
    }
    return nonNegativeInteger(value.recordsWithAbsence) && value.recordsWithAbsence >= PRIVACY_THRESHOLD &&
      value.recordsWithAbsence <= value.registeredRecords && nonNegativeInteger(value.absenceEvents) &&
      value.absenceEvents >= value.recordsWithAbsence && Number.isFinite(value.eventsPerRegisteredRecord) &&
      value.eventsPerRegisteredRecord >= 0 &&
      value.eventsPerRegisteredRecord === Number((value.absenceEvents / value.registeredRecords).toFixed(4));
  }

  function validRankingRows(value, denominator, shareMode, absenceOrder) {
    if (!Array.isArray(value) || value.length > MAX_RANKING_ROWS + 1) return false;
    var codes = new Set();
    var previous = Number.POSITIVE_INFINITY;
    return value.every(function(row) {
      if (!validRankingRow(row, denominator, shareMode)) return false;
      var identity = row.code === null ? 'protected_aggregate' : row.code;
      if (codes.has(identity)) return false;
      var orderValue = absenceOrder ? row.recordsWithAbsence : row.registeredRecords;
      if (row.privacyStatus === 'released' && orderValue !== null && orderValue > previous) return false;
      codes.add(identity);
      if (row.privacyStatus === 'released' && orderValue !== null) previous = orderValue;
      return true;
    });
  }

  function validDimensionRanking(value, expectedDimension, denominator) {
    if (!exactKeys(value, [
      'dimension', 'denominatorRecords', 'categoryCount', 'releasedCategoryCount',
      'protectedCategoryCount', 'rows'
    ]) || value.dimension !== expectedDimension || value.denominatorRecords !== denominator ||
      !nonNegativeInteger(value.categoryCount) || !nonNegativeInteger(value.releasedCategoryCount) ||
      !nonNegativeInteger(value.protectedCategoryCount) ||
      value.releasedCategoryCount + value.protectedCategoryCount !== value.categoryCount ||
      !validRankingRows(value.rows, denominator, 'records', false) ||
      value.rows.some(function(row) { return row.absencePrivacyStatus !== 'protected'; })) return false;
    var protectedRows = value.rows.filter(function(row) { return row.code === null; }).length;
    var releasedRows = value.rows.filter(function(row) { return row.code !== null; }).length;
    return value.rows.length === value.releasedCategoryCount + (value.protectedCategoryCount > 0 ? 1 : 0) &&
      releasedRows === value.releasedCategoryCount && protectedRows === (value.protectedCategoryCount > 0 ? 1 : 0) &&
      value.rows.reduce(function(sum, row) { return sum + row.registeredRecords; }, 0) === denominator;
  }

  function validAbsenceRanking(value, coverage) {
    if (!exactKeys(value, [
      'historical', 'denominatorRecords', 'recordsWithAbsence', 'absenceEvents', 'rows'
    ]) || value.historical !== true || value.denominatorRecords !== coverage.registeredRecords ||
      value.recordsWithAbsence !== coverage.withAbsenceHistory.records ||
      value.absenceEvents !== coverage.absenceEvents || !Array.isArray(value.rows) || !value.rows.length ||
      !validRankingRows(value.rows, value.absenceEvents, 'events', true) ||
      value.rows.some(function(row) { return row.absencePrivacyStatus !== 'released'; })) return false;
    return value.rows.reduce(function(sum, row) { return sum + row.registeredRecords; }, 0) === value.denominatorRecords &&
      value.rows.reduce(function(sum, row) { return sum + row.recordsWithAbsence; }, 0) === value.recordsWithAbsence &&
      value.rows.reduce(function(sum, row) { return sum + row.absenceEvents; }, 0) === value.absenceEvents;
  }

  function validDimension(value) {
    return exactKeys(value, ['code', 'label']) && nonNegativeInteger(value.code) && safeText(value.label, 200, false);
  }

  function validDimensions(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MATRIX_DIMENSIONS) return false;
    var codes = new Set();
    return value.every(function(item) {
      if (!validDimension(item) || codes.has(item.code)) return false;
      codes.add(item.code);
      return true;
    });
  }

  function validMatrixCell(value, organizationCodes, sectorCodes, maxRecords) {
    if (!exactKeys(value, ['organizationCode', 'sectorCode', 'registeredRecords', 'privacyStatus']) ||
        !organizationCodes.has(value.organizationCode) || !sectorCodes.has(value.sectorCode) ||
        !['released', 'primary_suppressed', 'complementary_suppressed', 'not_observed'].includes(value.privacyStatus)) return false;
    if (value.privacyStatus === 'primary_suppressed' || value.privacyStatus === 'complementary_suppressed') {
      return value.registeredRecords === null;
    }
    if (!nonNegativeInteger(value.registeredRecords) || value.registeredRecords > maxRecords) return false;
    if (value.privacyStatus === 'not_observed') return value.registeredRecords === 0;
    return value.privacyStatus === 'released' && value.registeredRecords >= PRIVACY_THRESHOLD;
  }

  function validMatrix(value) {
    if (!exactKeys(value, [
      'rowDimension', 'columnDimension', 'rows', 'columns', 'cells', 'releasedCellCount',
      'protectedCellCount', 'maxReleasedRecords'
    ]) || value.rowDimension !== 'organization' || value.columnDimension !== 'sector' ||
        !validDimensions(value.rows) || !validDimensions(value.columns) ||
        !nonNegativeInteger(value.maxReleasedRecords) || !nonNegativeInteger(value.releasedCellCount) ||
        !nonNegativeInteger(value.protectedCellCount) || !Array.isArray(value.cells) ||
        value.cells.length > MAX_MATRIX_CELLS ||
        value.cells.length !== value.rows.length * value.columns.length) return false;
    var organizationCodes = new Set(value.rows.map(function(item) { return item.code; }));
    var sectorCodes = new Set(value.columns.map(function(item) { return item.code; }));
    var identities = new Set();
    var released = 0;
    var protectedCells = 0;
    var maximum = 0;
    var rowUnknown = new Map(value.rows.map(function(item) { return [item.code, 0]; }));
    var columnUnknown = new Map(value.columns.map(function(item) { return [item.code, 0]; }));
    var valid = value.cells.every(function(cell) {
      var identity = String(cell && cell.organizationCode) + ':' + String(cell && cell.sectorCode);
      if (identities.has(identity) || !validMatrixCell(cell, organizationCodes, sectorCodes, value.maxReleasedRecords)) return false;
      identities.add(identity);
      if (cell.privacyStatus === 'released') {
        released += 1;
        maximum = Math.max(maximum, cell.registeredRecords);
      }
      if (cell.privacyStatus === 'primary_suppressed' || cell.privacyStatus === 'complementary_suppressed') {
        protectedCells += 1;
        rowUnknown.set(cell.organizationCode, rowUnknown.get(cell.organizationCode) + 1);
        columnUnknown.set(cell.sectorCode, columnUnknown.get(cell.sectorCode) + 1);
      }
      return true;
    });
    return valid && identities.size === value.rows.length * value.columns.length &&
      released === value.releasedCellCount && protectedCells === value.protectedCellCount &&
      maximum === value.maxReleasedRecords &&
      Array.from(rowUnknown.values()).every(function(count) { return count !== 1; }) &&
      Array.from(columnUnknown.values()).every(function(count) { return count !== 1; });
  }

  function validQuality(value, coverage, source) {
    var total = coverage.registeredRecords;
    var integerKeys = [
      'missingOrganizationRecords', 'missingSectorRecords', 'missingBothRecords',
      'invalidEmployeeKeyRows', 'unmatchedPersonRecords', 'validAbsenceEvents',
      'quarantinedAbsenceEvents', 'linkedAbsenceEvents', 'unlinkedValidAbsenceEvents',
      'codedPositionRecords', 'positionObservationRecords', 'futureEffectivePositionObservationRecords'
    ];
    if (!exactKeys(value, integerKeys.concat(['firstFuturePositionDate', 'lastFuturePositionDate'])) ||
        !integerKeys.every(function(name) { return nonNegativeInteger(value[name]); }) ||
        value.missingOrganizationRecords > total || value.missingSectorRecords > total ||
        value.missingBothRecords > value.missingOrganizationRecords ||
        value.missingBothRecords > value.missingSectorRecords ||
        value.unmatchedPersonRecords > total || value.codedPositionRecords > total ||
        value.positionObservationRecords > total ||
        value.futureEffectivePositionObservationRecords > value.positionObservationRecords ||
        value.missingOrganizationRecords + coverage.withOrganization.records !== total ||
        value.missingSectorRecords + coverage.withSector.records !== total ||
        coverage.withOrganizationAndSector.records !== total - value.missingOrganizationRecords -
          value.missingSectorRecords + value.missingBothRecords ||
        value.linkedAbsenceEvents !== coverage.absenceEvents ||
        value.linkedAbsenceEvents + value.unlinkedValidAbsenceEvents !== value.validAbsenceEvents) return false;
    if (value.futureEffectivePositionObservationRecords === 0) {
      return value.firstFuturePositionDate === null && value.lastFuturePositionDate === null;
    }
    return dateValue(value.firstFuturePositionDate) && dateValue(value.lastFuturePositionDate) &&
      value.firstFuturePositionDate > source.snapshotAsOf &&
      value.firstFuturePositionDate <= value.lastFuturePositionDate;
  }

  function validLimits(value) {
    var expected = [
      'snapshot_historical',
      'registered_records_not_active_workforce',
      'absence_events_not_absence_rate',
      'absence_events_not_causal',
      'positions_not_current_hierarchy',
      'no_realtime'
    ];
    return Array.isArray(value) && value.length === expected.length &&
      value.every(function(item, index) { return item === expected[index]; });
  }

  function validActions(value) {
    var expected = [
      ['open_people_directory', 'Abrir Gestión de personas', '/rrhh#peopleDirectory', 'navigation.rrhh'],
      ['review_absence_records', 'Revisar legajos con ausencias', '/rrhh?hasAbsence=true#peopleDirectory', 'navigation.rrhh'],
      ['open_data_quality', 'Revisar calidad de datos', '/calidad', 'navigation.data-quality'],
      ['export_executive_report', 'Abrir reportes ejecutivos', '/reportes', 'navigation.reports']
    ];
    return Array.isArray(value) && value.length === expected.length && value.every(function(action, index) {
      return exactKeys(action, ['id', 'label', 'href', 'requiredCapability']) &&
        action.id === expected[index][0] && action.label === expected[index][1] &&
        action.href === expected[index][2] && action.requiredCapability === expected[index][3];
    });
  }

  function validPayload(value) {
    if (!exactKeys(value, [
      'schemaVersion', 'source', 'privacy', 'coverage', 'organizations', 'sectors',
      'matrix', 'absenceRanking', 'dataQuality', 'actions', 'limits'
    ]) || value.schemaVersion !== CONTRACT || !validSource(value.source) ||
      !validPrivacy(value.privacy) || !validCoverage(value.coverage) ||
        !validDimensionRanking(value.organizations, 'organization', value.coverage.withOrganization.records) ||
        !validDimensionRanking(value.sectors, 'sector', value.coverage.withSector.records) ||
        !validAbsenceRanking(value.absenceRanking, value.coverage) ||
        !validMatrix(value.matrix) || !validQuality(value.dataQuality, value.coverage, value.source) ||
        !validActions(value.actions) || !validLimits(value.limits)) return false;

    var organizationCodes = new Set(value.organizations.rows.filter(function(row) { return row.code !== null; }).map(function(row) { return row.code; }));
    var sectorCodes = new Set(value.sectors.rows.filter(function(row) { return row.code !== null; }).map(function(row) { return row.code; }));
    return value.matrix.rows.every(function(item) { return organizationCodes.has(item.code); }) &&
      value.matrix.columns.every(function(item) { return sectorCodes.has(item.code); });
  }

  function formatInteger(value) {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
  }

  function formatPercent(value) {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value) + '%';
  }

  function shortDate(value) {
    var parts = String(value).split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : value;
  }

  function emptyState(copy) {
    return element('div', 'structure-empty', copy);
  }

  function setStatus(state, copy) {
    var status = byId('organizationSnapshotStatus');
    if (!status) return;
    status.dataset.state = state;
    var label = status.querySelector('span:last-child');
    if (label) label.textContent = copy;
  }

  function showLoading() {
    byId('organizationAnalyticsLoading').hidden = false;
    byId('organizationAnalyticsError').hidden = true;
    byId('structureDashboard').hidden = true;
    setStatus('loading', 'Validando contrato');
  }

  function showError(title, message, state) {
    byId('organizationAnalyticsLoading').hidden = true;
    byId('structureDashboard').hidden = true;
    var panel = byId('organizationAnalyticsError');
    byId('organizationAnalyticsErrorTitle').textContent = title;
    byId('organizationAnalyticsErrorMessage').textContent = message;
    panel.hidden = false;
    setStatus(state || 'error', state === 'denied' ? 'Acceso no habilitado' : 'Contrato no disponible');
    panel.focus({ preventScroll: true });
  }

  function hasCapability(capability) {
    return capabilities.includes(capability);
  }

  function currentCapabilities() {
    var projection = global.MuniAccess && typeof global.MuniAccess.getValidatedSession === 'function'
      ? global.MuniAccess.getValidatedSession()
      : null;
    if (!projection || !Array.isArray(projection.capabilities)) return [];
    return projection.capabilities.filter(function(capability, index, all) {
      return typeof capability === 'string' && all.indexOf(capability) === index;
    });
  }

  function renderActions(actions) {
    var links = actions.filter(function(action) {
      return hasCapability(action.requiredCapability);
    }).map(function(action, index) {
      var link = element('a', 'structure-action' + (index === 0 ? ' primary' : ''), action.label);
      link.href = action.href;
      link.dataset.analyticsAction = action.id;
      link.dataset.capability = action.requiredCapability;
      return link;
    });
    replaceChildren(byId('organizationAnalyticsActions'), links);
  }

  function coverageCard(label, value, detail) {
    var card = element('article', 'structure-kpi');
    card.append(
      element('span', 'structure-kpi-label', label),
      element('strong', 'structure-kpi-value', value),
      element('span', 'structure-kpi-detail', detail)
    );
    return card;
  }

  function renderKpis(payload) {
    var coverage = payload.coverage;
    replaceChildren(byId('analyticsKpis'), [
      coverageCard('Registros del directorio', formatInteger(coverage.registeredRecords), 'Universo del contrato privado'),
      coverageCard('Cobertura organización', formatPercent(coverage.withOrganization.sharePct), formatInteger(coverage.withOrganization.records) + ' registros'),
      coverageCard('Cobertura sector', formatPercent(coverage.withSector.sharePct), formatInteger(coverage.withSector.records) + ' registros'),
      coverageCard('Cruce organización + sector', formatPercent(coverage.withOrganizationAndSector.sharePct), formatInteger(coverage.withOrganizationAndSector.records) + ' registros'),
      coverageCard('Cobertura con ausencias', formatPercent(coverage.withAbsenceHistory.sharePct), formatInteger(coverage.withAbsenceHistory.records) + ' registros históricos')
    ]);
  }

  function directoryHref(dimension, code) {
    var parameter = dimension === 'organization' ? 'organization' : 'sector';
    return 'rrhh.html?' + parameter + '=' + encodeURIComponent(String(code)) + '&hasAbsence=true#peopleDirectory';
  }

  function renderRanking(targetId, rows, dimension) {
    var target = byId(targetId);
    if (!rows.length) {
      replaceChildren(target, emptyState('Sin grupos liberados para esta dimensión.'));
      return;
    }
    var maximum = Math.max.apply(Math, rows.map(function(row) { return row.registeredRecords; }));
    var nodes = rows.map(function(row) {
      var item = element('div', 'structure-bar');
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', row.label + ': ' + formatInteger(row.registeredRecords) + ' registros observados');
      var label = element('span', 'structure-bar-label', row.label);
      label.title = row.label;
      var track = element('span', 'structure-bar-track');
      var fill = element('span', 'structure-bar-fill');
      fill.style.width = (maximum === 0 ? 0 : row.registeredRecords / maximum * 100) + '%';
      track.appendChild(fill);
      var value = element('strong', 'structure-bar-value', formatInteger(row.registeredRecords) + ' · ' + formatPercent(row.sharePct));
      item.append(label, track, value);
      if (hasCapability('navigation.rrhh') && row.privacyStatus === 'released' && row.code !== null) {
        var action = element('a', 'structure-bar-action', 'Ver legajos');
        action.href = directoryHref(dimension, row.code);
        action.dataset.analyticsDeepLink = dimension;
        action.dataset.groupCode = row.code;
        item.appendChild(action);
      }
      return item;
    });
    replaceChildren(target, nodes);
  }

  function matrixLevel(records, maximum) {
    if (!records || !maximum) return 0;
    return Math.max(1, Math.min(4, Math.ceil(records / maximum * 4)));
  }

  function renderMatrix(matrix) {
    var target = byId('organizationSectorMatrix');
    if (!matrix.rows.length || !matrix.columns.length) {
      replaceChildren(target, emptyState('La fuente no publicó intersecciones organizativas.'));
      target.style.gridTemplateColumns = '1fr';
      return;
    }
    target.style.gridTemplateColumns = '146px repeat(' + matrix.columns.length + ', 64px)';
    var cellMap = new Map(matrix.cells.map(function(cell) {
      return [cell.organizationCode + ':' + cell.sectorCode, cell];
    }));
    var nodes = [element('div', 'structure-matrix-cell structure-matrix-label', 'Organización')];
    nodes[0].setAttribute('role', 'columnheader');
    matrix.columns.forEach(function(sector) {
      var header = element('div', 'structure-matrix-cell structure-matrix-column', sector.label);
      header.setAttribute('role', 'columnheader');
      header.title = sector.label;
      nodes.push(header);
    });
    matrix.rows.forEach(function(organization) {
      var rowHeader = element('div', 'structure-matrix-cell structure-matrix-label', organization.label);
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.title = organization.label;
      nodes.push(rowHeader);
      matrix.columns.forEach(function(sector) {
        var value = cellMap.get(organization.code + ':' + sector.code);
        var released = value && value.privacyStatus === 'released';
        var protectedCell = value && (value.privacyStatus === 'primary_suppressed' || value.privacyStatus === 'complementary_suppressed');
        var notObserved = value && value.privacyStatus === 'not_observed';
        var copy = released ? formatInteger(value.registeredRecords) : (protectedCell ? 'Protegido' : (notObserved ? '0' : '—'));
        var cell = element('div', 'structure-matrix-cell', copy);
        cell.setAttribute('role', 'gridcell');
        cell.dataset.level = released ? String(matrixLevel(value.registeredRecords, matrix.maxReleasedRecords)) : '0';
        cell.setAttribute('aria-label', organization.label + ', ' + sector.label + ': ' +
          (released ? formatInteger(value.registeredRecords) + ' registros observados' : copy));
        nodes.push(cell);
      });
    });
    replaceChildren(target, nodes);
    byId('organizationSectorMatrixScale').textContent = 'Máx. ' + formatInteger(matrix.maxReleasedRecords);
  }

  function renderAbsenceRanking(rows) {
    var target = byId('absenceRanking');
    if (!rows.length) {
      replaceChildren(target, emptyState('Sin grupos históricos liberados.'));
      byId('absenceRankingPeriod').textContent = 'Histórico acumulado';
      return;
    }
    var nodes = rows.map(function(row, index) {
      var item = element('article', 'structure-absence-item');
      item.appendChild(element('span', 'structure-rank', String(index + 1).padStart(2, '0')));
      var copy = element('div', 'structure-absence-copy');
      if (row.absencePrivacyStatus === 'protected') {
        copy.append(element('strong', '', row.label), element('span', '', 'Ausencias protegidas por privacidad'));
        item.append(copy, element('strong', 'structure-absence-value', '—'));
      } else {
        copy.append(
          element('strong', '', row.label),
          element('span', '', formatInteger(row.recordsWithAbsence) + ' registros con eventos')
        );
        item.append(copy, element('strong', 'structure-absence-value', formatInteger(row.absenceEvents) + ' eventos'));
      }
      return item;
    });
    replaceChildren(target, nodes);
    var released = rows.filter(function(row) { return row.absencePrivacyStatus === 'released'; });
    byId('absenceRankingPeriod').textContent = released.length ? 'Histórico acumulado · top ' + released.length : 'Protegido';
  }

  function qualityRow(label, value, detail, tone) {
    var item = element('div', 'structure-quality-item');
    item.dataset.tone = tone;
    var copy = element('div');
    copy.append(element('strong', '', label), element('span', '', detail));
    item.append(copy, element('span', 'structure-quality-value', formatInteger(value)));
    return item;
  }

  function renderQuality(quality) {
    var hasSignals = quality.missingOrganizationRecords > 0 || quality.missingSectorRecords > 0 ||
      quality.invalidEmployeeKeyRows > 0 || quality.unmatchedPersonRecords > 0 ||
      quality.quarantinedAbsenceEvents > 0 || quality.unlinkedValidAbsenceEvents > 0;
    var rows = [
      qualityRow('Sin organización', quality.missingOrganizationRecords, 'Registros sin dimensión utilizable', quality.missingOrganizationRecords ? 'warning' : 'ok'),
      qualityRow('Sin sector', quality.missingSectorRecords, 'Registros sin dimensión utilizable', quality.missingSectorRecords ? 'warning' : 'ok'),
      qualityRow('Sin ambas dimensiones', quality.missingBothRecords, 'Intersección faltante', quality.missingBothRecords ? 'critical' : 'ok'),
      qualityRow('Persona no vinculada', quality.unmatchedPersonRecords, 'Cruce nominal no resuelto', quality.unmatchedPersonRecords ? 'warning' : 'ok'),
      qualityRow('Claves inválidas', quality.invalidEmployeeKeyRows, 'Excluidas del contrato', quality.invalidEmployeeKeyRows ? 'critical' : 'ok'),
      qualityRow('Ausencias en cuarentena', quality.quarantinedAbsenceEvents, 'Eventos fuera del contrato publicado', quality.quarantinedAbsenceEvents ? 'warning' : 'ok'),
      qualityRow('Ausencias válidas sin vínculo', quality.unlinkedValidAbsenceEvents, 'Eventos sin legajo resuelto', quality.unlinkedValidAbsenceEvents ? 'warning' : 'ok')
    ];
    replaceChildren(byId('qualityPanel'), rows);
    byId('qualityPanelState').textContent = hasSignals ? 'Revisar faltantes' : 'Sin faltantes';
  }

  function renderFutureObservations(value) {
    var panel = byId('futureObservationPanel');
    var count = value.futureEffectivePositionObservationRecords;
    panel.hidden = count === 0;
    if (!count) {
      replaceChildren(byId('futureObservationAlerts'), []);
      return;
    }
    var alert = element('article', 'structure-alert');
    alert.append(
      element('strong', '', formatInteger(count) + ' observaciones posteriores al corte'),
      element('span', '', shortDate(value.firstFuturePositionDate) + ' a ' + shortDate(value.lastFuturePositionDate) + ' · no se presentan como cargos actuales')
    );
    replaceChildren(byId('futureObservationAlerts'), alert);
    byId('futureObservationCount').textContent = formatInteger(count);
  }

  function dimensionRows(name) {
    if (!currentPayload) return [];
    var rows = name === 'sector' ? currentPayload.sectors.rows : currentPayload.organizations.rows;
    return rows.filter(function(row) { return row.privacyStatus === 'released' && row.code !== null; });
  }

  function optionFor(value, label) {
    var option = element('option', '', label);
    option.value = String(value);
    return option;
  }

  function populateComparisonGroups() {
    var dimension = byId('comparisonDimension').value;
    var rows = dimensionRows(dimension);
    var options = rows.map(function(row) { return optionFor(row.code, row.label); });
    replaceChildren(byId('comparisonLeft'), options.map(function(option) { return option.cloneNode(true); }));
    replaceChildren(byId('comparisonRight'), options.map(function(option) { return option.cloneNode(true); }));
    if (rows.length > 1) byId('comparisonRight').selectedIndex = 1;
    renderComparison();
  }

  function comparisonCard(row) {
    var card = element('article', 'structure-comparison-card');
    card.append(
      element('strong', '', row.label),
      element('span', '', formatPercent(row.sharePct) + ' de los registros publicados'),
      element('b', '', formatInteger(row.registeredRecords)),
      element('span', '', row.absencePrivacyStatus === 'released'
        ? formatInteger(row.recordsWithAbsence) + ' registros con ' + formatInteger(row.absenceEvents) + ' eventos históricos'
        : 'Datos históricos de ausencia protegidos')
    );
    if (hasCapability('navigation.rrhh')) {
      var action = element('a', 'structure-action', 'Ver legajos');
      action.href = directoryHref(byId('comparisonDimension').value, row.code);
      action.dataset.analyticsDeepLink = byId('comparisonDimension').value;
      action.dataset.groupCode = row.code;
      card.appendChild(action);
    }
    return card;
  }

  function renderComparison() {
    var dimension = byId('comparisonDimension').value;
    var rows = dimensionRows(dimension);
    var leftCode = byId('comparisonLeft').value;
    var rightCode = byId('comparisonRight').value;
    var left = rows.find(function(row) { return String(row.code) === leftCode; });
    var right = rows.find(function(row) { return String(row.code) === rightCode; });
    if (!left || !right) {
      replaceChildren(byId('comparisonResult'), emptyState('Elegí dos grupos publicados para comparar.'));
      return;
    }
    replaceChildren(byId('comparisonResult'), [comparisonCard(left), comparisonCard(right)]);
  }

  function bindComparison(payload) {
    currentPayload = payload;
    replaceChildren(byId('comparisonDimension'), [
      optionFor('organization', 'Organización'),
      optionFor('sector', 'Sector')
    ]);
    byId('comparisonDimension').onchange = populateComparisonGroups;
    byId('comparisonLeft').onchange = renderComparison;
    byId('comparisonRight').onchange = renderComparison;
    populateComparisonGroups();
  }

  function render(payload) {
    byId('organizationAnalyticsLoading').hidden = true;
    byId('organizationAnalyticsError').hidden = true;
    byId('structureDashboard').hidden = false;
    byId('organizationAnalyticsContract').textContent = payload.schemaVersion;
    byId('organizationAnalyticsSource').textContent = payload.source.canonicalSystem + ' · corte ' + shortDate(payload.source.snapshotAsOf);
    setStatus('ready', 'Snapshot verificado');
    renderKpis(payload);
    renderRanking('organizationRanking', payload.organizations.rows, 'organization');
    renderRanking('sectorRanking', payload.sectors.rows, 'sector');
    byId('organizationRankingCount').textContent = formatInteger(payload.organizations.releasedCategoryCount) + ' grupos';
    byId('sectorRankingCount').textContent = formatInteger(payload.sectors.releasedCategoryCount) + ' grupos';
    renderMatrix(payload.matrix);
    renderAbsenceRanking(payload.absenceRanking.rows);
    renderQuality(payload.dataQuality);
    renderFutureObservations(payload.dataQuality);
    bindComparison(payload);
    renderActions(payload.actions);
    var limitCopy = {
      snapshot_historical: 'Snapshot histórico',
      registered_records_not_active_workforce: 'Legajos registrados, no dotación vigente',
      absence_events_not_absence_rate: 'Eventos históricos, no indicador porcentual',
      absence_events_not_causal: 'Sin atribución de motivos',
      positions_not_current_hierarchy: 'Observaciones de cargo, no jerarquía vigente',
      no_realtime: 'Sin actualización en tiempo real'
    };
    byId('organizationAnalyticsCaveat').textContent = payload.limits.map(function(limit) {
      return limitCopy[limit];
    }).join(' · ');
  }

  function contractError(code, status) {
    var error = new Error(code);
    error.code = code;
    error.status = status || 0;
    return error;
  }

  async function requestPayload() {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw contractError('AUTH_CHANNEL_UNAVAILABLE');
    }
    currentRequest = new AbortController();
    var timeout = global.setTimeout(function() { currentRequest.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: currentRequest.signal
      });
      if (response.status === 403) throw contractError('ACCESS_DENIED', 403);
      if (response.status === 503) throw contractError('SOURCE_UNAVAILABLE', 503);
      if (!response.ok) throw contractError('REQUEST_FAILED', response.status);
      if (response.headers.get('X-MuniControl-Contract') !== CONTRACT ||
          !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) {
        throw contractError('CONTRACT_HEADER_INVALID');
      }
      var payload = await response.json();
      if (!validPayload(payload)) throw contractError('CONTRACT_BODY_INVALID');
      return payload;
    } finally {
      global.clearTimeout(timeout);
      currentRequest = null;
    }
  }

  function handleFailure(error) {
    if (global.MuniAuth && typeof global.MuniAuth.isAuthError === 'function' && global.MuniAuth.isAuthError(error)) return;
    if (error && error.code === 'ACCESS_DENIED') {
      showError('Acceso no habilitado', 'Tu perfil o municipio no puede consultar esta proyección organizativa.', 'denied');
      return;
    }
    if (error && error.code === 'SOURCE_UNAVAILABLE') {
      showError('Fuente temporalmente no disponible', 'No se reemplazó el contrato GRH con datos demo. Reintentá cuando la fuente esté disponible.', 'error');
      return;
    }
    if (error && error.name === 'AbortError') {
      showError('La validación demoró demasiado', 'La consulta fue cancelada. Podés reintentar manualmente.', 'error');
      return;
    }
    showError('Respuesta no verificable', 'El header o el cuerpo no coincide con grh-organization-analytics-v1.', 'error');
  }

  async function loadDashboard() {
    if (currentRequest) currentRequest.abort();
    showLoading();
    if (typeof global.requireCapability !== 'function') {
      showError('Sesión no verificable', 'No se encontró la política de acceso de esta pantalla.', 'denied');
      return;
    }
    try {
      var allowed = await global.requireCapability(PAGE_CAPABILITY);
      if (allowed !== true) return;
      capabilities = currentCapabilities();
      if (!capabilities.includes(PAGE_CAPABILITY)) {
        showError('Acceso no verificable', 'La proyección de sesión no contiene la capability requerida.', 'denied');
        return;
      }
      render(await requestPayload());
    } catch (error) {
      handleFailure(error);
    }
  }

  function start() {
    var retry = byId('organizationAnalyticsRetry');
    if (retry) retry.addEventListener('click', loadDashboard);
    Promise.resolve(global.MuniAuthReady).then(function(authenticated) {
      if (authenticated !== true) return;
      loadDashboard();
    }).catch(function() {
      showError('Sesión no verificable', 'No se pudo validar la sesión institucional.', 'denied');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}(window));
