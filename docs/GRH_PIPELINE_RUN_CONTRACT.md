# Contrato local de corrida GRH O2A

**Versión:** `grh-pipeline-run-v1`
**Revisión documental:** 1.6.0 (2026-08-09)
**Estado:** runner manual O2A probado localmente; adapter conectado inerte. No
certifica extracción diaria, publicación remota, backup, restore, frescura ni
SLA.

## Propósito y límite de verdad

`shared/grh-pipeline-foundation.cjs` modela decisiones puras para una corrida
`lock → extract → profile → validate → publish`. Ese módulo no abre archivos ni
usa red, DB, storage, cron o KMS. El runner
`scripts/replay_grh_pipeline.mjs` sí ejecuta manualmente el replay local, aplica
locks y promueve un last-known-good dentro de `LOCAL_STATE`; fue probado con el
snapshot canónico y su repetición duplicada. Ninguna de esas dos piezas activa
el adapter conectado ni demuestra una operación externa.

La fuente de este pipeline sigue siendo GRH Junín. `personas_junin` es auxiliar,
pero está rechazada como entrada, fallback o material de este contrato O2A. Su
futura integración debe ejecutarse en un pipeline independiente y producir una
tabla puente versionada; la igualdad de `IDPERSONA` entre sistemas no es una
regla válida. El contrato acepta sólo identificadores ASCII opacos y
metadatos/digests; no admite payloads raw, PII, rutas, correos, credenciales,
tokens ni secretos. Véase
[`GRH_PERSONAS_INTEGRATION_BLUEPRINT.md`](GRH_PERSONAS_INTEGRATION_BLUEPRINT.md).

## Alcances de ejecución

| Alcance | Target | Tenant | Estado en O2A |
|---|---|---|---|
| `LOCAL_REPLAY` | `LOCAL_STATE` | debe ser `null` | modelado y probado localmente |
| `CONNECTED_TENANT` | `PRIVATE_DB` | ID gobernado obligatorio | forma validable, planificación bloqueada |

Por eso, `PUBLISHED` significa “activado en el target declarado”. En O2A sólo
puede alcanzarse para `LOCAL_STATE`; no significa materializado en PostgreSQL,
desplegado ni disponible en producción. La futura integración conectada requiere
tenant real, autorización, adapter revisado y evidencia externa. El bloqueo se
aplica al planner, al inspector de runs y a cada transición, incluso si un caller
construye a mano un objeto conectado. Sólo el manifest futuro puede validar su
forma sin autorizar una corrida.

## Identidad e idempotencia

El manifest exacto `grh-pipeline-manifest-v1` fija:

- `runId`, alcance, target y tenant;
- `sourceId=grh-junin`, sistema `GRH`, corte, SHA-256, tamaño y
  `sourceManifestDigest` del manifiesto de aprobación exacto;
- versión del extractor y versiones de `profile` y `semantic`;
- `processorBundleDigest`: SHA-256 del conjunto exacto de código/lock que produce
  y valida los contratos.

`manifestDigest` incluye `runId`. `idempotencyKey` lo excluye, pero incluye
fuente, corte, alcance, target y todas las versiones/digest del procesador. Dos
intentos sobre la misma identidad comparten clave; cambiar código gobernado crea
otra clave. El adapter futuro debe reclamar esa clave atómicamente. Un digest no
demuestra por sí solo que el lock exista.

La identidad lógica del bundle se calcula sobre JSON canónico y excluye
únicamente `profile.generated_at` y `semantic.source.generated_at`, después de
validar que ambos sean UTC canónico y coincidan con el timestamp único de la
corrida. Los SHA-256 de los bytes realmente almacenados quedan en la observación
operativa y se revalidan al leer el LKG. Por eso O2A promete igualdad lógica del
contenido, no bytes, fin de línea ni timestamps idénticos entre sistemas.

Al planificar:

- un snapshot anterior al last-known-good se bloquea;
- mismo corte con distinto SHA de fuente se bloquea como conflicto;
- el inspector del run vuelve a aplicar target, rollback y conflicto para que un
  objeto construido a mano no eluda al planner;
