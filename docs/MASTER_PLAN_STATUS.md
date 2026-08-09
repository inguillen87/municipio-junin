# Estado verificado del Plan Maestro MuniControl

Versión documental: 1.10.0.
Fecha de corte: 9 de agosto de 2026.

Este documento sustituye el uso del texto “Plan Maestro v4.0” como evidencia de
implementación. Ese plan declaraba fases completas y archivos que no existen en
el checkout actual (`css/components.css`, `css/animations.css`,
`organigrama.html`, `rrhh-data/`, `api/payroll-engine.js` y
`api/payroll-receipt.js`). Las casillas de un plan no prueban que una función esté
implementada, conectada o validada.

El corte actual es el candidato local `1.10.0`, S13. Producto S13 en commit
`d11fd39`; validación local en este corte. Estos documentos no acreditan
Preview/Producción; última evidencia remota verificada al corte: `v1.9.0`.
`GET /api/grh-decision-brief` publica `grh-decision-brief-v1`, un brief ejecutivo
único desde agregados del snapshot aprobado, con validación local: separa señal
global cross-source de evidencia mensual, expone `temporalQuarantineRows`, aplica
k=10 y no exporta PII, importes, códigos de fuente/celda ni
etiquetas/labels. Las CTA requieren capability; un 503 admite sólo reintento
manual y una celda actual `<10` hace fallar cerrado el Panel. MuniGuía apunta a
`#decisionBrief`.

Route policy `2026-08-09.2`, access policy `2026-08-09.1`: 26 recursos, 12
acciones, 46 permisos y 79 rutas —37 Serverless + 42 Express—. El gate queda
preparado para seis APIs y 11 checks al desplegar. Focal raíz S13 135/135; QA
adversarial 104/104 con 0 P1/P2. La suite raíz final revalidó 591 pruebas: 590
aprobadas, 0 fallidas y 1 smoke opt-in omitido; backend cerró 20/20. Backend
`1.0.0` y Prisma `1.1.0` permanecen independientes. No se afirma aquí tag ni
deployment verificados de `v1.10.0`.

El release público `v1.9.0` quedó fijado en el commit/tag `f9d1f88`; el product
commit es `ed76347`. El deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` figura
`Ready` en `Production` con alias `https://municipio-junin.vercel.app`. El gate
cerró 10/10 exit `0` con `checkedAt 2026-08-09T14:42:10Z`; el browser público
verificó `/login` y `/roles` —siete perfiles— a 390/1440 px sin overflow,
errores de consola ni requests externos, mientras `/dashboard`, `/inicio` y
`/manuales` anónimos redirigieron al login. La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.

MuniGuía privada `muniguia-contextual-v1` conserva evidencia sólo local con proyección autoritativa
simulada: focal 10/10, suite raíz 533 totales —532 aprobadas y 1 smoke opt-in
omitido— y backend 20/20. La evidencia remota no certifica autorización positiva,
cuentas reales, DB o baseline restaurado, MFA/lifecycle persistido ni GRH remoto.
Este commit documental post-release no mueve el tag `v1.9.0` de `f9d1f88`.

## Gate de verdad del release

El gate de `v1.9.0` certifica exclusivamente las superficies públicas indicadas.
No demuestra una sesión positiva, MuniGuía privada ni datos conectados. El tag
permanece en `f9d1f88`; este cambio sólo registra la evidencia post-release.

Como antecedente preservado, `v1.8.1` corresponde al artefacto `b82c0b3`, al
deployment `dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` `Ready`, al gate 10/10 exit `0`
y a su GitHub Release live.

Como antecedente, el preview protegido del commit `fa5dcc5` verificó manualmente
`/dashboard`, `/inicio` y `/manuales` con huella canónica; `/` conservó una única
inyección conocida de Vercel Live y cinco fronteras API rechazaron la ausencia de
sesión con 401. La certificación productiva vigente proviene del gate 10/10 de
`v1.8.1` sobre `b82c0b3`, no de aquel preview.

