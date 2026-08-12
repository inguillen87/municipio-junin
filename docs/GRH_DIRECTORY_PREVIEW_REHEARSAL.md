# Ensayo descartable del Directorio GRH v3

Este procedimiento prepara y verifica la cadena privada aditiva `003 + 004 +
005` y la publicación `grh-directory-v3` del
Directorio GRH en un **Preview de rama conectado a una base descartable**. No es
un procedimiento de promoción ni autoriza DDL sobre Preview estable o
Producción.

## Estado actual

El 12 de agosto de 2026 se verificó que los entornos Vercel `preview` y
`production` del proyecto resolvían a la misma identidad de base. Por lo tanto,
el ensayo conectado permanece prohibido hasta asignar a la rama candidata un
destino descartable cuya huella sea diferente. La implementación, la migración
`005_grh_directory_v3.sql` y sus pruebas son locales; en este corte no se
ejecutó DDL, publicación, smoke, deployment ni promoción sobre Preview,
Production o una base remota.

## Invariantes

- El target es `preview` y el modo es exclusivamente `ddl`.
- El worktree está asociado a la rama candidata, su `HEAD` coincide con
  `refs/remotes/origin/<rama>` y sólo puede contener el endpoint temporal
  generado.
- `DIRECT_URL` de Producción y de la rama Preview se identifican con una huella
  SHA-256 canónica que no contiene host, usuario, contraseña ni query string.
- El comando `apply` vuelve a calcular ambas huellas desde los entornos Vercel
  efectivos y corta antes de agregar variables, desplegar o conectar si algún
  pin no coincide o si ambos destinos son iguales.
- La rama Preview debe tener `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`,
  `GRH_TENANT_ID`, `GRH_SOURCE_SHA256` y `GRH_ARTIFACT_SOURCE`.
- La allowlist piloto y el secreto bootstrap se cargan por `stdin`, con scope
  exacto de rama, y se eliminan durante el cleanup.
- El deployment debe quedar `READY`, ser target Preview y conservar el Git SHA
  y la ref exactos. El alias estable de Producción debe permanecer inmóvil y no
  puede ser el candidate.
- El endpoint y los recibos deben declarar `grh-directory-v3`; la verificación
  prueba también los filtros `reportedStatus`, `contractRegime` y
  `serviceSituation`, no sólo el conteo publicado.
- Los recibos sólo conservan IDs, conteos y huellas opacas; no contienen
  credenciales, URLs de base ni filas nominales.

## Preparación

La base descartable, su backup/restore y las credenciales se crean y registran
fuera del repositorio. El artefacto v3 validado y el directorio de estado también deben
estar fuera del checkout.

```powershell
git fetch origin
git status --short
git rev-parse HEAD
git rev-parse "refs/remotes/origin/<rama-candidata>"

# Calcular cada pin desde el entorno efectivo. La salida es sólo un hash de 64 hex.
vercel.cmd env run -e production -- `
  node scripts/print-database-target-fingerprint.mjs
vercel.cmd env run -e preview --git-branch <rama-candidata> -- `
  node scripts/print-database-target-fingerprint.mjs

node scripts/grh-directory-production-bootstrap.mjs prepare `
  --target preview `
  --mode ddl `
  --preview-branch <rama-candidata> `
  --database-target-sha256 '<huella-preview-descartable>' `
  --stable-database-target-sha256 '<huella-production-observada>' `
  --worktree '<worktree-candidato>' `
  --artifact '<ruta-privada-grh-directory-v3.json>' `
  --state-dir '<directorio-privado-nuevo>'
```

Si las dos huellas son iguales, no se continúa. No se corrigen pins a mano para
forzar el paso: primero se corrige el destino de la rama.

## Aplicación y verificación

El literal de confirmación se conserva por compatibilidad con el bootstrap
existente. En Preview no amplía el target ni habilita Producción.

```powershell
$confirmation = 'municipio-junin-production-one-shot'
$state = '<directorio-privado>\grh-directory-bootstrap.state.json'

node scripts/grh-directory-production-bootstrap.mjs apply `
  --state $state `
  --confirm-production-one-shot $confirmation

node scripts/grh-directory-production-bootstrap.mjs verify --state $state

node scripts/grh-directory-production-bootstrap.mjs cleanup `
  --state $state `
  --confirm-production-one-shot $confirmation
```

Ante una respuesta ambigua se usa `resolve` con el mismo state y confirmación;
nunca se crea un segundo state ni se repite la mutación con otro command ID.
`verify-production` y `finalize` rechazan estados Preview.

## Evidencia mínima

Registrar fuera del repositorio: rama, Git SHA, deployment ID y URL única,
fingerprints opacos de candidate y estable, ID de la base descartable, evidencia
de backup/restore, timestamps de apply/verify/cleanup y estado final `cleaned`.
Un PASS local de los tests no reemplaza este recibo conectado.

Gate local:

```powershell
node --test tests/grh-directory-production-bootstrap.test.mjs
node --test tests/grh-directory-v3-bootstrap.test.mjs `
  tests/grh-directory-v3-storage.test.mjs `
  tests/grh-directory-v3-endpoint.test.mjs
node --check scripts/grh-directory-production-bootstrap-lib.mjs
git diff --check
```
