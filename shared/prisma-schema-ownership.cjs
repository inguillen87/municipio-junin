'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const OWNERSHIP_KEYS = deepFreeze({
  contract: [
    'clientAccess',
    'migratePreserved',
    'provenance',
    'references',
    'schemaProjectionSha256',
    'sensitive',
    'version',
  ],
  entry: ['classification', 'clientAccess', 'migratePreserved', 'model', 'provenance', 'table'],
  provenance: ['branchId', 'kind', 'projectId', 'tool'],
});

const PREVIEW_INTROSPECTION = deepFreeze({
  branchId: 'br-proud-hat-achuevv2',
  kind: 'preview-introspection',
  projectId: 'falling-bird-78592221',
  tool: 'prisma-db-pull-print',
});

function ownershipEntry(model, table, classification) {
  return {
    classification,
    clientAccess: 'disabled',
    migratePreserved: true,
    model,
    provenance: PREVIEW_INTROSPECTION.kind,
    table,
  };
}

const PRISMA_SCHEMA_OWNERSHIP = deepFreeze({
  clientAccess: 'disabled',
  migratePreserved: true,
  provenance: PREVIEW_INTROSPECTION,
  references: [
    ownershipEntry('Barrio', 'barrios', 'reference'),
    ownershipEntry('Calle', 'calles', 'reference'),
    ownershipEntry('CategoriaGrh', 'categorias_grh', 'reference'),
    ownershipEntry('ConvenioGrh', 'convenios_grh', 'reference'),
    ownershipEntry('GremioGrh', 'gremios_grh', 'reference'),
    ownershipEntry('Localidad', 'localidades', 'reference'),
    ownershipEntry('MotivoAusencia', 'motivos_ausencia', 'reference'),
    ownershipEntry('SectorGrh', 'sectores_grh', 'reference'),
  ],
  schemaProjectionSha256: '588d171e79b7c7841a01b8850302dee2fdbe98a9923677cb68563ece31ddedf8',
  sensitive: [
    ownershipEntry('Ciudadano', 'ciudadanos', 'sensitive'),
    ownershipEntry('EmpleadoGrh', 'empleados_grh', 'sensitive'),
    ownershipEntry('FamiliarGrh', 'familiares_grh', 'sensitive'),
    ownershipEntry('AusenciaGrh', 'ausencias_grh', 'sensitive'),
    ownershipEntry('LicenciaGrh', 'licencias_grh', 'sensitive'),
  ],
  version: 'prisma-schema-ownership-v1',
});

module.exports = deepFreeze({
  OWNERSHIP_KEYS,
  PRISMA_SCHEMA_OWNERSHIP,
});
