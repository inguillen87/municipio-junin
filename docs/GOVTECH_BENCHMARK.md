# Benchmark GovTech para MuniControl

- Versión: 1.10.0
- Fecha de consulta externa: 8 de agosto de 2026
- Estado de producto revisado: 14 de agosto de 2026; S24 verificado en Production
- Audiencia: Intendencia, dirección de producto, ingeniería, seguridad y gobierno de datos
- Alcance: plataformas municipales y de sector público con evidencia oficial disponible públicamente

La última GitHub Release versionada es `v1.10.0`; el producto S13 está en
`d11fd39`. La evidencia funcional S24 quedó verificada en el commit
`5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment
`dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, release truth 30/30. El release público
histórico `v1.10.0` permanece verificado.
La sesión privada positiva y S13 privado conservan validación local sobre el snapshot aprobado.
`GET /api/grh-decision-brief` publica `grh-decision-brief-v1`: un brief ejecutivo
único desde agregados del snapshot aprobado, con validación local. Separa la señal
global cross-source de la evidencia mensual, expone `temporalQuarantineRows`,
aplica k=10 y excluye PII, importes, códigos de fuente/celda y
etiquetas/labels. Las CTA se habilitan sólo por capability; un 503 admite sólo
reintento manual y una celda actual `<10` hace fallar cerrado el Panel integral.
MuniGuía usa el nuevo anchor real `#decisionBrief`.

Para el release histórico `v1.10.0`, route policy `2026-08-09.2` y access
policy `2026-08-09.1` cubrían 26 recursos, 12 acciones, 46 permisos y 79 firmas de ruta
exactas —37 Serverless + 42 Express—. El commit/tag de ese release apunta a
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

La evidencia local es 135/135 en el focal raíz S13 y 104/104 en QA adversarial
con 0 P1/P2; la suite raíz final revalidó 591 pruebas: 590 aprobadas, 0 fallidas
y 1 smoke opt-in omitido; backend cerró 20/20. Este cierre no certifica
DB/baseline, cuentas, MFA/lifecycle ni datos GRH remotos. Este commit documental
post-release no mueve el tag `v1.10.0` de `4108ca0`.

Como antecedente, el release público `v1.9.0` quedó fijado en el commit/tag `f9d1f88`; el product
commit es `ed76347`. El deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` figura
`Ready` en `Production` con alias `https://municipio-junin.vercel.app`; el gate
cerró 10/10 exit `0` con `checkedAt 2026-08-09T14:42:10Z`. El browser público
verificó `/login` y `/roles` —siete perfiles— a 390/1440 px sin overflow,
errores de consola ni requests externos; `/dashboard`, `/inicio` y `/manuales`
anónimos redirigieron al login. La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.

MuniGuía privada `muniguia-contextual-v1` sigue sólo local con proyección autoritativa simulada: focal
10/10, suite raíz 533 totales —532 aprobadas y 1 smoke opt-in omitido— y backend
20/20. Selectors y anchors siguen verificados por CI; si el target no está
visible, se omite sólo «Ubicar». La evidencia remota no certifica autorización positiva, cuentas reales,
DB o baseline restaurado, MFA/lifecycle persistido ni GRH remoto. Ese cierre
documental post-release no movió el tag `v1.9.0` de `f9d1f88`.

## Executive Summary

- **MuniControl no debe competir como otro ERP genérico.** OpenGov, Tyler, SAP,
  PGM y Civitas ya cubren, con distintos niveles de profundidad y evidencia,
  amplios catálogos transaccionales. La oportunidad defendible es convertirse en
  el sistema municipal de decisión y coordinación: contratos de datos verificables,
  métricas con linaje, alertas explicables, acciones con responsable y seguimiento
  del resultado.
- **Los referentes conectan datos, proceso y experiencia.** OpenGov y Tyler enlazan
  finanzas, compras, activos y reporting; Granicus prioriza servicios y comunicación
  ciudadana; Mendoza combina una puerta digital única con interoperabilidad segura;
  SAP muestra la disciplina de presupuesto, fondos, compras e integración; ArcGIS
  demuestra que un mapa en tiempo real requiere feeds, operación y controles, no
  sólo una capa cartográfica.
- **El punto de partida real sigue siendo acotado y valioso.** Hoy la única fuente
  canónica es el backup GRH Junín con corte del 6 de agosto de 2026.
  `personas_junin` está excluida. Los centros ejecutivos, el contrato semántico y
  el asistente están validados localmente sobre ese snapshot; no existe todavía
  conexión continua, mapa operativo, backup propio certificado ni ERP financiero
  integrado. Presentarlos como activos dañaría la confianza que la plataforma debe
  construir.
- **La secuencia correcta es calidad antes que amplitud.** Primero se debe publicar
  el núcleo GRH de forma privada y probar roles/tenant; después identidad y permisos
  finos, ingesta gobernada y cerebro analítico; luego Hacienda, Contaduría,
  Tesorería y Compras sobre fuentes autoritativas; finalmente GIS operativo,
  actualización continua, recuperación probada y producto multi-municipio.

La aspiración de nivel mundial es correcta, pero el estándar no es “tener más
pantallas”. Es poder demostrar, para cada dato y cada acción, **quién puede verlo,
de dónde salió, cuándo se actualizó, qué significa, qué decisión habilita y cómo se
recupera el sistema si falla**.

## 1. Cómo se realizó la comparación

### 1.1 Pregunta de decisión

El benchmark responde qué patrones debe adoptar MuniControl para competir con
plataformas GovTech maduras sin copiar su apariencia, asumir capacidades no
probadas ni abandonar la adecuación al gobierno municipal argentino.

### 1.2 Clases de evidencia

| Clase | Qué prueba | Qué no prueba |
|---|---|---|
| Documentación técnica oficial | Existe un contrato, API, control o comportamiento documentado | Que la implementación de cada cliente sea correcta o exitosa |
| Fuente gubernamental o norma | Existe una política, despliegue o marco institucional declarado por el organismo responsable | Calidad técnica completa, adopción activa o satisfacción de todos los usuarios |
| Página oficial de producto | El proveedor ofrece o declara una capacidad | Rendimiento, usabilidad, seguridad efectiva o resultado independiente |
| Inferencia del benchmark | Una decisión razonable derivada de comparar fuentes | Una capacidad del proveedor o un hecho medido |

Se priorizaron fuentes primarias y oficiales. Las cifras publicadas por proveedores
se tratan como **declaraciones del proveedor**, no como auditorías independientes.
No se realizaron demos autenticadas, pruebas de carga, revisiones contractuales ni
evaluaciones hands-on de accesibilidad; por eso este documento no clasifica qué
interfaz es “la más linda” ni asigna puntajes artificiales de UX.

### 1.3 Línea base interna verificable

La comparación usa como fuente de verdad interna el
[estado verificado del Plan Maestro](MASTER_PLAN_STATUS.md), el
[roadmap de producto enterprise](ENTERPRISE_PRODUCT_ROADMAP.md), la
[hoja operativa de GRH](GRH_OPERATIONS_ROADMAP.md) y el
[contrato semántico](data/grh-semantic.md).

