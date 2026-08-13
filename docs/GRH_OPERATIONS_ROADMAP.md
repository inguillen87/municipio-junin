# Operación de datos GRH: de snapshot a actualización continua

Versión documental: 1.6.0  
Fecha de corte: 9 de agosto de 2026

Este documento define la evolución operativa de MuniControl sobre la fuente
laboral canónica **GRH Junín**. `personas_junin` es una fuente auxiliar separada
y queda fuera de este pipeline, sus artefactos y sus publicaciones. Su futura
integración tendrá manifiesto, staging y tabla puente versionada propios; nunca
usará igualdad de `IDPERSONA` entre sistemas. Véase
[`GRH_PERSONAS_INTEGRATION_BLUEPRINT.md`](GRH_PERSONAS_INTEGRATION_BLUEPRINT.md).

## Estado actual

Al 9 de agosto de 2026 existe una cadena reproducible y un replay real local
para el backup canónico con corte 6 de agosto de 2026, tamaño 44.537.741 bytes y
SHA-256
`e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`:

```text
backup gzip -> perfil -> contrato semántico -> controles -> artefacto privado
```

O2A ejecutó esa cadena en un estado local aislado: el primer replay terminó
`promoted/PUBLISHED` en 105,5 s y la repetición exacta terminó
`duplicate/DUPLICATE` en 294 ms, sin republicar. Quedaron una versión, una
activación, un last-known-good byte-estable y un receipt de duplicado; al cierre
hubo cero locks, residuos y workspaces activos. El bundle volvió a validar 257
tablas, 6.573.057 filas, calidad 88,99/100, `contains_pii=false` y
`personas_junin` excluida.

Esta prueba no usó red, DB, cron, `api/_data` ni deployment. El código de
publicación tenant-bound existe, pero la materialización en una base privada y
el smoke test remoto siguen pendientes. Por lo tanto, el estado correcto es
**snapshot histórico con replay local validado**, no extracción diaria ni
tiempo real. El contrato y sus límites están en
[`GRH_PIPELINE_RUN_CONTRACT.md`](GRH_PIPELINE_RUN_CONTRACT.md).

## Principios no negociables

1. GRH es la única fuente maestra de personal hasta una decisión formal de
   gobierno de datos.
2. La extracción usa credenciales de sólo lectura, TLS y alcance mínimo.
3. La zona raw es privada, cifrada, inmutable y nunca se sirve al navegador.
4. La UI sólo consume contratos agregados, versionados y sin PII.
5. Cada publicación registra origen, corte, hash, versión, calidad y resultado
   de conciliación.
6. Una carga con controles críticos fallidos no reemplaza el último contrato
   válido: se envía a cuarentena y la API falla cerrada o conserva el snapshot
   anterior con una advertencia explícita de antigüedad.
7. “Actualizado”, “diario” o “tiempo real” sólo se muestra cuando existe
   evidencia operativa del SLA correspondiente.

## Arquitectura objetivo

```text
GRH productivo
  │  cuenta read-only + TLS
  ├──────── extracción completa programada
  └──────── CDC/binlog, si el proveedor lo habilita
                     │
                     ▼
              landing inmutable
       dump/cambios + manifiesto + SHA-256
                     │
                     ▼
          staging aislado por ejecución
       schema checks + dedupe + cuarentena
                     │
                     ▼
       perfil y contrato semántico versionado
          calidad + conciliación + linaje
                     │
                     ▼
          publicación atómica tenant-bound
               PostgreSQL grh_artifacts
                     │
                     ▼
        API autenticada -> vistas ejecutivas
```

## Sprint O1 — Publicación privada del snapshot

Entregables de código existentes:

- `migrations/002_grh_artifacts.sql`
- `scripts/publish_grh_artifacts.mjs`
- `api/lib/grh-artifacts.js`
- `api/grh-executive.js`
- `api/grh-quality.js`
- `api/grh-close.js`, salida mensual `grh-close-v1` con k=10 y conciliación por
  período, sin PII, etiquetas ni códigos de celda
- `api/grh-data.js` como frontera retirada: autentica, valida tenant y responde
  `410 GRH_RAW_CONTRACT_RETIRED` sin leer artefactos

Pendientes operativos:

- identificar el `tenants.id` CUID real de Junín;
- aplicar la migración en un entorno privado;
- configurar `GRH_TENANT_ID` sin exponer su valor;
- materializar `profile` y `semantic`;
- probar proyecciones permitidas, tenant ajeno, rol insuficiente y artefacto ausente;
- repetir 401/403/410 sobre la frontera raw y verificar que no lee el bundle;
- verificar `Cache-Control: no-store` y ausencia de PII en proyecciones y logs.

