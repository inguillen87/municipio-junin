# Procedimiento de baseline y drift Prisma

**Versi\u00f3n:** 1.0.0  
**Fecha de corte:** 8 de agosto de 2026  
**Estado:** preflight implementado; baseline conectado y atestación de release pendientes  
**Alcance:** esquema core Prisma y futura migraci\u00f3n RBAC/ABAC

## 1. Decisi\u00f3n operativa

MuniControl no aplicar\u00e1 migraciones contra una base municipal solamente porque
`schema.prisma` valide o porque exista un `migration.sql`. Primero necesitamos
demostrar qu\u00e9 objetos existen realmente, qu\u00e9 historia fue aplicada, qu\u00e9 drift
es esperado y que un restore funciona.

El gate implementado separa tres capas:

1. **Integridad offline:** el checkout contiene exactamente el schema, baseline y
   migraciones aprobados, sin archivos extra, enlaces ni hashes divergentes.
2. **Evidencia conectada de preflight:** una auditor\u00eda externa y reciente vincula
   ese set a un target identificado, inventario, estado de `_prisma_migrations`,
   diff, backup, restore y dos revisores.
3. **Autorización de release:** una atestación institucional firmada por
   CI/KMS/OIDC debe vincular workload, target, commit, migration set, evidencia
   conectada y ventana, con protección contra replay. Esta capa no existe aún.

Ninguna reemplaza a las demás. Un receipt pineado prueba la integridad del
artefacto recibido y permite evaluar su estructura; no demuestra por sí solo que
la base siga sin drift ni autoriza DDL. Por eso `--release` termina siempre con
`RELEASE_ATTESTATION_NOT_GOVERNED`, incluso ante un receipt bien formado.

## 2. Estado comprobado del checkout

- `prisma/schema.prisma` valida est\u00e1ticamente.
- `prisma/proposals/rbac-abac-v1.prisma` es una propuesta aislada; no es una
  migraci\u00f3n aplicable.
- No existe todav\u00eda `prisma/migrations/` ni `migration_lock.toml`.
- Los SQL de `database/migrations/` y `migrations/` no forman una historia Prisma
  compatible. Hay nombres de tablas que colisionan con estructuras diferentes.
- No se inspeccion\u00f3 ni modific\u00f3 ninguna base remota en este sprint.
- `npm.cmd run db:baseline:status` debe finalizar con c\u00f3digo 1 y
  `MIGRATIONS_MISSING`. Ese rojo es intencional.

No se debe volver verde el gate generando un baseline desde el schema supuesto.
El baseline nace del estado real restaurado y conciliado.

## 3. Fronteras que el gate verifica

El script [`../scripts/assert-prisma-migrations.mjs`](../scripts/assert-prisma-migrations.mjs)
rechaza:

- ausencia de schema, directorio de migraciones, lock o manifest;
- provider diferente de PostgreSQL;
- migraciones vac\u00edas, faltantes, extra o con nombre no can\u00f3nico;
- archivos adicionales o symlinks bajo `prisma/migrations`;
- diferencias en SHA-256 del schema o de cualquier `migration.sql`;
- un `baselineId` o `migrationSetId` que no derive del contenido can\u00f3nico;
- pins ambientales ausentes o distintos;
- receipt dentro del repositorio, no pineado o vencido;
- target diferente, evidencia incompleta o menos de dos revisores independientes;
- historia, drift o restore no aprobados en el receipt externo.

Después de evaluar esas condiciones, el modo `--release` agrega siempre
`RELEASE_ATTESTATION_NOT_GOVERNED`. El checkout no posee una llave, claim o
variable ambiental que pueda convertir el receipt en autorización.

`baselineId` identifica de forma inmutable la primera migraci\u00f3n baseline.
`migrationSetId` identifica el schema y la lista completa de migraciones de un
release. Agregar RBAC cambia el segundo, nunca el primero.

## 4. Comandos seguros y comandos prohibidos

Inspecci\u00f3n offline actual:

```powershell
npm.cmd run db:baseline:status
```

