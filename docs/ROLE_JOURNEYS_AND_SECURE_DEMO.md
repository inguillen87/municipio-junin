# Recorridos por rol y demostración segura — MuniControl

**Versión:** 1.10.0
**Fecha de corte:** 14 de agosto de 2026
**Estado:** S24 verificado en Production; commit
`5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment
`dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, release truth 30/30
**Antecedente versionado:** release público histórico `v1.10.0` verificado; producto S13 en commit `d11fd39`

La sesión privada positiva y S13 privado conservan validación local sobre el
snapshot aprobado. S13 entrega localmente `GET /api/grh-decision-brief` y
`grh-decision-brief-v1`: un brief ejecutivo único desde agregados del snapshot
aprobado, con validación local. Separa señal global cross-source de evidencia
mensual, expone `temporalQuarantineRows`, aplica k=10 y excluye PII, importes, códigos de fuente/celda y
etiquetas/labels. Cada CTA exige su capability; un 503 permite sólo reintento
manual y una celda actual `<10` hace fallar cerrado el Panel. MuniGuía suma el
anchor real `#decisionBrief`.

Para el release histórico `v1.10.0`, route policy `2026-08-09.2` y access
policy `2026-08-09.1` cubrían 26 recursos, 12 acciones, 46 permisos y 79 firmas de ruta
—37 Serverless + 42 Express—. El commit/tag de ese release apunta a
`4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7`; el objeto del tag anotado es
`07ac9eacf8bd89f27f5c437b99e713e8497b8934`. La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.10.0` está live,
no draft y no prerelease.

El deployment Production `dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` quedó `READY`,
alias `https://municipio-junin.vercel.app`, con `gitSource master/4108ca0`. El
gate productivo cerró 11/11 exit `0` con
`checkedAt 2026-08-09T16:33:56.200Z`. El browser público cerró 10/10 estados a
390/1440 px: `/` y `/roles` visibles; `/dashboard`, `/inicio` y `/manuales`
anónimos redirigen al login; 0 overflow, warnings/errores de consola, overlays,
requests externos y fallas de red. Los logs del corte registraron 0 errores y
0 respuestas 500.

Focal raíz S13 135/135; QA adversarial 104/104 con 0 P1/P2; suite raíz final de
591 pruebas —590 aprobadas, 0 fallidas y 1 smoke opt-in omitido—; backend 20/20.
Este cierre no certifica DB/baseline, cuentas, MFA/lifecycle ni datos GRH
remotos. Este commit documental post-release no mueve el tag `v1.10.0` de
`4108ca0`.

Como antecedente, `v1.9.0` conserva esta evidencia:

El commit/tag `v1.9.0` es `f9d1f88` y el product commit es `ed76347`. El
deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` figura `Ready` en `Production`
con alias `https://municipio-junin.vercel.app`; `release:truth:check` cerró
10/10 exit `0` con `checkedAt 2026-08-09T14:42:10Z`. El browser público verificó
`/login` y `/roles` —siete perfiles— a 390/1440 px sin overflow, errores de
consola ni requests externos; `/dashboard`, `/inicio` y `/manuales` anónimos
redirigieron al login. La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.

MuniGuía `muniguia-contextual-v1` conserva evidencia privada sólo local, con una
proyección autoritativa simulada: focal 10/10, suite raíz 533 totales —532
aprobadas y 1 smoke opt-in omitido— y backend 20/20. No agrega requests de IA,
GRH u otras APIs ni accesos a storage, no lee indicadores y no concede permisos.
Selectors y anchors siguen verificados por CI; si el target no está visible, se
omite sólo «Ubicar».
La evidencia remota no certifica autorización positiva, cuentas reales, DB o
baseline restaurado, MFA/lifecycle persistido ni GRH remoto. Ese cierre
documental post-release no movió el tag `v1.9.0` de `f9d1f88`.

## 1. Propósito

Esta guía define qué experiencia debe recibir cada perfil, qué puede demostrarse
hoy y qué requiere todavía una política, una migración o una integración. Es el
contrato de trabajo para producto, ingeniería, seguridad, capacitación, ventas y
aceptación institucional.

