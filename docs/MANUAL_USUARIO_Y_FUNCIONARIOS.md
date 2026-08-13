# Manual de usuario y funcionarios — MuniControl Junín

## Control del documento

| Campo | Valor |
|---|---|
| Versión | 1.10.0 |
| Incremento local | S15 `Unreleased` |
| Fecha de corte documental | 13 de agosto de 2026 |
| Estado | Release público histórico `v1.10.0` verificado; comparación de gestiones S15 en desarrollo local, sin Preview ni Production |
| Owner funcional | Autoridad municipal que apruebe el alcance; su identidad es gate de release |
| Owner técnico | Responsable de ingeniería designado en el registro de release |
| Canal institucional de incidentes | Debe constar en el registro de release; si falta, producción queda bloqueada |
| Próxima revisión | En cada cambio material y antes de cada release institucional |

Este manual está dirigido a Intendencia, secretarías, Hacienda, RRHH y personas
operadoras autorizadas. Explica lo que la plataforma puede hacer hoy, qué depende
de configuración y qué todavía es hoja de ruta.

La sesión privada positiva y S13 privado conservan validación local sobre el
snapshot aprobado. S13 incorpora `GET /api/grh-decision-brief` con
`grh-decision-brief-v1`: un brief ejecutivo único desde agregados del snapshot
aprobado, con validación local. Separa la señal global cross-source de la evidencia
mensual, muestra `temporalQuarantineRows`, aplica k=10 y excluye PII, importes, códigos de fuente/celda y etiquetas/labels. Las CTA aparecen sólo
con su capability; un 503 habilita únicamente reintento manual y una celda actual
`<10` hace fallar cerrado el Panel integral. MuniGuía usa el anchor
`#decisionBrief`.

S15 incorpora en desarrollo local una comparación entre la gestión actual y el
mismo tramo de la gestión anterior. Usa dos períodos de 972 días y muestra sólo
registros históricos agregados. No es tiempo real, no mide desempeño, no
convierte fechas informadas en altas o bajas y no atribuye una causa. Este
incremento permanece `Unreleased`: todavía no fue certificado en Preview ni
Production. Presupuesto contra ejecución continúa cerrado porque no existe una
fuente presupuestaria real autorizada en el alcance actual.

Para el release histórico `v1.10.0`, route policy `2026-08-09.2` y access
policy `2026-08-09.1` cubrían 26 recursos, 12 acciones, 46 permisos y 79 firmas de ruta
—37 Serverless + 42 Express—. El commit/tag de ese release apunta a
`4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7`; el objeto del tag anotado es
`07ac9eacf8bd89f27f5c437b99e713e8497b8934`. La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.10.0` está live,
no draft y no prerelease.

El producto S13 está en el commit `d11fd39`; esta referencia es evidencia
histórica y no afirma que el incremento local S15 esté desplegado.

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
con alias `https://municipio-junin.vercel.app`; el gate cerró 10/10 exit `0` con
`checkedAt 2026-08-09T14:42:10Z`. El browser público verificó `/login` y `/roles`
—siete perfiles— a 390/1440 px sin overflow, errores de consola ni requests
externos; `/dashboard`, `/inicio` y `/manuales` anónimos redirigieron al login.
La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.

MuniGuía privada (`muniguia-contextual-v1`) sigue probada sólo localmente con una
proyección autoritativa simulada: focal 10/10, suite raíz 533 totales —532
aprobadas y 1 smoke opt-in omitido— y backend 20/20. La evidencia remota no
certifica autorización positiva, cuentas reales, DB o baseline restaurado,
MFA/lifecycle persistido ni GRH remoto. Ese cierre documental post-release no
movió el tag `v1.9.0` de `f9d1f88`.

No reemplaza normas municipales, controles contables, procedimientos de RRHH ni
dictámenes legales. Tampoco constituye evidencia de que el checkout local esté
desplegado o conectado a una base productiva.

## 1. La regla principal de uso

MuniControl debe ayudar a decidir sin ocultar incertidumbre. Antes de usar un
indicador, una respuesta o un reporte, confirme siempre:

1. **Fuente:** de dónde proviene el dato.
2. **Corte:** hasta qué fecha o período llega.
3. **Calidad:** qué controles y exclusiones se aplicaron.
4. **Unidad:** cómo debe leerse una cantidad o un importe.
5. **Límite:** qué conclusión no puede obtenerse de ese dato.

Si falta cualquiera de estos elementos, el dato no debe usarse para una decisión
vinculante.

## 2. Fuente oficial del alcance actual

- La fuente canónica de personal es el último backup disponible de **GRH Junín**:
  corte 6 de agosto de 2026, 44.537.741 bytes y SHA-256
  `e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`.
- El sistema trabaja con un **snapshot histórico**, no con una conexión en tiempo
  real. Los cambios posteriores al corte mostrado en pantalla no están incluidos.
- `personas_junin` fue recibida sólo como ejemplo y está excluida de forma
  absoluta: no se analiza, perfila, cruza, enriquece, migra, publica ni se usa
  como fallback.
- El contrato fuente actual es `grh-semantic-v2`. Para ausencias, licencias y
  movimientos calcula participantes distintos por año sin exportar legajos,
  empresas ni las claves usadas durante la agregación.
- Las vistas ejecutivas deben recibir las proyecciones minimizadas
  `grh-executive-v2`, `grh-quality-v1` y `grh-close-v1`, no los contratos fuente completos. No
  deben exponer nombres, documentos, domicilios, teléfonos, identificadores
  individuales, etiquetas protegidas ni importes de celdas pequeñas.
- La fuente no declara moneda. Los importes se muestran como `u.m.`, “unidad de
  fuente” o “unidad de origen”. No deben convertirse visual o verbalmente en pesos,
  dólares u otra moneda sin una fuente autorizada adicional.
- Los valores de `calculo` son **control de cálculo**. No prueban transferencia
  bancaria, pago acreditado, saldo de Tesorería ni asiento contable.
- Las diferencias entre `calculo` y `totpago` permanecen visibles y requieren
  revisión; no deben ocultarse ni compensarse manualmente en una presentación.

El inventario de fuentes aprobadas, derivadas, en cuarentena y excluidas se
mantiene en [`DATA_SOURCE_REGISTER.md`](DATA_SOURCE_REGISTER.md). Que un archivo
aparezca en ese registro no autoriza a abrir sus filas ni incorporarlo a una
métrica: sólo el estado **Aprobada** y su uso permitido habilitan el pipeline.

Definiciones técnicas de respaldo:

- [Contrato semántico GRH](./data/grh-semantic.md)
- [Política de privacidad y agregación GRH](./GRH_PRIVACY_AGGREGATION_POLICY.md)
- [Estado verificado del plan](./MASTER_PLAN_STATUS.md)
- [Hoja de ruta operativa GRH](./GRH_OPERATIONS_ROADMAP.md)
- [Contrato de replay local O2A](./GRH_PIPELINE_RUN_CONTRACT.md)
- [Descripción general del repositorio](../README.md)

## 3. Estados de capacidad

### 3.1 Operativo en el checkout local

“Operativo” significa implementado y validado en código local. Para usarlo en un
despliegue siguen siendo necesarias una sesión vigente, la configuración del
municipio y los contratos privados publicados.

| Capacidad | Uso actual | Límite obligatorio |
|---|---|---|
| [Inicio seguro](../inicio.html) | Orienta el recorrido de los siete roles técnicos vigentes con capabilities calculadas en servidor | Consulta sólo `/api/auth/me`; no carga GRH, no crea permisos/cuentas y no certifica despliegue |
| [Panel Ejecutivo GRH](../dashboard.html) | Panorama transversal y comparación S15 entre dos tramos históricos de igual duración | S15 está en desarrollo local; los cambios no prueban causa, desempeño ni evaluación de gestión y no certifican despliegue, pago o tiempo real |
| [Centro Ejecutivo GRH](../grh-ejecutivo.html) | Estructura, control de cálculo y eventos desde proyecciones seguras | Consumidor migrado localmente; sin fichas individuales ni PII |
| [Centro Ejecutivo RRHH](../rrhh.html) | Participación agregada y directorio privado gobernado `grh-directory-v3`, con situación laboral informada, catálogos de contrato/revista, centro de costo y cronología acotada | La ficha nominal exige rol, usuario, tenant y finalidad autorizados; “sin egreso informado” no certifica vínculo activo y la participación en cálculo no prueba pago |
| [Hacienda y Nómina](../hacienda.html) | Cierre mensual explicado: componentes de cálculo, controles y conciliación real por período desde importes protegidos | `grh-close-v1` local; sólo compara meses calendario consecutivos si ambos alcanzan k≥10; no certifica pago, presupuesto, causalidad, contabilidad ni deployment |
| [Calidad y Linaje GRH](../control.html) | Inventario, procedencia, score, cuarentena, cobertura, conciliación y riesgos del snapshot | Consumidor migrado localmente a `grh-quality-v1`, que excluye categorías, códigos e importes |
| [Centro de Reportes GRH](../reportes.html) | Informe local sobre proyección portable con umbral k=10 | Contrato v2 alineado localmente; no declarar deployment ni documento oficial |
| [Asistente Ejecutivo GRH](../ia.html) | Respuestas deterministas con fuente, período, evidencia y límites; incluye “Cierre explicado” sobre `grh-close-v1` | No es un modelo generativo, no sustituye períodos y no decide por el funcionario |
| Autenticación y autorización server-side | Revalida usuario, rol, municipio y estado del tenant | El menú del navegador no concede permisos |
| Estados de fuente ausente | Ocultan indicadores ante contrato inválido o indisponible | No existe reemplazo con datos demo |
| Replay de ingeniería O2A/O2A.1 | Reprocesa el snapshot aprobado en estado local, conserva el último bundle válido y entrega a los procesadores copias privadas capturadas por descriptor | O2A.1 se validó con fixtures, sin repetir el replay real de 44 MB; no es actualización diaria, publicación DB, backup ni función de usuario |
| Acceso institucional | Login sobrio y default seguro `inicio.html`; la sesión incluye capabilities, versión de política y perfil de inicio calculados en servidor | `/` fue observado en preview protegido con una única inyección conocida de Vercel Live; sin usuarios demo, cuentas reales ni certificación productiva |
| Shell institucional UX-E2A | Navegación coherente desktop/móvil, foco visible, targets táctiles, movimiento reducido e impresión en las páginas que cargan el menú | Validado localmente y en rutas canónicas del preview protegido; un enlace visible no concede permisos |

