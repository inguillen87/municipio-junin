# Registro gobernado de fuentes de datos

**Versión:** `data-source-register-v2`
**Corte del inventario local:** 14 de agosto de 2026
**Estado:** registro de ingeniería; no acredita conexión, autorización legal,
producción ni frescura continua.

## 1. Propósito

Este registro separa seis estados que no deben confundirse:

1. **aprobada:** identidad y uso permitidos por un manifiesto versionado;
2. **derivada:** copia técnica de una fuente aprobada, nunca nuevo origen;
3. **cuarentena:** archivo encontrado cuya autoridad o semántica no está probada;
4. **auxiliar aislada:** fuente aprobada sólo para diagnóstico o integración en
   un pipeline propio; no forma parte de los contratos de la fuente principal;
5. **excluida:** fuente que no puede analizarse, cruzarse ni usarse como fallback;
6. **documental:** informe o adjunto que puede aportar contexto, pero no filas
   operativas.

Encontrar un archivo, poder parsearlo o reconocer sus columnas no autoriza su
uso en una métrica, un dashboard, un modelo ni una decisión municipal.

## 2. Matriz vigente

| Source ID | Estado | Identidad observada | Clasificación y frescura | Uso permitido | Gate pendiente |
|---|---|---|---|---|---|
| `grh-junin` | **Aprobada para ingeniería local** | `grh_junin.backup_2026080615_plataforma.sql.gz`; 44.537.741 bytes; SHA-256 `e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9`; dump MySQL comprimido con GZIP | RRHH restringido; snapshot histórico al 2026-08-06; el origen raw contiene PII | Perfilado privado y proyecciones agregadas gobernadas por k=5/k=10, sin identificadores personales | Custodio institucional, retención, adapter read-only, publicación remota y SLA siguen sin certificar |
| `grh-junin-extracted` | **Derivada** | Dos SQL descomprimidos idénticos al payload de `grh-junin`; 774.113.471 bytes cada uno | Misma sensibilidad que el raw; no aporta frescura ni autoridad nueva | Ninguno como fuente ni entrada del pipeline; sólo custodia o forense con owner, ticket y ACL explícitos | Definir retención y custodia; el pipeline admite únicamente el GZIP manifestado |
| `personas-junin` | **Auxiliar aislada para ingeniería local** | `personas_junin.backup_2026080615_plataforma.sql.gz`; 7.550.947 bytes; SHA-256 `11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c`; corte 2026-08-06 | Padrón transversal de identidad, domicilios y territorio; 32 tablas físicas, 8 vistas y 371.947 filas; contiene PII y calidad desigual | Manifiesto independiente, matcher reproducible y diagnóstico agregado de preparación; no ingresa a las fichas, KPI ni artefactos laborales GRH | Finalidad y owner institucional, revisión de ambiguos, staging/migración privados, auditoría y restore antes de publicar un crosswalk o enriquecer fichas |
| `cuentas-claras-candidate-2026` | **Cuarentena** | `CuentasClaras_Junin_2026.csv`; 2.189 bytes; 19 líneas; SHA-256 `3bceb4ab7271db9738fc6af4a6c6234db3679cc7df3991510adbc95f28fc224c` | Posible Hacienda/Compras; origen, moneda, tenant, corte, sensibilidad y exactitud no probados | Sólo inventario de metadata; no leer valores ni alimentar pantallas | Owner, finalidad, diccionario, unidad/moneda, período, tenant, autorización y manifiesto firmados |
| `downloads-documents` | **Documental/no catalogada** | PDF, TXT y ZIP diversos observados sin abrir contenido | Sensibilidad y autoridad desconocidas | Ningún uso analítico automático | Intake documental aislado, antimalware, límites, clasificación, owner y revisión humana |

## 3. Fuente canónica y derivados

El único origen aprobado para los **contratos GRH actuales** es el GZIP fijado por
[`config/grh-source-manifest.json`](../config/grh-source-manifest.json). Los SQL
descomprimidos coinciden con su payload, pero son derivados y amplían la
superficie de exposición. No deben elegirse por conveniencia, fecha del archivo
o tamaño.

El backup es un dump **MySQL plain-text comprimido**, aunque la arquitectura
objetivo publique contratos agregados en PostgreSQL. Formato de origen y motor
de publicación son responsabilidades distintas.

PERSONAS no reemplaza esa autoridad laboral. Su diagnóstico agregado usa un
pipeline auxiliar y un manifiesto independiente; su eventual incorporación a
fichas requiere una tabla puente versionada. La igualdad de `IDPERSONA` entre
GRH y PERSONAS está prohibida
como regla de unión: los identificadores pertenecen a espacios distintos. La
línea de base reproducible —1.699 candidatos vinculables, 157 ambiguos y 493 sin
coincidencia— se publica sólo como estado agregado de preparación y no constituye
un crosswalk certificado ni habilita datos personales. El contrato de
integración está en
[`GRH_PERSONAS_INTEGRATION_BLUEPRINT.md`](GRH_PERSONAS_INTEGRATION_BLUEPRINT.md).

## 4. Gate de ingreso de una nueva fuente

S25 implementa sólo el primer escalón técnico de este gate: receipt en
cuarentena con metadatos exactos, SHA-256 y perfil estructural agregado. No
retiene el original, no ejecuta antimalware y no aprueba ni publica una fuente.
Por lo tanto, ningún estado de la matriz vigente cambia por completar ese
preflight.

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
el hash del payload GZIP sin extraerlo a disco. La auditoría aislada de PERSONAS
reprodujo su inventario y la línea de base de vinculación sin publicar PII ni
crear una tabla puente productiva. Del CSV leyó la cabecera y contó líneas sin
conservar ni publicar sus valores; de PDF/ZIP sólo leyó firmas de formato. No
borró, movió ni copió fuentes.

Este registro demuestra qué archivos fueron observados y cómo quedan
clasificados. No demuestra que un archivo en cuarentena sea auténtico ni que la
fuente aprobada esté conectada en tiempo real.
