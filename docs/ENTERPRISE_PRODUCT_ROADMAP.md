# Roadmap de producto enterprise — MuniControl

Versión: 1.9.0
Fecha de corte: 9 de agosto de 2026  
Propietarios: Producto, Ingeniería, Seguridad y Gobierno de Datos

El release público `v1.9.0` quedó fijado en el commit/tag `f9d1f88`; el product
commit es `ed76347`. El deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` figura
`Ready` en `Production` con alias `https://municipio-junin.vercel.app`; el gate
cerró 10/10 exit `0` con `checkedAt 2026-08-09T14:42:10Z`. El browser público
verificó `/login` y `/roles` —siete perfiles— a 390/1440 px sin overflow,
errores de consola ni requests externos; `/dashboard`, `/inicio` y `/manuales`
anónimos redirigieron al login. La GitHub Release
`https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.

MuniGuía privada sigue sólo local con proyección autoritativa simulada: focal
10/10, suite raíz 533 totales —532 aprobadas y 1 smoke opt-in omitido— y backend
20/20. Selectors y anchors siguen verificados por CI; si el target no está
visible, se omite sólo «Ubicar». La evidencia remota no certifica autorización positiva, cuentas reales,
DB o baseline restaurado, MFA/lifecycle persistido ni GRH remoto. Este commit
documental post-release no mueve el tag `v1.9.0` de `f9d1f88`.

## Propósito

MuniControl debe convertirse en el sistema municipal de decisión y operación,
no en una colección de pantallas. La plataforma objetivo integra fuentes
municipales, conserva su linaje, impone permisos verificables y transforma cada
dominio en información accionable para Intendencia, Secretarías y equipos
operativos.

La fuente real disponible hoy es el backup histórico **GRH Junín** con corte 6
de agosto de 2026, 44.537.741 bytes y SHA-256
`e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`.
`personas_junin` queda excluida de forma absoluta: no se analiza, perfila,
cruza, migra, publica ni usa como fallback. O2A ya probó su replay idempotente local; la
conexión continua, los otros dominios y los mapas operativos son evolución
planificada y no deben presentarse como activos hasta superar sus gates.

## Principios de producto

1. **Verdad antes que volumen visual.** Cada KPI informa fuente, período,
   cobertura, calidad y límites de interpretación.
2. **Decisión antes que decoración.** Una visualización existe para detectar,
   comparar, explicar o actuar; no para llenar espacio.
3. **Seguridad server-side.** El menú mejora la experiencia, pero la API y la
   base deciden el acceso real.
4. **Aislamiento municipal.** Todo dato operativo pertenece a un tenant y a un
   alcance funcional. El acceso cruzado falla cerrado.
5. **Operación recuperable.** No se considera backup hasta demostrar una
   restauración completa y reconciliada.
6. **Soberanía tecnológica.** Datos exportables, formatos abiertos, componentes
   empaquetados localmente y contratos que evitan dependencia de un proveedor.
7. **Accesibilidad y rendimiento desde el diseño.** WCAG 2.2 AA como objetivo,
   navegación por teclado, movimiento reducido y presupuestos de rendimiento.
8. **IA con evidencia.** Ninguna respuesta puede inventar métricas, ocultar una
   discrepancia ni tomar decisiones laborales automáticas sobre una persona.
9. **Agregado no significa anónimo.** Toda categoría de personas debe demostrar
   cardinalidad, aplicar el umbral antes del top-N y bloquearse si esa
   cardinalidad es desconocida.

## Arquitectura objetivo

```text
Fuentes municipales
GRH · Hacienda · Compras · Tesorería · Expedientes · GIS · archivos autorizados
        │
        ├── APIs / conectores read-only
        ├── cargas PDF · CSV · TXT · JSON · XLS/XLSX
        └── dump completo / CDC / micro-lotes
        │
        ▼
Landing privada e inmutable
archivo original + hash + manifiesto + tenant + operador + clasificación
        │
        ▼
