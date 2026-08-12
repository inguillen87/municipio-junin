# Procedimiento de despliegue — MuniControl Junín

La superficie primaria es Vercel Serverless (`api/**` + frontend estático). El
backend Express es una compatibilidad opcional y no publica el checkout, uploads
ni datasets tenantless. Código local validado no significa código desplegado.

## 1. Gates previos

No crear un deployment candidato si alguno falla:

```bash
npm ci
npm audit --omit=dev --audit-level=low
npm --prefix backend ci
npm --prefix backend audit --omit=dev --audit-level=low
npm test
npm run test:backend
```

También son obligatorios:

- contrato semántico GRH válido y agregado, sin PII;
- manifest y baseline Prisma versionados, regenerables y validados offline con
  sus pins exactos;
- migraciones revisadas contra la base destino y autorización institucional de
  DDL; un gate offline verde no satisface este punto;
- backup recuperable y ensayo de restauración;
- `git diff --check`, sintaxis y QA desktop/móvil;
- cero artefactos GRH JSON dentro del repositorio o bundle;
- revisión de cambios y commit identificable. Este documento no autoriza por sí
  mismo a hacer commit, push o deploy.

## 2. Variables por runtime

Nunca usar los textos de esta tabla como valores. Los secretos deben generarse
con entropía real y guardarse en el gestor de secretos del entorno.

