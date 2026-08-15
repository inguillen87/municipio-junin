# Estado verificado del Plan Maestro MuniControl

Versión documental: 1.10.0 + S25 verificado en Production.
Fecha de corte: 14 de agosto de 2026.

Este documento sustituye el uso del texto “Plan Maestro v4.0” como evidencia de
implementación. Ese plan declaraba fases completas y archivos que no existen en
el checkout actual (`css/components.css`, `css/animations.css`,
`organigrama.html`, `rrhh-data/`, `api/payroll-engine.js` y
`api/payroll-receipt.js`). Las casillas de un plan no prueban que una función esté
implementada, conectada o validada.

La última GitHub Release versionada sigue siendo `v1.10.0`; su producto S13 está
en `d11fd39`. La evidencia funcional S25 quedó verificada en Production el 14 de
agosto de 2026 sobre el product SHA
`2b0411a37ec6474e6988a60b26bd3d3a51da858b`, deployment
`dpl_CEDxSq4dWFYekymNzkVBpV876JfX` y alias
`https://municipio-junin.vercel.app`. El build cerró 102 módulos, 53 HTML y 17
superficies; release truth, 31/31. El scan de seguridad
`2b4da81c-5c40-45f7-8f7b-b3bb0c4a29c4` cubrió 58/58 y registró 0 findings. La
sesión privada positiva y S13 privado conservan su evidencia histórica local.
Como antecedente técnico separado, S14C permanece `Unreleased`: reconcilia el schema con 13
tablas ya existentes en Preview —5 sensibles y 8 de referencia—, las excluye de
ambos Prisma Client y conserva su ownership para Migrate. También incorpora un
baseline v2 reproducible con Prisma 5.22 y dos casos autoritativos sobre branches
hijos efímeros de Preview. No aplicó ni marcó migraciones en Preview o Production
y no habilita cuentas, lifecycle ni release de DDL.
`GET /api/grh-decision-brief` publica `grh-decision-brief-v1`, un brief ejecutivo
único desde agregados del snapshot aprobado, con validación local: separa señal
global cross-source de evidencia mensual, expone `temporalQuarantineRows`, aplica
k=10 y no exporta PII, importes, códigos de fuente/celda ni
etiquetas/labels. Las CTA requieren capability; un 503 admite sólo reintento
manual y una celda actual `<10` hace fallar cerrado el Panel. MuniGuía apunta a
`#decisionBrief`.

El sprint S15, **comparación histórica de gestiones**, fue verificado en
Production el 13 de agosto de 2026 sobre el alias estable. Compara dos ventanas equivalentes de 972 días:
2023-12-09..2026-08-06 frente a 2019-12-09..2022-08-06. La lectura validada del
backup contiene, respectivamente, 5.936/3.395 registros de ausencia, 752/662
personas presentes en esos registros, 65.847/52.190 días informados, 281/216
fechas de ingreso informadas y 232/173 fechas de egreso informadas. Este
incremento no mueve el tag histórico `v1.10.0`. Son datos históricos, no tiempo real; no son una tasa ni una medición
de desempeño; las fechas informadas no equivalen a altas o bajas; y las
diferencias no prueban causa ni evaluación de gestión. Presupuesto contra
ejecución sigue cerrado por falta de una fuente real autorizada.

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

Después de ese release se corrigió una exposición pública de
`/prisma/schema.prisma`. El primer cambio `1d8dfcd` dejó un 404 con body del
schema y no se aceptó como solución; `e74339c` lo reemplazó por un 404 seguro con
`no-store` y `nosniff`. Production cerró el contrato ampliado 12/12. Este hotfix
post-release no mueve el tag `v1.10.0` de `4108ca0`.

Focal raíz S13 135/135; QA adversarial 104/104 con 0 P1/P2; suite raíz final de
591 pruebas —590 aprobadas, 0 fallidas y 1 smoke opt-in omitido—; backend 20/20.
Este cierre no certifica DB/baseline, cuentas, MFA/lifecycle ni datos GRH
remotos. Este commit documental post-release no mueve el tag `v1.10.0` de
`4108ca0`.