Validaci\u00f3n est\u00e1tica, usando URLs locales ficticias sin conexi\u00f3n:

```powershell
$env:DATABASE_URL='postgresql://schema_user:schema_pass@localhost:5432/municontrol'
$env:DIRECT_URL=$env:DATABASE_URL
npm.cmd run db:validate
npx.cmd prisma validate --schema prisma/proposals/rbac-abac-v1.prisma
```

En una base compartida o municipal est\u00e1 prohibido ejecutar:

- `prisma db push`;
- `prisma migrate dev`;
- `prisma migrate reset`;
- `DROP`, `TRUNCATE` o DDL manual sin change-id y rollback aprobado;
- editar o borrar filas de `_prisma_migrations`;
- marcar un baseline como aplicado antes de probarlo en una copia restaurada.

El atajo `db:migrate:dev` fue retirado de `backend/package.json`. La ausencia del
atajo no reemplaza los controles de acceso de la DB: el rol de release debe ser
distinto del rol de aplicaci\u00f3n.

## 5. WP0 conectado sobre una copia descartable

Este procedimiento requiere autorizaci\u00f3n para una DB de restauraci\u00f3n. Nunca se
ejecuta primero sobre producci\u00f3n.

1. Congelar commit, digest del schema, target l\u00f3gico y ventana.
2. Crear backup privado y registrar identificador, RPO, tama\u00f1o y custodio.
3. Restaurar el backup en un branch o PostgreSQL descartable.
4. Inventariar schemas, tablas, columnas, enums, constraints, \u00edndices, vistas,
   funciones, extensiones, owners y grants.
5. Inventariar `_prisma_migrations` y calcular un digest can\u00f3nico.
6. Ejecutar introspecci\u00f3n a stdout o a un artefacto privado, sin sobrescribir el
   schema activo:

   ```powershell
   npx.cmd prisma db pull --schema prisma/schema.prisma --print
   ```

7. Obtener diff en ambas direcciones contra la copia restaurada:

   ```powershell
   npx.cmd prisma migrate diff `
     --from-schema-datasource prisma/schema.prisma `
     --to-schema-datamodel prisma/schema.prisma `
     --script

   npx.cmd prisma migrate diff `
     --from-schema-datamodel prisma/schema.prisma `
     --to-schema-datasource prisma/schema.prisma `
     --script
   ```

8. Clasificar cada objeto como core Prisma, custom gobernado, legacy en
   cuarentena o retiro mediante migraci\u00f3n expl\u00edcita.
