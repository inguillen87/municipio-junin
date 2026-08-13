# Manual integral y gobierno documental — MuniControl

Versión documental: 1.10.0
Fecha de corte: 9 de agosto de 2026  
Estado: release público `v1.10.0` verificado; producto S13 en commit `d11fd39`
Estado local revisado: 13 de agosto de 2026; route policy `2026-08-13.8` y
access policy `2026-08-11.3`, sin nuevo release

La sesión privada positiva y S13 privado conservan validación local sobre el
snapshot aprobado. S13 agrega `GET /api/grh-decision-brief` y el contrato
`grh-decision-brief-v1`: un brief ejecutivo único desde agregados del snapshot
aprobado, con validación local. Separa señal global cross-source de evidencia
mensual, expone `temporalQuarantineRows`, aplica k=10 y no exporta PII, importes, códigos de fuente/celda ni
etiquetas/labels. Cada CTA exige su capability; un 503 permite sólo reintento
manual y una celda actual `<10` hace fallar cerrado el Panel integral. MuniGuía
incorpora el anchor `#decisionBrief`.

S14C permanece `Unreleased`: el schema preserva 13 tablas existentes de Preview
—5 sensibles y 8 de referencia— sin exponerlas en ambos Prisma Client, y agrega
un baseline v2 reproducible con Prisma 5.22. Dos casos autoritativos pasaron en
branches hijos efímeros de Preview; Preview y Production recibieron cero
escrituras. Esto no habilita DDL estable, cuentas, lifecycle, tag o `v1.11.0`.

Para el release histórico `v1.10.0`, route policy `2026-08-09.2` y access
policy `2026-08-09.1` cubrían 26 recursos, 12 acciones, 46 permisos y 79 firmas de ruta
—37 Serverless + 42 Express—. El commit/tag de ese release apunta a
`4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7`; el objeto del tag anotado es
`07ac9eacf8bd89f27f5c437b99e713e8497b8934`. La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.10.0` está live,
no draft y no prerelease.

Para el release `v1.10.0`, el deployment Production
`dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` quedó `READY`,
alias `https://municipio-junin.vercel.app`, con `gitSource master/4108ca0`. El
gate productivo cerró 11/11 exit `0` con
`checkedAt 2026-08-09T16:33:56.200Z`. El browser público cerró 10/10 estados a
390/1440 px: `/` y `/roles` visibles; `/dashboard`, `/inicio` y `/manuales`
anónimos redirigen al login; 0 overflow, warnings/errores de consola, overlays,
requests externos y fallas de red. Los logs del corte registraron 0 errores y
0 respuestas 500.

El hotfix post-release `e74339c` reemplazó la exposición de
`/prisma/schema.prisma` por un 404 seguro, `no-store`, `nosniff` y sin marcadores
del schema. Production cerró el gate ampliado 12/12. El tag `v1.10.0` permanece
en `4108ca0` con su evidencia histórica 11/11.

El focal raíz S13 cerró 135/135 y el QA adversarial 104/104 con 0 P1/P2. La suite
raíz final revalidó 591 pruebas: 590 aprobadas, 0 fallidas y 1 smoke opt-in
omitido; backend cerró 20/20. Este cierre no certifica DB/baseline, cuentas,
MFA/lifecycle ni datos GRH remotos. Este commit documental post-release no mueve
el tag `v1.10.0` de `4108ca0`.

Como antecedente, el release público `v1.9.0` conserva esta evidencia:

El commit/tag `v1.9.0` es `f9d1f88` y el product commit es `ed76347`. El
deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` figura `Ready` en `Production`
con alias `https://municipio-junin.vercel.app`; el gate cerró 10/10 exit `0` con
`checkedAt 2026-08-09T14:42:10Z`. El browser público verificó `/login` y `/roles`
—siete perfiles— a 390/1440 px sin overflow, errores de consola ni requests
externos; `/dashboard`, `/inicio` y `/manuales` anónimos redirigieron al login.
La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.

MuniGuía privada `muniguia-contextual-v1` conserva evidencia sólo local con proyección autoritativa
simulada: focal 10/10, suite raíz 533 totales —532 aprobadas y 1 smoke opt-in
omitido— y backend 20/20. La evidencia remota no certifica autorización positiva,
cuentas reales, DB o baseline restaurado, MFA/lifecycle persistido ni GRH remoto.
Ese cierre documental post-release no movió el tag `v1.9.0` de `f9d1f88`.