Como antecedente, el release público `v1.9.0` quedó fijado en el commit/tag `f9d1f88`; el product
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
Ese cierre documental post-release no movió el tag `v1.9.0` de `f9d1f88`.

## Gate de verdad del release

El gate de `v1.10.0` certifica exclusivamente las superficies públicas indicadas.
No demuestra una sesión positiva, S13 privado ni datos conectados. El tag apunta
a `4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7`; este cambio sólo registra la
evidencia post-release y no lo mueve.

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
cuerpo/tiempo y rechaza DNS no público o inestable. El contrato actual suma un
duodécimo probe privado: `/prisma/schema.prisma` debe responder 404 sin redirect,
sin marcadores del schema, con `no-store` y `nosniff`. Emite un receipt sin bodies
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
- Fuente laboral central: GRH. `personas_junin` es una fuente auxiliar de
  identidad, domicilios y territorio, todavía excluida de los contratos y
  publicaciones GRH actuales.
- Integración PERSONAS: Fase 1A local con manifiesto propio, matcher
  `grh-personas-linkage-matcher-v1`, contrato agregado y lectura municipal. El
  diagnóstico reconcilia 1.432 sugerencias por CUIL, 267 asistidas, 157
  ambiguas y 493 sin coincidencia. Las 1.699 sugerencias no son vínculos ni un
  crosswalk productivo; la futura tabla puente será versionada y nunca unirá
  sistemas por igualdad de `IDPERSONA`.
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

Esa exclusión describe el bundle GRH de S0 y permanece vigente para sus
artefactos. La fuente PERSONAS sólo podrá incorporarse mediante la fase separada
definida en
[`GRH_PERSONAS_INTEGRATION_BLUEPRINT.md`](GRH_PERSONAS_INTEGRATION_BLUEPRINT.md).

### S1 — Seguridad y aislamiento

Estado: **completo en código local; falta despliegue**.

- autorización revalidada contra DB en funciones Serverless y backend Express;
- usuario activo, rol/tenant actual y tenant `ACTIVE`, o `TRIAL` con vencimiento futuro explícito;
- rutas críticas limitadas por rol y tenant;
- techo compartido y fail-closed vigente de 33 recursos, 12 acciones, 56
  permisos y 101 firmas de ruta exactas (59 Serverless y 42 Express), sin
  wildcard ni jerarquía;
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
S25 reemplaza la importación legacy por un receipt en cuarentena: interpreta el
formato, calcula SHA-256 y conserva sólo métricas agregadas; no persiste filas,
no retiene el original y no publica. El canal WhatsApp no crea tickets, turnos, noticias ni
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
método y ruta, y deniega lo desconocido. El manifiesto local `2026-08-14.18`
contiene 33 recursos, 12 acciones, 56 permisos y 101 firmas protegidas exactas:
59 Serverless y 42 Express. Esto completa el techo ejecutable de rutas; no completa el plano
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
conectado externo, reciente, target, backup/restore y doble revisión. S14C agregó
el baseline v2 reproducible; el checkout sigue bloqueado para DDL porque falta
gobernar el proyecto Neon, producir la evidencia institucional y aplicar el
proceso sobre un target estable autorizado. También se cerraron tenants TRIAL
sin vencimiento o vencidos y se retiraron con `410` las altas Express basadas en
contraseñas conocidas.

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
- la política compartida `2026-08-13.4` define una variante de inicio para cada
  uno de los siete roles técnicos vigentes y deniega roles, capabilities o
  perfiles desconocidos;
- login y `/api/auth/me` calculan en servidor `capabilities`,
  `accessPolicyVersion` y un `homeProfile` mínimo con `variant`,
  `defaultPath: inicio.html` y `priorityCapabilities`;
- Inicio consulta una sola vez `/api/auth/me`. Sólo el Inicio de Intendencia,
  cuando combina `homeProfile.variant: executive-leadership` con
  `navigation.dashboard`, solicita además `GET /api/grh-decision-brief` y muestra
  tres cifras agregadas del respaldo; si el brief falla, oculta sus cifras sin
  afectar los accesos permitidos. Los demás perfiles no solicitan datos GRH;
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