`scripts/check-deployment-truth.mjs` convierte la diferencia en un gate GET-only
y fail-closed. Compara las huellas canónicas de portada de acceso, panel
`/dashboard`, workspace `/inicio`, manual `/manuales` y tour `/roles`, y cruza
esas rutas con `vercel.json`. La captura local de `inicio.html` se abre una sola vez, exige
UTF-8 válido, normaliza LF y fija `expectedWorkspaceDigest`; el probe anónimo
requiere HTML 200, cero redirects y el digest exacto. Exige una
identidad contractual distinta por API, prohíbe sus redirecciones, limita
cuerpo/tiempo y rechaza DNS no público o inestable. Emite un receipt sin bodies
ni PII. Un release sólo puede presentarse cuando
`npm run release:truth:check -- --base-url <origen>` termina con código `0`; el
gate no despliega, no corrige el destino y no sustituye la aprobación externa
del dominio, deployment ID y commit.

## Fuente y alcance confirmados

El inventario gobernado y los criterios de ingreso se mantienen en
[`DATA_SOURCE_REGISTER.md`](DATA_SOURCE_REGISTER.md). Un archivo encontrado no
se convierte en fuente por tener columnas plausibles o un nombre municipal.

- Fuente canónica: backup GRH Junín con corte 6 de agosto de 2026, tamaño
  44.537.741 bytes y SHA-256
  `e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`.
- Fuente excluida absoluta: `personas_junin`, recibida sólo como ejemplo; no se
  analiza, perfila, cruza, migra, publica ni usa como fallback.
- Alcance prioritario: evidencia agregada para Intendencia, Hacienda y RRHH.
- PII y fichas individuales: diferidas hasta diseñar la frontera de acceso y
  auditoría correspondiente. El techo exacto `recurso:acción` ya existe en local;
  los ámbitos finos persistidos por área/dato continúan pendientes.
- Tiempo real: no disponible. El sistema opera sobre un snapshot histórico.

## Relectura de las fases originales

| Fase original | Declaración anterior | Estado verificado | Decisión actual |
|---|---|---|---|
| 1. Fichas enriquecidas | “Completada” | No verificable y riesgosa: no están los datasets declarados y una ficha combina PII sensible | No publicar fichas crudas; primero permisos finos, minimización y auditoría |
| 2. Liquidación | Pendiente | `calculo` y conceptos de control ya están perfilados, pero `totpago` no concilia materialmente | Entregar control analítico agregado; no crear recibos ni motor de haberes sin reglas y conciliación autoritativas |
| 3. UX/UI enterprise | “Completada” | No existían las bibliotecas declaradas y varias pantallas seguían con datos demo | Core ejecutivo rediseñado; módulos sin fuente pasan a estado no operativo explícito |
| 4. Nuevos módulos | “Completada” | `organigrama.html` no existe; dashboard/Hacienda/IA anteriores no estaban gobernados por GRH | Reimplementación desde contratos privados y pruebas de navegador |
| 5. Inteligencia avanzada | Pendiente | Tendencias y calidad descriptiva son posibles; predicción/ML carece de dataset objetivo validado | Primero diagnóstico determinista y trazable; ML sólo con definición, baseline y evaluación temporal |

## Sprints ejecutados en el árbol local

### S0 — Recuperación y forensics de datos

Estado: **completo localmente**.

- inventario reproducible de 257 tablas y 6.573.057 filas derivado de
  `semantic.table_dictionary`; el perfil conserva aparte 22 conteos focales;
- hash y fecha de corte ligados al artefacto;
- análisis de fechas corruptas/futuras y claves huérfanas;
- hallazgo crítico de diferencias `calculo`/`totpago`;
- exclusión explícita de `personas_junin`.

### S1 — Seguridad y aislamiento

Estado: **completo en código local; falta despliegue**.

- autorización revalidada contra DB en funciones Serverless y backend Express;
- usuario activo, rol/tenant actual y tenant `ACTIVE`, o `TRIAL` con vencimiento futuro explícito;
- rutas críticas limitadas por rol y tenant;
- techo compartido y fail-closed de 26 recursos, 12 acciones, 46 permisos y 79
  firmas de ruta exactas (37 Serverless y 42 Express), sin wildcard ni jerarquía;
