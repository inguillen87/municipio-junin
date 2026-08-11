# Política de privacidad y agregación GRH

> Versión documental: 1.6.0  
> Estado: implementada y migrada localmente; producción no desplegada ni certificada  
> Fuente canónica: GRH Junín  
> Fuente excluida: `personas_junin`

## 1. Propósito

Esta política define qué agregados del backup GRH pueden llegar a una pantalla,
un informe, una descarga o una respuesta del asistente. Su objetivo es conservar
valor ejecutivo sin convertir categorías pequeñas en identificadores indirectos
de una persona.

La ausencia de nombres, DNI o legajos no vuelve anónimo a un conjunto. Una
categoría como un centro de costo con una sola persona, combinada con información
institucional conocida, puede permitir reidentificación contextual. Por eso la
plataforma aplica minimización también sobre datos agregados.

## 2. Alcance y límites actuales

- GRH es la única fuente canónica de esta capa.
- `personas_junin` no se analiza, perfila, cruza, migra, publica ni se usa como
  fallback.
- El corte corresponde al snapshot histórico aprobado; `realtime=false`.
- La moneda no está declarada; la unidad monetaria permanece como unidad de
  origen.
- Los valores de cálculo son controles de liquidación; no prueban pago bancario,
  ejecución presupuestaria ni transferencia.
- Un rol elevado no reemplaza esta política. Autorización y minimización son
  controles complementarios.

## 3. Umbrales mínimos

| Contexto | Umbral mínimo | Motivo |
| --- | ---: | --- |
| Ranking interactivo de participación laboral | 5 participantes | Reduce reidentificación contextual en una sesión autenticada |
| Informe, PDF o salida portable | 10 participantes | La salida puede circular fuera de la sesión original |
| Compensación o importes de cálculo | 10 participantes | La combinación de cardinalidad e importe aumenta sensibilidad |
| Cierre mensual y comparación entre períodos | 10 participantes en cada mes | Impide liberar un delta cuando uno de los dos universos está protegido |
| Ausencias, licencias y otros eventos sensibles | 10 participantes distintos | Un conteo de eventos no demuestra por sí solo cuántas personas participaron |
| Geografía y mapas de calor futuros | 10 participantes por celda | Evita localizar individuos por zona o punto |

Los umbrales son mínimos técnicos. Un comité de privacidad puede elevarlos por
municipio, dominio, finalidad o riesgo, pero no reducirlos sin una revisión
formal documentada.

## 4. Reglas de publicación

### 4.1 Proteger antes de seleccionar el top

La protección se aplica sobre el universo completo antes de ordenar o recortar
un ranking. Aplicarla después del top permitiría inferir categorías ocultas por
diferencia.

### 4.2 Agrupar sin inventar

Las celdas protegidas se consolidan en `Otros (celdas protegidas)`. En ese bloque:

- no se entregan códigos fuente;
- no se entregan etiquetas originales;
- el total se conserva y debe reconciliar exactamente con el universo aprobado;
- una celda protegida nunca se convierte en cero.

### 4.3 Supresión complementaria

Cuando ocultar una única categoría permitiría reconstruirla restando el resto
del total, la plataforma agrega otra categoría al bloque protegido. Esta
supresión complementaria es deliberada y forma parte de la política.

### 4.4 Cardinalidad desconocida

Si una métrica sensible sólo aporta eventos y no personas distintas, se publica
como protegida hasta enriquecer el contrato con una cardinalidad confiable. La
interfaz debe explicar la limitación; no puede sustituirla por cero, por el último
período ni por un dato simulado.

### 4.5 Importes y períodos pequeños

Cuando un período monetario no llega al umbral:

- los importes se entregan como `null`;
- la cardinalidad se presenta como menor al umbral;
- se conserva el período sólo cuando no funciona como identificador;
- no se calculan variaciones, promedios ni inferencias a partir de la celda.

### 4.6 Comparación mensual segura

`grh-close-v1` sólo compara el mes de referencia con su mes calendario inmediato
anterior. Ambos deben existir y estar liberados con k≥10. Si falta uno o queda
protegido, el estado de comparación es `unavailable` y todos los deltas
sensibles son `null`. No se busca otro período, no se completa con el último
valor y no se reconstruye una celda protegida por diferencia.

