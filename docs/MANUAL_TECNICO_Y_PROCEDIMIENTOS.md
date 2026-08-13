# Manual técnico y de procedimientos de MuniControl

**Versión:** 1.10.0

**Tipo:** documento vivo

**Última verificación contra el checkout local:** 2026-08-13
**Ámbito:** arquitectura, datos, desarrollo, operación y release

> Release público `v1.10.0` verificado; producto S13 en commit `d11fd39`. La
> sesión privada positiva y S13 privado conservan validación local sobre el
> snapshot aprobado.
> S14C permanece `Unreleased`: el schema preserva 13 tablas existentes de
> Preview —5 sensibles y 8 de referencia— sin delegates en ambos Prisma Client;
> el baseline v2 Prisma 5.22 es reproducible y pasó dos casos autoritativos en
> branches hijos efímeros. Preview y Production recibieron cero escrituras. No
> habilita DDL estable, cuenta, lifecycle ni release `v1.11.0`.
> `GET /api/grh-decision-brief` publica `grh-decision-brief-v1`, un brief único
> desde agregados del snapshot aprobado, con validación local. Separa la señal global cross-source de
> la mensual, expone `temporalQuarantineRows`, aplica k=10 y excluye PII,
> importes, códigos de fuente/celda y etiquetas/labels. Cada CTA exige su capability; un 503 no
> reintenta automáticamente y deja sólo reintento manual. Una celda actual `<10`
> hace fallar cerrado el Panel.
> MuniGuía incorpora el anchor real `#decisionBrief`.
>
> Para el release histórico `v1.10.0`, route policy `2026-08-09.2` y access
> policy `2026-08-09.1` cubrían 26 recursos, 12 acciones, 46 permisos y 79 firmas de ruta
> —37 Serverless + 42 Express—. El commit/tag de ese release apunta a
> `4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7`; el objeto del tag anotado es
> `07ac9eacf8bd89f27f5c437b99e713e8497b8934`. La GitHub Release
> `https://github.com/inguillen87/municipio-junin/releases/tag/v1.10.0` está live,
> no draft y no prerelease.
>
> Para `v1.10.0`, el deployment Production
> `dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` quedó `READY`,
> alias `https://municipio-junin.vercel.app`, con `gitSource master/4108ca0`. El
> gate productivo cerró 11/11 exit `0` con
> `checkedAt 2026-08-09T16:33:56.200Z`. El browser público cerró 10/10 estados a
> 390/1440 px: `/` y `/roles` visibles; `/dashboard`, `/inicio` y `/manuales`
> anónimos redirigen al login; 0 overflow, warnings/errores de consola, overlays,
> requests externos y fallas de red. Los logs del corte registraron 0 errores y
> 0 respuestas 500.
>
> El hotfix post-release `e74339c` reemplazó `/prisma/schema.prisma` por un 404
> seguro, `no-store`, `nosniff` y sin marcadores del schema. Production cerró el
> gate ampliado 12/12; el tag `v1.10.0` permanece en `4108ca0` con su 11/11
> histórico.
>
> Focal raíz S13 135/135; QA adversarial 104/104 con 0 P1/P2; suite raíz final de
> 591 pruebas —590 aprobadas, 0 fallidas y 1 smoke opt-in omitido—; backend 20/20.
> Este cierre no certifica DB/baseline, cuentas, MFA/lifecycle ni datos GRH
> remotos. Este commit documental post-release no mueve el tag `v1.10.0` de
> `4108ca0`.

> Como antecedente, estado post-release `v1.9.0`: commit/tag `f9d1f88`, product commit `ed76347`,
> deployment `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` `Ready` en `Production` y alias
> `https://municipio-junin.vercel.app`. `release:truth:check` cerró 10/10 exit `0`
> con `checkedAt 2026-08-09T14:42:10Z`. El browser público verificó `/login` y
> `/roles` —siete perfiles— a 390/1440 px sin overflow, errores de consola ni
> requests externos; `/dashboard`, `/inicio` y `/manuales` anónimos redirigieron
> al login. La GitHub Release
> `https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.

> MuniGuía privada `muniguia-contextual-v1` mantiene evidencia sólo local con proyección autoritativa
> simulada: focal 10/10, suite raíz 533 totales —532 aprobadas y 1 smoke opt-in
> omitido— y backend 20/20. No certifica autorización positiva, cuentas reales,
> DB o baseline restaurado, MFA/lifecycle persistido ni GRH remoto. Ese cierre
> documental post-release no movió el tag `v1.9.0` de `f9d1f88`.

### Tour público `v1.8.1`

`roles.html` implementa la ruta canónica `/roles` con el contrato visible
`public-role-tour-v1`. Es contenido estático y no autenticado para los siete roles
del enum vigente: no ejecuta fetch, no inicia sesión, no emite ni acepta JWT, no
lee o escribe storage, no autoriza acciones y no procesa credenciales, PII, APIs,
DB o datos municipales. Su única navegación operativa apunta a `/login`.

La ruta es demostración visual, no evidencia RBAC. El service worker público v5
puede cachearla con estrategia network-first y continúa excluyendo `/api`; esa
disponibilidad no modifica el contrato de seguridad ni acredita el deployment.

### MuniGuía contextual `1.9.0` — evidencia privada local

`js/contextual-help-catalog.js` define un catálogo local, congelado y
determinista; `js/contextual-help.js` monta la ayuda y
`css/contextual-help.css` resuelve presentación accesible. `js/nav.js` importa
esos assets sólo después de validar la proyección autoritativa en memoria, la
política, el rol, la variante, `navigation.help`, la capability de la superficie
y uno de doce pathnames privados exactos.

El resolver falla cerrado ante drift de política, rol, variante, capability o
ruta. El anchor nuevo `#decisionBrief` guía la lectura del brief S13. Selectors y anchors se verifican en CI; si el target no está visible, la
guía permanece disponible y omite sólo «Ubicar». No agrega requests de IA, GRH
u otras APIs ni accesos a storage, no lee indicadores, no crea permisos y no
reemplaza la autorización server-side o el enlace directo al Manual.

## 1. Propósito y regla de mantenimiento

Este manual es el punto de entrada para futuras personas de ingeniería y
operaciones. Explica qué ejecutar, qué no asumir y dónde está cada contrato.

Toda feature que cambie una API, variable, migración, fuente, procedimiento,
estado operativo o prueba debe actualizar este archivo en el mismo cambio. Si el
código y el manual difieren, prevalece temporalmente el código, se bloquea el
release y se corrige la documentación antes de cerrar la feature.

Reglas de verdad:

1. No presentar un resultado local como prueba remota.
2. No mostrar datos sintéticos como datos municipales.
3. No publicar dumps, PII, secretos ni artefactos GRH en Git o como assets web.
4. No inferir moneda, estado laboral, pago bancario ni tiempo real si la fuente no
   los demuestra.
5. Un `skip`, un mock o un fixture prueba el contrato local indicado; no certifica
   datos, credenciales ni proveedores externos.
6. No ejecutar comandos destructivos de Prisma o SQL contra una base municipal
   sin backup restaurado, revisión de drift y autorización de cambio.
7. GRH es la autoridad laboral. `personas_junin` permanece excluida de los
   pipelines, artefactos y consumidores GRH actuales; cualquier integración
   futura debe usar un pipeline auxiliar y una tabla puente versionada, nunca
   igualdad de `IDPERSONA` entre sistemas.

## 2. Arquitectura vigente

```text
                         navegador
                             │
                frontend HTML/CSS/JS estático
                             │
              ┌──────────────┴──────────────┐
              │                             │
       Vercel Serverless              Express opcional
          api/**/*.js                 backend/server.js
              │                             │
     Prisma raíz + pg              Prisma backend + pg
              └──────────────┬──────────────┘
                             │
                      PostgreSQL privado
                    usuarios / tenants / datos
                             │
                       grh_artifacts
                profile + grh-semantic-v2
                             │
        proyecciones minimizadas y exact-key
 grh-executive-v2 · grh-quality-v1 · grh-close-v1
```

### 2.1 Runtime primario: Serverless

- `vercel.json` publica el frontend estático y las funciones `api/**/*.js`.
- `/` se reescribe al clean URL `/login`, respaldado por `login.html`; `/inicio`,
  a `/inicio.html`; y
  `cleanUrls` resuelve `/dashboard` desde `dashboard.html`, sin rewrite propio ni
  `index.html`. El gate local E0.1 exige esa topología exacta; no prueba que ya
  esté publicada.
- El código Serverless usa `api/lib/db.js`, que importa el cliente Prisma raíz.
- Las APIs protegidas verifican JWT y vuelven a consultar usuario, rol, tenant y
  estado actual en PostgreSQL. El frontend no autoriza operaciones.
- `shared/route-policy.cjs` actúa como techo de autorización exacto por
  runtime, método, ruta y permiso `recurso:acción`. Una ruta, método, rol,
  capacidad o secreto interno no registrado se deniega.
- La versión local `2026-08-13.10` del manifiesto contiene 31 recursos, 12
  acciones, 53 permisos y 92 firmas de ruta protegidas: 50 Serverless y 42
  Express. Es un techo ejecutable exacto, no persistencia RBAC/ABAC por área.
- `.vercelignore` excluye backend, evidencia, scripts, SQL, tests, documentos y
  artefactos JSON privados. `api/**` y `prisma/**` permanecen desplegables.

### 2.2 Runtime opcional: Express

- `backend/server.js` es una API independiente; no sirve el checkout, uploads ni
  artefactos analíticos como archivos estáticos.
- Expone liveness en `GET /api/health` y readiness real de PostgreSQL en
  `GET /api/readiness`.
- Las superficies legacy `contratos`, `empleados`, `reclamos` y `archivos`
  responden `410 TENANT_DATASET_REQUIRED` después de autenticar, porque todavía
  no tienen aislamiento multi-tenant propio en Express.
- Express consume el mismo manifiesto de rutas y permisos que Serverless; no
  utiliza jerarquía de roles ni herencia implícita para ampliar accesos.
- El backend Express queda fuera del bundle Vercel por `.vercelignore`. Sus rutas
  sólo existen donde ese proceso se despliegue por separado.

### 2.3 Inicio seguro y proyección de acceso

`shared/access-policy.cjs` versión `2026-08-11.3` reconoce siete roles exactos y
la capability `navigation.workspace`. `api/auth/login.js`, `api/auth/me.js` y el
router Express calculan desde el usuario autoritativo y emiten dentro de `user`:

```text
capabilities: string[]
accessPolicyVersion: "2026-08-11.3"
homeProfile: {
  variant,
  defaultPath: "inicio.html",
  priorityCapabilities: string[]
}
```

`homeProfile` no admite campos adicionales. La prioridad es una intersección de
la política del rol y las capabilities contextuales; siempre incluye
`navigation.workspace`. `inicio.html` espera la respuesta autoritativa de
`/api/auth/me`, falla cerrado ante versión, rol, capability o perfil desconocido
y renderiza sólo prioridades permitidas. Esa portada no llama endpoints GRH ni
otros datasets; el Panel ejecutivo GRH vive por separado en `dashboard.html`.

Para un `SUPER_ADMIN` sin tenant, `getSessionAccessForUser` reduce el resultado
a `session.read`, `navigation.workspace` y `navigation.help`; su prioridad queda
sólo en workspace. No existe bypass para cargar GRH. Los controles de navegador
son una proyección UX: las APIs continúan siendo la frontera de autorización.

Las siete variantes exactas son `platform-governance`,
`municipal-operations`, `executive-leadership`, `financial-control`,
`municipal-limited`, `territorial-unassigned` y `controlled-preview`. Definirlas
no aprovisiona cuentas ni aplica la propuesta RBAC/ABAC persistida.

UX-E2A añade `css/institutional-shell.css` como capa namespaced y compartida por
las 29 páginas raíz que cargan navegación. La navegación desktop y el rail móvil
se proyectan desde las capabilities válidas, restauran foco, respetan movimiento
reducido y forced colors, y eliminan offsets al imprimir. Este shell es una
frontera de presentación: no decide autorización ni amplía permisos de API.

### 2.4 Dos familias de tablas

- Los modelos de `prisma/schema.prisma` tienen tenant explícito para usuarios y
  dominios municipales principales.
- Las tablas analíticas de `migrations/001_data_intelligence.sql` son legacy y no
  tienen `tenant_id`. Sólo pueden usarse ligadas al CUID configurado en
  `LEGACY_ANALYTICS_TENANT_ID`.
- `migrations/002_grh_artifacts.sql` crea `grh_artifacts`, que sí es privada y
  tenant-bound.

## 3. Fuentes y gobierno de datos

### 3.1 Fuente canónica de personal

La fuente canónica es el backup privado:

`grh_junin.backup_2026080615_plataforma.sql.gz`

Su corte es histórico. El nombre del archivo indica el snapshot recibido; no
implica sincronización posterior ni conexión diaria.

### 3.2 Fuente auxiliar y frontera de integración