Un enlace visible no concede acceso. Toda decisión se autoriza en el servidor con
identidad vigente, municipio, capacidad, ámbito y estado del recurso. La interfaz
puede ayudar a comprender el permiso, pero nunca reemplaza esa frontera.

## 2. Tres estados obligatorios

| Estado | Significado | Cómo se presenta |
|---|---|---|
| Operativo local | Existe código, contrato y prueba local sobre una fuente declarada | Puede demostrarse identificando fuente, período y limitaciones |
| Condicionado | Existe el flujo, pero requiere DB, tenant, proveedor o artefacto privado configurado | Se prueba sólo en un preview preparado; sin configuración debe fallar cerrado |
| Roadmap | Falta política, migración, fuente o evidencia remota | Se muestra como diseño futuro, nunca como operación simulada |

Como antecedente, el artefacto `b82c0b3` está integrado en `master` y fijado por el tag `v1.8.1`;
la GitHub Release está live. El deployment
`dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` figura `Ready`, el gate productivo cerró 10/10
con exit `0` y el browser de producción a 390 px y 1440 px quedó sin overflow,
errores de consola, requests externos ni destinos privados. Esa evidencia
certifica las rutas y fronteras públicas cubiertas; no demuestra DB conectada,
cuentas reales, autorización positiva ni datos municipales remotos.
Cada capacidad privada conserva sus propios gates de tenant, fuente, rol y
rollback.

## 3. Roles técnicos que existen hoy

El enum vigente reconoce exactamente estos siete identificadores. Son roles
gruesos; todavía no sustituyen asignaciones por área, finalidad o expediente.

| Rol vigente | Uso actual responsable | Límites que deben explicarse |
|---|---|---|
| `SUPER_ADMIN` | Operación excepcional de plataforma | No debe convertirse en lector rutinario de información municipal ni usar privilegios ambientales |
| `TENANT_ADMIN` | Operación técnica del municipio e ingestas condicionadas | No constituye Tesorería, Compras, Contaduría ni aprobación institucional |
| `INTENDENTE` | Lectura ejecutiva agregada autorizada | No muta evidencia fuente ni certifica pagos, presupuesto o asientos |
| `CONTADOR` | Lectura de controles agregados GRH/Hacienda | El nombre técnico no prueba que la fuente sea un libro contable certificado |
| `TENANT_USER` | Acceso municipal general limitado por capacidades actuales | No tiene todavía ámbito de secretaría, área o expediente |
| `INSPECTOR` | Identidad técnica reservada para operación territorial | No existen aún asignaciones de casos; las superficies con PII permanecen retiradas |
| `DEMO` | Preview controlado sin PII | No debe existir como acceso público, contraseña compartida ni identidad de producción |

Cuando una capacidad no está en la política versionada, la respuesta correcta es
denegarla. No existe herencia por jerarquía, wildcard ni la regla “un rol alto
puede hacer todo”.

La política local `2026-08-13.4` concede `navigation.workspace` a los siete
identificadores y proyecta en servidor un perfil mínimo. Si una cuenta
institucional vigente posee uno de esos roles, login y `/api/auth/me` emiten
`capabilities`, `accessPolicyVersion` y exactamente `variant`, `defaultPath` y
`priorityCapabilities` dentro de `homeProfile`. Esto no prueba que exista una
cuenta aprovisionada para cada rol.

| Rol | Variante exacta de Inicio | Prioridad local | Límite destacado |
|---|---|---|---|
| `SUPER_ADMIN` | `platform-governance` | gobierno, ingesta, inventario y calidad cuando existe tenant/capability | Sin tenant queda sólo en Inicio; cero GRH privado |
| `TENANT_ADMIN` | `municipal-operations` | ingesta, inventario y calidad | Operar fuentes no equivale a aprobar decisiones |
| `INTENDENTE` | `executive-leadership` | Panel, GRH y Reportes | Lectura agregada; no modifica evidencia |
| `CONTADOR` | `financial-control` | Hacienda, Reportes y Calidad | Cálculo no prueba pago ni contabilidad |
| `TENANT_USER` | `municipal-limited` | Manual y servicios públicos | Sin módulo privado implícito |
| `INSPECTOR` | `territorial-unassigned` | Manual y procedimiento | Sin casos, agenda, PII o geografía inventados |
| `DEMO` | `controlled-preview` | Manual y superficies públicas | Sin datos municipales ni acceso ejecutivo |

