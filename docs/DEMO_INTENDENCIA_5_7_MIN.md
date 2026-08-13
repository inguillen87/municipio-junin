# Demostración de Intendencia en 5–7 minutos

Fecha de corte del guion: 13 de agosto de 2026. Este recorrido usa información
agregada derivada del snapshot GRH del 6 de agosto de 2026. No demuestra una
conexión en tiempo real, una nómina pagada ni la dotación activa del municipio.

## Objetivo

Mostrar una cadena corta y verificable: identidad por rol, lectura ejecutiva,
calidad de la evidencia, reporte y explicación asistida. La diferencia frente a
un tablero BI genérico no es una animación: cada cifra conserva fuente, corte,
definición, límites y una ruta estable de contingencia.

## Preflight obligatorio

Realizarlo con la misma URL y el mismo dispositivo que se usarán en la reunión.

1. Confirmar que el alias público resuelve al deployment de `master` previsto
   para la demostración.
2. Iniciar sesión con el perfil de evaluación `INTENDENTE`; no proyectar ni
   copiar contraseñas.
3. Abrir una vez `/inicio`, `/dashboard`, `/estructura`, `/ejecutivo`,
   `/hacienda`, `/calidad`, `/reportes`, `/ia` y `/territorio`.
4. Verificar que Ejecutivo y Calidad declaren corte 6 de agosto de 2026 y estado
   histórico, no tiempo real.
5. Confirmar que no haya errores de consola, overflow, requests externos ni
   cifras visibles durante un estado de error.
6. Mantener `/grh-ejecutivo` como retorno estable. Si el canary `/ejecutivo`
   falla cualquier control, usar la ruta estable y decirlo expresamente.

Si el preflight no termina, no improvisar datos ni capturas antiguas. Mostrar la
superficie estable o posponer la parte privada de la demostración.

## Recorrido cronometrado

| Tiempo | Ruta | Qué mostrar | Mensaje responsable |
|---|---|---|---|
| 0:00–0:35 | `/login` | Los seis perfiles de evaluación y el acceso Intendente | “Cada perfil permite recorrer una experiencia distinta. El servidor revalida usuario, municipio, rol y capacidades; estas identidades no reemplazan el acceso institucional definitivo.” |
| 0:35–1:05 | `/inicio` | Portada específica de Intendencia y accesos prioritarios | “No hay un dashboard universal. Intendencia entra por decisiones, evidencia y reportes; esta portada no inventa indicadores.” |
| 1:05–1:50 | `/dashboard` | Bloque “Comparación de gestiones”: dos períodos de 972 días y cinco lecturas simples | “Comparamos la gestión actual con el mismo tramo de la anterior, no con cuatro años completos. Son registros históricos del respaldo: describen diferencias, pero no prueban causas ni califican una gestión.” |
| 1:50–2:45 | `/estructura` | Cohorte de cálculo, series de ausencias y movimientos y distribución organizativa | “Esta sala separa legajos registrados, participantes del cálculo y eventos históricos. No los mezcla ni los llama personal activo. Los grupos pequeños permanecen protegidos.” |
| 2:45–3:35 | `/ejecutivo` | Fuente/corte, indicadores principales, sectores y eventos | “La lectura proviene de un backup GRH real. Los 856 corresponden a participantes de cálculo en julio, no a personal activo. El control no acredita pago bancario.” |
| 3:35–4:25 | `/hacienda` | Conciliación, componentes y comparación mensual | “El tablero permite abrir un período y localizar diferencias entre fuentes. Una diferencia es una señal de control, no prueba pérdida, fraude ni desembolso. Presupuesto contra ejecución aún no está disponible porque falta esa fuente real.” |
| 4:25–5:15 | `/ia` | Consulta agregada, respuesta visual y preguntas siguientes | “El asistente determinista responde con el mismo contrato GRH y ofrece acciones. No inventa cifras ni atribuye causas que la fuente no prueba.” |
| 5:15–6:00 | `/territorio` | Límite del Departamento Junín, Mendoza, localidades GeoRef y mapas base oficiales | “La referencia territorial consume fuentes oficiales IGN y GeoRef. Todavía no superpone empleados, obras ni reclamos porque esas capas no están gobernadas.” |
| 6:00–6:40 | cierre | Volver a `/inicio` | “Hoy demostramos una lectura trazable y comparable. El siguiente paso es conectar gradualmente las bases autorizadas, con migraciones, actualización y backups probados.” |