Los endpoints seguros `GET /api/grh-executive` (`grh-executive-v2`),
`GET /api/grh-quality` (`grh-quality-v1`), `GET /api/grh-close`
(`grh-close-v1`) y `GET /api/grh-directory` (`grh-directory-v3`) están
implementados localmente. Panel,
GRH, Calidad, RRHH y Hacienda no conservan referencias HTTP al contrato fuente.
`GET /api/grh-data` autentica, verifica tenant y responde
`410 GRH_RAW_CONTRACT_RETIRED` sin leer artefactos. La frontera raw está cerrada
en el checkout local y `profile`/`semantic` quedan sólo en backend; esto no
certifica un deployment. El cierre de Hacienda no publica PII, etiquetas,
códigos de celda ni filas y conserva la moneda como no declarada.

El techo de autorización local `2026-08-13.8` cubre 31 recursos, 12 acciones,
53 permisos y 91 firmas exactas: 49 Serverless y 42 Express. Ese control de ruta no reemplaza los
ámbitos RBAC/ABAC por área o dato, que siguen sin migrarse.

La política de acceso local `2026-08-11.3` entrega
`navigation.workspace` a los siete roles vigentes: `SUPER_ADMIN`,
`TENANT_ADMIN`, `INTENDENTE`, `CONTADOR`, `TENANT_USER`, `INSPECTOR` y `DEMO`.
Login y `/api/auth/me` calculan las capabilities y el perfil de inicio en el
servidor. La portada muestra sólo la intersección de prioridades autorizadas;
un enlace visible nunca sustituye el permiso del endpoint. Un `SUPER_ADMIN` sin
tenant recibe sólo sesión, Inicio y Ayuda, sin GRH. La matriz local 7 roles × 2
viewports cerró dentro del focal consolidado 42/42; no prueba cuentas existentes,
DB remota ni deployment.

El cierre `1.8.0` agregó WP0-L e IAM-MAP-01 como fundaciones técnicas y el shell
UX-E2A como mejora transversal. WP0-L aún no se ejecutó conectado contra una
copia restaurada; IAM-MAP-01 no persiste ni crea usuarios; UX-E2A no concede
autorización. El artefacto `b82c0b3` está en `master`/tag `v1.8.1`; su superficie
pública productiva cerró 10/10 con exit `0`. Esto no convierte esas capacidades
privadas en DB, cuentas, autorización positiva o datos remotos certificados.

El preview protegido del commit `fa5dcc5` fue el antecedente manual:
`/dashboard`, `/inicio` y `/manuales` devolvieron HTML 200 con huella canónica
exacta; `/` mostró el acceso esperado con una única inyección conocida de Vercel
Live; las cinco fronteras API respondieron 401 sin sesión y con contrato
específico por ruta. La certificación productiva posterior de `v1.8.0` proviene
del gate público 9/9, no de aquel preview; no prueba cuentas, datos municipales,
DB conectada ni autorización positiva.

`v1.8.1` agrega `/roles`, un recorrido visual público de los siete
perfiles. No inicia sesión, no emite JWT, no autoriza, no crea cuentas y no
consulta APIs, DB, storage, PII o datos municipales. Sólo cambia la explicación
visible y deriva al acceso institucional. El deployment
`dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` figura `Ready`, el gate productivo cerró 10/10
exit `0`, la prueba de navegador a 390 px y 1440 px cerró sin overflow, errores
de consola, requests externos ni privados y la GitHub Release está live.

La prueba real O2A terminó primero `promoted/PUBLISHED` en 105,5 s y luego
`duplicate/DUPLICATE` en 294 ms. Quedaron una versión, una activación, un receipt
de duplicado y el last-known-good byte-estable, con cero locks, residuos o
workspaces activos al cierre. El bundle revalidó 257 tablas, 6.573.057 filas,
calidad 88,99/100, sin PII en la salida y con `personas_junin` excluida. Estos
estados describen el pipeline local, no un dato nuevo disponible en producción.

El hardening O2A.1 captura fuente, manifiesto y procesadores mediante descriptor,
verifica su identidad con `fstat` y crea copias privadas exclusivas (`wx`, modo
`0600`) para la ejecución. Los procesadores reciben únicamente esas copias. Esto
reduce la ventana de cambio entre verificación y uso; no protege frente a un
host completamente comprometido. La evidencia O2A.1 es focal y con fixtures: no
hubo nuevo replay real del archivo de 44 MB, DB ni deployment.

El release público vigente es `v1.10.0`: commit/tag `4108ca0`, product commit
`d11fd39` y deployment `dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` `READY` en
`Production`. Esta evidencia pública no acredita sesión positiva, DB, cuentas ni
datos GRH remotos; el commit documental post-release no mueve el tag.

Los enlaces Calidad y Linaje y Reportes se ofrecen actualmente a `SUPER_ADMIN`,
`TENANT_ADMIN`, `INTENDENTE` y `CONTADOR`. Esa visibilidad no concede acceso: la
API vuelve a validar identidad, rol, tenant y estado. Reportes exige además la
capacidad exacta `grh.report:read` y el binding con `GRH_TENANT_ID` antes de leer
el bundle privado. Toda lectura DB exige además el pin aprobado
`GRH_SOURCE_SHA256`.

### 3.2 Condicionado por entorno, datos o credenciales

Estas capacidades tienen código vigente, pero no deben presentarse como
operativas en producción sin configuración y smoke remoto exitoso.

| Capacidad | Condición necesaria | Qué hacer si falta |
|---|---|---|
| [Hub de Datos](../importar.html) | Rol administrativo, base disponible y tenant correcto | No registrar la carga como exitosa |
| Importación por archivo | Archivo válido y confirmación explícita de parseo y persistencia | Revisar filas insertadas, rechazadas y truncamiento |
| Importación por Google Sheets | Hoja pública, CSV válido y límites satisfechos | No usar Google Sheets públicos para datos sensibles |
| Informe imprimible GRH | Contrato privado disponible, rol permitido y despliegue que exponga la acción aprobada | No afirmar que existe un PDF oficial |
| Prueba de conector PostgreSQL | Destino permitido, TLS y credencial de alcance mínimo | La credencial no debe guardarse en la interfaz |
| WhatsApp institucional | Secretos, número, autenticidad, destinatarios y operación externa verificados | No prometer alertas o trámites activos |

La programación automática de importaciones no está habilitada. Una prueba de
conexión no equivale a una sincronización guardada.

La exportación cruda, el correo y la entrega programada están **retirados** y
responden `410`. No pueden habilitarse agregando una clave: requieren primero
clasificación, permisos por finalidad, auditoría tenant-bound e idempotencia.

### 3.3 Roadmap: todavía no operativo

- O2B: conexión y extracción programada o en tiempo real con GRH.
- CDC, backups propios, restore probado, monitoreo y objetivos RPO/RTO aprobados.
- Reemplazo operativo del sistema GRH de origen.
- Ámbitos persistidos por área/dato, segregación de funciones y doble control. El
  techo exacto `recurso:acción` por ruta ya está implementado localmente, pero no
  reemplaza esas asignaciones finas.
- Rol específico `SECRETARIO`, `RRHH` u `OPERADOR` con matriz definitiva.
- Fichas individuales con PII o consultas personales por WhatsApp.
- Motor oficial de liquidación, recibos de haberes o acreditación bancaria.
- Conciliación contable o bancaria automática.
- Predicción de ausentismo, recomendaciones individuales o decisiones laborales
  automatizadas.