`personas_junin.backup_2026080615_plataforma.sql.gz` es un padrón transversal de
identidad, domicilios y territorio. No reemplaza a GRH ni decide relaciones
laborales. Su respaldo de 7.550.947 bytes, SHA-256
`11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c` y corte
2026-08-06 fue perfilado de forma read-only en un diagnóstico aislado.

La fuente permanece excluida de los comandos, manifiesto, artefactos, APIs,
tableros y publicaciones GRH actuales. No debe usarse para “completar” faltantes
ni unirse por `IDPERSONA`: ese campo pertenece a espacios de identidad distintos
en cada sistema.

El diagnóstico reprodujo 1.432 candidatos automáticos por CUIL válido y único,
267 candidatos asistidos, 157 casos ambiguos y 493 sin coincidencia. Los 1.699
candidatos totales no constituyen un crosswalk productivo. Su eventual promoción
requiere manifiesto propio, staging inmutable, algoritmo versionado, evidencia,
revisión y una migración privada auditada. El contrato está en
[`GRH_PERSONAS_INTEGRATION_BLUEPRINT.md`](GRH_PERSONAS_INTEGRATION_BLUEPRINT.md).

La exclusión está codificada en:

- `scripts/profile_grh.py`;
- `scripts/build_grh_semantic.py`;
- `api/grh-data.js`;
- `api/grh-executive.js` y `api/grh-quality.js`;
- `scripts/publish_grh_artifacts.mjs`;
- el contrato de pruebas Python y Node.

### 3.3 Límites semánticos

- `grh-semantic-v2` incorpora `distinct_participants_by_year` en ausencia,
  licencia y movimientos. La cardinalidad usa `CODI_01 + LEGA_12` durante la
  agregación, pero no serializa ninguna clave, conjunto, legajo ni empresa.
- Los contratos fuente son agregados y no contienen nombres, DNI, domicilios,
  teléfonos ni identificadores de empleado. Esto no basta para anonimizar
  categorías pequeñas, que se protegen en una proyección posterior.
- La moneda no está declarada por GRH. Las vistas deben usar unidad de fuente o
  `u.m.`, no ARS ni `$`.
- La dotación ejecutiva representa participación en control de cálculo del último
  período válido; no es un padrón contractual de “personal activo”.
- `calculo` alimenta los controles ejecutivos. `totpago` permanece como diagnóstico
  porque la conciliación cruzada tiene diferencias materiales.
- El contrato es snapshot, no tiempo real.

La definición campo por campo vive en `docs/data/grh-semantic.md`.
Los umbrales, la supresión complementaria y el procedimiento de publicación
viven en `docs/GRH_PRIVACY_AGGREGATION_POLICY.md`.

## 4. Contratos GRH privados

La cadena actual es:

```text
dump GRH privado
  → perfil agregado
  → contrato agregado grh-semantic-v2
  → validación automática del contrato semántico y controles del perfil
  → publicación transaccional en grh_artifacts
  → lectura backend del bundle profile + semantic
  ├→ GET /api/grh-executive → grh-executive-v2 (k=5/k=10)
  ├→ GET /api/grh-quality   → grh-quality-v1
  ├→ GET /api/grh-close     → grh-close-v1 (mensual, k=10)
  ├→ GET /api/grh-decision-brief → grh-decision-brief-v1 (brief, k=10)
  ├→ reportes / PDF          → proyección portable k=10 en servidor
  ├→ bot close_explanation   → grh-close-v1 para un YYYY-MM liberado
  └→ GET /api/grh-data      → auth + tenant → 410, sin leer artefactos
```

### 4.1 Contratos

| Contrato | Contenido | Destino permitido |
|---|---|---|
| `profile` | esquema y conteos de 22 tablas de foco, más agregados de perfilado; no es el inventario total | Backend y validación de linaje; no es contrato de navegador objetivo |
| `grh-semantic-v2` | KPIs gobernados, períodos, calidad, cuarentena, conciliación y participantes distintos por año sin claves exportadas | Backend y construcción de proyecciones; no es contrato de navegador objetivo |
| `grh-executive-v2` | Participación, rankings protegidos, control de cálculo y series sensibles minimizadas | Navegador interactivo o generación portable según audiencia |
| `grh-quality-v1` | Linaje, inventario, calidad, temporalidad, integridad y conciliación sin etiquetas, códigos ni series monetarias | Centro de Calidad y revisión técnica |
| `grh-close-v1` | Componentes y controles de cálculo más conciliación del período exacto; comparación sólo entre meses consecutivos liberados k≥10 | Hacienda y Contaduría, como cierre analítico no vinculante |
| `grh-decision-brief-v1` | Situación, cambio, prioridades y límites agregados; separa señal global de evidencia mensual, incluye `temporalQuarantineRows` y excluye PII, importes, códigos de fuente/celda y labels | Panel Ejecutivo; CTA local sólo con capability exacta |

La tabla `grh_artifacts` conserva tenant, tipo de artefacto, versión de esquema,
fecha de snapshot, SHA-256, JSON, estado activo y fecha de actualización.

`api/lib/grh-contract.js` valida ambos artefactos fuente. Para `profile` aplica una lista
permitida de claves, estructuras y etiquetas agregadas, comprueba conteos e
identidades, exige los flags de privacidad y rechaza campos o agregados
inesperados. Para `semantic` valida procedencia, privacidad, calidad, series,
cuarentena, conciliación y sus identidades. La automatización reduce el riesgo,
`grh-semantic-v1` falla cerrado porque agregar cardinalidades cambia el contrato
exact-key. `api/lib/grh-executive-contract.js` y
`api/lib/grh-quality-contract.js` y `api/lib/grh-close-contract.js` validan luego las salidas minimizadas y
rechazan claves, identidades o formas inesperadas. La revisión humana y las
pruebas de privacidad siguen siendo parte del gate;
una publicación exitosa no sustituye la evaluación del pipeline que la generó.

### 4.2 Acceso

`GET /api/grh-executive`, `GET /api/grh-quality`, `GET /api/grh-close` y
`GET /api/grh-decision-brief` exigen:

- rol `SUPER_ADMIN`, `TENANT_ADMIN`, `INTENDENTE` o `CONTADOR`;
- JWT válido y usuario vigente en DB;
- tenant `ACTIVE`, o `TRIAL` con `trialEndsAt` válido y estrictamente futuro;
- binding con el CUID real de `GRH_TENANT_ID`.

Los cuatro endpoints son `GET`-only, responden con `Cache-Control: no-store`, validan
el contrato exacto antes de publicar y devuelven un 503 sin detalles si el
bundle o la proyección no concilian. Ninguno devuelve los objetos `profile` o
`semantic`.

Toda lectura DB pasa por `readGrhArtifactBundle`: carga las dos filas activas
`profile` + `semantic` del tenant en una consulta, sin caché de payload, y exige
`GRH_SOURCE_SHA256`. Antes de construir una proyección valida versión,
snapshot y SHA de metadata DB contra cada payload; identidad de archivo, SHA,
tamaño, snapshot, sistema y exclusiones entre ambos; los 22 conteos focales contra
el diccionario completo; y coincidencia con el pin aprobado. Par incompleto,
metadata/foco divergentes o pin ausente, mal formado o distinto fallan cerrados.

El fallback local sólo se permite sin lectura DB, con `NODE_ENV` distinto de
`production` y `ALLOW_LOCAL_GRH_ARTIFACTS=true`. Lee `profile`, `semantic` y
`config/grh-source-manifest.json`, valida el bundle contra el manifiesto y, si se
configuró `GRH_SOURCE_SHA256`, también exige su coincidencia. Un bundle DB inválido
nunca degrada a archivos locales. Cualquier falla responde `503` desde las APIs
consumidoras, sin fallback sintético.

`GET /api/grh-data` conserva autenticación, autorización exacta y binding con
`GRH_TENANT_ID`, pero después responde siempre
`410 GRH_RAW_CONTRACT_RETIRED`. No llama `readGrhArtifactBundle` ni devuelve
`profile`/`semantic`. Los cinco UIs ejecutivos tienen cero referencias a esa ruta
y consumen `/api/grh-executive` + `/api/grh-quality`; Reportes, PDF y Asistente
leen el bundle sólo dentro del servidor y proyectan k=10 antes de responder. La
frontera raw está cerrada localmente, no certificada en un deployment.

### 4.3 Cierre mensual explicado GRH

`api/grh-close.js` publica `grh-close-v1` sólo después de revalidar capacidad,
tenant, pin del bundle y contrato exacto. `api/lib/grh-close-projection.js`
combina `payroll.calculation_control_series` con
`payroll.cross_source_reconciliation.period_series` por la misma clave
`YYYY-MM`; una conciliación global nunca se atribuye a meses individuales.

La salida conserva únicamente:

- componentes agregados contributivos, no contributivos, asignaciones
  familiares, retenciones, neto, neto a pagar y contribuciones patronales;
- identidades, diferencias y tolerancia de control de cálculo;
- corridas, cobertura, tasa exacta, acuerdo de valores y variación absoluta del
  período exacto;
- fuente, corte, contrato, umbral y límites de interpretación.

La comparación se habilita exclusivamente entre meses calendario consecutivos
cuando ambas celdas están liberadas con k≥10. Una celda protegida usa
`null`, nunca cero. No se exportan PII, filas raw, etiquetas categóricas ni
códigos de celda. La moneda permanece no declarada y
`arithmetic_decomposition_not_causal_explanation` impide describir el cambio
como causalidad. El contrato no prueba pago, presupuesto, asiento contable,
acreditación bancaria ni tiempo real.

Hacienda consume este endpoint mediante `js/grh-close-data.js`, valida exact-key
y falla cerrada. GRH Ejecutivo dejó de repetir la tasa global de conciliación
en cada mes; el resumen global sólo conserva su alcance global. Todo este cierre
es local y aún requiere materialización y smokes del deployment.

`api/ai-analyze.js` reutiliza la misma lectura privada para construir
`grh-close-v1` dentro del intent determinista `close_explanation`, visible como
“Cierre explicado”. Acepta un único período `YYYY-MM` liberado k≥10 y responde
con sus componentes, control y conciliación mensual; no consulta el score global.
Un año sin mes, período ausente o protegido devuelve 422 sin sustituirlo. No
expone PII ni afirma moneda, pago o causalidad. El focal Bot + E2E fue 13/13,
local y sin deployment.

#### 4.3.1 Brief ejecutivo decisional S13

`api/grh-decision-brief.js` construye `grh-decision-brief-v1` desde las
proyecciones ejecutiva, de calidad y de cierre ya validadas. La prioridad
`cross_source_material_difference` depende sólo del estado global de calidad;
`situation` y `change` usan el período mensual gobernado. El brief no exporta
métricas globales: el Panel las obtiene por separado desde `grh-quality-v1`.

El contrato exact-key conserva `temporalQuarantineRows`, fuente/corte, k=10,
estado, situación, cambio, prioridades allowlisted y límites. Marca como falsos
PII, identificadores, filas, labels, códigos de fuente/celda e importes exportados;
los códigos enum allowlisted de prioridad sí forman parte del contrato. Las únicas CTA
posibles apuntan a `hacienda.html` con `navigation.hacienda` o `control.html` con
`navigation.data-quality`; la prioridad sigue visible si falta la capability,
pero el enlace no se crea.

La API responde un 503 saneado ante bundle, pin, proyección o contrato inválidos.
El cliente no reintenta automáticamente ni conserva fallback; el Panel ofrece una
acción explícita de reintento manual. Aunque el contrato puede representar el mes actual como
`<10`, el Panel integral exige la celda liberada y oculta toda la vista si no
alcanza k=10. MuniGuía guía esta lectura mediante `#decisionBrief` sin nuevas
requests GRH.

### 4.4 Centro de Calidad y Linaje GRH

La superficie local está en `control.html` y su controlador en
`js/grh-control.js`. El enlace de navegación usa la capacidad
`navigation.data-quality`. `GET /api/grh-quality` ya construye y valida
`grh-quality-v1`, una salida sin etiquetas categóricas, códigos de celda, series
monetarias, filas crudas o identificadores de empleado.

`js/grh-control.js` consume localmente `/api/grh-quality` y valida
`grh-quality-v1` antes de renderizar. Esa evidencia no certifica por sí sola un
deployment; el cierre raw local se demuestra además con cinco UIs sin referencias
fuente y el endpoint retirado en 410.

La vista publica únicamente metadatos agregados:

- inventario completo desde `semantic.table_dictionary`: 257 tablas, 147 con
  filas, 110 vacías y 6.573.057 filas;
- `profile.row_counts` limitado a 22 tablas de foco y 4.908.280 filas. Esa suma
  no representa el total; cada conteo focal debe coincidir con la tabla homónima
  del diccionario completo o la vista falla cerrada;
- score 88,99/100 limitado al extracto agregado gobernado, no a todas las tablas
  crudas: validez temporal 99,44 con peso 30 %, integridad referencial 99,97 con
  peso 30 %, conciliación de nómina 63,88 con peso 30 % y unicidad de legajo 100
  con peso 10 %;