Staging por ejecución
antivirus + parser aislado + esquema + deduplicación + cuarentena + linaje
        │
        ▼
Modelo municipal gobernado
datos operativos tenant-bound + capa semántica versionada + PostGIS
        │
        ▼
Política y servicios
identidad vigente + roles + ámbitos + aprobación + auditoría + APIs
        │
        ▼
Experiencias
Centro Ejecutivo · áreas · mapas · reportes · asistente · portales
        │
        ▼
Observabilidad y continuidad
trazas · métricas · alertas · backups · restores · RPO/RTO · evidencia
```

## Estado de la plataforma al corte

| Capacidad | Estado verificable | Próxima condición |
|---|---|---|
| `profile` + `grh-semantic-v2` | Validado localmente como fuente backend; v2 agrega participantes distintos por año sin exportar claves | Materializar en DB privada y hacer smoke remoto |
| `grh-executive-v2` y `grh-quality-v1` | Endpoints exactos y cinco UIs migrados localmente | Repetir captura de red y privacidad adversarial en preview |
| `grh-close-v1` | Cierre mensual explicado local: componentes/control, conciliación por período y comparación consecutiva k≥10, sin PII/labels/codes | Materializar bundle y hacer smokes de Hacienda por rol/tenant en preview |
| Centro de Calidad y Linaje GRH | Consumidor migrado localmente a `grh-quality-v1`; frontera remota observada en 401 sin sesión | Captura de red autenticada y smoke por tenant/rol con artefactos privados |
| Panel y Centro Ejecutivo GRH | Consumidores migrados localmente a `grh-executive-v2` + `grh-quality-v1`; frontera remota observada en 401 sin sesión | Prueba por tenant/rol, datos materializados y certificación remota |
| RRHH y Hacienda | Consumidores locales sobre proyecciones seguras; Hacienda retiró el P1 global-como-mensual | Repetir smokes por rol/tenant y certificar ambos en preview |
| Bot, Reportes y PDF | Consumidores server-side; Bot suma “Cierre explicado” sobre `grh-close-v1` y Reportes mantiene proyección portable k=10 | Materializar el par y hacer smokes por tenant/rol |
| Frontera HTTP raw | Cerrada localmente: `/api/grh-data` responde 410 después de auth/tenant, sin leer artefactos | Verificar 401/403/410 y cero referencias UI en preview |
| Autenticación DB-autoritativa | Implementada localmente | Configurar secretos, migrar y certificar producción |
| Inicio seguro por rol | `inicio.html`, `navigation.workspace` y siete variantes gobernadas por la política `2026-08-09.1`; login y `/me` proyectan capabilities y perfil desde servidor; 42/42 focal local | Repetir pruebas remotas por rol/tenant; no aprovisiona cuentas |
| Tour visual público de roles | `/roles` y `public-role-tour-v1` publicados en `v1.8.1` para siete perfiles; cero login, JWT, autorización, APIs, DB, storage, PII o datos municipales | Mantener el gate público y no confundir el recorrido con RBAC ni autorización positiva |
| MuniGuía contextual | Evidencia privada sólo local para `muniguia-contextual-v1`: tres pasos deterministas para doce rutas privadas exactas y siete roles; focal 10/10, raíz 532 aprobadas + 1 smoke opt-in omitido y backend 20/20 | Proyección autoritativa simulada; mantener autorización server-side y Manual como fallback; no confundir con el smoke público |
| WP0-L: observación de copia restaurada | Recolector read-only y fail-closed implementado y validado localmente; todavía no se ejecutó conectado | Autorizar y restaurar una copia descartable, ejecutar la observación y revisar evidencia externa; no es baseline ni migración |
| IAM-MAP-01 | Mapper puro y versionado para el subconjunto lifecycle reversible; sin Prisma Client, persistencia, migración o usuarios | Resolver drift de esquema, aprobar baseline/migración y construir el adaptador transaccional antes de aprovisionar identidades |
| UX-E2A: shell institucional | Shell compartido en `v1.8.1`; la superficie pública productiva cerró 10/10 con exit `0` | Mantener pruebas por rol; la UI no concede autorización ni prueba datos privados |
| Importación CSV/XLS/XLSX y Google Sheets | Endurecida localmente | Storage privado, antivirus y auditoría persistente |
| PDF/TXT/JSON y bases externas | Parcial o planificado | Contratos de parser/conector, cuotas y sandbox |
| Mapas operativos en tiempo real | No conectado | Fuente geográfica autorizada, PostGIS y SLA |
| O2A/O2A.1: replay del snapshot GRH | Replay real previo preservado; captura por descriptor, `fstat` y copias privadas `wx`/`0600` verificadas después con fixtures | Autenticar host/runtime y adapter conectado; no asumir que O2A.1 repitió los 44 MB |
| O2B: extracción conectada/programada | Diseñada, no activada; no hay cron ni DB/red | Acceso read-only/TLS, storage, scheduler, secretos e identidad de workload |
| CDC/actualización diaria | Diseñado, no activado | Acceso read-only/binlog, reconciliación y responsable operativo |
| Backups propios | Diseñado, no certificado | Storage, retención y restore ensayado |
| Techo exacto `recurso:acción` | Implementado localmente: 26 recursos, 12 acciones, 46 permisos y 78 firmas de ruta (36 Serverless + 42 Express) | Certificar adaptadores en el deployment y conservar denegación de desconocidos |
| Ámbitos RBAC/ABAC persistidos por área/dato | Propuesta aislada; gate baseline/release y expiración TRIAL implementados, sin migración | Baseline conectado, migración, policy engine, lifecycle de cuentas y matriz aprobada |
| Login institucional | Sobrio, autocontenido y accesible, sin usuarios demo; `/login` forma parte del gate productivo 10/10 de `v1.9.0` | No implica cuentas reales ni autoriza datos privados |
| Producción remota | Commit/tag `v1.9.0` `f9d1f88`, product commit `ed76347`; deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` `Ready` en `Production`, alias productivo y GitHub Release live | Browser público 390/1440 px sobre `/login` y `/roles` sin overflow, consola ni requests externos; rutas privadas anónimas redirigen al login; no inferir DB, cuentas, autorización positiva o datos remotos |