- Simulador certificado de paritarias o presupuesto.
- Dominios de obras, compras, reclamos u otros sin una fuente gobernada conectada.
- Certificación remota del retiro raw mediante smokes anónimo, autorizado,
  cross-tenant y captura de red de los cinco UIs; el cierre actual es sólo local.

## 4. Perfiles funcionales y acceso vigente

Los perfiles de esta sección describen tareas, no crean nuevos permisos. La
política actual reconoce exactamente siete roles técnicos gruesos:
`SUPER_ADMIN`, `TENANT_ADMIN`, `INTENDENTE`, `CONTADOR`, `TENANT_USER`,
`INSPECTOR` y `DEMO`. Todavía no existe un rol técnico específico para cada
secretaría o para RRHH, y reconocer un identificador no prueba que exista una
cuenta aprovisionada con ese rol.

| Perfil funcional | Recorrido recomendado | Restricción actual |
|---|---|---|
| Intendente | Inicio → Panel Ejecutivo GRH → GRH → Calidad y Linaje → Hacienda → Asistente → Reportes | Debe tener sesión, tenant y capabilities vigentes |
| Secretario/a | Panel y detalle agregado de su competencia | El acceso depende de uno de los roles técnicos hoy permitidos |
| Hacienda / Contaduría | Inicio → Hacienda → Calidad y Linaje → conciliación → Reportes → evidencia complementaria | No puede convertir control de cálculo en pago certificado |
| RRHH | RRHH → GRH → Calidad y Linaje → eventos y movimientos | No debe buscar o inferir expedientes individuales |
| Operador/a de datos | Hub de Datos → validación → carga → inventario del resultado | Importar requiere actualmente `SUPER_ADMIN` o `TENANT_ADMIN`; no hay auditoría institucional |
| Administración técnica | Identidad, tenant, publicación de contratos e incidentes | No puede alterar datos para “hacer cerrar” una métrica |

La visibilidad de un enlace en el menú no garantiza autorización. El servidor es
la frontera definitiva y puede responder 401, 403 o 503.

### 4.1 Modelo objetivo de roles

La matriz completa de recorridos, segregación de funciones y demostración segura
se mantiene en
[`ROLE_JOURNEYS_AND_SECURE_DEMO.md`](ROLE_JOURNEYS_AND_SECURE_DEMO.md).

La siguiente tabla evita confundir la visión de producto con el RBAC ya
implementado. Un rol objetivo no debe habilitarse por semejanza de nombre ni
reutilizando permisos más amplios.

| Rol objetivo | Situación actual | Journey objetivo | Condición para habilitarlo |
|---|---|---|---|
| Intendente | Rol técnico vigente para vistas ejecutivas | Panorama → alerta → evidencia → responsable → seguimiento | Mantener acceso agregado, tenant y trazabilidad |
| Contaduría | El rol `CONTADOR` accede al núcleo GRH, Hacienda, Asistente y Reportes | Control de cálculo → conciliación → validación contable → cierre | Fuente contable autorizada para cualquier afirmación vinculante |
| Tesorería | No existe un rol específico ni una fuente bancaria gobernada | Obligación → orden → transferencia → acreditación → conciliación | Contrato de Tesorería/banco, segregación y doble control |
| Compras | No existe rol específico y las pantallas de compras carecen de fuente gobernada | Necesidad → expediente → oferta → adjudicación → contrato → recepción | Fuente de compras, reglas, auditoría y permisos por etapa |
| `SUPER_ADMIN` | Rol técnico vigente de alcance plataforma | Tenant → identidad → configuración → publicación → auditoría técnica | Uso excepcional, mínimo necesario y revisión institucional |
| Administración municipal | No existe todavía un rol administrativo de privilegio reducido | Carga/consulta autorizada → validación → derivación → trazabilidad | Permisos por acción, módulo y dato; no heredar `TENANT_ADMIN` por comodidad |
| Consulta ejecutiva | Se resuelve parcialmente con roles ejecutivos actuales | Consultar KPIs y evidencia sin mutación | Rol read-only explícito y pruebas de no escritura |
| Empleado/a | No hay autoservicio ni consulta individual habilitada | Identidad verificada → dato propio mínimo → solicitud → auditoría | Consentimiento, minimización, privacidad, revocación y soporte institucional |

### 4.2 Journeys por área: hoy y futuro

| Área | Journey utilizable hoy | Journey que sigue en roadmap |
|---|---|---|
| Intendencia | Panel → GRH/RRHH → Calidad y Linaje → Hacienda → Asistente → registro de decisión | Alertas en vivo y seguimiento automático con fuentes continuas |
| Contaduría | Control de conceptos → Calidad y Linaje → diferencias → validación en sistema contable externo | Conciliación y asiento integrados |
| Tesorería | Consultar control agregado como antecedente, sin afirmar pago | Integración bancaria, acreditación y saldo autorizado |
| RRHH | Calidad → participación → eventos agregados → revisión de fuente | Expediente individual y workflows laborales con permisos finos |
| Compras | Ningún dato de las pantallas heredadas debe usarse como evidencia municipal | Expediente, ofertas, proveedores y contratos gobernados |
| Administración | Cargar datasets analíticos y validar el resultado con rol administrativo vigente | Rol administrativo acotado, aprobaciones y segregación |
| Consulta / empleado | Sin journey individual habilitado | Portal de dato propio y solicitudes verificadas |
| Tecnología / `SUPER_ADMIN` | Revisar configuración, tenant y contratos bajo procedimiento aprobado; el alta general de identidades está retirada | Gobierno multi-municipio, invitaciones, MFA y auditoría inmutable |

## 5. Inicio y cierre de sesión

1. Abra [Acceso al Sistema](../login.html).
   La versión local presenta un acceso institucional sobrio, sin KPIs, usuarios
   demo, accesos rápidos ni promesas de capacidades no verificadas.
2. Ingrese únicamente una cuenta institucional aprovisionada. No existen
   credenciales demo predeterminadas en este manual.
3. Confirme que el nombre, el rol y el municipio mostrados correspondan a su
   identidad y tarea.
4. El login debe llevarlo a [Inicio seguro](../inicio.html). Esa portada valida
   la sesión con `/api/auth/me`, no consulta GRH ni otro dataset y ofrece sólo
   accesos prioritarios permitidos por el servidor.
5. Abra el Panel Ejecutivo GRH sólo si aparece como capacidad autorizada; recién
   allí espere a que termine la validación de las fuentes GRH.
6. Si Inicio informa que no hay módulos privados asignados, consulte Ayuda y use
   el canal institucional: no intente forzar una ruta o modificar el storage.
7. Si la fuente no se valida, no copie valores de una sesión anterior ni de una
   captura.
8. Al terminar, use la opción de cerrar sesión. No comparta tokens, contraseñas ni
   enlaces internos de sesión.

## 6. Recorrido de Intendencia

### 6.1 Lectura diaria responsable

1. Desde [Inicio seguro](../inicio.html), abra el [Panel Ejecutivo GRH](../dashboard.html).
2. Lea primero el estado de fuente, la fecha de corte y el período de referencia.
3. Verifique que la pantalla declare `grh-executive-v2`, `grh-quality-v1` y, en
   el Panel, `grh-decision-brief-v1`. Ninguna de las cinco vistas ejecutivas debe solicitar
   `/api/grh-data`; esa ruta retirada responde 410 aun para una sesión autorizada.
4. Revise los indicadores en este orden:
   - participación en el control de cálculo;
   - calidad y filas en cuarentena;
   - acuerdo y cobertura de conciliación entre fuentes;
   - distribución agregada por sector y centro de costo;
   - brief decisional: señal global separada de evidencia mensual, cuarentena y límites;
   - comparación de gestiones: mismo número de días, fechas visibles y límites de interpretación.
5. Use sólo una CTA que aparezca para su capability; abra GRH, RRHH,
   [Calidad y Linaje](../control.html) o Hacienda para entender la procedencia.
6. Use el Asistente para formular una pregunta acotada y comprobar la evidencia.
7. Registre la decisión y la validación complementaria necesaria.

### 6.1.1 Cómo leer la comparación de gestiones

La comparación evita enfrentar una gestión actual incompleta con los cuatro
años completos de la gestión anterior. Usa exactamente **972 días** en cada
lado:

Para auditoría, el contrato identifica las ventanas como
`2023-12-09..2026-08-06` y `2019-12-09..2022-08-06`.

| Qué muestra | Gestión actual<br>9 de diciembre de 2023–6 de agosto de 2026 | Mismo tramo anterior<br>9 de diciembre de 2019–6 de agosto de 2022 | Diferencia |
|---|---:|---:|---:|
| Registros de ausencia | 5.936 | 3.395 | +2.541 |
| Personas que aparecen en esos registros | 752 | 662 | +90 |
| Días informados | 65.847 | 52.190 | +13.657 |
| Fechas de ingreso informadas | 281 | 216 | +65 |
| Fechas de egreso informadas | 232 | 173 | +59 |

