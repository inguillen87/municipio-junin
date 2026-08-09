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

- No existe todavía una historia Prisma baseline revisada; el gate de migración
  debe bloquear hasta comparar la base destino y aprobar el baseline.
- No ejecutar `prisma db push`, `migrate reset` ni SQL heredado contra una base
  municipal.
- Una importación requiere PostgreSQL, tenant, autorización y confirmación de
  parseo/persistencia; subir un archivo no lo convierte en dato operativo.
- No abrir el puerto de PostgreSQL a Internet. Usar TLS, reglas de red mínimas,
  secretos administrados y, cuando corresponda, VPN o conectividad privada.
- No declarar un backup operativo hasta restaurarlo y reconciliarlo.

Si se elige otro PostgreSQL administrado u on-premise, debe satisfacer los
mismos contratos. El nombre del proveedor no reemplaza drift, migraciones,
aislamiento, backup/restore ni smokes.