- CRUD con allowlists, límites y transacciones;
- webhook de WhatsApp con autenticidad e idempotencia acotada;
- XSS y caché de APIs autenticadas corregidos;
- credenciales conocidas y seeds inseguros retirados.

No es certificación de producción: faltan configuración de secretos, migraciones
y smokes en el entorno remoto.

### S2 — Contrato semántico GRH

Estado: **completo localmente**.

- artefactos `profile` y `grh-semantic-v2` agregados y sin PII;
- `distinct_participants_by_year` para ausencia, licencia y movimientos; la clave
  compuesta se usa sólo para contar y no se exporta;
- calidad total 88,99/100;
- 20.534 filas temporales en cuarentena;
- series de ausencias y movimientos válidos;
- participación de liquidación y rankings de sector/centro de costo;
- control de cálculo por conceptos 990/993/994/995/996/998/999;
- conciliación cruzada con diferencias materiales visibles;
- publicación privada tenant-bound preparada.

### S3 — Superficies ejecutivas

Estado: **frontera ejecutiva segura cerrada localmente; falta certificación remota**.

- Centro Ejecutivo GRH;
- Centro Ejecutivo RRHH;
- Hacienda y Nómina de control;
- endpoint seguro `GET /api/grh-executive`, contrato exacto
  `grh-executive-v2` y umbrales k=5/k=10;
- endpoint seguro `GET /api/grh-quality`, contrato exacto `grh-quality-v1` y
  salida sin categorías, códigos de celdas ni importes;
- endpoint seguro `GET /api/grh-close`, contrato exacto `grh-close-v1`, k=10,
  componentes/control y conciliación real por período;
- endpoint seguro `GET /api/grh-decision-brief`, contrato exacto
  `grh-decision-brief-v1`, k=10 y brief ejecutivo agregado sin PII, importes,
  códigos de fuente/celda ni etiquetas;
- Centro de Calidad y Linaje GRH migrado localmente a `grh-quality-v1`;
- dashboard principal transversal;
- backend de Reportes convertido a proyección portable k=10 y contrato
  `grh-executive-report-v2`, con interfaz alineada localmente.

Panel, Centro Ejecutivo GRH, Calidad, RRHH y Hacienda consumen localmente
`/api/grh-executive` + `/api/grh-quality`; el Panel integra además
`/api/grh-decision-brief`. Tienen cero referencias HTTP al
contrato fuente. `/api/grh-data` conserva autenticación y binding tenant, pero
responde `410 GRH_RAW_CONTRACT_RETIRED` sin leer artefactos. Reportes, PDF y
Asistente leen el bundle directamente sólo en servidor y construyen la
proyección portable antes de responder. `profile` y `semantic` quedan
exclusivamente en backend. Hacienda incorpora un cierre mensual explicado:
compara únicamente meses calendario consecutivos liberados k≥10, mantiene la
moneda no declarada y no exporta PII, etiquetas o códigos. Es control aritmético,
no pago, contabilidad, causalidad ni tiempo real. El defecto P1 que repetía una
tasa global como mensual fue retirado; ninguna evidencia local certifica un
deployment.

El backend de Reportes es `GET`-only, requiere exactamente `grh.report:read`, sesión vigente y
binding del caller con `GRH_TENANT_ID`. `readGrhArtifactBundle` exige las dos filas
activas del tenant y valida metadata DB contra payload, identidad entre artefactos,
conteos focales y el pin aprobado `GRH_SOURCE_SHA256`. La salida portable conserva
ese SHA, las versiones de contratos/política y aplica k=10 antes de exponer
agregados. Sólo habilita períodos monetarios liberados; un período inexistente
responde 404 y nunca se reemplaza por otro. No consulta `data_points`, no escribe
datos y no usa `personas_junin`; declara snapshot histórico, `realtime=false`,
moneda no declarada y control de cálculo sin evidencia de pago. Bundle incompleto,
metadata o foco divergentes, pin ausente/inválido/no coincidente, o payload
inválido responden 503. La interfaz valida v2 localmente, no crea SVG ni conserva
cifras anteriores cuando falla.

La política protege antes del top-N, aplica supresión complementaria y trata una
cardinalidad desconocida como protegida. Una celda oculta conserva `null` o una
leyenda de umbral; nunca se convierte en cero.