- el last-known-good nunca se modifica hasta completar `PUBLISH`;
- un duplicado requiere el mismo last-known-good íntegro, incluida su
  `idempotencyKey`, versiones de extractor/profile/semantic y digests de
  aprobación/procesador; además, el `evidenceDigest` del receipt debe ligar el
  receipt de publicación del LKG. Termina en `DUPLICATE`, sin promoción.

## Estados y recibos

```text
PLANNED → LOCKED → EXTRACTING → EXTRACTED
        → PROFILING → PROFILED → VALIDATING → VALIDATED
        → PUBLISHING → PUBLISHED
```

`DUPLICATE`, `FAILED` y `BLOCKED` son terminales. No existe salto de validación,
reintento implícito ni transición desde un estado terminal. Un reintento exige
una nueva corrida y una reclamación idempotente gobernada. La evidencia terminal
conserva su outcome y el inspector impide renombrar un `FAILED` como `BLOCKED` o
viceversa.

Cada finalización requiere un `grh-pipeline-stage-receipt-v1` con identidad de
corrida/manifest, clave de idempotencia, etapa, resultado, digests de
entrada/salida/evidencia y una
referencia opaca cuando corresponda. Los receipts no contienen timestamps. Los
tiempos variables viven en `grh-pipeline-observation-v1` y no cambian la identidad
del receipt.

Un receipt sólo prueba que el caller presentó una forma coherente. El adapter
debe autenticar su productor, verificar los artefactos referenciados y persistir
receipt, cambio de estado y lock en una operación atómica. Nunca debe convertir
un `FAILED`, `BLOCKED` o `DUPLICATE` en promoción.

La cadena local de activaciones detecta inconsistencias accidentales y cambios
parciales dentro del state dir; no es una firma, un log inmutable ni una
atestación externa. Un actor que controle por completo host, código y estado
queda fuera de la garantía de O2A.

## Captura inmutable de ejecución O2A.1

`shared/immutable-file-capture.cjs` y el runner aplican una captura por descriptor
a la fuente, su manifiesto y el conjunto gobernado de procesadores:

1. apertura del original con flags restrictivos y descriptor propio;
2. `fstat` antes y después de copiar para verificar identidad, tipo y tamaño;
3. creación exclusiva de la copia privada con `wx` y modo `0600`;
4. hash sobre los bytes de la copia capturada;
5. entrega a los procesadores sólo de las copias dentro del workspace privado;
6. cierre de descriptores y limpieza aun ante error.

El hash que identifica una entrada corresponde así a los bytes que quedan
disponibles para el procesamiento, no a una segunda apertura posterior de la
ruta original. Esto reduce el riesgo TOCTOU; no promete inmutabilidad frente a
un kernel, runtime o host totalmente comprometido. La identidad externa del
host y del intérprete continúa siendo obligación del adapter futuro.

## Last-known-good y fallos

El last-known-good contiene target, referencia, bundle, fuente, corte, versiones,
digests de aprobación/procesador, clave de idempotencia y receipt de publicación.
Sólo `COMPLETE_PUBLISH` con entrada y salida iguales al bundle validado crea el
nuevo LKG. El invariant `PUBLISHED` vuelve a ligar todos esos campos a la corrida.

Las pruebas inyectan un fallo en cada estado activo y verifican que:

- el candidato no se marque publicado;
- el LKG previo permanezca idéntico;
- no aparezcan receipts de etapas futuras;
- el fallo tenga código estable y evidencia digest-only.

## Backup, restore y frescura

`evaluateRestoreEvidence` valida estructura, digests, línea temporal —incluido
inicio de restore posterior al snapshot—, target distinto del tenant y resultados
declarados de integridad, conteos, constraints, semántica y
proveniencia. Su resultado correcto es
`RESTORE_EVIDENCE_STRUCTURALLY_VALID` con `externallyVerified=false`. Las medidas
`snapshotLagAtReferenceMs` y `restoreExecutionMs` describen el receipt presentado;
no son RPO ni RTO certificados. La certificación exige objetos reales, identidad
del ejecutor, almacenamiento/KMS y restore conectado revisado.

