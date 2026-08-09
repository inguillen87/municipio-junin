# IAM-MAP-01 — Mapeo puro lifecycle ↔ propuesta Prisma

**Versión del mapper:** `IAM-MAP-01/1.0.0`
**Foundation fijada:** `2026-08-08.1`
**Propuesta fijada:** `rbac-abac-v1/1.0.0`
**Estado:** contrato puro y local; sin persistencia, migración ni cuentas

## Propósito y límite

[`../shared/account-lifecycle-prisma-mapper.cjs`](../shared/account-lifecycle-prisma-mapper.cjs)
cierra el drift de nombres y estados entre la máquina ejecutable
[`../shared/account-lifecycle.cjs`](../shared/account-lifecycle.cjs) y las
proyecciones mínimas de
[`../prisma/proposals/rbac-abac-v1.prisma`](../prisma/proposals/rbac-abac-v1.prisma).

El mapper:

- no importa Prisma Client;
- no abre una DB ni genera SQL;
- no crea usuarios, invitaciones, sesiones o credenciales;
- no calcula hashes ni recibe secretos crudos;
- no agrega defaults de Prisma ni completa columnas ausentes;
- no muta la entrada y congela recursivamente resultados exitosos o denegados;
- sólo traduce el subconjunto que puede volver exactamente al contrato de origen.

Por lo tanto, este incremento **no habilita** `db:seed`, altas administrativas,
cuentas demo, login por lifecycle, migraciones ni el uso de la propuesta como
schema activo.

## API y envelopes versionados

El módulo exporta exclusivamente dos direcciones:

```js
mapFoundationLifecycleToPrisma(foundationEnvelope)
mapPrismaLifecycleToFoundation(prismaEnvelope)
```

Cada envelope debe declarar exactamente:

```text
mappingVersion       = IAM-MAP-01/1.0.0
foundationVersion    = 2026-08-08.1
prismaProposalVersion = rbac-abac-v1/1.0.0
```

Una versión faltante, anterior o desconocida devuelve
`IAM_MAPPING_VERSION_MISMATCH`. Las claves faltantes o adicionales devuelven
`IAM_MAPPING_KEYS_INVALID`. No existe negociación silenciosa de versiones.

La salida tiene forma `{ ok, code, value }` cuando el mapeo es completo, o
`{ ok, code, path }` cuando se deniega. Nunca se devuelve una traducción parcial.

## Proyecciones exactas

El mapper no acepta un registro completo de Prisma. Un futuro adaptador deberá
seleccionar y serializar únicamente estas columnas, con timestamps UTC canónicos
`YYYY-MM-DDTHH:mm:ss.sssZ` y `null` explícito cuando corresponda.

Campos de persistencia sin equivalente —por ejemplo `pepperKeyId`, versiones de
token/autorización, `sessionId`, `familyVersion`, `policyVersion` y
timestamps de auditoría— permanecen fuera del mapper. Su ausencia impide usar la
salida como `create`/`update` de Prisma y evita inventar valores de seguridad.

| Foundation | Proyección de la propuesta |
|---|---|
| `account.{id, tenantId, state, expiresAt}` | `userSecurityState.{userId, tenantId, lifecycleStatus, accountExpiresAt}` |
| `invitation.{id, accountId, tenantId, tokenDigest, attemptCount, maxAttempts, expiresAt, usedAt, revokedAt, lockedAt}` | `oneTimeCredential.{id, userId, tenantId, purpose=ACCOUNT_ACTIVATION, tokenDigest, failedAttempts, maxAttempts, expiresAt, consumedAt, revokedAt, status}` |
| `refreshFamily.{id, accountId, tenantId, latestSequence, revokedAt}` | `refreshTokenFamily.{id, userId, tenantId, currentSequence, revokedAt, status}` |

`invitation`/`oneTimeCredential` y `refreshFamily`/`refreshTokenFamily` pueden ser
`null`, pero sus claves de envelope siempre deben existir. Esto evita que una
ausencia accidental sea reinterpretada como un default.

## Matriz de estados de cuenta

La foundation posee seis estados y la propuesta ocho. Sólo la intersección exacta
es reversible:

| Foundation | Propuesta | Resultado |
|---|---|---|
| `INVITED` | `INVITED` | Mapeado |
| `FIRST_LOGIN_REQUIRED` | `FIRST_LOGIN_REQUIRED` | Mapeado |
| `ACTIVE` | `ACTIVE` | Mapeado |
| `SUSPENDED` | `SUSPENDED` | Mapeado |
| `EXPIRED` | `EXPIRED` | Mapeado |
| `REVOKED` | `REVOKED` | Mapeado |
| inexistente | `LOCKED` | Denegado: no representable |
| inexistente | `TERMINATED` | Denegado: no representable |
| cualquier otro | desconocido | Denegado: no representable |

El mapper también rechaza `LOCKED` o `TERMINATED` si alguien intenta introducirlos
del lado foundation. No colapsa `LOCKED` a `SUSPENDED` ni `TERMINATED` a `REVOKED`.