## 4. Perfiles funcionales objetivo

Los siguientes perfiles describen el producto enterprise. Salvo coincidencia
explícita con un rol vigente, están en **Roadmap** y no deben aprovisionarse todavía.

| Perfil objetivo | Ámbito | Recorrido principal | Segregación obligatoria |
|---|---|---|---|
| Intendencia | Municipio completo, sólo agregado | Panel → brief decisional → CTA autorizada → evidencia → decisión registrada | No cargar, corregir ni publicar evidencia |
| Secretaría | Unidades organizativas asignadas | Indicadores del área → casos → responsables → seguimiento | Sin lectura transversal por jerarquía política |
| Contaduría | Contabilidad y conciliación | Control → diferencias → documentación → cierre | No ejecutar el pago que concilia |
| Tesorería | Órdenes autorizadas, caja y pago | Bandeja aprobada → validación → ejecución → comprobante | No crear y aprobar su propia orden |
| Compras | Solicitudes, proveedores y comparativas | Requerimiento → cotizaciones → evaluación → orden | No adjudicar y pagar unilateralmente |
| RRHH | Legajos y novedades autorizadas | Novedad → validación → cálculo → calidad → cierre | PII mínima; acceso por finalidad y registrado |
| Administración | Área y tipo de trámite asignados | Carga → validación → derivación → corrección | Campos y estados explícitamente permitidos |
| Inspector/a | Casos asignados | Agenda → caso → evidencia → resultado | Nunca listado global de PII o casos de terceros |
| Auditoría | Evidencia inmutable autorizada | Evento → actor → fuente → decisión → exportación justificada | Sólo lectura; no reescritura de registros |
| Empleado/a | Autoservicio | Perfil propio → recibo/trámite → seguimiento | Ámbito `SELF`; nunca información de terceros |
| Tecnología municipal | Tenant, identidades e integraciones | Salud → configuración → acceso → incidente | No aprobación financiera ni acceso rutinario a PII |
| Plataforma | Salud multi-municipio | Tenant → servicio → límites → soporte | Sin acceso ambiental a datos municipales; break-glass temporal |

## 5. Matriz pantalla, dato y acción

| Superficie | Fuente o estado actual | Lectura/acción que puede demostrarse | Frontera vigente |
|---|---|---|---|
| [`inicio.html`](../inicio.html) | Sesión autoritativa y brief agregado autorizado | Portada, recorrido y prioridades para los siete roles vigentes | Requiere `navigation.workspace`; siempre consulta `/api/auth/me`; sólo el Inicio de Intendencia agrega `grh-decision-brief-v1` y ante falla no muestra cifras |
| [`dashboard.html`](../dashboard.html) | GRH privado, snapshot | Panel Ejecutivo GRH, cierre mensual y brief único `grh-decision-brief-v1` con señal global separada de evidencia mensual | Requiere `navigation.dashboard`, tenant y cuatro contratos GRH válidos; CTA sólo por capability |
| [`grh-ejecutivo.html`](../grh-ejecutivo.html) | GRH privado, snapshot | Serie de control, conciliación y sectores | No moneda declarada; cálculo no equivale a pago |
| [`rrhh.html`](../rrhh.html) | GRH privado, snapshot | Dotación participante, ausencias, movimientos y calidad | Sin fichas individuales ni PII cruda |
| [`hacienda.html`](../hacienda.html) | Control de cálculo GRH | Bruto, retenciones, neto y conciliación interna | No acredita banco, presupuesto o asiento |
| [`ia.html`](../ia.html) | Contrato semántico GRH | Respuestas deterministas con período y evidencia | Rechaza PII, inyección, pronóstico y preguntas sin evidencia |
| [`reportes.html`](../reportes.html) | Bundle GRH privado `profile + semantic`, operativo local | Cuatro SVG agregados para períodos GRH existentes | Exige SHA aprobado, tenant exacto y bundle completo; no usa `data_points` ni sustituye períodos |
| [`importar.html`](../importar.html) | Ingreso gobernado S25 candidate local | Una sesión privada declara metadatos y obtiene un receipt estructural en cuarentena; la evaluación sólo inspecciona el flujo | TENANT_ADMIN publicado tiene formulario deshabilitado y cero POST; persistencia privada registra auditoría, pero no conserva el original ni publica datos |
| [`auditoria.html`](../auditoria.html) | Inventario legacy condicionado | Inventario y actividad derivada disponible | No es todavía un log institucional inmutable |
| [`manuales.html`](../manuales.html) | Documentación local | Ayuda, límites y procedimientos | Debe ser visible para toda sesión válida |
| [`mapa.html`](../mapa.html) | Roadmap | Diseño geográfico futuro | Sin PostGIS/MapLibre, fuente, SLA ni actualización certificada |
| [`vecinos.html`](../vecinos.html) | Retirado/roadmap | Explicación de capacidad futura | No recolecta reclamos ni PII |
| [`admin.html`](../admin.html) | Gate técnico | Informa que la administración real no está disponible | No simula altas ni persiste en el navegador |