`grh-quality-v1` permite mostrar metadatos del inventario (257 tablas, 147 con filas,
110 vacías y 6.573.057 filas), no filas crudas. Ese total proviene de
`semantic.table_dictionary`; `profile.row_counts` cubre sólo 22 tablas de foco y
4.908.280 filas, por lo que su suma no es el total del backup. Control reconcilia
cada conteo focal contra el diccionario completo y falla cerrado si difiere. Su
88,99/100 se limita al extracto agregado gobernado y explicita pesos: validez
temporal 30 %, integridad
referencial 30 %, conciliación de nómina 30 % y unicidad de legajo 10 %. También
separa cuarentena temporal (20.534 filas; motivos no exclusivos), integridad de
joins, cobertura de legajos y conciliación cruzada, mantiene un registro de
riesgos y una cola de acciones. Cobertura no equivale a conciliación ni a planta
activa; `totpago` es diagnóstico y no prueba pago. `personas_junin` permanece
excluida. La vista oculta resultados y ofrece reintento sobre el contrato seguro
local; eso no prueba un deployment ni el cierre global de consumidores.

### S4 — Asistente ejecutivo

Estado: **motor y proyección portable implementados localmente; falta certificación remota**.

Objetivo vigente:

- motor determinista con intents permitidos sobre el contrato GRH;
- evidencia, snapshot, último período, calidad y límites en cada respuesta;
- rechazo de PII, prompt injection, pagos bancarios, proyecciones y dominios sin fuente;
- sin proveedor generativo hasta contar con clave dedicada, evaluación y cuotas;
- autenticación DB-autoritativa y binding `GRH_TENANT_ID`;
- lectura server-side del bundle y proyección portable k=10, sin contrato fuente
  en el navegador ni en respuestas del bot;
- intent `close_explanation` (“Cierre explicado”): desde la misma lectura privada
  construye `grh-close-v1` para un único `YYYY-MM` liberado k≥10, sin score
  global, sustitución, causalidad, moneda, pago o PII; año solo, mes protegido o
  período ausente reciben 422;
- QA desktop/móvil y falla cerrada ante contrato privado ausente.

La evidencia focal Bot + E2E cerró 13/13 localmente. No acredita deployment.

### S5 — Retiro de datos sintéticos

Estado: **implementado en las superficies identificadas**.

`js/db.js` contenía registros sintéticos con DNI, domicilio, teléfono y salario.
Aunque fueran ficticios, se publicaban como asset y podían confundirse con datos
operativos. La estrategia es retirarlos y convertir consumidores sin fuente en
estados “sin fuente conectada”, con acciones bloqueadas y sin ceros engañosos.

El retiro original cubrió Analytics, la antigua pantalla Control, Formularios,
Licitaciones, Obras, Mapa, Presupuesto, Proveedores, Servicios, Talleres, Upload,
Vecinos, WhatsApp y la presentación heredada. Control fue reconstruida después
como Centro de Calidad y Linaje GRH, sin datos demo y con contratos privados
fail-closed. Cuentas Claras y Portal Ciudadano fueron reconstruidos
como fronteras públicas sin recolección ni cifras ficticias. La ruta IA
experimental y sus assets demo también fueron retirados.

El login institucional público es sobrio, autocontenido, responsive, accesible por
teclado y compatible con movimiento reducido. No publica usuarios demo, accesos
rápidos, KPIs ni capacidades ficticias. Está cubierto por el release público
`v1.8.1`; eso no demuestra cuentas reales ni autenticación positiva.
Importar sólo confirma archivos que el servidor interpretó y persistió dentro
de una transacción. El canal WhatsApp no crea tickets, turnos, noticias ni
encuestas sin una integración verificable, y no repite coordenadas recibidas.
También se eliminaron widgets, gráficos y scripts de parche huérfanos que podían
reintroducir datos sintéticos aunque ninguna pantalla activa los consumiera.

### S6 — Publicación privada

Estado: **código listo; entorno pendiente**.

Requiere:

- `tenants.id` real de Junín;
- migración `002_grh_artifacts.sql`;
- variables privadas correctas, incluido `GRH_SOURCE_SHA256` fijado al manifiesto
  aprobado para toda lectura DB;