La conciliación entregada en cada fila corresponde al mismo `YYYY-MM` que los
componentes de cálculo. Una tasa global no puede copiarse a los meses. Los
cambios entre componentes son una descomposición aritmética, no una explicación
causal ni una atribución de responsabilidad.

## 5. Contratos técnicos

La implementación se divide en fronteras exactas y fail-closed:

- `api/lib/grh-privacy.js`: reglas puras de umbral, agrupación y supresión;
- `api/lib/grh-executive-projection.js`: proyección para experiencia ejecutiva;
- `api/lib/grh-executive-contract.js`: contrato exact-key de salida;
- `api/grh-executive.js`: endpoint autenticado, tenant-bound y `no-store`;
- `api/lib/grh-close-projection.js`: unión exacta por período y protección k=10;
- `api/lib/grh-close-contract.js`: salida exact-key `grh-close-v1`;
- `api/grh-close.js`: endpoint GET-only, autenticado, tenant-bound y `no-store`;
- `api/lib/grh-artifacts.js`: carga backend del bundle privado aprobado.

El endpoint no entrega los objetos `profile` ni `semantic`. Si la fuente, el SHA,
el tenant, la política o el contrato no concilian, responde sin cifras de
respaldo. Los errores públicos no incluyen detalles de infraestructura ni datos.

## 6. Estado de migración

El cierre local está implementado y probado:

1. Panel, GRH Ejecutivo, RRHH, Hacienda y Control de Calidad consumen sólo
   `grh-executive-v2` y/o `grh-quality-v1` mediante el cliente seguro;
2. Reportes, PDF y Asistente proyectan el bundle privado con umbral portable
   k=10 antes de construir su salida;
   el intent `close_explanation` del Asistente construye `grh-close-v1` desde la
   misma lectura y exige un único `YYYY-MM` liberado;
3. los cinco consumidores web no solicitan `profile` ni `semantic` completos;
4. `/api/grh-data` autentica, verifica tenant y responde
   `410 GRH_RAW_CONTRACT_RETIRED` sin leer artefactos;
5. la regresión local de privacidad, autorización, escritorio, móvil,
   impresión y falla cerrada está aprobada.
6. Hacienda consume `grh-close-v1` para cierre mensual explicado; no recibe PII,
   etiquetas, códigos o filas y sólo compara meses consecutivos liberados;
7. GRH Ejecutivo ya no presenta el acuerdo global como si fuera mensual.
8. Hacienda consume `grh-workforce-finance-v1` para 24 meses y tres vistas
   marginales independientes —sector, centro de costo y convenio—. Cada celda
   usa k=10, supresión primaria/complementaria y un gate cross-view sobre los
   importes publicados. Los participantes observados pueden solaparse entre
   categorías; la participación mostrada corresponde a nómina neta, nunca a
   una distribución exclusiva de personas. La fuente no declara moneda: ARS
   es sólo la base de presentación configurada por el municipio y el contrato
   no acredita pago bancario, asiento contable ni ejecución presupuestaria.

Este cierre no equivale a un deployment. Todavía se requieren publicación del
bundle privado en el entorno objetivo, configuración de secretos y tenants,
smokes externos de preview/staging/producción y aprobación institucional antes
de certificar operación productiva de extremo a extremo.

## 7. Procedimiento para una nueva métrica

Antes de incorporar una tarjeta, gráfico, mapa, exportación o respuesta del bot:

1. documentar definición, grano, período y fuente;
2. identificar si el valor describe personas, dinero, salud laboral, ubicación o
   una combinación sensible;
3. demostrar la cardinalidad de personas distintas que sostiene cada celda;
4. elegir el umbral aplicable y ejecutar la protección antes del top o filtro;
5. comprobar reconciliación de totales sin revelar identidades protegidas;
6. agregar contrato exacto y prueba adversarial;
7. verificar roles y tenant en el servidor;
8. validar estados 401, 403 y 503, además de escritorio, móvil, impresión y
   movimiento reducido;