- 20.534 filas en cuarentena temporal; los motivos pueden solaparse y el
  desacuerdo fecha-mes es diagnóstico, no causa de cuarentena por sí solo;
- integridad de joins basada en filas de hechos emparejadas/huérfanas, separada
  de cobertura basada en claves de legajo válidas y distintas contra el maestro;
  ninguna de las dos equivale a planta activa;
- conciliación cross-source descompuesta en score 63,8825 %, cobertura de
  corridas 97,8405 %, tasa exacta de métricas 74,7708 % y acuerdo de valores
  19,0362 %. Cobertura no equivale a conciliación y `totpago` es diagnóstico, no
  evidencia de pago;
- registro de riesgos y cola de acciones para snapshot histórico, moneda no
  declarada, PII existente sólo en la fuente privada, errores legacy,
  cuarentena, diferencias materiales, nueve períodos anómalos de cálculo y una
  etiqueta de encoding sospechosa.

La página no debe insertar PII, categorías o identificadores de
empleados en el DOM, no inferir moneda, no declarar tiempo real y no certificar
liquidación o pago bancario. Una violación de linaje, privacidad, inventario o
score activa falla cerrada. La captura de red debe confirmar que recibe
exclusivamente `grh-quality-v1`; la validación local no acredita un deployment
ni un smoke por rol.

### 4.5 Centro de Reportes GRH

`api/reports.js` implementa un endpoint `GET`-only y `reportes.html` su consumidor
autenticado. Antes de leer datos, el handler exige la capacidad exacta
`grh.report:read` (`RESOURCES.GRH_REPORT` + `ACTIONS.READ`) y verifica que el
caller pertenezca al CUID configurado en `GRH_TENANT_ID`. Los grants locales
vigentes corresponden a `SUPER_ADMIN`, `TENANT_ADMIN`, `INTENDENTE` y `CONTADOR`;
el enlace del frontend no sustituye esta autorización server-side.

El endpoint llama `readGrhArtifactBundle`, por lo que exige el par activo completo
y todas las validaciones descritas en 4.2. El backend local construye las vistas
portable `grh-executive-v2` y `grh-quality-v1`, aplica k=10 y produce
`grh-executive-report-v2`. El reporte publica el `approvedSha256`, las versiones
de los contratos y la política; no exporta los payloads fuente ni PII. No abre SQL
directamente, no consulta `datasets`/`data_points`, no escribe y no usa otra base
como fallback. Sólo los períodos monetarios liberados por la política integran
`availablePeriods`; uno inválido responde 400 y uno ausente responde 404, sin
sustitución.

La respuesta allowlisted alimenta cuatro SVG locales y accesibles:

- evolución de participantes distintos en cálculos válidos, hasta 12 períodos;
- distribución sectorial con categorías pequeñas agrupadas antes del top-N;
- componentes del control de cálculo;
- score y componentes de calidad del extracto agregado.

La procedencia declara `grh-executive-portable`, snapshot histórico,
`realtime=false`, `aggregateOnly=true`, `containsPii=false`, k=10,
`excludedSources=['personas_junin']`, `approvedSha256` y las versiones de
esquema/política. Los importes liberados permanecen en
`source_currency_cents`, con moneda no declarada; el control de cálculo no
acredita pago bancario y `totpago` es diagnóstico. Si el bundle falta, está
incompleto, diverge o no coincide con el pin, la API responde 503
`GRH_REPORT_CONTRACT_UNAVAILABLE`. `reportes.html` valida localmente
`grh-executive-report-v2`, vacía los contenedores ante falla y no consulta la
ruta raw. Esto no está desplegado ni certificado en remoto.

## 5. Estructura del repositorio

| Ruta | Responsabilidad |
|---|---|
| `api/` | funciones Serverless y helpers de autenticación, DB y contratos |
| `backend/` | runtime Express opcional, cliente Prisma propio y tests CommonJS |
| `prisma/schema.prisma` | esquema canónico y dos generadores de cliente |
| `migrations/` | SQL analítico y materialización privada GRH; no es historia Prisma automática |
| `database/migrations/` | esquema SQL legacy de referencia; no crea usuarios |
| `scripts/profile_grh.py` | perfil agregado del dump canónico |
| `scripts/build_grh_semantic.py` | genera `grh-semantic-v2` y cardinalidades anuales sin exportar claves |
| `scripts/publish_grh_artifacts.mjs` | publicación transaccional de contratos privados |
| `api/grh-executive.js` + `api/lib/grh-executive-*` | proyección interactiva/portable `grh-executive-v2` con privacidad de celdas pequeñas |
| `api/grh-quality.js` + `api/lib/grh-quality-*` | proyección minimizada `grh-quality-v1` para calidad y linaje |
| `api/grh-close.js` + `api/lib/grh-close-*` | cierre mensual `grh-close-v1`, exact-key, tenant-bound, no-store y k=10 |
| `api/grh-directory.js` + `api/lib/grh-directory-*` | directorio nominal privado `grh-directory-v3`, tenant-bound, exact-key, auditado y con equivalencia PostgreSQL/snapshot cifrado; agrega situación laboral informada y señal de participación en cálculo de referencia |
| `migrations/003_grh_directory.sql` + `migrations/004_grh_directory_v2.sql` + `migrations/005_grh_directory_v3.sql` | cadena aditiva privada: base v1, centro de costo/cronologías v2 y hechos laborales/catálogos/digest determinista v3; `005` no fue aplicada a una DB remota en este corte |
| `js/grh-close-data.js` + `hacienda.html` | cliente gobernado y cierre mensual explicado; conciliación real por período |
| `js/grh-secure-data.js` | cliente y validadores exact-key usados por Panel, GRH, Calidad, RRHH y Hacienda; cero referencias a la ruta raw |
| `control.html` + `js/grh-control.js` | Centro de Calidad migrado localmente a `grh-quality-v1`; falta certificación remota |
| `api/reports.js` + `reportes.html` | informe portable `grh-executive-report-v2` alineado localmente; sin certificación remota |
| `api/reports.js`, `api/pdf-report.js`, `api/ai-analyze.js` | consumidores server-side del bundle; construyen proyección portable k=10 antes de responder |
| `shared/route-policy.cjs` | techo exacto de autorización por recurso, acción, runtime, método y ruta |
| `shared/immutable-file-capture.cjs` | captura por descriptor y copia privada exclusiva (`wx`, `0600`) para O2A.1 |
| `tests/` | tests Python, Node y Playwright de Serverless/frontend |
| `backend/tests/` | autorización, readiness y retiro de superficies Express |
| `prisma/proposals/rbac-abac-v1.prisma` | propuesta aislada y no migrada del plano RBAC/ABAC |
| `docs/data/` | definición de contratos; los JSON reales están ignorados |
| `tenants/` | configuración declarativa/template; no reemplaza registros `Tenant` de PostgreSQL |
| `infra/` | borrador on-premise no certificado; no usar como runbook productivo actual |

Los HTML de raíz son superficies de frontend estático. `js/nav.js` centraliza la
navegación y `js/auth-fetch.js` el acceso autenticado desde navegador.

`grh-directory-v3` deriva `reportedStatus` exclusivamente de las fechas de
ingreso/egreso informadas en `legajo` y conserva `asOf` +
`basis=legajo_reported_dates`; no certifica vigencia contractual. Expone como
dimensiones gobernadas el régimen de contratación (`regcontr`) y la situación
de revista (`revista`); el motivo de baja sólo se publica con etiqueta válida y
un egreso informado. `referencePayrollParticipation` usa el período gobernado
`2026-07` y separa `observed`/`rowCount` de la situación laboral: es presencia de
filas en `calculo`, no evidencia bancaria, recibo o pago. El catálogo filtra por
`reportedStatus`, `contractRegime` y `serviceSituation` bajo el mismo scope de
autorización que la lista nominal.

## 6. Preparación local

### 6.1 Requisitos

- Node.js `>=22.12.0 <25`; baseline local validado `24.15.0` en `.nvmrc`;
- npm;
- Python `>=3.10`; baseline local validado `3.11.9` en `.python-version`;
- PostgreSQL sólo para rutas que consultan o escriben DB;
- navegador compatible con Playwright para las pruebas E2E.

No existe un script raíz `dev` que levante a la vez frontend y Serverless. Las
pruebas E2E incluyen su propio harness HTTP. Para emular Vercel debe usarse el
runtime autorizado del entorno; no asumir que un servidor estático ejecuta
`api/**/*.js`.

### 6.2 Instalación reproducible

Desde la raíz, en PowerShell:

```powershell
npm.cmd run preflight:runtimes
npm.cmd ci
npm.cmd --prefix backend ci
npm.cmd run db:generate
npm.cmd --prefix backend run db:generate
```

Los dos últimos comandos generan clientes distintos desde el mismo esquema.
No requieren copiar `schema.prisma` dentro de `backend`.

### 6.3 Variables locales

Use un entorno local ignorado por Git. `backend/.env.example` es un ejemplo
parcial y puede quedar desalineado respecto del código; no es el inventario
autoritativo ni un archivo para completar con valores reales dentro del
repositorio. Hasta sincronizarlo, contrastar la tabla de la sección 8 con los
consumidores reales de cada runtime y fallar cerrado ante una variable faltante.

Para Express:

```powershell
Set-Location backend
npm.cmd run dev
```

El proceso escucha en `PORT` o, si no se define, en `3001`. Sin DB accesible,
`/api/health` puede seguir vivo pero `/api/readiness` debe responder `503`.

## 7. Prisma con doble cliente

`prisma/schema.prisma` contiene dos generadores:

- `client`: cliente raíz en `node_modules/@prisma/client`, usado por
  `api/lib/db.js`;
- `backendClient`: cliente independiente en `backend/generated/prisma`, usado por
  `backend/lib/prisma.js`.

S14C representa además 13 tablas ya existentes de Preview con `@@map` +
`@@ignore`: 5 sensibles y 8 de referencia. El contrato
`prisma-schema-ownership-v1` fija `clientAccess:disabled`,
`migratePreserved:true` y la proyección
`588d171e79b7c7841a01b8850302dee2fdbe98a9923677cb68563ece31ddedf8`.
Los dos clientes generados omiten esos models/delegates; Migrate conserva las
tablas. `@@ignore` no crea una ACL: `$queryRaw` o un rol DB sobredimensionado
todavía pueden leerlas. Antes de cuentas o datos GRH conectados, el rol runtime
debe probar cero grants sobre las 13 tablas o un lector explícito, mínimo,
tenant-bound y auditado.

Comandos desde la raíz:

```powershell
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:baseline:manifest:check
npm.cmd run db:baseline:status
npm.cmd run db:migrate:status
```

Comandos del backend desde la raíz:

```powershell
npm.cmd --prefix backend run db:validate
npm.cmd --prefix backend run db:generate
npm.cmd --prefix backend run db:status
```

`DATABASE_URL` es la conexión de runtime y `DIRECT_URL` la conexión directa para
migraciones. Los comandos de estado/migración requieren que ambas correspondan
al entorno revisado. Toda conexión remota debe declarar exactamente
`sslmode=verify-full`; sólo un host loopback puede omitir TLS cuando
`NODE_ENV=development`. Una URL remota ausente, `disable`, `require` o
`no-verify` falla cerrada antes de abrir el pool.

### 7.1 Gate de migración

- `npm.cmd run db:migrate:deploy` y
  `npm.cmd --prefix backend run db:migrate` ejecutan primero
  `scripts/assert-prisma-migrations.mjs --release`. Hoy ese modo siempre termina
  con `RELEASE_ATTESTATION_NOT_GOVERNED`, por lo que no llega a
  `prisma migrate deploy`. El modo `--offline` tampoco habilita un deploy.
- El gate exige lock, manifest canónico, hashes exhaustivos, pins de baseline y
  set de migraciones, además de un receipt conectado reciente, externo al
  checkout, pineado por SHA-256, ligado al target, backup, restore y dos revisores.
- El receipt prueba integridad y forma de evidencia de preflight; no autoriza DDL
  ni demuestra ausencia eterna de drift. Falta una atestación institucional
  firmada por CI/KMS/OIDC, con identidad de workload y protección anti-replay.
- **Estado de este checkout:** existe el baseline v2
  `20260809220336_baseline`, reproducible con Prisma exacto `5.22.0`. El modo
  offline termina verde sólo con `PRISMA_BASELINE_ID` y
  `PRISMA_MIGRATION_SET_ID` iguales al manifest; esto no habilita deploy. El modo
  `--release` continúa en código 1 con `RELEASE_ATTESTATION_NOT_GOVERNED` antes
  de `prisma migrate deploy`.
- Los archivos de `migrations/*.sql` no forman automáticamente una historia
  `prisma/migrations`; no afirmar que el comando Prisma aplicó esos SQL.
