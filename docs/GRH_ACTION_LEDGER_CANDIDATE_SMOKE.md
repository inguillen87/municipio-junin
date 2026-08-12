# Smoke externo del Centro de decisiones GRH

Este runbook es propiedad del flujo `grh-action-ledger-candidate-smoke-v1` y no
reemplaza al Release Truth Gate público. Verifica un deployment candidato único
de Vercel para `/decisiones-grh` y `/api/grh-action-ledger`; no crea deployments,
no promociona aliases y no ejecuta migraciones.

## Dos gates deliberadamente separados

### 1. Candidate read-only, predeterminado

Es el primer gate. Puede ejecutarse contra un Preview o contra el candidato
final creado con `vercel deploy --prod --skip-domain`, siempre mediante su URL
única y antes de promover el alias. Comprueba:

- URL inmutable `*.vercel.app`, deployment ID, estado `READY`, target `preview`
  o `production` y Git SHA exactos mediante `vercel inspect` + `vercel ls`, antes
  y después;
- el alias estable se inspecciona antes y despues de inspeccionar el candidato:
  debe seguir apuntando al mismo deployment ID y ese ID debe ser distinto del
  candidato (un candidato ya promovido se rechaza);
- HTML de `/decisiones-grh` byte-equivalente al documento local autorizado;
- login y `GET /api/grh-action-ledger` con identidades `INTENDENTE`, `CONTADOR`
  y una identidad de demostración publicada con rol lector;
- contrato `grh-action-ledger-v1`, misma evidencia entre roles y permisos de la
  identidad publicada limitados a lectura.

No emite `POST` ni `PATCH` al ledger. La URL de Production estable siempre se
rechaza. Un target `production` sólo es válido aquí cuando es el deployment
único `--prod --skip-domain`; este gate no lo promueve ni muta su ledger.

### 2. Candidate mutante, sólo Preview disposable

Agrega el recorrido funcional completo, pero permanece bloqueado hasta recibir
dos pruebas operativas explícitas:

1. `MUNICONTROL_LEDGER_MUTATION_SCOPE=DISPOSABLE_PREVIEW_LEDGER_V1`;
2. `MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT`, SHA-256 del target
   disposable emitido por el verificador PostgreSQL conectado.

Antes de cualquier `POST` o `PATCH` al ledger, los tres `GET` autenticados deben
devolver el header `X-MuniControl-Database-Target-SHA256`, coincidir entre roles
y ser exactamente igual al fingerprint autorizado. El helper compartido trata
las URLs Neon direct y pooler del mismo endpoint como un unico target, pero
mantiene distintos un endpoint main y un child. Si falta o difiere el header,
el smoke termina cerrado sin mutar y el receipt de fallo no afirma ningun pin.

Luego verifica:

- `CONTADOR` y demo no pueden crear; demo tampoco puede actualizar;
- `INTENDENTE` crea un compromiso asignado a `CONTADOR`;
- el mismo `commandId` reproduce el `POST` como `200` sin duplicar;
- `INTENDENTE` reprograma y `CONTADOR` reclama y completa;
- la historia final conserva `create → reschedule → claim → complete`, versiones
  1–4 y es visible por los tres perfiles.

Los command IDs son deterministas por deployment, Git SHA, fingerprint
disposable, evidencia y usuarios. Si una respuesta mutante queda ambigua, se
vuelve a ejecutar el mismo comando: no se genera otro compromiso. No existe
cleanup `DELETE`; la evidencia append-only se conserva en el target disposable.

## Credenciales

Las identidades deben estar aprovisionadas por el lifecycle institucional en el
tenant candidato. Ningún correo, contraseña o JWT va en argumentos, archivos o
receipts. Se inyectan sólo por entorno:

```text
MUNICONTROL_LEDGER_INTENDENTE_EMAIL
MUNICONTROL_LEDGER_INTENDENTE_PASSWORD
MUNICONTROL_LEDGER_CONTADOR_EMAIL
MUNICONTROL_LEDGER_CONTADOR_PASSWORD
MUNICONTROL_LEDGER_DEMO_EMAIL
MUNICONTROL_LEDGER_DEMO_PASSWORD
```

La identidad demo debe pertenecer a la lista publicada y conservar su rol
lector exacto (`INTENDENTE`, `TENANT_ADMIN` o `CONTADOR`). Para el gate mutante,
las identidades operativas `INTENDENTE` y `CONTADOR` deben ser privadas; el
techo read-only de las identidades publicadas impediría probar el workflow.

Las contraseñas y los JWT se envían a `vercel curl` exclusivamente mediante una
configuración por `stdin`. Los argumentos del proceso contienen sólo ruta y URL
candidata. El receipt saneado incluye deployment, Git SHA, fingerprints,
checks y conteos; nunca token, correo, user ID, cuerpo HTTP ni error crudo.

## Ejecución

Configurar los seis secretos anteriores en una consola local segura. Los pines
no secretos pueden ir por argumentos o por sus equivalentes de entorno:

```powershell
$env:MUNICONTROL_LEDGER_CANDIDATE_URL='https://candidate-unique.vercel.app'
$env:MUNICONTROL_LEDGER_CANDIDATE_DEPLOYMENT_ID='dpl_...'
$env:MUNICONTROL_LEDGER_EXPECTED_GIT_SHA='<40-hex>'

npm.cmd run smoke:grh-ledger:candidate
```

Sólo después de registrar y autorizar un target disposable:

```powershell
$env:MUNICONTROL_LEDGER_MUTATION_SCOPE='DISPOSABLE_PREVIEW_LEDGER_V1'
$env:MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT='<64-hex>'

npm.cmd run smoke:grh-ledger:candidate:mutate
```

Ambos comandos terminan `0` únicamente con todos los checks aprobados. El
receipt se captura en el sistema externo de release; no se commitea. Un gate
verde prueba ese deployment y ese target; no prueba promoción del alias estable,
backups ni migración. El modo mutante continúa limitado exclusivamente a
`preview` disposable, aunque el modo read-only acepte el candidato final con
target `production`.

## Gate local sin red

```powershell
node --test tests/grh-action-ledger-candidate-smoke.test.mjs
npm.cmd run smoke:grh-ledger:candidate -- --help
```

La suite usa transports falsos: verifica configuración, pines, replay,
ownership, saneamiento y estabilidad del candidato sin abrir red ni desplegar.
