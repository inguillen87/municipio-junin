# Reconciliación del Informe Maestro V2 con MuniControl

**Versión:** `grh-personas-v2-reconciliation-v1`  
**Fecha de revisión:** 13 de agosto de 2026  
**Corte de las fuentes analizadas:** 6 de agosto de 2026  
**Estado:** insumo documental reconciliado; no reemplaza los contratos ni los
conteos reproducidos desde los respaldos.

## 1. Documentos recibidos

| Documento | Identidad | Uso dentro del proyecto |
|---|---|---|
| `Junin_Informe_Maestro_Control_Municipal_GRH_PERSONAS.pdf` | 44 páginas; SHA-256 `b6313cc582d3fac1c03bf6612ba2065043c7dc37b8ad744f4b5303799ccf4fe1` | Diagnóstico ejecutivo y técnico, controles, arquitectura objetivo y hoja de ruta |
| `Junin_Blueprint_Integracion_Codex.md` | SHA-256 `7a192ce04c46677718166c94fa301fcdb37de2798da4f7351dad21ade19f261e` | Propuesta mínima de identidad, empleo, referencias fuente y vistas analíticas |

Son documentos de análisis. No contienen la autoridad necesaria para cambiar
una métrica por sí solos. Cada cifra que entra a una API o tablero continúa
reproduciéndose desde los GZIP fijados y sus manifiestos.

## 2. Decisiones adoptadas

1. **GRH conserva la autoridad laboral.** PERSONAS es un padrón auxiliar de
   identidad, domicilio y territorio.
2. **`IDPERSONA` queda prohibido como unión entre sistemas.** Los seis valores
   superpuestos no representan las mismas identidades.
3. **La integración es gradual:** fuentes inmutables, staging por origen,
   normalización, revisión humana, data mart, APIs de lectura y retiro del legado
   únicamente después de paridad y rollback.
4. **La nómina se controla con conceptos totalizadores.** Los conceptos
   993, 994 y 995 forman el bruto pagable; 996 representa retenciones; 998 y 999
   controlan el neto; 990 aporta la contribución patronal disponible. Sumar todas
   las filas de `calculo` está prohibido como KPI porque duplica componentes.
   La fuente no declara moneda: la presentación en ARS es una configuración
   municipal y estos importes no prueban pago, devengado ni ejecución presupuestaria.
5. **Agosto de 2026 no es un cierre comparable.** Las corridas observadas están
   abiertas. Julio de 2026 continúa como el último mes completo gobernado.
6. **GRH no reemplaza Presupuesto, Tesorería ni Contaduría.** Conciliación
   bancaria, crédito, devengado, órdenes de pago, extractos y asientos necesitan
   fuentes oficiales externas, con owner y contrato propios.
7. **No se calcula presentismo sin denominador.** Ausencias históricas no
   sustituyen turnos programados, horas laborables ni marcaciones actuales.
8. **Una coincidencia por DNI necesita respaldo adicional.** Si no coincide
   también el nombre normalizado o la fecha de nacimiento, la sugerencia queda
   como evidencia insuficiente y sólo puede avanzar después de comprobar la
   fuente municipal. Un DNI único genera una sugerencia; nunca una aprobación
   automática.

## 3. Diferencias resueltas con evidencia reproducible

| Tema | Informe V2 | Contrato gobernado vigente | Decisión |
|---|---:|---:|---|
| Legajos sin egreso | 882 | 867 registros válidos sin egreso informado | Usar 867; 2.450 filas raw se reducen a 2.449 claves válidas y las fechas se validan antes de clasificar |
| Participación más reciente | 854 en agosto abierto | 856 en julio cerrado | Usar julio para indicadores; agosto queda rotulado como abierto y fuera de KPI cerrados |
| Casos a confirmar | brecha simple 28 | 27: 19 sin egreso fuera de julio, 7 con egreso dentro y 1 incierto dentro | Usar el cruce explícito de estados; no interpretar una resta como causa laboral |
| Desglose de 64 candidatos asistidos | 40 CUIL duplicado + 24 DNI duplicado | 58 CUIL duplicado + 6 DNI duplicado | Conservar el resultado reproducido por el matcher versionado; ambos suman 64, pero el informe no trae algoritmo ejecutable para su desglose |
| CUIL único | aprobación automática propuesta | revisión humana para todos los casos | No autoaprobar: 23 propuestas tienen documentos contradictorios y 299 presentan conflicto de nacimiento |
| Domicilios con coordenadas | 183 | 183 filas, ninguna vinculada de forma verificable a una persona | No presentarlas como mapa de personas ni cobertura territorial operativa |

