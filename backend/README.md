# Backend Express de compatibilidad

Este proceso expone autenticación y operaciones administrativas que validan la
identidad vigente contra Prisma. No publica el checkout, archivos subidos ni
datasets sin aislamiento por municipio.

## Inicio local

```bash
cd backend
npm ci
cp .env.example .env
npm run dev
```

Variables mínimas:

- `DATABASE_URL`: obligatoria para validar identidades y datos.
- `JWT_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `LEGACY_ANALYTICS_TENANT_ID`: CUID exacto del municipio propietario de las
  tablas analíticas legacy.

Sin base o autenticación configuradas, las rutas protegidas fallan cerradas;
no existe respaldo sintético ni memoria local presentada como fuente real.

## Superficies vigentes

| Método | Ruta | Contrato |
|---|---|---|
| POST | `/api/auth/login` | Emite JWT sólo para un usuario vigente en Prisma. |
| GET | `/api/auth/me` | Revalida rol, tenant y estado actual. |
| POST | `/api/auth/refresh` | Retirado (`410`) hasta disponer de sesiones revocables, rotación y detección de reutilización. |
| GET | `/api/health` | Estado técnico, sin datos municipales. |
| GET | `/api/readiness` | `200` sólo si PostgreSQL responde; `503` en otro caso. |
| POST | `/api/admin/tenants` | Retirado (`410 ACCOUNT_LIFECYCLE_NOT_GOVERNED`). |
| POST | `/api/admin/users` | Retirado (`410 ACCOUNT_LIFECYCLE_NOT_GOVERNED`). |
| PUT/PATCH | `/api/admin/tenants/:id` | Retirado (`410 TENANT_LIFECYCLE_NOT_GOVERNED`). |

`/api/contratos`, `/api/empleados`, `/api/reclamos` y `/api/archivos` requieren
un modelo tenant-bound que todavía no existe en Express. Por seguridad,
responden `410 TENANT_DATASET_REQUIRED`; la carga y el parser legacy fueron
retirados.

## Aprovisionamiento retirado

El SQL `database/migrations/001_initial.sql` es un esquema legacy y nunca crea
usuarios. La base actual debe prepararse mediante el flujo de migraciones Prisma
revisado del repositorio.

El comando permanece visible para que automatizaciones antiguas fallen de forma
explícita y auditable:

```bash
npm run db:seed
```

Siempre termina con código `1` y
`ACCOUNT_LIFECYCLE_NOT_GOVERNED`. No lee secretos, no abre una conexión a la DB
y no crea tenants ni usuarios. Tampoco existen variables de seed vigentes.

No se aprovisionará ninguna cuenta por rol hasta implementar y probar invitación
de un solo uso, MFA para perfiles privilegiados, sesiones revocables, separación
de funciones/doble aprobación y auditoría transaccional. Las altas administrativas
que recibían una contraseña conocida permanecen retiradas con el mismo código.

## Prisma reproducible

El esquema vive en `../prisma/schema.prisma`; este paquete genera su cliente en
`generated/prisma` y nunca depende del cliente del proyecto raíz:

```bash
npm run db:generate
npm run db:baseline:status
npm run db:status
```

`npm run db:migrate` está bloqueado incluso con un receipt bien formado:
`--release` devuelve `RELEASE_ATTESTATION_NOT_GOVERNED`. El receipt es evidencia
estructural de preflight, no autorización. Sólo una atestación institucional
firmada por CI/KMS/OIDC podrá habilitar el deploy en un sprint futuro. No usar
`db push`, `migrate reset` ni `migrate dev` contra una base municipal. El
procedimiento está en `../docs/PRISMA_BASELINE_Y_DRIFT.md`.