## Invitaciones y credenciales de un uso

Los renombres reversibles son:

| Foundation | Propuesta |
|---|---|
| `accountId` | `userId` |
| `attemptCount` | `failedAttempts` |
| `usedAt` | `consumedAt` |
| `usedAt = null`, `revokedAt = null`, `lockedAt = null` | `status = ISSUED` |
| `usedAt != null`, restantes terminales `null` | `status = CONSUMED` |
| `revokedAt != null`, restantes terminales `null` | `status = REVOKED` |

`lockedAt` expone un drift no reversible: `OneTimeCredential.status = LOCKED` no
conserva el instante del bloqueo. Inventar ese instante desde `createdAt`,
`expiresAt` o el reloj actual cambiaría evidencia de seguridad. Por ello:

- foundation con `lockedAt != null` se deniega;
- propuesta con `status = LOCKED` se deniega;
- propuesta con `status = EXPIRED` también se deniega porque la foundation no
  conserva ese estado explícito ni un reloj de materialización;
- dos marcadores terminales simultáneos se deniegan;
- un contador negativo, no entero, sin máximo positivo o ya agotado se deniega.

Una migración futura deberá resolver esos drifts de esquema antes de persistir
decisiones. El mapper no los oculta.

La credencial de un uso debe declarar exactamente
`purpose = ACCOUNT_ACTIVATION`. `PASSWORD_RESET`, `EMAIL_VERIFICATION`,
`MFA_ENROLLMENT`, `INITIAL_PASSWORD_SETUP`, `DEMO_ACTIVATION` y cualquier valor
desconocido se deniegan: no pueden reinterpretarse como una invitación de alta.

## Familias refresh

`latestSequence` se traduce exactamente a `currentSequence`. `ACTIVE` exige
`revokedAt = null`; `REVOKED` exige un timestamp canónico. `EXPIRED` se deniega
porque la familia foundation no conserva expiración ni estado explícito de
expiración. Secuencias negativas, `-0`, no enteras o fuera del rango Prisma
`Int` `0..2147483647` se deniegan sin coerción. El mismo rango gobierna los
contadores de intentos de invitación.

## Invariantes fail-closed

Ambas direcciones rechazan:

| Drift o entrada | Código |
|---|---|
| secreto crudo en cualquier profundidad | `IAM_MAPPING_RAW_SECRET_FORBIDDEN` |
| claves faltantes, adicionales o aliases de ambos contratos | `IAM_MAPPING_KEYS_INVALID` |
| versiones no exactas | `IAM_MAPPING_VERSION_MISMATCH` |
| IDs vacíos, con whitespace/control, no string o tenant `null` | `IAM_MAPPING_IDENTIFIER_INVALID` |
| timestamps no canónicos o tipos alternativos | `IAM_MAPPING_TIMESTAMP_INVALID` |
| digest distinto de SHA-256 hexadecimal minúsculo de 64 caracteres | `IAM_MAPPING_DIGEST_INVALID` |
| contadores inválidos o agotados | `IAM_MAPPING_COUNTER_INVALID` |
| `LOCKED`, `TERMINATED`, expiración de familia u otro estado no representable | `IAM_MAPPING_STATE_NOT_REPRESENTABLE` |
| status y timestamps contradictorios | `IAM_MAPPING_STATUS_INCONSISTENT` |
| `accountId`/`userId` distinto del sujeto de cuenta | `IAM_MAPPING_SUBJECT_MISMATCH` |
| tenant de invitación/familia distinto del tenant de cuenta | `IAM_MAPPING_TENANT_MISMATCH` |

`tokenDigest` es el único campo con `token` permitido. Nombres de contenedor o
versionado conocidos no se interpretan como secretos; cualquier `rawToken`,
`password`, `secret`, `authorization`, alias o variante normalizada se rechaza
antes de evaluar la forma.

La frontera rechaza `Proxy` de Node, incluso anidados, antes de ejecutar sus
trampas de reflexión. Getters, setters, propiedades no enumerables y claves
`Symbol` también se rechazan; el mapeo posterior usa sólo snapshots de datos y no
invoca accessors. La prueba contractual fija además nombres, tipos, nulabilidad y
atributos Prisma de toda la superficie proyectada, incluidas sus identidades.

## Prueba y condición para una integración futura

La suite focal es:

```powershell
node --test tests/account-lifecycle-prisma-mapper.test.mjs
```

[`../tests/account-lifecycle-prisma-mapper.test.mjs`](../tests/account-lifecycle-prisma-mapper.test.mjs)
cubre round-trip en ambas direcciones, los seis estados comunes y una matriz
negativa por estado no representable, status/timestamp, digest, contador,
versiones, claves, secretos, tenant y sujeto.

Antes de conectar este mapper se mantienen todos los gates de baseline/drift,
migración reversible, transacción atómica, invitación de un uso, sesiones
revocables, MFA, auditoría append-only, rate limit y restore. El mapper es una
frontera de compatibilidad; no es un adaptador de persistencia ni una autorización
para aplicar la propuesta.