Estado: **release público `v1.10.0` verificado; producto S13 en commit `d11fd39`.
La sesión privada positiva y S13 privado conservan validación local sobre el
snapshot aprobado**.

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
- route policy histórica de S13 `2026-08-09.2`: 79 rutas exactas, 37 Serverless
  + 42 Express; la access policy de ese release fue `2026-08-09.1`. El gate productivo verificó seis APIs y
  11 checks con exit `0` sobre el deployment release.

La evidencia local disponible es focal raíz S13 135/135, QA adversarial 104/104
con 0 P1/P2, suite raíz final de 591 pruebas —590 aprobadas, 0 fallidas y 1 smoke
opt-in omitido— y backend 20/20. Backend permanece `1.0.0`; el runbook Prisma,
`1.2.0`. El
cierre remoto vigente es `v1.10.0`; no certifica sesión positiva, DB/baseline,
cuentas, MFA/lifecycle ni datos GRH remotos.

### S14A — WP0-L v2 y aislamiento de configuración

Estado histórico: **contrato local cerrado; el NO-GO de configuración observado
en S14A fue resuelto posteriormente por S14B**.

- `wp0_restored_copy_observation` v2 conserva los estados `absent`, `empty`,
  `inconsistent` y `valid`. Los tres primeros usan
  `discovery_non_approvable`; `valid` usa `strict`; ninguno cambia
  `approvalEligible:false` ni autoriza baseline, DDL o aprovisionamiento.
- El catálogo ampliado se ordena canónicamente y guarda `definitionSha256` en
  lugar de SQL crudo. Sus límites fail-closed —sin truncado— son 20.000 filas,
  1 KiB por campo distinto de la definición, 256 KiB por definición y 4 MiB
  acumulados.
- La evidencia propia de S14A provino de fixtures y adapters locales. En ese
  corte no se abrió una
  conexión PostgreSQL, no se observó una copia restaurada real y no se probó la
  compatibilidad dinámica con PostgreSQL o Neon.
- La revalidación local S14A mediante `npm.cmd run test:all` cerró 611 pruebas
  raíz —610 aprobadas, 0 fallidas y 1 smoke opt-in omitido— y backend 20/20.
  Este conteo corresponde al incremento `Unreleased`; no sustituye la evidencia
  histórica 591/590 del release público `v1.10.0`.
- La auditoría runtime de S14A usó fingerprints no reversibles, sin exponer URLs
  ni credenciales. En aquel corte Preview y Production resolvieron al mismo
  destino lógico: `DB_CONFIG_ISOLATION=FAIL`; la configuración dio
  `DB_CONFIG_SSLMODE_VERIFY_FULL=false` y el vínculo con Neon quedó
  `NEON_MAPPING=UNKNOWN`. Es un antecedente, no el estado actual.
- La evidencia pública vigente de `v1.10.0` permanece 11/11 en su alcance
  público; S14A no la modificó ni la recertificó. No produjo bump, tag ni
  `v1.11.0`.

### S14B — aislamiento DB y observación WP0 conectada

Estado: **objetivo técnico conectado cerrado como descubrimiento no aprobable;
incremento `Unreleased`, sin release ni baseline**.

- Preview y Production quedaron mapeados a branches DB distintos; las conexiones
  remotas de runtime y migración exigen `sslmode=verify-full`. La reauditoría
  cerró `DB_CONFIG_ISOLATION=PASS`, `DB_CONFIG_SSLMODE_VERIFY_FULL=true` y
  `NEON_MAPPING=IDENTIFIED`. Esto acredita los targets DB observados, no la
  plataforma privada completa ni autorización positiva.
- El control plane confirmó por separado el snapshot
  `snap-autumn-shape-ac7473wo` desde main y el restore descartable
  `br-flat-waterfall-acylyfjv`. Después de WP0, el cleanup confirmó restore y
  snapshot ausentes, main y Preview `ready`, el directorio temporal ausente y el
  artefacto externo retenido.
- WP0 se ejecutó conectado desde
  `38b25e80e8413cc8688f393de2930e77098eb3f4` con observador de mínimo privilegio,
  transacción `REPEATABLE READ READ ONLY` y socket cliente `TLSv1.3`. El artefacto
  externo registró 968 filas de catálogo y `_prisma_migrations` `absent`; quedó
  `discovery_non_approvable` y `approvalEligible:false`.