## Cómo usar este paquete

Este índice evita que una sola guía mezcle decisiones políticas, operación
cotidiana y procedimientos de ingeniería. La entrega está dividida por audiencia
pero comparte una única regla: **si cambia el producto, cambia la documentación
en la misma entrega**.

| Documento | Audiencia | Para qué sirve |
|---|---|---|
| [`MANUAL_USUARIO_Y_FUNCIONARIOS.md`](MANUAL_USUARIO_Y_FUNCIONARIOS.md) | Intendencia, secretarías, Hacienda, RRHH, operadores y presentadores | Recorridos, interpretación de KPIs, decisiones, incidentes, demostraciones y checklists |
| [`MANUAL_TECNICO_Y_PROCEDIMIENTOS.md`](MANUAL_TECNICO_Y_PROCEDIMIENTOS.md) | Ingeniería, seguridad, datos, DevOps, soporte y auditoría | Arquitectura, instalación, contratos, migraciones, aprovisionamiento, pruebas, release, backup/restore y troubleshooting |
| [`ENTERPRISE_PRODUCT_ROADMAP.md`](ENTERPRISE_PRODUCT_ROADMAP.md) | Dirección de producto, gobierno, ingeniería y potenciales municipios | Arquitectura objetivo, roles, stack de visualización/geografía y fases de expansión |
| [`ROLE_JOURNEYS_AND_SECURE_DEMO.md`](ROLE_JOURNEYS_AND_SECURE_DEMO.md) | Funcionarios, producto, seguridad, ventas e ingeniería | Recorridos por perfil, segregación de funciones y procedimiento de demos/cuentas temporales |
| [`RBAC_ABAC_DATA_MODEL.md`](RBAC_ABAC_DATA_MODEL.md) | Arquitectura, seguridad, DBA e ingeniería | Propuesta aislada de ámbitos, asignaciones, lifecycle, aprobaciones, SoD, break-glass y auditoría; no es una migración activa |
| [`ACCOUNT_LIFECYCLE_STATE_MACHINE.md`](ACCOUNT_LIFECYCLE_STATE_MACHINE.md) | Seguridad, backend, QA y auditoría | Fundación pura de transiciones de cuenta, invitación y sesión; no persiste ni habilita identidades |
| [`ACCOUNT_LIFECYCLE_PRISMA_MAPPING.md`](ACCOUNT_LIFECYCLE_PRISMA_MAPPING.md) | Seguridad, backend, DBA, QA y auditoría | Mapper puro IAM-MAP-01 entre la foundation y la propuesta Prisma; no conecta DB, no persiste ni crea usuarios |
| [`PRISMA_BASELINE_Y_DRIFT.md`](PRISMA_BASELINE_Y_DRIFT.md) | DBA, seguridad, DevOps e ingeniería | Baseline v2 reproducible, replay efímero S14C, preflight conectado y gates de receipt/atestación todavía obligatorios antes de DDL estable o cuentas |
| [`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md) | Dirección y responsables de aceptación | Diferencia entre el plan heredado y la evidencia realmente implementada |
| [`GRH_OPERATIONS_ROADMAP.md`](GRH_OPERATIONS_ROADMAP.md) | Datos y operaciones | Evolución específica de GRH desde snapshot a lote, CDC, backups y observabilidad |
| [`GRH_PIPELINE_RUN_CONTRACT.md`](GRH_PIPELINE_RUN_CONTRACT.md) | Ingeniería de datos, seguridad, QA y auditoría | Estados, idempotencia, receipts y límites del replay local O2A; no habilita operación conectada |
| [`DATA_SOURCE_REGISTER.md`](DATA_SOURCE_REGISTER.md) | Ingeniería, responsables de datos, seguridad y auditoría | Autoridad, sensibilidad, frescura, uso permitido y gates de cada fuente observada |
| [`GRH_GEOSPATIAL_READINESS.md`](GRH_GEOSPATIAL_READINESS.md) | Producto, GIS, datos, privacidad y auditoría | Evidencia de cobertura espacial, contrato de preparación, k≥10 y gates antes de habilitar mapas |
| [`data/grh-semantic.md`](data/grh-semantic.md) | Analistas, contadores e ingeniería | Definiciones, calidad, conciliación y límites del contrato semántico |
| [`GRH_PRIVACY_AGGREGATION_POLICY.md`](GRH_PRIVACY_AGGREGATION_POLICY.md) | Funcionarios, privacidad, datos, frontend y backend | Umbrales, supresión de celdas pequeñas, reconciliación y procedimiento para publicar una nueva métrica |
| [`../NEON_SETUP.md`](../NEON_SETUP.md) | Ingeniería de plataforma | PostgreSQL/Prisma, migraciones y materialización privada |
| [`../DEPLOYMENT.md`](../DEPLOYMENT.md) | Release managers y operaciones | Gates, preview, producción, smoke y rollback |

La guía navegable [`../manuales.html`](../manuales.html) resume el recorrido
dentro de la plataforma. Los Markdown son la fuente versionada para ingeniería,
licitaciones, capacitación y futuras entregas a otros municipios.

## Estado que debe leerse antes de una demostración

- La fuente canónica actual es GRH Junín, snapshot del 6 de agosto de 2026.
- `personas_junin` está excluida de manera absoluta: no se analiza, perfila,
  cruza, migra, publica ni se usa como fallback.
- El contrato fuente vigente es `grh-semantic-v2`. Agrega
  `distinct_participants_by_year` para ausencias, licencias y movimientos: las
  claves compuestas se usan sólo durante el cálculo y nunca se exportan.
- Los indicadores son agregados y la moneda no está declarada. Un agregado no
  es necesariamente anónimo cuando una categoría contiene pocas personas.
- El control de cálculo no prueba pago bancario, presupuesto ni asiento contable.
- Existen localmente dos salidas minimizadas y exact-key para navegador:
  `GET /api/grh-executive` entrega `grh-executive-v2` y
  `GET /api/grh-quality` entrega `grh-quality-v1`. Ambas revalidan identidad,
  tenant y contrato, usan `no-store` y fallan cerradas sin exponer el bundle.
- Existe además `GET /api/grh-close`, salida local `grh-close-v1` para el cierre
  mensual explicado de Hacienda. Publica únicamente agregados de cálculo y
  conciliación por período real; la comparación sólo se libera entre meses
  calendario consecutivos cuando ambos alcanzan k≥10. No exporta PII, filas,
  etiquetas ni códigos de celdas. Conserva la unidad de origen con moneda no
  declarada y describe una descomposición aritmética: no prueba pago,
  contabilidad, causalidad ni tiempo real.
- S13 agrega `GET /api/grh-decision-brief`, salida local
  `grh-decision-brief-v1`. Resume situación, cambio y prioridades desde las tres
  proyecciones gobernadas: mantiene global la señal cross-source, usa el período
  mensual exacto para la evidencia corriente e incluye `temporalQuarantineRows`.
  No exporta PII, importes, códigos de fuente/celda ni labels; las CTA requieren capability.
  Un 503 ofrece sólo retry manual y una celda actual `<10` cierra todo el Panel.
- La proyección ejecutiva aplica k=5 a rankings laborales interactivos y k=10 a
  compensación, ausencias, licencias, movimientos y salidas portables. Protege
  antes del top-N, aplica supresión complementaria y trata cardinalidad
  desconocida como protegida; nunca transforma una celda oculta en cero.
- El [Centro de Calidad y Linaje GRH](../control.html) debe consumir
  `grh-quality-v1` para mostrar inventario, score, cuarentena, cobertura,
  conciliación y riesgos. Panel, GRH, Calidad, RRHH y Hacienda consumen
  localmente las proyecciones seguras y no conservan referencias HTTP al bundle.
- Hacienda incorpora localmente el cierre mensual explicado y la conciliación
  verdaderamente asociada a cada período. La tasa global ya no se repite como si
  fuera mensual en GRH Ejecutivo; continúa visible sólo como resumen global.
- Su inventario de 257 tablas, 147 con filas, 110 vacías y 6.573.057 filas son
  metadatos de `semantic.table_dictionary`. `profile.row_counts` sólo cubre 22
  tablas de foco y 4.908.280 filas; no es el total. Calidad y Linaje reconcilia
  cada foco contra el diccionario completo y falla cerrado ante diferencias. El
  score 88,99/100 evalúa únicamente el extracto agregado gobernado con pesos
  30/30/30/10; no certifica todas las tablas crudas.
- Reportes, PDF y Asistente son consumidores server-side: leen el bundle privado
  directamente y construyen una proyección portable k=10 antes de responder. No
  publican `profile` ni `semantic`.
- El Asistente ofrece localmente el intent `close_explanation` (“Cierre
  explicado”). En una sola lectura privada construye `grh-close-v1` y responde
  para un único `YYYY-MM` liberado k≥10 con componentes, control y conciliación
  mensual real. Un año solo, período protegido o ausente responde 422 sin
  sustitución; no usa score global ni afirma causalidad, moneda, pago o PII. La
  evidencia Bot + E2E es 13/13 local y no certifica deployment.
- La frontera raw está **cerrada localmente**. `GET /api/grh-data` autentica,
  verifica tenant y responde `410 GRH_RAW_CONTRACT_RETIRED` sin leer artefactos.
  Los cinco UIs ejecutivos tienen cero referencias a esa ruta; `profile` y
  `semantic` quedan sólo en backend. Las suites completas y el E2E local de
   Hacienda están aprobados; esto no certifica deployment ni producción porque
   faltan materialización privada y smokes remotos.
- O2A ejecutó un replay real local del snapshot canónico de 44.537.741 bytes y
  SHA-256
  `e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`.
  La primera corrida terminó `promoted/PUBLISHED` en 105,5 s y el replay exacto
  `duplicate/DUPLICATE` en 294 ms. Quedaron una versión, una activación, un
  receipt de duplicado y LKG byte-estable, con cero locks, residuos o workspaces
  activos al cierre. El bundle revalidó 257 tablas, 6.573.057 filas, calidad
  88,99/100, sin PII en la salida y con `personas_junin` excluida.
- Esa evidencia O2A es exclusivamente local: no usó red, DB, cron, `api/_data` o
  deployment. `PUBLISHED` no significa publicado para usuarios. El ledger local
  no está firmado ni autentica al host; tampoco prueba corte de energía, ACL,
  backup, restore o periodicidad. O2B conectado/programado sigue pendiente.
- O2A.1 reduce la ventana TOCTOU: abre fuente, manifiesto y procesadores mediante
  descriptor, verifica con `fstat` y materializa copias privadas exclusivas
  (`wx`, modo `0600`) dentro del workspace. Los procesadores reciben sólo esas
  copias inmutables de ejecución. La suite focal validó el contrato con fixtures;
  no se repitió el replay real de 44 MB, no se usó DB y no se desplegó. Un host
  completamente comprometido permanece fuera de la garantía.
- El techo exacto de permisos por ruta está implementado localmente con 31
  recursos, 12 acciones, 53 permisos y 91 firmas protegidas: 49 Serverless y 42
  Express. La propuesta de
  ámbitos RBAC/ABAC está aislada y no migrada: todavía no hay persistencia fina,
  lifecycle de cuentas ni cuentas por cada rol.
- El acceso local termina en [`inicio.html`](../inicio.html), una portada segura
  regida por `navigation.workspace` y la política compartida `2026-08-11.3`.
  Login y `/api/auth/me` calculan en servidor las capabilities y un
  `homeProfile` mínimo para los siete roles técnicos vigentes. La portada hace
  una sola lectura de sesión, no consulta GRH ni otro dataset y muestra sólo las
  prioridades autorizadas. El Panel ejecutivo GRH queda separado.
- Un `SUPER_ADMIN` sin tenant se proyecta sólo con `session.read`,
  `navigation.workspace` y `navigation.help`; no recibe indicadores privados.
  Roles o perfiles desconocidos, capabilities ausentes y versiones obsoletas
  fallan cerrados. La matriz local de siete roles en 390/1440 px cerró 42/42.
- Este inicio por rol es UX y proyección de política; no crea identidades, no
  habilita el modelo RBAC/ABAC propuesto y no prueba DB ni producción. El preview
  protegido sólo observó rutas públicas y rechazos 401 sin cuentas.
- `/roles` agrega en `v1.8.1` un recorrido visual público para los siete perfiles.
  Su contrato `public-role-tour-v1` no inicia sesión, no emite JWT, no autoriza,
  no crea cuentas y no consulta APIs, DB, storage, PII o datos municipales. Está
  incluido en el gate productivo 10/10 exit `0` del artefacto `b82c0b3`.
- S14A cerró localmente WP0-L v2 e IAM-MAP-01. Como antecedente,
  `wp0_restored_copy_observation` distingue cuatro estados: `absent`, `empty` e
  `inconsistent` son `discovery_non_approvable`; `valid` es `strict`; todos
  mantienen `approvalEligible:false`. El catálogo canónico guarda
  `definitionSha256` y aplica caps fail-closed de 20.000 filas, 1 KiB por campo
  no-definition, 256 KiB por definición y 4 MiB acumulados. En S14A sólo se
  validó con fixtures/adapters. El mapper IAM no importa Prisma Client, no
  persiste y no crea usuarios.
- S14B resolvió el NO-GO anterior: `DB_CONFIG_ISOLATION=PASS`,
  `DB_CONFIG_SSLMODE_VERIFY_FULL=true` y `NEON_MAPPING=IDENTIFIED`. Preview y
  Production quedaron mapeados a branches DB distintos; las conexiones remotas
  exigieron `sslmode=verify-full` y la observación conectada
  usó un rol de mínimo privilegio, `REPEATABLE READ READ ONLY` y `TLSv1.3`.
- El control plane confirmó por separado el snapshot
  `snap-autumn-shape-ac7473wo` desde main y el restore descartable
  `br-flat-waterfall-acylyfjv`. WP0, ejecutado desde `38b25e8`, registró 968 filas
  de catálogo y `_prisma_migrations` `absent`; el artefacto quedó
  `discovery_non_approvable` y `approvalEligible:false`.
- El artefacto externo
  `wp0-observation-48054484dbcd80ffbaa46a197a97ccfb3a8a1a97223e868dc1e755d010d8ada4`,
  SHA-256
  `64b1571c36adafe6d6b65b11c3fd109131e7e7bcff84c4cd060dfbdea82573a1`,
  conserva `externalReferencesVerified:false`,
  `backupRestoreRelationVerified:false`, `reviewerIndependenceVerified:false` y
  `signedProviderReceiptVerified:false`. La auditoría externa no cambia esos flags
  ni autoriza baseline, migración, drift o DDL.
- Una credencial owner expuesta durante la operación fue rotada y su valor
  anterior invalidado, sin reproducir el secreto. El cleanup confirmó restore y
  snapshot ausentes, main y Preview `ready`, temporal ausente y artefacto externo
  retenido.
- S14B cerró 619 pruebas raíz —618 aprobadas y 1 smoke opt-in omitido— y backend
  20/20. En aquel cierre `Unreleased`, la evidencia pública 11/11 de `v1.10.0`
  no se modificó ni recertificó y no existían bump, tag, GitHub Release
  `v1.11.0`, baseline, migración, cuenta o lifecycle persistido.
- S14C reconcilia 13 tablas observadas en Preview —5 sensibles y 8 de
  referencia— mediante `@@map` + `@@ignore`. El contrato
  `prisma-schema-ownership-v1` fija `clientAccess:disabled`,
  `migratePreserved:true` y digest
  `588d171e79b7c7841a01b8850302dee2fdbe98a9923677cb68563ece31ddedf8`.
  Ambos Prisma Client omiten los modelos, pero esto no bloquea `$queryRaw` ni una
  credencial DB sobredimensionada.
- El baseline `20260809220336_baseline`, manifest v2 y Prisma `5.22.0` fijan 82
  sentencias aditivas: 3 enums, 25 tablas, 25 índices y 29 claves foráneas. El
  release continúa fail-closed con `RELEASE_ATTESTATION_NOT_GOVERNED`.
- El replay S14C usó dos branches hijos efímeros secuenciales del Preview
  `br-proud-hat-achuevv2` en LSN `0/307FA88`, sin snapshot ni `finalize`. A
  desplegó sobre DB vacía con 25 tablas, las 13 ignoradas presentes, status y
  diff cero. B3 resolvió una vez el baseline sobre la copia existente: historia
  de cero pasos `valid`, status/diff cero y catálogo pre/post byte-idéntico —449
  filas, 140.715 bytes, SHA-256
  `0388a4871483fdd37286a03ab1d7acd01f25ef0ecae309925dadf912fe589028`—.
  Los intentos B/B2 abortados no son evidencia de aceptación.
- El receipt externo `s14c-baseline-disposable-replay-receipt.json`, SHA-256
  `613db7889e4e23033927814fa5ee8e4a891e9a91772268e01b08645d3f4ae51b`, no está
  versionado. El cleanup dejó main + Preview, 2 endpoints y 0 snapshots; Preview
  y Production recibieron cero escrituras.
- El nombre visible del proyecto Neon es `puntolimpio-staging-neon`; ownership y
  naming no están gobernados. Ese BLOCKER impide DDL estable, cuentas y release.
  S14C cerró 635 pruebas raíz —634 aprobadas y 1 smoke opt-in omitido— y backend
  20/20. Sigue `Unreleased`; `v1.10.0` conserva `4108ca0`/11/11 y `e74339c`
  registra por separado el hotfix post-release 12/12.
- UX-E2A unifica el shell institucional en las 29 páginas raíz que cargan
  navegación. Sus estados desktop, móvil, accesible e imprimible son experiencia
  local; la visibilidad de un enlace no concede permisos ni certifica deployment.
- La conexión continua, los backups propios, los mapas operativos y los ámbitos
  RBAC/ABAC persistidos por área todavía están planificados; no están
  certificados en producción.
- Como antecedente, `v1.8.1` corresponde al artefacto `b82c0b3` en `master` y en su tag; el
  deployment `dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` figura `Ready`, la GitHub Release
  está live y `release:truth:check` productivo cerró 10/10 con exit `0`.
- El navegador productivo cerró a 390 px y 1440 px sin overflow horizontal,
  errores de consola, requests externos ni requests privados. Esta evidencia no
  demuestra DB, cuentas, autorización positiva ni datos municipales remotos.
- Este commit sólo registra evidencia documental post-release y no mueve el tag
  `v1.8.1`.
- E0.1 incorpora localmente `/inicio` al gate: exige el rewrite exacto a
  `/inicio.html`, una captura UTF-8/LF con SHA-256, HTML 200 sin redirects y
  digest remoto idéntico. El focal cerró 31/31 y el consolidado con workspace,
  45/45. El preview protegido `fa5dcc5` verificó manualmente `/dashboard`,
  `/inicio` y `/manuales` con huella exacta; `/` mostró el acceso esperado con
  una única inyección conocida de Vercel Live. Esto no sustituye el gate anónimo
  ni demuestra producción.
- Las cinco fronteras API del mismo preview respondieron 401 sin sesión con su
  contrato específico por ruta. No se probaron cuentas, tenant, artefactos GRH,
  DB conectada ni autorización positiva.
- El acceso local usa una portada institucional sobria, autocontenida,
  responsive, navegable por teclado y compatible con movimiento reducido. No
  publica identidades demo, accesos rápidos ni claims de capacidades ausentes.
  Esta portada fue observada en preview protegido, pero no está certificada en
  producción y no demuestra identidades reales.

## Paquete de capacitación por audiencia

### Funcionarios y altos cargos

Duración sugerida: 45 minutos.

1. Inicio seguro, identidad, rol, tenant y límites de la portada asignada.
2. Fuente, corte y cuatro preguntas de verdad del KPI.
3. Lectura del Panel Ejecutivo GRH sólo cuando la capability esté autorizada.
4. Recorrido GRH → RRHH → Calidad y Linaje → Hacienda → Reportes GRH privados.
5. Uso del Asistente con preguntas trazables, incluido “Cierre explicado” para
   un único mes liberado.
6. Decisiones permitidas y decisiones que exigen fuente complementaria.
7. Interpretación de 401/403/503 y canal de incidente.

### Operadores administrativos

Duración sugerida: 60 minutos más práctica.

1. Identidad, rol, tenant, portada segura y alcance del área.
2. Preparación y clasificación de una fuente.
3. Importación, preview, filas rechazadas, truncado y persistencia.
4. Prohibición de subir backups/PII a canales públicos.
5. Corrección, reintento e idempotencia.
6. Registro de responsable, evidencia y resultado.

### Ingeniería y soporte

Duración sugerida: dos sesiones de 90 minutos.

1. Arquitectura Serverless/Express y frontera tenant-bound.
2. `grh-semantic-v2`, cardinalidad anual sin claves y linaje dual exacto.
3. Proyecciones `grh-executive-v2`, `grh-quality-v1` y `grh-close-v1`, umbrales k=5/k=10,
   supresión previa al top-N, complementaria y cardinalidad desconocida protegida.
4. Frontera raw cerrada localmente: cinco UIs sobre endpoints seguros,
   consumidores server-side sobre bundle privado y `/api/grh-data` retirado con
   `410 GRH_RAW_CONTRACT_RETIRED`; certificar luego en preview/producción.
5. Techo exacto `recurso:acción`, Prisma dual, preflight de migración bloqueado
   sin atestación institucional, seed retirado y propuesta RBAC/ABAC aislada.
6. Política de acceso `2026-08-11.3`, contrato de sesión server-computed,
   `inicio.html` sin datasets y guards fail-closed del navegador.
7. Suites, QA visual, audits y Definition of Done.
8. Preview, smokes, rollback e incidentes.
9. Replay O2A local: promoción, duplicado, last-known-good, bundle inmutable O2A.1
   y límites frente a un host comprometido.
10. Roadmap O2B de ingesta conectada, CDC, geografía, observabilidad y restore.

## Demostración de seguridad por roles

No existe un listado público de usuarios y contraseñas ni un entorno de demo por
rol certificado. `db:seed` está retirado: termina con código `1` y
`ACCOUNT_LIFECYCLE_NOT_GOVERNED`, sin secretos, conexión DB o escrituras. Las
altas con contraseña conocida responden `410 ACCOUNT_LIFECYCLE_NOT_GOVERNED` y
las mutaciones de tenant, `410 TENANT_LIFECYCLE_NOT_GOVERNED`.
La máquina pura de lifecycle permite probar invariantes, pero no persiste ni
habilita identidades.

Antes de entregar una cuenta por perfil se debe:

1. gobernar el target, autorizar la aplicación estable del baseline S14C y
   aprobar la migración RBAC/ABAC con su rollback;
2. implementar lifecycle de cuenta y sesión, invitación de un uso, expiración,
   rotación, revocación y auditoría;
3. crear un preview aislado y un tenant sintético sin PII municipal;
4. asignar capacidades y ámbitos literales con vigencia y separación de funciones;
5. demostrar acceso permitido, `403` por rol, `403` cross-tenant, usuario
   desactivado y fuente ausente;
6. registrar evidencia y revocar todas las identidades al finalizar.

Mientras esos gates sigan abiertos, la demostración de seguridad se realiza con
pruebas automatizadas y evidencia controlada, no publicando credenciales. Los
roles futuros de Tesorería, Compras, RRHH, Secretaría, Auditoría,
Administración y Empleado se crearán después de implementar sus ámbitos y
permisos server-side. Asignar hoy nombres de rol sin política real sería una
simulación de seguridad.

## Control de cambios obligatorio

Todo cambio funcional debe contestar estas preguntas en su revisión:

- ¿cambió una fuente, contrato, KPI, período, unidad o limitación?
- ¿cambió una ruta, payload, código HTTP o estado de error?
- ¿cambió un rol, permiso, tenant, dato sensible o exportación?
- ¿cambió una variable, dependencia, migración o procedimiento de aprovisionamiento?
- ¿cambió una carga, integración, cron, backup, restore o rollback?
- ¿cambió la experiencia desktop, móvil, accesible o imprimible?
- ¿cambió el estado de Operativo/Condicionado/Roadmap?

Si la respuesta es sí, se actualizan los manuales afectados, las pruebas y el
historial antes de aceptar la feature.

## Metadatos de una entrega documental

Cada release aprobada debe registrar sin secretos ni PII:

```text
Versión:
Fecha:
Commit:
Deployment ID / URL:
Branch o entorno DB:
Fuente y snapshot:
Versión de contratos:
Versión de política de privacidad:
Resultado autenticado de /api/grh-executive y /api/grh-quality:
Resultado autenticado de /api/grh-close y comparación consecutiva k≥10:
Resultado de /api/auth/me, versión de access-policy y homeProfile por rol:
Resultado del workspace en 390/1440 px y ausencia de requests GRH:
Resultado 401/403/410 de la frontera retirada /api/grh-data:
Captura de red de los cinco UIs ejecutivos:
Resultado O2A local y verificación del last-known-good:
Migraciones aplicadas:
Suites y resultado:
Smokes por rol/tenant:
Restore más reciente y resultado:
Cambios de permisos:
Responsable técnico:
Responsable institucional:
Limitaciones abiertas:
```

## Criterio de vigencia

Un manual deja de estar vigente cuando describe como operativa una capacidad
que no supera sus gates, omite una nueva frontera de seguridad o sus comandos no
se ejecutan en un checkout limpio. Esa divergencia se trata como defecto de
software y bloquea el release.

## Historial resumido

| Versión | Fecha | Cambio |
|---|---|---|
| Unreleased · S14C | 2026-08-09 | 13 tablas de Preview gobernadas como `@@ignore` —5 sensibles/8 referencia—, clientes sin delegates y baseline v2 Prisma 5.22 con 82 sentencias aditivas; casos A vacío y B3 resolve aprobados en child branches efímeros al LSN `0/307FA88`, catálogo B3 byte-idéntico 449 filas/140.715 bytes, cleanup main + Preview/2 endpoints/0 snapshots y cero escrituras estables; BLOCKER por ownership/naming de `puntolimpio-staging-neon`; raíz 634 aprobadas + 1 opt-in, backend 20/20; receipt externo SHA `613db7889e4e23033927814fa5ee8e4a891e9a91772268e01b08645d3f4ae51b`; `v1.10.0`/`4108ca0` conserva 11/11 y hotfix `e74339c` cerró 12/12 |
| Unreleased · S14B | 2026-08-09 | Targets DB Preview/Production distintos, `verify-full`, mapping identificado y WP0 conectado desde `38b25e8`: `TLSv1.3`, observador mínimo, read-only, 968 filas y `_prisma_migrations` `absent`; artefacto `discovery_non_approvable`, `approvalEligible:false`, cuatro flags de evidencia en `false`; control plane confirmó snapshot→restore y cleanup, sin baseline, migración, cuenta, lifecycle, bump, tag o `v1.11.0`; raíz 618 aprobadas + 1 opt-in omitido, backend 20/20; `v1.10.0` conserva su 11/11 público |
| Unreleased · S14A | 2026-08-09 | Antecedente local WP0-L v2 con estados de historia explícitos, catálogo hasheado/acotado y `approvalEligible:false`; registró entonces `DB_CONFIG_ISOLATION=FAIL`, `DB_CONFIG_SSLMODE_VERIFY_FULL=false` y `NEON_MAPPING=UNKNOWN`; S14B resolvió ese NO-GO; S14A no creó bump, tag o release |
| 1.10.0 | 2026-08-09 | Release público: producto `d11fd39`, commit/tag `4108ca0`, deployment Production `dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` `READY`, gate 11/11, browser 10/10 y GitHub Release live; focal 135/135, QA 104/104, raíz 590 aprobadas + 1 opt-in omitido y backend 20/20; sesión positiva y datos GRH privados siguen en validación local; registro post-release sin mover el tag |
| 1.9.0 | 2026-08-09 | Release público: commit/tag `f9d1f88`, product commit `ed76347`, deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` `Ready` en `Production`, gate 10/10 exit `0`, browser público 390/1440 px y GitHub Release live; MuniGuía privada sólo local; raíz 532 aprobadas + 1 smoke opt-in omitido y backend 20/20; registro post-release sin mover el tag |
| 1.8.1 | 2026-08-09 | Publica `/roles` como tour visual `public-role-tour-v1`; artefacto `b82c0b3` en `master`/tag, deployment `Ready`, gate productivo 10/10 exit `0`, browser 390/1440 px limpio y GitHub Release live; no acredita DB, cuentas, autorización positiva ni datos remotos |
| 1.8.0 | 2026-08-09 | Registra WP0-L, IAM-MAP-01 y UX-E2A; integrado en `master`, con superficie pública productiva certificada 9/9 exit `0`. No acredita DB, cuentas reales, autorización positiva ni datos remotos |
| 1.7.0 | 2026-08-09 | Incorpora el inicio seguro por siete roles con capabilities calculadas en servidor, default `inicio.html`, `SUPER_ADMIN` sin tenant sin GRH y Panel ejecutivo separado; 42/42 local, sin cuentas, DB ni deployment |
| 1.6.0 | 2026-08-09 | Incorpora `grh-close-v1` en Hacienda y el Bot “Cierre explicado”, retira la atribución mensual falsa de una conciliación global, registra el bundle inmutable O2A.1 y el login institucional local; el público sigue legacy/no certificado |
| 1.5.0 | 2026-08-09 | Registra el replay real local O2A del snapshot canónico, promoción + duplicado idempotente y LKG estable; separa O2B conectado/programado sin declarar DB, cron, backup o deployment |
| 1.4.1 | 2026-08-08 | Cierra localmente la frontera raw: cinco UIs sin referencias fuente, consumidores server-side con proyección portable y `/api/grh-data` retirado con 410 sin leer artefactos; deployment y smokes siguen pendientes |
| 1.4.0 | 2026-08-08 | Incorpora `grh-semantic-v2`, cardinalidad anual sin claves, proyecciones seguras `grh-executive-v2`/`grh-quality-v1`, reglas k=5/k=10 y deja explícito que la migración UI y el retiro de `/api/grh-data` siguen abiertos |
| 1.3.0 | 2026-08-08 | Documenta baseline/drift, retiro del seed y lifecycle de cuentas todavía no conectado |