| Capacidad MuniControl | Estado al corte | Límite que debe permanecer visible |
|---|---|---|
| Fuente de personal | Snapshot GRH del 6 de agosto de 2026 | No es tiempo real; `personas_junin` no se cruza ni migra |
| Perfil y semántica GRH | Validados localmente | Agregados; no habilitan PII individual ni prueban pago bancario |
| Centro Ejecutivo, RRHH, Hacienda, Reportes y Bot | Validados localmente; fronteras del preview protegido observadas en 401 sin sesión | Falta materialización privada, sesión real y smoke por tenant/rol |
| Cierre mensual `grh-close-v1` | Validado localmente por período y k≥10 | Control de cálculo y conciliación; no moneda, pago, causalidad ni contabilidad |
| Brief ejecutivo `grh-decision-brief-v1` | S13 en producto `d11fd39`: situación única, separación global/mensual, cuarentena temporal, prioridades y CTA por capability | La superficie pública está verificada en `v1.10.0`; sesión positiva y datos privados siguen en validación local, sin PII, importes, responsables, plazos o action ledger |
| Inicio seguro por rol | Siete variantes, capabilities server-computed y 42/42 focal local | Es UX fail-closed; no crea cuentas, asignaciones finas ni prueba producción |
| Ingreso gobernado S25/S26 | Frontera publicada read-only verificada en Production sobre `63d455b708ffddd44a5acc9480b42d8d0c61829d` / `dpl_ByHJfN26qtnsDT8dBNw9KRgMKnhS`: evaluación sin historial ni requests de ingreso, acceso resiliente y 390/320 px sin solapes; release truth 31/31 y cero 5xx/fatal. La bandeja privada de hasta 20 receipts y el POST 201 sólo fueron validados localmente y no mutaron Production; Upload/Sheets siguen retirados con 410 | Falta storage privado del original, antivirus, maker-checker, prueba positiva privada remota, auditoría tamper-evident y publicación separada |
| Bases externas | Roadmap | No conectar una DB sin identidad read-only, contrato, cuota, allowlist y cuarentena |
| Roles | Frontera gruesa en código; modelo fino definido | Tesorería, Compras, RRHH y demás perfiles aún no tienen políticas completas |
| Finanzas, compras, tesorería y contabilidad | Sin fuente autoritativa conectada | GRH no sustituye presupuesto, asiento, orden de pago ni conciliación bancaria |
| GIS y mapas operativos | Roadmap | Un mapa base no convierte un dato histórico en tiempo real |
| CDC, micro-lotes y backups propios | Diseñados, no activados | RPO/RTO sólo pueden publicarse después de restaurar y medir |
| Replay O2A/O2A.1 | Replay real local preservado; captura por descriptor, `fstat` y copias privadas `wx`/`0600` probadas con fixtures | No es operación conectada, backup, firma del host ni deployment |
| Producción remota | Commit/tag `v1.10.0` `4108ca0`, product commit `d11fd39`; deployment `dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` `READY` en `Production`, alias productivo y GitHub Release live | Gate 11/11, browser 10/10 y logs 0 errores/0 respuestas 500; no DB, cuentas, autorización positiva ni datos remotos |
| Verdad del release | `release:truth:check` productivo 10/10 exit `0`, `checkedAt 2026-08-09T14:42:10Z`; browser público 390/1440 px sobre `/login` y `/roles` sin overflow, consola ni requests externos; rutas privadas anónimas redirigen al login | Mantener commit/deployment/tag exactos; el registro post-release no mueve el tag |

El focal E0.1 de verdad de `/inicio` cerró 31/31 y el consolidado workspace +
release truth, 45/45 local. Fija una captura UTF-8/LF y SHA-256, y rechaza
rewrite antiguo, redirects y comment spoof. El cierre remoto actual de
`v1.9.0` aporta por separado deployment `Ready`, gate productivo 10/10 exit `0`
y browser 390/1440 px limpio; no demuestra DB, cuentas, autorización
positiva ni datos remotos.

## 2. Qué demuestran los referentes

### 2.1 Matriz ejecutiva

| Referente | Núcleo transaccional | Inteligencia y UX decisional | Ciudadanía y GIS | Integración, seguridad y operación | Lectura útil para MuniControl |
|---|---|---|---|---|---|
| **Civitas (Mendoza, Argentina)** | Declara administración financiera/contable, tributaria, expedientes, RRHH y sueldos | Declara dashboard, indicadores, mapa de gestión e IA | e-Ciudadano, incidencias y geolocalización | Declara nube, perfiles y seguridad; evidencia técnica pública limitada | Conoce vocabulario y necesidades locales, pero sus afirmaciones comerciales no reemplazan contratos, SLA ni pruebas |
| **PGM (Argentina)** | Oferta amplia: presupuesto, contabilidad, tesorería, sueldos, compras, patrimonio, tasas y expedientes | Tablero municipal, AIF y reportes integrados | eGov, pagos, GIS y múltiples integraciones argentinas | Interoperabilidad declarada; documentación pública de controles y API poco detallada | La profundidad normativa y operativa argentina es una barrera competitiva real |
| **Mendoza x Mí + EDI/X-Road** | No es un ERP; es puerta de servicios e interoperabilidad | Experiencia unificada y trazabilidad de trámites | Identidad, documentos, turnos, pagos, notificaciones y servicios digitales | X-Road: autenticación mutua, firma/cifrado, derechos de acceso y auditoría | Separar la experiencia ciudadana de los sistemas de registro y conectarlos con una capa institucional segura |
| **OpenGov** | Finanzas, presupuesto, compras, ingresos, activos, permisos y licencias | Reporting, transparencia, planificación y escenarios | Portales, permisos, licencias, activos y datos abiertos | APIs por suite, permisos por entidad, webhooks, SAML y programa SOC 2 | Integrar ciclo financiero, workflows y reporting; no tratar dashboard y transacción como productos aislados |
| **Tyler Technologies** | ERP, RRHH/payroll, ingresos, utilities, activos, permisos y servicios | Hub por rol, reporting interactivo, finanzas y performance insights | GIS integrado, trabajo de campo, solicitudes y Open Finance | Plataforma de datos, APIs, SSO, FedRAMP para productos en alcance y programa AppSec | Profundidad vertical, workspaces por rol y datos como producto compartido |
| **Granicus** | No es ERP financiero; cubre servicios, comunicaciones, reuniones y registros | Analítica de experiencia, journeys y asistente gubernamental | 311, formularios, web, email/SMS, encuestas, reuniones y records | Seguridad/continuidad por producto, APIs de comunicación y foco en accesibilidad | Diseñar el servicio desde la necesidad del ciudadano, no desde el organigrama |
| **SAP Public Sector** | Presupuesto, fondos, grants, contabilidad y procure-to-pay con productos complementarios | Analytics, planning, escenarios y copiloto | No es su principal diferenciador municipal | Integration Suite, gobierno de APIs, IAM y amplio catálogo de assurance | Disciplina de controles financieros, catálogo semántico e integración gobernada; evitar su complejidad innecesaria |
| **Esri ArcGIS/Velocity** | No es ERP | Dashboards, análisis espacial, geofencing y detección de eventos | GIS, campo, sensores, flota y capas en streaming | Roles, organización, feeds monitorizados y assurance específico de ArcGIS | “Tiempo real” exige fuente, timestamp, feed, health, permisos y operación; no sólo un heatmap |

La matriz describe **huellas funcionales**, no equivalencia entre productos. Un
módulo declarado en una web comercial no tiene el mismo peso que una API pública,
una norma, un control auditado o una operación gubernamental documentada.

### 2.2 Civitas: amplitud local con evidencia pública todavía comercial

