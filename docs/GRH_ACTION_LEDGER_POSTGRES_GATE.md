# Gate PostgreSQL del ledger de decisiones GRH

Versión del contrato: `grh-action-ledger-postgres-verification-v1`
Migración observada: `20260811190000_grh_action_ledger`

Este gate comprueba en PostgreSQL que el ledger de decisiones GRH desplegado
coincide con la migración gobernada. La observación es estrictamente de sólo
lectura: no aplica migraciones, no inserta compromisos, no ensaya transiciones y
no autoriza DDL sobre Preview o Production.

## Alcance exacto

El comando `db:grh-ledger:verify` fija primero los bytes locales mediante
`prisma/migrations/baseline-manifest.json`. Después, dentro de una transacción
`REPEATABLE READ READ ONLY`, comprueba:

- una única fila finalizada y no revertida en `_prisma_migrations`, con el
  nombre y SHA-256 exactos;
- PostgreSQL 12 o posterior y `transaction_read_only=on`;
- las dos tablas y la secuencia `BIGSERIAL` persistentes;
- 4 enums y sus 16 valores ordenados;
- las 37 columnas, tipos, nulabilidad y defaults gobernados;
- los 15 constraints validados, no diferibles y con la definición canónica
  exacta de las reglas tenant-bound; conservar palabras esperadas y agregar una
  debilitación como `OR TRUE` no alcanza para aprobar;
- los 10 índices `btree` válidos y listos, con primary/unique, columnas y orden
  exactos, sin predicados, expresiones ni columnas `INCLUDE`;
- ambos triggers habilitados con su definición canónica exacta de protección
  append-only; una cláusula adicional como `WHEN (false)` se rechaza;
- la función `plpgsql` de rechazo, no `SECURITY DEFINER`, y su fuente canónica
  exacta leída desde `pg_proc.prosrc`; un retorno anterior al `RAISE` se rechaza;
- ausencia de `UPDATE`, `DELETE` y `TRUNCATE` para `PUBLIC` sobre eventos.

La salida contiene solo un `targetId` opaco, versiones, conteos y fingerprints.
`databaseTargetFingerprintSha256` se deriva de la URL efectiva con el contrato
`municontrol-database-target-v1`: no incluye usuario ni password, normaliza las
variantes Neon direct/pooler del mismo endpoint y conserva la diferencia entre
branches. No imprime URL, host, base, usuario ni credencial.

## 1. Validar configuración sin conectar

La única fuente de conexión aceptada es
`GRH_ACTION_LEDGER_VERIFY_DATABASE_URL`. Para validar contrato, argumentos y
política de URL sin abrir un socket:

```powershell
$env:GRH_ACTION_LEDGER_VERIFY_DATABASE_URL = '<secreto inyectado>'
npm.cmd run db:grh-ledger:verify -- `
  --check-config `
  --confirmation READ_ONLY_CATALOG `
  --target-id target:ledger-copy-01
```

La URL debe usar PostgreSQL. Fuera de loopback exige contraseña y
`sslmode=verify-full`. Variables ambientales `PGHOST`, `PGUSER`, `PGPASSWORD`,
`PGOPTIONS` y equivalentes se rechazan para impedir overrides silenciosos.

## 2. Ejecutar sólo contra una copia local o descartable

La copia debe haber recibido previamente la historia Prisma completa mediante
el procedimiento aislado de plataforma. El verificador no la crea ni la
modifica. Con una credencial de observación y un target inequívocamente
descartable:

```powershell
$env:GRH_ACTION_LEDGER_VERIFY_DATABASE_URL = '<secreto de lectura inyectado>'
npm.cmd run db:grh-ledger:verify -- `
  --connected `
  --confirmation READ_ONLY_CATALOG `
  --target-id target:ledger-copy-01
```

Un resultado `status:"verified"` acredita únicamente que ese catálogo, en ese
momento, coincide con el contrato del ledger. El fingerprint puede guardarse en
el sistema externo de evidencia del job; no se debe versionar una URL ni un
receipt con secretos en este repositorio.

Para autorizar el smoke mutante, se copia exclusivamente el valor
`databaseTargetFingerprintSha256` del receipt conectado a
`MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT`. El smoke exige que el mismo
fingerprint vuelva como header autenticado del API antes de escribir.

## Fallos cerrados relevantes

| Código | Significado |
|---|---|
| `LOCAL_MANIFEST_INVALID` | El checkout no coincide con el manifest gobernado. |
| `LOCAL_MIGRATION_DIGEST_MISMATCH` | Cambiaron los bytes de la migración. |
| `MIGRATION_HISTORY_MISMATCH` | Falta, se revirtió o no coincide la fila Prisma. |
| `READ_ONLY_POSTGRES_SESSION_INVALID` | La sesión no es read-only o PostgreSQL es anterior a 12. |
| `CATALOG_CONTRACT_MISMATCH` | Algún objeto, regla, índice, trigger o ACL no coincide. |
| `AMBIENT_POSTGRES_ENV_FORBIDDEN` | Otra variable `PG*` intentó alterar identidad o sesión. |

Ante cualquier fallo se ejecuta `ROLLBACK`; nunca se intenta reparar el target.

## Evidencia y límites

Las pruebas locales usan un adapter inyectado para demostrar la allowlist SQL,
el contrato exacto, el rollback, la sanitización y los rechazos. No equivalen a
una ejecución contra PostgreSQL real. La evidencia dinámica existe recién
cuando `--connected` termina correctamente sobre una copia local o descartable
identificada.

El segundo hardening conectado del 11 de agosto de 2026 fijó las firmas exactas
sobre el child Neon descartable `codex-ledger-signatures-20260811`
(`br-sparkling-band-acg0s3ov`). PostgreSQL `170010` aprobó 15 constraints, 10
índices, 2 triggers y la fuente exacta de la función; el fingerprint de catálogo
resultante fue
`d35c68163bf67919486822070b39d41e692be28f3263836aba559af5a16bf4ba`.
El child se eliminó después del PASS y el listado de control volvió a mostrar
únicamente `main` y `municipio-junin-preview-s14b`, ambos `ready`. No se
aplicaron ni marcaron migraciones sobre esos branches estables.

Este receipt tampoco prueba backup/restore, compatibilidad de carga, smoke HTTP
autenticado, identidad institucional, doble revisión ni autorización de
release. Es una precondición estructural para continuar con Preview; nunca una
habilitación para aplicar DDL estable.