- Antes de migrar: identificar base y branch, revisar drift, revisar SQL, probar
  backup/restauración y obtener autorización.
- Nunca ejecutar `prisma db push`, `prisma migrate reset` ni `migrate dev` contra
  una base municipal compartida o productiva.
- El procedimiento completo, contrato del manifest, receipt, restore y rollback
  está en [`PRISMA_BASELINE_Y_DRIFT.md`](PRISMA_BASELINE_Y_DRIFT.md).

El manifest S14C contract v2 fija:

- `baselineId`:
  `prisma-baseline-7c5f5aac9da1e72c6d2750110fba03944bdde6a6cb285f0d945ff84ce7be9fbb`;
- `migrationSetId`:
  `prisma-set-075152dc94eadb7865ed91e952e17ef20cf0e21c5e91b5720277eb08c7b466be`;
- schema SHA-256:
  `1953c275cec5415a0508d77dcd433f65a7124bcc5c22c6ac7c52c61ccd9afb4d`;
- baseline SQL SHA-256:
  `a72524f69dc130209ae82d4b9bc736b76847b8a4f1536b4f05aaef41f4540dbd`;
- política `prisma-baseline-additive-v1`: 82 sentencias —3 `CREATE TYPE`,
  25 `CREATE TABLE`, 25 `CREATE INDEX` y 29 FK—, sin DML, `DROP` ni
  `_prisma_migrations`.

WP0-L agrega `npm.cmd run db:baseline:inspect`. Su modo `--check-config` valida
localmente argumentos, URL, target, output y estado Git sin conectarse. El modo
`--connected` sólo puede ejecutarse sobre una copia restaurada descartable y
autorizada con marcadores persistentes de DB; abre una transacción
`REPEATABLE READ READ ONLY` y consulta catálogos y `_prisma_migrations`. Si la
observación completa los controles, persiste tanto `valid` como `absent`, `empty`
o `inconsistent` y ejecuta `COMMIT`; los tres últimos estados quedan
`discovery_non_approvable`. Ejecuta `ROLLBACK` sólo ante un fallo o una violación
del contrato, no por el estado semántico no aprobable de la historia. La
observación no se convierte en aprobación aunque complete los controles. S14B sí lo ejecutó
conectado sobre un restore descartable: existe un artefacto de descubrimiento,
pero no baseline real, aprobación de drift ni autorización de migración.

#### Antecedente S14A — contrato local y configuración

S14A cierra sólo `wp0_restored_copy_observation` v2 con fixtures y adapters
inyectados. La historia distingue `absent`, `empty`, `inconsistent` y `valid`:
los tres primeros estados se persisten como `discovery_non_approvable`; `valid`
usa `strict`; todos mantienen `approvalEligible:false`. El catálogo se ordena
canónicamente y persiste `definitionSha256`, no SQL crudo. Aplica límites
fail-closed, sin truncado, de 20.000 filas, 1 KiB por campo distinto de la
definición, 256 KiB por definición y 4 MiB acumulados. El contrato detallado y
sus límites adicionales están en el runbook Prisma `1.3.0`.

La auditoría runtime de S14A usó fingerprints no reversibles y no expuso URLs ni
credenciales. En aquel corte Preview y Production resolvieron al mismo destino
lógico: `DB_CONFIG_ISOLATION=FAIL`; la configuración observada dio
`DB_CONFIG_SSLMODE_VERIFY_FULL=false` y el mapping quedó
`NEON_MAPPING=UNKNOWN`. Ese NO-GO es antecedente y fue resuelto por S14B; S14A no
produjo bump, tag, GitHub Release o `v1.11.0`.

#### Evidencia S14B — aislamiento y descubrimiento conectado

La reauditoría de configuración cerró `DB_CONFIG_ISOLATION=PASS`,
`DB_CONFIG_SSLMODE_VERIFY_FULL=true` y `NEON_MAPPING=IDENTIFIED`: Preview y
Production quedaron mapeados a branches DB distintos y las conexiones remotas de
runtime/migración exigen exactamente `sslmode=verify-full`. Esto acredita los
targets DB observados, no una sesión positiva ni datos privados certificados.

El control plane confirmó por separado que `snap-autumn-shape-ac7473wo` provenía
de main y que `br-flat-waterfall-acylyfjv` era su restore descartable. WP0 se
ejecutó desde `38b25e80e8413cc8688f393de2930e77098eb3f4` con un observador sin
privilegios elevados ni membresías, una transacción `REPEATABLE READ READ ONLY` y
el socket cliente autorizado en `TLSv1.3`. El inventario canónico registró 968
filas; `_prisma_migrations` resultó `absent`, por lo que la colección quedó
`discovery_non_approvable` y `approvalEligible:false`.

El artefacto externo
`wp0-observation-48054484dbcd80ffbaa46a197a97ccfb3a8a1a97223e868dc1e755d010d8ada4`,
SHA-256
`64b1571c36adafe6d6b65b11c3fd109131e7e7bcff84c4cd060dfbdea82573a1`,
mantiene `externalReferencesVerified:false`,
`backupRestoreRelationVerified:false`, `reviewerIndependenceVerified:false` y
`signedProviderReceiptVerified:false`. La auditoría del control plane es evidencia
externa separada: no muta esos flags ni convierte WP0 en approval, receipt de
release, baseline, migración, drift aprobado o autorización DDL. La validación del
socket tampoco cambia `certificateChainAttested:false` ni
`directEndpointAttested:false`.

Durante la operación una salida administrativa expuso una credencial owner. Se
rotó la credencial, se verificó la invalidación del valor anterior y no se
reproduce el secreto. El cleanup posterior confirmó restore y snapshot ausentes,
main y Preview `ready`, el directorio temporal ausente y el artefacto externo
retenido fuera del checkout.

S14B cerró 619 pruebas raíz —618 aprobadas, 0 fallidas y 1 smoke opt-in omitido—
y backend 20/20. En aquel cierre `Unreleased`, `v1.10.0` conservó su evidencia
pública histórica 11/11 y no existían bump, tag, GitHub Release `v1.11.0`,
baseline, migración, drift aprobado, cuenta o lifecycle persistido.

#### Evidencia S14C — ownership, baseline y replay efímero

S14C construyó `20260809220336_baseline` y su manifest v2. La reproducción
Prisma 5.22 emitió exactamente el mismo SQL: 20.134 bytes y 82 sentencias
aditivas —3 enums, 25 tablas, 25 índices y 29 claves foráneas—, sin DML, `DROP`
o `_prisma_migrations`.

El replay empleó dos casos autoritativos secuenciales sobre branches hijos
efímeros del Preview `br-proud-hat-achuevv2`, fijados al LSN `0/307FA88`. No usó
snapshot, `finalize` ni target estable:

1. **A — deploy vacío:** `prisma migrate deploy` creó 25 tablas; las 13 tablas
   `@@ignore` quedaron presentes; `migrate status` y el diff semántico cerraron
   en cero.
2. **B3 — resolve sobre copia existente:** `prisma migrate resolve --applied
   20260809220336_baseline` se ejecutó una sola vez. La fila canónica generada
   por Prisma con cero pasos quedó `valid`; status y diff cerraron en cero. El
   fingerprint correcto pre/post, excluyendo sólo `_prisma_migrations`, fue
   byte-idéntico: 449 filas, 140.715 bytes y SHA-256
   `0388a4871483fdd37286a03ab1d7acd01f25ef0ecae309925dadf912fe589028`.

B y B2 fueron intentos instrumentales abortados y no son evidencia de
aceptación. El receipt saneado externo
`s14c-baseline-disposable-replay-receipt.json`, fuera del checkout y no
versionado, tiene SHA-256
`613db7889e4e23033927814fa5ee8e4a891e9a91772268e01b08645d3f4ae51b`.
El cleanup confirmó main + Preview únicamente, 2 endpoints y 0 snapshots.
Preview y Production recibieron cero escrituras.

Este replay prueba los dos caminos técnicos sobre copias efímeras; no es
snapshot/restore, backup operativo, aplicación estable ni receipt institucional
de release. Neon muestra el proyecto como `puntolimpio-staging-neon`; ownership
y naming no están gobernados. Ese BLOCKER impide DDL estable, cuentas y release,
y `RELEASE_ATTESTATION_NOT_GOVERNED` permanece obligatorio. La validación S14C
cerró 635 pruebas raíz —634 aprobadas, 0 fallidas y 1 smoke opt-in omitido— y
backend 20/20. Sigue `Unreleased`, sin bump, tag, GitHub Release o `v1.11.0`.
`v1.10.0` conserva `4108ca0` y su 11/11 histórico; el hotfix post-release
`e74339c` cerró Production 12/12.

### 7.2 Aprovisionamiento retirado

El comando legado se conserva como gate negativo verificable:

```powershell
npm.cmd run db:seed
```

El resultado obligatorio es código `1` y
`ACCOUNT_LIFECYCLE_NOT_GOVERNED`. El gate no lee secretos ni variables de
aprovisionamiento, no importa Prisma, no abre una conexión a PostgreSQL y no crea
ni modifica filas. No existe una excepción de bootstrap.

Las altas generales `POST /api/admin/tenants` y `POST /api/admin/users` del
runtime Express responden `410 ACCOUNT_LIFECYCLE_NOT_GOVERNED`. Se retiró el
flujo donde un administrador elegía y conocía la contraseña inicial. No se
reactivarán hasta disponer de invitación de un solo uso, expiración, sesiones
revocables, MFA, doble aprobación y auditoría transaccional.

PUT/PATCH de tenant responde `410 TENANT_LIFECYCLE_NOT_GOVERNED`. La fundación
pura en [`ACCOUNT_LIFECYCLE_STATE_MACHINE.md`](ACCOUNT_LIFECYCLE_STATE_MACHINE.md)
prueba transiciones e invariantes sin DB, pero no habilita cuentas ni tenants.

IAM-MAP-01, documentado en
[`ACCOUNT_LIFECYCLE_PRISMA_MAPPING.md`](ACCOUNT_LIFECYCLE_PRISMA_MAPPING.md),
traduce únicamente el subconjunto reversible entre esa foundation y la propuesta
Prisma. No importa Prisma Client, no abre una DB, no completa columnas de
persistencia y no crea usuarios, invitaciones, sesiones o credenciales. Conectar
el mapper requiere antes resolver drift de esquema, aprobar baseline/migración y
construir un adaptador transaccional con auditoría.

## 8. Variables de entorno por grupo

La tabla enumera nombres, nunca valores. Los secretos deben vivir en el gestor de
secretos del entorno y no en HTML, Markdown, capturas, logs o Git.

| Grupo | Variables | Regla |
|---|---|---|
| Base | `DATABASE_URL`, `DIRECT_URL` | PostgreSQL remoto con `sslmode=verify-full`; sólo loopback de desarrollo puede omitirlo |
| Gate de migración | `PRISMA_BASELINE_ID`, `PRISMA_MIGRATION_SET_ID`, `PRISMA_TARGET_ID`, `PRISMA_DRIFT_RECEIPT_PATH`, `PRISMA_DRIFT_RECEIPT_SHA256` | IDs exactos y receipt externo efímero; no contiene URL ni secretos y no reemplaza el chequeo conectado |
| Sesión | `JWT_SECRET`, `JWT_EXPIRES` | `JWT_SECRET` mínimo 32 caracteres y sin fallback; `JWT_EXPIRES` sólo configura Express, mientras el login Serverless firma actualmente por 8 horas fijas |
| Tenant de datos | `GRH_TENANT_ID`, `LEGACY_ANALYTICS_TENANT_ID` | CUID real, nunca slug; la consulta pública de reclamos está retirada |
| Pin de fuente GRH | `GRH_SOURCE_SHA256` | SHA-256 hexadecimal minúsculo de 64 caracteres del manifiesto aprobado; obligatorio para toda lectura DB y en producción, nunca se deduce del payload DB |
| Runtime | `NODE_ENV`, `PORT`, `VERCEL_URL` | `VERCEL_URL` sólo se normaliza como HTTPS; `FRONTEND_URL` no autoriza CORS |
| Base pública de enlaces | `PUBLIC_APP_URL` | un origen HTTPS exacto aprobado; sin path, credenciales, query ni hash |
| CORS | `PUBLIC_APP_ORIGINS`, `VERCEL_URL` | allowlist HTTPS exacta; loopback sólo con `NODE_ENV=development` |
| GRH local | `ALLOW_LOCAL_GRH_ARTIFACTS` | sólo no-producción y sin lectura DB; deriva el pin del manifiesto local validado, nunca recupera una respuesta DB inválida |
| Autorización interna | `CRON_SECRET` | nombre legacy; distinto de JWT, mínimo 32 caracteres; no implica que exista un cron activo |
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_PHONE_ID_VECINOS` | sólo con app y números aprobados |
| Diagnóstico WhatsApp | `ENABLE_WHATSAPP_DIAGNOSTICS`, `WHATSAPP_TEST_TO` | desactivado salvo prueba controlada; alertas salientes están retiradas |
| Conectores | `DATA_CONNECTOR_ALLOWED_HOSTS`, `DATA_CONNECTOR_ALLOW_PRIVATE` | allowlist exacta; redes privadas bloqueadas por defecto |

No hay variables de seed vigentes. Agregarlas al entorno no modifica el gate ni
autoriza aprovisionamiento.

## 9. Generación semántica GRH

### 9.1 Preparación

1. Mantener el dump fuera del repositorio.
2. Confirmar que sea el backup GRH canónico y no `personas_junin`.
3. Verificarlo contra `config/grh-source-manifest.json`; el manifiesto fija nombre,
   SHA-256, tamaño y fecha de snapshot. Renombrar un dump no cambia su identidad.
4. Crear localmente `api/_data/` si no existe; está ignorado por Git y Vercel.

### 9.2 Comandos reales

Los scripts aceptan `--out`. No aceptan `--output` ni `--profile`.

```powershell
python -B scripts/profile_grh.py `
  '<ruta-privada>\grh_junin.backup_2026080615_plataforma.sql.gz' `
  --out api/_data/grh-profile.json `
  --manifest config/grh-source-manifest.json

python -B scripts/build_grh_semantic.py `
  '<ruta-privada>\grh_junin.backup_2026080615_plataforma.sql.gz' `
  --out api/_data/grh-semantic.json `
  --manifest config/grh-source-manifest.json
