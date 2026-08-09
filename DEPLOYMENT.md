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
- migraciones revisadas contra la base destino;
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

## 3. Preview

1. Crear un preview desde un commit revisado.
2. Ejecutar el preflight de [`docs/PRISMA_BASELINE_Y_DRIFT.md`](docs/PRISMA_BASELINE_Y_DRIFT.md); revisar drift, backup y restore sin aplicar ni marcar una migración. `--release` permanece bloqueado con `RELEASE_ATTESTATION_NOT_GOVERNED` hasta implementar atestación institucional CI/KMS/OIDC.
3. Configurar `GRH_SOURCE_SHA256` desde el manifiesto aprobado; no copiarlo de una fila DB no verificada.
4. Materializar `profile` y `semantic` GRH en `grh_artifacts` para el tenant.
5. Ejecutar smokes anónimos, por rol y cross-tenant; un bundle incompleto, un metadata drift o un SHA distinto deben responder `503`.
6. Validar dashboards, impresión, móvil, modo reducido y fallas `503`.
7. Ejecutar el Release Truth Gate sin token ni cookie:

   ```bash
   npm run release:truth:check -- --base-url https://preview-approved.example
   ```

   Debe terminar con código `0`. El receipt JSON conserva sólo origen, política,
   huellas públicas, estados, tamaños y códigos; no contiene cuerpos, PII, tokens
   ni errores crudos.
8. Guardar evidencia: URL, deployment ID, commit, DB branch, fecha, operador y
   receipt del gate en el sistema externo de release; no commitear receipts.

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

Al corte del 9 de agosto de 2026, `https://municipio-junin.vercel.app` falla este
gate con release legacy, APIs actuales ausentes, claims inseguros y manual
desactualizado. No debe presentarse a funcionarios ni promoverse como la versión
actual hasta reemplazarlo por un preview que termine con código `0`.

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