- materialización activa y coherente de `profile` + `semantic`;
- smokes por rol/tenant y prueba de caída;
- repetir en el deployment la captura de red sin consumidores raw y los casos
  401/403/410. El equivalente local está cerrado; la evidencia remota no existe.

El fallback de archivos sólo existe sin lectura DB, fuera de producción y con
`ALLOW_LOCAL_GRH_ARTIFACTS=true`; valida ambos artefactos contra el manifiesto
local. Una respuesta DB inválida nunca degrada a archivos locales.

### S7A — Replay local idempotente GRH

Estado: **completo y probado localmente; no conectado ni programado**.

El snapshot canónico fue procesado por el runner O2A en un estado local aislado,
sin red, DB, cron, `api/_data` ni deployment. La primera ejecución terminó
`promoted/PUBLISHED` en 105,5 s; la repetición exacta terminó
`duplicate/DUPLICATE` en 294 ms. La evidencia cerró con una versión, una
activación, last-known-good byte-estable, un receipt de duplicado y cero locks,
residuos o workspaces activos. El bundle revalidó 257 tablas, 6.573.057 filas,
calidad 88,99/100, ausencia de PII en la salida y exclusión de
`personas_junin`.

`PUBLISHED` sólo significa activado en el estado local declarado. El ledger es
local y no firmado; no certifica autenticidad del host, resistencia a corte de
energía, backup, restore, ACL, DB, API, deployment o periodicidad. El contrato
formal está en
[`GRH_PIPELINE_RUN_CONTRACT.md`](GRH_PIPELINE_RUN_CONTRACT.md).

### S7B — Ingesta conectada/programada, CDC y backups

Estado: **roadmap operativo**.

Definido en [`GRH_OPERATIONS_ROADMAP.md`](GRH_OPERATIONS_ROADMAP.md). No puede
activarse sin acceso read-only a la fuente, condiciones contractuales, storage
privado, secretos, scheduler, identidad de workload y responsables operativos.
O2A.1 ya captura fuente, manifiesto y procesadores por descriptor, verifica con
`fstat`, crea copias privadas exclusivas `wx`/`0600` y pasa sólo esas copias a
los procesadores. Esta verificación usó fixtures: no repitió el replay real de
44 MB, no usó DB y no desplegó. Sigue pendiente autenticar host/runtime; un host
comprometido está fuera de garantía. O2A no demuestra actualización diaria,
CDC, recuperación ni continuidad.

### S8 — Roles y permisos finos

Estado: **techo exacto implementado y validado localmente; persistencia fina pendiente**.

La autorización actual registra literalmente `recurso:acción` por runtime,
método y ruta, y deniega lo desconocido. El manifiesto local contiene 26
recursos, 12 acciones, 46 permisos y 79 firmas protegidas exactas: 37 Serverless
y 42 Express. Esto completa el techo ejecutable de rutas; no completa el plano
RBAC/ABAC enterprise.

Existe una propuesta aislada para asignaciones, ámbitos, lifecycle, aprobaciones,
segregación de funciones, doble control, auditoría inmutable y acceso excepcional
a PII. No se aplicó como migración, no hay persistencia por área/fila/campo ni se
crearon cuentas por esos perfiles. También siguen pendientes invitaciones,
expiración, revocación de sesiones, recertificación, smokes remotos y despliegue.
Este orden mantiene la prioridad indicada: primero datos ejecutivos reales y
útiles; después administración fina y comprobable de identidades y permisos.

Ya está implementado el gate offline/release que separa `baselineId` inmutable
de `migrationSetId`, exige hashes exhaustivos y bloquea release sin receipt
conectado externo, reciente, target, backup/restore y doble revisión. También se
cerraron tenants TRIAL sin vencimiento o vencidos y se retiraron con `410` las
altas Express basadas en contraseñas conocidas. El checkout permanece bloqueado
porque todavía no existe el baseline real.

