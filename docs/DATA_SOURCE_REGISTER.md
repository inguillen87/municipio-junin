# Registro gobernado de fuentes de datos

**Versión:** `data-source-register-v1`  
**Corte del inventario local:** 9 de agosto de 2026  
**Estado:** registro de ingeniería; no acredita conexión, autorización legal,
producción ni frescura continua.

## 1. Propósito

Este registro separa cinco estados que no deben confundirse:

1. **aprobada:** identidad y uso permitidos por un manifiesto versionado;
2. **derivada:** copia técnica de una fuente aprobada, nunca nuevo origen;
3. **cuarentena:** archivo encontrado cuya autoridad o semántica no está probada;
4. **excluida:** fuente que no puede analizarse, cruzarse ni usarse como fallback;
5. **documental:** informe o adjunto que puede aportar contexto, pero no filas
   operativas.

Encontrar un archivo, poder parsearlo o reconocer sus columnas no autoriza su
uso en una métrica, un dashboard, un modelo ni una decisión municipal.

## 2. Matriz vigente

| Source ID | Estado | Identidad observada | Clasificación y frescura | Uso permitido | Gate pendiente |
|---|---|---|---|---|---|
| `grh-junin` | **Aprobada para ingeniería local** | `grh_junin.backup_2026080615_plataforma.sql.gz`; 44.537.741 bytes; SHA-256 `e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`; dump MySQL comprimido con GZIP | RRHH restringido; snapshot histórico al 2026-08-06; el origen raw contiene PII | Perfilado privado y proyecciones agregadas gobernadas por k=5/k=10, sin identificadores personales | Custodio institucional, retención, adapter read-only, publicación remota y SLA siguen sin certificar |
| `grh-junin-extracted` | **Derivada** | Dos SQL descomprimidos idénticos al payload de `grh-junin`; 774.113.471 bytes cada uno | Misma sensibilidad que el raw; no aporta frescura ni autoridad nueva | Ninguno como fuente ni entrada del pipeline; sólo custodia o forense con owner, ticket y ACL explícitos | Definir retención y custodia; el pipeline admite únicamente el GZIP manifestado |
| `personas-junin` | **Excluida** | Un GZIP y dos SQL descomprimidos observados; no forman parte del manifiesto GRH | Base de ejemplo con datos de personas; riesgo alto de mezcla de identidades | Ninguno: no analizar, perfilar, cruzar, migrar, publicar ni usar como fallback | Mantener la exclusión técnica y definir retención/custodia fuera de este pipeline |
| `cuentas-claras-candidate-2026` | **Cuarentena** | `CuentasClaras_Junin_2026.csv`; 2.189 bytes; 19 líneas; SHA-256 `3bceb4ab7271db9738fc6af4a6c6234db3679cc7df3991510adbc95f28fc224c` | Posible Hacienda/Compras; origen, moneda, tenant, corte, sensibilidad y exactitud no probados | Sólo inventario de metadata; no leer valores ni alimentar pantallas | Owner, finalidad, diccionario, unidad/moneda, período, tenant, autorización y manifiesto firmados |
| `downloads-documents` | **Documental/no catalogada** | PDF, TXT y ZIP diversos observados sin abrir contenido | Sensibilidad y autoridad desconocidas | Ningún uso analítico automático | Intake documental aislado, antimalware, límites, clasificación, owner y revisión humana |

## 3. Fuente canónica y derivados

El único origen aprobado es el GZIP fijado por
[`config/grh-source-manifest.json`](../config/grh-source-manifest.json). Los SQL
descomprimidos coinciden con su payload, pero son derivados y amplían la
superficie de exposición. No deben elegirse por conveniencia, fecha del archivo
o tamaño.

El backup es un dump **MySQL plain-text comprimido**, aunque la arquitectura
objetivo publique contratos agregados en PostgreSQL. Formato de origen y motor
de publicación son responsabilidades distintas.

## 4. Gate de ingreso de una nueva fuente

Antes de leer filas o publicar una métrica deben existir, como mínimo:

- source ID estable, sistema autoritativo y owner institucional;
- tenant, finalidad, clasificación, base legal y política de retención;
- archivo/API exactos, formato, hash o identidad de conexión y fecha de corte;
- diccionario de campos, grain, claves, unidades, moneda y zona horaria;
- esquema versionado, límites, parser aislado y evidencia antimalware;
- reglas de completitud, unicidad, validez, integridad, frescura y volumen;
- cuarentena y reporte exacto de filas aceptadas/rechazadas;
- privacidad por campo, mínimos de agregación y roles autorizados;
- reconciliación contra el sistema autoritativo y rollback/restore aplicable;
- aprobación humana registrada antes de cambiar el estado a `approved`.

Un archivo en cuarentena no puede ascender por nombre, extensión, columnas
plausibles ni porque una visualización resulte convincente.

## 5. Reglas de operación

- No copiar fuentes raw al repositorio, frontend, logs, receipts o evidencias.
- No publicar rutas locales, filas de muestra, nombres de personas, domicilios,
  expedientes, proveedores ni importes desde archivos no aprobados.
- No eliminar copias encontradas automáticamente. La retención requiere owner,
  alcance exacto y procedimiento recuperable.
- Repetir el inventario cuando cambie Downloads o llegue una entrega formal;
  comparar identidad antes de declarar una nueva versión.
- Toda incorporación debe actualizar este registro, el contrato semántico, los
  manuales y las pruebas de privacidad/calidad correspondientes.

## 6. Evidencia y límites de este corte

La inspección fue read-only. Para reconciliar duplicados, calculó por streaming
el hash del payload GZIP sin extraerlo a disco. Del CSV leyó la cabecera y contó
líneas sin conservar ni publicar sus filas; de PDF/ZIP sólo leyó firmas de
formato. No interpretó ni mostró filas de `personas_junin`, valores del CSV ni
contenido documental. No borró, movió, extrajo ni copió fuentes.

Este registro demuestra qué archivos fueron observados y cómo quedan
clasificados. No demuestra que un archivo en cuarentena sea auténtico ni que la
fuente aprobada esté conectada en tiempo real.