```

Ambos comandos fallan antes de extraer si nombre, tamaño, SHA-256 o snapshot no
coinciden con el manifiesto. `--as-of` es opcional y, si se usa, no puede
contradecir el snapshot aprobado.

La salida semántica esperada es `grh-semantic-v2`. Para `ausencia`, `licencia` y
`legamov`, `valid_by_year` y `distinct_participants_by_year` deben tener los
mismos años; participantes distintos no puede superar eventos válidos. La clave
compuesta que sostiene el conteo no forma parte del JSON.

### 9.3 Controles antes de publicar

```powershell
python -B -m unittest discover -s tests -v
node --test tests/ai-grh-assistant.test.mjs
node --test tests/security-boundaries.test.mjs
node --test tests/grh-small-cell-privacy.test.mjs tests/grh-executive-endpoint.test.mjs
node --test tests/grh-quality-projection.test.mjs tests/grh-quality-endpoint.test.mjs
```

Además, inspeccionar que:

- `privacy.aggregate_only` sea verdadero;
- `privacy.contains_pii` sea falso;
- `privacy.excluded_sources` incluya `personas_junin`;
- archivo, SHA-256 y fecha de snapshot sean correctos;
- períodos y cuarentena respeten la política temporal;
- conciliación y diferencias no se oculten;
- `quality.risk_flags.suspicious_text_encoding_labels` sea revisado contra un
  catálogo aprobado; una etiqueta sospechosa se informa y no se corrige en silencio;
- no existan nombres, DNI, domicilios, cuentas o identificadores individuales.
- las celdas se protejan antes del top-N, la supresión complementaria impida
  reconstrucción por diferencia y una cardinalidad desconocida falle protegida;
- cada salida segura valide exactamente como `grh-executive-v2` o
  `grh-quality-v1` y no contenga los objetos fuente.

## 10. Publicación privada

### 10.1 Precondiciones

1. DB y branch destino identificados.
2. `tenants.id` real disponible.
3. `migrations/002_grh_artifacts.sql` revisada y aplicada con el mecanismo
   aprobado del entorno.
4. Backup restaurado en un entorno aislado.
5. Contratos locales validados.
6. `DATABASE_URL` apunta inequívocamente al destino autorizado y usa
   `sslmode=verify-full`.
7. `GRH_SOURCE_SHA256` configurado en el entorno destino con el SHA exacto de
   `config/grh-source-manifest.json`, sin copiarlo a logs o capturas.

### 10.2 Publicación

```powershell
node scripts/publish_grh_artifacts.mjs `
  --tenant-id '<tenants.id CUID real>' `
  --data-dir api/_data
```

El script exige `DATABASE_URL`, inspecciona ambos contratos con los validadores
centrales, exige que `profile` y `semantic` identifiquen el mismo backup y publica
los dos en una transacción. Rechaza TLS no verificable antes de leer artefactos o
abrir el pool. Ante cualquier error ejecuta rollback. La revisión
humana y las pruebas de privacidad siguen siendo obligatorias por la regla de
defensa en profundidad indicada en 4.1.

Después de publicar, no activar ni probar consumidores con una sola fila. Ambas
filas deben permanecer `active=TRUE` y sus columnas `schema_version`,
`snapshot_as_of` y `source_sha256` deben coincidir con sus payloads y entre sí. El
pin del runtime es una aprobación externa al contenido DB, no un valor que deba
aceptarse porque dos payloads coincidan entre sí.

### 10.3 Smoke obligatorio

En el deployment concreto:

| Caso | Resultado esperado |
|---|---|
| `GET /api/auth/me` anónimo | `401` |
| `GET /api/grh-executive` o `/api/grh-quality` anónimo | `401` |
| usuario habilitado del tenant GRH en endpoints seguros | `200`, sólo si el par activo, el pin y la proyección exacta validan |
| `GET /api/reports` habilitado | `200`, `grh-executive-report-v2`, `approvedSha256`, k=10 y agregados protegidos |
| rol no permitido o tenant ajeno | `403` |
| pin ausente/inválido/distinto; par incompleto o metadata/foco divergente | `503`, sin métricas ni fallback local |
| artefactos o DB no disponibles | `503`, sin fallback |
| MIME/contrato inválido en frontend | estado de error, sin métricas |
| captura de red de cada consumidor GRH | sólo endpoints seguros; ninguna solicitud a `/api/grh-data` |
| `/api/grh-data` anónimo | `401`; el retiro no saltea identidad |
| `/api/grh-data` con rol/tenant denegado | `403`; el retiro no saltea aislamiento |
| `/api/grh-data` autorizado para el tenant GRH | `410 GRH_RAW_CONTRACT_RETIRED`, sin lectura de artefactos |

Registrar URL, deployment ID, commit, branch DB, usuario/rol de prueba, hora y
resultado. Sin ese registro la publicación no está certificada.

## 11. Importaciones y conectores

Hay tres caminos diferentes; no confundirlos.

### 11.1 Importación directa a modelos Prisma — Retirada

`POST /api/data/import` autentica y responde `410 DIRECT_CORE_IMPORT_RETIRED`.
No existe una vía vigente para `truncate` ni para escribir directamente
empleados, pagos, presupuestos, reclamos, obras o licitaciones. Se reactivará sólo
con clasificación por dominio, esquema versionado, permisos por acción y campo,
maker-checker, auditoría tenant-bound y restore demostrado.

### 11.2 Importación analítica legacy

- `POST /api/upload-handler`: CSV, XLSX, XLS, PDF o JSON; un archivo por request;
  exige rol administrativo y `LEGACY_ANALYTICS_TENANT_ID`; interpreta antes de
  persistir, exige período `YYYY-MM` explícito y usa transacción. En Excel sólo
  la primera hoja se transforma en filas; todas las hojas deben respetar los
  límites del parser.
- `POST /api/google-sheets`: descarga CSV de una hoja pública, mantiene valores
  como strings, exige período `YYYY-MM` explícito, valida
  MIME/UTF-8/estructura/headers y limita la fuente. La opción de sincronización
  programada responde `422`: todavía no existe.

Ambas escriben las tablas legacy `datasets` y `data_points`; el binding ambiental
es el control temporal de aislamiento y no reemplaza una migración tenant-bound.

### 11.3 Conector PostgreSQL externo

`POST /api/external-connector` sólo permite `action: "test"` para PostgreSQL y
  hosts de `DATA_CONNECTOR_ALLOWED_HOSTS`. Exige TLS verificable, fija la conexión
  a la IP validada preservando hostname/SNI, bloquea redes privadas por defecto y
  aplica timeouts. `save`, `list` y `query` responden `410` hasta contar
con vault de credenciales y aislamiento tenant.

### 11.4 Regla de éxito

La UI sólo puede mostrar éxito cuando el servidor confirma `parsed: true` y
`persisted: true` con conteos coherentes. Un parse rechazado, rollback, truncado o
éxito parcial debe conservar su estado explícito.

## 12. Estrategia de pruebas

### 12.1 Gates generales

```powershell
npm.cmd audit --omit=dev --audit-level=low
npm.cmd --prefix backend audit --omit=dev --audit-level=low
python -B -m unittest discover -s tests -v
npm.cmd test
npm.cmd run test:backend
git diff --check
```

`scripts/run-test-suite.mjs` enumera archivos de forma explícita y limita la concurrencia a tres procesos para que la suite
sea reproducible tanto en PowerShell como en shells que expanden comodines. Un
release debe conservar la salida completa de estos comandos; cero tests, skips
inesperados o una suite parcial no satisfacen el gate.

### 12.2 Suites focalizadas

| Cambio | Comando mínimo adicional |
|---|---|
| auth/tenant | `node --test tests/security-boundaries.test.mjs` |
| GRH semántico | `python -B -m unittest discover -s tests -v` |
| upload/Excel/CSV | `node --test tests/upload-parser-hardening.test.mjs` |
| importaciones/UI | `node --test tests/import-truth-contract.test.mjs tests/import-google-sheets.e2e.mjs` |
| dashboard principal | `node --test tests/index-dashboard.e2e.mjs` |
| GRH | `node --test tests/grh-dashboard.e2e.mjs` |
| RRHH | `node --test tests/rrhh-dashboard.e2e.mjs` |
| cierre mensual GRH/Hacienda | `node --test tests/grh-close-projection.test.mjs tests/grh-close-endpoint.test.mjs tests/grh-close-data-client.test.mjs tests/hacienda-dashboard.e2e.mjs` |
| brief ejecutivo S13 | `node --test tests/grh-decision-brief-projection.test.mjs tests/grh-decision-brief-endpoint.test.mjs tests/grh-decision-brief-data-client.test.mjs tests/index-dashboard.e2e.mjs` |
| Calidad y Linaje GRH | `node --test tests/grh-control.e2e.mjs` |
| proveniencia runtime GRH | `node --test tests/grh-runtime-provenance.test.mjs` |
| techo exacto de rutas | `node --test tests/route-policy.test.mjs tests/route-authorization-adapter.test.mjs` y `node --test backend/tests/route-authorization-policy.test.js` |
| asistente | `node --test tests/ai-grh-assistant.test.mjs tests/ia-assistant.e2e.mjs` |
| reportes | `node --test tests/reports-readonly.test.mjs tests/reportes-native-svg.test.mjs tests/reportes-native-svg.e2e.mjs` |
| verdad de preview/release | `node --test tests/deployment-truth-gate.test.mjs` y `npm run release:truth:check -- --base-url https://preview-approved.example` |
| login institucional | `node --test tests/login-institutional.e2e.mjs tests/public-truth-boundaries.test.mjs tests/access-policy.test.mjs` |
| inicio seguro por rol | `node --test tests/access-policy.test.mjs tests/login-institutional.e2e.mjs tests/navigation-layout.e2e.mjs tests/role-workspace.e2e.mjs` |
| WP0-L read-only | `node --test tests/prisma-baseline-observation.test.mjs tests/database-url-policy.test.mjs tests/prisma-migration-gate.test.mjs` |
| ownership + baseline S14C | `node --test tests/prisma-schema-ownership.test.mjs tests/prisma-baseline-sql.test.mjs tests/prisma-migration-gate.test.mjs tests/operations-documentation.test.mjs` y `npm.cmd run db:baseline:manifest:check` |
| IAM-MAP-01 | `node --test tests/account-lifecycle-prisma-mapper.test.mjs tests/account-lifecycle-foundation.test.mjs tests/rbac-lifecycle-proposal.test.mjs` |
| shell institucional UX-E2A | `node --test tests/institutional-shell.test.mjs tests/navigation-layout.e2e.mjs` |
| bundle inmutable O2A.1 | `node --test tests/grh-pipeline-foundation.test.mjs tests/grh-pipeline-replay.test.mjs` |
| Express | `node --test backend/tests/*.test.js` |

No cerrar un release con fallos, tests cero, `skip` no explicado o artefactos
privados ausentes cuando esos artefactos son parte del alcance a certificar.

Evidencia focal heredada del cierre documental 1.6.0: la suite local que integra el
backend de cierre acumuló 411 pases y 1 smoke externo opt-in omitido; O2A/O2A.1,
54 pases y 1 smoke opt-in omitido; login institucional, 10/10; Bot + E2E,
13/13. Son evidencias
focales, no el QA final, ni certificación de datos remotos, DB o deployment.

Evidencia focal UX-E1A: política, login, navegación y workspace por siete roles
en 390/1440 px cerraron 42/42 local. Incluye `SUPER_ADMIN` sin tenant, sesión
obsoleta frente a `/api/auth/me`, perfil malformado y ausencia de requests GRH.
No prueba cuentas aprovisionadas, DB remota, preview ni producción.