El gate E0.1 del workspace también está cerrado localmente: `/inicio` debe
reescribirse exactamente a `/inicio.html`, responder sin redirects y coincidir
con el SHA-256 canónico de una única captura UTF-8/LF de `inicio.html`. Rechaza la
topología anterior hacia `index.html`, archivos ambiguos y comment spoof antes
de promover. El focal fue 31/31 y el consolidado workspace + release truth,
45/45. El preview protegido aporta el antecedente manual. La evidencia
productiva vigente de `v1.9.0` es el gate público 10/10 con exit `0` sobre el
product commit `ed76347`, incluido `/roles`. La prueba de navegador en producción
a 390 px y 1440 px cerró sin overflow, errores de consola ni requests externos;
la GitHub Release está live.

## Arquitectura de roles objetivo

Un rol no debe equivaler a “puede entrar a la página”. La decisión se evalúa
con `tenant + rol + área + recurso + acción + sensibilidad + contexto`.

El incremento UX-E1A ya entrega una portada local diferente para los siete roles
técnicos vigentes (`SUPER_ADMIN`, `TENANT_ADMIN`, `INTENDENTE`, `CONTADOR`,
`TENANT_USER`, `INSPECTOR` y `DEMO`). Esa proyección mejora orientación y mínimo
privilegio visual, pero no sustituye la autorización de las APIs ni convierte los
perfiles objetivo siguientes en roles creados o asignaciones persistidas.