Las APIs siguen siendo autoritativas aunque una pantalla esté oculta. Una prueba
de rol debe llamar también el endpoint, no limitarse a revisar el menú.

## 6. Segregación de funciones

Estas reglas son requisitos de aceptación, no recomendaciones opcionales:

1. quien carga una fuente no puede aprobar su publicación;
2. quien crea una orden de pago no puede aprobarla ni ejecutarla;
3. quien ejecuta un pago no puede efectuar su conciliación final;
4. quien solicita una compra no puede evaluar, adjudicar y pagar por sí solo;
5. quien solicita un rol no puede aprobar su propia elevación;
6. quien administra la plataforma no obtiene por defecto acceso a PII municipal;
7. quien inicia un restore no lo certifica sin una segunda persona;
8. toda excepción break-glass tiene motivo, duración, aprobador y auditoría;
9. la misma identidad no puede actuar como maker y checker de un expediente;
10. ningún rol comodín reemplaza una asignación temporal y acotada.

## 7. Demostración segura de roles

### 7.1 Lo que no se entrega

- correos o contraseñas fijas en Git, HTML, capturas, manuales o mensajes;
- una clave compartida entre perfiles;
- usuarios conectados a datos municipales reales para una venta;
- accesos sin vencimiento;
- roles futuros creados sólo para que aparezcan en una presentación;
- bypass por query string, `localStorage`, token fabricado o modo “demo”.

### 7.2 Recorrido visual público `/roles`

`/roles` es un recorrido visual no autenticado para comparar los siete perfiles
vigentes y entender qué experiencia se busca construir para cada uno. Es una
superficie pedagógica: no solicita autenticación, no emite ni acepta JWT, no
autoriza acciones, no crea cuentas y no consulta APIs, DB, storage, PII ni datos
municipales.

El recorrido puede mostrar nombres funcionales, prioridades, límites y pantallas
de referencia porque ese contenido ya es documental y no contiene información
de personas o del municipio. Su única salida operativa navega hacia el acceso
institucional `/login`; no enlaza superficies privadas. Elegir una tarjeta nunca
cambia el rol de una sesión, no crea una sesión y no demuestra que el perfil esté
aprovisionado. El contrato visible se identifica como
`public-role-tour-v1`.

Por eso `/roles` debe presentarse como **tour visual**, no como demo de seguridad.
La seguridad por roles sólo se acredita con identidades temporales gobernadas,
respuestas permitidas y denegadas del servidor, aislamiento cross-tenant y
revocación verificable.

### 7.3 Entorno de preview

Cada demostración debe usar un tenant aislado, datos sintéticos explícitamente
rotulados y una URL aprobada. El snapshot real GRH sólo se presenta en un entorno
institucional autorizado y con artefactos privados materializados.

El preview debe registrar:

```text
preview_id:
commit:
deployment_id:
tenant_demo_id:
fuente_demo:
identidades_creadas:
fecha_inicio:
fecha_expiracion:
responsable_tecnico:
responsable_institucional:
smokes_permitidos:
smokes_denegados:
evidencia_cross_tenant:
revocacion_final:
```