La secuencia, perfiles objetivo, stack de visualización/geografía y gates de
producto están en [`ENTERPRISE_PRODUCT_ROADMAP.md`](ENTERPRISE_PRODUCT_ROADMAP.md).
El procedimiento de DB está en
[`PRISMA_BASELINE_Y_DRIFT.md`](PRISMA_BASELINE_Y_DRIFT.md).

### S9 — Privacidad de agregados y proyecciones seguras

Estado: **cerrado localmente; frontera 401 observada en preview protegido, sin
datos ni certificación productiva**.

- `grh-semantic-v2` incorpora cardinalidad anual distinta sin exportar claves;
- `grh-executive-v2` aplica k=5 a rankings laborales interactivos y k=10 a
  compensación, eventos sensibles, geografía futura y salidas portables;
- `grh-quality-v1` separa calidad/linaje de categorías e importes;
- la protección se ejecuta antes del top-N, con supresión complementaria y
  cardinalidad desconocida tratada como protegida;
- `/api/grh-executive` y `/api/grh-quality` revalidan identidad/tenant, usan
  `no-store` y no devuelven los objetos fuente;
- los cinco UIs ejecutivos no referencian `/api/grh-data` y los consumidores de
  servidor proyectan antes de responder;
- `/api/grh-data` autentica, verifica tenant y devuelve
  `410 GRH_RAW_CONTRACT_RETIRED` sin leer artefactos.

Este sprint está cerrado en el checkout local, incluido el E2E de Hacienda. El
preview protegido sólo confirmó rechazo 401 sin sesión; no certifica datos,
staging ni producción.

### S10 — Cierre mensual explicado y verdad de conciliación

Estado: **cerrado localmente; frontera 401 observada en preview protegido, sin
sesión real, datos ni certificación productiva**.

- `grh-close-v1` une control de cálculo y conciliación por el mismo período;
- compara sólo meses calendario consecutivos cuando ambos alcanzan k≥10;
- protege celdas con `null` y no exporta PII, etiquetas, códigos ni filas;
- conserva la unidad de origen y declara la moneda no disponible;
- limita la lectura a descomposición aritmética, sin causalidad, pago ni tiempo real;
- Hacienda consume el contrato exacto y GRH Ejecutivo ya no atribuye el acuerdo
  global a cada período.
- el Bot expone “Cierre explicado” sobre el mismo contrato mensual y rechaza con
  422 períodos no liberados o consultas que no identifican un mes.

La evidencia de backend/cierre recibida antes de este documento acumula 411
pases y un smoke externo opt-in omitido. Es focal; el QA final del árbol y los
smokes remotos siguen separados.

### S11 — Inicio seguro por rol

Estado: **superficie pública incluida en `v1.8.1`; journeys autenticados, cuentas
y datos privados no certificados**.

- `inicio.html` es el destino seguro después del login y exige
  `navigation.workspace`;
- la política compartida `2026-08-09.1` define una variante de inicio para cada
  uno de los siete roles técnicos vigentes y deniega roles, capabilities o
  perfiles desconocidos;
- login y `/api/auth/me` calculan en servidor `capabilities`,
  `accessPolicyVersion` y un `homeProfile` mínimo con `variant`,
  `defaultPath: inicio.html` y `priorityCapabilities`;
- Inicio consulta una sola vez `/api/auth/me`, no solicita GRH ni otro dataset y
  sólo muestra accesos prioritarios presentes en las capabilities confirmadas;
- el Panel ejecutivo GRH queda como superficie separada y conserva
  `grh-close-v1`, fuente, corte, privacidad y límites de interpretación;
- `SUPER_ADMIN` sin tenant queda reducido a `session.read`,
  `navigation.workspace` y `navigation.help`; no recibe carga privada ni GRH;
- `TENANT_USER`, `INSPECTOR` y `DEMO` aterrizan en una experiencia acotada sin
  indicadores ejecutivos. La UI orienta; cada API sigue autorizando server-side;
- la matriz focal cubre siete roles en 390 y 1440 px, sesión obsoleta,
  capacidades ausentes/desconocidas y perfil malformado. El cierre consolidado
  del incremento de workspace fue 42/42 local;
- el gate E0.1 fija el rewrite exacto `/inicio` → `/inicio.html`, rechaza la
  topología vieja hacia `index.html`, redirects y comment spoof; su focal cerró
  31/31 y el consolidado workspace + release truth, 45/45 local.

