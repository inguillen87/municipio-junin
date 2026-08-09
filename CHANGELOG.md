# Changelog de MuniControl

Este archivo registra versiones del código y la documentación del repositorio.
Una versión o tag no demuestra por sí sola que exista un preview o deployment
certificado; esa afirmación requiere el gate de verdad del release y evidencia
externa del candidato exacto.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Pendiente

- Ejecutar WP0 conectado sobre una copia restaurada descartable y autorizada.
- Diseñar, migrar y probar la persistencia IAM antes de crear identidades.
- Implementar y probar el lifecycle gobernado antes de entregar cuentas por rol.

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

- **Candidato local, todavía sin push, tag, Preview ni Producción.** El focal
  MuniGuía cerró 10/10; la suite raíz cerró 532 pruebas aprobadas y 1 smoke
  opt-in omitido; el backend cerró 20/20.
- Esta evidencia local no demuestra deployment, cuentas nuevas, autorización
  positiva, DB conectada ni datos municipales remotos. La última evidencia
  productiva verificada continúa siendo `v1.8.1`.

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

[Unreleased]: https://github.com/inguillen87/municipio-junin/compare/v1.9.0...HEAD
[1.9.0]: https://github.com/inguillen87/municipio-junin/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/inguillen87/municipio-junin/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/inguillen87/municipio-junin/compare/3ae026e7a2774d57856ac71f8ee52a15e9e6f5cb...v1.8.0
