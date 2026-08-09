# Manual integral y gobierno documental — MuniControl

Versión documental: 1.7.0  
Fecha de corte: 9 de agosto de 2026  
Estado: validado sobre el checkout local; no certifica producción

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
| [`PRISMA_BASELINE_Y_DRIFT.md`](PRISMA_BASELINE_Y_DRIFT.md) | DBA, seguridad, DevOps e ingeniería | Preflight offline/conectado, baseline real, receipt externo y atestación institucional pendiente antes de cualquier migración o cuenta por rol |
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
- El techo exacto de permisos por ruta está implementado localmente con 26
  recursos, 12 acciones, 46 permisos y 78 firmas protegidas: 36 Serverless y 42
  Express. La propuesta de
  ámbitos RBAC/ABAC está aislada y no migrada: todavía no hay persistencia fina,
  lifecycle de cuentas ni cuentas por cada rol.
- El acceso local termina en [`inicio.html`](../inicio.html), una portada segura
  regida por `navigation.workspace` y la política compartida `2026-08-09.1`.
  Login y `/api/auth/me` calculan en servidor las capabilities y un
  `homeProfile` mínimo para los siete roles técnicos vigentes. La portada hace
  una sola lectura de sesión, no consulta GRH ni otro dataset y muestra sólo las
  prioridades autorizadas. El Panel ejecutivo GRH queda separado.
- Un `SUPER_ADMIN` sin tenant se proyecta sólo con `session.read`,
  `navigation.workspace` y `navigation.help`; no recibe indicadores privados.
  Roles o perfiles desconocidos, capabilities ausentes y versiones obsoletas
  fallan cerrados. La matriz local de siete roles en 390/1440 px cerró 42/42.
- Este inicio por rol es UX y proyección de política; no crea identidades, no
  habilita el modelo RBAC/ABAC propuesto y no prueba DB, preview ni producción.
- La conexión continua, los backups propios, los mapas operativos y los ámbitos
  RBAC/ABAC persistidos por área todavía están planificados; no están
  certificados en producción.
- El árbol local contiene una versión más segura y completa que el deployment
  público observado al corte. Ese destino continúa legacy y **no certificado**;
  no presentarlo como producto actual hasta que `release:truth:check` termine con
  código `0` sobre el candidato exacto y se completen los smokes externos.
- E0.1 incorpora localmente `/inicio` al gate: exige el rewrite exacto a
  `/inicio.html`, una captura UTF-8/LF con SHA-256, HTML 200 sin redirects y
  digest remoto idéntico. El focal cerró 31/31 y el consolidado con workspace,
  45/45. Esto detecta drift y spoof; no demuestra que el destino ya fue
  desplegado.
- El acceso local usa una portada institucional sobria, autocontenida,
  responsive, navegable por teclado y compatible con movimiento reducido. No
  publica identidades demo, accesos rápidos ni claims de capacidades ausentes.
  Esta mejora de login tampoco está desplegada ni certificada remotamente.

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
6. Política de acceso `2026-08-09.1`, contrato de sesión server-computed,
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

1. aprobar el baseline Prisma, la migración RBAC/ABAC y su rollback;
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
| 1.7.0 | 2026-08-09 | Incorpora el inicio seguro por siete roles con capabilities calculadas en servidor, default `inicio.html`, `SUPER_ADMIN` sin tenant sin GRH y Panel ejecutivo separado; 42/42 local, sin cuentas, DB ni deployment |
| 1.6.0 | 2026-08-09 | Incorpora `grh-close-v1` en Hacienda y el Bot “Cierre explicado”, retira la atribución mensual falsa de una conciliación global, registra el bundle inmutable O2A.1 y el login institucional local; el público sigue legacy/no certificado |
| 1.5.0 | 2026-08-09 | Registra el replay real local O2A del snapshot canónico, promoción + duplicado idempotente y LKG estable; separa O2B conectado/programado sin declarar DB, cron, backup o deployment |
| 1.4.1 | 2026-08-08 | Cierra localmente la frontera raw: cinco UIs sin referencias fuente, consumidores server-side con proyección portable y `/api/grh-data` retirado con 410 sin leer artefactos; deployment y smokes siguen pendientes |
| 1.4.0 | 2026-08-08 | Incorpora `grh-semantic-v2`, cardinalidad anual sin claves, proyecciones seguras `grh-executive-v2`/`grh-quality-v1`, reglas k=5/k=10 y deja explícito que la migración UI y el retiro de `/api/grh-data` siguen abiertos |
| 1.3.0 | 2026-08-08 | Documenta baseline/drift, retiro del seed y lifecycle de cuentas todavía no conectado |
