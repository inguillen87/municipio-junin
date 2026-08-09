# Changelog de MuniControl

Este archivo registra versiones del código y la documentación del repositorio.
Una versión o tag no demuestra por sí sola que exista un preview o deployment
certificado; esa afirmación requiere el gate de verdad del release y evidencia
externa del candidato exacto.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Agregado

- **S14B — aislamiento DB y observación WP0 conectada (`Unreleased`):**
  Preview y Production quedaron mapeados a branches DB distintos y las cuatro
  conexiones remotas de runtime/migración exigen `sslmode=verify-full`. El
  mapping de proveedor, proyecto y branch quedó identificado. Esto acredita el
  aislamiento de los targets DB observados, no una plataforma privada completa,
  cuentas reales ni autorización positiva.
- El control plane del proveedor confirmó por separado que el snapshot
  `snap-autumn-shape-ac7473wo` provenía de main y que el restore descartable
  `br-flat-waterfall-acylyfjv` estaba `ready`. Tras la observación, el cleanup
  confirmó ausentes tanto el restore como el snapshot, main y Preview `ready`,
  el directorio temporal ausente y el artefacto externo retenido fuera del repo.
- **Antecedente S14A — contrato local WP0-L v2:**
  `wp0_restored_copy_observation` distingue `absent`, `empty`, `inconsistent` y
  `valid`. Los tres primeros estados producen `discovery_non_approvable`; `valid`
  produce `strict`; todos conservan `approvalEligible:false` y no habilitan un
  baseline, una migración o una cuenta.
- El catálogo ampliado se ordena de forma canónica y persiste
  `definitionSha256`, no definiciones SQL crudas. Aplica límites fail-closed, sin
  truncado, de 20.000 filas, 1 KiB por campo distinto de la definición, 256 KiB
  por definición y 4 MiB acumulados.

### Seguridad

- Como antecedente, S14A había registrado `DB_CONFIG_ISOLATION=FAIL`,
  `DB_CONFIG_SSLMODE_VERIFY_FULL=false` y `NEON_MAPPING=UNKNOWN`; esos valores
  describen aquel NO-GO y no el estado actual.
- La reauditoría cerró `DB_CONFIG_ISOLATION=PASS`,
  `DB_CONFIG_SSLMODE_VERIFY_FULL=true` y `NEON_MAPPING=IDENTIFIED`, sin persistir
  URLs ni secretos. WP0 usó un observador de mínimo privilegio y una transacción
  `REPEATABLE READ READ ONLY`; el socket cliente negoció `TLSv1.3` antes del
  inventario. Esto no autoatesta la cadena del certificado ni el endpoint
  directo del proveedor.
- Durante la operación una salida administrativa expuso una credencial owner. La
  credencial fue rotada, el valor anterior quedó invalidado y no se reproduce en
  el repositorio ni en esta documentación.

### Estado verificable

- WP0 se ejecutó conectado desde el commit
  `38b25e80e8413cc8688f393de2930e77098eb3f4`. El artefacto externo
  `wp0-observation-48054484dbcd80ffbaa46a197a97ccfb3a8a1a97223e868dc1e755d010d8ada4`
  tiene SHA-256
  `64b1571c36adafe6d6b65b11c3fd109131e7e7bcff84c4cd060dfbdea82573a1`,
  registró 968 filas de catálogo y encontró `_prisma_migrations` `absent`.
  Quedó `discovery_non_approvable` y `approvalEligible:false`.
- El artefacto conserva `externalReferencesVerified:false`,
  `backupRestoreRelationVerified:false`, `reviewerIndependenceVerified:false` y
  `signedProviderReceiptVerified:false`. La auditoría del control plane es
  evidencia externa separada y no convierte la observación en approval, baseline,
  migración, drift aprobado o autorización DDL.
- La revalidación local S14B con `npm.cmd run test:all` cerró 619 pruebas raíz:
  618 aprobadas, 0 fallidas y 1 smoke opt-in omitido; backend cerró 20/20. Estos
  conteos pertenecen al incremento `Unreleased` y no reemplazan la evidencia
  histórica 591/590 de `v1.10.0`.
- S14B no modifica ni recertifica el release público `v1.10.0`: se conserva su
  evidencia vigente de 11/11 dentro del alcance público ya registrado. El
  incremento permanece `Unreleased`, sin bump de paquete, tag, `v1.11.0` ni
  GitHub Release.

### Pendiente

- Construir y revisar el baseline real desde el estado observado, evaluar drift y
  producir el receipt y la atestación institucional independientes antes de DDL.