| Grupo | Variables | Condición |
|---|---|---|
| Base | `DATABASE_URL`, `DIRECT_URL` | Obligatorias; toda URL remota debe usar `sslmode=verify-full`. |
| Gate Prisma | `PRISMA_BASELINE_ID`, `PRISMA_MIGRATION_SET_ID`, `PRISMA_TARGET_ID`, `PRISMA_DRIFT_RECEIPT_PATH`, `PRISMA_DRIFT_RECEIPT_SHA256` | Manifest exacto y receipt conectado externo, reciente y pineado; nunca guardar URLs o secretos en el receipt. |
| Sesión | `JWT_SECRET` (mín. 32; recomendado 64+), `JWT_EXPIRES` | Obligatoria. |
| Tenants | `GRH_TENANT_ID`, `LEGACY_ANALYTICS_TENANT_ID` | CUID real, nunca slug; reclamos públicos están retirados. |
| Fuente GRH | `GRH_SOURCE_SHA256` | SHA-256 exacto del backup aprobado. Toda lectura DB exige el bundle activo `profile + semantic` y compara metadatos/payload contra este pin. |
| Cron | `CRON_SECRET` | Obligatoria si se habilita el cron. Debe ser distinta de JWT. |
| Orígenes | `PUBLIC_APP_URL`, `PUBLIC_APP_ORIGINS`, `VERCEL_URL` | Base pública de enlaces y allowlist CORS HTTPS; `FRONTEND_URL` no autoriza CORS. |
| WhatsApp | `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Sólo si se habilita Meta. Sin defaults. |
| Conectores | `DATA_CONNECTOR_ALLOWED_HOSTS`, `DATA_CONNECTOR_ALLOW_PRIVATE=false` | Sólo hosts PostgreSQL aprobados. |

En producción `ALLOW_LOCAL_GRH_ARTIFACTS` debe permanecer ausente o desactivada.
No existen variables de seed vigentes: `db:seed` es un gate retirado que termina
con código `1`, no acepta secretos y no conecta a la base.

Los 13 modelos GRH mapeados con `@@ignore` preservan las tablas observadas al
generar migraciones y no aparecen en Prisma Client. `@@ignore` no revoca permisos
SQL, no configura RLS y no protege frente a credenciales owner; la release debe
exigir un rol runtime de mínimo privilegio y ACL verificadas antes de cualquier
lector GRH.

## 3. Preview

1. Crear un preview desde un commit revisado.
2. Cargar `PRISMA_BASELINE_ID` y `PRISMA_MIGRATION_SET_ID` directamente desde el
   manifest versionado y ejecutar `db:baseline:manifest:check` y
   `db:baseline:status`. Ambos pueden pasar offline; no conectan ni autorizan DDL.
3. Ejecutar el preflight conectado de
   [`docs/PRISMA_BASELINE_Y_DRIFT.md`](docs/PRISMA_BASELINE_Y_DRIFT.md); revisar
   identidad del target, drift, backup y restore sin aplicar ni marcar una
   migración. `--release` permanece bloqueado con
   `RELEASE_ATTESTATION_NOT_GOVERNED` hasta implementar atestación institucional
   CI/KMS/OIDC.
4. Configurar `GRH_SOURCE_SHA256` desde el manifiesto aprobado; no copiarlo de una fila DB no verificada.
5. Materializar `profile` y `semantic` GRH en `grh_artifacts` para el tenant.
6. Ejecutar smokes anónimos, por rol y cross-tenant; un bundle incompleto, un metadata drift o un SHA distinto deben responder `503`.
7. Validar dashboards, impresión, móvil, modo reducido y fallas `503`.
8. Ejecutar el Release Truth Gate sin token ni cookie:

   ```bash
   npm run release:truth:check -- --base-url https://preview-approved.example
   ```

   Debe terminar con código `0`. El receipt JSON conserva sólo origen, política,
   huellas públicas, estados, tamaños y códigos; no contiene cuerpos, PII, tokens
   ni errores crudos.
9. Guardar evidencia: URL, deployment ID, commit, DB branch, fecha, operador y
   receipt del gate en el sistema externo de release; no commitear receipts.

El upgrade privado local `grh-directory-v3` tiene un ensayo DDL separado y
fail-closed para una rama Preview con base realmente descartable. El flujo,
los dos fingerprints obligatorios, el cleanup y la evidencia exigida están en
[`docs/GRH_DIRECTORY_PREVIEW_REHEARSAL.md`](docs/GRH_DIRECTORY_PREVIEW_REHEARSAL.md).
No debe ejecutarse mientras Preview y Producción resuelvan a la misma huella de
base. En este corte la cadena aditiva `003 + 004 + 005` y el contrato v3 se
validaron sólo en local: no se ejecutaron contra Preview, Production ni una DB
remota y no autorizan deployment o promoción.

El Centro de decisiones tiene un gate externo separado, documentado en
[`docs/GRH_ACTION_LEDGER_CANDIDATE_SMOKE.md`](docs/GRH_ACTION_LEDGER_CANDIDATE_SMOKE.md).
`npm run smoke:grh-ledger:candidate` es read-only respecto del ledger. El script
read-only admite un target `preview` o el candidato final `production` creado
con `--prod --skip-domain`, pero siempre rechaza el alias estable. El script
mutante se rechaza salvo que el deployment sea `READY`/`preview`, la URL única,
el ID y Git SHA estén pineados y se aporte el fingerprint SHA-256 de un target
disposable autorizado. Nunca debe ejecutarse el recorrido mutante contra el
alias estable ni contra un deployment cuyo target sea Production.

### Replay descartable S14C: evidencia útil, no promoción

S14C verificó el baseline sobre dos hijos Neon descartables creados en un LSN de
Preview, sin escrituras sobre Preview ni Production:

- A aplicó `prisma migrate deploy` en una DB vacía, terminó con status/diff cero
  y materializó las 25 tablas, incluidas las 13 preservadas con `@@ignore`;
- B3 ejecutó `prisma migrate resolve --applied 20260809220336_baseline` sobre una
  copia existente; status/diff quedaron en cero y el catálogo de negocio no
  cambió, salvo `_prisma_migrations`.

Un child-at-LSN no es snapshot ni backup/restore gobernado. S14C conserva un
receipt externo saneado, pero no es un receipt gobernado de release ni una
atestación institucional. Tampoco resuelve que el proyecto Neon observado se denomine
`puntolimpio-staging-neon`: hasta documentar propiedad, municipio y alcance de
ese target, queda prohibido aplicar o marcar migraciones en ramas estables.

### Ledger conectado en child schema-only: gate parcial, no release

El 11 de agosto de 2026 se usó exclusivamente el child Neon descartable
`br-divine-feather-ac5byb1l`: se resolvió el baseline por la ruta B3 y se
aplicaron las dos migraciones posteriores, incluida
`20260811190000_grh_action_ledger`. `prisma migrate status` quedó up-to-date y
`npm run db:grh-ledger:verify` terminó PASS en una transacción read-only sobre
PostgreSQL `170010`, con fingerprint saneado
`dbe339d045e5d09822eac514a528f96f8876f9517c318f6e5db3944026b1efaa`.

Ese PASS acredita la historia y el catálogo del ledger sólo en ese child. El
primer `prisma migrate diff` del schema completo detectó drift nominal y de
relaciones/claves compound. Tras corregir maps, defaults y relaciones/FK en el
schema y regenerar el manifest, la repetición conectada terminó con
`prisma migrate status` up-to-date y
`prisma migrate diff ... --exit-code` en **No difference detected**, exit `0`.
El gate de drift quedó cerrado para ese rehearsal.

Main, Preview y Production recibieron cero DDL; no hubo deployment, promoción
ni smoke HTTP en este corte. El release estable sigue bloqueado por el target y
su atestación, backup/restore gobernado, y la configuración e identidades de
Preview. El cero drift del child no reemplaza ninguno de esos gates.

Como prueba efímera adicional, el store real Prisma/`pg` recorrió con datos
sintéticos `create → replay exacto → claim CONTADOR → complete`; terminó en
versión 3, con tres eventos y una fila listada. Los triggers append-only
bloquearon también `UPDATE` y `DELETE` directos. Esa mutación ocurrió sólo en el
child descartable. Después de capturar la evidencia, el child fue eliminado y
el control listó únicamente main y `municipio-junin-preview-s14b`; no fue un
smoke HTTP, no alcanzó main/Preview/Production y no autoriza un release estable.
El cleanup no demuestra recoverability ni sustituye backup/restore.

El verificador PostgreSQL y los dos smokes candidatos quedan operables y
separados en
[`docs/GRH_ACTION_LEDGER_POSTGRES_GATE.md`](docs/GRH_ACTION_LEDGER_POSTGRES_GATE.md)
y
[`docs/GRH_ACTION_LEDGER_CANDIDATE_SMOKE.md`](docs/GRH_ACTION_LEDGER_CANDIDATE_SMOKE.md).
El smoke mutante sólo puede seguir sobre un Preview realmente descartable, con
configuración, identidades y pines/fingerprint registrados fuera del repo. El
child ya eliminado no puede reutilizarse como target candidato.

Comando manual, sólo con autorización de release:

```bash
vercel deploy
```

El gate es GET-only, exige un origen HTTPS exacto, resolución DNS pública y
estable, y rechaza credenciales, proxy ambiental, path, query y fragmento.
Compara las huellas SHA-256 canónicas de la portada de acceso (`/`), el panel
ejecutivo (`/dashboard`) y el manual limpio (`/manuales`) contra `login.html`,
`dashboard.html` y `manuales.html` del checkout. También exige que `cleanUrls`
resuelva `/dashboard` desde `dashboard.html`, que `/` se reescriba al clean URL
`/login` respaldado por `login.html`, sin rewrite propio de dashboard ni
`index.html`, y que las rutas explícitas coincidan con `vercel.json`. Las APIs no
pueden
redirigir y cada una debe devolver su header contractual propio antes de exigir
autenticación. Un `404`, un muro
genérico, HTML servido como API, dato demo, runtime `MuniDB`, claim de tiempo real
o cualquier drift documental bloquea la promoción.

El gate no demuestra por sí solo propiedad institucional del dominio ni liga
criptográficamente el socket a una IP. La allowlist del host, el deployment ID,
el commit y la evidencia del proveedor se aprueban por separado en el sistema
externo de release.

Al corte del 9 de agosto de 2026, el hotfix `e74339c` sustituyó la superficie
pública `/prisma` y `/prisma/**` por un `404` seguro cuyo cuerpo no contiene el
schema, con `no-store` y `nosniff`. Después del deploy,
`https://municipio-junin.vercel.app` terminó el Release Truth Gate actual en
**12/12** y código `0`.

El repositorio `inguillen87/municipio-junin` es público: este hotfix evita servir
un artefacto interno desde la aplicación, pero no vuelve confidenciales las
definiciones versionadas. Git debe contener cero valores o PII reales; ocultar el
modelo exigiría además repositorio privado y una política de acceso separada.

Este resultado reemplaza el diagnóstico operativo de “release legacy fallando”,
pero no certifica DB, cuentas, datos GRH, backup/restore, propiedad Neon ni
autorización de migraciones. La release `v1.10.0` conserva como evidencia
histórica su gate **11/11**; el 12/12 actual no reescribe esa release ni constituye
por sí solo una nueva versión.

## 4. Promoción y smoke de producción

Promover sólo el preview certificado. Después, verificar como mínimo:

- auth/GRH/export/audit/PDF anónimos → `401`, `403`, `404` o `410` según ruta;
- no existe ningún PDF “oficial” con métricas demo;
- usuario Junín autorizado → contratos privados correctos;
- tenant ajeno → `403`;
- DB/artefacto ausente → `503` sin fallback;
- cualquier autorización interna con secreto ausente, corto o incorrecto → `401`/`503` sin acceso;
- webhooks con firma incorrecta → `401`;
- ningún asset retirado o backup puede descargarse públicamente.

## 5. Rollback e incidente

- Conservar el deployment anterior y el snapshot o branch DB previo.
- Ante fuga, corrupción o autorización incorrecta: bloquear la superficie,
  preservar logs, rotar secretos afectados y no reintentar mutaciones ambiguas.
- El rollback de código no revierte datos: usar el procedimiento de restauración
  probado y reconciliar escrituras posteriores.
- Documentar causa, alcance, tenants afectados, línea de tiempo y controles
  preventivos antes de reabrir.

## 6. Estado de capacidades

- Operativo local: dashboards GRH/RRHH/Hacienda, Bot determinista, reportes de
  lectura y autenticación autoritativa.
- Condicionado al entorno: cargas analíticas legacy, WhatsApp, prueba de
  conexión PostgreSQL y materialización GRH.
- Retirado: correo, entrega programada, exportación cruda, importación directa
  Prisma, consulta pública de reclamos y aprovisionamiento de tenants/usuarios
  mediante contraseña administrativa o `db:seed`.
- Roadmap: CDC/ingesta diaria, backups automatizados propios, rate limiting
  distribuido y permisos finos.

No se certifica instalación PWA ni modo offline: actualmente no existe un
registro activo del service worker. Esa capacidad debe volver con contrato y E2E
propios antes de anunciarse.
