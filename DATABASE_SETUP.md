# Configuración de base de datos — documento de entrada

Estado: **procedimiento heredado retirado** el 8 de agosto de 2026.

Este archivo ya no contiene comandos de instalación porque la versión anterior
referenciaba un `backend/db/schema.sql` inexistente, sugería exponer PostgreSQL a
Internet y describía cargas de archivos sin persistencia. Seguir esas
instrucciones podía producir una instalación incompatible o datos perdidos.

## Ruta canónica vigente

1. Leer [`NEON_SETUP.md`](NEON_SETUP.md) para preparar PostgreSQL y los dos
   clientes Prisma desde `prisma/schema.prisma`.
2. Leer [`DEPLOYMENT.md`](DEPLOYMENT.md) para gates, variables, preview, smokes y
   rollback.
3. Leer
   [`docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md`](docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md)
   para operación, seguridad, materialización GRH, ingesta y continuidad.
4. Consultar
   [`docs/ENTERPRISE_PRODUCT_ROADMAP.md`](docs/ENTERPRISE_PRODUCT_ROADMAP.md)
   para la evolución hacia CDC, backups, geografía y multi-municipio.

## Restricciones actuales

- S14C incorpora en Git el baseline Prisma aditivo, su lock y un manifest v2 que
  fija Prisma `5.22.0`, engine, toolchain, schema y SQL. El chequeo del manifest
  puede pasar localmente; el gate offline además exige `PRISMA_BASELINE_ID` y
  `PRISMA_MIGRATION_SET_ID` exactamente derivados del manifest.
- Ese verde es integridad del checkout, no autorización de migración. El camino
  de release y todo migrate sobre Preview o Production continúan bloqueados con
  `RELEASE_ATTESTATION_NOT_GOVERNED`.
- El schema preserva 13 tablas GRH de Preview mediante `@@ignore` (5 sensibles y
  8 de referencia). Eso las omite de Prisma Client, pero no impone ACL, RLS ni
  aislamiento frente a SQL crudo o credenciales owner; no es seguridad DB.
- No ejecutar `prisma db push`, `migrate reset` ni SQL heredado contra una base
  municipal.
- Una importación requiere PostgreSQL, tenant, autorización y confirmación de
  parseo/persistencia; subir un archivo no lo convierte en dato operativo.
- No abrir el puerto de PostgreSQL a Internet. Usar TLS, reglas de red mínimas,
  secretos administrados y, cuando corresponda, VPN o conectividad privada.
- No declarar un backup operativo hasta restaurarlo y reconciliarlo.

## Evidencia S14C y límites

El baseline se ensayó en dos hijos Neon descartables creados en un LSN de
Preview, sin escrituras sobre las ramas estables. A aplicó `migrate deploy` sobre
una DB vacía y cerró status/diff sin drift con las 25 tablas esperadas. B3 marcó
el baseline mediante `migrate resolve --applied` sobre una copia existente y
conservó el catálogo de negocio, salvo `_prisma_migrations`. Este replay
child-at-LSN no es snapshot ni backup/restore gobernado. S14C conserva un receipt
externo saneado, pero no es un receipt gobernado de release ni una atestación
institucional.

El proyecto Neon observado se denomina `puntolimpio-staging-neon`; mientras no
se resuelva documentalmente su propiedad y alcance para MuniControl Junín, esa
ambigüedad bloquea DDL en Preview y Production.

En la superficie pública, el hotfix `e74339c` cerró la descarga del schema bajo
`/prisma/**` con un `404` sin su contenido. El deployment actual pasó el Release
Truth Gate **12/12**. Esto no cambia la evidencia histórica **11/11** de la
release `v1.10.0`, ni certifica la base de datos estable.

Si se elige otro PostgreSQL administrado u on-premise, debe satisfacer los
mismos contratos. El nombre del proveedor no reemplaza drift, migraciones,
aislamiento, backup/restore ni smokes.