- Diseñar, migrar y probar la persistencia IAM antes de crear identidades.
- Implementar y probar el lifecycle gobernado antes de entregar cuentas por rol.

## [1.10.0] - 2026-08-09

### Agregado

- **S13 — brief ejecutivo GRH:** `GET /api/grh-decision-brief` publica el contrato
  `grh-decision-brief-v1`, un brief único derivado de agregados del snapshot
  aprobado, con validación local. Separa la señal global cross-source de la evidencia
  mensual y conserva `temporalQuarantineRows` como señal de calidad explícita.
- El Panel integra el brief con CTA allowlisted sólo cuando la sesión validada
  contiene la `requiredCapability`. MuniGuía suma el anchor real
  `#decisionBrief` para revisar esa separación sin ampliar autorización.

### Seguridad

- El contrato aplica `grh-small-cell-v1` con k=10 y no exporta PII, identificadores,
  filas crudas, importes, códigos de fuente/celda ni etiquetas/labels. Si la celda mensual actual
  está protegida (`<10`), el Panel integral falla cerrado y no muestra métricas.
- Un 503 no activa retry automático ni fallback: se oculta el panel y queda sólo
  el reintento manual. Las CTA no aparecen sin su capability exacta.
- `shared/route-policy.cjs` avanza a `2026-08-09.2`; la access policy permanece en
  `2026-08-09.1`. El inventario exacto es 26 recursos, 12 acciones, 46 permisos y
  79 rutas protegidas: 37 Serverless + 42 Express.

### Estado verificable

- **Release público `v1.10.0` verificado.** El producto S13 está en `d11fd39`;
  el commit/tag release apunta a `4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7`
  y el objeto del tag anotado es `07ac9eacf8bd89f27f5c437b99e713e8497b8934`.
  La GitHub Release
  `https://github.com/inguillen87/municipio-junin/releases/tag/v1.10.0` está live,
  no draft y no prerelease.
- El deployment Production `dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL` quedó `READY`
  con alias `https://municipio-junin.vercel.app` y `gitSource`
  `master/4108ca0`. El gate productivo cerró 11/11 con exit `0` y
  `checkedAt 2026-08-09T16:33:56.200Z`.
- El browser público verificó 10/10 estados a 390/1440 px: `/` y `/roles`
  visibles; `/dashboard`, `/inicio` y `/manuales` anónimos redirigen al login;
  0 overflow, warnings/errores de consola, overlays, requests externos y fallas
  de red. Los logs del corte registraron 0 errores y 0 respuestas 500.
- El focal raíz S13 cerró 135/135 y el QA adversarial 104/104, con 0 P1/P2. La
  suite raíz final revalidó 591 pruebas: 590 aprobadas, 0 fallidas y 1 smoke
  opt-in omitido; backend cerró 20/20. La sesión privada positiva y S13 privado
  conservan validación local sobre el snapshot aprobado: este cierre no certifica
  DB/baseline, cuentas, MFA/lifecycle ni datos GRH remotos.
- Este commit documental post-release no mueve el tag `v1.10.0` de `4108ca0`.

## [1.9.0] - 2026-08-09

### Agregado

- **MuniGuía contextual:** el contrato local `muniguia-contextual-v1` ofrece
  tres pasos deterministas para doce rutas privadas exactas y los siete roles
  vigentes, sin reemplazar el Manual directo.
- Carga progresiva de los assets locales de ayuda sólo después de confirmar la
  sesión, la versión de política, el rol, la variante, `navigation.help`, la
  capability de la superficie y el pathname exacto.

### Seguridad

- MuniGuía no consulta IA, GRH, APIs adicionales, DB o storage; no lee
  indicadores, no crea permisos y no modifica la autorización server-side.
- Rol, variante, política, capability o ruta desconocidos fallan cerrado. Los
  selectors/anchors están verificados por CI y, si el target no está visible,
  se omite sólo «Ubicar». La guía no se monta en rutas públicas y el Manual
  sigue disponible.

### Estado verificable

- **Release público `v1.9.0` verificado.** El commit y tag `v1.9.0` apuntan a
  `f9d1f88`; el product commit es `ed76347`. El deployment
  `dpl_Euk4csdfWw5rayohoW3xXo1vXayY` figura `Ready` en `Production` con alias
  `https://municipio-junin.vercel.app`.
- `release:truth:check` cerró 10/10 con exit `0` y
  `checkedAt 2026-08-09T14:42:10Z`. El browser público verificó `/login` y
  `/roles` —sus siete perfiles— a 390 px y 1440 px sin overflow, errores de
  consola ni requests externos; `/dashboard`, `/inicio` y `/manuales` anónimos
  redirigieron al login.
