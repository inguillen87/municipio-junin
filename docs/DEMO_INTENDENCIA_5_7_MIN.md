# Demostración de Intendencia en 5–7 minutos

Fecha de corte del guion: 11 de agosto de 2026. Este recorrido usa información
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
3. Abrir una vez `/inicio`, `/estructura`, `/ejecutivo`, `/hacienda`, `/calidad`,
   `/reportes`, `/ia` y `/territorio`.
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
| 1:05–2:25 | `/estructura` | Seis KPI, cohorte de cálculo, series de ausencias y movimientos, matriz organización×sector, comparador y botones de acción | “Esta sala separa tres universos: legajos registrados, participantes del cálculo y eventos históricos. No los mezcla ni llama personal activo. Las celdas menores a diez permanecen protegidas.” |
| 2:25–3:30 | `/ejecutivo` | Fuente/corte, KPI, serie de control, sectores y eventos | “La lectura proviene de un backup GRH real. Los 856 corresponden a participantes de cálculo en julio, no a personal activo. Los importes se presentan en ARS por configuración de Junín; el control no acredita pago bancario.” |
| 3:30–4:35 | `/hacienda` | Radar mensual, conciliación, componentes y comparación histórica | “El tablero permite abrir un período, comparar el mes anterior y localizar diferencias entre fuentes. Una diferencia es una señal de control, no prueba pérdida, fraude ni desembolso.” |
| 4:35–5:35 | `/ia` | Consulta agregada de licencias o cierre, respuesta visual y preguntas siguientes | “El asistente determinista responde con el mismo contrato GRH, muestra gráficos y ofrece acciones. No inventa cifras ni atribuye causas que la fuente no prueba.” |
| 5:35–6:20 | `/territorio` | Límite del Partido, localidades y mapas base oficiales | “La referencia territorial consume fuentes oficiales IGN y GeoRef. Todavía no superpone empleados, obras ni reclamos porque esas capas no están gobernadas.” |
| 6:20–6:50 | cierre | Volver a `/inicio` | “Hoy demostramos lectura trazable, comparación y navegación accionable. El siguiente paso es conectar las bases autorizadas gradualmente, con migraciones, actualización y backups probados.” |

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

## Afirmaciones prohibidas

No usar “tiempo real”, “sueldos pagados”, “transferencia”, “planta
activa”, “tasa de ausentismo”, “ahorro”, “fraude”, “causa comprobada”, “backup
operativo certificado”, “permisos finos por área terminados” ni “integración
automática con todos los sistemas municipales”.

Las ausencias son eventos, no una tasa. Las licencias llegan sólo hasta 2009 y
no deben presentarse como una tendencia vigente. Una variación mensual puede ser
una señal para revisar, nunca una explicación causal.

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