La página oficial de [Gobierno Inteligente de Civitas](https://civitas.com.ar/gobierno-inteligente/)
enumera administración financiera y contable, tributaria, expediente digital,
incidencias, e-Ciudadano, un mapa de gestión con dashboard y agentes de IA. Su
sitio de [RRHH](https://civitas.com.ar/software-recursos-humanos/) y sus materiales
de autogestión describen liquidación, legajos, solicitudes, workflows y reportes.

El patrón relevante es la integración de **operación interna + canal ciudadano +
geolocalización + indicadores** con lenguaje cercano a municipios argentinos.
También valida que RRHH, sueldos y expedientes son expectativas básicas del mercado
local, no diferenciadores suficientes por sí solos.

Límite de evidencia: en la búsqueda pública dirigida no se localizaron un portal
de desarrolladores, especificaciones de API, SLA, matriz pública de roles, informe
de auditoría independiente o trust center comparable con los referentes globales.
Eso no prueba que no existan; indica que deben solicitarse en una evaluación formal
y que MuniControl puede diferenciarse haciendo pública su evidencia técnica sin
revelar secretos.

### 2.3 PGM: profundidad administrativa argentina e integración de punta a punta

La oferta oficial de [Web PGM](https://institucional.municipalidad.com/web-pgm.html)
incluye administración financiera, esquema AIF, partida doble, Tesorería, sueldos,
compras desde pedido hasta pago, expedientes, patrimonio, recaudación, GIS y
tablero de control. Su portal de ciudadanía declara integraciones con organismos,
bancos y medios de pago argentinos en
[Mi Muni, Mi Cuenta](https://institucional.municipalidad.com/mi-muni-mi-cuenta.html).
El proveedor declara más de 250 municipios/comunas y presencia en 11 provincias en
su [Comunidad PGM](https://institucional.municipalidad.com/comunidad-pgm.html); esa
cifra es una declaración comercial, no una medición independiente de adopción.

La lección central es que competir en Argentina requiere modelar correctamente el
ciclo **presupuesto → compromiso → compra → recepción → devengado → pago →
contabilidad**, además de normativa, organismos externos y formas locales de
recaudación. Un dashboard superior no compensa un circuito administrativo incorrecto.

Límite de evidencia: la web pública describe módulos e integraciones, pero no ofrece
el mismo detalle verificable sobre API, aislamiento multi-tenant, continuidad,
controles de acceso o auditorías externas que las fuentes técnicas de OpenGov,
Tyler, SAP o ArcGIS. Esos puntos deben convertirse en requisitos de licitación y
no en supuestos.

### 2.4 Mendoza x Mí: una puerta única sostenida por interoperabilidad

El Gobierno de Mendoza documenta en su
[Ecosistema Digital de Integrabilidad](https://informacionoficial.mendoza.gob.ar/edi/)
una experiencia ciudadana unificada para identidad, trámites, documentos, turnos,
notificaciones y firma. En junio de 2026 informó oficialmente
[450.000 usuarios registrados y más de 170 trámites digitales](https://prensa.mendoza.gob.ar/mendoza-x-mi-suma-mas-servicios-y-gestiones-digitales-en-una-sola-aplicacion/).
La [Ley 9.625](https://www.argentina.gob.ar/normativa/provincial/ley-9625-123456789-0abc-defg-526-9000mvorpyel/actualizacion)
da marco al sistema provincial y prioriza orientación al usuario, inclusión,
interoperabilidad, eficiencia y transparencia.

La documentación gubernamental de
[X-Road](https://informacionoficial.mendoza.gob.ar/edi/xroad/) describe intercambio
descentralizado, autenticación mutua, cifrado, firma, sello temporal, trazabilidad
y derechos de acceso controlados por el dueño del dato. Es el patrón más relevante
para el futuro conectado de MuniControl: no reemplazar cada sistema de registro de
una vez, sino ofrecer y consumir servicios a través de una frontera uniforme,
auditable y gobernada.

Mendoza x Mí no es evidencia de un ERP municipal interno completo. Es evidencia de
que una experiencia pública coherente puede apoyarse en sistemas heterogéneos si
identidad, interoperabilidad y gobernanza se diseñan como infraestructura.

### 2.5 OpenGov: del documento fuente al mayor y al dashboard

[OpenGov Financials](https://opengov.com/products/financials/) describe un ERP para
gobierno local que integra libro mayor, cuentas a pagar/cobrar, caja, conciliación
bancaria, activos, utility billing, compras, presupuesto, recaudación y reporting.
Su propuesta conecta módulos transaccionales con planificación, transparencia,
procurement, permisos y gestión de activos.

La evidencia técnica es más útil que el catálogo comercial. El
[Developer Portal](https://developer.opengov.com/catalog) publica APIs para
presupuesto, procurement, permisos, activos, proveedores y open data. Las
integraciones tienen identidad y permisos, las rutas modernas de compras se acotan
por entidad y los accesos fuera de alcance devuelven `403`. También documenta
[webhooks](https://developer.opengov.com/docs/webhooks/overview) para evitar polling
cuando existe un evento soportado.

Su [página de seguridad](https://opengov.com/security/) declara SOC 2 Type II,
AES-256 en reposo, TLS 1.2+, SAML 2.0, acceso productivo temporal y auditado,
pipelines automatizados, feature flags y despliegue/rollback por servicio. La
certificación y los controles deben validarse por producto y contrato, pero la
madurez documental fija un estándar para vender a gobiernos escépticos.

Lección para MuniControl: la inteligencia financiera debe nacer de la misma cadena
que registra y controla el proceso, o de una integración reconciliada con ella.
Una visualización de GRH no debe asumir el lugar de la contabilidad.

### 2.6 Tyler Technologies: profundidad vertical y plataforma de datos compartida

[Tyler Enterprise ERP](https://www.tylertech.com/products/enterprise-erp) integra
finanzas, presupuesto, procurement, RRHH, ingresos y utilities. Su Hub ofrece vistas
configurables por rol, reporting con filtros y drill-down, y un portal Open Finance.
El valor no es sólo el gráfico: el usuario puede pasar de una excepción a la tarea
o registro que la explica.

La
[Enterprise Data Platform](https://www.tylertech.com/products/data-insights/enterprise-data-platform)
declara ingestión desde múltiples sistemas, metadatos, workflows de aprobación,
roles, APIs SODA/OData, dashboards, performance management y Finance Insights. La
misma fuente describe alertas sobre pagos anómalos, interrupciones de caja y desvíos
presupuestarios. Su
[GIS para activos](https://www.tylertech.com/products/asset-management-pro/gis)
vincula infraestructura, órdenes de trabajo, solicitudes, cuadrillas e historial
de mantenimiento con ubicación.

Tyler publica un programa de
[seguridad de aplicaciones](https://www.tylertech.com/about-us/security-compliance/application-security)
con revisión de arquitectura, SAST/DAST, OWASP y pruebas manuales, y un proceso para
solicitar [informes SOC](https://www.tylertech.com/about-us/security-compliance/soc-compliance).
La acreditación FedRAMP citada por su Data Platform aplica al producto en alcance,
no automáticamente a todo el portafolio.

Lección para MuniControl: diseñar workspaces por función y una plataforma de datos
reutilizable, no páginas aisladas que vuelven a calcular la misma cifra con reglas
distintas.

### 2.7 Granicus: experiencia ciudadana como journey, no como menú de trámites

La [Government Experience Cloud](https://granicus.com/gxc/) agrupa Service,
Engagement y Operations Cloud. Cubre 311, formularios, permisos, web, email/SMS,
encuestas, reuniones, agendas y solicitudes de información pública. Su foco no es
el mayor contable, sino reducir fricción durante todo el recorrido ciudadano.

[Service Cloud](https://granicus.com/service-cloud/) declara formularios con
validación, workflows compartidos, accesibilidad, multilenguaje, pagos y seguridad
web gestionada con protección de borde de Akamai. El
[Government Experience Agent](https://granicus.com/gxa/) se posiciona como una
capa gobernada conectada a contenido y sistemas oficiales, con responsabilidad
humana explícita.

El [Trust Center](https://granicus.com/trust-center/) documenta privacidad por
diseño, retención, subprocessors y evaluaciones de impacto. Las certificaciones de
Granicus son específicas por producto y región; no debe afirmarse que toda GXC
tiene el mismo alcance de FedRAMP, ISO o SOC sin revisar el servicio contratado.

Lección para MuniControl: separar el **asistente ejecutivo interno**, el
**autoservicio del empleado** y el **asistente ciudadano**. Cada uno necesita otras
fuentes, permisos, lenguaje, acciones y evaluación. Un chatbot universal con acceso
transversal sería más riesgoso y menos útil.

### 2.8 SAP Public Sector: control financiero y gobierno de integración

La documentación de
[SAP S/4HANA Cloud Public Sector Management](https://help.sap.com/docs/SAP_S4HANA_CLOUD/93bd0b1e72ca4cbcbfb942d4497529f7/39258e361aa8474a89da8f57fc9fd3a4.html)
describe Budget Management, Grantee Management y Fund Accounting integrados con
contabilidad, controlling y proyectos. Documenta control de disponibilidad,
movimientos presupuestarios y trazabilidad mediante documentos. También advierte
que la disponibilidad depende de scope bundles y versiones por país/región: no
todo catálogo global está listo para cualquier jurisdicción.

[SAP Ariba para sector público](https://www.sap.com/sea/products/spend-management/public-sector-procurement-solutions.html)
prioriza sourcing, procurement, cumplimiento, workflows y controles financieros.
[SAP Analytics Cloud](https://www.sap.com/products/data-cloud/cloud-analytics/features.html)
combina BI, planificación y escenarios, mientras
[SAP Integration Suite](https://help.sap.com/docs/integration-suite/isuite-integrations-and-apis/api-management)
documenta diseño, seguridad, cuotas, threat protection, versionado y monitoreo de
APIs en entornos cloud/on-premise.

El [SAP Trust Center](https://www.sap.com/about/trust-center/certification-compliance.html)
ofrece certificaciones, informes SOC, continuidad y documentación de privacidad;
de nuevo, cada assurance debe verificarse contra producto, región y servicio.

Lección para MuniControl: adoptar la disciplina de semántica financiera, controles
de disponibilidad, versionado y gobierno de API sin importar la complejidad y el
costo de una suite global cuando el municipio sólo necesita una fracción.

### 2.9 Esri ArcGIS/Velocity: qué significa realmente un mapa en tiempo real

La documentación de
[ArcGIS Velocity](https://doc.arcgis.com/en/velocity/ingest/what-is-a-feed-.htm)
distingue feeds de polling y streaming, conecta IoT, APIs y brokers como Kafka o
MQTT, y expone cada evento para análisis y visualización. Su
[descripción funcional](https://doc.arcgis.com/en/velocity/reference/faq.htm)
incluye geofencing, detección de incidentes, análisis histórico y salidas hacia
capas, mensajería o sistemas externos.

El [ArcGIS Trust Center](https://trust.arcgis.com/en/compliance/compliance.htm)
documenta el alcance de FedRAMP e ISO para servicios online y aclara que un SOC 2
corporativo no cubre automáticamente todos los productos y datos. Esa precisión de
alcance es una buena práctica que MuniControl debe imitar.

Lección para MuniControl: mantener PostGIS + MapLibre como arquitectura soberana es
razonable, pero replicar el patrón operativo de ArcGIS: catálogo de feed, esquema,
timestamp de evento e ingesta, heartbeat, latencia, ownership, permisos por capa,
monitorización, replay y salida accionable. El mapa es una vista del sistema; no es
el sistema.

## 3. La posición competitiva que sí puede ganar MuniControl

### 3.1 No otro “todo en uno”, sino un sistema operativo de decisiones

Los líderes globales son fuertes en amplitud y procesos maduros; los referentes
argentinos son fuertes en adaptación administrativa. MuniControl puede diferenciarse
en la intersección que ninguno demuestra por completo en las fuentes públicas:

1. **Verdad visible:** fuente, corte, cobertura, calidad, conciliación y limitación
   junto a cada KPI.
2. **Contexto municipal argentino:** áreas, circuitos, normativa, organismos y
   vocabulario institucional configurables sin forks.
3. **Decisión trazable:** señal → explicación → decisión → responsable → evidencia
   → resultado.
4. **Experiencia ejecutiva sobria:** prioriza excepciones y acciones; evita un
   mosaico infinito de tarjetas y un chatbot ocupando el centro del producto.
5. **Soberanía e interoperabilidad:** APIs y exportación abiertas, conectores
   desacoplados y posibilidad de sustituir proveedores sin perder el modelo
   municipal.
6. **Seguridad demostrable:** permisos server-side, segregación de funciones,
   auditoría, restore probado y evidencia reutilizable para licitaciones.

El núcleo conceptual debe ser:

```text
fuente autoritativa
  → contrato versionado
  → métrica con calidad y frescura
  → señal priorizada
  → evidencia y explicación
  → decisión autorizada
  → tarea, aprobación o workflow
  → resultado medido y auditado
```

Un “insight” que no puede recorrer esa cadena es una observación, no una capacidad
de gobierno.

### 3.2 Contrato mínimo de un brief ejecutivo

S13 convierte esta recomendación en una primera rebanada gobernada:
`grh-decision-brief-v1` entrega situación, cambio, prioridades y límites desde
agregados del snapshot aprobado, con validación local; separa la señal global de la mensual, expone
`temporalQuarantineRows`, aplica k=10 y filtra CTA por capability. No exporta PII,
importes, códigos de fuente/celda, labels, responsables o plazos. Ese recorte es
deliberado: el action ledger y el workflow siguen en roadmap.

El contrato ejecutivo objetivo completo debe contener, cuando exista evidencia y
gobierno para cada campo:

- título en lenguaje político-administrativo claro;
- dominio, período y alcance territorial/organizacional;
- valor observado, comparación válida y denominador;
- fuente, versión de contrato, corte y edad del dato;
- cobertura, calidad y conciliaciones relevantes;
- drivers que explican el cambio, sin atribuir causalidad no demostrada;
- riesgo e impacto potencial;
- acción permitida para ese rol;
- responsable, vencimiento y estado;
- documentos o registros que sostienen la decisión;
- resultado posterior y guardrails afectados.

Esto supera al dashboard que sólo informa “rojo” o “verde”: convierte la analítica
en memoria institucional.

## 4. UX/UI enterprise sin apariencia genérica de IA

### 4.1 Principios de experiencia

- **El asistente acompaña, no reemplaza la navegación.** Debe aparecer como panel
  contextual o comando dentro de un flujo, no como una caja de chat gigante en cada
  pantalla.
- **Una portada por rol, no un dashboard universal.** Intendente, Contaduría,
  Tesorería, Compras, RRHH y Administración tienen preguntas y acciones distintas.
- **Densidad profesional graduable.** Modo ejecutivo para reunión, modo analista
  para explorar y modo operativo para resolver colas de trabajo.
- **Cada visual responde una pregunta.** Estado, cambio, causa, riesgo o acción;
  nunca decoración.
- **La jerarquía nace del contenido.** Tipografía, espacios, color semántico y
  microinteracciones sobrias; sin gradientes arbitrarios, brillos, partículas ni
  textos aspiracionales genéricos.
- **Movimiento con función.** Transiciones para continuidad espacial, actualización
  o confirmación; `prefers-reduced-motion` y cero animación que demore una decisión.
- **Accesibilidad como contrato.** Teclado, foco visible, contraste, lector de
  pantalla, tabla equivalente, responsive a 390 px, impresión y exportación legible.

### 4.2 Workspace por perfil

| Perfil | Primera pantalla | Decisiones y acciones principales | Lo que no debe mostrar por defecto |
|---|---|---|---|
| Intendente | Brief diario/semanal, 5–7 señales y compromisos | Priorizar, asignar seguimiento, comparar áreas y revisar resultados | PII, tablas crudas, configuración técnica |
| Secretaría | Objetivos, alertas y backlog de sus áreas | Reasignar, justificar desvíos, aprobar dentro de atribuciones | Otras secretarías sin mandato |
| Hacienda | Ejecución, escenarios aprobados y riesgos fiscales | Revisar desvíos y coordinar presupuesto | Usar nómina GRH como si fuera contabilidad |
| Contaduría | Integridad, imputaciones, conciliaciones y cierres | Observar, corregir y cerrar con evidencia | Ejecutar pagos unilateralmente |
| Tesorería | Caja, órdenes autorizadas, lotes y conciliación bancaria | Programar/ejecutar dentro de límites y doble control | Modificar el asiento o aprobar su propia excepción |
| Compras | Solicitudes, competencia, adjudicación, contratos y recepción | Gestionar sourcing y ciclo de compra | Adjudicar y pagar sin segregación |
| RRHH | Dotación autorizada, movimientos, ausencias y control de liquidación | Gestionar novedades y calidad con finalidad explícita | Datos personales masivos por curiosidad |
| Administrativo | Bandeja de tareas, formularios y rechazos de datos | Crear/corregir campos y estados permitidos | Panel ejecutivo transversal |
| Auditor | Linaje, accesos, versiones, exportes y cierres | Investigar y emitir observaciones de sólo lectura | Alterar evidencia |
| Empleado | Autoservicio de su información y solicitudes | Consultar, iniciar y seguir sus trámites | Datos de terceros |
| Super Admin | Salud, tenants, integraciones, jobs y seguridad | Operar la plataforma y responder incidentes | Lectura rutinaria de PII municipal |

MuniControl ya entrega localmente el primer incremento de este patrón:
`inicio.html` aplica siete variantes exactas a los roles técnicos vigentes,
siempre consume `/api/auth/me` y sólo para el Inicio de Intendencia con variante
`executive-leadership` agrega el brief `grh-decision-brief-v1`. `SUPER_ADMIN` sin tenant no recibe GRH. El Panel
Ejecutivo GRH queda separado y conserva `grh-close-v1`. Esto no equivale a los
workspaces transaccionales objetivo, no crea cuentas y no implementa ámbitos
RBAC/ABAC persistidos.

### 4.3 Sistema de visualización

La decisión del roadmap vigente es consistente con el benchmark:

- SVG nativo para KPIs pequeños, impresión y visuales ejecutivos estables;
- Apache ECharts empaquetado y tree-shaken para series, matrices, treemap, sankey,
  zoom y exploración multidimensional;
- tabla o resumen textual equivalente para cada gráfico;
- PostGIS como autoridad espacial y MapLibre GL JS para mapas vectoriales;
- deck.gl sólo cuando el volumen justifique GPU;
- tiles vectoriales y agregación server-side para no descargar PII ni datasets
  completos al navegador.

Ninguna librería produce inteligencia por sí sola. La ventaja se construye con
definiciones, comparaciones válidas, linaje, permisos y acciones.

## 5. El cerebro analítico: más que un bot

### 5.1 Seis capas de inteligencia

| Capa | Pregunta | Ejemplo futuro | Guardrail |
|---|---|---|---|
| Situación | ¿Qué ocurre? | Participación de liquidación por centro de costo | No llamarla dotación activa |
| Cambio | ¿Qué varió frente a una base comparable? | Ausencias válidas vs. mismo período | Misma definición, cobertura y calendario |
| Explicación | ¿Qué dimensiones concentran el cambio? | Conceptos o áreas que explican una variación | No afirmar causalidad sólo por correlación |
| Riesgo | ¿Qué puede invalidar o agravar la lectura? | Baja conciliación, snapshot viejo, datos en cuarentena | Mostrar calidad junto al KPI |
| Acción | ¿Quién puede hacer qué y antes de cuándo? | Revisar una fuente o solicitar justificación | Política server-side y segregación |
| Resultado | ¿La decisión mejoró el indicador? | Reducción del atraso sin degradar calidad | Baseline y guardrails predefinidos |

### 5.2 Dos asistentes y una frontera clara

MuniControl debería evolucionar hacia asistentes separados:

1. **Copiloto ejecutivo/interno:** consulta contratos autorizados, genera briefs,
   explica métricas, prepara preguntas y propone acciones. Cada respuesta incluye
   evidencia, período, calidad y límites.
2. **Asistente ciudadano/empleado:** responde sobre contenido y trámites públicos o
   datos propios después de verificar identidad. Nunca comparte el espacio de
   herramientas ni el contexto del copiloto ejecutivo.

La generación de lenguaje puede agregarse después de contar con clave dedicada,
cuotas, evaluación, red teaming y observabilidad. Las cifras y decisiones deben
provenir de herramientas deterministas y contratos versionados; el modelo redacta,
no inventa la verdad.

Acciones sensibles deben usar **preview → confirmación → autorización → ejecución
idempotente → comprobante → auditoría**. Ningún agente debe adjudicar, pagar,
modificar un legajo o publicar un dato sin política y control humano explícitos.

### 5.3 Métricas ejecutivas de alto valor

La plataforma debe priorizar métricas que habiliten decisiones y declarar su
madurez:

- GRH: composición autorizada, movimientos, ausencias/licencias, conceptos de
  control, concentración por centro, calidad y conciliación;
- Hacienda: ejecución por etapa, disponibilidad, proyección versionada y sensibilidad;
- Contaduría: partidas sin imputar, conciliaciones, antigüedad de observaciones y cierre;
- Tesorería: posición de caja, órdenes autorizadas, vencimientos, pagos y conciliación;
- Compras: duración de ciclo, competencia, concentración, fraccionamiento, entregas y
  desvíos contractuales;
- servicios/obras: backlog, SLA, cobertura territorial, recurrencia y costo por resultado;
- ciudadanía: inicio → abandono → resolución por trámite/canal, satisfacción y
  accesibilidad;
- plataforma: frescura, calidad, fallos de ingesta, denegaciones, exports, SLO y restore.

Hasta conectar cada fuente, la tarjeta correspondiente debe decir **“fuente no
conectada”**, no mostrar cero ni una cifra demo.

## 6. Ingesta universal, pero gobernada

“Que puedan cargar todo” debe traducirse en una plataforma segura de onboarding de
datos, no en un endpoint que acepta bytes arbitrarios.

### 6.1 Flujo obligatorio

```text
registro de fuente y finalidad
  → carga o conector read-only
  → original privado + hash + clasificación
  → antivirus / sandbox / límites
  → parser aislado y esquema explícito
  → preview y mapeo de columnas
  → validación, deduplicación y cuarentena
  → aprobación según sensibilidad
  → persistencia transaccional
  → contrato semántico y publicación
  → auditoría y reporte de aceptados/rechazados
```

### 6.2 Matriz de formatos

| Entrada | Tratamiento objetivo | Riesgo principal | Condición de “éxito” |
|---|---|---|---|
| CSV/TXT | Encoding, dialecto, aridad, tipos, límites y esquema | Fórmulas, filas partidas, encabezados maliciosos, volumen | Filas validadas y persistidas |
| XLS/XLSX | Preflight del contenedor, todas las hojas, rangos y límites | ZIP bomb, hoja secundaria gigante, fórmulas, formatos ambiguos | Workbook completo validado; hoja objetivo persistida |
| JSON | JSON Schema, profundidad, tamaño y propiedades permitidas | Expansión, claves peligrosas, tipos inesperados | Documento conforme y almacenado |
| PDF | Parser aislado, OCR opcional, clasificación y revisión | Malware, texto falso, pérdida de estructura, PII | Documento y extracción revisados; nunca “dato contable” automático |
| Google Sheets | Export controlado, MIME/HTML, CSV robusto y cuota | Documento privado equivocado, login HTML, celdas multilínea | Fuente y filas verificadas/persistidas |
| PostgreSQL/MySQL | Usuario read-only, TLS, allowlist, timeout y consultas predefinidas | SSRF, exfiltración, query costosa, deriva de esquema | Snapshot o lote reconciliado y publicado |
| API/SFTP | Identidad de integración, permisos mínimos, firma, rate limit e idempotencia | Replay, secreto filtrado, respuesta parcial | Lote/evento procesado y auditado |

Cada fuente necesita dueño institucional, tenant, clasificación, retención, SLA,
esquema, zona horaria y procedimiento de baja. Los archivos originales no se
publican en el frontend ni se mezclan entre municipios.

## 7. Tiempo real y GIS con honestidad operacional

### 7.1 Cuatro clases de frescura

| Etiqueta visible | Definición operativa | Ejemplo |
|---|---|---|
| Snapshot | Corte fijo e inmutable | GRH 6 de agosto de 2026 |
| Lote | Actualización programada con última ejecución | Dump nocturno validado |
| Near real-time | Micro-lotes o polling con latencia medida | Reclamos cada 5 minutos |
| Streaming | Eventos continuos con heartbeat y offset | Flota vía MQTT/Kafka |

La UI debe mostrar `event_time`, `ingested_at`, última señal, latencia y estado del
feed. “En vivo” se retira automáticamente si el heartbeat vence.

### 7.2 Capas geográficas de decisión

- incidentes y reclamos, con densidad temporal y SLA;
- obras, hitos, avance físico/financiero y evidencia de campo;
- activos, mantenimiento, condición y órdenes de trabajo;
- inspecciones, rutas, cobertura y resultados;
- servicios, demanda, capacidad y brechas territoriales;
- flota/sensores sólo con contrato y fuente operativa;
- indicadores agregados por barrio/radio con denominadores válidos.

Un heatmap sin período, denominador y precisión puede estigmatizar zonas o exagerar
volumen. Domicilios y ubicaciones sensibles deben generalizarse, agregarse o
ocultarse según rol. La geografía nunca habilita decisiones automáticas sobre una
persona.

## 8. Seguridad que convence a funcionarios y auditores

### 8.1 Política de autorización objetivo

Cada decisión debe evaluar:

```text
tenant + identidad vigente + rol + área + recurso + acción
       + sensibilidad + contexto + vigencia + motivo
```

El menú sólo guía la UX; API y base deciden. La evolución debe incorporar SSO/MFA,
sesiones revocables, ámbitos versionados, acceso excepcional a PII con vencimiento,
rate limiting distribuido y alertas de abuso.

La base local vigente no es sólo diseño: `shared/route-policy.cjs`
`2026-08-14.18` fija localmente 33 recursos, 12 acciones, 56 permisos y 101 firmas exactas,
59 Serverless y 42 Express. S24 fue verificado en Production en el commit
`5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment
`dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, con release truth 30/30 y cero 5xx.
`shared/access-policy.cjs` `2026-08-13.4` proyecta el workspace de siete
roles. Las asignaciones finas, SoD, lifecycle y auditoría persistida permanecen
como propuesta aislada y no migrada.

### 8.2 Segregación de funciones

- Compras solicita, compara y propone; no paga unilateralmente.
- Contaduría imputa, controla y cierra; no ejecuta pagos.
- Tesorería ejecuta órdenes autorizadas dentro de límites; no altera evidencia.
- RRHH gestiona novedades; una liquidación requiere controles y cierre separados.
- Super Admin opera la plataforma; no posee acceso rutinario a datos municipales.
- Auditor lee evidencia inmutable; no modifica el hecho auditado.

Montos, excepciones, cambios maestros, exportes masivos y acceso a PII requieren
doble control o step-up authentication según riesgo.

### 8.3 Usuarios de demostración por rol

El usuario pidió una identidad por rol para demostrar la seguridad. La forma segura
no es publicar correos y contraseñas predecibles:

1. tenant de preview sin PII;
2. identidad institucional única por rol implementado;
3. contraseña aleatoria, distinta, de un solo uso y entregada por canal separado;
4. expiración y cambio obligatorio al primer ingreso;
5. guion con un caso permitido, uno denegado y uno cross-tenant por perfil;
6. auditoría del recorrido y desactivación al terminar.

Al corte, el seed **no prepara ningún rol**: `db:seed` está retirado, termina con
código `1` y `ACCOUNT_LIFECYCLE_NOT_GOVERNED`, sin secretos, DB ni escrituras.
La política reconoce siete identificadores técnicos para autorizar y renderizar
una experiencia local, pero eso no aprovisiona identidades. Los perfiles futuros
`TESORERIA`, `COMPRAS`, `RRHH`, `SECRETARIA`, `AUDITOR`, `ADMINISTRATIVO` y
`EMPLEADO` sólo deben crearse cuando existan sus políticas server-side, migración,
lifecycle y pruebas. Un selector que cambia el menú sin cambiar la autorización
sería una demo falsa.

### 8.4 Evidencia comercial de confianza

Los referentes maduros publican o entregan bajo NDA evidencia de seguridad. Para
vender MuniControl a otros municipios se debe construir un paquete verificable:

- modelo de amenazas y arquitectura de datos;
- matriz de roles, permisos y segregación;
- SDLC seguro, dependencias, SAST/DAST y pentest independiente;
- historial de incidentes y política de disclosure;
- DPA, subprocessors, residencia y retención;
- SLO, status page y mantenimiento;
- backups, fecha del último restore y RPO/RTO medidos;
- accesibilidad WCAG 2.2 AA y evidencia de pruebas;
- plan de salida y exportación completa;
- certificaciones futuras con alcance exacto, nunca como logotipo decorativo.

## 9. Decisiones concretas para el roadmap vigente

No se propone un roadmap paralelo. El benchmark refuerza y precisa E0–E7 del
[roadmap enterprise](ENTERPRISE_PRODUCT_ROADMAP.md).

| Fase | Resultado que debe enamorar al usuario | Patrón incorporado del benchmark | Gate no negociable | Estado actual |
|---|---|---|---|---|
| **E0 — Release GRH honesto** | Brief y centros ejecutivos rápidos, sobrios y con verdad visible | OpenGov/Tyler: dato + contexto + drill-down; SAP: semántica controlada | Sesión privada positiva, migración revisada, contratos materializados, smokes por rol/tenant/falla | S24 desplegado: commit `5b356bf4982f0b3c486ade33e027faa0cf9c8a93`, deployment `dpl_VdbaEmXJobfS5VfYr6TDQzHXDiDn`, release truth 30/30 y smoke por roles; `v1.10.0` se conserva como release versionado histórico y las identidades institucionales definitivas siguen pendientes |
| **E1 — Identidad, ámbitos y auditoría** | Cada perfil ve una plataforma distinta y puede demostrar límites reales | OpenGov entity scope, Tyler roles, X-Road access rights | MFA/SSO, políticas server-side, SoD, pruebas permitidas/denegadas/cross-tenant | UX-E1A + UX-E2A: siete inicios, capabilities server-computed y shell institucional; IAM-MAP-01 es puro, sin persistencia, cuentas o evidencia por rol |
| **E2 — Ingesta gobernada** | Administrativos cargan fuentes con preview, errores comprensibles y linaje | Tyler data platform, SAP API governance, Granicus forms | Original privado, antivirus, parser aislado, schema, cuarentena y persistencia comprobada | CSV/XLSX/Sheets endurecidos localmente; resto parcial |
| **E3 — Cerebro GRH** | Intendente recibe señales explicadas y acciones con seguimiento | OpenGov planning, Tyler Insights, SAP Analytics | Insight reproducible, calidad/frescura visibles, sin PII ni causalidad falsa | S13 entrega localmente el brief agregado `grh-decision-brief-v1`; seguimiento/action ledger siguen pendientes |
| **E4 — Finanzas y compras** | Circuito íntegro y dashboards que explican el gasto sin planillas paralelas | PGM/OpenGov/Tyler/SAP procure-to-pay | Fuente contable autoritativa, catálogo formal, conciliación y doble control | Sin fuente conectada; no simular |
| **E5 — Centro geoespacial** | Mapa operativo con capas, tiempo, SLA, privacidad y acciones | Tyler GIS, ArcGIS Velocity, Civitas mapa de gestión | Geometría válida, feed monitorizado, denominador y precisión por rol | Roadmap |
| **E6 — Continuidad** | Datos nuevos confiables y recuperación demostrable | X-Road interoperabilidad, OpenGov/Tyler/SAP operations | CDC/dump reconciliado, publicación atómica, observabilidad y restore medido | Diseñado, no activado |
| **E7 — Multi-municipio** | Segundo municipio se configura sin fork ni fuga de datos | Suites multi-entidad y trust centers globales | Tenant isolation, feature flags, tematización acotada, salida de datos y paquete de assurance | Roadmap |

### 9.1 Prioridad inmediata

1. Continuar E0 sobre integración privada: DB, datos materializados y smokes
   autenticados por rol/tenant; la superficie pública vigente `v1.10.0` ya está cerrada.
2. Completar la certificación de UX-E1A/UX-E2A y continuar E1 con persistencia,
   lifecycle y una demo auténtica para cada rol formalmente aprovisionado; hoy
   existen siete políticas de inicio, no siete cuentas.
3. Completar E2 con storage, antivirus, auditoría persistente y jobs asíncronos.
4. Elevar E3 desde el brief S13 local hacia action ledger, responsables y
   seguimiento sólo con contratos y persistencia aprobados.
5. Solicitar contratos de datos de Hacienda/Contaduría/Tesorería/Compras antes de
   construir E4.
6. Incorporar GIS y streaming sólo cuando exista una fuente geográfica autorizada.

### 9.2 Decisiones proactivas que deben agregarse

- **Action ledger:** registro de decisiones, responsable, plazo, evidencia y efecto.
- **Source catalog:** dueño, clasificación, contrato, SLA, frescura, calidad y linaje
  de cada fuente.
- **Metric registry:** definición, unidad, denominador, filtros, owner y versión.
- **Command palette:** búsqueda de módulo, métrica, expediente y acción autorizada,
  sin convertir el producto en chat.
- **Saved views y briefing mode:** vistas persistibles por reunión, área y objetivo.
- **Data trust panel:** por cada KPI, fuente, corte, cobertura, calidad y conciliación.
- **Policy simulator:** prueba segura de “quién puede hacer qué” antes de publicar un
  cambio de permisos.
- **Integration health:** estado, latencia, error, último éxito y replay por conector.
- **Trust center de MuniControl:** evidencia de seguridad, disponibilidad,
  accesibilidad y continuidad con alcance preciso.
- **Product analytics con privacidad:** medir finalización de tareas, errores y
  adopción por rol sin capturar PII ni confundir clicks con valor público.

## 10. Construir, integrar o contratar

| Capacidad | Decisión recomendada | Motivo |
|---|---|---|
| Modelo semántico municipal y decision briefs | Construir | Es la diferenciación y contiene conocimiento institucional |
| UX por rol y action ledger | Construir | Define la experiencia y la responsabilidad pública |
| Policy engine y tenant isolation | Construir sobre estándares/librerías revisadas | La política es propia; no se debe inventar criptografía ni identidad |
| Identidad, MFA y SSO | Integrar proveedor institucional | Protocolos maduros, revocación y menor riesgo operativo |
| Firma digital con validez legal | Integrar servicio habilitado | Requiere marco jurídico, certificados y custodia especializada |
| Antivirus, sandbox y OCR | Integrar componentes especializados y aislados | Alto costo/riesgo de desarrollar parsers y detección propios |
| Pagos y conciliación bancaria | Integrar proveedores/bancos autorizados | Cumplimiento, idempotencia y responsabilidad financiera |
| GIS | Construir experiencia sobre PostGIS/MapLibre; evaluar Esri por caso | Soberanía y costo, sin renunciar a conectores empresariales |
| Mensajería ciudadana | Integrar canales con consentimiento y auditoría | Deliverability, plantillas, baja y regulación |
| Object storage y backups | Servicio gestionado con copia separada | Durabilidad, object lock y recuperación operacional |
| IA generativa | Multi-provider detrás de un gateway gobernado | Evita lock-in y separa redacción de cálculo/acción |

La regla es conservar internamente contratos, políticas, semántica y exportación;
contratar capacidades comoditizadas o reguladas cuando hacerlo reduzca riesgo.

## 11. Preguntas que deben resolverse antes de ampliar alcance

- ¿Qué sistema es autoritativo para presupuesto, contabilidad, tesorería, compras,
  proveedores, expedientes y GIS?
- ¿Qué APIs, dumps, binlogs o archivos soporta cada proveedor y con qué derechos
  contractuales?
- ¿Cuál es el tenant, owner, clasificación y retención de cada dominio?
- ¿Qué roles y segregaciones aprueba formalmente el municipio?
- ¿Qué RPO/RTO, residencia y cifrado exige el gobierno?
- ¿Qué base geográfica, sistema de coordenadas, precisión y licencias existen?
- ¿Qué acciones puede recomendar la IA y cuáles puede ejecutar después de una
  confirmación?
- ¿Qué evidencia de accesibilidad, seguridad y continuidad exigirá una licitación?
- ¿Qué métricas demostrarán que MuniControl reduce planillas, tiempos y errores sin
  degradar control ni derechos?

Estas preguntas no bloquean E0–E3 sobre GRH. Sí bloquean cualquier afirmación de
que E4–E6 ya operan.

## 12. Definición competitiva de “nivel mundial”

MuniControl estará a nivel mundial cuando una demostración permita:

1. entrar con identidades reales de preview y observar permisos distintos;
2. ver datos GRH verdaderos con fuente, corte, calidad y límites;
3. pasar de una señal a su evidencia agregada y a una acción autorizada;
4. mostrar un `403` y un fallo de fuente sin revelar ni inventar datos;
5. cargar un archivo válido y ver exactamente qué se aceptó, rechazó y persistió;
6. demostrar que un archivo hostil queda aislado;
7. explicar por qué una cifra no equivale a pago, presupuesto o dotación;
8. consultar al asistente y recibir una respuesta trazable, no una opinión;
9. restaurar un entorno desde backup y exhibir la evidencia medida;
10. incorporar un segundo municipio sin compartir datos, secretos ni forks.

El orgullo de funcionarios e ingenieros debe venir de esa combinación de diseño,
velocidad, inteligencia y verdad. La estética abre la conversación; la evidencia
gana la confianza y sostiene la venta.

## 13. Fuentes oficiales consultadas

Todas las fuentes siguientes fueron consultadas el **8 de agosto de 2026**.

### Argentina y Mendoza

- Civitas — [Gobierno Inteligente](https://civitas.com.ar/gobierno-inteligente/)
- Civitas — [Software de Recursos Humanos](https://civitas.com.ar/software-recursos-humanos/)
- Civitas — [Indicadores reales y dashboards](https://civitas.com.ar/como-medir-el-rendimiento-de-tu-gestion-con-indicadores-reales/)
- PGM — [Web PGM](https://institucional.municipalidad.com/web-pgm.html)
- PGM — [Mi Muni, Mi Cuenta e integraciones](https://institucional.municipalidad.com/mi-muni-mi-cuenta.html)
- PGM — [Comunidad PGM](https://institucional.municipalidad.com/comunidad-pgm.html)
- Gobierno de Mendoza — [Ecosistema Digital de Integrabilidad](https://informacionoficial.mendoza.gob.ar/edi/)
- Gobierno de Mendoza — [X-Road](https://informacionoficial.mendoza.gob.ar/edi/xroad/)
- Gobierno de Mendoza — [Mendoza x Mí: usuarios y trámites](https://prensa.mendoza.gob.ar/mendoza-x-mi-suma-mas-servicios-y-gestiones-digitales-en-una-sola-aplicacion/)
- Argentina.gob.ar — [Ley 9.625 de Mendoza](https://www.argentina.gob.ar/normativa/provincial/ley-9625-123456789-0abc-defg-526-9000mvorpyel/actualizacion)

### OpenGov

- [OpenGov Financials](https://opengov.com/products/financials/)
- [OpenGov Developer API Catalog](https://developer.opengov.com/catalog)
- [OpenGov Webhooks](https://developer.opengov.com/docs/webhooks/overview)
- [Security at OpenGov](https://opengov.com/security/)

### Tyler Technologies

- [Enterprise ERP](https://www.tylertech.com/products/enterprise-erp)
- [Enterprise Data Platform](https://www.tylertech.com/products/data-insights/enterprise-data-platform)
- [GIS for Asset Management](https://www.tylertech.com/products/asset-management-pro/gis)
- [Application Security](https://www.tylertech.com/about-us/security-compliance/application-security)
- [SOC Compliance](https://www.tylertech.com/about-us/security-compliance/soc-compliance)

### Granicus

- [Government Experience Cloud](https://granicus.com/gxc/)
- [Service Cloud](https://granicus.com/service-cloud/)
- [Government Experience Agent](https://granicus.com/gxa/)
- [Trust Center](https://granicus.com/trust-center/)

### SAP

- [SAP S/4HANA Cloud Public Sector Management](https://help.sap.com/docs/SAP_S4HANA_CLOUD/93bd0b1e72ca4cbcbfb942d4497529f7/39258e361aa8474a89da8f57fc9fd3a4.html)
- [SAP Ariba Sourcing and Procurement for Public Sector](https://www.sap.com/sea/products/spend-management/public-sector-procurement-solutions.html)
- [SAP Analytics Cloud features](https://www.sap.com/products/data-cloud/cloud-analytics/features.html)
- [SAP Integration Suite API Management](https://help.sap.com/docs/integration-suite/isuite-integrations-and-apis/api-management)
- [SAP Trust Center certifications and compliance](https://www.sap.com/about/trust-center/certification-compliance.html)

### Esri

- [ArcGIS Velocity feeds](https://doc.arcgis.com/en/velocity/ingest/what-is-a-feed-.htm)
- [ArcGIS Velocity FAQ](https://doc.arcgis.com/en/velocity/reference/faq.htm)
- [ArcGIS Trust Center compliance](https://trust.arcgis.com/en/compliance/compliance.htm)

## 14. Regla de mantenimiento

Este benchmark no es una lista cerrada ni prueba permanente de capacidad. Debe
revisarse al menos en cada release mayor o cuando:

- un referente publique una API, certificación o módulo materialmente nuevo;
- MuniControl conecte una fuente o active una fase E0–E7;
- cambie la matriz de roles, el stack de datos/GIS o la regulación aplicable;
- una afirmación comercial se valide o contradiga mediante demo, contrato,
  auditoría o experiencia operativa.

Cada actualización debe conservar la fecha de consulta, distinguir fuente de
inferencia y evitar convertir marketing competitivo en requisito técnico sin una
decisión explícita.

Cambio 1.8.0: actualiza la línea base con WP0-L, IAM-MAP-01, UX-E2A y el
antecedente del preview protegido `fa5dcc5`. El release quedó en `master` y su
superficie pública productiva cerró 9/9 con código de salida `0`. WP0-L no fue
ejecutado conectado; el mapper IAM no persiste ni crea usuarios; el shell no
concede autorización. No declara DB, cuentas reales, RBAC/ABAC persistido ni
datos remotos.

Cambio 1.8.1: suma `/roles` como tour visual público para explicar siete perfiles
sin credenciales, JWT, autorización, APIs, DB, storage, PII o datos municipales.
La experiencia reduce fricción de demostración frente a un login ficticio, pero
no acredita seguridad por roles. El artefacto `b82c0b3` está en `master`/tag
`v1.8.1`, el deployment `dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` figura `Ready`, el
gate productivo cerró 10/10 exit `0`, el browser 390/1440 px quedó sin overflow,
consola, requests externos o destinos privados y la GitHub Release está live.
Este commit sólo registra evidencia documental post-release y no mueve el tag.

Cambio documental post-release 1.9.0: registra commit/tag `f9d1f88`, product
commit `ed76347`, deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` `Ready` en
`Production`, alias `https://municipio-junin.vercel.app`, gate 10/10 exit `0`
con `checkedAt 2026-08-09T14:42:10Z`, browser público 390/1440 px sobre `/login`
y `/roles` sin overflow, errores de consola ni requests externos, redirects
anónimos de `/dashboard`, `/inicio` y `/manuales` al login y GitHub Release live.
MuniGuía privada sigue sólo local con proyección autoritativa simulada; raíz 532
aprobadas + 1 smoke opt-in omitido y backend 20/20. No certifica autorización
positiva, cuentas reales, DB/baseline restaurado, MFA/lifecycle persistido ni GRH
remoto. Este commit documental no mueve el tag `v1.9.0`.