La verificación manual histórica de `fa5dcc5` fue más estrecha que ese registro:
en el preview protegido, `/dashboard`, `/inicio` y `/manuales` coincidieron con
su huella canónica; `/` mostró el acceso con una única inyección conocida de
Vercel Live; y las cinco fronteras API rechazaron la ausencia de sesión con 401
y contrato específico por ruta. No hubo identidades, tenant demo, autorización
positiva, datos GRH ni prueba cross-tenant; por eso no se presenta como demo por
rol. La certificación productiva posterior de `v1.8.0` proviene del gate público
9/9 con código de salida `0`, no de aquel preview, y tampoco acredita DB, cuentas
o datos municipales remotos.

### 7.4 Ciclo de cuenta objetivo

El ciclo enterprise requerido es:

```text
INVITED -> FIRST_LOGIN_REQUIRED -> ACTIVE -> SUSPENDED | EXPIRED | REVOKED
```

Antes de habilitarlo deben existir en DB y servidor:

- invitación con hash, finalidad, expiración y uso único;
- contraseña inicial aleatoria o enlace sin contraseña reutilizable;
- cambio obligatorio en el primer ingreso;
- `tokenVersion` o sesiones revocables;
- vencimiento de cuenta y asignación;
- desactivación inmediata autoritativa;
- registro de alta, cambio de rol, acceso, denegación y revocación;
- protección contra fuerza bruta distribuida;
- recuperación aprobada sin revelar si un correo existe.

El schema vigente no implementa todavía todo este lifecycle. Por eso no se deben
publicar “usuarios de cada rol” hasta que la migración y los E2E lo demuestren.

### 7.5 Aprovisionamiento actual retirado

`db:seed` es un gate fail-closed: siempre termina con código `1` y
`ACCOUNT_LIFECYCLE_NOT_GOVERNED`. No recibe secretos, no conecta a la DB y no
crea identidades. Las altas Express de tenants/usuarios con contraseña conocida
responden `410`; PUT/PATCH de tenants responde
`410 TENANT_LIFECYCLE_NOT_GOVERNED`.

La máquina de estados pura documentada en
[`ACCOUNT_LIFECYCLE_STATE_MACHINE.md`](ACCOUNT_LIFECYCLE_STATE_MACHINE.md) sirve
para probar invariantes sin DB, pero no habilita cuentas. Ningún rol vigente o
futuro se aprovisiona hasta implementar invitación, MFA, sesión revocable, SoD,
auditoría transaccional, migración y E2E.

IAM-MAP-01 agrega un mapper puro entre esa foundation y el subconjunto reversible
de la propuesta Prisma. No importa Prisma Client, no persiste y no crea usuarios,
invitaciones, sesiones o credenciales. UX-E2A agrega un shell institucional
compartido y accesible; organiza enlaces ya autorizados, pero no concede acceso.
Ambos incrementos forman parte de `v1.8.0` en `master`; WP0-L continúa sin una
ejecución conectada contra una copia restaurada autorizada.

## 8. Guion de presentación por rol

La presentación pública puede comenzar en `/roles` para explicar visualmente las
responsabilidades sin login ni datos. Una demostración autenticada comienza en
[`inicio.html`](../inicio.html), confirma rol, tenant y versión de política, y
explica que la portada sólo carga el brief GRH agregado para el Inicio de
Intendencia con variante `executive-leadership`. Los accesos prioritarios siguientes provienen
del servidor y no conceden por sí mismos el permiso del endpoint:

| Rol vigente | Primera comprobación | Siguiente paso permitido | Denegación que debe verse |
|---|---|---|---|
| `SUPER_ADMIN` | Gobierno de plataforma y tenant actual | Calidad/ingesta sólo con tenant y capability | Sin tenant: sólo Inicio, cero privados/GRH |
| `TENANT_ADMIN` | Municipio y trazabilidad de fuente | Importar, inventario o Calidad | No lifecycle de cuentas ni aprobación institucional |
| `INTENDENTE` | Fuente, corte y prioridad ejecutiva | Panel Ejecutivo GRH, GRH o Reportes | No importación ni mutación de evidencia |
| `CONTADOR` | Período y unidad de origen | Hacienda, Reportes o Calidad | No pago, causalidad o asiento certificado |
| `TENANT_USER` | Sesión vigente y acceso acotado | Manual y superficies públicas | Sin panel ni indicadores GRH |
| `INSPECTOR` | Ausencia de asignación territorial gobernada | Manual y procedimiento institucional | Sin agenda, casos, domicilios o PII |
| `DEMO` | Estado operativo/condicionado/roadmap | Manual y superficies públicas | Sin datos municipales ni acceso ejecutivo |

