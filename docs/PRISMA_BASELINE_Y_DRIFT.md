# Procedimiento de baseline y drift Prisma

**Versi\u00f3n:** 1.2.0
**Fecha de corte:** 9 de agosto de 2026
**Estado:** WP0-L implementado y validado localmente (contrato v2 con fixtures); ejecución conectada pendiente; baseline real y atestación de release pendientes
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
- El contrato de observaci\u00f3n v2 y sus consultas allowlisted s\u00f3lo se probaron con
  adapters sint\u00e9ticos. Todav\u00eda no existe evidencia de compatibilidad din\u00e1mica
  contra una versi\u00f3n PostgreSQL restaurada real.
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

### WP0-L: observaci\u00f3n m\u00ednima fail-closed

`db:baseline:inspect` es un recolector local y exclusivamente read-only para la
copia restaurada. La URL s\u00f3lo se acepta desde `WP0_DATABASE_URL`; no existe flag
para pasarla por argumentos. En un host remoto exige `sslmode=verify-full`. La
\u00fanica excepci\u00f3n es loopback con `NODE_ENV=development` y nunca acredita un
entorno institucional.

Antes de usarlo, el operador de restore debe declarar fuera de esta herramienta,
mediante `ALTER DATABASE` sobre la copia restaurada y no mediante `ALTER ROLE` o
`ALTER SYSTEM`, los marcadores PostgreSQL persistentes
`municontrol.wp0_target_class=RESTORED_DISPOSABLE` y
`municontrol.wp0_target_id=target:<id-no-secreto>`. No se admite inyectarlos con
`options` en la URL ni con variables ambientales `PG*`; la URL debe contener la
credencial y no delega autenticaci\u00f3n a `pgpass` o `PGPASSWORD`. El adaptador
fija adem\u00e1s `default_transaction_read_only=on`, `row_security=off` y
`search_path=pg_catalog` al abrir la sesi\u00f3n. Antes de consultar identidad o
inventario exige esos valores exactos junto con la transacci\u00f3n read-only; si
`_prisma_migrations` tiene RLS, la observaci\u00f3n se rechaza
en lugar de aceptar una historia filtrada. El
inspector rechaza `NODE_TLS_REJECT_UNAUTHORIZED=0`, por lo que
`sslmode=verify-full` no puede quedar anulado globalmente desde Node. Tambi\u00e9n exige
que ambos valores existan en `pg_db_role_setting` para
`current_database()` y `setrole=0`; un valor heredado del rol o del sistema no
acredita la copia. La confirmaci\u00f3n CLI debe ser exactamente
`RESTORED_DISPOSABLE`, el target CLI debe coincidir con el target persistente y
el checkout debe estar limpio y sin flags `assume-unchanged` o `skip-worktree`.
Estas comprobaciones son obligatorias y no
convierten una DB productiva en una copia segura.

El contrato v2 exige PostgreSQL 12 o posterior. Verifica primero la identidad y
`server_version_num`; si la versi\u00f3n es menor, hace rollback antes de consultar
reloj, transporte, rol, inventario o historia. Este orden s\u00f3lo est\u00e1 cubierto por
fixtures en este sprint: todav\u00eda falta la prueba din\u00e1mica sobre un PostgreSQL
restaurado real.

El contrato v2 fija `prisma/schema.prisma` leyendo sus bytes directamente desde
el blob del commit verificado y registra `schemaSha256`; no hashea el archivo
mutable del working tree. La sesi\u00f3n debe usar una identidad dedicada sin
`SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`, membres\u00edas
de ning\u00fan tipo, permisos de creaci\u00f3n o `TEMP`, DML de tabla o columna, secuencias,
ejecuci\u00f3n de rutinas ni lectura total o parcial de relaciones de negocio. Si
existe `_prisma_migrations`, s\u00f3lo admite `SELECT` sobre esa tabla. `NOINHERIT` no
convierte una membres\u00eda en segura: `SET ROLE` puede volver alcanzable un rol
predefinido `pg_*` u otro rol otorgado, por lo que `role_membership_count` debe
ser exactamente cero. Un rol m\u00e1s poderoso bloquea la observaci\u00f3n.