Evidencia S13 local: focal raíz 135/135, QA adversarial 104/104 con 0 P1/P2,
suite raíz final de 591 pruebas —590 aprobadas, 0 fallidas y 1 smoke opt-in
omitido— y backend 20/20. Por sí sola, esa evidencia focal no habilitaba commit,
push, tag, Preview o Production; el release público externo verificado se registra
en el bloque post-release anterior.

Evidencia S14B local/conectada: suite raíz 619 —618 aprobadas, 0 fallidas y 1
smoke opt-in omitido— y backend 20/20. La observación WP0 conectada sigue siendo
`discovery_non_approvable`; estos conteos no recertifican `v1.10.0` ni habilitan
baseline, migración, cuenta o release.

Evidencia S14C local/efímera: suite raíz 635 —634 aprobadas, 0 fallidas y 1 smoke
opt-in omitido— y backend 20/20. Los dos casos autoritativos de replay pasaron,
pero no escribieron Preview o Production ni resolvieron el BLOCKER de ownership
y naming de `puntolimpio-staging-neon`; no habilitan DDL, cuenta o release.

## 13. Release, preview, producción y rollback

### 13.1 Antes de crear preview

- diff revisado y sin cambios ajenos;
- locks reproducibles y auditoría de dependencias aprobada;
- suites proporcionales al cambio en verde;
- contrato GRH y privacidad validados;
- migraciones y drift revisados;
- backup restaurado, no sólo generado;
- QA desktop, móvil, impresión y movimiento reducido cuando aplica;
- ningún dump, JSON privado, secreto o archivo SQL dentro del bundle;
- commit identificable y autorización de release.

### 13.2 Preview

El comando documentado para crear un preview manual es:

```powershell
vercel deploy
```

Sólo ejecutarlo con CLI autenticada y autorización. Registrar URL, deployment ID,
commit y branch DB. Materializar los contratos en el entorno de preview y ejecutar
smokes anónimos, por rol, cross-tenant y de falla `503`.

Antes de certificar el preview, ejecutar sin sesión, cookie ni token:

```powershell
npm.cmd run release:truth:check -- --base-url https://preview-approved.example
```

El gate captura `login.html`, `dashboard.html`, `inicio.html`, `manuales.html` y
`roles.html`
locales, valida la versión del manual y compara sus huellas SHA-256 canónicas con
`/`, `/dashboard`, `/inicio`, `/manuales` y `/roles`. Para el workspace abre una sola vez
el archivo regular, exige UTF-8 fatal, canonicaliza LF y fija
`expectedWorkspaceDigest`; `/inicio` debe responder HTML 200 sin redirect y con
digest exacto. También exige que el rewrite sea exactamente `/inicio` →
`/inicio.html` en `vercel.json`. Exige
HTTPS exacto y DNS público estable, rechaza proxies ambientales, prohíbe
redirecciones de API y requiere un header contractual distinto por endpoint.
El contrato actual enumera seis APIs y produce 12 checks totales —cinco
documentos, seis fronteras API y `/prisma/schema.prisma`— cuando se ejecuta
contra un candidato desplegado. La ruta Prisma debe responder 404 sin redirect,
sin marcadores del schema y con `no-store` + `nosniff`. Para `v1.10.0`, antes de
incorporar este probe, la ejecución productiva histórica cerró 11/11 exit `0`
con `checkedAt 2026-08-09T16:33:56.200Z`; el hotfix post-release `e74339c` cerró
el gate ampliado 12/12.
Limita tiempo/cuerpo y devuelve un receipt JSON saneado. Código `1` significa
que el candidato es legacy o incompleto; código `2`, que la configuración o el
propio contrato local son inválidos. Ninguno de los dos puede promoverse.

Este gate no prueba propiedad institucional del dominio ni elimina por completo
la ventana entre resolución DNS y conexión del `fetch` nativo. El host aprobado,
deployment ID, commit y evidencia del proveedor son gates externos adicionales.
El focal E0.1 cerró 31/31 local: falta, no regular, vacío, exceso de tamaño,
UTF-8 inválido, digest malformado, topología vieja, redirect y comment spoof
fallan cerrados; los errores locales ambiguos detienen el proceso antes de
DNS/fetch. El receipt no serializa el body. El consolidado con login/navegación/
workspace cerró 45/45. Ninguna de esas pruebas certifica un destino remoto.

### 13.3 Producción

Promover exactamente el preview certificado mediante el mecanismo de release
autorizado. No reconstruir un artefacto distinto sin repetir gates. Después de la
promoción, repetir smokes de autenticación, GRH, reportes, importaciones y
webhooks que estén habilitados. No probar como operativas rutas retiradas `410`.

Este manual registra la promoción de la superficie pública exacta de `b82c0b3`.
No afirma promoción de DB, cuentas, autorización positiva o datos privados.

### 13.4 Rollback

1. Detener o bloquear la superficie afectada si existe fuga, corrupción o cruce
   de tenant.
2. Preservar logs, deployment ID, snapshot y línea de tiempo.
3. Volver al deployment anterior aprobado.
4. Tratar DB por separado: un rollback de código no revierte datos.
5. Restaurar sólo desde una copia cuya recuperación haya sido probada y reconciliar
   escrituras posteriores.
6. Rotar secretos si pudieron exponerse.
7. Ejecutar smokes y documentar causa, alcance, tenants afectados y prevención
   antes de reabrir.

## 14. Monitoreo y respuesta operativa

### 14.1 Señales hoy disponibles

- Express: `GET /api/health` para liveness y `GET /api/readiness` para DB.
- Serverless: respuestas fail-closed, `Cache-Control: no-store` y logs etiquetados
  mediante `console` en rutas críticas.
- Analítica legacy: `GET /api/audit?action=overview|datasets|reports|timeline`
  entrega inventario minimizado condicionado a DB y tenant. No registra actor ni
  acción y no constituye auditoría institucional.
- GRH: fuente, snapshot, hash, calidad, cuarentena y conciliación dentro del
  contrato semántico.
- Correo y entrega programada están retirados con `410` hasta disponer de
  idempotencia, proveedor aprobado y auditoría tenant-bound. `vercel.json` no
  programa el endpoint retirado.

### 14.2 Señales todavía pendientes

No existe evidencia certificada de un tablero operativo central, alertas de SLA,
tracing distribuido, retención de logs, rate limit distribuido ni monitoreo de
restore. Hasta implementarlos, revisar manualmente:

- edad del snapshot servido;
- última publicación exitosa/fallida;
- cambios de esquema y volumen;
- filas válidas y en cuarentena;
- score y diferencias de conciliación;
- errores 401/403/503/5xx por ruta y tenant;
- intentos cross-tenant;
- fecha de la última restauración exitosa.

Un incidente debe registrar hora, entorno, deployment, tenant, actor, ruta,
correlation ID si existe, impacto, mitigación y evidencia de cierre. Nunca copiar
payloads con PII o secretos al ticket.

## 15. Backup, restauración e ingesta continua

### 15.1 Estado actual

- No hay backup propio automatizado certificado.
- No hay restauración remota certificada.
- No hay extracción diaria ni CDC activos.
- Sí existe O2A: un replay real, idempotente y exclusivamente local del snapshot
  canónico. No equivale a extracción, publicación o continuidad conectadas.
- `docs/GRH_OPERATIONS_ROADMAP.md` separa la capacidad O2A probada de O2B y la
  arquitectura conectada todavía pendiente.

### 15.2 Procedimiento y evidencia O2A — replay local

Contrato normativo:
[`GRH_PIPELINE_RUN_CONTRACT.md`](GRH_PIPELINE_RUN_CONTRACT.md).

Precondiciones:

1. usar un host local controlado y un runtime aprobado;
2. verificar el snapshot canónico de 44.537.741 bytes, corte 2026-08-06 y
   SHA-256
   `e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`;
3. mantener estado y workspace fuera del repositorio, de `api/_data` y de
   directorios sincronizados;
4. no habilitar red, DB, cron, APIs o adapters conectados;
5. confirmar que el manifiesto aprobado excluye `personas_junin`.

Procedimiento de aceptación:

1. ejecutar `scripts/replay_grh_pipeline.mjs` contra el snapshot y manifiesto
   aprobados, con un state dir local aislado;
2. aceptar promoción sólo si el estado terminal es `promoted/PUBLISHED` y el
   bundle supera su contrato completo;
3. comprobar versión activa, last-known-good, activación y receipts sin copiar
   rutas, payloads o datos raw al reporte;
4. repetir exactamente la misma fuente y el mismo conjunto de procesadores;
5. exigir `duplicate/DUPLICATE`, sin segunda versión ni segunda activación;
6. comparar el last-known-good antes/después y exigir igualdad byte a byte;
7. confirmar cero locks, residuos y workspaces activos al cierre;
8. verificar que fuente, manifiesto y procesadores se capturen por descriptor,
   se controlen con `fstat` y se copien con creación exclusiva `wx` y modo `0600`;
9. confirmar que los procesadores reciben sólo las rutas de las copias privadas,
   nunca las rutas originales gobernadas.

Evidencia de la prueba real local:

| Verificación | Resultado |
|---|---|
| Primera ejecución | `promoted/PUBLISHED` en 105,5 s |
| Replay exacto | `duplicate/DUPLICATE` en 294 ms |
| Lifecycle local | 1 versión, 1 activación y 1 receipt de duplicado |
| Last-known-good | Byte-estable tras el replay duplicado |
| Higiene | 0 locks, residuos y workspaces activos al cierre |
| Bundle | 257 tablas, 6.573.057 filas, calidad 88,99/100 |
| Privacidad | `contains_pii=false`; `personas_junin` excluida |

Interpretación obligatoria: `PUBLISHED` significa activado únicamente en
`LOCAL_STATE`. No autoriza afirmar DB, API, deployment, ejecución diaria, backup,
restore, RPO/RTO o ACL operativos. El ledger local no está firmado y no autentica
un host comprometido. Tampoco se probó resistencia a corte de energía. Antes de
un adapter conectado sigue pendiente autenticar host/runtime y anclar la
evidencia externamente.

O2A.1 ya implementa el hardening local de lectura: captura cada entrada por
descriptor, compara identidad/tamaño mediante `fstat`, crea copias privadas
exclusivas (`wx`, `0600`) dentro del workspace y pasa sólo esas copias a los
procesadores. Reduce el riesgo TOCTOU entre hash y uso; no garantiza integridad
frente a un actor con control completo del host. La evidencia O2A.1 se ejecutó
con fixtures: **no** se repitió el replay real del snapshot de 44 MB, no se usó
DB y no hubo deployment.

### 15.3 Requisitos para declarar backup operativo

1. Copia cifrada y privada en cuenta/proyecto separado.
2. Retención aprobada y object lock cuando corresponda.
3. Manifiesto con origen, fecha, tamaño y hash.
4. Acceso de restauración con doble control.
5. Restauración periódica a entorno aislado.
6. Reconciliación de conteos, constraints y contrato semántico post-restore.
7. Evidencia de RPO/RTO reales; los objetivos del roadmap no son SLA vigentes.

### 15.4 Camino O2B a extracción conectada/programada y CDC

Orden obligatorio:

1. cuenta GRH read-only y TLS;
2. landing inmutable por ejecución;
3. manifiesto/hash y lock idempotente;
4. staging aislado;
5. schema checks, deduplicación y cuarentena;
6. comparación contra último snapshot;
7. publicación atómica sólo si pasan gates;
8. auditoría y métricas;
9. CDC únicamente después de confirmar motor, binlog, retención y contrato del
   proveedor; de lo contrario, extracción completa programada.

O2B requiere además scheduler, storage privado, identidad de workload, secretos,
telemetría y responsables operativos. Ninguna evidencia O2A sustituye esos gates.

## 16. Arquitectura objetivo por fases

Esta sección describe la evolución objetivo; no convierte el roadmap en capacidad
disponible. Se usan tres estados:

- **Actual:** existe en el checkout y tiene verificación local reproducible.
- **Parcial/condicionado:** existe una parte del flujo, pero faltan integración,
  operación remota o evidencia para utilizarla como servicio completo.
- **Planificado:** diseño objetivo sin implementación operativa certificada.

Flujo objetivo de datos:

```text
fuentes aprobadas: archivos / GRH read-only / sistemas municipales
        │
        ▼
control de ingreso: identidad de fuente, tenant, esquema, hash y manifiesto
        │
        ▼
landing privada, cifrada e inmutable ────────┐
        │                                           │
        ▼                                           ▼
staging + validación + deduplicación + cuarentena   backup independiente
        │                                           │
        ▼                                           ▼
modelos canónicos tenant-bound                   restore auditado
        │
        ▼
contratos semánticos versionados + calidad + linaje
        │
        ▼
APIs privadas → analítica / mapas / alertas / asistente
        │
        └──→ auditoría, observabilidad, SLO y reconciliación
```

### 16.1 Fase 0: base gobernada — Actual local