| Perfil objetivo | Ámbito principal | Capacidades esperadas | Restricciones clave |
|---|---|---|---|
| `SUPER_ADMIN` | Plataforma | Municipios, salud del servicio, configuración global | Sin lectura rutinaria de PII municipal |
| `INTENDENTE` | Municipio completo | Agregados ejecutivos, alertas, escenarios, reportes | Lectura; no altera evidencia fuente |
| `SECRETARIA` | Áreas asignadas | Gestión y seguimiento de sus áreas | Sin acceso transversal no justificado |
| `TENANT_ADMIN` | Tecnología municipal | Usuarios, integraciones, operación técnica | No aprueba pagos ni modifica evidencia contable |
| `AUDITOR` | Municipio o control externo | Linaje, accesos, cierres y exportes inmutables | Sólo lectura; exportación justificada |
| `CONTADURIA` | Contabilidad | Imputación, conciliación y cierres | Separada de la ejecución de pagos |
| `TESORERIA` | Tesorería | Órdenes autorizadas, pagos y caja | Doble control y límites de monto |
| `COMPRAS` | Compras/contrataciones | Proveedores, solicitudes, comparativas, órdenes | No adjudica y paga unilateralmente |
| `RRHH` | Recursos Humanos | Legajos autorizados, novedades y calidad | PII mínima, acceso registrado y por finalidad |
| `ADMINISTRATIVO` | Área asignada | Alta/corrección de expedientes o registros | Campos y estados explícitamente permitidos |
| `INSPECTOR` | Operación territorial | Casos asignados, evidencia de campo | Sin listado global de PII ciudadana |
| `EMPLEADO` | Autoservicio | Su propia información y trámites | Nunca ve datos de terceros |

La primera migración de persistencia RBAC deberá extender el techo exacto vigente
y reemplazar el enum rígido como única fuente de asignación de roles por
asignaciones versionadas y ámbitos. PostgreSQL Row-Level Security se evaluará
como defensa adicional, no como sustituto de las políticas de aplicación. Las
acciones sensibles requieren segregación de funciones, motivo, expiración y
auditoría.

### Demostración segura de roles — requisitos antes de habilitar

- No se publican correos ni contraseñas fijas en HTML, Git o manuales.
- Cada preview deberá crear una identidad institucional única por rol habilitado.
- Las claves iniciales deberán ser aleatorias, diferentes, temporales y de un solo uso.
- Antes de prometer cambio obligatorio o invitaciones expirables deben existir el
  endpoint, estado de cuenta, expiración, revocación y pruebas E2E correspondientes.
- La demostración deberá incluir una matriz de casos permitidos y denegados, además de
  un intento cross-tenant que debe devolver `403`.
- Los usuarios deberán expirar o desactivarse al finalizar la presentación y la
  evidencia deberá quedar registrada. Ese lifecycle aún no está implementado.

No existe un seed de cuentas habilitado. `db:seed` está retirado, termina con
código `1` y `ACCOUNT_LIFECYCLE_NOT_GOVERNED` sin conectar ni escribir en la
base. Las altas administrativas con contraseña conocida y las mutaciones de
tenant también están retiradas con `410`. Ningún perfil se aprovisionará hasta
que su alcance, migración y lifecycle sean implementados y aprobados; crear
nombres sin política real produciría una demostración engañosa.

El WP0 de base, receipt conectado y rollback se rige por
[`PRISMA_BASELINE_Y_DRIFT.md`](PRISMA_BASELINE_Y_DRIFT.md).

## Stack de visualización y experiencia

### Gráficos

- Mantener SVG nativo para indicadores ejecutivos pequeños, impresión y estados
  donde una dependencia adicional no aporta valor.
- Adoptar **Apache ECharts**, empaquetado y tree-shaken, para exploración
  multidimensional, zoom temporal, matrices, sankey, treemap y grandes series.
- Cada gráfico conserva tabla o resumen textual equivalente, unidad declarada,
  dominio temporal, fuente y estado vacío/error. Canvas nunca es la única forma
  de acceder al dato.
- Las animaciones comunican transición de estado y respetan
  `prefers-reduced-motion`; no retrasan la lectura ni simulan actividad.

