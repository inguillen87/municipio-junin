# Máquina de estados de cuentas y sesiones

**Estado:** fundación pura, no conectada  
**Versión del contrato:** `2026-08-08.1`  
**Alcance:** diseño ejecutable y pruebas; no crea tablas, usuarios, invitaciones ni sesiones.

## Propósito y límite de seguridad

`shared/account-lifecycle.cjs` concentra decisiones deterministas para que una futura implementación no disperse reglas críticas entre endpoints. Hoy no está conectado a Prisma ni a ninguna API. Por lo tanto, este contrato no habilita cuentas demo ni certifica el ciclo de vida en producción.

El módulo no recibe contraseñas o tokens crudos, no genera credenciales, no calcula hashes, no escribe auditoría y no persiste estados. Sólo acepta digests SHA-256 hexadecimales ya calculados y produce una decisión inmutable. El adaptador futuro deberá comparar y persistir dentro de una transacción, con bloqueo o control de versión, y registrar el resultado en auditoría append-only.

## Estados y transiciones permitidas

| Estado actual | Evento | Próximo estado |
|---|---|---|
| `INVITED` | `ACCEPT_INVITATION` | `FIRST_LOGIN_REQUIRED` |
| `INVITED` | `EXPIRE` | `EXPIRED` |
| `INVITED` | `REVOKE` | `REVOKED` |
| `FIRST_LOGIN_REQUIRED` | `COMPLETE_FIRST_LOGIN` | `ACTIVE` |
| `FIRST_LOGIN_REQUIRED` | `SUSPEND` | `SUSPENDED` |
| `FIRST_LOGIN_REQUIRED` | `EXPIRE` | `EXPIRED` |
| `FIRST_LOGIN_REQUIRED` | `REVOKE` | `REVOKED` |
| `ACTIVE` | `SUSPEND` | `SUSPENDED` |
| `ACTIVE` | `EXPIRE` | `EXPIRED` |
| `ACTIVE` | `REVOKE` | `REVOKED` |
| `SUSPENDED` | `REINSTATE` | `ACTIVE` |
| `SUSPENDED` | `EXPIRE` | `EXPIRED` |
| `SUSPENDED` | `REVOKE` | `REVOKED` |
| `EXPIRED` | `REVOKE` | `REVOKED` |

Toda arista no listada se rechaza. `REVOKED` es terminal. Aceptar una invitación exige una decisión de consumo válida para la misma cuenta y tenant. Completar el primer ingreso o rehabilitar una cuenta exige asignación activa y no vencida; los roles privilegiados también exigen MFA enrolado y verificado.

Suspender, vencer o revocar devuelve el efecto obligatorio `REVOKE_ALL_SESSION_FAMILIES`. La futura capa transaccional deberá cumplir ese efecto antes de considerar aplicado el cambio.

## Invitaciones de un uso

- Sólo se almacena `tokenDigest`; propiedades como `token`, `rawToken`, `password` o `secret` invalidan el registro.
- El vencimiento es exclusivo: `expiresAt <= now` ya está vencido.
- `usedAt`, `revokedAt`, `lockedAt` y el máximo de intentos bloquean el consumo.
- Un digest incorrecto propone incrementar `attemptCount`; al alcanzar el límite también propone `lockedAt`.
- Un digest correcto propone `usedAt` y el paso a `FIRST_LOGIN_REQUIRED`.
- La decisión nunca devuelve el digest presentado ni el almacenado.

La integración deberá generar tokens con CSPRNG, entregar el valor crudo una sola vez por un canal aprobado, calcular un digest resistente, evitar logs y telemetría con secretos y aplicar consumo/contador atómicamente para impedir carreras.

## Sesiones access y refresh

Una sesión access sólo es válida si ella, la cuenta y la asignación pertenecen al mismo sujeto y tenant, no están revocadas o vencidas y el gate MFA correspondiente fue satisfecho.

Cada refresh pertenece a una familia y posee una secuencia. El refresh vigente puede rotar una sola vez. Reutilizar un refresh ya consumido o con secuencia anterior propone revocar la familia completa con motivo `REFRESH_REUSE`. Un digest incorrecto sólo se rechaza: no se interpreta como reuse. Una secuencia futura respecto de la familia se rechaza como inconsistencia.

El módulo no emite el próximo token. La futura integración deberá crear su digest y vencimiento, consumir el anterior y avanzar la familia en una única transacción. También deberá revocar la familia ante suspensión, vencimiento, revocación, cambio sensible de permisos o incidente.

## MFA, vencimientos y segregación de funciones

`SUPER_ADMIN`, `INTENDENTE`, `TENANT_ADMIN` y `CONTADOR` son privilegiados en esta versión y requieren MFA. Roles desconocidos se rechazan. Los vencimientos de cuenta, asignación, invitación y sesión se evalúan contra un reloj inyectado; el instante exacto de vencimiento ya deniega.

Las aprobaciones exigen identificadores canónicos y `requesterId != approverId`. La segregación se aplica al plan demo y queda disponible para futuras operaciones sensibles. Revocar o suspender por emergencia no depende de doble aprobación; retrasar esa contención empeoraría la seguridad.

## Plan demo seguro

`planDemoProvisioning` es exclusivamente un dry-run sin efectos. Rechaza:

- cualquier `SUPER_ADMIN`;
- datos GRH reales o cualquier scope distinto de `SYNTHETIC_DEMO`;
- tenant ausente;
- vencimiento ausente, alcanzado o superior a siete días;
- solicitante o aprobador ausente y autoaprobación.

Un plan aceptado declara estado inicial `INVITED`, asignación temporal, invitación digest-only, rotación refresh, acción de reuse y MFA según el rol. No genera usuario, contraseña, token, ID ni escritura de base de datos.

## Condiciones antes de conectar esta fundación

1. Aprobar y aplicar una migración posterior al baseline/drift verificado.
2. Persistir transiciones, intentos, consumo, rotación y revocación con concurrencia atómica.
3. Implementar invitación por canal aprobado, reset seguro, MFA resistente a phishing para altos privilegios y recuperación gobernada.
4. Escribir auditoría append-only con actor, aprobador, tenant, motivo, estado anterior, decisión y resultado, sin secretos.
5. Probar carreras, doble consumo, reuse entre nodos, revocación inmediata y clock skew.
6. Aplicar rate limits, alertas y runbooks de contención y recuperación.
7. Ejecutar cuentas demo sólo en un tenant aislado con dataset sintético, expiración automática y aprobación trazable.

Hasta cumplir esas condiciones, no deben publicarse credenciales ni afirmarse que existe un entorno demo certificado por roles.
