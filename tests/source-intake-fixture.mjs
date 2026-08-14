export function sourceIntakeProfileFixture() {
  return {
    source: {
      label: 'Ejecucion presupuestaria mensual',
      domain: 'budget',
      referencePeriod: '2026-07',
      ownerOffice: 'Secretaria de Hacienda',
      purpose: 'reconciliation',
      classification: 'confidential',
      authority: 'owner_confirmed',
      currency: 'ARS',
      containsPersonalData: false,
    },
    file: {
      sha256: 'a'.repeat(64),
      extension: 'csv',
      kind: 'structured',
      sizeBytes: 128,
    },
    profile: {
      schemaVersion: 'municipal-source-intake-profile-v1',
      schemaDigest: 'b'.repeat(64),
      rowCount: 2,
      columnCount: 2,
      emptyCellRatePct: 0,
      duplicateRowRatePct: 0,
      pageCount: null,
      lineCount: null,
      textBytes: null,
    },
    quality: {
      status: 'blocked',
      checks: [
        { code: 'metadata_validated', status: 'passed', severity: 'info', label: 'Metadatos validados.' },
        { code: 'file_within_limit', status: 'passed', severity: 'info', label: 'Archivo dentro del limite.' },
        { code: 'format_parsed', status: 'passed', severity: 'info', label: 'Formato interpretado.' },
        { code: 'original_not_retained', status: 'blocked', severity: 'high', label: 'Original no conservado.' },
        { code: 'antimalware_not_run', status: 'blocked', severity: 'high', label: 'Antimalware no ejecutado.' },
        { code: 'authority_owner_confirmed', status: 'passed', severity: 'info', label: 'Autoridad confirmada.' },
        { code: 'personal_data_not_declared', status: 'passed', severity: 'info', label: 'Datos personales no declarados.' },
      ],
      passedCount: 5,
      blockedCount: 2,
    },
    limits: [
      { code: 'original_not_retained', text: 'El original no se conserva.' },
      { code: 'antimalware_not_run', text: 'No se ejecuto antimalware.' },
      { code: 'quarantine_not_publication', text: 'La cuarentena no publica datos.' },
    ],
  };
}

export function cloneFixture(value) {
  return structuredClone(value);
}