- El artefacto
  `wp0-observation-48054484dbcd80ffbaa46a197a97ccfb3a8a1a97223e868dc1e755d010d8ada4`,
  SHA-256
  `64b1571c36adafe6d6b65b11c3fd109131e7e7bcff84c4cd060dfbdea82573a1`,
  mantiene `externalReferencesVerified:false`,
  `backupRestoreRelationVerified:false`, `reviewerIndependenceVerified:false` y
  `signedProviderReceiptVerified:false`. La auditoría de control plane es
  evidencia separada; no altera esos flags ni autoriza DDL.
- Una credencial owner expuesta en una salida administrativa fue rotada y su valor
  anterior quedó invalidado, sin reproducir el secreto.
- La suite raíz S14B cerró 619 pruebas —618 aprobadas, 0 fallidas y 1 smoke opt-in
  omitido—; backend cerró 20/20. No sustituye la evidencia histórica 591/590 ni
  el gate público 11/11 de `v1.10.0`.
- Al cierre histórico de S14B no existían baseline Prisma, historia de
  migraciones, drift aprobado, cuenta o lifecycle persistido. S14B siguió
  `Unreleased`, sin bump, tag, GitHub Release o `v1.11.0`.

### S14C — ownership del schema y baseline reproducible

Estado: **baseline local y replay efímero cerrados; DDL estable y release
bloqueados por gobierno del target**.

- La introspección de Preview incorporó al schema 13 tablas ya existentes: 5
  sensibles (`ciudadanos`, `empleados_grh`, `familiares_grh`, `ausencias_grh` y
  `licencias_grh`) y 8 de referencia. Sus modelos usan `@@map` + `@@ignore`; el
  contrato `prisma-schema-ownership-v1` fija `clientAccess:disabled`,
  `migratePreserved:true` y el digest de proyección
  `588d171e79b7c7841a01b8850302dee2fdbe98a9923677cb68563ece31ddedf8`.
- Ambos Prisma Client omiten los 13 modelos. Esto reduce el acceso accidental,
  pero no es seguridad DB: `$queryRaw` y credenciales sobredimensionadas siguen
  siendo una vía posible. Antes de cuentas o lectores GRH, el rol runtime debe
  acreditar cero grants sobre esas tablas o un lector explícito y auditado.
- `20260809220336_baseline`, manifest v2 y Prisma exacto `5.22.0` reproducen
  82 sentencias aditivas: 3 enums, 25 tablas, 25 índices y 29 claves foráneas;
  cero DML, `DROP` o `_prisma_migrations`. Sus IDs son
  `prisma-baseline-7c5f5aac9da1e72c6d2750110fba03944bdde6a6cb285f0d945ff84ce7be9fbb`
  y
  `prisma-set-075152dc94eadb7865ed91e952e17ef20cf0e21c5e91b5720277eb08c7b466be`.
- El replay usó dos casos autoritativos secuenciales sobre branches hijos
  efímeros del Preview `br-proud-hat-achuevv2` en LSN `0/307FA88`, sin snapshot,
  `finalize` ni target estable. A desplegó sobre DB vacía: 25 tablas, las 13
  ignoradas presentes, status consistente y diff cero. B3 resolvió una sola vez
  el baseline sobre la copia existente: historia `valid` de cero pasos, status y
  diff cero y catálogo pre/post byte-idéntico —449 filas, 140.715 bytes, SHA-256
  `0388a4871483fdd37286a03ab1d7acd01f25ef0ecae309925dadf912fe589028`—.
  B/B2 fueron intentos instrumentales
  abortados y no son aceptación.
- El receipt externo, no versionado,
  `s14c-baseline-disposable-replay-receipt.json` tiene SHA-256
  `613db7889e4e23033927814fa5ee8e4a891e9a91772268e01b08645d3f4ae51b`.
  El cleanup dejó sólo main + Preview, 2 endpoints y 0 snapshots. Preview y
  Production recibieron cero escrituras.