9. actualizar los manuales y el changelog;
10. certificar preview, staging y producción por separado.

Si falta cardinalidad o linaje, la capacidad queda condicionada o bloqueada. No
se completa con un número estimado.

## 8. Pruebas obligatorias

La batería debe demostrar como mínimo:

- ninguna categoría menor al umbral conserva etiqueta o código;
- la protección ocurre antes del top-N;
- la supresión complementaria evita reconstrucción por diferencia;
- el bloque protegido y las filas visibles suman el total aprobado;
- importes pequeños o de cardinalidad desconocida son `null`, nunca cero;
- claves extras o formas contractuales inesperadas fallan cerradas;
- no aparecen DNI, CUIL, CBU, correo, teléfono, URL privada ni filas crudas;
- un rol o tenant no autorizado no accede al endpoint;
- una caída o un contrato inválido no activa datos demo;
- ningún consumidor web vuelve a `/api/grh-data` después del retiro.
- `grh-close-v1` no libera comparación si cualquiera de los dos meses tiene
  menos de 10 participantes;
- cada conciliación mensual usa la fila del mismo período y nunca el resumen global;
- la unidad monetaria sigue no declarada y la salida no afirma pago, causalidad
  ni tiempo real.
- `grh-workforce-finance-v1` conserva exactamente 24 meses consecutivos y sólo
  tres vistas de una dimensión; no admite filtros arbitrarios ni intersecciones;
- el release financiero se recalcula sobre el contenido canónico y cualquier
  alteración coordinada de importes se rechaza en builder, publisher, API y
  navegador;
- conteos protegidos anulan también tolerancias y sumas derivables, mientras los
  niveles monetarios publicados permanecen aritméticamente comparables;
- el Bot responde 422 —sin sustitución— ante año solo, período ausente o celda
  protegida, y nunca usa el score global como conciliación mensual.

Comando focal actual:

```powershell
node --test tests/grh-small-cell-privacy.test.mjs tests/grh-executive-endpoint.test.mjs
node --test tests/grh-close-projection.test.mjs tests/grh-close-endpoint.test.mjs
```

El comando focal no sustituye la suite completa ni los controles externos de un
deployment.

## 9. Responsabilidades

| Responsabilidad | Evidencia requerida |
| --- | --- |
| Ingeniería de datos | Linaje, cardinalidad, reconciliación y artefacto reproducible |
| Backend | Autenticación autoritativa, tenant exacto, contrato y `no-store` |
| Frontend | No solicitar fuentes crudas; explicar celdas protegidas sin degradar a demo |
| Seguridad y privacidad | Revisión adversarial, umbrales, retención y accesos excepcionales |
| Autoridad funcional | Definición y finalidad de cada KPI; aceptación de sus límites |
| Operaciones | Variables, despliegue, observabilidad, backup y restore con evidencia |

## 10. Evolución prevista

La conexión futura en tiempo real, CDC, backups propios, carga de archivos y
mapas no elimina estas reglas. Cada nuevo corte y cada fuente externa deberá
producir un contrato gobernado, conservar linaje y aplicar la misma política —o
una más estricta— antes de llegar al funcionario.

Las excepciones futuras deberán ser temporales, justificadas, aprobadas por una
persona distinta de quien las solicita y auditadas. No existe actualmente un
flujo break-glass productivo; el modelo RBAC/ABAC y lifecycle permanece como
propuesta aislada hasta contar con baseline y migración aprobados.

## 11. Historial documental

| Versión | Fecha | Cambio |
|---|---|---|
| 1.7.0 | 2026-08-11 | Incorpora `grh-workforce-finance-v1`: 24 meses, sector/centro de costo/convenio observados por corrida, k=10, protección cross-view, release content-addressed y presentación ARS declarada como configuración municipal |
| 1.6.0 | 2026-08-09 | Incorpora `grh-close-v1` en Hacienda y el Bot, comparación sólo entre meses consecutivos k≥10 y conciliación real por período; retira la atribución mensual de una tasa global |
| 1.4.1 | 2026-08-08 | Registra el cierre local de la frontera raw y las proyecciones seguras existentes |
