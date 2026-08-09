# Neon PostgreSQL + Prisma — procedimiento reproducible

Este documento describe la preparación técnica. No certifica que una base
remota, un preview ni producción estén actualizados: esa evidencia se obtiene
con migraciones revisadas y smokes contra el deployment concreto.

## Fuentes canónicas

- Esquema Prisma: `prisma/schema.prisma`.
- Cliente Serverless: `node_modules/@prisma/client`, generado desde la raíz.
- Cliente Express: `backend/generated/prisma`, generado dentro de `backend`.
- `DATABASE_URL`: conexión de runtime, normalmente mediante pooler.
- `DIRECT_URL`: conexión directa obligatoria para inspección y migraciones.

El backend no debe resolver por accidente el cliente generado en el
`node_modules` raíz. Sus scripts indican siempre el esquema y generador exactos.

## 1. Crear las conexiones

En Neon, crear una base PostgreSQL y obtener dos cadenas TLS:

```text
DATABASE_URL=postgresql://...pooler.../db?sslmode=verify-full
DIRECT_URL=postgresql://...direct.../db?sslmode=verify-full
```

No guardar cadenas reales en Git, capturas, tickets ni manuales. Para desarrollo
local, copiar `backend/.env.example` a `backend/.env` y completar secretos fuera
del repositorio. Los comandos ejecutados desde la raíz deben recibir las mismas
variables desde el entorno o desde un `.env` local ignorado por Git.

## 2. Instalación y generación

Desde la raíz del repositorio:

```bash
npm ci
npm --prefix backend ci
npm run db:generate
npm --prefix backend run db:generate
```

Verificaciones esperadas:

```bash
npx prisma validate --schema prisma/schema.prisma
npm --prefix backend run db:status
```

`db:generate` funciona desde ambos directorios y produce clientes independientes.
El estado de migraciones sí requiere `DIRECT_URL` accesible.

## 3. Migraciones: gate obligatorio

No ejecutar `prisma db push`, `migrate reset` ni SQL copiado manualmente en
producción. Este checkout todavía requiere comparar el esquema Prisma y las
migraciones SQL gobernadas con la base real antes de aplicar cambios.

- `migrations/001_data_intelligence.sql` contiene tablas analíticas legacy sin
  `tenant_id`; sólo es admisible en un deployment dedicado y vinculado mediante
  `LEGACY_ANALYTICS_TENANT_ID`.
- `migrations/002_grh_artifacts.sql` crea la materialización GRH privada y
  tenant-bound.
- Una base existente debe auditar drift y datos antes de establecer un baseline.
- Una base nueva necesita una historia Prisma revisada; no se debe improvisar
  durante el deploy.
- El contrato offline, receipt conectado, freeze de DDL, restore y rollback están
  definidos en [`docs/PRISMA_BASELINE_Y_DRIFT.md`](docs/PRISMA_BASELINE_Y_DRIFT.md).

Después de preparar la revisión y disponer de backup/restauración probada sólo
pueden ejecutarse los controles no mutantes:

```bash
npm --prefix backend run db:baseline:status
npm --prefix backend run db:status
```

`db:baseline:status` permanece rojo en este checkout hasta construir el baseline
desde una copia restaurada de la DB real. No crear un manifest para silenciarlo.
Aunque el baseline y un receipt sintácticamente válido existan, `db:migrate`
permanece bloqueado con `RELEASE_ATTESTATION_NOT_GOVERNED`. El receipt sólo es
evidencia estructural de preflight; no autoriza DDL. La habilitación futura exige
una atestación institucional firmada por CI/KMS/OIDC, identidad de workload,
protección contra replay y vínculo exacto con target, commit y migration set.

## 4. Aprovisionamiento retirado

El antiguo bootstrap con contraseñas está retirado. El comando se conserva como
un gate fail-closed verificable:

```bash
npm --prefix backend run db:seed
```

El resultado esperado es código `1` con
`ACCOUNT_LIFECYCLE_NOT_GOVERNED`. El gate no acepta secretos, no inspecciona
variables de aprovisionamiento, no conecta a Neon/PostgreSQL y no crea ni
modifica filas. Un resultado `0` o cualquier escritura bloquea el release.

No se crean cuentas por rol hasta que una migración revisada y sus E2E prueben
invitación de un solo uso, MFA, sesiones revocables, vigencia, doble
aprobación/SoD y auditoría transaccional. Las altas Express de tenants y usuarios
con contraseña administrativa también responden `410` con el mismo código; las
mutaciones de lifecycle de tenant responden `410 TENANT_LIFECYCLE_NOT_GOVERNED`.

## 5. Materialización GRH privada

1. Generar los contratos agregados desde el backup GRH canónico.
2. Validar `api/lib/grh-contract.js` y las pruebas Python/Node.
3. Aplicar la migración `grh_artifacts` revisada.
4. Configurar `GRH_SOURCE_SHA256` con el hash exacto del manifiesto aprobado.
   Toda lectura DB exige este pin y el bundle activo completo `profile + semantic`.
5. Publicar mediante `scripts/publish_grh_artifacts.mjs` con el CUID real del
   tenant en `GRH_TENANT_ID`.
6. Confirmar que metadatos DB y payload coinciden, que los conteos focales del
   perfil reconcilian con el diccionario semántico y que ningún JSON real se
   incluyó en Git o el bundle Vercel.

`personas_junin` está expresamente fuera de alcance y no debe cruzarse con GRH.

## 6. Verificación remota

En preview, antes de producción:

- `/api/auth/me` anónimo: `401`.
- `/api/grh-executive` y `/api/grh-quality` anónimos: `401`.
- `/api/grh-data` anónimo: `401`; rol/tenant denegado: `403`; sesión autorizada
  del tenant GRH: `410 GRH_RAW_CONTRACT_RETIRED`, sin leer artefactos.
- Usuario de otro tenant contra GRH/importaciones: `403`.
- Usuario autorizado con el par privado materializado: `200` en las proyecciones
  ejecutiva y de calidad; ningún navegador recibe `profile` ni `semantic`.
- DB, pin SHA o uno de los dos contratos ausente/incoherente: `503`, sin datos demo.
- Express opcional: `/api/health` para liveness y `/api/readiness` para readiness.

Registrar URL, deployment ID, fecha y resultado. Una suite local no reemplaza
esta certificación.