La partición aceptada sigue siendo 2.349 personas GRH: 1.699 con sugerencia,
157 ambiguas y 493 sin coincidencia. S16B materializa 2.185 opciones privadas,
prioriza 23 conflictos documentales y comienza con **cero aprobaciones**.

## 4. Cómo se traduce a producto

### Implementado en esta fase

- diagnóstico agregado de preparación GRH + PERSONAS;
- espacio privado de revisión caso por caso;
- evidencia nominal cifrada y oculta hasta una acción explícita;
- aprobar, descartar o postergar con motivo, versión e historia append-only;
- bloqueo reforzado para contradicciones de documento, nacimiento o evidencia;
- verificación manual obligatoria para sugerencias sostenidas únicamente por DNI;
- cero cambios automáticos en GRH y cero `crosswalk_persona` publicado.

### Capacidades ya cubiertas por contratos vigentes

- `grh-directory-v3` y `grh-employment-review-v2` separan situación laboral
  informada, participación en el cálculo y 27 situaciones para confirmar;
- el control de cálculo reconstruye bruto, retenciones y neto mediante los
  conceptos totalizadores y evita sumar indiscriminadamente `calculo`;
- `grh-absence-insights-v1` usa `ausencia`, separa eventos, personas y días
  informados, y no inventa presentismo.

### Próximo incremento priorizado: errores históricos de carga

La tabla `errorimportacion` contiene 1.186.239 incidencias en 4.913 cargas entre
el 8 de octubre de 2008 y el 5 de agosto de 2026. La nueva lectura de Calidad
debe agruparlas sin exponer mensajes crudos ni documentos:

- importes en cero: 603.125;
- cantidades en cero: 410.465;
- DNI sin legajo activo informado: 116.954;
- problemas de formato o longitud: 24.570;
- DNI asociado a múltiples legajos: 4.806;
- otros registros técnicos: 26.319.

La partición debe reconciliar exactamente 1.186.239. Como `TIPOMENSAJE` está
vacío en todas las filas, el sistema no puede inventar severidad ni semáforos.
La pantalla debe aclarar que son registros del sistema anterior y aislar un 503
del nuevo bloque sin ocultar el resto de Calidad.

### Bloqueado hasta recibir una fuente oficial

- presupuesto aprobado, modificaciones, compromiso, devengado y pagado;
- archivo bancario, débito, acreditación y rechazos;
- plan de cuentas, asientos, pasivos y conciliación contable;
- turnos, fichadas actuales, horas previstas y horas trabajadas;
- organigrama normativo, cargos autorizados, sedes y cupos.

## 5. Modelo objetivo, sin anticipar una migración masiva

El diseño objetivo conserva `person_identity`, `employment_contract` y
`source_xref`, pero S16B es deliberadamente anterior a esas entidades: registra
sugerencias y decisiones de revisión, no identidades canónicas. La promoción a
`source_xref` exige finalidad institucional, doble revisión, restore probado y
una regla de vigencia. La confianza numérica nunca reemplaza la evidencia ni la
decisión humana.

El SQL mínimo incluido en el blueprint V2 es conceptual y **no se ejecuta**:
carece de tenant, identidad completa de las fuentes, cifrado de evidencia,
finalidad, retención, permisos y registro append-only. La migración S16B conserva
esas garantías y no crea todavía `person_identity`, `employment_contract` ni
`source_xref`.

Las primeras vistas objetivo se agrupan en tres capas:

- **disponibles desde GRH:** cierre mensual, nómina totalizada, movimientos,
  ausencias y calidad;
- **condicionadas por revisión:** identidad vinculada y enriquecimiento de
  domicilio/territorio;
- **dependientes de fuentes nuevas:** conciliación de pago y ejecución de
  personal contra presupuesto.

La oportunidad no es copiar 289 tablas a PostgreSQL. Es convertir la historia
municipal en controles entendibles, reproducibles y conciliables, retirando cada
módulo heredado sólo cuando el reemplazo tenga paridad y rollback.
