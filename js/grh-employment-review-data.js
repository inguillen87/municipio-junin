(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-employment-review';
  var SCHEMA_VERSION = 'grh-employment-review-v2';
  var DEFINITIONS = Object.freeze([
    Object.freeze({
      key: 'reported_current_without_reference_payroll',
      label: 'Sin participación en el cálculo del mes',
      meaning: 'El legajo no informa egreso al corte, pero no aparece en el cálculo de referencia.'
    }),
    Object.freeze({
      key: 'reported_ended_with_reference_payroll',
      label: 'Con egreso informado y participación en el cálculo',
      meaning: 'El legajo informa egreso al corte y también aparece en el cálculo de referencia.'
    }),
    Object.freeze({
      key: 'uncertain_status_with_reference_payroll',
      label: 'Con fechas a revisar y participación en el cálculo',
      meaning: 'Las fechas del legajo no permiten determinar la situación informada y la persona aparece en el cálculo de referencia.'
    })
  ]);
  var TOP_KEYS = Object.freeze([
    'schemaVersion', 'source', 'audience', 'referencePeriod', 'totalDirectoryPeople',
    'reportedCurrentPeople', 'reportedEndedPeople', 'uncertainPeople',
    'referencePayrollParticipants', 'reportedCurrentWithReferencePayroll',
    'currentWithoutPayroll', 'endedWithPayroll', 'uncertainWithPayroll',
    'totalToReview', 'privacyStatus', 'categories'
  ]);
  var SOURCE_KEYS = Object.freeze(['canonicalSystem', 'sourceSha256', 'snapshotAsOf']);
  var CATEGORY_KEYS = Object.freeze(['key', 'label', 'meaning', 'count', 'display', 'privacyStatus']);

  function EmploymentReviewDataError(code, status) {
    this.name = 'EmploymentReviewDataError';
    this.code = code;
    this.status = Number.isInteger(status) ? status : 0;
    this.message = ({
      EMPLOYMENT_REVIEW_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      EMPLOYMENT_REVIEW_HTTP_ERROR: 'No se pudo consultar la revisión de legajos.',
      EMPLOYMENT_REVIEW_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      EMPLOYMENT_REVIEW_CONTRACT_INVALID: 'La revisión de legajos no superó los controles requeridos.',
      EMPLOYMENT_REVIEW_TIMEOUT: 'La consulta demoró más de lo esperado.'
    })[code] || 'La revisión de legajos no está disponible.';
  }
  EmploymentReviewDataError.prototype = Object.create(Error.prototype);
  EmploymentReviewDataError.prototype.constructor = EmploymentReviewDataError;

  function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function exactKeys(value, keys) {
    if (!record(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    return actual.length === expected.length && actual.every(function (key, index) { return key === expected[index]; });
  }
  function nonNegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0; }
  function releasedOrProtectedCount(value, audience) {
    if (value === null) return audience === 'portable';
    return nonNegativeInteger(value) && (audience === 'private' || value === 0 || value >= 10);
  }
  function protectedPairMatchesTotal(total, left, right) {
    if (!nonNegativeInteger(total)) return false;
    if (nonNegativeInteger(left) && nonNegativeInteger(right)) return left + right === total;
    if (left === null && nonNegativeInteger(right)) return total - right > 0 && total - right < 10;
    if (right === null && nonNegativeInteger(left)) return total - left > 0 && total - left < 10;
    return left === null && right === null && total >= 2 && total <= 18;
  }
  function validDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return false;
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
  }
  function validContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION ||
        !exactKeys(value.source, SOURCE_KEYS) || typeof value.source.canonicalSystem !== 'string' ||
        !/^[0-9a-f]{64}$/.test(value.source.sourceSha256 || '') || !validDate(value.source.snapshotAsOf) ||
        !['private', 'portable'].includes(value.audience) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.referencePeriod || '') ||
        !nonNegativeInteger(value.totalDirectoryPeople) ||
        !nonNegativeInteger(value.reportedCurrentPeople) ||
        !nonNegativeInteger(value.reportedEndedPeople) ||
        !nonNegativeInteger(value.uncertainPeople) ||
        !nonNegativeInteger(value.referencePayrollParticipants) ||
        !releasedOrProtectedCount(value.reportedCurrentWithReferencePayroll, value.audience) ||
        !releasedOrProtectedCount(value.currentWithoutPayroll, value.audience) ||
        !releasedOrProtectedCount(value.endedWithPayroll, value.audience) ||
        !releasedOrProtectedCount(value.uncertainWithPayroll, value.audience) ||
        !nonNegativeInteger(value.totalToReview) ||
        value.totalToReview > value.totalDirectoryPeople || !['released', 'partially_protected'].includes(value.privacyStatus) ||
        !Array.isArray(value.categories) || value.categories.length !== DEFINITIONS.length) return false;
    if (value.reportedCurrentPeople + value.reportedEndedPeople + value.uncertainPeople !== value.totalDirectoryPeople ||
        value.referencePayrollParticipants > value.totalDirectoryPeople) return false;
    var releasedTotal = 0;
    var protectedRows = 0;
    for (var index = 0; index < DEFINITIONS.length; index += 1) {
      var row = value.categories[index];
      var expected = DEFINITIONS[index];
      if (!exactKeys(row, CATEGORY_KEYS) || row.key !== expected.key || row.label !== expected.label || row.meaning !== expected.meaning) return false;
      if (row.privacyStatus === 'released') {
        if (!nonNegativeInteger(row.count) || row.display !== String(row.count)) return false;
        releasedTotal += row.count;
      } else if (row.privacyStatus === 'protected') {
        if (value.audience !== 'portable' || row.count !== null || row.display !== 'Detalle protegido') return false;
        protectedRows += 1;
      } else return false;
    }
    var hiddenReviewTotal = value.totalToReview - releasedTotal;
    if (protectedRows === 0 ? hiddenReviewTotal !== 0 :
        hiddenReviewTotal < protectedRows || hiddenReviewTotal > protectedRows * 9) return false;
    if (value.categories[0].count !== value.currentWithoutPayroll ||
        value.categories[1].count !== value.endedWithPayroll ||
        value.categories[2].count !== value.uncertainWithPayroll) return false;
    if (!protectedPairMatchesTotal(
      value.reportedCurrentPeople,
      value.reportedCurrentWithReferencePayroll,
      value.currentWithoutPayroll
    )) return false;
    var effectiveCurrentWith = nonNegativeInteger(value.reportedCurrentWithReferencePayroll)
      ? value.reportedCurrentWithReferencePayroll
      : (nonNegativeInteger(value.currentWithoutPayroll)
        ? value.reportedCurrentPeople - value.currentWithoutPayroll
        : null);
    var effectiveCurrentWithout = nonNegativeInteger(value.currentWithoutPayroll)
      ? value.currentWithoutPayroll
      : (nonNegativeInteger(value.reportedCurrentWithReferencePayroll)
        ? value.reportedCurrentPeople - value.reportedCurrentWithReferencePayroll
        : null);
    if (nonNegativeInteger(effectiveCurrentWith) && nonNegativeInteger(effectiveCurrentWithout)) {
      var referenceRemainder = value.referencePayrollParticipants - effectiveCurrentWith;
      var reviewRemainder = value.totalToReview - effectiveCurrentWithout;
      if (referenceRemainder !== reviewRemainder || !protectedPairMatchesTotal(
        referenceRemainder,
        value.endedWithPayroll,
        value.uncertainWithPayroll
      )) return false;
    }
    if (nonNegativeInteger(value.reportedCurrentWithReferencePayroll) &&
        nonNegativeInteger(value.currentWithoutPayroll) &&
        value.reportedCurrentWithReferencePayroll + value.currentWithoutPayroll !== value.reportedCurrentPeople) return false;
    if ([value.reportedCurrentWithReferencePayroll, value.endedWithPayroll, value.uncertainWithPayroll].every(nonNegativeInteger) &&
        value.reportedCurrentWithReferencePayroll + value.endedWithPayroll + value.uncertainWithPayroll !== value.referencePayrollParticipants) return false;
    if ([value.currentWithoutPayroll, value.endedWithPayroll, value.uncertainWithPayroll].every(nonNegativeInteger) &&
        value.currentWithoutPayroll + value.endedWithPayroll + value.uncertainWithPayroll !== value.totalToReview) return false;
    if (nonNegativeInteger(value.reportedCurrentWithReferencePayroll) && nonNegativeInteger(value.currentWithoutPayroll) &&
        value.referencePayrollParticipants - value.reportedCurrentWithReferencePayroll !== value.totalToReview - value.currentWithoutPayroll) return false;
    var protectedTopCount = [
      value.reportedCurrentWithReferencePayroll, value.currentWithoutPayroll,
      value.endedWithPayroll, value.uncertainWithPayroll
    ].filter(function (count) { return count === null; }).length;
    if (value.privacyStatus !== (protectedTopCount === 0 ? 'released' : 'partially_protected')) return false;
    if (value.audience === 'private' && (protectedRows !== 0 || protectedTopCount !== 0)) return false;
    if (value.audience === 'portable' && !value.categories.every(function (row) {
      return row.privacyStatus === 'protected' || row.count === 0 || row.count >= 10;
    })) return false;
    return true;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }
  async function load(options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') throw new EmploymentReviewDataError('EMPLOYMENT_REVIEW_CLIENT_UNAVAILABLE');
    var timeoutMs = options && Number.isSafeInteger(options.timeoutMs) ? options.timeoutMs : 10000;
    var controller = new global.AbortController();
    var timedOut = false;
    var timer = global.setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || !response.ok) throw new EmploymentReviewDataError('EMPLOYMENT_REVIEW_HTTP_ERROR', response && response.status);
      if (response.headers.get('X-MuniControl-Contract') !== SCHEMA_VERSION) throw new EmploymentReviewDataError('EMPLOYMENT_REVIEW_CONTRACT_MISMATCH', 502);
      if (!/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) {
        throw new EmploymentReviewDataError('EMPLOYMENT_REVIEW_CONTRACT_INVALID', 502);
      }
      var payload = await response.json();
      if (!validContract(payload)) throw new EmploymentReviewDataError('EMPLOYMENT_REVIEW_CONTRACT_INVALID', 502);
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof EmploymentReviewDataError) throw error;
      if (timedOut) throw new EmploymentReviewDataError('EMPLOYMENT_REVIEW_TIMEOUT', 408);
      throw new EmploymentReviewDataError('EMPLOYMENT_REVIEW_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
    }
  }

  global.MuniGrhEmploymentReview = Object.freeze({ load: load });
})(window);