- Neon muestra el proyecto como `puntolimpio-staging-neon`; ownership y naming no
  están gobernados. Es un BLOCKER explícito para DDL estable, receipt de release,
  atestación CI/KMS/OIDC y cuentas. `RELEASE_ATTESTATION_NOT_GOVERNED` permanece
  fail-closed.
- La suite raíz S14C cerró 635 pruebas —634 aprobadas, 0 fallidas y 1 smoke
  opt-in omitido— y backend 20/20. El incremento sigue `Unreleased`, sin bump,
  tag, GitHub Release o `v1.11.0`. `v1.10.0` conserva el tag `4108ca0` y su 11/11
  histórico; `e74339c` es el hotfix post-release con gate productivo 12/12.

### S15 — comparación histórica de gestiones

Estado: **verificado en Production el 13 de agosto de 2026 sobre el alias
estable**.

- La comparación usa el corte canónico del 6 de agosto de 2026 y enfrenta la
  ventana actual 9 de diciembre de 2023–6 de agosto de 2026 con el mismo tramo
  iniciado cuatro años antes: 9 de diciembre de 2019–6 de agosto de 2022.
- Cada ventana contiene exactamente 972 días. No se enfrenta la gestión actual
  parcial contra los cuatro años completos de la gestión anterior.
- En la ventana actual/anterior se observaron 5.936/3.395 registros de ausencia,
  752/662 personas presentes en esos registros y 65.847/52.190 días informados.
- La fuente registra 281/216 fechas de ingreso informadas y 232/173 fechas de
  egreso informadas. Son campos históricos reportados: no acreditan altas,
  bajas, vínculo vigente ni dotación activa.
- Los cambios son descriptivos. No constituyen tasa de ausencia, desempeño,
  causalidad, mérito, responsabilidad ni evaluación política de una gestión.
- Presupuesto contra ejecución queda fuera de S15 y bloqueado hasta incorporar
  una fuente presupuestaria real, autorizada, conciliada y con período comparable.
- La salida quedó integrada, probada en escritorio y móvil y verificada de forma
  autenticada sobre el alias estable; esto no convierte el respaldo en una
  fuente en tiempo real ni habilita presupuesto.

### S16A — preparación de la integración GRH + PERSONAS

Estado: **implementado localmente; publicación y crosswalk privado pendientes**.

- PERSONAS conserva un manifiesto independiente y GRH sigue siendo la autoridad
  laboral central.
- El matcher versionado reproduce 1.699 sugerencias para revisar, 157 casos para
  revisión humana y 493 sin coincidencia, con cero colisiones de destino.
- La API y la pantalla publican únicamente el diagnóstico agregado, la cobertura
  de domicilios y sus límites; no exponen nombres, DNI, CUIL, domicilios ni IDs.
- `IDPERSONA` está prohibido como llave entre sistemas y la Fase 1A no altera
  fichas, estados laborales ni indicadores GRH.
- La próxima fase debe crear staging y crosswalk privados, aprobar finalidad,
  responsables y retención, y resolver los ambiguos con revisión humana.

### S18 — actuaciones laborales documentadas

Estado: **implementado y verificado en Production el 13 de agosto de 2026**.

- La tabla `foja` aporta 9.481 actuaciones históricas vinculadas materialmente a
  1.302 claves laborales; 9.478 fechas son válidas y 3 quedan en cuarentena.
- El contrato `grh-employment-actions-v1` compara dos ventanas iguales de 972
  días: 3.882 actuaciones y 714 personas GRH distintas en
  2023-12-09..2026-08-06 frente a 3.226 y 631 en
  2019-12-09..2022-08-06.
- Trece categorías se publican con cantidades agregadas. Nueve categorías
  pequeñas permanecen agrupadas; no se publican instrumentos, observaciones,
  usuarios, documentos ni identificadores personales.
- La ruta `/trayectoria` presenta la comparación con barras directas, detalle
  técnico plegado y estados de error aislados. Es responsive y conserva el
  acceso según capability; el Asistente ofrece la misma lectura determinista.
- Una actuación documentada no equivale a una alta, baja, cambio único, estado
  vigente ni evaluación de gestión. Las diferencias describen registros y no
  atribuyen causas.