### Geografía

- **PostGIS** será la autoridad de geometrías, índices y consultas espaciales.
- **MapLibre GL JS**, empaquetado localmente y con estilo municipal propio,
  renderizará mapas vectoriales, clusters, capas temáticas y heatmaps.
- **deck.gl** se incorpora sólo cuando el volumen o la visualización GPU lo
  justifique (trayectorias, grandes nubes de puntos o capas temporales).
- Para volumen alto se servirán tiles vectoriales; no se descargarán datasets
  completos con PII al navegador.
- Cada capa exige fecha, fuente, precisión, licencia, nivel de agregación y
  política de ocultamiento. El mapa base no convierte una capa municipal en
  “tiempo real”.

### Lenguaje visual

- Design tokens municipales versionados: tipografía, color semántico, densidad,
  elevación, radios, foco, movimiento y estados.
- Jerarquía ejecutiva sobria: contexto primero, KPI después, explicación y
  acción al final; sin gradientes arbitrarios ni texto genérico de IA.
- Componentes con variantes por densidad para escritorio de gestión, tablet de
  reunión y móvil operativo.
- Presupuestos iniciales a certificar: cero requests CDN obligatorios, cero
  overflow a 390 px, interacción principal sin bloqueo y degradación explícita.

## Fases de ejecución

### E0 — Release honesto del núcleo GRH

Objetivo: que el código ya validado exista en un preview seguro.

- revisar y versionar migraciones;
- materializar contratos GRH privados;
- configurar secretos, tenant CUID y pin `GRH_SOURCE_SHA256` aprobado;
- repetir en preview la migración ya cerrada localmente: cinco UIs sobre
  `grh-executive-v2`/`grh-quality-v1` y consumidores server-side portables;
- demostrar por captura de red que ningún navegador consulta `/api/grh-data` y
  que esa ruta responde 401/403/410 sin leer artefactos, manteniendo
  `profile`/`semantic` sólo en backend;
- crear usuarios piloto sólo después de aprobar baseline, migración y lifecycle,
  mediante invitaciones de un uso; no existen cuentas demo hoy;
- smokes anónimos, por rol, cross-tenant y caída de DB;
- corregir o retirar producción antigua antes de cualquier presentación.

Criterio de salida: el deployment certificado sirve únicamente datos GRH del
tenant correcto y no expone los endpoints/falsos reportes de la versión vieja.

### E1 — Identidad, ámbitos y auditoría enterprise

Base entregada localmente: un manifiesto compartido y fail-closed fija el techo
exacto por `runtime + método + ruta + recurso:acción` (26 recursos, 12 acciones,
46 permisos y 78 firmas: 36 Serverless y 42 Express). No hay wildcard, jerarquía
implícita ni autorización por nombre de pantalla. Esta base no sustituye las
asignaciones y ámbitos persistidos que completarán esta fase.

UX-E1A también está entregado localmente: `navigation.workspace` existe para los
siete roles vigentes; `inicio.html` consume sólo `/api/auth/me`; el servidor
proyecta capabilities y un `homeProfile` exacto; las prioridades visibles son una
intersección autorizada; `SUPER_ADMIN` sin tenant no carga GRH. Esto no crea una
cuenta por rol, no migra la propuesta RBAC/ABAC y no certifica el destino remoto.

IAM-MAP-01 agrega una frontera pura y reversible entre la máquina de lifecycle y
la propuesta Prisma. El mapper no importa Prisma Client, no persiste y no crea
cuentas. UX-E2A agrega el shell institucional compartido y accesible; organiza la
navegación autorizada, pero no transforma visibilidad en permiso. Ambos
incrementos están validados sólo en el checkout local y no completan E1.

- MFA/SSO institucional y sesiones revocables;
- asignaciones de rol por tenant y vigencia;
- ámbitos por secretaría/área y permisos recurso-acción;
- matriz de segregación Tesorería/Contaduría/Compras;
- auditoría inmutable de accesos, exportes y cambios;
- acceso excepcional a PII con motivo y vencimiento;
- rate limiting distribuido y alertas de abuso.

