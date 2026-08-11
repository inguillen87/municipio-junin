# MuniControl Junín

Plataforma municipal de información ejecutiva y operación gobernada. El objetivo
actual es convertir el último backup de **GRH Junín** en indicadores trazables para
Intendencia, Hacienda y RRHH, sin publicar PII ni presentar datos simulados como
si fueran reales.

> Estado de esta documentación: código `master` y corte productivo verificados el
> 10 de agosto de 2026. Los indicadores continúan describiendo el snapshot GRH del
> 6 de agosto de 2026; no constituyen conexión en tiempo real ni pago bancario
> conciliado.

## Decisiones de datos

- La única fuente canónica del dominio de personal es
  `grh_junin.backup_2026080615_plataforma.sql.gz`.
- `personas_junin` fue recibido como ejemplo y está **excluido** del perfilado,
  cruces y migraciones de GRH.
- El corte del backup es 6 de agosto de 2026. Los cambios posteriores no están
  representados.
- Los artefactos servidos al frontend son agregados sin nombres, documentos,
  domicilios, teléfonos ni identificadores de empleado.
- El dump no declara un código de moneda. Junín configura la presentación en
  pesos argentinos (`ARS`) mediante una política de tenant versionada; esa
  configuración de visualización no reescribe la procedencia del dump ni prueba
  pago bancario.
- `totpago` tiene diferencias materiales contra `calculo`; por eso no se usa como
  nómina pagada. La lectura ejecutiva usa conceptos de **control de cálculo** y
  conserva `totpago` sólo como diagnóstico de conciliación.

El contrato y sus definiciones están documentados en
[`docs/data/grh-semantic.md`](docs/data/grh-semantic.md).
La evolución desde snapshot hacia ingesta diaria, CDC y backups recuperables se
define en [`docs/GRH_OPERATIONS_ROADMAP.md`](docs/GRH_OPERATIONS_ROADMAP.md).
La reconciliación entre el plan heredado y lo realmente comprobado en el repo se
mantiene en [`docs/MASTER_PLAN_STATUS.md`](docs/MASTER_PLAN_STATUS.md).
Los recorridos y procedimientos se mantienen en
[`docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md`](docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md)
y [`docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md`](docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md).
El recorrido ejecutivo para una reunión institucional está en
[`docs/DEMO_INTENDENCIA_5_7_MIN.md`](docs/DEMO_INTENDENCIA_5_7_MIN.md); separa
afirmaciones demostrables, límites y contingencia.
El índice de entrega y capacitación es
[`docs/MANUAL_INTEGRAL.md`](docs/MANUAL_INTEGRAL.md).
La arquitectura objetivo por fases está en
[`docs/ENTERPRISE_PRODUCT_ROADMAP.md`](docs/ENTERPRISE_PRODUCT_ROADMAP.md).
El gate de migraciones, baseline conectado, restore y rollback se define en
[`docs/PRISMA_BASELINE_Y_DRIFT.md`](docs/PRISMA_BASELINE_Y_DRIFT.md).
La autoridad, sensibilidad, frescura y uso permitido de cada archivo observado
se registran en [`docs/DATA_SOURCE_REGISTER.md`](docs/DATA_SOURCE_REGISTER.md).

## Estado funcional