### S19 — primer día con MuniGuía

Estado: **verificado en Production dentro de la cadena S19-S20; cada publicación
nueva debe repetir la verificación remota sobre su deployment exacto**.

- Inicio incorpora un recorrido accesible y acotado por la función, derivado de
  `muniguia-onboarding-v1` y del mismo catálogo contextual, ampliado a 20
  superficies gobernadas al incorporar S20 y S21.
- El contrato interseca cada etapa con las capabilities efectivas de la sesión;
  nunca concede rutas, roles o datos y falla cerrado ante una política o una
  proyección desconocida.
- El avance exige confirmación explícita después de abrir la etapa. Se conserva
  sólo durante la sesión del navegador, sin API, base de datos, analítica laboral
  ni evaluación del funcionario.
- MuniGuía mantiene explicación local inmediata. Los perfiles con
  `navigation.ai-assistant` pueden formular una pregunta contextual acotada; los
  demás conservan el Manual como respaldo.
- La sesión publicada de Administrador proyecta sus prioridades al techo de
  capabilities publicado, evitando tarjetas inaccesibles y el rechazo del
  parser de sesión.
- Esta fase no incorpora RAG, streaming, un proveedor nuevo ni persistencia de
  aprendizaje. Esas extensiones requieren evaluación separada de utilidad,
  costo, privacidad y operación.

### S20 — acción primero y control agregado de corridas GRH

Estado: **verificado en Production el 14 de agosto de 2026** en el commit
`85843ab2195b7e4fcebf2de6fa84adaf1e0c6400`, deployment
`dpl_CV5qGvSd6SZ1ioNkzDPGJFGnw1bF`, con release truth 27/27 y smoke por rol,
desktop y móvil sin errores de consola, red u overflow.

- Inicio y Manual comparten `municipal-task-catalog-v1`: tareas filtradas por
  las capabilities efectivas, buscador local y paleta accesible
  `Ctrl/Command+K`. El recorrido inicial queda compacto y nunca concede rutas.
- **Corridas y marcas de cierre** consume `grh-payroll-run-control-v1` y
  publica sólo agregados reproducibles de
  `histocal`, `calculo` y cobertura de `liquidacionlog`: 625 cabeceras,
  612 válidas, 13 en cuarentena y 26 corridas observadas entre enero y julio de
  2026, todas con detalle y marca operativa informada.
- La marca `CIER_31=1` no acredita cierre contable, pago, transferencia ni
  ejecución presupuestaria. Su ausencia significa “sin dato informado”, no
  “corrida abierta”.
- La ruta `/corridas-grh` reutiliza `navigation.hacienda` y
  `GRH_WORKFORCE_FINANCE_READ`; no amplía roles ni publica montos, legajos,
  mensajes técnicos o identificadores.
- El Asistente puede explicar el contrato agregado. Su enlace a Decisiones
  conserva sólo `focus=<priorityCode>`, revalida el brief vigente y nunca crea,
  abre ni modifica un compromiso automáticamente.
- El artefacto reconstruido desde el GZIP canónico es byte-idéntico, contiene
  cero PII y permanece allowlisted de forma puntual. No se incorporó presupuesto,
  compras ni tesorería porque no existe una fuente autorizada y gobernada.

### S21 — conceptos fijos, roles publicados y bienvenida progresiva

Estado: **verificado en Production el 14 de agosto de 2026** en el commit
`4cd0926627a786634696cbed8e75ecc8934100c6`, deployment
`dpl_GdoRTP3iLBFjfbTHt3CRd3Xknio3`, con release truth 28/28 y cero respuestas
5xx.

- **Conceptos fijos y cálculo** consume `grh-fixed-concept-control-v1`, generado
  dos veces de forma byte-idéntica desde el GZIP canónico (SHA del artefacto
  `19fb261158f9c71a6200a6a5522f6a14a43a46eb21cdeaf7c6e933ebe33b7bf8`).
- El ancla técnica es el cálculo válido de julio de 2026: 191 registros
  elegibles correspondientes a 185 personas GRH, resueltas por
  `legajo.IDPERSONA`; 94/90 coinciden por persona y concepto, 19/18 corresponden
  a personas observadas sin ese concepto y 78/77 a personas no observadas en el
  período. La ausencia de observación no prueba baja, error, falta de pago ni
  decisión administrativa.