Tambi\u00e9n compara el reloj PostgreSQL con el reloj del observador, con un skew
m\u00e1ximo de cinco minutos, y consulta `pg_stat_ssl` para registrar protocolo,
cipher y bits negociados. Esa metadata no prueba la cadena de certificados ni
que el hostname sea un endpoint directo del proveedor; ambos siguen pendientes
de atestaci\u00f3n externa.

Primero validar configuraci\u00f3n, sin conexi\u00f3n ni escritura:

```powershell
# WP0_DATABASE_URL se inyecta por el mecanismo local de secretos; no se pega en Git ni logs.
npm.cmd run db:baseline:inspect -- --check-config `
  --confirmation RESTORED_DISPOSABLE `
  --target-id target:<id-no-secreto> `
  --output <RUTA-ABSOLUTA-PRIVADA-FUERA-DEL-REPO.json> `
  --backup-ref backup:<id-externo> `
  --restore-ref restore:<id-externo> `
  --reviewer reviewer:<id-1> `
  --reviewer reviewer:<id-2>
```

S\u00f3lo despu\u00e9s, y sobre la copia autorizada, repetir los mismos argumentos con
`--connected`. Ese modo abre una transacci\u00f3n `REPEATABLE READ READ ONLY`, verifica
`transaction_read_only=on` y consulta \u00fanicamente cat\u00e1logos PostgreSQL y
`_prisma_migrations`. No lee filas de negocio, no ejecuta DDL/DML, no sobrescribe
el output y hace rollback ante fallos de consulta, identidad, transporte,
privilegios o seguridad de sesi\u00f3n. Los estados sem\u00e1nticos `absent`, `empty` e
`inconsistent` de la historia Prisma se conservan en un artefacto de
descubrimiento `discovery_non_approvable`; no se disfrazan como error de
conectividad ni pueden habilitar el baseline. S\u00f3lo `valid` produce colecci\u00f3n
`strict`, que aun as\u00ed sigue siendo observaci\u00f3n y no aprobaci\u00f3n.

Para que la historia sea `valid`, `_prisma_migrations` debe ser exactamente una
tabla ordinaria permanente con las ocho columnas Prisma esperadas, incluyendo
tipos, nulabilidad, identidad/generaci\u00f3n y defaults can\u00f3nicos (`0` y `now()`), y
una \u00fanica primary key sobre `id`. Cada `id` debe ser UUID can\u00f3nico y no puede
repetirse; tampoco pueden repetirse nombres de migraci\u00f3n. Una firma, default,
PK, UUID o fila incompatible degrada el estado a `inconsistent` y lo mantiene no
aprobable; una relaci\u00f3n cuya firma no coincide ni siquiera se consulta como
historia Prisma.
La consulta de filas usa columnas tipadas, no una proyecci\u00f3n `to_jsonb`, y
normaliza timestamps PostgreSQL equivalentes (por ejemplo `+00:00`) a ISO `Z`.
Aplica `LIMIT 10001` para detectar overflow y admite como m\u00e1ximo 10.000 filas,
1 KiB por campo y 4 MiB acumulados antes de ordenar. Los mismos l\u00edmites se
reaplican al snapshot can\u00f3nico que llega al sink.

```powershell
npm.cmd run db:baseline:inspect -- --connected `
  --confirmation RESTORED_DISPOSABLE `
  --target-id target:<id-no-secreto> `
  --output <RUTA-ABSOLUTA-PRIVADA-FUERA-DEL-REPO.json> `
  --backup-ref backup:<id-externo> `
  --restore-ref restore:<id-externo> `
  --reviewer reviewer:<id-1> `
  --reviewer reviewer:<id-2>
```

El output contiene inventario can\u00f3nico, digests, commit, `schemaSha256`, estado
de historia, seguridad del rol, reloj y metadata TLS. El inventario incluye
schemas, relaciones, columnas y defaults, tipos y enums, constraints, \u00edndices,
vistas, rutinas, extensiones, ACL/grants de schema/relaci\u00f3n/columna/tipo/rutina,
default ACL, policies, triggers, secuencias y particiones.

