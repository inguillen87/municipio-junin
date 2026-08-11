# Preparación geoespacial GRH — evidencia, privacidad y gates

**Versión:** 1.1.0
**Estado:** diagnóstico local; no existe una capa cartográfica GRH publicable  
**Fuente:** backup canónico GRH Junín, snapshot 2026-08-06  
**Exclusión:** `personas_junin` se mantuvo completamente fuera del análisis  
**Clasificación:** sólo conteos agregados; requiere aprobación institucional antes
de publicarse fuera del paquete técnico

## 1. Decisión ejecutiva

MuniControl no debe activar hoy un mapa GRH. La fuente contiene datos
residenciales sensibles, pero no geometrías utilizables ni un catálogo espacial
oficial. Representar los pares disponibles produciría puntos `0,0`, mientras que
geocodificar domicilios particulares crearía una nueva superficie de PII sin una
finalidad institucional aprobada.

La siguiente entrega geoespacial honesta es un **panel de preparación de capas**:
cobertura, calidad, linaje, frescura, sistema de coordenadas y gates pendientes.
El renderer cartográfico se incorpora recién cuando exista una capa municipal
autorizada, versionada y verificable.

### Centro territorial no es un mapa GRH

La ruta gobernada `/territorio` ofrece únicamente una referencia oficial del
límite municipal y las localidades publicadas por IGN/GeoRef, con fuente, fecha
y límites de uso visibles. No contiene empleados, domicilios, obras, reclamos ni
ninguna otra capa operativa municipal.

Su publicación no satisface el contrato `grh-geo-readiness-v1`, no habilita
georreferenciación de personas y no cambia esta decisión: **no activar mapa GRH**.
El mapa territorial de referencia y una futura capa analítica GRH son superficies
distintas, con fuentes, finalidades, contratos y autorizaciones independientes.

## 2. Evidencia observada

| Evidencia | Resultado | Lectura correcta |
|---|---:|---|
| Filas en `domicilio` | 872 | Registros residenciales sensibles; no son una capa operativa |
| Pares de coordenadas utilizables | 0/872 | Los 872 pares son `0,0`; cobertura espacial real 0% |
| Filas de `barrio` | 0 | No existe base para agregación barrial |
| Referencias de lugar de trabajo | 15/2.450 legajos | Cobertura insuficiente y sin geometría oficial |
| GeoJSON, Shapefile o MBTiles aprobados | 0 | No hay límites cartográficos gobernados en el checkout |
| Runtime PostGIS/MapLibre activo | No | Ambos siguen siendo arquitectura objetivo, no capacidad actual |

El universo semántico reproducido para 2026-07 contiene 856 claves participantes
y 792 personas distintas. De esas personas, 588 tienen una localidad catalogada
y 204 no tienen localidad verificable. Las 588 se distribuyen actualmente en 9
unidades con k≥10. Esto representa **participación en el universo del período**, no
planta activa, residencia vigente, lugar de trabajo ni demanda territorial.

La cobertura por localidad es 74,24%. Sin polígonos oficiales, CRS, licencia y
fecha propia de captura, esos agregados pueden sostener una tabla de preparación,
pero no un mapa de decisión.

## 3. Riesgos que deben permanecer visibles

- Domicilio, calle, número y el enlace persona–legajo son PII directamente
  reidentificable y no se exponen en contratos analíticos.
- Residencia no equivale a lugar de trabajo, prestación municipal ni necesidad
  territorial.
- Una cobertura del 74,24% puede sesgar comparaciones entre localidades.
- Todo filtro temporal o laboral debe recalcular la cardinalidad antes de liberar
  una celda; k se calcula con personas distintas, no con filas ni legajos.
- No existe timestamp por domicilio, precisión declarada ni sistema de
  coordenadas. El único corte gobernado es el snapshot fuente.
- Un rol alto no elimina la obligación de minimización.

## 4. Contrato previo al mapa