## Afirmaciones permitidas

- “Información real derivada del snapshot GRH del 6 de agosto de 2026”.
- “Información histórica, agregada y protegida; no se publican filas crudas”.
- “`personas_junin` está excluida de esta fuente gobernada”.
- “856 participantes de cálculo en julio de 2026”; no “856 empleados activos”.
- “2.450 filas de legajo”; no “2.450 agentes activos”.
- “ARS 951.380.572,79 presentados por configuración municipal para el control de
  julio”; no pago bancario ni moneda declarada por el dump.
- “Calidad 88,99/100, conciliación 63,88/100 y 20.534 filas en cuarentena”.
- “489.455 movimientos históricos temporalmente válidos”.
- “Seis accesos de evaluación de sólo lectura para recorrer roles”.
- “Dos períodos equivalentes de 972 días: 9 de diciembre de 2023–6 de agosto de
  2026 frente a 9 de diciembre de 2019–6 de agosto de 2022”.
- “5.936 frente a 3.395 registros de ausencia; 752 frente a 662 personas
  presentes en esos registros; 65.847 frente a 52.190 días informados”.
- “281 frente a 216 fechas de ingreso informadas y 232 frente a 173 fechas de
  egreso informadas”; no altas, bajas ni dotación activa.

## Afirmaciones prohibidas

No usar “tiempo real”, “sueldos pagados”, “transferencia”, “planta
activa”, “tasa de ausentismo”, “mejor gestión”, “peor gestión”, “ahorro”,
“fraude”, “causa comprobada”, “altas”, “bajas”, “ejecución presupuestaria”, “backup
operativo certificado”, “permisos finos por área terminados” ni “integración
automática con todos los sistemas municipales”.

Las ausencias son eventos, no una tasa. Las licencias llegan sólo hasta 2009 y
no deben presentarse como una tendencia vigente. Una variación mensual puede ser
una señal para revisar, nunca una explicación causal.

La comparación de gestiones fue verificada en Production el 13 de agosto de
2026 y puede incluirse en el recorrido remoto, conservando sus límites visibles.
Presupuesto contra
ejecución continúa cerrado mientras no exista una fuente real autorizada.
Para responder una consulta de auditoría, las ventanas exactas son
`2023-12-09..2026-08-06` y `2019-12-09..2022-08-06`.

## Contingencia

- `/ejecutivo` bloqueado o contrato rechazado: abrir `/grh-ejecutivo` y explicar
  que el canary cerró sin cifras.
- `/calidad` bloqueada: no citar el score desde memoria; mostrar únicamente la
  procedencia disponible en Ejecutivo.
- Reporte lento: continuar con Calidad y volver una sola vez; no recargar en
  bucle.
- IA no disponible: explicar el contrato con el reporte; no reemplazarlo por una
  respuesta libre.
- Sesión o rol incorrectos: volver a `/inicio`; no intentar forzar la URL.

## Cierre técnico para preguntas

La arquitectura actual es incremental: HTML/JavaScript legacy permanece como
retorno estable y las nuevas verticales entran en React + TypeScript con
contratos validados. El backend sigue siendo la autoridad de identidad, tenant,
RBAC, procedencia y privacidad. La migración futura hacia bases municipales
nuevas será por dominios, con reconciliación y rollback; no una reescritura total
ni una importación masiva sin control.