- GRH es la fuente canónica laboral. `personas_junin` permanece excluida de los
  contratos GRH actuales y sólo puede incorporarse mediante un pipeline auxiliar
  y un `crosswalk_persona` versionado; nunca por igualdad de `IDPERSONA`.
- El snapshot histórico se transforma en artefactos privados `profile` y
  `grh-semantic-v2`, con calidad, cuarentena, conciliación, cardinalidades
  anuales sin claves y fecha de corte.
- `grh-executive-v2`, `grh-quality-v1` y `grh-close-v1` están implementados localmente como
  fronteras minimizadas. La primera usa k=5 para rankings interactivos y k=10
  para dominios sensibles/portable; la segunda excluye categorías, códigos e
  importes. Ambas fallan cerradas.
- Panel, Centro Ejecutivo GRH, Calidad, RRHH y Hacienda usan localmente las
  proyecciones seguras y no referencian `/api/grh-data`. La ruta raw autentica,
  verifica tenant y responde 410 sin leer artefactos. Reportes, PDF y Asistente
  leen el bundle sólo server-side y aplican proyección portable. `profile` y
  `semantic` quedan exclusivamente en backend.
- O2A reejecuta el pipeline completo en estado local aislado y preserva el
  last-known-good ante duplicados. La prueba real cerró `PUBLISHED` y luego
  `DUPLICATE` sin red, DB, cron, `api/_data` o deployment; O2B sigue pendiente.
- O2A.1 entrega a cada procesador copias privadas capturadas por descriptor y
  verificadas con `fstat`; su suite usó fixtures y no repitió el replay real.
- La autorización actual combina identidad, rol vigente, tenant y estado
  consultados en DB con un manifiesto exacto de rutas y permisos
  `recurso:acción`. Las listas legacy sólo pueden restringir ese techo, nunca
  ampliarlo. La versión local cubre 31 recursos, 12 acciones, 53 permisos y 91
  firmas exactas (50 Serverless y 42 Express). Todavía no existe persistencia de
  asignaciones por área, fila, campo, vigencia ni reglas de segregación de
  funciones.

Esta fase habilita analítica descriptiva sobre el corte recibido; no acredita
tiempo real, base remota materializada, moneda, nómina contractual ni predicción.

### 16.2 Fase 1: ingreso unificado — Parcial/condicionado

Hoy existen el upload de un archivo y Google Sheets sobre tablas analíticas
legacy vinculadas globalmente mediante `LEGACY_ANALYTICS_TENANT_ID`, además de
una prueba restringida de conexión PostgreSQL. `POST /api/data/import` está
retirado con `410`: todavía no existe ingesta Prisma tenant-bound ni aislamiento
por `tenant_id` en cada fila. Son superficies separadas y no constituyen una
plataforma de ingesta unificada.

El objetivo es que archivos y bases pasen por el mismo plano de control:

1. registrar tenant, propietario, finalidad, clasificación y sistema de origen;
2. autenticar el conector con una identidad read-only de alcance mínimo;
3. capturar esquema, zona horaria, encoding, volumen, hash y fecha de corte;
4. escribir una landing privada e inmutable por ejecución;
5. validar límites, esquema, tipos, claves, duplicados y PII antes de promover;
6. enviar filas inválidas a cuarentena con causa, sin descartarlas en silencio;
7. conservar linaje desde fuente hasta KPI y publicar de forma idempotente.

Ningún conector puede pasar de `test` a lectura o persistencia sin contrato de
red, allowlist, secretos, límites, tenant, auditoría y pruebas de aislamiento.

### 16.3 Fase 2: batch diario y continuidad — Planificado

Antes de hablar de sincronización diaria deben existir:

- orquestación con locks, reintentos idempotentes y estado por ejecución;
- incremental por watermark cuando la fuente lo garantice, o snapshot completo
  conciliado cuando no lo haga;
- backup cifrado en cuenta separada, retención aprobada y manifiesto con hash;
- restauraciones periódicas en entorno aislado, con conteos y constraints
  conciliados;
- RPO, RTO y frescura medidos con evidencia, no declarados por aspiración;
- alertas por atraso, cambio de esquema, volumen anómalo, cuarentena y fallo de
  publicación.

No existe hoy un cron operativo de ingesta, reportes o alertas. Cualquier job
futuro debe declarar finalidad, tenant, checkpoint, idempotencia y auditoría.

### 16.4 Fase 3: CDC o microbatch — Planificado

CDC sólo se habilita si el proveedor y el motor permiten una cuenta read-only,
TLS, acceso a log/binlog, retención suficiente y un contrato de operación. El
consumidor debe guardar offsets/checkpoints, soportar replay, deduplicar por clave
estable, detectar borrados y cambios de esquema, y reconciliar periódicamente
contra un snapshot completo.

Si alguna precondición falta, usar batch o microbatch gobernado. “Tiempo real” no
es un requisito superior a integridad, privacidad y trazabilidad.

### 16.5 Fase 4: mapas y analítica geoespacial — Planificado

Las interfaces pueden preparar estados de mapa, pero no deben dibujar puntos,
zonas ni mapas de calor sin una fuente geográfica gobernada. El contrato objetivo
debe declarar:

El diagnóstico reproducible, los riesgos de domicilio y el contrato previo
`grh-geo-readiness-v1` se mantienen en
[`GRH_GEOSPATIAL_READINESS.md`](GRH_GEOSPATIAL_READINESS.md).

- sistema de referencia de coordenadas, precisión y fecha de captura;
- origen de latitud/longitud o calidad de la geocodificación de direcciones;
- unidad territorial oficial y reglas para coordenadas inválidas o duplicadas;
- agregación espacial y umbral mínimo de casos para proteger personas;
- versión del mapa base, permisos de uso y linaje del indicador.

Los mapas de calor deben representar conteos o tasas definidos por el contrato,
con denominador, período y leyenda visibles. Nunca inferir coordenadas, ocultar
faltantes ni exponer domicilios individuales.

### 16.6 Fase 5: inteligencia ejecutiva — Actual local y planificada

**Actual local:** indicadores descriptivos deterministas, calidad, conciliación,
reportes y respuestas del asistente limitadas al contrato disponible.

**Objetivo planificado:** una capa semántica municipal versionada que permita
cruces autorizados entre RRHH, Hacienda, compras, obras, reclamos y territorio.
Cada KPI debe tener dueño, definición, numerador, denominador, unidad, calendario,
dimensiones permitidas, fuente, frescura, umbrales y pruebas de reconciliación.

Alertas, anomalías, escenarios o pronósticos deben separar claramente hechos de
inferencias, mostrar período y cobertura, medir error contra una línea base y
mantener aprobación humana. La IA no puede transformar una inferencia en dato
municipal ni ejecutar una decisión administrativa por sí sola.

### 16.7 Fase 6: multi-tenant y RBAC por áreas — Parcial y planificada

**Actual local:** existen `Tenant`, siete roles técnicos, estado del tenant,
controles tenant-bound y una política compartida que registra de forma literal
31 recursos, 12 acciones, 53 permisos y 92 firmas protegidas (50 Serverless y 42
Express). No hay wildcard, jerarquía ni autorización por nombre de pantalla. Los
adaptadores de ambos runtimes usan ese mismo techo y deniegan lo desconocido.
Algunas tablas analíticas legacy aún dependen de un CUID ambiental y no ofrecen
aislamiento por fila nativo.

La política de acceso `2026-08-11.3` agrega además un inicio seguro para esos
siete roles. Login y `/me` calculan capabilities y perfil desde servidor;
`inicio.html` no consulta datasets y separa el Panel GRH. Esto mejora la
experiencia por responsabilidad, pero no implementa asignaciones por área,
vigencias, SoD o el resto del modelo fino.

La propuesta `prisma/proposals/rbac-abac-v1.prisma` está aislada deliberadamente:
no integra el schema canónico, no tiene migración aplicada y no autoriza crear
cuentas por perfiles futuros. Asignaciones por área/dato, vigencias, lifecycle de
cuenta/sesión, aprobaciones, recertificación, SoD y break-glass siguen en roadmap.

**Objetivo planificado:** permisos por municipio, secretaría/área, jerarquía,
dominio, dataset, fila, campo y acción. Deben incluir mínimo privilegio, separación
de funciones, doble control para operaciones sensibles, accesos temporales,
revisión periódica e historial de decisiones inmutable. Un rol en el frontend
nunca sustituye una política server-side.

### 16.8 Usuarios demo por rol — Roadmap bloqueado

El enum `Role` incluye `DEMO`, pero no existe un flujo de creación habilitado.
POST de tenants/usuarios con contraseña conocida responde
`410 ACCOUNT_LIFECYCLE_NOT_GOVERNED`; PUT/PATCH de tenant responde
`410 TENANT_LIFECYCLE_NOT_GOVERNED`; `db:seed` falla con código `1` sin DB.

Procedimiento seguro objetivo:

1. usar un tenant demo aislado, sin dumps ni datos municipales reales y sin
   bindings GRH/analíticos de producción;
2. crear una identidad separada por persona y rol que se necesite probar
   (`INTENDENTE`, `TENANT_ADMIN`, `TENANT_USER`, `CONTADOR`, `INSPECTOR` o `DEMO`);
3. entregar una invitación de un solo uso por un canal institucional aprobado;
   nunca publicar credenciales fijas;
4. no aprovisionar un `SUPER_ADMIN` demo salvo autorización explícita y controlada;
5. fijar vencimiento, rotar al entregar y después de cada ejercicio, y desactivar
   o eliminar las identidades al cerrar la prueba;
6. auditar creador, aprobador, rol, tenant, vigencia, uso y revocación.

Hasta automatizar y probar ese ciclo completo, el alta demo está **retirada**.
Una cuenta compartida o una clave visible en HTML,
Markdown, Git, logs o capturas bloquea el release.

## 17. Alta de un municipio

El registro autoritativo es `Tenant` en PostgreSQL. Un JSON en `tenants/` no crea
el tenant, no habilita usuarios y no sirve como `tenantId` de seguridad.

### 17.1 Alta administrativa retirada

`POST /api/admin/tenants` y `POST /api/admin/users` responden
`410 ACCOUNT_LIFECYCLE_NOT_GOVERNED`. PUT/PATCH de tenant responde
`410 TENANT_LIFECYCLE_NOT_GOVERNED`. No existe una ruta alternativa Serverless,
un seed, una pantalla ni un procedimiento SQL autorizado para omitir esos gates.

### 17.2 Checklist de alta

Esta lista define precondiciones futuras; no es un procedimiento ejecutable hoy:

1. Aprobar identidad legal, slug, plan, estado, contactos y custodios.
2. Aprobar baseline, migración aditiva, rollback y atestación institucional de
   release CI/KMS/OIDC.
3. Implementar alta por invitación de un uso, MFA, sesiones revocables, SoD y
   auditoría transaccional; nunca recibir una contraseña inicial administrativa.
4. Capturar el CUID real devuelto por PostgreSQL; nunca usar el slug como binding.
5. Configurar sólo las variables tenant-bound necesarias para las fuentes que
   realmente pertenecen al municipio.
6. Materializar contratos propios sólo después de un release autorizado.
7. Crear usuarios con mínimo privilegio mediante invitaciones; no compartir credenciales.
8. Probar usuario habilitado, rol insuficiente, tenant ajeno, usuario inactivo y
   tenant suspendido.
9. Probar ausencia de DB/contrato y respuesta `503`.
10. Registrar aprobador, operador, fecha, deployment y evidencia.
11. No marcar el municipio `ACTIVE` hasta completar los smokes correspondientes.

La gestión versionada de módulos en Express responde hoy `410`; no anunciarla
como capacidad de alta.

## 18. Troubleshooting de autenticación y datos

| Código | Significado habitual | Comprobaciones | Acción segura |
|---|---|---|---|
| `401` | token ausente/inválido, credenciales incorrectas o usuario ya no vigente | header `Authorization`, expiración, usuario activo, firma y longitud de `JWT_SECRET` | iniciar sesión de nuevo; no reutilizar tokens ni habilitar fallback |
| `403` | rol insuficiente, tenant distinto, usuario sin tenant o municipio no habilitado | rol actual en DB, `user.tenantId`, estado `ACTIVE/TRIAL`, CUID ambiental | corregir asignación/autorización aprobada; no editar el JWT |
| `503` | auth sin secreto, DB no disponible, tenant/pin de fuente sin configurar o bundle GRH ausente/inválido | readiness, `DATABASE_URL`, secretos, `GRH_TENANT_ID`, `GRH_SOURCE_SHA256`, dos filas activas y metadata/payload/focos | restaurar dependencia/configuración y repetir smoke; no mostrar mocks ni habilitar fallback local sobre DB inválida |
| `410` | superficie retirada deliberadamente | runtime y ruta exactos | no reactivarla sin nuevo contrato tenant-bound y pruebas |

Diagnóstico recomendado:

1. Confirmar runtime: Serverless o Express.
2. Confirmar entorno y deployment ID antes de revisar variables.
3. En Express, separar `/api/health` de `/api/readiness`.
4. Verificar al usuario actual contra DB, no sólo claims del token.
5. Comparar el CUID real con el binding de la fuente.
6. Verificar las dos filas `profile`/`semantic` activas, sus versiones, snapshot,
   SHA de metadata/payload, conteos focales y pin aprobado.
7. Confirmar que Reportes entrega el SHA autorizado y nunca PII.
8. Revisar logs sin imprimir token, connection string, password, SHA completo ni
   payload privado.

## 19. Matriz de capacidades

| Capacidad | Estado | Evidencia/límite |
|---|---|---|
| Perfil y `grh-semantic-v2` | Operativo local de backend | snapshot histórico; cardinalidades anuales sin claves, validadores fail-closed y revisión humana adicional |
| Proyecciones `grh-executive-v2` / `grh-quality-v1` | Operativo local de backend | contratos exactos, endpoints autenticados/tenant-bound/no-store y reglas k=5/k=10 |
| Cierre mensual `grh-close-v1` | Operativo local de backend | GET-only, exact-key, k=10, componentes/control y conciliación por período; no PII/labels/codes, moneda no declarada, no pago ni causalidad |
| Panel y Centro Ejecutivo GRH | Operativo local sobre proyecciones | consumen `grh-executive-v2` + `grh-quality-v1`; falta certificación remota |
| RRHH | Operativo local sobre proyecciones y directorio privado v3 | consume `grh-executive-v2` + `grh-quality-v1`; `grh-directory-v3` agrega situación laboral informada, catálogos de contrato/revista, participación en cálculo 2026-07, centro de costo y cronologías limitadas a 24 sin causas de eventos ni importes. Migración `005`, publicación y smokes remotos no ejecutados; Preview/Production siguen sin certificación v3 |
| Hacienda | Operativo local sobre proyecciones | cierre mensual explicado y comparación sólo de meses consecutivos liberados; P1 global-como-mensual retirado; certificación remota pendiente |
| Centro de Calidad y Linaje GRH | Operativo local sobre proyección | consume `grh-quality-v1`; la ruta raw ya responde `410` localmente y falta certificación remota |
| Asistente ejecutivo determinista | Operativo local server-side | intents allowlisted; `close_explanation` construye `grh-close-v1` desde una lectura y exige un `YYYY-MM` liberado k=10; 422 sin sustitución; no desplegado |
| Reportes SVG locales | Operativo local | `grh-executive-report-v2` portable k=10 y consumidor alineado; falta certificación remota |
| Frontera HTTP raw GRH | Cerrada localmente | `/api/grh-data` autentica/valida tenant y responde 410 sin leer artefactos; cinco UIs con cero referencias |
| Autenticación DB-autoritativa | Operativo local | Serverless y Express cubiertos por tests |
| Login institucional | Operativo local + preview protegido | sobrio, autocontenido, accesible, responsive y sin demos/claims; `/` mostró el acceso esperado con una única inyección conocida de Vercel Live; no prueba cuentas |
| Inicio seguro por rol | Operativo local | `navigation.workspace`, siete variantes, contrato de sesión server-computed y matriz 390/1440 px; 42/42 focal. Sin requests GRH en Inicio, cuentas, DB o deployment |
| Techo de autorización `recurso:acción` | Operativo local | Route policy `2026-08-13.10`: 31 recursos, 12 acciones, 53 permisos y 92 firmas exactas, 50 Serverless + 42 Express; desconocidos fallan cerrados |
| Replay GRH O2A/O2A.1 | Operativo local de ingeniería | replay real histórico preservado; captura por descriptor, `fstat` y copias privadas `wx`/`0600` verificadas con fixtures; host comprometido fuera de garantía; no conectado |
| WP0-L conectado S14B | Descubrimiento no aprobable sobre restore descartable | `TLSv1.3`, observador de mínimo privilegio, transacción read-only y 968 filas de catálogo; historia `absent`, `approvalEligible:false` y cuatro flags de evidencia externa en `false`; no es baseline ni autorización DDL |
| Ownership schema S14C | Cerrado en schema/clients | 13 tablas existentes: 5 sensibles y 8 de referencia; `@@ignore` deshabilita delegates pero no reemplaza grants DB ni bloquea `$queryRaw` |
| Baseline/replay S14C | Reproducible y aprobado en branches efímeros | manifest v2, Prisma 5.22, 82 sentencias; A vacío y B3 resolve con status/diff cero; catálogo B3 byte-idéntico; cero escrituras Preview/Production; DDL estable bloqueado por ownership/naming del proyecto Neon |
| Importación directa a modelos Prisma | Retirada | responde `410`; falta contrato por dominio, RBAC fino, doble control y restore |
| Upload/Google Sheets analítico | Operativo local | contrato estricto; fuente legacy ligada por env |
| Publicación `grh_artifacts` | Condicionado | código existe; faltan DB remota, migración y smokes certificados |
| Preview/producción Vercel | Release público histórico `v1.10.0` desplegado; sesiones positivas, S13 privado y datos privados no certificados | tag `4108ca0`, deployment release `READY` y gate histórico 11/11; hotfix post-release `e74339c` bloquea el schema público y cerró 12/12; faltan smokes positivos con sesión, DB y datos remotos |
| Backend Express remoto | Condicionado | runtime y tests existen; despliegue separado no certificado |
| Correo y cron | Retirado | responden `410` y no están programados; falta auditoría tenant-bound e idempotencia |
| WhatsApp | Condicionado | requiere `PUBLIC_APP_URL` HTTPS aprobado, proveedor, secretos, plantillas y E2E externo |
| Conector PostgreSQL | Condicionado | sólo prueba de conexión; persistencia/consulta retiradas |
| Alta self-service y módulos | Retirada/bloqueada | altas Serverless y Express responden `410`; falta lifecycle persistido, invitación de un uso, MFA, SoD y auditoría antes de reintroducirlas |
| Usuarios demo por rol | Roadmap bloqueado | altas y seed responden 410/fallan con código 1; falta workflow aislado, temporal, rotado y auditado |
| Presupuesto/obras/compras con fuente real | Condicionado | no mostrar datos hasta integrar contrato gobernado |
| Ingesta unificada de archivos y DB | Roadmap | existen entradas separadas; faltan landing, linaje y orquestación comunes |
| Backup automatizado y restore probado | Roadmap | S14B confirmó y eliminó un snapshot→restore descartable mediante control plane; no certifica retención, automatización, RPO/RTO ni restore operativo periódico |
| O2B extracción conectada/programada y CDC | Roadmap | requiere acceso read-only/TLS, landing, staging, scheduler, identidad de workload y SLA |
| Mapas y analítica geoespacial | Roadmap | sin fuente geo gobernada; no dibujar coordenadas ni calor inventados |
| Analítica ejecutiva cross-domain | Roadmap | GRH descriptivo existe; otros dominios requieren contratos y reconciliación |
| Observabilidad/SLO distribuidos | Roadmap | señales parciales, sin plataforma certificada |
| Ámbitos por área/fila/campo, vigencia y doble control | Roadmap | techo exacto por ruta ya existe; persistencia RBAC/ABAC y SoD siguen pendientes |
| PWA/offline | Roadmap | no hay registro activo de service worker certificado |

## 20. Definition of Done

Una feature sólo está terminada cuando cumple, según su riesgo:

1. alcance y fuente reales documentados;
2. sin fallback demo ni datos fabricados;
3. contrato de entrada/salida versionado o explícito;
4. autorización server-side y aislamiento por tenant;
5. validación, límites, transacción e idempotencia donde corresponda;
6. estados de carga, vacío, parcial, error y reintento honestos;
7. accesibilidad, responsive, impresión y movimiento reducido si tiene UI;
8. pruebas focalizadas y suite relevante en verde, con cantidad de tests mayor a
   cero y skips justificados;
9. locks/auditoría de dependencias aprobados;
10. migración, variables, monitoreo, rollback y operación documentados;
11. privacidad: sin PII, dumps o secretos fuera del alcance aprobado;
12. este manual y los documentos de contrato actualizados en el mismo cambio;
13. smoke remoto exitoso y evidencia registrada si se declara desplegada;
14. restore probado si el cambio modifica datos o migraciones productivas.

Si faltan los puntos 13 o 14 cuando aplican, el estado es **validado localmente**
o **condicionado**, no **productivo**.

## 21. Documentación y fuentes de procedimiento

Fuentes de contexto vigentes a consultar junto con este manual:

- `README.md`: visión, decisiones GRH y estado funcional;
- [`DATA_SOURCE_REGISTER.md`](DATA_SOURCE_REGISTER.md): autoridad, sensibilidad,
  frescura, uso permitido y gates antes de incorporar archivos o conectores;
- `docs/data/grh-semantic.md`: contrato de datos;
- `docs/GRH_PRIVACY_AGGREGATION_POLICY.md`: política de celdas pequeñas, salidas
  portables y reconciliación segura;
- `docs/GRH_OPERATIONS_ROADMAP.md`: ingesta, CDC, backups y observabilidad objetivo;
- `docs/GRH_PIPELINE_RUN_CONTRACT.md`: contrato O2A, idempotencia, estados,
  receipts, last-known-good y límites de evidencia local;
- `docs/MASTER_PLAN_STATUS.md`: reconciliación de plan y evidencia;
- `docs/ENTERPRISE_PRODUCT_ROADMAP.md`: fases, stack objetivo, roles y gates;
- `docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md`: recorridos, SoD y gate de cuentas por perfil;
- `docs/RBAC_ABAC_DATA_MODEL.md`: propuesta aislada de persistencia, lifecycle, scopes y rollout de autorización;
- `docs/ACCOUNT_LIFECYCLE_STATE_MACHINE.md`: fundación pura y no conectada de cuenta, invitación y sesión;
- `docs/ACCOUNT_LIFECYCLE_PRISMA_MAPPING.md`: mapper puro IAM-MAP-01, sin DB, persistencia ni identidades;
- `docs/PRISMA_BASELINE_Y_DRIFT.md`: gate offline/release, evidencia conectada, restore y rollback antes de migrar;
- `docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md`: recorridos, decisiones y respuesta a incidentes;
- `NEON_SETUP.md`: Prisma/Neon y gates remotos;
- `DEPLOYMENT.md`: release, preview, smoke, producción y rollback;
- `backend/README.md`: runtime Express.

Gates documentales vigentes:

- `DATABASE_SETUP.md` es sólo una entrada hacia la ruta Prisma canónica; no
  contiene un segundo schema ni una instalación alternativa implícita.
- `docs/DEPLOY_LOCAL.md` declara el paquete on-premise como roadmap. Los archivos
  Docker/Nginx heredados se retiraron para impedir una ejecución accidental.
- `backend/.env.example` enumera nombres y estados seguros, nunca valores reales.
  `tests/operations-documentation.test.mjs` escanea referencias estáticas
  `process.env.*` del runtime y agrega una lista explícita sólo cuando la lectura
  dinámica esté gobernada; cualquier diferencia bloquea el release.
- La migración continúa bloqueada aunque el baseline S14C esté revisado y
  reproducido: faltan ownership/naming gobernados del target, drift conectado,
  backup restaurado y atestación institucional CI/KMS/OIDC. Un receipt de replay
  o preflight no autoriza el release.

### Obligación por feature

El PR o entrega debe responder explícitamente:

- ¿cambió una ruta, payload, código HTTP o rol?
- ¿cambió una variable o secreto?
- ¿cambió una fuente, definición de KPI o límite?
- ¿cambió una migración, backup o rollback?
- ¿cambió un comando o suite de pruebas?
- ¿cambió el estado Operativo/Condicionado/Roadmap?

Si alguna respuesta es sí, actualizar este manual. La documentación desactualizada
es un defecto de la feature y bloquea su Definition of Done.

Cambio 1.8.0: registra WP0-L, IAM-MAP-01, UX-E2A y el antecedente del preview
protegido `fa5dcc5`. El release quedó integrado en `master` y su superficie
pública productiva cerró 9/9 con código de salida `0`. WP0-L no se ejecutó
conectado; IAM-MAP-01 no persiste ni crea usuarios; el shell no concede
autorización. No declara DB conectada, baseline, migración, cuentas reales ni
datos GRH remotos.

Cambio 1.8.1: incorpora `/roles`, su contrato visual
`public-role-tour-v1` y la inclusión network-first en el cache público v5, que
continúa excluyendo `/api`. El artefacto `b82c0b3` está en `master`/tag `v1.8.1`,
el deployment `dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` figura `Ready`, el gate
productivo cerró 10/10 exit `0`, la verificación 390/1440 px quedó sin overflow,
consola ni requests externos/privados y la GitHub Release está live. El tour no
autentica, no usa JWT/storage y no demuestra autorización, DB, cuentas o datos
municipales. Este commit sólo registra el cierre post-release; el tag no se
mueve.

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