Para usarla correctamente:

1. Confirme primero las dos fechas y que ambos lados indiquen 972 días.
2. Lea “registros de ausencia” como cantidad de registros históricos, no como
   una tasa ni una evaluación del desempeño de las personas.
3. Lea “personas” como personas que aparecen al menos una vez en esos registros;
   no es dotación activa.
4. Lea ingreso y egreso sólo como **fechas informadas en la fuente**. No son
   altas, bajas ni prueba de un vínculo laboral vigente.
5. Use la diferencia para formular una pregunta a RRHH y revisar contexto. La
   pantalla no demuestra por qué cambió un valor ni permite calificar una gestión.
6. No intente completar presupuesto o ejecución con valores de GRH. Esa lectura
   seguirá bloqueada hasta contar con una fuente presupuestaria real,
   autorizada y conciliada.

Si el bloque no puede validar su fuente o aplicar la protección de grupos
pequeños, debe ocultar todas sus cifras y permitir un reintento manual. No copie
valores de una captura anterior.

### 6.2 Decisiones permitidas

- Priorizar una revisión de calidad o conciliación.
- Solicitar explicación del origen de una variación.
- Pedir a RRHH o Hacienda que valide una señal contra su fuente autorizada.
- Comparar períodos válidos dentro del mismo contrato y con la misma definición.
- Ordenar un análisis adicional sin individualizar personas.

### 6.3 Decisiones no permitidas sólo con MuniControl

- Autorizar pagos o afirmar que un pago fue acreditado.
- Declarar cantidad de planta activa usando participantes de liquidación.
- Aplicar sanciones, premios o decisiones laborales individuales.
- Convertir eventos de ausencia en una tasa sin denominador y exposición válidos.
- Inferir causa, fraude o responsabilidad a partir de una correlación agregada.
- Presentar el snapshot como situación de hoy o como dato en vivo.

### 6.4 Recorrido por Calidad y Linaje GRH

La pantalla consume localmente `grh-quality-v1`. Eso prueba la frontera del
consumidor, pero no un deployment. El cierre local se completa con
`/api/grh-data` retirado mediante 410 y cero referencias HTTP en los cinco UIs;
producción requiere smokes externos.

1. Abra [Calidad y Linaje GRH](../control.html) y espere el estado de fuente.
2. Confirme que la vista identifique `grh-quality-v1`, el snapshot y el linaje
   validado en backend. La salida no debe contener etiquetas categóricas,
   códigos de celdas, series monetarias ni filas crudas; `personas_junin` debe
   figurar excluida.
3. Lea el inventario completo desde `semantic.table_dictionary`: 257 tablas, 147
   con filas, 110 vacías y 6.573.057 filas. `profile.row_counts` cubre sólo 22
   tablas de foco y 4.908.280 filas; no sume esos focos como total. La pantalla
   reconcilia cada conteo focal contra el diccionario y oculta todo si diverge.
4. Interprete 88,99/100 sólo como score del extracto agregado gobernado. Su
   composición visible es validez temporal 99,44 (30 %), integridad referencial
   99,97 (30 %), conciliación de nómina 63,88 (30 %) y unicidad de legajo 100
   (10 %); no es una certificación de las 257 tablas crudas.
5. Revise las 20.534 filas en cuarentena temporal. Sus motivos pueden solaparse y
   la diferencia entre fecha y mes declarado es un diagnóstico, no una regla de
   cuarentena por sí sola.
6. No confunda **integridad de joins** (filas de hechos emparejadas y huérfanas)
   con **cobertura de legajos** (claves de legajo válidas y distintas que
   emparejan contra el maestro). Ninguna de las dos mide planta activa.
7. Lea por separado score de conciliación 63,8825 %, cobertura de corridas
   97,8405 %, tasa exacta de métricas 74,7708 % y acuerdo de valores 19,0362 %.
   La cobertura nunca equivale a conciliación; `totpago` es una fuente de
   diagnóstico y no prueba un pago bancario.
8. Revise el registro de riesgos y la cola de acciones. Incluyen el carácter
   histórico del snapshot, moneda no declarada, PII presente sólo en la fuente
   privada y excluida del navegador, filas legacy erróneas, cuarentena,
   diferencias materiales, nueve períodos anómalos de cálculo y una etiqueta de
   encoding sospechosa.
9. Si el servidor no puede validar el bundle privado o construir el contrato
   exacto de calidad, debe responder 503 sin detalles y la pantalla debe ocultar
   todos los resultados. Use **Reintentar** una vez; si persiste, detenga la
   lectura y registre el incidente.

## 7. Recorrido de Hacienda y Contaduría

1. Abra [Hacienda y Nómina](../hacienda.html).
2. Confirme `grh-close-v1`, corte, período y leyenda “control de cálculo”.
3. Lea contributivo, no contributivo, asignaciones familiares, retenciones,
   neto y contribuciones patronales sólo en `u.m.` o unidad de origen. La moneda
   no está declarada.
4. Revise las identidades y tolerancias del control. Son verificaciones
   aritméticas de `calculo`, no comprobantes de liquidación o pago.
5. Lea para ese mismo mes la cobertura de corridas, tasa exacta de métricas,
   acuerdo de valores y variación absoluta entre `calculo` y `totpago`. Son
   conciliación por período real, no una tasa global repetida en cada mes.
6. Compare sólo meses calendario consecutivos cuando ambos estén liberados con
   al menos 10 participantes. Si falta un mes o una celda queda protegida, la
   comparación no está disponible y no debe reconstruirse por diferencia.
7. Interprete el cambio entre componentes como descomposición aritmética. No
   atribuya una causa, decisión de gestión o responsabilidad a esa variación.
8. Para una decisión vinculante, contraste con Tesorería, contabilidad y banco en
   los sistemas autorizados fuera de este snapshot.

Uso permitido: detectar una diferencia, priorizar conciliación y documentar una
pregunta de control.

Uso prohibido: declarar ejecución presupuestaria, saldo disponible, pago
efectivo, deuda o asiento contable sin una fuente adicional reconciliada.

## 8. Recorrido de RRHH

1. Abra [Centro Ejecutivo RRHH](../rrhh.html).
2. Confirme fuente, corte y período de referencia.
3. Distinga siempre:
   - registros de legajo;
   - participantes distintos en el control de cálculo;
   - eventos de ausencia;
   - eventos de movimiento;
   - filas válidas y filas en cuarentena.
4. Para historia anual, verifique si el año del snapshot está marcado como
   parcial. No lo compare como año completo.
5. Abra [Centro Ejecutivo GRH](../grh-ejecutivo.html) para revisar calidad,
   definiciones y conciliación asociadas.
6. Abra [Calidad y Linaje GRH](../control.html) para distinguir cobertura,
   integridad de joins, cuarentena y riesgos antes de escalar una señal.
7. Si su identidad privada está autorizada, abra la ficha individual desde el
   directorio. Confirme ubicación informada, corte y alcance antes de interpretar
   las señales históricas.
8. Lea **Situación laboral informada** como una interpretación de las fechas de
   ingreso y egreso declaradas en `legajo`: puede indicar egreso informado, falta
   de egreso informado o una fecha faltante/inconsistente que debe revisarse.
   Ninguno de esos estados certifica por sí solo un vínculo contractual activo o
   inactivo.
9. Lea **Participación en cálculo 2026-07** como una señal separada. “Observada”
   significa que existen filas gobernadas de `calculo` para ese período; no
   acredita liquidación correcta, transferencia, recibo ni pago efectivo.
10. Use los filtros de estado informado, régimen contractual y situación de
    revista para acotar el universo. Un código sin etiqueta oficial no debe
    presentarse como una categoría entendible ni inferirse manualmente.
11. Use la cronología sólo como evidencia acotada: hasta 24 ausencias, licencias
   y períodos de filas fuente por historial. El centro de costo es una
   clasificación informada; no equivale a departamento ni asignación exclusiva.

Los conteos de ausencia y movimiento son eventos. No equivalen automáticamente a
personas, días perdidos, tasa de ausentismo, rotación ni causalidad.

## 9. Uso del Asistente Ejecutivo GRH

El [Asistente Ejecutivo](../ia.html) es determinista: clasifica la pregunta dentro
de intents habilitados y responde con el contrato GRH. No consulta un proveedor
generativo ni “aprende” de la conversación.

El intent `close_explanation`, presentado como **Cierre explicado**, construye
`grh-close-v1` desde la misma lectura del bundle privado. Responde sobre un único
mes `YYYY-MM` liberado k≥10 e incluye componentes, controles y conciliación de
ese período. No usa el score global como valor mensual y no afirma moneda,
causalidad, pago o PII. Una consulta con sólo año, un mes protegido o un período
ausente responde 422; no se sustituye por el último mes. La evidencia focal del
Bot y su E2E cerró 13/13 localmente, sin certificar deployment.

### 9.1 Cómo preguntar

