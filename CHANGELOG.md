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
- Integrar el commit promovido en `master`, certificar producción con el gate
  anónimo y registrar deployment ID, commit y smokes externos.

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
- La verificación protegida acredita routing, contenido estático y rechazo sin
  sesión; no acredita `release:truth:check` anónimo verde, merge a `master`,
  producción, DB conectada, materialización GRH ni cuentas reales.

[Unreleased]: https://github.com/inguillen87/municipio-junin/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/inguillen87/municipio-junin/compare/3ae026e7a2774d57856ac71f8ee52a15e9e6f5cb...v1.8.0