Este sprint no crea cuentas, no aplica la propuesta RBAC/ABAC y no migra una DB.
El release público posterior demuestra routing y contenido estático cubiertos,
no identidades por rol, autorización positiva ni datos conectados. Las
asignaciones finas, invitaciones, MFA, revocación, SoD y auditoría
persistida continúan como propuesta/roadmap.

### S12 — Preintegración segura y shell institucional

Estado: **shell público incluido en `v1.8.1`; integración de datos, DB y sesiones
positivas pendientes**.

- **WP0-L** agrega un recolector fail-closed y read-only para observar catálogos
  y `_prisma_migrations` en una futura copia restaurada descartable. Valida
  configuración, target persistente, TLS, credencial explícita, sesión read-only,
  RLS, checkout limpio y output privado. No se ejecutó conectado contra una copia
  restaurada autorizada; no prueba baseline, drift, backup, restore ni autoriza
  una migración.
- **IAM-MAP-01** fija un mapper puro y versionado entre la foundation de lifecycle
  y el subconjunto reversible de la propuesta Prisma. No importa Prisma Client,
  no abre una DB, no persiste y no crea usuarios, invitaciones, sesiones o
  credenciales. La propuesta continúa inactiva y sin migración.
- **UX-E2A** incorpora un shell institucional compartido en las 29 páginas raíz
  que cargan navegación, con rail móvil, foco, contraste, targets táctiles,
  movimiento reducido e impresión. La proyección visual respeta las capabilities
  recibidas, pero un enlace visible no concede autorización: toda API protegida
  conserva la autorización server-side definida por el contrato de su ruta.

Este cierre no demuestra una plataforma completa ni datos privados productivos.
No se conectó, migró o escribió una DB y no se crearon identidades. El artefacto
`b82c0b3` de `v1.8.1` sí está en `master`/tag, su deployment figura `Ready` y la
superficie pública productiva cerró 10/10 con exit `0`; ese gate no verificó
cuentas, autorización positiva o datos municipales remotos.

### S13 — Brief ejecutivo GRH gobernado

Estado: **cerrado localmente como candidato `1.10.0`; producto S13 en commit
`d11fd39`, con validación local en este corte. Estos documentos no acreditan
Preview/Producción**.

- `GET /api/grh-decision-brief` es GET-only, revalida `grh.contract:read`, usuario,
  tenant, pin y contratos fuente; publica `grh-decision-brief-v1` con `no-store`;
- construye un único brief desde `grh-executive-v2`, `grh-quality-v1` y
  `grh-close-v1`, sin volver a leer o exportar objetos fuente;
- la prioridad cross-source conserva alcance global y no se inventa desde el
  acuerdo mensual; la situación y el cambio mensual usan exclusivamente el
  período gobernado;
- `temporalQuarantineRows` conserva la señal agregada de calidad; la privacidad
  `grh-small-cell-v1` exige k=10 y excluye PII, importes, códigos de fuente/celda, etiquetas,
  identificadores y filas;
- las CTA exactas a Hacienda/Calidad se muestran sólo con la capability vigente;
  503 no reintenta automáticamente y deja un único reintento manual;
- el contrato puede representar una celda mensual protegida, pero el Panel
  integral exige que la celda actual esté liberada: ante `<10` oculta toda la
  vista y falla cerrado;
- MuniGuía reemplaza la antigua lectura de alertas del Panel por el anchor real
  `#decisionBrief`, sin agregar requests GRH ni ampliar permisos;
- route policy `2026-08-09.2`: 79 rutas exactas, 37 Serverless + 42 Express; la
  access policy permanece `2026-08-09.1`. El gate preparado suma seis APIs y 11
  checks cuando exista un deployment candidato.

La evidencia local disponible es focal raíz S13 135/135, QA adversarial 104/104
con 0 P1/P2, suite raíz final de 591 pruebas —590 aprobadas, 0 fallidas y 1 smoke
opt-in omitido— y backend 20/20. Backend permanece `1.0.0`; Prisma, `1.1.0`. La
última evidencia remota continúa siendo `v1.9.0`.