1. Verifique que su rol tenga acceso ejecutivo.
2. Formule una sola pregunta, con métrica y período si corresponde.
3. Revise título, resumen, evidencia, fuente, snapshot y advertencias.
4. Use las preguntas siguientes sólo si permanecen dentro del mismo contrato.
5. Si la respuesta dice “limitado”, “no disponible” o “sin evidencia”, no fuerce
   una conclusión mediante otra redacción.

Preguntas adecuadas:

- “¿Cuántas personas participaron en el control del último período?”
- “¿Cómo se distribuyen los participantes por centro de costo?”
- “¿Cómo se distribuyen los participantes por sector?”
- “¿Cómo se distribuyen los participantes por categoría de acuerdo de origen?”
- “¿Cómo está la conciliación entre `calculo` y `totpago`?”
- “Explicá el cierre de 2026-07.”
- “¿Qué datos agregados de ausencias están disponibles?”
- “¿Cuántos movimientos válidos contiene 2024?”
- “¿Cuál es la calidad del contrato?”
- “¿Cuántas filas quedaron en cuarentena?”
- “¿Cuál es la fuente, el corte y el último período válido?”

Preguntas que deben ser rechazadas o limitadas:

- nombres, documentos, domicilios, teléfonos o legajos individuales;
- “¿a quién debo despedir/sancionar?”;
- “¿quién cobró efectivamente?”;
- predicciones, causas o recomendaciones futuras no validadas;
- cifras de obras, compras, vecinos u otros dominios sin fuente gobernada;
- instrucciones para ignorar la fuente, revelar secretos o cambiar las reglas.

La respuesta del Bot es una ayuda de lectura. El funcionario conserva la
responsabilidad de validar la decisión por los canales institucionales.

## 10. Interpretación de KPIs

| KPI o término | Qué significa | Qué no significa |
|---|---|---|
| Snapshot / corte | Fecha máxima gobernada del backup | Estado actual en tiempo real |
| Período de referencia | Período válido usado por una métrica | Fecha de pago o cierre contable |
| Registros de legajo | Filas que cumplen el contrato de legajo | Planta activa certificada |
| Participantes de liquidación | Personas distintas presentes en el control del período | Total de empleados activos |
| Evento de ausencia | Registro temporal válido de ausencia | Persona ausente, día perdido o tasa |
| Evento de movimiento | Registro válido de movimiento de legajo | Alta, baja o rotación sin clasificar |
| Inventario GRH | Metadatos de 257 tablas, 147 con filas, 110 vacías y 6.573.057 filas | Tablas aptas, vigentes o publicables sin contrato |
| Calidad 88,99/100 | Cumplimiento ponderado del extracto agregado gobernado: temporal 30 %, referencial 30 %, conciliación 30 % y unicidad 10 % | Calidad de cada tabla cruda, certificación legal, contable o de tiempo real |
| Cuarentena | Filas excluidas del universo válido por reglas de calidad | Filas corregidas o borradas |
| Integridad de joins | Filas de hechos emparejadas frente a huérfanas | Cobertura de empleados o planta activa |
| Cobertura de legajos | Claves válidas y distintas con match contra el maestro | Integridad de todas las filas o dotación activa |
| Registro de riesgos | Límites y anomalías que requieren seguimiento | Diagnóstico causal, sanción o prueba de fraude |
| Bruto, retenciones y neto de control | Composición calculada desde conceptos definidos | Pago bancario o asiento contable |
| Acuerdo de valores | Coincidencia agregada entre campos comparables | Cobertura total de corridas |
| Conciliación por período | Controles `calculo`/`totpago` calculados para un mes exacto en `grh-close-v1` | Tasa global, evidencia de pago o explicación causal |
| Cobertura de corridas | Proporción con contraparte disponible | Igualdad exacta de importes |
| Score de conciliación | Resumen compuesto de controles cross-source | Prueba de que todo concilia |
| Sector / centro de costo / categoría de acuerdo | Clasificación agregada de participantes según referencias de origen GRH | Presupuesto ejecutado, convenio vigente o estructura oficial completa |
| Tendencia | Comparación histórica dentro del snapshot | Pronóstico |
| Unidad de origen / `u.m.` | Magnitud conservada desde la fuente | Moneda identificada |

### 10.1 Regla especial para Reportes GRH

El servidor debe construir Reportes desde una proyección portable con k=10,
después de validar el bundle privado y su SHA. Nunca debe entregar `profile` o
`semantic` al navegador, consultar `data_points` como reemplazo ni sustituir un
período ausente. La adaptación del contrato de Reportes y su consumidor está
cerrada localmente; continúa sin certificación remota y nunca debe describirse
como documento oficial o pago acreditado.

## 11. Centro de Reportes

1. Abra [Centro de Reportes](../reportes.html).
2. Lea fuente, corte, linaje SHA abreviado, política k=10 y advertencia de
   snapshot antes de los
   gráficos. Ese SHA corresponde al pin aprobado; no es una conexión en tiempo
   real.
3. Seleccione únicamente uno de los períodos `YYYY-MM` ofrecidos por la interfaz.
   La API sólo sirve períodos existentes; uno ausente responde 404 y no se
   reemplaza por el último disponible.
4. Recorra las visualizaciones sólo si la interfaz confirma el contrato portable
   vigente y no muestra una advertencia de migración:
   - evolución de participantes distintos en cálculos válidos, hasta 12 períodos;
   - distribución sectorial, sólo cuando existe para el período de referencia;
   - componentes del control de cálculo;
   - calidad y pesos del extracto agregado.
5. Verifique que la vista declare agregados sin PII y que `personas_junin`
   permanezca excluida.
6. Lea los importes como centavos de unidad monetaria no declarada. El control de
   cálculo no acredita transferencia o pago bancario y `totpago` es sólo
   diagnóstico.
7. Si falta uno de los artefactos activos, divergen metadata/identidad/focos, la
   proyección portable no valida o el pin `GRH_SOURCE_SHA256` no está configurado
   y validado, la API responde 503.
   La pantalla no crea SVG ni conserva cifras anteriores. Use **Reintentar** una
   vez y registre el incidente si persiste; no intente fijar el pin desde la UI.
8. Valide las cifras con el área propietaria antes de una decisión vinculante.

La descarga cruda de datasets está retirada. El informe imprimible GRH es la única
salida actual gobernada por su contrato y tampoco constituye un documento oficial
sin aprobación institucional. Un control deshabilitado no debe sortearse con
herramientas del navegador.

## 12. Hub de Datos e importaciones

Sólo personas expresamente autorizadas deben usar el
[Hub de Datos](../importar.html). La operación vigente requiere rol
`SUPER_ADMIN` o `TENANT_ADMIN` y el tenant correcto.

### 12.1 Carga de archivo

1. Seleccione el módulo correcto y elija explícitamente el período `YYYY-MM` que
   representa la fuente. La plataforma no lo infiere del archivo ni usa por
   defecto la fecha de carga.
2. Elija un archivo permitido: CSV, XLSX, XLS, PDF o JSON.
3. No cargue dumps completos, secretos ni PII que no estén autorizados para este
   flujo.
4. Espere el resultado del servidor. La animación de progreso no constituye
   persistencia.
5. Considere éxito sólo cuando la respuesta confirme simultáneamente:
   - parseo realizado;
   - persistencia realizada;
   - identificador de dataset;
   - cantidad insertada mayor que cero.
6. Compare filas de origen, insertadas, rechazadas y truncadas.
7. Registre dataset, módulo, período, archivo y resultado en la bitácora operativa.

Límites actuales del flujo de archivos:

- tamaño total por archivo: hasta 50 MB;
- filas de origen: hasta 5.000;
- columnas: hasta 200;
- por diseño, el flujo conserva para persistencia una muestra acotada de hasta
  500 registros por archivo y debe marcar truncamiento cuando corresponda.

No fragmente un archivo para eludir límites. Si el volumen legítimo los supera,
solicite una revisión del proceso de ingesta.

### 12.2 Google Sheets

1. Utilice sólo una hoja destinada a intercambio autorizado.
2. La hoja debe ser accesible por enlace para que Google entregue el CSV.
3. **Nunca publique GRH crudo ni PII en Google Sheets para usar este conector.**
4. Pegue el enlace y espere el estado final.
5. Verifique que los conteos del contrato de respuesta sean coherentes.
6. Si hay truncamiento, sólo las filas declaradas como persistidas forman parte
   del dataset.

Límites actuales:

- respuesta remota: hasta 5 MB;
- hasta 200 columnas;
- hasta 10.000 filas interpretadas;
- hasta 5.000 filas persistidas; por encima de ese umbral la respuesta debe
  declarar truncamiento.

El parser admite comas, saltos de línea y comillas escapadas dentro de celdas.
Los valores se preservan como texto; por ejemplo, ceros iniciales no deben
convertirse automáticamente en números.

### 12.3 Prueba de PostgreSQL

- Use una cuenta de sólo lectura y alcance mínimo.
- Exija TLS y un host autorizado.
- La credencial sirve únicamente para la prueba autenticada y no debe quedar
  guardada en notas, capturas o documentación.