- La fotografía al corte conserva 193 registros y 187 personas. La UI sólo
  publica agregados con k=10: no exporta importes, identificadores, instrumentos,
  observaciones ni filas crudas.
- Las seis identidades publicadas ahora reciben la intersección entre el techo
  agregado seguro y los permisos canónicos de su rol. DEMO, INSPECTOR y
  TENANT_USER no heredan Hacienda, Resumen GRH ni Asistente.
- Inicio muestra una invitación compacta sólo para una sesión nueva. Al aceptar,
  conserva el recorrido completo de 3 a 5 etapas debajo del Centro de tareas,
  con avance explícito, repetición y reinicio; no crea permisos ni telemetría.
- MuniGuía y el Asistente explican el mismo contrato y fallan cerrado cuando el
  artefacto, el tenant o la capability no coinciden.

### S22 — gestiones en el tiempo y comparación 4×4

Estado: **verificado en Production el 14 de agosto de 2026**.

- `/gestiones` y `grh-management-timeline-v1` presentan los dos mandatos
  completos de 1.461 días, pero comparan exclusivamente las ventanas observadas
  equivalentes `2023-12-09..2026-08-06` y `2019-12-09..2022-08-06`: 972 días
  por gestión, 66,5298% del mandato actual según el contrato.
- La matriz usa ausencias informadas, actuaciones laborales documentadas y
  fechas de ingreso/egreso informadas. Cada celda conserva unidad, cobertura y
  privacidad k=10; conceptos fijos quedan como contexto, no como comparación
  equivalente.
- En ausencias, S22 conserva 5.936/3.395 filas fuente y publica 749/662 personas
  distintas resueltas por `legajo.IDPERSONA`. S15 conserva sin sobreescritura su
  evidencia histórica 752/662, cuyo conteo correspondía a claves laborales
  distintas; S22 corrige el grano para denominar «personas» únicamente a
  `IDPERSONA` distintos.
- La navegación, Task Center, MuniGuía y Asistente reutilizan
  `navigation.dashboard`; el endpoint reutiliza
  `GRH_ORGANIZATION_ANALYTICS_READ`. No se amplían roles y los perfiles bajos
  quedan fuera.
- La IA responde de forma determinista desde el artefacto exacto, no recompone
  celdas protegidas o ausentes y falla cerrado sin reutilizar otra fuente.
- La diferencia entre registros no demuestra causa, desempeño, altas, bajas,
  impacto presupuestario ni calidad de una gestión.
- Evidencia productiva final: commit
  `8a1ab580a171e359b05629356353ed6f6e4b7364`, deployment
  `dpl_CyH6wZuYi5XjaYwqXi1ZF3Yd7wNK`, release truth 29/29, cero 5xx y smoke
  autenticado 1440/390/320 px con roles altos/bajos, MuniGuía, Task Center y
  Asistente determinista sin proveedor externo.

### S24 — red de jardines maternales

Estado: **verificado en Production el 14 de agosto de 2026**.

- `/jardines` y `grh-garden-network-v1` presentan únicamente el artefacto GRH
  pinneado: 107 personas observadas en el cálculo a julio de 2026, de las cuales
  45 se liberan en cuatro unidades y 62 permanecen en un agregado protegido.
- La tendencia gobernada contiene 24 meses y pasa de 90 a 107. Describe el
  registro disponible: no explica causalidad ni permite inferir altas, bajas o
  desempeño.
- La navegación, Task Center, MuniGuía y el Asistente reutilizan
  `navigation.organization-analytics`; el endpoint reutiliza
  `GRH_ORGANIZATION_ANALYTICS_READ`. No se agregan roles ni permisos.
- El contrato no incluye mapa, matrícula, capacidad, asistencia, presupuesto,
  PII ni dotación actual. Las unidades pequeñas nunca se reconstruyen desde el
  bucket protegido.