| Superficie | Estado local | Fuente y límite |
|---|---|---|
| Centro Ejecutivo GRH | Implementado | Contratos privados `profile` + `semantic`; snapshot histórico |
| Centro Ejecutivo RRHH | Implementado | Dotación registrada, ausencias, movimientos, calidad y cuarentena agregadas |
| Sala de situación de dotación y ausencias | Validada localmente | React + TypeScript, seis KPI, cohortes de cálculo, dos series históricas, matriz 5×5, comparador y acciones; contrato `grh-organization-analytics-v2`, k=10 y sin directorio nominal |
| Hacienda y Nómina | Implementado | Control de cálculo; no prueba transferencia bancaria ni asiento contable |
| Dashboard principal | Implementado | Resumen transversal GRH, alertas y accesos ejecutivos |
| Asistente ejecutivo | Implementado | Respuestas deterministas fundamentadas en el contrato GRH |
| Cargas analíticas y conectores | Condicionado | Upload/Sheets escriben tablas legacy ligadas por entorno; no hay ingesta unificada ni sincronización |
| Reportes ejecutivos GRH | Verificado en Production | Bundle privado `profile + semantic`, SHA aprobado, tenant exacto, períodos gobernados y smoke autenticado |
| Accesos demostrativos por rol | Verificado en Production | Seis perfiles gobernados para recorrer permisos y superficies; no habilitan datos inventados ni sustituyen identidades institucionales definitivas |
| Calidad modular React + TypeScript | Canary `/calidad` | Primera vertical componible sobre el mismo contrato `grh-quality-v1`; `/control` permanece como reversión durante la adopción |
| Centro Ejecutivo modular React + TypeScript | Canary `/ejecutivo` | Lectura summary-first de `grh-executive-v2`; `/grh-ejecutivo` permanece como reversión estable y no se reemplaza en este sprint |
| Centro territorial Junín | Verificado en Production | Límite IGN, siete localidades GeoRef y cuatro mapas base oficiales; referencia territorial sin capas GRH, obras ni reclamos |
| PWA y shell móvil | Implementado | Manifest instalable, service worker network-first, fallback offline y navegación responsive; las APIs y respuestas privadas nunca se cachean |
| WhatsApp | Condicionado | Webhooks informativos endurecidos; faltan proveedor, credenciales y E2E externo certificado |
| Correo, cron y exportación cruda | Retirado | Responden 410 o no se programan hasta tener finalidad, auditoría e idempotencia |
| Presupuesto, obras, compras y trámites | Sin fuente gobernada | No deben exhibir bases sintéticas como datos municipales |
| Roles finos y permisos por acción | Roadmap | Se mantiene RBAC grueso mientras se prioriza la evidencia ejecutiva |
| CDC, backups propios y actualización diaria | Roadmap | El sistema actual no es tiempo real |

## Snapshot GRH analizado

- 257 tablas y 6.573.057 filas perfiladas.
- 2.450 registros de legajo; no equivalen automáticamente a planta activa.
- 856 participantes distintos en el control de cálculo de julio de 2026.
- 31.559 ausencias y 489.455 movimientos temporalmente válidos.
- 20.534 filas temporales en cuarentena.
- Calidad gobernada: 88,99/100.
- Conciliación cruzada `calculo`/`totpago`: 63,88/100, con diferencias
  materiales que permanecen visibles.

Las cifras se regeneran desde el backup; no deben copiarse a mano en la UI.

## Arquitectura local y arquitectura objetivo

El checkout genera, valida y consume contratos agregados GRH. Production usa de
forma transitoria un runtime sellado, privado y fijado por SHA; PostgreSQL
`grh_artifacts` sigue siendo el destino estable. El runtime sellado no convierte
el snapshot en tiempo real ni reemplaza la migración, el restore y la operación
de base gobernada.

```text
Backup GRH privado
        │
        ▼
scripts/profile_grh.py + scripts/build_grh_semantic.py
        │
        ├── profile agregado, sin PII
        └── semantic agregado, con calidad y cuarentena
                 │
                 ▼
        PostgreSQL / grh_artifacts (objetivo privado y tenant-bound)
                 │
                 ├── /api/grh-executive + /api/grh-quality
                 │       └── Panel / GRH / RRHH / Hacienda / Calidad
                 ├── proyección portable server-side k=10
                 │       └── Reportes / PDF / Asistente
                 └── /api/grh-data → 410 tras auth + tenant, sin leer artefactos
```

El repositorio contiene dos superficies backend:

- `api/`: funciones Serverless utilizadas por `vercel.json`.
- `backend/`: API Express independiente para entornos que la desplieguen. No
  sirve el checkout ni uploads como contenido estático. Los módulos legacy sin
  contrato multi-tenant (`contratos`, `empleados`, `reclamos`, `archivos`)
  responden `410` después de autenticar.

Ambas revalidan en base de datos el usuario, su estado, rol, municipio y estado
del tenant. El frontend no es una frontera de autorización.