## Funciones que no deben “completarse” todavía

### Motor de liquidación y recibos

No alcanza con tener filas de `calculo`. Faltan contratos formales de conceptos,
reglas vigentes, retroactivos, novedades, convenios, moneda, cierres, firma,
trazabilidad y conciliación contable/bancaria. Implementarlo ahora produciría una
segunda liquidación no autorizada.

### Simulador de paritarias

La pantalla de Hacienda puede mostrar sensibilidad descriptiva sobre el bruto de
control, pero no debe llamarse presupuesto, liquidación, proyección certificada
ni asiento. Un simulador decisional requiere reglas por convenio/concepto,
aportes, topes, retroactivos y escenarios versionados.

### Predicción de ausentismo

Los datos actuales contabilizan filas de eventos, no una tasa individual
completa ni una etiqueta futura validada. Antes de ML se necesita:

- unidad de análisis y resultado objetivo;
- exposición/denominador correcto;
- partición temporal sin fuga;
- baseline simple;
- métricas por área y grupos protegidos;
- revisión legal/laboral y prohibición de decisiones automáticas sobre personas.

### Consultas individuales por WhatsApp

Quedan bloqueadas hasta resolver consentimiento, verificación de identidad,
minimización, plantillas, retención, auditoría, revocación y secretos productivos.

## Definición de terminado

Una función sólo pasa a “completa” cuando cumple simultáneamente:

1. código integrado sin fallback demo;
2. fuente y contrato documentados;
3. autorización server-side y aislamiento por tenant;
4. manejo de carga, error y fuente ausente;
5. pruebas estáticas y dinámicas proporcionales al riesgo;
6. QA responsive y accesible si tiene interfaz;
7. migración/configuración operativa documentada;
8. smoke remoto exitoso si se declara desplegada;
9. límites de interpretación visibles;
10. evidencia de que no expone PII o secretos fuera del alcance aprobado;
11. para datos de personas agregados, umbral y cardinalidad demostrables,
    supresión adversarial y captura de red sin contratos fuente;
12. `/api/grh-data` retirado con 410 sin lectura, cinco UIs sin referencias raw y
    `profile`/`semantic` exclusivamente en backend.

Hasta cumplir los puntos 7 y 8, el estado correcto es **validado localmente**, no
“en producción”.

Cambio documental 1.8.0: registra WP0-L, IAM-MAP-01, UX-E2A y el antecedente del
preview protegido `fa5dcc5`. El release quedó integrado en `master` y su gate
público productivo terminó 9/9 con código de salida `0`; no declara cuentas por
rol, RBAC/ABAC persistido, extracción diaria, DB, backup ni datos remotos.

Cambio documental 1.8.1: incorpora `/roles` como tour visual público
`public-role-tour-v1`, sin login, JWT, autorización, APIs, DB, storage, PII o
datos municipales. El artefacto `b82c0b3` quedó fijado en `master`/tag `v1.8.1`,
la GitHub Release está live y el deployment
`dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` está `Ready`; el gate productivo cerró 10/10
exit `0` y el navegador 390/1440 px no mostró overflow, errores de consola,
requests externos ni privados. Es evidencia pública acotada, no DB, cuentas,
autorización positiva o datos remotos. Este commit sólo registra el cierre
post-release y no mueve el tag.

Cambio documental post-release 1.9.0: registra commit/tag `f9d1f88`, product
commit `ed76347`, deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` `Ready` en
`Production`, alias `https://municipio-junin.vercel.app`, gate 10/10 exit `0`
con `checkedAt 2026-08-09T14:42:10Z`, browser público 390/1440 px sobre `/login`
y `/roles` sin overflow, errores de consola ni requests externos, redirects
anónimos de `/dashboard`, `/inicio` y `/manuales` al login y GitHub Release live.
MuniGuía privada sigue sólo local con proyección autoritativa simulada; raíz 532
aprobadas más 1 smoke opt-in omitido y backend 20/20. No certifica autorización
positiva, cuentas reales, DB/baseline restaurado, MFA/lifecycle persistido ni GRH
remoto. Este commit documental no mueve el tag `v1.9.0`.