- La GitHub Release
  `https://github.com/inguillen87/municipio-junin/releases/tag/v1.9.0` está live.
  El focal MuniGuía cerró 10/10; la suite raíz cerró 533 pruebas totales: 532
  aprobadas y 1 smoke opt-in omitido; el backend cerró 20/20.
- La autorización positiva y MuniGuía privada sólo tienen evidencia local con
  una proyección autoritativa simulada. Este cierre no certifica cuentas reales,
  DB o baseline restaurado, MFA/lifecycle persistido ni GRH remoto. El commit
  documental post-release no mueve el tag `v1.9.0` de `f9d1f88`.

## [1.8.1] - 2026-08-09

### Agregado

- **Tour público de roles:** `/roles` presenta los siete roles técnicos vigentes
  como un recorrido visual comparativo y deriva únicamente al acceso
  institucional. No es un selector de identidad ni una demo autenticada.
- **PWA pública:** el cache network-first v5 incluye `/roles` y conserva la
  exclusión total de `/api`; no almacena respuestas privadas o autenticadas.

### Seguridad

- El contrato `public-role-tour-v1` no solicita credenciales, no emite ni acepta
  JWT, no autoriza acciones, no crea cuentas y no consulta APIs, DB, storage,
  PII ni datos municipales. Elegir un perfil sólo cambia la explicación visible.

### Estado verificable

- El artefacto `b82c0b3` está integrado en `master` y fijado por el tag
  `v1.8.1`; la GitHub Release `v1.8.1` está live.
- El deployment `dpl_A19n7grSSyuum3zuSQcdcaVKmt8F` figura `Ready` y el
  `release:truth:check` productivo cerró 10/10 controles con exit `0`.
- La verificación de navegador en producción cerró a 390 px y 1440 px sin
  overflow horizontal, errores de consola, requests externos ni requests
  privados.
- Esta evidencia certifica únicamente las superficies públicas cubiertas; no
  demuestra DB conectada, cuentas reales, autorización positiva ni datos
  municipales remotos.
- Los cambios documentales posteriores sólo registran evidencia post-release y
  no mueven el tag `v1.8.1`.

## [1.8.0] - 2026-08-09

### Agregado

- **WP0-L local:** recolector fail-closed y read-only para observar catálogos y
  `_prisma_migrations` en una futura copia restaurada descartable.
- **IAM-MAP-01:** mapper puro y versionado entre la foundation de lifecycle y el
  subconjunto reversible de la propuesta Prisma.
- **UX-E2A:** shell institucional local compartido, navegación por rol, rail
  móvil, foco, movimiento reducido, contraste, impresión y áreas táctiles.

### Seguridad

- Política canónica de URL PostgreSQL con restricciones de TLS, credenciales y
  overrides ambientales.
- WP0-L exige checkout limpio, target persistente de base descartable, sesión
  read-only y salida privada fuera del repositorio.
- IAM-MAP-01 rechaza estados no reversibles, secretos crudos, proxies, accessors,
  drift de esquema, tenant o sujeto y entradas no canónicas.

### Estado verificable

- El preview protegido del commit `fa5dcc5` fue verificado manualmente: las
  rutas `/dashboard`, `/inicio` y `/manuales` devolvieron HTML 200 con su huella
  canónica exacta. `/` mostró el acceso institucional esperado, con una única
  inyección conocida de Vercel Live que impidió igualdad byte a byte.
- Las cinco fronteras API respondieron 401 sin sesión y conservaron su identidad
  contractual específica por ruta.
- WP0-L **no se ejecutó conectado** contra una copia restaurada autorizada y no
  constituye baseline, migración, approval ni autorización de DDL.
- IAM-MAP-01 no importa Prisma Client, no persiste y no crea usuarios, sesiones,
  invitaciones o credenciales.
- UX-E2A organiza la experiencia visual; un enlace visible no concede acceso y
  toda autorización continúa siendo server-side.
- El release está integrado en `master` y la verificación pública productiva
  posterior cerró `release:truth:check` con 9/9 controles y código de salida `0`.
  Acredita las rutas y fronteras públicas cubiertas; no DB conectada,
  materialización GRH remota, cuentas reales ni autorización positiva.

[Unreleased]: https://github.com/inguillen87/municipio-junin/compare/v1.10.0...HEAD
[1.10.0]: https://github.com/inguillen87/municipio-junin/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/inguillen87/municipio-junin/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/inguillen87/municipio-junin/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/inguillen87/municipio-junin/compare/3ae026e7a2774d57856ac71f8ee52a15e9e6f5cb...v1.8.0