La matriz autenticada 7 roles × 390/1440 px y los casos de sesión obsoleta o
perfil malformado cerraron dentro del focal UX-E1A 42/42 local. Esa prueba no
creó cuentas ni usó DB. El tour `/roles` permanece separado: es visual,
no autenticado y no constituye evidencia RBAC.

### Intendencia — 12 minutos

1. Mostrar fuente, corte, calidad y ausencia de tiempo real.
2. Abrir Panel Ejecutivo y leer el brief decisional: señal global, evidencia mensual y cuarentena.
3. Profundizar sólo mediante una CTA permitida por capability, sin exponer PII.
4. Consultar al Asistente por un período explícito.
5. Mostrar una capacidad fuera de evidencia y su respuesta limitada.
6. Confirmar que el rol no puede importar ni administrar identidades.

### Contaduría — 12 minutos

1. Abrir Hacienda y definir control de cálculo versus pago.
2. Revisar bruto, retenciones, neto y diferencias.
3. Confirmar unidad de origen y conciliación cross-source.
4. Consultar un corte histórico en Reportes.
5. Documentar qué fuente contable falta antes de un cierre vinculante.

### Tecnología municipal — 10 minutos

1. Mostrar identidad y tenant vigentes desde `/api/auth/me`.
2. Mostrar un acceso permitido y un `403` deliberado.
3. Desactivar la identidad y comprobar revocación autoritativa.
4. Mostrar un `503` por fuente privada ausente, sin fallback inventado.
5. Revisar políticas TLS, orígenes, secretos y artefactos no públicos.

### Operación de datos — 10 minutos

1. Elegir módulo y período explícito.
2. Cargar un fixture sin PII y revisar límites/formato.
3. Mostrar filas insertadas, rechazadas y truncadas.
4. Confirmar que un resultado parcial no se presenta como éxito total.
5. Revisar el inventario condicionado y la ausencia de borrado destructivo.

## 9. Casos mínimos de aceptación RBAC

| Caso | Resultado esperado |
|---|---|
| Cualquiera de los siete roles vigentes | `inicio.html`, variante exacta y prioridades incluidas en las capabilities del servidor |
| `SUPER_ADMIN` sin tenant | Sólo `session.read`, `navigation.workspace` y `navigation.help`; cero requests privados/GRH |
| Versión de política obsoleta, capability desconocida o `homeProfile` malformado | Falla cerrada; sin renderizar un acceso privado |
| Rol conocido + capacidad exacta + tenant correcto | Acceso sólo al recurso y acción permitidos |
| Rol conocido sin capacidad | `403`, sin datos ni mutación |
| Capacidad o rol desconocido | Denegación fail-closed |
| Token con rol viejo tras downgrade | El rol actual de DB prevalece; `403` |
| Usuario desactivado | `401`, sesión invalidada |
| Tenant suspendido o diferente | `403` |
| DB de identidad no disponible | `503`, sin usar claims viejos |
| Asignación vencida | `403` aun con sesión válida |
| Ámbito `SELF` sobre otra persona | `403` |
| Inspector sobre caso no asignado | `403` sin PII |
| Maker intenta aprobar su propio registro | `409` o `403`, sin transición |
| Break-glass sin aprobación o vencido | `403` |
| Cuenta demo expirada | `401`; tokens y sesiones revocados |

## 10. Gate antes de crear un usuario por rol

No se entrega el juego de cuentas pedido para demostración hasta que todos estos
controles estén verdes:

- baseline y drift de Prisma revisados contra la DB destino;
- migración RBAC/ABAC aprobada y reversible;
- política versionada por recurso, acción y ámbito;
- lifecycle de invitación, primer ingreso, expiración y revocación;
- SoD y break-glass probados;
- tenant demo sin PII y dataset explícitamente sintético;
- rate limit distribuido y logging minimizado;
- E2E permitidos/denegados por cada perfil;
- prueba cross-tenant;
- responsable y ventana de demo;
- destrucción o revocación verificada al cierre.

