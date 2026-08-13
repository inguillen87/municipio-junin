(function exposeGrhPersonasLinkageReadiness(global) {
  'use strict';

  const SCHEMA_VERSION = 'grh-personas-linkage-readiness-v1';
  const ENDPOINT = '/api/grh-personas-linkage-readiness';
  const CONTRACT_HEADER = 'x-municontrol-contract';
  const GRH_SOURCE_SHA256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
  const PERSONAS_SOURCE_SHA256 = '11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c';
  const TOP_KEYS = ['algorithm', 'idPersonaControl', 'limits', 'privacy', 'readiness', 'reconciliation', 'schemaVersion', 'source', 'status'];

  class DataError extends Error {
    constructor(message, code, status) {
      super(message);
      this.name = 'GrhPersonasLinkageDataError';
      this.code = code;
      this.status = status;
    }
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const sorted = expected.slice().sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
  }

  function validate(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION || value.status !== 'diagnostic_ready') return false;
    const source = value.source;
    if (source?.snapshotAsOf !== '2026-08-06' || source?.grh?.sourceSha256 !== GRH_SOURCE_SHA256 || source?.personas?.sourceSha256 !== PERSONAS_SOURCE_SHA256) return false;
    if (source?.grh?.counts?.persons !== 2349 || source?.personas?.counts?.persons !== 96777 || source?.personas?.counts?.addresses !== 273314 || source?.personas?.counts?.personsWithAddress !== 90365) return false;
    const tiers = value.algorithm?.tiers;
    if (value.algorithm?.version !== 'grh-personas-linkage-matcher-v1' || value.algorithm?.nameOnlyMatching !== false || value.algorithm?.sexEvidenceUsed !== false || value.algorithm?.idPersonaJoinAllowed !== false || !Array.isArray(tiers) || tiers.length !== 4) return false;
    const expected = [
      ['unique_valid_cuil', 1432],
      ['unique_dni_backup', 203],
      ['duplicate_valid_cuil_unique_name', 58],
      ['duplicate_dni_unique_name', 6],
    ];
    if (!expected.every(([key, count], index) => tiers[index]?.key === key && tiers[index]?.count === count)) return false;
    const reconciliation = value.reconciliation;
    if (reconciliation?.grhPersons !== 2349 || reconciliation?.candidates !== 1699 || reconciliation?.coveragePct !== 72.3 || reconciliation?.ambiguous !== 157 || reconciliation?.unmatched !== 493 || reconciliation?.targetCollisions !== 0 || reconciliation?.reconciled !== true) return false;
    if (reconciliation?.ambiguousBreakdown?.unresolvedDocumentCandidates !== 154 || reconciliation?.ambiguousBreakdown?.nameOnlyReviewSignals !== 3 || reconciliation?.ambiguousBreakdown?.promotedFromNameOnly !== 0) return false;
    if (value.idPersonaControl?.joinAllowed !== false || value.idPersonaControl?.overlappingValues !== 6 || value.idPersonaControl?.concordantIdentities !== 0) return false;
    if (value.privacy?.aggregateOnly !== true || value.privacy?.containsPii !== false || value.privacy?.rawRowsExported !== false || value.privacy?.candidateRowsExported !== false) return false;
    if (value.readiness?.productionCrosswalk !== 'not_published' || value.readiness?.safeForCurrentGrhKpis !== false || !Array.isArray(value.limits) || value.limits.length !== 7 || value.limits[4]?.code !== 'geocoded_addresses_unlinked') return false;
    return !/"(?:displayName|fullName|birthDate|dni|cuil|street|streetName|addressText|domicile|domicilioExacto|phone|email|sourceId|candidateRows|rawPersons)"\s*:/i.test(JSON.stringify(value));
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    const visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.values(value).forEach(child => deepFreeze(child, visited));
    return Object.freeze(value);
  }

  async function load(options) {
    const settings = options || {};
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new DataError('El acceso institucional no está disponible.', 'GRH_PERSONAS_LINKAGE_CLIENT_UNAVAILABLE', 0);
    }
    const timeoutMs = Number.isFinite(settings.timeoutMs) ? settings.timeoutMs : 8000;
    const controller = new global.AbortController();
    let timedOut = false;
    const timer = global.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    if (settings.signal) {
      if (settings.signal.aborted) controller.abort();
      else settings.signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new DataError('La revisión de vinculación no está disponible.', 'GRH_PERSONAS_LINKAGE_HTTP_ERROR', response.status);
      }
      if (response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new DataError('La versión de la revisión no coincide.', 'GRH_PERSONAS_LINKAGE_CONTRACT_MISMATCH', 502);
      }
      if (!/^application\/json\b/i.test(response.headers.get('content-type') || '')) {
        throw new DataError('La respuesta de vinculación no es válida.', 'GRH_PERSONAS_LINKAGE_CONTENT_TYPE_INVALID', 502);
      }
      const value = await response.json();
      if (!validate(value)) {
        throw new DataError('La revisión de vinculación no supera sus controles.', 'GRH_PERSONAS_LINKAGE_CONTRACT_INVALID', 502);
      }
      return deepFreeze(value);
    } catch (error) {
      if (error instanceof DataError) throw error;
      if (error?.name === 'AbortError') {
        throw new DataError(
          timedOut ? 'La revisión tardó demasiado.' : 'La consulta fue cancelada.',
          timedOut ? 'GRH_PERSONAS_LINKAGE_TIMEOUT' : 'GRH_PERSONAS_LINKAGE_ABORTED',
          timedOut ? 408 : 0,
        );
      }
      throw new DataError('La revisión de vinculación no está disponible.', 'GRH_PERSONAS_LINKAGE_NETWORK_ERROR', 0);
    } finally {
      global.clearTimeout(timer);
      if (settings.signal) settings.signal.removeEventListener('abort', onAbort);
    }
  }

  global.MuniGrhPersonasLinkageReadiness = Object.freeze({
    SCHEMA_VERSION,
    DataError,
    validate,
    load,
  });
})(window);