Criterio de salida: dos usuarios habilitados del tenant correcto ven las mismas
proyecciones seguras del snapshot aprobado; usuarios inactivos, degradados o de
otro tenant reciben 401/403; la frontera raw devuelve 410 y una caída de DB
devuelve 503 sin datos de respaldo inventados.

## Sprint O2A — Replay local idempotente del snapshot

Estado: **completo y probado en un host local controlado**.

El runner local implementa, sin servicios externos:

1. validación previa y posterior del archivo y su manifiesto aprobado;
2. lock exclusivo del estado local;
3. workspace temporal privado por corrida;
4. perfilado, contrato semántico y validación integral del bundle;
5. promoción atómica al last-known-good sólo después de superar los gates;
6. identificación por fuente, manifiesto y bundle exacto de procesadores;
7. detección de duplicado sin crear una segunda versión ni activación;
8. receipts y ledger locales sin rutas, PII ni payloads raw;
9. limpieza verificable de locks, residuos y workspaces.

### O2A.1 — Immutable Execution Bundle

El runner reduce la ventana TOCTOU antes de iniciar procesadores:

1. abre fuente, manifiesto y cada archivo gobernado del procesador por descriptor;
2. verifica identidad y tamaño mediante `fstat` sobre el descriptor abierto;
3. crea una copia privada con exclusividad `wx` y modo `0600` dentro del workspace;
4. calcula/verifica hashes sobre los bytes capturados;
5. entrega a los procesadores exclusivamente las rutas de esas copias privadas;
6. elimina el workspace al finalizar o fallar.

Esto evita que el pipeline valide una ruta y luego procese silenciosamente otros
bytes por una sustitución ordinaria del archivo. No es una atestación del host:
un host completamente comprometido permanece fuera de la garantía. La suite
focal O2A/O2A.1 cerró con 54 pases y 1 smoke opt-in
omitido, usando fixtures. **No se repitió** el replay real del snapshot de 44 MB,
no se usó DB y no hubo deployment.

Evidencia focal del snapshot canónico:

| Control | Resultado local verificado |
|---|---|
| Primera ejecución | `promoted/PUBLISHED` en 105,5 s |
| Replay idéntico | `duplicate/DUPLICATE` en 294 ms |
| Persistencia local | 1 versión, 1 activación y 1 receipt de duplicado |
| Last-known-good | Byte-estable después del duplicado |
| Higiene de ejecución | 0 locks, residuos y workspaces activos al cierre |
| Contrato resultante | 257 tablas, 6.573.057 filas y calidad 88,99/100 |
| Privacidad | `contains_pii=false`; `personas_junin` excluida |

Límites: `PUBLISHED` significa activado sólo en `LOCAL_STATE`; no prueba una
publicación DB, API o deployment. El ledger detecta cambios accidentales, pero
no está firmado ni autentica por sí solo al host. Tampoco se certificaron corte
de energía, backup, restore, RPO/RTO o ejecución programada. Antes de habilitar
un adapter conectado todavía exige verificar y autenticar host/runtime, aislar
la identidad de workload y anclar evidencia fuera del host.

## Sprint O2B — Extracción conectada y programada

Estado: **pendiente; O2A no la habilita**.

Diseñar y certificar un job conectado con estas etapas:

1. adquirir lock por fuente y fecha;
2. exportar a un archivo temporal privado;
3. calcular tamaño, SHA-256 y conteos básicos;
4. mover atómicamente a landing sólo si finalizó la escritura;
5. crear un manifiesto firmado con `source_id`, `started_at`, `completed_at`,
   versión del extractor y resultado;
6. ejecutar perfilado/semántica en un staging nuevo;
7. comparar contra el último snapshot;
8. publicar sólo si pasan los gates;
9. emitir evento de auditoría y métricas operativas.

Además deberá contar con cuenta GRH read-only, TLS, storage privado, scheduler,
gestión de secretos, identidad de workload, observabilidad, responsables y
evidencia remota. No se reutiliza la palabra `PUBLISHED` de O2A para describir
materialización tenant-bound.

Gates mínimos:

- esquema esperado o cambio explícitamente aprobado;
- hash nuevo o ejecución marcada como duplicada sin republicar;
- conteos no vacíos para tablas críticas;
- unicidad e integridad referencial dentro de umbrales declarados;
- fechas futuras/corruptas enviadas a cuarentena;
- identidad de control de cálculo dentro de tolerancia;
- conciliación `calculo`/`totpago` visible, nunca convertida en falso éxito.

## Sprint O3 — CDC o micro-lotes

CDC no debe elegirse hasta confirmar motor, versión, acceso al binlog, retención
y restricciones contractuales del proveedor GRH.

Si está disponible:

- capturar `source_table`, clave, operación, posición del log y timestamp;
- guardar offsets transaccionalmente;
- procesar con semántica al menos una vez y deduplicación por evento;
- reconstruir el contrato en micro-lotes, no mutar KPIs fila por fila en el
  navegador;
- ejecutar reconciliación completa periódica contra un dump para detectar
  deriva o eventos perdidos.

Si CDC no está disponible, usar extracciones incrementales por columnas
confiables sólo después de probar su monotonicidad. En ausencia de una marca de
cambio confiable, conservar el dump completo programado.

## Sprint O4 — Backups propios y recuperación

Un backup no está terminado hasta que se restaura.

Controles requeridos:

- cifrado en tránsito y reposo con claves administradas fuera del repositorio;
- copias en una cuenta/proyecto separado del entorno primario;
- política de retención aprobada por el municipio;
- hash y manifiesto por objeto;
- inmutabilidad o object lock para copias críticas;
- acceso con doble control para restauración y borrado;
- restauración automática mensual a un entorno aislado;
- evidencia de RPO, RTO, duración, conteos y controles semánticos post-restore;
- runbook de incidente y responsables institucionales.

Objetivos iniciales a validar con gobierno y legales, no promesas actuales:

- actualización ejecutiva diaria;
- RPO de 24 horas para el pipeline analítico;
- RTO de 8 horas para restaurar la capa analítica;
- histórico suficiente para auditoría y comparaciones interanuales.

## Sprint O5 — Observabilidad y operación

Tablero interno del pipeline:

- edad del snapshot servido;
- última extracción exitosa y última fallida;
- duración y volumen por etapa;
- cambios de esquema;
- filas válidas y en cuarentena por dominio;
- calidad total y componentes;
- score, cobertura y acuerdo de conciliación cruzada;
- fallos de publicación, API y autorización;
- pruebas de restore y días desde la última evidencia exitosa.

Alertas sugeridas:

- snapshot vencido respecto del SLA;
- caída abrupta de volumen;
- hash repetido cuando se esperaban cambios;
- nueva tabla/columna o tipo incompatible;
- aumento material de cuarentena;
- diferencia de control fuera de tolerancia;
- intento cross-tenant o descarga anómala.

## Roles y segregación futura

La granularidad final se diseña después de estabilizar los contratos, pero la
arquitectura debe separar desde ahora:

- **lector ejecutivo**: agregados autorizados;
- **analista de datos**: calidad y cuarentena sin PII por defecto;
- **operador de ingesta**: ejecutar/reintentar jobs, sin administrar usuarios;
- **custodio de datos**: acceso excepcional a raw con motivo y auditoría;
- **administrador de plataforma**: configuración técnica, sin aprobación
  unilateral de pagos ni cambios de evidencia;
- **auditor**: lectura inmutable de linaje, accesos y publicaciones.

Las operaciones destructivas, publicación de una nueva versión y acceso a PII
deben requerir segregación de funciones y auditoría inmutable.

## Definición de “titular” de la plataforma

MuniControl puede convertirse en la plataforma principal cuando demuestre, de
forma sostenida:

- contratos de datos documentados y versionados;
- operación diaria medible;
- exactitud y límites visibles;
- continuidad y recuperación probadas;
- integraciones desacopladas del proveedor anterior;
- exportabilidad completa para evitar un nuevo lock-in;
- seguridad multi-tenant y permisos auditables;
- adopción real por responsables ejecutivos y operativos.

La titularidad no se obtiene ocultando inconsistencias del legado, sino
volviéndolas trazables y controlables.

## Historial documental

| Versión | Fecha | Cambio |
|---|---|---|
| 1.6.0 | 2026-08-09 | Registra `grh-close-v1` como salida agregada y O2A.1 con captura por descriptor, `fstat` y copias privadas `wx`/`0600`; no declara nuevo replay real, DB ni deployment |
| 1.5.0 | 2026-08-09 | Registra el replay real local O2A, promoción, duplicado y límites frente a O2B conectado |