Cumplir este gate permite entregar cuentas temporales de forma profesional. Omitirlo
produciría una demostración visual de roles, no seguridad real.

El procedimiento ejecutable para baseline, receipt externo, restore y rollback
está en [`PRISMA_BASELINE_Y_DRIFT.md`](PRISMA_BASELINE_Y_DRIFT.md).
WP0-L todavía no fue ejecutado conectado contra una copia restaurada autorizada;
su existencia no satisface el gate de baseline/drift ni habilita cuentas.

## 11. Mantenimiento

Este documento cambia en la misma entrega que cualquiera de estos elementos:

- rol, capacidad, ámbito o regla SoD;
- pantalla, endpoint o clasificación de estado;
- modelo de cuenta, sesión, invitación o revocación;
- procedimiento de aprovisionamiento o demo;
- fuente, dato sensible o política de exportación;
- prueba o evidencia de deployment.

Las fuentes técnicas actuales son
[`../shared/access-policy.cjs`](../shared/access-policy.cjs), para capacidades de
navegación y sesión, y [`../shared/route-policy.cjs`](../shared/route-policy.cjs),
como techo exacto de autorización server-side por `recurso:acción`, runtime,
método y ruta. Al corte, ese techo local `2026-08-14.18` registra 33 recursos, 12
acciones, 56 permisos y 101 firmas exactas: 59 Serverless y 42 Express. S24 fue
verificado en Production en el commit
`5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment
`dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, con release truth 30/30. El modelo de datos
propuesto, todavía inactivo, está en
[`RBAC_ABAC_DATA_MODEL.md`](RBAC_ABAC_DATA_MODEL.md); sus fases de producto se
mantienen en [`ENTERPRISE_PRODUCT_ROADMAP.md`](ENTERPRISE_PRODUCT_ROADMAP.md) y
la fundación pura de lifecycle, aún no conectada, en
[`ACCOUNT_LIFECYCLE_STATE_MACHINE.md`](ACCOUNT_LIFECYCLE_STATE_MACHINE.md), con
su mapper puro en
[`ACCOUNT_LIFECYCLE_PRISMA_MAPPING.md`](ACCOUNT_LIFECYCLE_PRISMA_MAPPING.md).
Este manual no puede declarar implementado algo que esas fuentes y sus pruebas
no demuestren.

Cambio 1.8.0: registra IAM-MAP-01, UX-E2A y la evidencia acotada del preview
protegido `fa5dcc5`. El release está integrado en `master` y el gate productivo
público cerró 9/9 con código de salida `0`. Mantiene explícito que WP0-L no fue
conectado y que esa certificación no demuestra DB, cuentas reales, autorización
positiva ni datos municipales remotos.

Cambio 1.8.1: documenta `/roles` como recorrido visual público y no autenticado.
No solicita login, no emite ni acepta JWT, no autoriza acciones, no crea cuentas
y no consulta APIs, DB, storage, PII ni datos municipales. El artefacto `b82c0b3`
está en `master`/tag `v1.8.1`, el deployment figura `Ready`, el gate productivo
cerró 10/10 exit `0`, el browser 390/1440 px quedó sin overflow, consola,
requests externos o destinos privados y la GitHub Release está live. Este commit
sólo registra evidencia documental post-release y no mueve el tag `v1.8.1`.

Cambio documental post-release 1.9.0: registra commit/tag `f9d1f88`, product
commit `ed76347`, deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` `Ready` en
`Production`, alias `https://municipio-junin.vercel.app`, gate 10/10 exit `0`
con `checkedAt 2026-08-09T14:42:10Z`, browser público 390/1440 px sobre `/login`
y `/roles` sin overflow, errores de consola ni requests externos, redirects
anónimos de `/dashboard`, `/inicio` y `/manuales` al login y GitHub Release live.
MuniGuía privada sigue sólo local con proyección autoritativa simulada; raíz
532 aprobadas + 1 smoke opt-in omitido y backend 20/20. No certifica autorización
positiva, cuentas reales, DB/baseline restaurado, MFA/lifecycle persistido ni GRH
remoto. Este commit documental no mueve el tag `v1.9.0`.