Las definiciones SQL, defaults, vistas, funciones y triggers se usan en memoria
s\u00f3lo para calcular `definitionSha256`; nunca se persiste el texto crudo en las
filas del artefacto. Antes de ordenar o serializar se aplican l\u00edmites cerrados:
20.000 filas de cat\u00e1logo, 1 KiB por nombre, 256 KiB por definici\u00f3n cruda y 4 MiB
acumulados. La rama `partition` incluye s\u00f3lo particiones declarativas con
`child.relispartition`; la herencia cl\u00e1sica de `pg_inherits` se registra por
separado como `ordinary_inheritance` y nunca se presenta como particionado.
PostgreSQL calcula primero ese budget con `octet_length`; si cualquier l\u00edmite
falla, devuelve un \u00fanico sentinel acotado y no transporta definitions crudas.
La salida normal queda adem\u00e1s acotada por `LIMIT 20001`; el orden can\u00f3nico se
aplica en memoria s\u00f3lo despu\u00e9s de validar el budget.

El sink acepta exclusivamente el schema v2 exacto, vuelve a calcular los
digests de cat\u00e1logo, historia e inventario y el `observationId`, exige todos los
flags de evidencia y aprobaci\u00f3n en `false`, y congela recursivamente el snapshot
validado. Un objeto arbitrario o un artefacto que autoafirme receipt, firma o
aprobaci\u00f3n no se escribe aunque recalcule su ID. El presupuesto total del JSON
de observaci\u00f3n es 10 MiB y se controla antes y despu\u00e9s de canonicalizar.
El sink vuelve a medir la serializaci\u00f3n pretty exacta, incluido el newline final,
antes de validar o abrir la ruta; un payload compacto que se expanda sobre el
l\u00edmite tampoco crea archivo.

Las referencias opacas de backup/restore y los dos IDs de revisores son entradas
del operador **no verificadas**. No existe todav\u00eda firma del proveedor, hash de
backup, v\u00ednculo criptogr\u00e1fico backup->restore ni prueba real de separaci\u00f3n de
funciones. El artefacto marca esas limitaciones y siempre mantiene
`approvalEligible:false`. Es una **observaci\u00f3n**, nunca un
approval, manifest, migraci\u00f3n, autorizaci\u00f3n DDL ni receipt de release. Debe quedar
fuera del checkout, en una ruta absoluta privada, nueva y sin symlinks/junctions.
La ruta se canonicaliza y se revalidan `realpath` e identidad `dev/ino` del
directorio padre, adem\u00e1s de archivo y handle, durante la
apertura exclusiva y despu\u00e9s de escribir; en POSIX el modo exigido es `0600`.
En Windows este recolector no atesta la DACL efectiva: esa limitaci\u00f3n y
`WINDOWS_DACL_NOT_ATTESTED` permanecen en toda observaci\u00f3n y deben cerrarse con
evidencia externa antes de cualquier uso institucional.
El directorio `scripts/` ya est\u00e1 excluido del bundle Vercel; este flujo tampoco
debe ejecutarse como Function o job de producci\u00f3n.

1. Congelar commit, digest del schema, target l\u00f3gico y ventana.
2. Crear backup privado y registrar identificador, RPO, tama\u00f1o y custodio.
3. Restaurar el backup en un branch o PostgreSQL descartable.
4. Inventariar schemas, relaciones, columnas/defaults, tipos/enums, constraints,
   \u00edndices, vistas, rutinas, extensiones, ACL/grants, policies, triggers,
   secuencias, particiones y owners.
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

Las pruebas de
[`../tests/prisma-baseline-observation.test.mjs`](../tests/prisma-baseline-observation.test.mjs)
cubren el contrato v2: allowlist read-only, hash del schema desde el blob Git,
checkout limpio, identidad persistente del restore, rol least-privilege,
rechazo de membres\u00edas incluso con `NOINHERIT`, gate PostgreSQL 12+, reloj/skew,
TLS negociado, inventario ampliado con definitions hasheadas y l\u00edmites duplicados,
firma f\u00edsica/PK/UUID Prisma, RLS fail-closed, particiones declarativas, sink v2
contra artefactos forjados y Proxy din\u00e1mico, timestamps con offset, herencia
ordinaria separada, caps de historia/artefacto, budget/sentinel SQL, frontera
pretty, output exclusivo y estados `valid`, `absent`, `empty` e `inconsistent`.
Son fixtures con adapter inyectado; no certifican PostgreSQL,
proveedor, DACL Windows, backup, restore ni drift reales.

Los fixtures prueban la l\u00f3gica del gate. No son evidencia de una DB municipal,
un backup real ni un restore real.