Criterio de salida: pruebas positivas y negativas por cada rol, sin autorización
basada únicamente en el cliente o en claims vencidos.

### E2 — Ingesta universal gobernada

- registro de fuentes, dueño, clasificación y periodicidad;
- CSV/TXT/JSON/XLS/XLSX con parsers robustos y esquema explícito;
- PDF con extracción aislada, OCR opcional y revisión humana;
- storage privado del original, antivirus y hashes;
- previews, mapeo de columnas, validación y cuarentena antes de persistir;
- conectores PostgreSQL/MySQL/API/SFTP read-only con allowlist y secretos
  administrados;
- límites, jobs asíncronos, idempotencia y reporte de filas aceptadas/rechazadas.

Criterio de salida: una carga nunca se presenta como exitosa si fue sólo
recibida, parcialmente interpretada o no persistida.

### E3 — Cerebro analítico GRH

Incremento backend entregado localmente:

- `grh-semantic-v2` agrega participantes distintos por año en ausencias,
  licencias y movimientos sin serializar las claves usadas para contarlos;
- `GET /api/grh-executive` publica `grh-executive-v2`: k=5 para rankings
  laborales interactivos y k=10 para compensación, eventos sensibles y salidas
  portables;
- `GET /api/grh-quality` publica `grh-quality-v1`: inventario (257 tablas, 147
  con filas, 110 vacías y 6.573.057 filas), calidad 88,99/100, cuarentena,
  integridad, cobertura, conciliación y riesgos, sin categorías, códigos ni
  importes;
- `GET /api/grh-close` publica `grh-close-v1`: componentes y controles de
  cálculo más conciliación real por período; sólo compara meses calendario
  consecutivos liberados k≥10 y no exporta PII, etiquetas, códigos o filas;
- la protección ocurre antes del top-N, usa supresión complementaria, reconcilia
  totales y trata toda cardinalidad desconocida como protegida;
- el backend de `GET /api/reports` construye una proyección portable k=10 y
  `grh-executive-report-v2` después de validar bundle, tenant y pin.
- el Bot determinista construye `grh-close-v1` desde esa misma lectura en el
  intent `close_explanation`; exige un único `YYYY-MM` liberado k≥10 y responde
  422 ante año solo, período protegido o ausente, sin sustitución ni score global.

La frontera raw está cerrada localmente: Panel, Centro Ejecutivo GRH, Calidad,
RRHH y Hacienda usan las proyecciones seguras; Reportes, PDF y Bot leen el bundle
sólo server-side y proyectan k=10; `/api/grh-data` responde 410 después de
autenticar y verificar tenant, sin leer artefactos. `profile` y `semantic` quedan
exclusivamente en backend. Hacienda ofrece localmente un cierre mensual
explicado, con moneda no declarada y descomposición aritmética no causal. GRH
Ejecutivo ya no repite el acuerdo global como si fuera una tasa mensual; no
existe certificación remota.

El focal Bot + E2E cerró 13/13 localmente. Sus respuestas de cierre no afirman
causalidad, moneda, pago o PII y todavía no están certificadas en un deployment.

- diccionario completo de tablas/columnas/conceptos y linaje;
- dotación, altas/bajas/movimientos, ausencias, licencias y antigüedad por
  cohortes autorizadas;
- control de liquidación, variaciones, conceptos y centros de costo;
- calidad, anomalías, faltantes y conciliación como métricas de primer nivel;
- drill-down agregado con umbral documentado, supresión adversarial y filtros
  persistibles;
- brief ejecutivo periódico con evidencia y acciones sugeridas;
- modelos predictivos sólo con objetivo, baseline temporal, evaluación de
  sesgo, revisión laboral/legal y decisión humana.

