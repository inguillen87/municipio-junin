(function personasReviewBootstrap(global, documentRef) {
  'use strict';

  var NUMBER_FORMAT = new Intl.NumberFormat('es-AR');
  var DATE_FORMAT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  var DATETIME_FORMAT = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  var TAB_STATUS = Object.freeze({
    pending: 'PENDING',
    postponed: 'DEFERRED',
    approved: 'APPROVED',
    rejected: 'REJECTED'
  });
  var STATUS_COPY = Object.freeze({
    PENDING: 'Sugerencia para revisar',
    DEFERRED: 'Postergada',
    APPROVED: 'Vínculo aprobado',
    REJECTED: 'Sugerencia descartada'
  });
  var KIND_COPY = Object.freeze({
    CANDIDATE: 'Hay una persona sugerida por la comparación.',
    AMBIGUOUS: 'Hay más de una señal posible. Revisá cada dato con especial cuidado.',
    UNMATCHED: 'No hay una coincidencia suficiente. Podés confirmar que no existe o postergar.'
  });
  var PRIORITY_COPY = Object.freeze({
    DOCUMENT_CONFLICT: 'Los documentos informados son distintos.',
    MANUAL_REVIEW: 'La evidencia necesita revisión humana.',
    STANDARD: 'Compará la evidencia disponible antes de decidir.'
  });
  var EVIDENCE_COPY = Object.freeze({
    MATCH: ['Coincide', 'match'],
    CONFLICT: ['Distinto', 'different'],
    DIFFERENT: ['Distinto', 'different'],
    MISSING: ['Falta dato', 'missing']
  });
  var DNI_BACKUP_METHODS = Object.freeze(['UNIQUE_DNI_BACKUP', 'DUPLICATE_DNI_NAME']);
  var DECISION_CONFIG = Object.freeze({
    approve: {
      command: 'APPROVE', eyebrow: 'Aprobar vínculo', title: 'Confirmá que revisaste la evidencia',
      copy: 'Esta acción registra que la persona sugerida corresponde al registro de GRH. No cambia la ficha laboral ni mezcla las bases automáticamente.',
      submit: 'Aprobar vínculo', confirmation: true,
      reasons: [
        ['EVIDENCE_CONFIRMED', 'La evidencia coincide']
      ]
    },
    reject: {
      command: 'REJECT', eyebrow: 'Descartar sugerencia', title: 'Indicá por qué no corresponde',
      copy: 'La sugerencia quedará resuelta como descartada. GRH y PERSONAS seguirán separados para este caso.',
      submit: 'Descartar sugerencia', confirmation: false,
      reasons: [
        ['DIFFERENT_PERSON', 'Son personas distintas'],
        ['NO_MATCH_CONFIRMED', 'Confirmé que no hay una coincidencia válida']
      ]
    },
    postpone: {
      command: 'DEFER', eyebrow: 'Postergar revisión', title: 'Indicá qué falta verificar',
      copy: 'La sugerencia seguirá disponible para retomarla cuando exista mejor evidencia.',
      submit: 'Postergar sugerencia', confirmation: false,
      reasons: [
        ['INSUFFICIENT_EVIDENCE', 'La evidencia no alcanza'],
        ['SOURCE_DATA_REVIEW_REQUIRED', 'Hay que revisar la información de origen']
      ]
    }
  });
  var REASON_COPY = Object.freeze({
    EVIDENCE_CONFIRMED: 'La evidencia coincide',
    MANUAL_SOURCE_CHECK_CONFIRMED: 'Fuente municipal verificada manualmente',
    DIFFERENT_PERSON: 'Son personas distintas',
    NO_MATCH_CONFIRMED: 'No existe una coincidencia válida',
    INSUFFICIENT_EVIDENCE: 'La evidencia no alcanza',
    SOURCE_DATA_REVIEW_REQUIRED: 'Hace falta revisar la información de origen'
  });
  var DOCUMENT_CONFLICT_APPROVAL = Object.freeze({
    title: 'Confirmá la verificación manual',
    reasonLabel: 'Motivo obligatorio para aprobar',
    reasons: Object.freeze([
      Object.freeze(['MANUAL_SOURCE_CHECK_CONFIRMED', 'Verifiqué manualmente la fuente municipal y confirmo que es la misma persona'])
    ])
  });

  var state = {
    summary: null,
    tab: 'pending',
    queueItem: null,
    detail: null,
    optionIndex: 0,
    documentsVisible: false,
    documentsLoading: false,
    revealedDocuments: null,
    documentRevealTimer: null,
    activeDecision: null,
    approvalRequiresManualCheck: false,
    decisionTrigger: null,
    source: null,
    loadSequence: 0,
    casePageCursors: [null],
    casePageIndex: 0,
    nextCaseCursor: null
  };

  function byId(id) { return documentRef.getElementById(id); }
  function setText(id, value) { var node = byId(id); if (node) node.textContent = String(value); }
  function element(tag, className, text) {
    var node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function formatCount(value) { return NUMBER_FORMAT.format(value); }
  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'Falta dato';
    var parts = value.split('-').map(Number);
    return DATE_FORMAT.format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
  }
  function formatDateTime(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : DATETIME_FORMAT.format(date);
  }

  function arrangeOperationalLayout() {
    var workspace = byId('personasContent');
    var queue = byId('personasQueue');
    var summary = byId('personasSummary');
    if (workspace && queue && summary && queue.nextElementSibling !== summary) {
      workspace.insertBefore(queue, summary);
    }
  }

  function clearPrivateView() {
    clearRevealedDocuments(false);
    state.queueItem = null;
    state.detail = null;
    state.optionIndex = 0;
    state.documentsVisible = false;
    byId('grhEvidence').replaceChildren();
    byId('personasEvidence').replaceChildren();
    byId('evidenceSummary').replaceChildren();
    byId('personasCase').hidden = true;
    byId('personasReceipt').hidden = true;
  }

  function clearRevealedDocuments(render) {
    if (state.documentRevealTimer !== null) global.clearTimeout(state.documentRevealTimer);
    state.documentRevealTimer = null;
    state.documentsVisible = false;
    state.documentsLoading = false;
    state.revealedDocuments = null;
    if (render && state.detail) renderComparison();
  }

  function scheduleDocumentMask() {
    if (state.documentRevealTimer !== null) global.clearTimeout(state.documentRevealTimer);
    state.documentRevealTimer = global.setTimeout(function maskDocumentsAfterInactivity() {
      clearRevealedDocuments(true);
      setText('personasDocumentNotice', 'Los documentos se ocultaron automáticamente después de 60 segundos.');
    }, 60000);
  }

  function errorPresentation(error) {
    var status = Number(error && error.status) || 0;
    var code = String(error && error.code || '');
    if (status === 401) return {
      title: 'Ingresá con una cuenta privada',
      message: 'Esta revisión no forma parte de los recorridos públicos. Ingresá nuevamente con la cuenta privada autorizada.',
      login: true
    };
    if (status === 403) return {
      title: 'Tu cuenta no tiene acceso a esta revisión',
      message: 'Sólo el acceso privado autorizado de Intendencia o Administración municipal puede consultar y decidir estos casos.',
      login: true
    };
    if (status === 409) return {
      title: 'El caso cambió mientras lo revisabas',
      message: 'No registramos una segunda decisión. Volvé a cargar la cola para ver su estado actual.',
      login: false
    };
    if (status === 404) return {
      title: 'La sugerencia ya no está disponible',
      message: 'Puede haber sido resuelta o retirada de la cola. Actualizá la revisión para continuar.',
      login: false
    };
    if (status === 503) return {
      title: 'La revisión privada está temporalmente cerrada',
      message: 'No mostramos datos personales si la fuente, la auditoría o la base de revisión no pueden verificarse.',
      login: false
    };
    if (status === 400) return {
      title: 'No pudimos validar esta revisión',
      message: 'La solicitud no cumple el contrato privado. Actualizá la pantalla antes de volver a decidir.',
      login: false
    };
    if (code === 'PERSONAS_REVIEW_NETWORK_ERROR' || code === 'PERSONAS_REVIEW_TIMEOUT') return {
      title: 'No pudimos confirmar el estado de la revisión',
      message: 'Para evitar una decisión duplicada, no vuelvas a enviarla desde este caso. Actualizá la cola y verificá su estado antes de continuar.',
      login: false
    };
    return {
      title: 'La revisión no está disponible',
      message: 'No mostramos casos parciales ni información guardada en el navegador. Intentá nuevamente.',
      login: false
    };
  }

  function showError(error) {
    clearPrivateView();
    var copy = errorPresentation(error);
    byId('personasLoading').hidden = true;
    byId('personasContent').hidden = true;
    byId('personasError').hidden = false;
    byId('personasLogin').hidden = !copy.login;
    setText('personasErrorTitle', copy.title);
    setText('personasErrorMessage', copy.message);
    byId('personasReview').setAttribute('aria-busy', 'false');
    byId('personasError').focus({ preventScroll: true });
  }

  function showLoading() {
    clearPrivateView();
    byId('personasError').hidden = true;
    byId('personasContent').hidden = true;
    byId('personasLoading').hidden = false;
    byId('personasReview').setAttribute('aria-busy', 'true');
  }

  function renderSummary(summary) {
    state.summary = summary;
    var resolved = summary.byStatus.approved + summary.byStatus.rejected;
    var completed = summary.totalCases - summary.byStatus.pending - summary.byStatus.deferred;
    var progress = summary.totalCases === 0 ? 100 : Math.round((completed / summary.totalCases) * 100);
    setText('summaryPending', formatCount(summary.byStatus.pending));
    setText('summaryPostponed', formatCount(summary.byStatus.deferred));
    setText('summaryResolved', formatCount(resolved));
    setText('summaryAmbiguous', formatCount(summary.byKind.ambiguous));
    setText('personasSummaryCopy', formatCount(summary.totalCases) + ' casos privados: ' +
      formatCount(summary.byKind.candidate) + ' con una sugerencia de vínculo, ' +
      formatCount(summary.byKind.ambiguous) + ' ambiguos y ' +
      formatCount(summary.byKind.unmatched) + ' sin una opción suficiente. Ninguno se aprueba automáticamente.');
    setText('tabPendingCount', formatCount(summary.byStatus.pending));
    setText('tabPostponedCount', formatCount(summary.byStatus.deferred));
    setText('tabApprovedCount', formatCount(summary.byStatus.approved));
    setText('tabRejectedCount', formatCount(summary.byStatus.rejected));
    setText('personasProgressText', progress + '%');
    byId('personasProgress').max = Math.max(1, summary.totalCases);
    byId('personasProgress').value = completed;
    var conflictAlert = byId('documentConflictAlert');
    conflictAlert.hidden = summary.documentConflicts === 0;
    setText('documentConflictCount', formatCount(summary.documentConflicts));
  }

  function renderSourceContext(source) {
    state.source = source;
    setText('personasSourceContext', 'Datos al ' + formatDate(source.snapshotAsOf) +
      ' · respaldo histórico · no se actualiza en tiempo real');
  }

  function setTabs(active) {
    state.tab = active;
    resetCasePagination();
    documentRef.querySelectorAll('[data-queue-state]').forEach(function updateTab(button) {
      var selected = button.dataset.queueState === active;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    var selectedTab = documentRef.querySelector('[data-queue-state="' + active + '"]');
    byId('personasCasePanel').setAttribute('aria-labelledby', selectedTab.id);
  }

  function resetCasePagination() {
    state.casePageCursors = [null];
    state.casePageIndex = 0;
    state.nextCaseCursor = null;
  }

  function setCaseLoading(loading) {
    byId('personasCaseLoading').hidden = !loading;
    if (loading) {
      byId('personasCase').hidden = true;
      byId('personasEmpty').hidden = true;
      byId('personasReceipt').hidden = true;
    }
  }

  function renderEmpty() {
    clearPrivateView();
    byId('personasEmpty').hidden = false;
    var labels = {
      pending: ['No quedan sugerencias pendientes', 'Podés revisar las postergadas o consultar las decisiones ya resueltas.'],
      postponed: ['No hay sugerencias postergadas', 'Los casos que necesiten más evidencia aparecerán acá.'],
      approved: ['Todavía no hay sugerencias aprobadas', 'Los vínculos que ya confirmaste aparecerán acá.'],
      rejected: ['Todavía no hay sugerencias descartadas', 'Las sugerencias que determinaste que eran personas distintas aparecerán acá.']
    };
    setText('personasEmptyTitle', labels[state.tab][0]);
    setText('personasEmptyCopy', labels[state.tab][1]);
  }

  async function fetchQueueForTab(tab) {
    return global.MuniPersonasReviewData.loadQueue({
      status: TAB_STATUS[tab],
      limit: 1,
      cursor: state.casePageCursors[state.casePageIndex]
    });
  }

  function currentTabCount() {
    if (!state.summary) return 0;
    var key = { pending: 'pending', postponed: 'deferred', approved: 'approved', rejected: 'rejected' }[state.tab];
    return state.summary.byStatus[key];
  }

  function renderCasePagination() {
    setText('personasQueuePosition', 'Caso ' + (state.casePageIndex + 1) + ' de ' + formatCount(currentTabCount()));
    byId('personasPreviousCase').disabled = state.casePageIndex === 0;
    byId('personasNextCase').disabled = state.nextCaseCursor === null;
  }

  function previousCase() {
    if (state.casePageIndex === 0) return;
    state.casePageIndex -= 1;
    loadCase();
  }

  function nextCase() {
    if (state.nextCaseCursor === null) return;
    state.casePageCursors = state.casePageCursors.slice(0, state.casePageIndex + 1);
    state.casePageCursors.push(state.nextCaseCursor);
    state.casePageIndex += 1;
    loadCase();
  }

  function sameFlags(left, right) {
    return left.documentConflict === right.documentConflict &&
      left.birthDateConflict === right.birthDateConflict && left.nameSupport === right.nameSupport;
  }

  function assertDetailMatchesQueue(queueItem, detail) {
    var current = detail.case;
    if (current.caseKey !== queueItem.caseKey || current.kind !== queueItem.kind || current.status !== queueItem.status ||
        current.priority !== queueItem.priority || current.version !== queueItem.version ||
        current.options.length !== queueItem.optionCount || !sameFlags(current.flags, queueItem.flags)) {
      var error = new Error('La sugerencia cambió entre la cola y el detalle.');
      error.status = 409;
      throw error;
    }
  }

  async function loadCase() {
    var sequence = ++state.loadSequence;
    clearPrivateView();
    setCaseLoading(true);
    try {
      var queue = await fetchQueueForTab(state.tab);
      if (sequence !== state.loadSequence) return;
      state.nextCaseCursor = queue.page.nextCursor;
      renderSummary(queue.summary);
      if (!queue.items.length) {
        setCaseLoading(false);
        renderEmpty();
        return;
      }
      var queueItem = queue.items[0];
      var detail = await global.MuniPersonasReviewData.loadDetail(queueItem.caseKey);
      if (sequence !== state.loadSequence) return;
      assertDetailMatchesQueue(queueItem, detail);
      renderSummary(detail.summary);
      state.queueItem = queueItem;
      state.detail = detail;
      state.optionIndex = 0;
      setCaseLoading(false);
      renderCase();
      renderCasePagination();
    } catch (error) {
      if (sequence !== state.loadSequence) return;
      showError(error);
    }
  }

  function addEvidenceRow(container, label, value, documentKey) {
    var row = element('div', 'personas-evidence-row');
    if (documentKey) {
      row.classList.add('personas-document-row');
      row.dataset.documentKey = documentKey;
      row.hidden = !state.documentsVisible;
    }
    var term = element('dt', '', label);
    var description = element('dd', documentKey ? 'personas-document-value' : '', value || 'Falta dato');
    row.append(term, description);
    container.appendChild(row);
  }

  function currentOption() {
    return state.detail && state.detail.case.options[state.optionIndex]
      ? state.detail.case.options[state.optionIndex]
      : null;
  }

  function currentOptionDocuments() {
    var option = currentOption();
    if (!option || !state.revealedDocuments) return null;
    return state.revealedDocuments.options.find(function sameOption(item) {
      return item.optionKey === option.optionKey;
    }) || null;
  }

  function safePrivateDocument(value) {
    return state.documentsVisible ? (value || 'Falta dato') : '••• ••• •••';
  }

  function addEvidenceState(container, label, stateValue, isDocument) {
    var copy = EVIDENCE_COPY[stateValue] || EVIDENCE_COPY.MISSING;
    var item = element('li', 'personas-evidence-item');
    if (isDocument) {
      item.classList.add('personas-document-evidence');
      item.hidden = !state.documentsVisible;
    }
    item.append(element('span', '', label), element('span', 'personas-evidence-state personas-evidence-state--' + copy[1], copy[0]));
    container.appendChild(item);
  }

  function renderComparison() {
    var reviewCase = state.detail.case;
    var option = currentOption();
    var grh = byId('grhEvidence');
    var personas = byId('personasEvidence');
    var evidence = byId('evidenceSummary');
    var caseDocuments = state.revealedDocuments && state.revealedDocuments.case
      ? state.revealedDocuments.case.documents
      : null;
    var optionDocuments = currentOptionDocuments();
    grh.replaceChildren();
    personas.replaceChildren();
    evidence.replaceChildren();
    addEvidenceRow(grh, 'Nombre', reviewCase.person.displayName || 'Falta dato');
    addEvidenceRow(grh, 'Fecha de nacimiento', formatDate(reviewCase.person.birthDate));
    addEvidenceRow(grh, 'CUIL', safePrivateDocument(caseDocuments && caseDocuments.cuil), 'cuil');
    addEvidenceRow(grh, 'DNI', safePrivateDocument(caseDocuments && caseDocuments.dni), 'dni');
    if (option) {
      addEvidenceRow(personas, 'Nombre', option.person.displayName || 'Falta dato');
      addEvidenceRow(personas, 'Fecha de nacimiento', formatDate(option.person.birthDate));
      addEvidenceRow(personas, 'CUIL', safePrivateDocument(optionDocuments && optionDocuments.documents.cuil), 'cuil');
      addEvidenceRow(personas, 'DNI (si falta, obtenido del CUIL válido)', safePrivateDocument(optionDocuments && optionDocuments.documents.dni), 'dni');
      addEvidenceState(evidence, 'Nombre', option.evidence.name, false);
      addEvidenceState(evidence, 'Fecha de nacimiento', option.evidence.birthDate, false);
      addEvidenceState(evidence, 'CUIL', option.evidence.cuil, true);
      addEvidenceState(evidence, 'DNI', option.evidence.dni, true);
    } else {
      addEvidenceRow(personas, 'Persona sugerida', 'No hay una coincidencia suficiente');
      addEvidenceState(evidence, 'Nombre', 'MISSING', false);
      addEvidenceState(evidence, 'Fecha de nacimiento', 'MISSING', false);
      addEvidenceState(evidence, 'CUIL', 'MISSING', true);
      addEvidenceState(evidence, 'DNI', 'MISSING', true);
    }
    byId('toggleDocuments').setAttribute('aria-pressed', state.documentsVisible ? 'true' : 'false');
    byId('toggleDocuments').textContent = state.documentsLoading
      ? 'Verificando acceso…'
      : state.documentsVisible ? 'Ocultar documentos' : 'Mostrar documentos';
    byId('toggleDocuments').disabled = !option || state.documentsLoading;
    byId('personasDocumentNotice').textContent = state.documentsVisible
      ? 'Información privada visible para esta revisión. Ocultala cuando termines de verificar.'
      : 'Los documentos están enmascarados por defecto. Mostralos sólo si son necesarios para esta revisión.';
  }

  function renderOptionNavigation() {
    var options = state.detail.case.options;
    var nav = byId('personasOptionNav');
    nav.hidden = options.length <= 1;
    if (options.length <= 1) return;
    setText('personasOptionPosition', 'Persona sugerida ' + (state.optionIndex + 1) + ' de ' + options.length);
    byId('personasPreviousOption').disabled = state.optionIndex === 0;
    byId('personasNextOption').disabled = state.optionIndex === options.length - 1;
  }

  function renderCase() {
    var reviewCase = state.detail.case;
    byId('personasEmpty').hidden = true;
    byId('personasReceipt').hidden = true;
    byId('personasCase').hidden = false;
    setText('personasCaseStatus', STATUS_COPY[reviewCase.status]);
    setText('personasCasePosition', reviewCase.options.length === 1 ? '1 persona sugerida' : formatCount(reviewCase.options.length) + ' personas sugeridas');
    setText('personasCaseTitle', 'Sugerencia para revisar');
    setText('personasCaseReason', PRIORITY_COPY[reviewCase.priority] + ' ' + KIND_COPY[reviewCase.kind]);
    state.documentsVisible = false;
    renderOptionNavigation();
    renderComparison();
    var editable = reviewCase.status === 'PENDING' || reviewCase.status === 'DEFERRED';
    byId('personasCaseActions').hidden = !editable || !state.detail.permissions.canDecide;
    var approve = documentRef.querySelector('[data-decision="approve"]');
    approve.disabled = !currentOption();
    approve.title = currentOption() ? '' : 'No hay una persona sugerida para aprobar.';
  }

  function documentsMatchDetail(value) {
    if (!value || !state.detail || value.documents.case.caseKey !== state.detail.case.caseKey ||
        value.documents.options.length !== state.detail.case.options.length) return false;
    var expected = new Set(state.detail.case.options.map(function optionKey(option) { return option.optionKey; }));
    return value.documents.options.every(function knownOption(option) { return expected.delete(option.optionKey); }) && expected.size === 0;
  }

  async function toggleDocuments() {
    if (!currentOption()) return;
    if (state.documentsVisible) {
      clearRevealedDocuments(true);
      return;
    }
    state.documentsLoading = true;
    renderComparison();
    try {
      var revealed = await global.MuniPersonasReviewData.loadDocuments(state.detail.case.caseKey);
      if (!documentsMatchDetail(revealed)) {
        var mismatch = new Error('La evidencia documental no coincide con el caso abierto.');
        mismatch.status = 409;
        throw mismatch;
      }
      state.revealedDocuments = revealed.documents;
      state.documentsVisible = true;
      state.documentsLoading = false;
      scheduleDocumentMask();
      renderComparison();
    } catch (error) {
      clearRevealedDocuments(true);
      setText('personasDocumentNotice', 'No pudimos revelar los documentos de forma auditada. El resto del caso sigue disponible sin esos datos.');
    }
  }

  function changeOption(delta) {
    if (!state.detail) return;
    var next = state.optionIndex + delta;
    if (next < 0 || next >= state.detail.case.options.length) return;
    state.optionIndex = next;
    clearRevealedDocuments(false);
    renderOptionNavigation();
    renderComparison();
  }

  function populateReasonOptions(config, requireChoice) {
    var select = byId('personasReason');
    var options = config.reasons.map(function reasonOption(reason) {
      var node = element('option', '', reason[1]);
      node.value = reason[0];
      return node;
    });
    if (requireChoice) {
      var placeholder = element('option', '', 'Seleccioná un motivo');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.selected = true;
      options.unshift(placeholder);
    }
    select.replaceChildren.apply(select, options);
  }

  function dniEvidenceNeedsManualCheck(option) {
    return Boolean(option && DNI_BACKUP_METHODS.indexOf(option.matchMethod) !== -1 && option.evidence &&
      option.evidence.name !== 'MATCH' && option.evidence.birthDate !== 'MATCH');
  }

  function approvalNeedsManualCheck(reviewCase, option) {
    return Boolean(reviewCase && (
      reviewCase.flags.documentConflict === true ||
      reviewCase.flags.birthDateConflict === true ||
      reviewCase.priority === 'DOCUMENT_CONFLICT' ||
      (option && option.evidenceLevel === 'CONFLICT') ||
      dniEvidenceNeedsManualCheck(option)
    ));
  }

  function manualApprovalCopy(reviewCase, option) {
    if (reviewCase.flags.documentConflict === true || reviewCase.priority === 'DOCUMENT_CONFLICT') {
      return 'Los documentos de GRH y PERSONAS son distintos. Para aprobar este vínculo, primero verificá la información en la fuente municipal correspondiente y confirmá que se trata de la misma persona.';
    }
    if (reviewCase.flags.birthDateConflict === true) {
      return 'Las fechas de nacimiento informadas son distintas. Para aprobar este vínculo, primero verificá la información en la fuente municipal correspondiente y confirmá que se trata de la misma persona.';
    }
    if (option && option.evidenceLevel === 'CONFLICT') {
      return 'Esta persona sugerida tiene señales en conflicto. Para aprobar el vínculo, verificá manualmente la fuente municipal correspondiente y confirmá que se trata de la misma persona.';
    }
    if (dniEvidenceNeedsManualCheck(option)) {
      return 'Esta sugerencia se apoya en el DNI, pero no coincide por nombre ni por fecha de nacimiento. Antes de aprobarla, comprobá la fuente municipal y confirmá que se trata de la misma persona.';
    }
    return DECISION_CONFIG.approve.copy;
  }

  function openDecision(kind) {
    if (!state.detail || !DECISION_CONFIG[kind]) return;
    if (kind === 'approve' && !currentOption()) return;
    var config = DECISION_CONFIG[kind];
    var requiresManualCheck = kind === 'approve' && approvalNeedsManualCheck(state.detail.case, currentOption());
    var requiresReasonChoice = kind === 'reject' || kind === 'postpone';
    state.activeDecision = kind;
    state.approvalRequiresManualCheck = requiresManualCheck;
    state.decisionTrigger = documentRef.activeElement;
    setText('personasDialogEyebrow', config.eyebrow);
    setText('personasDialogTitle', requiresManualCheck ? DOCUMENT_CONFLICT_APPROVAL.title : config.title);
    setText('personasDialogCopy', requiresManualCheck ? manualApprovalCopy(state.detail.case, currentOption()) : config.copy);
    setText('personasDecisionSubmit', config.submit);
    populateReasonOptions(requiresManualCheck ? DOCUMENT_CONFLICT_APPROVAL : config, requiresReasonChoice);
    byId('personasReasonField').hidden = !(requiresManualCheck || requiresReasonChoice);
    setText('personasReasonLabel', requiresManualCheck ? DOCUMENT_CONFLICT_APPROVAL.reasonLabel : 'Motivo');
    if (requiresManualCheck) byId('personasReason').value = 'MANUAL_SOURCE_CHECK_CONFIRMED';
    byId('personasApprovalConfirmation').hidden = !config.confirmation;
    byId('personasApprovalChecked').checked = false;
    byId('personasFormError').hidden = true;
    byId('personasDecisionSubmit').disabled = false;
    byId('personasDecisionDialog').showModal();
    (requiresManualCheck || requiresReasonChoice ? byId('personasReason') : byId('personasApprovalChecked'))
      .focus({ preventScroll: true });
  }

  function closeDecision(restoreFocus) {
    if (byId('personasDecisionDialog').open) byId('personasDecisionDialog').close();
    var trigger = state.decisionTrigger;
    state.activeDecision = null;
    state.approvalRequiresManualCheck = false;
    state.decisionTrigger = null;
    byId('personasReasonField').hidden = true;
    byId('personasFormError').hidden = true;
    if (restoreFocus !== false && trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  function outcomeCopy(status) {
    if (status === 'APPROVED') return ['Vínculo aprobado', 'La revisión quedó confirmada. La ficha laboral de GRH no fue modificada.'];
    if (status === 'DEFERRED') return ['Sugerencia postergada', 'El caso queda disponible para retomarlo cuando exista mejor evidencia.'];
    return ['Sugerencia descartada', 'La revisión quedó resuelta sin vincular los dos registros.'];
  }

  function renderReceipt(result) {
    var copy = outcomeCopy(result.decision.status);
    var reviewCase = state.detail && state.detail.case;
    var source = state.source;
    clearPrivateView();
    byId('personasReceipt').hidden = false;
    setText('personasReceiptTitle', copy[0]);
    setText('personasReceiptCopy', copy[1]);
    var details = byId('personasReceiptDetails');
    var statusItem = element('div');
    statusItem.append(element('dt', '', 'Resultado:'), element('dd', '', STATUS_COPY[result.decision.status]));
    var dateItem = element('div');
    dateItem.append(element('dt', '', 'Registrado:'), element('dd', '', formatDateTime(result.decision.decidedAt)));
    var reasonItem = element('div');
    reasonItem.append(element('dt', '', 'Motivo:'), element('dd', '', REASON_COPY[result.decision.reasonCode] || 'Motivo registrado'));
    var referenceItem = element('div');
    referenceItem.append(element('dt', '', 'Referencia:'), element('dd', '', reviewCase ? 'Caso ' + reviewCase.caseKey.slice(0, 8).toUpperCase() : 'Caso privado'));
    var sourceItem = element('div');
    sourceItem.append(element('dt', '', 'Corte:'), element('dd', '', source ? formatDate(source.snapshotAsOf) + ' · respaldo histórico' : 'Respaldo histórico'));
    var actorItem = element('div');
    actorItem.append(element('dt', '', 'Ámbito:'), element('dd', '', 'Municipalidad de Junín · cuenta privada autorizada'));
    details.replaceChildren(statusItem, reasonItem, dateItem, referenceItem, sourceItem, actorItem);
    byId('personasReceipt').focus({ preventScroll: true });
  }

  async function submitDecision(event) {
    event.preventDefault();
    if (!state.activeDecision || !state.detail) return;
    var config = DECISION_CONFIG[state.activeDecision];
    if (state.approvalRequiresManualCheck && byId('personasReason').value !== 'MANUAL_SOURCE_CHECK_CONFIRMED') {
      setText('personasFormError', 'Para aprobar este caso, confirmá que comprobaste manualmente la fuente municipal.');
      byId('personasFormError').hidden = false;
      byId('personasReason').focus();
      return;
    }
    var allowedReasons = config.reasons.map(function reasonCode(reason) { return reason[0]; });
    if (state.approvalRequiresManualCheck) allowedReasons = ['MANUAL_SOURCE_CHECK_CONFIRMED'];
    if (allowedReasons.indexOf(byId('personasReason').value) === -1) {
      setText('personasFormError', 'Seleccioná un motivo para registrar una decisión trazable.');
      byId('personasFormError').hidden = false;
      byId('personasReason').focus();
      return;
    }
    if (config.confirmation && !byId('personasApprovalChecked').checked) {
      setText('personasFormError', 'Confirmá que revisaste la evidencia antes de aprobar.');
      byId('personasFormError').hidden = false;
      byId('personasApprovalChecked').focus();
      return;
    }
    byId('personasFormError').hidden = true;
    byId('personasDecisionSubmit').disabled = true;
    setText('personasDecisionSubmit', 'Registrando…');
    var reviewCase = state.detail.case;
    var command = {
      commandId: global.MuniPersonasReviewData.createCommandId(),
      caseKey: reviewCase.caseKey,
      expectedVersion: reviewCase.version,
      decision: config.command,
      optionKey: config.command === 'APPROVE' ? currentOption().optionKey : null,
      reasonCode: byId('personasReason').value
    };
    try {
      var result = await global.MuniPersonasReviewData.decide(command);
      closeDecision(false);
      renderReceipt(result);
      try {
        var fresh = await global.MuniPersonasReviewData.loadSummary();
        renderSummary(fresh.summary);
      } catch (summaryError) {
        setText('personasSummaryCopy', 'La decisión quedó registrada, pero el resumen todavía no pudo actualizarse.');
      }
    } catch (error) {
      closeDecision();
      showError(error);
    }
  }

  async function loadWorkspace() {
    showLoading();
    resetCasePagination();
    try {
      var client = global.MuniPersonasReviewData;
      if (!client || client.REVIEW_CONTRACT !== 'grh-personas-review-v1') throw new Error('PERSONAS_REVIEW_CLIENT_UNAVAILABLE');
      var allowed = typeof global.requireCapability === 'function'
        ? await global.requireCapability('navigation.audit')
        : false;
      if (!allowed) return;
      var summary = await client.loadSummary();
      renderSourceContext(summary.source);
      renderSummary(summary.summary);
      byId('personasLoading').hidden = true;
      byId('personasContent').hidden = false;
      byId('personasReview').setAttribute('aria-busy', 'false');
      await loadCase();
    } catch (error) {
      showError(error);
    }
  }

  function wireTabs() {
    var tabs = Array.from(documentRef.querySelectorAll('[data-queue-state]'));
    tabs.forEach(function wireTab(button, index) {
      button.addEventListener('click', function selectTab() {
        if (state.tab === button.dataset.queueState) return;
        setTabs(button.dataset.queueState);
        loadCase();
      });
      button.addEventListener('keydown', function moveTab(event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        var nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
          (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      });
    });
  }

  function wireEvents() {
    byId('personasRetry').addEventListener('click', loadWorkspace);
    byId('toggleDocuments').addEventListener('click', toggleDocuments);
    byId('personasPreviousCase').addEventListener('click', previousCase);
    byId('personasNextCase').addEventListener('click', nextCase);
    byId('personasPreviousOption').addEventListener('click', function previousOption() { changeOption(-1); });
    byId('personasNextOption').addEventListener('click', function nextOption() { changeOption(1); });
    byId('personasNext').addEventListener('click', function nextPending() {
      setTabs('pending');
      byId('personasContent').hidden = false;
      loadCase();
    });
    documentRef.querySelectorAll('[data-decision]').forEach(function wireDecision(button) {
      button.addEventListener('click', function handleDecision() { openDecision(button.dataset.decision); });
    });
    documentRef.querySelectorAll('[data-close-dialog]').forEach(function wireClose(button) {
      button.addEventListener('click', function closeFromButton() { closeDecision(true); });
    });
    byId('personasDecisionForm').addEventListener('submit', submitDecision);
    byId('personasDecisionDialog').addEventListener('cancel', function cancelDialog(event) {
      event.preventDefault();
      closeDecision(true);
    });
    documentRef.addEventListener('visibilitychange', function maskWhenHidden() {
      if (documentRef.hidden) clearRevealedDocuments(true);
    });
    global.addEventListener('pagehide', function maskOnExit() { clearRevealedDocuments(true); });
    wireTabs();
  }

  documentRef.addEventListener('DOMContentLoaded', function startPersonasReview() {
    arrangeOperationalLayout();
    wireEvents();
    loadWorkspace();
  });
})(window, document);