- Un mensaje de conexión exitosa no significa que exista sincronización, ingesta
  programada o backup.

### 12.4 Estados de importación

| Estado | Interpretación | Acción |
|---|---|---|
| Confirmada | Todo lo declarado como insertado fue persistido | Registrar dataset y validar muestra |
| Parcial | Parte se persistió y parte fue rechazada | Usar sólo el subconjunto confirmado y revisar causas |
| Truncada | Se alcanzó un límite seguro | No asumir que el dataset representa toda la fuente |
| Rechazada | No existe confirmación coherente de persistencia | Corregir origen; no presentar la carga como realizada |
| Error de base | El servidor no confirmó persistencia | No reintentar a ciegas; registrar incidente |

### 12.5 Evolución de ingesta, bases y mapas

| Canal | Estado actual | Evolución responsable |
|---|---|---|
| CSV | Condicionado y validado por estructura/límites | Contratos versionados por dominio e ingesta programada |
| XLSX / XLS | Condicionado, con controles de libro, hojas y tamaño | Plantillas institucionales y validación semántica específica |
| PDF | Condicionado a texto extraíble y persistencia confirmada | Clasificación documental gobernada, revisión humana y linaje |
| JSON | Condicionado a estructura y límites | Esquemas por versión y productor autorizado |
| TXT | No admitido por el flujo actual | Roadmap: formato, codificación, delimitadores y contrato definidos antes de habilitar |
| Google Sheets | Condicionado; exige una hoja accesible por enlace | Sólo fuentes no sensibles o intercambio institucional más seguro |
| PostgreSQL / DB | Existe prueba autenticada de conexión; no sincronización | Cuenta read-only, TLS, extracción programada y staging aislado |
| Replay O2A del snapshot GRH | Probado real localmente con promoción y duplicado idempotente | Conservar como evidencia de ingeniería; no anunciarlo como sincronización |
| CDC | No operativo | Captura incremental idempotente si la fuente y el proveedor lo permiten |
| Backups propios | No operativo | Cifrado, inmutabilidad, restore probado y responsables definidos |
| [Mapa Municipal](../mapa.html) y mapas de calor | La superficie existe sin una fuente geoespacial gobernada; el [diagnóstico GRH](GRH_GEOSPATIAL_READINESS.md) confirma coordenadas no utilizables | Contrato geográfico, precisión, privacidad y fecha de actualización visibles |

El objetivo futuro es admitir fuentes heterogéneas sin perder gobierno: cada
carga debe tener productor, tenant, corte, hash, esquema, calidad, cuarentena y
resultado de publicación. Agregar formatos no convierte por sí solo a una fuente
en confiable.

## 13. Matriz de decisiones

| Señal disponible | Decisión permitida | Decisión que requiere otra fuente |
|---|---|---|
| Calidad o cuarentena | Priorizar revisión y corrección de datos | Certificar integridad total |
| Linaje exacto entre `profile` y `semantic` | Confirmar que dos contratos describen el mismo snapshot | Certificar despliegue, frescura en vivo o completitud de toda la base |
| Diferencia `calculo` / `totpago` | Abrir conciliación y asignar revisión | Autorizar pago o asiento |
| Participación por sector | Revisar concentración y pedir contexto | Modificar planta o presupuesto |
| Eventos de ausencia | Revisar cobertura y definición | Sancionar, predecir o calcular tasa individual |
| Movimientos válidos | Auditar períodos y tipos disponibles | Declarar rotación o baja sin clasificación |
| Tendencia histórica | Investigar variación observada | Proyectar automáticamente |
| Reporte ejecutivo GRH | Comparar períodos existentes y revisar evidencia agregada | Afirmar tiempo real, PII, moneda, pago o cobertura municipal completa |
| Respuesta del Asistente | Orientar preguntas y localizar evidencia | Delegar una decisión al Bot |

## 14. Checklists de operación

### 14.1 Checklist diario

- [ ] Confirmar identidad, rol y municipio de la sesión.
- [ ] Leer fuente, corte y período antes de los KPIs.
- [ ] Verificar que no haya estado 401, 403, 503 o contrato inválido.
- [ ] Revisar el brief de prioridades, la cuarentena y la separación global/mensual.
- [ ] Confirmar en Calidad y Linaje que ambos contratos compartan identidad exacta.
- [ ] Distinguir control de cálculo de pago efectivo.
- [ ] Registrar decisiones y validaciones complementarias pendientes.
- [ ] Cerrar sesión al finalizar.

Que la fecha de corte no cambie diariamente es esperable mientras el sistema sea
un snapshot. No debe modificarse la etiqueta para aparentar actualización.

### 14.2 Checklist semanal

- [ ] Revisar diferencias cross-source y su responsable de análisis.
- [ ] Revisar por separado integridad de joins, cobertura de legajos y conciliación.
- [ ] Revisar filas en cuarentena sin publicar PII.
- [ ] Verificar datasets importados, módulo, período y truncamientos.
- [ ] Revisar durante la sesión las respuestas limitadas del Asistente. No existe
      todavía un historial persistente de consultas y no debe afirmarse lo contrario.
- [ ] Confirmar que reportes y presentaciones conservan unidad de origen.
- [ ] Revisar incidentes abiertos y evidencia disponible.
- [ ] Confirmar que ninguna pantalla o planilla externa se presenta como tiempo real.

### 14.3 Checklist mensual

- [ ] Confirmar el último período válido disponible en el contrato.
- [ ] Comparar sólo períodos con igual definición y alcance.
- [ ] Conciliar señales de Hacienda con fuentes contables/bancarias autorizadas.
- [ ] Revisar cobertura, calidad, cuarentena y antigüedad del snapshot.
- [ ] Revisar el registro de riesgos, la cola de acciones y sus responsables.
- [ ] Archivar decisiones e informes por el procedimiento institucional vigente.
- [ ] Revisar cuentas y accesos con la autoridad responsable.
- [ ] Evaluar si corresponde publicar un nuevo snapshot mediante el proceso aprobado.
- [ ] Actualizar este manual si cambió una capacidad, permiso, fuente o límite.

### 14.4 Cómo leer una evidencia O2A

Este control es para responsables de aceptación e ingeniería; no requiere que un
funcionario ejecute el pipeline.

- [ ] Confirmar que la fuente coincide en corte, tamaño y SHA-256 con el snapshot
      canónico documentado.
- [ ] Confirmar una primera salida `promoted/PUBLISHED` y un replay exacto
      `duplicate/DUPLICATE`.
- [ ] Verificar una sola versión/activación, un receipt de duplicado y el
      last-known-good byte-estable.
- [ ] Verificar cero locks, residuos y workspaces activos al cierre.
- [ ] Confirmar 257 tablas, 6.573.057 filas, calidad 88,99/100, salida sin PII y
      `personas_junin` excluida.
- [ ] Registrar siempre “local”: la prueba no usó red, DB, cron, `api/_data` o
      deployment.

`PUBLISHED` significa “activado en el estado local declarado”. No significa que
los funcionarios ya reciban datos nuevos. El ledger local no está firmado; no
certifica autenticidad del host, resistencia a corte de energía, ACL, backup,
restore, RPO/RTO o periodicidad.

## 15. Incidentes y respuestas seguras

### 15.1 HTTP 401 — sesión no válida

Significa que la sesión falta, venció o ya no corresponde a un usuario vigente.

1. Cierre la pantalla sensible.
2. Inicie sesión nuevamente desde [Acceso](../login.html).
3. Si persiste, registre fecha, hora, página y acción; no copie el token.
4. No use una cuenta ajena.

### 15.2 HTTP 403 — acceso denegado

Significa que el rol o el municipio de la sesión no está habilitado para esa
fuente o acción.

1. No intente sortear la restricción desde el navegador.
2. Confirme que ingresó al municipio correcto.
3. Solicite revisión de acceso mediante el canal institucional definido.
4. Registre sólo el código, la ruta y el contexto; no incluya secretos.

### 15.3 HTTP 503 — servicio o fuente no disponible

Puede indicar autenticación sin configurar, base inaccesible, contrato GRH no
publicado o tenant de fuente no configurado.

1. No use valores antiguos, demo o copiados como reemplazo.
2. El sistema no reintenta automáticamente. Use **Reintentar** de forma manual.
3. Si persiste, registre el incidente y espere confirmación del equipo responsable.
4. No declare continuidad, actualización o recuperación hasta contar con prueba.

### 15.4 Contrato inválido o fuente inconsistente

Las vistas ejecutivas deben ocultar todas las métricas. El backend valida
`profile` + `grh-semantic-v2`, pero el navegador sólo debe recibir
`grh-executive-v2`, `grh-quality-v1` o `grh-decision-brief-v1`. Si el bundle, su identidad o la proyección
contradicen el contrato, la API segura responde 503 sin detalles. Use
**Reintentar** una vez; si persiste, conserve el mensaje, la ruta, el corte
esperado y la hora. No corrija el JSON ni los conteos en el navegador.