### Frontend modular incremental

La modernización evita una reescritura total. Las superficies heredadas
continúan operativas mientras nuevas verticales entran como rutas canary:

- `frontend/` contiene React + TypeScript estricto. Las entradas canary son
  `/calidad` y `/ejecutivo`; ambas validan primero `/api/auth/me`. Calidad
  consume exclusivamente `/api/grh-quality` y Ejecutivo consume exclusivamente
  `/api/grh-executive`.
- La sesión, el catálogo cerrado de roles/capacidades, el retry y los estados
  fail-closed se comparten. Los contratos brutos nunca se guardan en el estado
  visual: cada pantalla recibe sólo un view-model validado e inmutable.
- `build/assemble-dist.mjs` reconstruye `dist/` desde un allowlist explícito y
  conserva byte a byte las superficies heredadas publicables.
- Vite compila solamente las entradas modulares y genera assets con hash.
- `build/verify-dist.mjs` rechaza `index.html`, configuración privada, fuentes
  del backend, referencias rotas o una salida Vite incompleta.
- `api/` conserva las funciones Serverless y sigue siendo la autoridad de
  autenticación, tenant, RBAC, procedencia y privacidad.

Las rutas estables `/control` y `/grh-ejecutivo` se conservan durante los
canary. Sólo se reemplazarán cuando cada experiencia supere pruebas locales,
Preview/Production y recorridos autenticados por rol.

## Privacidad de los artefactos

`api/_data/*.json` y `docs/data/*.json` se usan sólo para validación local y
están ignorados por Git y Vercel. Este repositorio es público: esos archivos
**no se deben commitear**.

El destino estable de Producción aplica la migración privada y materializa los
contratos:

```powershell
$env:DATABASE_URL='<secreto>'
$env:GRH_SOURCE_SHA256='<SHA-256 aprobado en config/grh-source-manifest.json>'

# Aplicar con el mecanismo de migración aprobado para el entorno:
# migrations/002_grh_artifacts.sql

node scripts/publish_grh_artifacts.mjs --tenant-id '<tenants.id CUID real>'
```

Para una demostración histórica de solo lectura, si el rol operativo todavía no
puede aplicar DDL, el runtime admite transitoriamente
`GRH_ARTIFACT_SOURCE=sealed` y un bundle sensible de plataforma. Puede recibirse
completo en `GRH_SEALED_BUNDLE_BASE64` o, si el canal operativo limita el tamaño
por variable, en 2 a 16 partes declaradas por `GRH_SEALED_BUNDLE_PARTS` y
nombradas `GRH_SEALED_BUNDLE_01`…`GRH_SEALED_BUNDLE_NN`. La variable completa,
si existe, tiene precedencia; no debe configurarse vacía junto a las partes. El
sobre gzip+base64 no se commitea ni se sirve al navegador: se valida contra el
manifiesto, el pin SHA y el mismo contrato de runtime. No es un reemplazo de
PostgreSQL; el cambio posterior a `database` no altera las APIs.

`GRH_TENANT_ID` y `LEGACY_ANALYTICS_TENANT_ID` requieren el `tenants.id` real
incluido en el JWT. No aceptan el slug `junin`. `GRH_SOURCE_SHA256` fija el hash
del backup institucional aprobado: toda lectura desde PostgreSQL exige el par
activo `profile + semantic`, reconcilia sus metadatos y rechaza un SHA distinto.
Si falta cualquiera de estos vínculos, las rutas fallan cerradas.

## Regeneración reproducible

```powershell
python -B scripts/profile_grh.py `
  '<ruta-privada-al-backup-grh>.sql.gz' `
  --out api/_data/grh-profile.json

python -B scripts/build_grh_semantic.py `
  '<ruta-privada-al-backup-grh>.sql.gz' `
  --out api/_data/grh-semantic.json
```

No agregue `personas_junin` a esos comandos.

## Desarrollo local

Requisitos: Node.js, Python y PostgreSQL sólo para los flujos que consultan DB.

