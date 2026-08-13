# Decisión de producto: Friendly y Enterprise

Fecha de revisión: 13 de agosto de 2026.

## Decisión

Las dos versiones se conservan separadas para la evaluación municipal:

- **Friendly**: referencia visual y de facilidad de uso.
- **Enterprise**: producto gobernado de este repositorio, con datos reales, permisos, privacidad, auditoría y trazabilidad.

No se copia el código Friendly dentro de Enterprise. Se reconstruyen sus mejores patrones de experiencia sobre contratos y fuentes verificadas. Esta separación permite que las autoridades comparen ambas propuestas sin confundir una demostración visual con una versión operativa.

## Qué incorporamos de Friendly

1. Inicio sencillo según el rol y la tarea.
2. Cuatro o cinco accesos rápidos derivados de permisos reales.
3. Indicadores principales en lenguaje municipal y detalle técnico optativo.
4. Alertas que explican qué revisar y ofrecen una acción concreta.
5. Selector de gestión sólo cuando modifica datos reales en servidor.
6. Fichas de personas organizadas por secciones y tablas.
7. Asistente con contexto completo, sin abrir una consulta vacía.
8. Catálogo de informes por finalidad y disponibilidad real.
9. Búsqueda por tareas con autorización y alcance municipal.
10. Estados vacíos honestos cuando una fuente todavía no está conectada.

## Qué no se incorpora

- Autenticación o cambio de rol por parámetros de URL.
- Credenciales, información personal o salarios almacenados en el navegador.
- Indicadores escritos a mano, datos simulados o reemplazos ficticios ante una falla.
- Selectores que sólo cambian la pantalla sin consultar otra cobertura real.
- Predicciones aleatorias presentadas como inteligencia artificial.
- Afirmaciones de tiempo real, pago, presupuesto o estado laboral que la fuente no certifica.
- Exportaciones nominales sin finalidad, aprobación y auditoría.

## Próximas tres fases

### Fase 1 — Entrada municipal y gestión actual

- Bienvenida clara por rol.
- Accesos rápidos basados en permisos.
- Resumen de asuntos que requieren atención.
- Gestión actual desde el 9 de diciembre de 2023, con comparación equivalente sólo cuando la fuente lo permite.

### Fase 2 — Personas, asistente e informes conectados

- Búsqueda segura.
- Ficha integral con secciones tabulares.
- Traspaso de contexto al asistente sin identificadores personales en la URL.
- Respuesta analítica que agregue hallazgos y próximos pasos, sin repetir la ficha.
- Informes habilitados únicamente si existe una publicación gobernada.

### Fase 3 — Presupuesto real

- El módulo permanece como “fuente aún no conectada” hasta recibir ejecución presupuestaria oficial.
- No se reutilizan importes de RRHH como presupuesto.
- Toda cifra futura deberá conservar ejercicio, moneda, etapa, fuente y fecha de carga.
- No se publican proyecciones sin método reproducible y validación institucional.

## Fuente de referencia Friendly

La revisión se hizo contra la versión Friendly entregada por el usuario y su paquete local, cuya huella SHA-256 fue `73DB2D1A6D268D157866B77042CDB8C293B6F85EC9394351BA5BD3E751C02BC0`.

El paquete contiene un archivo con apariencia de credencial. No fue leído ni utilizado. Debe eliminarse del paquete y rotarse antes de cualquier redistribución.