La frescura queda `UNGOVERNED` salvo que el caller entregue una política con
estado aprobado y un digest exacto fijado por un canal externo confiable. El
`evidenceDigest` se recalcula sobre los campos deterministas. Aun así, un digest
hexadecimal o `approvalEvidenceDigest` no constituye una firma ni aprobación
institucional. No hay umbral/SLO vigente definido por este módulo.

## Obligaciones del adapter futuro

1. Calcular `processorBundleDigest` reproduciblemente antes de buscar duplicados.
2. Usar workspace temporal privado, permisos mínimos y limpieza verificable.
3. Implementar lock/unique key atómico y conservar receipts append-only.
4. Verificar hashes sobre objetos reales; nunca confiar en campos autoafirmados.
5. Activar sólo el bundle validado y conservar el LKG ante cualquier fallo.
6. Mantener raw/PII fuera de receipts, estados, métricas, logs y navegador.
7. Para operación conectada, usar exclusivamente las proyecciones seguras
   `grh-executive` y `grh-quality`; el contrato raw retirado no es un consumidor.
8. Definir alertas y objetivos sólo después de aprobación institucional y
   mediciones conectadas; no presentar este contrato como scheduler, backup o SLA.

El replay local debe ejecutarse en un host confiable y con un intérprete Python
absoluto aprobado. O2A registra pins y versiones efectivas, pero no autentica el
binario del intérprete. Automatización, CI o modo conectado requieren además
hash/distribución del runtime verificados externamente, SBOM, firma o atestación
de workload y un ancla externa para el ledger.

## Gate real local del 9 de agosto de 2026

El runner se ejecutó manualmente contra el backup canónico de 44.537.741 bytes
y SHA-256 `e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`,
con Node 24.15.0 y Python 3.11.9 fijados:

- primera corrida: `promoted` / `PUBLISHED` local en 105,5 segundos;
- segunda corrida idéntica: `duplicate` / `DUPLICATE` en 294 ms, sin reconstruir;
- un LKG, una versión y una activación; sus hashes permanecieron idénticos;
- el segundo intento agregó solamente un receipt de ejecución `DUPLICATE`;
- cero locks, `.pending`, `.tmp`, `.bak`, copias `.sql.gz` o workspaces residuales;
- bundle revalidado: 257 tablas, 6.573.057 filas, calidad 88,99,
  `contains_pii=false` y `personas_junin` sólo en exclusiones.

El state de evidencia se creó fuera del repositorio y de OneDrive. No se
materializó en `api/_data`, PostgreSQL ni un deployment. Su retención o limpieza
es una responsabilidad local del operador y no forma parte de una política de
backup. Este gate demuestra replay manual e idempotencia local; no demuestra
scheduler, extracción diaria, CDC, ACL certificadas, durabilidad ante corte,
restore, tenant conectado ni producción.

El hardening O2A.1 posterior se validó exclusivamente con fixtures. Su suite
focal, junto con la fundación O2A, cerró 54 pases y 1 smoke opt-in omitido. No
volvió a ejecutar el snapshot real de 44 MB y no generó nueva evidencia de DB,
API o deployment; la evidencia real O2A anterior se conserva sin reinterpretarla.

## Validación local focal

```powershell
node --check shared/grh-pipeline-foundation.cjs
node --check shared/immutable-file-capture.cjs
node --test tests/grh-pipeline-foundation.test.mjs tests/grh-pipeline-replay.test.mjs
```

La suite cubre manifest/idempotencia, scopes, calendario inválido,
anti-rollback/conflicto, secuencia completa, receipts, observaciones, duplicate,
fallos por etapa, restore estructural, frescura gobernada, captura por descriptor,
copias privadas, sustitución de ruta y limpieza.

## Historial documental

| Revisión | Fecha | Cambio |
|---|---|---|
| 1.6.0 | 2026-08-09 | Añade O2A.1: captura por descriptor, `fstat`, copias privadas `wx`/`0600` y límites ante host comprometido; sin nuevo replay real |
| 1.5.0 | 2026-08-09 | Registra la evidencia real local de promoción y duplicado O2A |