El primer contrato debe llamarse `grh-geo-readiness-v1`. Su finalidad es informar
si una capa puede construirse; no serializa puntos, domicilios ni geometrías
individuales.

Campos mínimos:

```text
schema_version: grh-geo-readiness-v1
availability: blocked_boundary_missing | ready_for_aggregate_layer
source: file + sha256 + snapshot_as_of + realtime=false
lineage: tablas + ruta de joins + versión del transformador + digest
purpose: finalidad + responsable + audiencia + estado de aprobación
spatial: crs + boundary_catalog + boundary_version + licence + precision
freshness: source_snapshot + event_timestamp_coverage + sla_status
coverage: participant_keys + distinct_people + located_people + unknown_people
privacy: unit=distinct_person + k=10 + complementary_suppression=true
layers: [] hasta que existan polígonos oficiales aprobados
risks: cobertura, sesgo, geometría, frescura y finalidad
```

Toda cardinalidad desconocida se considera protegida. La supresión se aplica
antes de filtros, top-N, clusters y heatmaps, con supresión complementaria cuando
un total permita inferir una celda oculta.

## 5. Precisión por rol objetivo

| Audiencia | Precisión máxima GRH | Condición |
|---|---|---|
| Intendencia | Localidad oficial agregada | Personas distintas, k≥10, faltantes y frescura visibles |
| RRHH autorizado | Localidad oficial agregada | Finalidad aprobada, filtros protegidos y auditoría |
| Contaduría | Sin geografía residencial | Sólo calidad y linaje |
| Administración técnica | Diagnóstico de calidad | No obtiene mayor precisión por privilegio técnico |
| Roles bajos, demo y público | Ninguna geografía GRH | Denegación fail-closed |

Un domicilio exacto sólo podría existir en un flujo individual separado,
ABAC, asignado, justificado, temporal y auditado. Nunca pertenece al API
analítico ni a un heatmap ejecutivo.

## 6. Fuentes necesarias para un mapa real

El municipio debe entregar o aprobar, como mínimo:

1. límites oficiales de localidad/barrio/radio con geometrías válidas;
2. CRS, versión, licencia, custodio y fecha de actualización;
3. contrato de finalidad y audiencia para cada capa;
4. denominadores territoriales válidos cuando se calculen tasas;
5. reglas de precisión, retención y acceso excepcional;
6. feed operativo con timestamp y SLA si se pretende usar la palabra
   "tiempo real".

Capas de obras, reclamos, inspecciones, servicios, activos, flota o sensores deben
tener contratos propios. Los campos opcionales de un modelo o una página retirada
no prueban que exista una fuente cartográfica.

## 7. Secuencia de implementación

1. Generar y validar `grh-geo-readiness-v1` sin PII.
2. Publicar un endpoint tenant-bound de preparación, no de datos crudos.
3. Mostrar cobertura, faltantes, linaje y gates en un catálogo de capas.
4. Aprobar formalmente la finalidad de cualquier lectura territorial GRH.
5. Ingerir límites oficiales con hash, CRS, licencia y versión.
6. Construir agregados k≥10 y probar ataques por filtros/diferencias.
7. Incorporar MapLibre empaquetado localmente; usar PostGIS cuando exista una
   fuente espacial operativa y gobernada.
8. Habilitar clusters, heatmaps o streaming sólo con eventos fechados, replay,
   observabilidad y SLA medido.

## 8. Criterio de salida

El mapa deja de estar bloqueado sólo cuando una prueba demuestra simultáneamente:
geometría oficial válida, linaje, fecha, finalidad, denominador cuando corresponda,
privacidad k≥10 antes de filtros, autorización server-side y degradación honesta ante
fuente vencida. Hasta entonces, [`../mapa.html`](../mapa.html) debe permanecer como
capacidad retirada, sin puntos ni cifras inventadas. La referencia oficial
`/territorio` no modifica este gate porque no contiene ni representa datos GRH.