### 15.5 Importación parcial, truncada o rechazada

- No vuelva a cargar repetidamente sin identificar la causa.
- Compare origen, insertadas, rechazadas y límite.
- Revise encabezados, formato, tamaño y período.
- No combine manualmente el resultado con otro dataset sin contrato.
- Conserve el identificador del dataset sólo si hubo persistencia confirmada.

### 15.6 Posible exposición de PII o secretos

1. Detenga la operación y no descargue ni reenvíe el contenido.
2. No incluya el dato sensible en capturas o tickets.
3. Registre ubicación y tipo de exposición de forma minimizada.
4. Use el canal asentado en el registro de release. Si no existe, escale por la
   cadena institucional y mantenga la producción bloqueada.

### 15.7 Datos mínimos del registro de incidente

- fecha y hora;
- usuario y rol, sin credenciales;
- municipio/tenant mostrado;
- página o acción;
- código HTTP o estado visible;
- fuente, corte y período, si estaban disponibles;
- dataset involucrado, si hubo persistencia;
- impacto observado, sin inferir causa;
- responsable y autoridad asignados en el registro del incidente;
- resolución y evidencia de validación.

Este manual no establece SLA ni tiempos de recuperación.

## 16. Privacidad y manejo de información

- La ausencia de nombres o DNI no vuelve anónima una categoría. Un sector, centro
  de costo, período o zona con muy pocas personas puede permitir
  reidentificación contextual.
- La plataforma agrupa las celdas pequeñas, conserva la conciliación del total y
  no presenta una celda protegida como cero. Las salidas portables y las métricas
  sensibles usan un umbral más estricto que una vista interactiva autenticada.
- El mínimo es **k=5** para rankings laborales interactivos y **k=10** para
  compensación, ausencias, licencias, movimientos, geografía y cualquier salida
  portable.
- La protección se aplica antes de elegir el top-N. Si ocultar una sola celda
  permitiría reconstruirla por resta, se aplica supresión complementaria y se
  agrupa sin etiquetas ni códigos originales.
- Si falta la cantidad de personas distintas detrás de un conteo, la métrica se
  trata como protegida hasta contar con evidencia; no se sustituye por cero, por
  otro período ni por un valor demo.
- No suba backups GRH crudos a repositorios, planillas públicas, correo o chats.
- No pegue PII en el Asistente.
- No publique nombres, DNI, domicilios, teléfonos, salarios o información médica.
- No mezcle `personas_junin` con GRH.
- No comparta credenciales, tokens, cadenas de conexión ni secretos de webhooks.
- Antes de compartir una captura, verifique que sólo contenga agregados permitidos.
- Use únicamente canales institucionales y reglas de retención aprobadas. Este
  manual no inventa una política de retención que todavía no haya sido definida.
- Un rol administrativo no autoriza por sí mismo a extraer o divulgar PII.

## 17. Presentación responsable a otros municipios

### 17.1 Objetivo de la presentación

Mostrar una capacidad verificable de gobierno de datos y análisis ejecutivo, no
vender como terminadas funciones que siguen condicionadas o en roadmap.

### 17.2 Preparación

- Use un entorno autorizado y una cuenta institucional preparada para la reunión.
- Verifique previamente sesión, fuente, corte y estados de error.
- No use credenciales demo ni comparta la pantalla de configuración o secretos.
- No cargue PII para “hacer más real” la demostración.
- Tenga disponibles este manual, el contrato semántico y el estado verificado.
- Si el entorno remoto no pasó smoke, presente la evidencia como validación local.

### 17.2.1 Cuenta de demostración segura

- **Estado actual:** todavía no existe un entorno certificado con una cuenta por
  rol. Las altas administrativas con contraseña conocida responden
  `410 ACCOUNT_LIFECYCLE_NOT_GOVERNED`.
- Las mutaciones administrativas del estado de un municipio responden
  `410 TENANT_LIFECYCLE_NOT_GOVERNED` hasta implementar su workflow aprobado.
- `db:seed` está retirado: termina con código `1` y
  `ACCOUNT_LIFECYCLE_NOT_GOVERNED`, sin aceptar secretos, conectar a la DB ni
  crear identidades. No existe una excepción de bootstrap.
- No publique credenciales en este manual, README, diapositivas, chats, commits,
  grabaciones ni códigos QR.
- No reutilice la contraseña de una persona real ni una clave de producción.
- No se entregarán cuentas por rol hasta disponer de invitación de un solo uso,
  expiración, sesiones revocables, MFA, doble aprobación y auditoría probadas.
- La [máquina de estados de lifecycle](ACCOUNT_LIFECYCLE_STATE_MACHINE.md) es una
  fundación técnica pura, aún no conectada; no constituye una cuenta utilizable.
- Use únicamente agregados autorizados sin PII. Una demo segura no necesita
  inventar personas, pagos o indicadores.

### 17.3 Recorrido sugerido

1. Explique la fuente canónica GRH y la exclusión de `personas_junin`.
2. Muestre el Inicio correspondiente al rol y explique que no consulta GRH.
3. Si la capability está autorizada, muestre corte, calidad y límites en el
   Panel Ejecutivo GRH.
4. Abra [Calidad y Linaje GRH](../control.html) y demuestre inventario, linaje dual,
   score acotado, cuarentena, cobertura, conciliación y riesgos sin PII.
5. Abra [Centro de Reportes GRH](../reportes.html), seleccione un período ofrecido
   y explique los cuatro SVG, la unidad no declarada y la falla cerrada.
6. Abra GRH, RRHH o Hacienda y explique una señal sin sobredimensionarla.
7. Consulte al Asistente con una pregunta agregada y muestre su procedencia.
8. Muestre cómo la plataforma falla cerrada cuando falta una fuente.
9. Separe explícitamente capacidades operativas, condicionadas y de roadmap.
10. Cierre con los requisitos para incorporar otro municipio: contrato de fuente,
   tenant, roles, migración/configuración, privacidad, pruebas y smoke remoto.

Para una expansión nacional o internacional, cada institución debe conservar su
propio tenant, contrato, jurisdicción, unidades, calendario, reglas y evidencia.
Nunca se deben clonar cifras, permisos o interpretaciones de Junín como si fueran
universales.

### 17.4 Afirmaciones permitidas y prohibidas

| Se puede afirmar | No se debe afirmar |
|---|---|
| El núcleo GRH está implementado y validado localmente | Está certificado en producción sin smoke remoto |
| La frontera raw está cerrada localmente: cinco UIs sobre proyecciones y `/api/grh-data` en 410 | Está desplegada o certificada en producción |
| Calidad debe recibir `grh-quality-v1`, sin categorías, códigos ni importes | Certifica cada tabla cruda o publica información individual |
| Reportes debe aplicar una proyección portable k=10 | El flujo completo de Reportes ya está certificado, está en vivo o acredita pagos |
| La capa fuente usa `grh-semantic-v2` con cardinalidad anual sin exportar claves | Un contrato agregado permite publicar cualquier dato de empleados |
| El Asistente actual es determinista y trazable | Es IA generativa autónoma o aprende sola |
| Oculta métricas cuando la fuente no se valida | Siempre está disponible |
| Conserva snapshot, hash, calidad y límites | Opera en tiempo real |
| Controla conceptos y conciliación agregada | Liquida sueldos o prueba pagos bancarios |
| La arquitectura contempla aislamiento por tenant | Cualquier municipio ya está incorporado y operativo |
| O2A promovió el snapshot y detectó su replay duplicado en local | `PUBLISHED` significa DB, API o producción |
| O2B define el camino a ingesta conectada | Ya realiza CDC, backups y actualización diaria |

### 17.5 Respuestas honestas a preguntas frecuentes

**¿Reemplaza hoy al sistema GRH?**  
No. Hoy transforma un snapshot autorizado en contratos y vistas ejecutivas. La
operación continua y el reemplazo requieren integración, gobierno y pruebas.

**¿Los datos están en tiempo real?**  
No. La fecha de corte visible define hasta dónde llegan.

**¿Qué significa `PUBLISHED` en la prueba O2A?**  
Que el bundle validado quedó activo como last-known-good sólo en el estado local
de ingeniería. No significa publicación en DB, API o producción.

**¿Puede confirmar quién cobró?**  
No. El control de cálculo no es evidencia bancaria.

**¿Puede mostrar fichas individuales?**  
Sí, únicamente en el directorio privado `grh-directory-v3` para identidades
autorizadas, tenant correcto y finalidad gobernada. La respuesta minimiza campos,
limita cada historial a 24 registros y no publica causas de ausencias/licencias,
contacto, domicilio, cuenta bancaria ni importes salariales. Las fechas laborales
son valores informados por la fuente y la señal de cálculo no certifica pago.

**¿Puede implementarse en otro municipio?**  
La arquitectura puede adaptarse, pero cada municipio necesita una fuente
autorizada, un contrato semántico, aislamiento tenant-bound, configuración,
pruebas y validación operativa propia.