9. Construir un baseline curado que reproduzca la DB desde cero.
10. Aplicarlo a una DB vac\u00eda y comparar inventario y constraints.
11. En otra copia restaurada, marcar s\u00f3lo ese baseline como aplicado:

    ```powershell
    npx.cmd prisma migrate resolve --applied <baseline_exacto> `
      --schema prisma/schema.prisma
    npm.cmd run db:migrate:status
    ```

12. Confirmar cero drift inesperado y ensayar restore otra vez.

`migrate resolve --applied` escribe en `_prisma_migrations`; s\u00f3lo se autoriza en
la copia restaurada durante WP0. No crea tablas ni valida que el baseline sea
correcto. Por eso se ejecuta despu\u00e9s de la comparaci\u00f3n, no antes.

## 6. Manifest offline

El manifest can\u00f3nico vivir\u00e1 como
`prisma/migrations/baseline-manifest.json` cuando WP0 termine. No existe todav\u00eda.
Su contrato exacto es:

```json
{
  "contractVersion": 1,
  "provider": "postgresql",
  "prismaMajor": 5,
  "baselineId": "prisma-baseline-<sha256>",
  "baselineMigration": {
    "directory": "YYYYMMDDHHMMSS_baseline",
    "sha256": "<sha256-normalizado>"
  },
  "schemaSha256": "<sha256-normalizado>",
  "migrationHistorySha256": "<sha256-can\u00f3nico>",
  "migrationSetId": "prisma-set-<sha256>",
  "migrations": [
    {
      "directory": "YYYYMMDDHHMMSS_baseline",
      "sha256": "<sha256-normalizado>"
    }
  ]
}
```

No contiene `approved:true`, URLs de DB, nombres de servidor ni secretos. El
script deriva ambos IDs y rechaza cualquier valor autoafirmado que no coincida.

## 7. Receipt externo de preflight

El receipt no se guarda en Git. Un job conectado controlado lo emite despu\u00e9s de
status, diff y restore, y el pipeline recibe:

- `PRISMA_BASELINE_ID`;
- `PRISMA_MIGRATION_SET_ID`;
- `PRISMA_TARGET_ID`;
- `PRISMA_DRIFT_RECEIPT_PATH`;
- `PRISMA_DRIFT_RECEIPT_SHA256`.

El receipt incluye IDs del baseline/set/target, herramienta y run, fingerprints
del schema y `_prisma_migrations`, hashes de status/diff, referencias no secretas
de backup/restore, migraciones pendientes, dos revisores y una vigencia m\u00e1xima
de 60 minutos. Debe residir fuera del checkout y ser un archivo regular.

Este receipt es evidencia estructural de una comprobación conectada, no la
comprobación en sí ni una autorización. No contiene una firma institucional
verificable, identidad de workload, anti-replay o vínculo criptográfico con el
commit. El futuro pipeline deberá verificar esos elementos bajo freeze de DDL;
hasta entonces no hay deploy de migraciones desde este checkout.

## 8. Aplicación futura y rollback

El comando de aplicación existe, pero hoy es un control negativo:

```powershell
npm.cmd run db:migrate:deploy
```

El script ejecuta `--release` y debe terminar con código `1` y
`RELEASE_ATTESTATION_NOT_GOVERNED` antes de invocar Prisma. `--offline` tampoco
habilita un deploy. Sólo un cambio de código revisado que valide una atestación
institucional CI/KMS/OIDC podrá abrir este gate en un sprint futuro; no se
aceptarán bypasses ambientales o receipts autoafirmados.

Si el baseline marcado es incorrecto, se restaura la copia previa. No se borran
filas de `_prisma_migrations` para simular una reparaci\u00f3n. Las migraciones RBAC
ser\u00e1n aditivas y separadas del baseline; su rollback de aplicaci\u00f3n sigue
`database -> intersect -> shadow`, sin ampliar permisos. Los errores de DDL se
corrigen con forward-fix o restore, no con un `DROP` urgente de auditor\u00eda,
sesiones o asignaciones.

## 9. Gate antes de crear cuentas por rol

No se aprovisionan cuentas de demostraci\u00f3n o institucionales hasta probar:

- baseline y drift conectados;
- tablas lifecycle, sesiones y credenciales de un solo uso;
- expiraci\u00f3n y revocaci\u00f3n inmediata;
- MFA para perfiles privilegiados;
- asignaciones con tenant, scope y vigencia;
- doble aprobaci\u00f3n y SoD;
- auditor\u00eda append-only;
- smokes allow/deny/cross-tenant;
- desactivaci\u00f3n y restore ensayados.

Mientras tanto, las altas Express que reciben una contraseña administrativa
responden `410 ACCOUNT_LIFECYCLE_NOT_GOVERNED` y PUT/PATCH de tenant responde
`410 TENANT_LIFECYCLE_NOT_GOVERNED`. `db:seed` termina con código `1`, no acepta
secretos, no conecta a PostgreSQL y no crea identidades.

## 10. Evidencia automatizada

Las pruebas de [`../tests/prisma-migration-gate.test.mjs`](../tests/prisma-migration-gate.test.mjs)
cubren:

- checkout actual bloqueado;
- separaci\u00f3n baseline/set;
- receipt sintético bien formado que sigue bloqueado por falta de atestación;
- alteraci\u00f3n de SQL y archivos extra;
- receipt dentro del repositorio;
- receipt vencido;
- revisores duplicados;
- modo expl\u00edcito obligatorio.

Los fixtures prueban la l\u00f3gica del gate. No son evidencia de una DB municipal,
un backup real ni un restore real.