```powershell
npm.cmd install

# Validar TypeScript, lint, tests de dominio y artefacto web completo.
npm.cmd run verify:web

# Construir exclusivamente la salida publicable en dist/.
npm.cmd run build

# Servir archivos estáticos y funciones con el runtime elegido.
# El backend Express alternativo se inicia por separado:
Set-Location backend
npm.cmd install
npm.cmd run dev
```

No hay credenciales predeterminadas. El aprovisionamiento por seed está
retirado: `npm run db:seed` termina de forma fail-closed, no acepta variables
`SEED_*`, no importa Prisma y no conecta a la base. Las cuentas futuras deben
nacer del lifecycle gobernado de invitación, MFA, vigencia, revocación y
auditoría descrito en `docs/ACCOUNT_LIFECYCLE_STATE_MACHINE.md`.

## Planes y estado verificable

El texto histórico “Plan Maestro v4.0” no es evidencia de implementación. Sus
referencias a `rrhh-data/`, fichas personales, `organigrama.html`, motores de
haberes y bibliotecas CSS no corresponden al checkout actual. El estado
controlante es `docs/MASTER_PLAN_STATUS.md`; las capacidades futuras se evalúan
contra `docs/ENTERPRISE_PRODUCT_ROADMAP.md` y sus gates de datos, seguridad y
operación.

## Verificación

```powershell
# Semántica y artefactos GRH
python -B -m unittest discover -s tests -v

# Suite Node completa (contratos, seguridad, importación y navegador real)
npm test

# Backend Express de compatibilidad
npm run test:backend

# Verdad de un preview/deployment candidato (GET anónimo, sin secretos)
npm run release:truth:check -- --base-url https://preview-approved.example

# Higiene del diff
git diff --check
```

Los tests dependientes de artefactos privados hacen `skip` explícito cuando no
están provisionados; un `skip` no equivale a certificación de datos.

## Variables mínimas sensibles

Consulte [`backend/.env.example`](backend/.env.example) para el inventario. Las
variables críticas incluyen:

- `DATABASE_URL` remota con `sslmode=verify-full`
- `JWT_SECRET`
- `GRH_TENANT_ID`
- `GRH_SOURCE_SHA256` con el hash exacto aprobado; nunca un valor de ejemplo
- `GRH_ARTIFACT_SOURCE`; `sealed` exige el secreto directo
  `GRH_SEALED_BUNDLE_BASE64` o el conjunto fragmentado
  `GRH_SEALED_BUNDLE_PARTS` + `GRH_SEALED_BUNDLE_01`…`NN`, y se reserva al
  snapshot histórico de solo lectura
- `LEGACY_ANALYTICS_TENANT_ID`
- `PUBLIC_APP_URL` y `PUBLIC_APP_ORIGINS` cuando se habilitan enlaces públicos o
  tráfico de navegador en un deployment aprobado
- lifecycle gobernado de invitación, MFA, vigencia, revocación y auditoría;
  `db:seed` no es un mecanismo de aprovisionamiento autorizado
- credenciales externas de WhatsApp, correo o IA únicamente en el entorno que
  realmente opere cada integración

Nunca publique secretos, dumps, artefactos GRH ni tokens en HTML, documentación,
commits o logs.

## Próximos sprints

1. Provisionar `grh_artifacts` en un entorno privado y ejecutar smoke tests
   autenticados por rol y tenant.
2. Integrar nuevos dominios únicamente con contratos gobernados y sustituir los
   estados no operativos a medida que existan fuentes reales.
3. Diseñar ingesta incremental: staging inmutable, validación, cuarentena,
   versionado de contratos, idempotencia y linaje.
4. Incorporar CDC o extracción programada, backups cifrados, pruebas de restore,
   RPO/RTO y monitoreo antes de declarar actualización diaria o tiempo real.
5. Diseñar permisos finos por acción y dato, auditoría inmutable, doble control
   para operaciones financieras y segregación de funciones.

## Criterio de producto

MuniControl debe ser útil para decidir sin esconder incertidumbre. Toda métrica
ejecutiva debe responder cuatro preguntas: **de qué fuente proviene, a qué fecha,
con qué calidad y qué no permite concluir**.