**¿Qué significa que una cifra esté en `u.m.`?**  
Que se preserva la magnitud de la fuente sin inferir moneda.

## 18. Plantilla mínima de registro de decisión

```text
Fecha y hora:
Funcionario / rol:
Página o capacidad:
Pregunta de decisión:
Fuente:
Corte y período:
KPI o evidencia consultada:
Límite declarado por la plataforma:
Validación complementaria requerida:
Decisión adoptada:
Responsable de seguimiento:
Resultado / fecha de revisión:
```

## 19. Glosario

**Agregado:** dato resumido que no identifica a una persona.  
**Artefacto GRH:** contrato privado `profile` o `grh-semantic-v2` derivado del
backup; el objetivo es que permanezca sólo en backend.  
**CDC:** captura de cambios de una fuente; está en roadmap.  
**Conciliación cross-source:** comparación gobernada entre campos de fuentes
relacionadas, como `calculo` y `totpago`.  
**Contrato semántico:** estructura versionada con definiciones, procedencia,
controles y límites de interpretación.  
**Control de cálculo:** importes y conceptos calculados para revisión; no equivale
a pago bancario.  
**Corte:** fecha máxima admitida por el snapshot.  
**Cuarentena:** filas excluidas del universo válido por fallar reglas de calidad.  
**Dataset:** conjunto persistido por módulo y período después de una importación.  
**Determinista:** misma pregunta y mismo contrato producen una respuesta dentro
de reglas predefinidas.  
**Falla cerrada:** ante error o fuente ausente, la plataforma oculta datos en vez
de inventarlos.  
**Integridad de joins:** proporción de filas de hechos que emparejan con una clave
de referencia; no mide personas cubiertas.  
**Intent:** tipo de pregunta permitida por el Asistente.  
**Linaje:** identidad trazable de la fuente y sus transformaciones; en Calidad y
Linaje debe coincidir entre `profile` y `semantic`.  
**Participante:** persona distinta presente en el control del período; no implica
planta activa.  
**PII:** información que identifica o permite identificar a una persona.  
**Proyección ejecutiva:** `grh-executive-v2`, salida exacta y minimizada para
vistas interactivas o portables.  
**Proyección de calidad:** `grh-quality-v1`, metadatos, calidad y conciliación
sin categorías, códigos ni importes.  
**Cierre mensual explicado:** `grh-close-v1`, salida agregada k≥10 con
componentes, controles y conciliación del período; no es pago ni contabilidad.  
**Brief ejecutivo decisional:** `grh-decision-brief-v1`, situación, cambio y
prioridades agregadas; no exporta PII, importes, códigos de fuente/celda o labels y no mezcla la
señal global con la evidencia mensual.

**Supresión complementaria:** protección adicional que impide reconstruir una
celda pequeña restando los valores visibles del total.  
**Cobertura de legajos:** proporción de claves de legajo válidas y distintas que
emparejan con el maestro; no equivale a planta activa.  
**Registro de riesgos:** lista explícita de límites, anomalías y acciones de
seguimiento que condicionan la interpretación.  
**RPO/RTO:** objetivos de pérdida tolerable de datos y tiempo de recuperación;
todavía deben definirse operativamente.  
**Smoke remoto:** prueba mínima en el entorno desplegado que confirma el flujo
real con su configuración.  
**Snapshot:** copia histórica con fecha de corte, no conexión en vivo.  
**Tenant:** municipio aislado dentro de la plataforma.  
**Truncamiento:** persistencia de un subconjunto por alcanzar un límite seguro.  
**Unidad de origen / `u.m.`:** magnitud de la fuente cuya moneda no fue declarada.

## 20. Regla de actualización de este manual

Toda feature nueva o cambio material debe actualizar este archivo en la misma
entrega. No se permite cambiar una capacidad de “Condicionado” o “Roadmap” a
“Operativo” sólo por modificar una pantalla.

La actualización debe incluir, como mínimo:

1. versión y fecha del manual;
2. owner funcional y técnico, cuando hayan sido designados;
3. estado Operativo, Condicionado o Roadmap;
4. fuente, corte, unidad y límites de interpretación;
5. roles y autorización server-side;
6. recorrido de usuario y estados de error;
7. impacto de privacidad y tratamiento de PII;
8. pruebas locales ejecutadas;
9. migración, variables y smoke remoto si se declara producción;
10. entrada en el historial de cambios.

Una feature sólo puede declararse operativa en producción cuando exista código
integrado, fuente y contrato documentados, autorización server-side, estados de
error, pruebas proporcionales al riesgo, configuración operativa y smoke remoto
exitoso. Si falta evidencia, el estado correcto sigue siendo **Condicionado**.

## 21. Historial de cambios

| Versión | Fecha | Cambio | Responsable |
|---|---|---|---|
| 1.10.0 | 2026-08-09 | Release público: producto `d11fd39`, commit/tag `4108ca0`, deployment Production `dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` `READY`, gate 11/11, browser 10/10 y GitHub Release live; focal 135/135, QA 104/104, raíz 590 aprobadas + 1 opt-in omitido y backend 20/20; sesión positiva y datos GRH privados siguen en validación local | Mantenedor del cambio; registro post-release sin mover el tag |
| 1.9.0 | 2026-08-09 | Release público: commit/tag `f9d1f88`, product commit `ed76347`, deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` `Ready` en `Production`, gate 10/10 exit `0`, browser público 390/1440 px y GitHub Release live; MuniGuía privada sólo local; raíz 532 aprobadas + 1 smoke opt-in omitido y backend 20/20 | Mantenedor del cambio; registro post-release sin mover el tag |
| 1.8.1 | 2026-08-09 | Publica `/roles` como recorrido visual; artefacto `b82c0b3` en `master`/tag, deployment `Ready`, gate 10/10 exit `0`, browser 390/1440 px limpio y GitHub Release live; sin acreditar DB, cuentas, autorización positiva o datos remotos | Mantenedor del cambio; registro post-release sin mover el tag |
| 1.8.0 | 2026-08-09 | Registra WP0-L, IAM-MAP-01 y UX-E2A; integrado en `master`, superficie pública productiva 9/9 exit `0`, sin acreditar DB, cuentas reales, autorización positiva ni datos remotos | Mantenedor del cambio; aprobación institucional registrada por separado |
| 1.7.0 | 2026-08-09 | Agrega Inicio seguro para los siete roles vigentes, capabilities y perfil calculados en servidor, default `inicio.html`, `SUPER_ADMIN` sin tenant sin GRH y Panel ejecutivo separado; corrige Reportes como operativo local, sin cuentas, DB ni deployment | Mantenedor del cambio; aprobación institucional pendiente del release |
| 1.6.0 | 2026-08-09 | Agrega `grh-close-v1` en Hacienda y el Bot “Cierre explicado”, aclara conciliación por período y comparación consecutiva k≥10, registra O2A.1 y el acceso institucional local, y mantiene el público como legacy/no certificado | Mantenedor del cambio; aprobación institucional pendiente del release |
| 1.5.0 | 2026-08-09 | Explica el replay real local O2A, cómo interpretar promoción/duplicado y qué evidencia sigue pendiente para O2B conectado/programado | Mantenedor del cambio; aprobación institucional pendiente del release |
| 1.4.1 | 2026-08-08 | Declara el cierre raw local: cinco UIs sin referencias fuente, consumidores server-side sobre bundle privado y `/api/grh-data` autenticado/tenant-bound retirado con 410 sin lectura; los E2E locales están aprobados y producción sigue pendiente | Mantenedor del cambio; aprobación institucional pendiente del release |
| 1.4.0 | 2026-08-08 | Documenta `grh-semantic-v2`, cardinalidad anual sin claves, proyecciones seguras `grh-executive-v2`/`grh-quality-v1`, umbrales k=5/k=10 y el gate abierto de migración UI/retiro de `/api/grh-data` | Mantenedor del cambio; aprobación institucional pendiente del release |
| 1.3.0 | 2026-08-08 | Agrega gate de baseline/drift y retira seed, alta con contraseña administrativa y mutación de tenant; ningún flujo crea cuentas hasta implementar lifecycle gobernado | Mantenedor del cambio; aprobación institucional pendiente del release |
| 1.2.0 | 2026-08-08 | Actualiza Reportes al bundle activo `profile` + `semantic`, SHA aprobado y períodos gobernados; distingue inventario total de 22 conteos focales y documenta falla cerrada | Mantenedor del cambio; designación institucional pendiente del release |
| 1.1.0 | 2026-08-08 | Incorpora recorrido, KPIs, incidentes y presentación del Centro de Calidad y Linaje GRH; distingue el techo exacto de rutas de la persistencia RBAC/ABAC pendiente | Mantenedor del cambio; designación institucional pendiente del release |
| 1.0.0 | 2026-08-08 | Primera versión basada en capacidades reales del checkout local | Mantenedor del cambio; designación institucional pendiente del release |
