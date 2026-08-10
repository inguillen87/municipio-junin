# Demostración de Intendencia en 5–7 minutos

Fecha de corte del guion: 10 de agosto de 2026. Este recorrido usa información
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
3. Abrir una vez `/inicio`, `/ejecutivo`, `/calidad`, `/reportes` y `/ia`.
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
| 1:05–2:40 | `/ejecutivo` | Fuente/corte, cinco KPI, serie de control, sectores y eventos | “La lectura proviene de un backup GRH real. Los 856 corresponden a participantes de cálculo en julio, no a personal activo. La serie es control de cálculo en unidades de fuente: no es pago bancario y la moneda no está declarada.” |
| 2:40–3:50 | `/calidad` | Score, cuarentena, conciliación, linaje y riesgos | “Antes de decidir mostramos por qué confiar o desconfiar. Hay 257 tablas y 6.573.057 filas inventariadas, 20.534 filas temporales en cuarentena, calidad 88,99/100 y conciliación cálculo–totpago 63,88/100.” |
| 3:50–4:50 | `/reportes` | Resumen, período, control y procedencia | “El reporte conserva corte, fuente y límites. Julio de 2026 tiene 856 participantes de cálculo; el control no acredita transferencia ni asiento contable.” |
| 4:50–5:45 | `/ia` | Pregunta guiada sobre calidad GRH | “El asistente actual es determinista y fundamentado en el contrato. Explica cifras y límites; no genera números libres ni atribuye causas que la fuente no prueba.” |
| 5:45–6:20 | cierre | Volver a `/inicio` | “Hoy demostramos lectura agregada y trazable. El siguiente paso es conectar las bases autorizadas gradualmente, con migraciones, actualización y backups probados, sin borrar la historia ni prometer tiempo real antes de tenerlo.” |

## Afirmaciones permitidas

- “Información real derivada del snapshot GRH del 6 de agosto de 2026”.
- “Información histórica, agregada y protegida; no se publican filas crudas”.
- “`personas_junin` está excluida de esta fuente gobernada”.
- “856 participantes de cálculo en julio de 2026”; no “856 empleados activos”.
- “2.450 filas de legajo”; no “2.450 agentes activos”.
- “951.380.572,79 unidades de fuente en el control de julio”; no ARS ni pago.
- “Calidad 88,99/100, conciliación 63,88/100 y 20.534 filas en cuarentena”.
- “489.455 movimientos históricos temporalmente válidos”.
- “Seis accesos de evaluación de sólo lectura para recorrer roles”.

## Afirmaciones prohibidas

No usar “tiempo real”, “ARS”, “sueldos pagados”, “transferencia”, “planta
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