- La respuesta de IA para las tres preguntas publicadas se deriva sólo del
  mismo artefacto y conserva sus límites. Si el pin, el contrato, el grounding
  o las citas actuales fallan, la ruta falla cerrado o vuelve explícitamente a
  la respuesta determinista; no usa otra fuente.
- La promoción quedó acreditada por el commit
  `5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment Production
  `dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, release truth 30/30 y cero 5xx.
- El smoke autenticado cubrió Intendencia 1440 px y Administración 390 px,
  MuniGuía 3/3, Task Center e IA determinista. Usuario, Inspector y Demo no
  reciben navegación/tarea y la API responde 403 sin leer el artefacto. No hubo
  requests a OpenAI o Hugging Face ni escrituras de datos.
- La promoción quedó acreditada por el commit
  `5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment Production
  `dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, release truth 30/30 y cero 5xx.
- El smoke autenticado cubrió Intendencia 1440 px y Administración 390 px,
  MuniGuía 3/3, Task Center e IA determinista. Usuario, Inspector y Demo no
  reciben navegación/tarea y la API responde 403 sin leer el artefacto. No hubo
  requests a OpenAI o Hugging Face ni escrituras de datos.
- La promoción quedó acreditada por el commit
  `5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment Production
  `dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, release truth 30/30 y cero 5xx.
- El smoke autenticado cubrió Intendencia 1440 px y Administración 390 px,
  MuniGuía 3/3, Task Center e IA determinista. Usuario, Inspector y Demo no
  reciben navegación/tarea y la API responde 403 sin leer el artefacto. No hubo
  requests a OpenAI o Hugging Face ni escrituras de datos.

### S25 — ingreso gobernado y próximo paso por rol

Estado: **verificado en Production el 14 de agosto de 2026** sobre el product SHA
`2b0411a37ec6474e6988a60b26bd3d3a51da858b`, deployment
`dpl_CEDxSq4dWFYekymNzkVBpV876JfX` y alias
`https://municipio-junin.vercel.app`.

- `/api/source-intake` acepta exclusivamente CSV/XLSX/XLS/JSON/PDF/TXT de hasta
  4 MiB, valida metadatos cerrados y produce SHA-256 más un perfil estructural
  agregado. Nunca responde filename, headers, filas, valores o texto.
- Todo receipt privado queda `quarantined`. La evaluación de Administrador es
  sólo lectura: puede inspeccionar la pantalla y el `GET`, pero sus controles
  están deshabilitados y el `POST` responde 403 antes de procesar un archivo.
  Sólo una sesión privada autorizada registra el receipt append-only y
  tenant-bound en `AuditLog`.
- El original no se conserva y no se ejecuta antimalware. Por eso el flujo no
  aprueba, publica, transforma ni incorpora una fuente a dashboards.
- Upload y Google Sheets legacy quedan retirados con 410. Inicio muestra una
  única acción siguiente permitida por las capabilities; la evaluación deriva a
  Calidad y no ofrece carga en Task Center/Ctrl+K. Mantiene MuniGuía
  como ayuda secundaria, sin sumar otra superficie ni otra API de onboarding.
- El build productivo cerró 102 módulos, 53 HTML y 17 superficies; release truth
  cerró 31/31. El scan `2b4da81c-5c40-45f7-8f7b-b3bb0c4a29c4` cubrió 58/58 con
  0 findings.
- El browser productivo confirmó el próximo paso Calidad para Evaluación
  Administrador, Task Center/Ctrl+K sin ingreso, 12/12 controles deshabilitados
  en `/importar`, `GET` 200 vacío y `POST` 403 pre-parser con
  `PUBLISHED_DEMO_ROUTE_DENIED`. Un rol bajo quedó denegado. Las matrices
  1440/390/320 px, forced-colors y reduced-motion cerraron sin overflow ni
  errores, con cero requests a OpenAI/Hugging Face y cero escrituras DB.
- El `POST` privado 201 fue validado localmente. No se ejerció una escritura
  privada en Production, por lo que esta promoción no certifica persistencia DB
  positiva remota del receipt.
- `CuentasClaras_Junin_2026.csv` sigue en cuarentena. S25 no habilita
  presupuesto contra ejecución ni convierte una estructura plausible en dato
  municipal autorizado.

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