Criterio de salida: cada insight se reproduce desde un contrato versionado,
nunca confunde participación de liquidación con dotación activa y ningún
navegador recibe los contratos fuente.

### E4 — Hacienda, Contaduría, Tesorería y Compras

- catálogo presupuestario y contable formal;
- compromiso, devengado, ordenado y pagado diferenciados;
- proveedores y expedientes con deduplicación y controles;
- flujo solicitud → comparativa → adjudicación → recepción → pago;
- conciliación bancaria mediante fuente autorizada;
- alertas de fraccionamiento, concentración, demora y desvío con explicaciones;
- doble aprobación y evidencia documental.

Criterio de salida: saldos y estados cierran con la fuente contable; ninguna
vista usa valores GRH como sustituto de presupuesto o pago bancario.

### E5 — Centro geoespacial operativo

El diagnóstico vigente está en
[`GRH_GEOSPATIAL_READINESS.md`](GRH_GEOSPATIAL_READINESS.md): las coordenadas
residenciales GRH no son utilizables, no existen límites oficiales en el checkout
y la cobertura agregada por localidad no autoriza un mapa. El primer incremento
es un contrato de preparación sin PII, no un renderer con datos simulados.

- catálogo de capas y sistema de coordenadas;
- obras, reclamos, inspecciones, servicios y activos con geometrías válidas;
- mapas de calor temporales, clusters, cobertura y rutas;
- feeds de flota/sensores sólo con SLA y timestamp por evento;
- protección de domicilios y precisión según rol;
- umbral mínimo k=10 por celda geográfica, aplicado antes de filtros, clusters o
  heatmaps, con cardinalidad desconocida tratada como protegida;
- comparación territorial con denominadores poblacionales/catastrales válidos.

Criterio de salida: una capa sin actualización o precisión suficiente se marca
como histórica/no verificable y no dispara decisiones automáticas.

### E6 — Actualización continua, backups y observabilidad

Base O2A entregada: replay real local del snapshot canónico, sin red, DB, cron,
`api/_data` ni deployment. La primera corrida terminó `promoted/PUBLISHED` en
105,5 s y la repetición exacta `duplicate/DUPLICATE` en 294 ms; quedaron una
versión, una activación, un receipt de duplicado, LKG byte-estable y cero locks,
residuos o workspaces activos. El bundle revalidó 257 tablas, 6.573.057 filas,
calidad 88,99/100, `contains_pii=false` y `personas_junin` excluida. Sus estados,
invariantes y límites están en
[`GRH_PIPELINE_RUN_CONTRACT.md`](GRH_PIPELINE_RUN_CONTRACT.md).

O2A no acredita operación diaria, autenticidad del host, firma del ledger,
resistencia a corte de energía, ACL, backup, restore, DB, API o deployment. Antes
de O2B conectado quedan el host/runtime confiable, scheduler, identidad de
workload y ancla externa de evidencia.

O2A.1 cerró localmente la ventana principal TOCTOU: fuente, manifiesto y
procesadores se abren por descriptor, se verifican con `fstat`, se copian con
creación exclusiva `wx` y modo `0600`, y los procesadores reciben sólo las
copias privadas. La suite O2A/O2A.1 registró 54 pases y 1 smoke opt-in omitido;
usó fixtures y no repitió el replay real de 44 MB. Un host totalmente
comprometido permanece fuera de la garantía.

- dump diario idempotente y CDC sólo si la fuente lo permite;
- offsets, deduplicación, replay y reconciliación periódica;
- publicación atómica sin reemplazar el último snapshot válido por uno fallido;
- backups cifrados, retención, object lock y restauración ensayada;
- OpenTelemetry para correlacionar trazas, métricas y logs sin PII;
- SLO de frescura, disponibilidad, latencia, calidad y recuperación.

Criterio de salida: RPO/RTO se informan sólo después de una restauración medida.

### E7 — Producto multi-municipio

- onboarding y configuración por tenant sin forks de código;
- catálogo de módulos y feature flags auditables;
- temas institucionales dentro de un sistema de diseño común;
- contratos de exportación y salida de datos;
- paquetes de capacitación por rol;
- tablero de adopción, calidad, soporte y valor logrado;
- evidencia de seguridad y continuidad reutilizable en licitaciones.

Criterio de salida: un segundo municipio se incorpora sin compartir datos,
secretos ni personalizaciones irrepetibles con Junín.

## Analítica ejecutiva que debe priorizarse

El “cerebro” no es un chat aislado. Combina:

- **situación:** qué ocurre y con qué cobertura;
- **cambio:** respecto de qué período comparable;
- **causa:** dimensiones que explican el cambio sin afirmar causalidad falsa;
- **riesgo:** calidad, antigüedad, conciliación y controles vencidos;
- **acción:** responsable, plazo, evidencia requerida y seguimiento;
- **resultado:** si la decisión mejoró el indicador sin degradar guardrails.

Los briefs de Intendencia deben permitir pasar de un alerta agregado al dominio,
período y centro responsable, pero nunca abrir PII por curiosidad. Contaduría,
Tesorería y Compras tendrán vistas distintas de una misma evidencia, con estados
y acciones compatibles con su segregación.

## Gobierno de librerías y dependencias

Una dependencia se incorpora sólo con:

1. caso de uso y alternativa nativa documentados;
2. licencia y mantenimiento evaluados;
3. versión fijada, lock e integridad;
4. sin CDN obligatorio en producción;
5. límites de CPU/memoria/datos no confiables;
6. auditoría de vulnerabilidades y plan de actualización;
7. accesibilidad, responsive, impresión y falla sin datos;
8. prueba de que no envía telemetría o datos municipales a terceros.

## Indicadores de éxito del producto

- porcentaje de KPIs con fuente, período, dueño y contrato vigente;
- tiempo desde dato nuevo hasta insight publicado;
- decisiones ejecutivas registradas y revisadas;
- tasa de cargas aceptadas/rechazadas con causa;
- edad del último snapshot válido por dominio;
- accesos denegados/cross-tenant y exportes sensibles;
- cobertura de pruebas por permiso y flujo crítico;
- tiempo de recuperación probado y fecha del último restore;
- tareas operativas completadas por rol sin asistencia;
- reducción de planillas paralelas y conciliaciones manuales;
- adopción sostenida por área, sin confundir clicks con valor público.

## Regla de mantenimiento

Cada sprint que cambie una capacidad debe actualizar, en la misma revisión:

- este roadmap y su estado;
- el manual de usuario o el técnico que corresponda;
- contratos de datos y diccionario de métricas;
- matriz de roles/permisos;
- runbook, migración y rollback si aplica;
- pruebas y evidencia de QA.

Una función sin documentación operativa, responsable y procedimiento de falla no
está terminada, aunque su interfaz se vea completa.

Cambio 1.8.0: registra WP0-L, IAM-MAP-01, UX-E2A y el antecedente del preview
protegido `fa5dcc5`. El release quedó en `master` y la superficie pública
productiva cerró 9/9 con código de salida `0`. WP0-L no se ejecutó conectado; el
mapper IAM no persiste ni crea usuarios; el shell no concede autorización. No
declara DB conectada, baseline, migración, cuentas ni datos remotos.

Cambio 1.8.1: agrega el tour visual público `/roles` para los siete perfiles. El
contrato no inicia sesión, no usa JWT/storage, no autoriza y no consulta APIs,
DB, PII o datos municipales. El artefacto `b82c0b3` está en `master` y tag
`v1.8.1`; el deployment `dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` figura `Ready`, el
gate productivo cerró 10/10 exit `0`, el browser 390/1440 px no mostró overflow,
consola ni requests externos/privados y la GitHub Release está live. Esto no
demuestra DB, cuentas, autorización positiva ni datos remotos. Este commit sólo
registra evidencia documental post-release y no mueve el tag `v1.8.1`.

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
