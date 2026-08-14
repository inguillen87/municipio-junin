# Ingreso gobernado de fuentes — S25

Estado: experiencia publicada read-only verificada en Production el 14 de agosto
de 2026 sobre el product SHA `2b0411a37ec6474e6988a60b26bd3d3a51da858b` y
deployment `dpl_CEDxSq4dWFYekymNzkVBpV876JfX`. Esta evidencia no convierte una
fuente en dato municipal aprobado ni acredita una escritura privada remota: el
`POST` privado 201 fue validado sólo localmente y no se ejecutó en Production.

## Objetivo de esta etapa

S25 reemplaza la promesa ambigua de «importar datos» por un primer control
operativo verificable. Una persona autorizada identifica una fuente, entrega un
archivo acotado y recibe un diagnóstico estructural. El archivo y sus valores no
se incorporan a tableros ni tablas analíticas.

Contrato público del endpoint: `municipal-source-intake-v1`.

## Flujo

1. La sesión debe tener tenant vigente y `navigation.import`.
2. La persona declara fuente, área, período, responsable, finalidad,
   clasificación, autoridad, unidad y presencia de datos personales.
3. El servidor acepta un único archivo de hasta 4 MiB en `CSV`, `XLSX`, `XLS`,
   `JSON`, `PDF` o `TXT`.
4. Se valida firma/formato y se calcula SHA-256.
5. Se produce únicamente un perfil agregado de estructura, completitud y
   duplicación; nunca se responden filas, valores, texto, encabezados o nombre
   del archivo.
6. Una identidad privada autorizada ejecuta el diagnóstico y registra el recibo
   seguro como evento append-only del tenant. La Evaluación Administrador sólo
   inspecciona la pantalla y el contrato `GET`: sus controles están deshabilitados
   y `POST` responde `403 PUBLISHED_DEMO_ROUTE_DENIED` en el adaptador de
   autorización antes de llegar al handler. El handler conserva además la
   defensa `SOURCE_INTAKE_PUBLISHED_PREVIEW_DISABLED` antes de multipart,
   perfilado o persistencia.
7. El estado final es siempre `quarantined`.

## Por qué no publica

Esta etapa todavía no conserva el original en storage privado ni ejecuta un
antivirus institucional. Ambos controles figuran como bloqueos de severidad alta.
No existe endpoint de aprobación, promoción, consulta de valores o publicación.

Las rutas legacy que escribían `datasets` y `data_points` sin tenant, hash,
cuarentena o doble control quedan retiradas. Probar una conexión externa tampoco
autoriza guardar credenciales o consultar tablas.

## Persistencia mínima y privacidad

El recibo privado usa el registro de auditoría existente. `tenantId` y `userId`
permanecen sólo en la base y no se proyectan al navegador. Los detalles admitidos
son el contrato, identificador opaco, fecha, metadata declarada, huella, perfil
agregado, checks y límites. El diseño no extrae ni persiste PII, filas, valores,
contenido de documentos, nombres de archivo o encabezados. Los campos libres de
metadata son exclusivamente institucionales: la interfaz prohíbe escribir allí
nombres, DNI, legajos u otros datos de personas; esta versión todavía no hace
clasificación semántica automática de ese texto declarado.

Esta persistencia es un recibo de preflight, no el registro definitivo de
fuentes. La siguiente etapa debe migrarlo a entidades dedicadas con original
privado, antivirus, owner institucional, retención, issues por corrida y
maker-checker.

## Protección de recursos en Evaluación

La evaluación pública no procesa archivos. El techo publicado admite sólo
`GET /api/source-intake` para que Administrador inspeccione un envelope vacío y
read-only; excluye la ruta `POST`. El handler aplica además una segunda defensa:
toda identidad `published-evaluation` que intente `POST` recibe `403` antes de
budget, multipart, parser, perfilador, temporales o store. La interfaz deshabilita
el formulario y no registra el listener que enviaría la solicitud.

El presupuesto local por instancia se retiró porque, sin un `POST` publicado, era
código muerto y podía sugerir una protección de flota inexistente. Antes de
habilitar procesamiento público se requiere un límite distribuido fail-closed
entre réplicas, operación y alertas; un mapa por instancia serverless no alcanza.

## Presupuesto

S25 no publica presupuesto. `CuentasClaras_Junin_2026.csv` continúa en
cuarentena: faltan owner, finalidad, diccionario, moneda, grain, tenant y
aprobación institucional. El primer producto presupuestario sólo podrá comparar
crédito vigente y devengado acumulado cuando una fuente oficial supere estos
gates y conserve ejercicio, moneda, partida/programa y fecha de corte.

## Gates de aceptación

- autorización negativa y positiva por rol, tenant y modo de evaluación;
- `GET` publicado read-only y `POST` publicado en 403 antes de cualquier trabajo
  de archivo; cero request desde la UI de evaluación;
- un solo archivo, 4 MiB y formatos exactos;
- parser fail-closed y errores sin eco del contenido;
- ausencia comprobable de filas, valores, texto, headers, filename, PII extraída
  del archivo y actor en respuestas y recibos proyectados; la metadata libre
  queda sujeta a la prohibición operativa anterior;
- bloqueo de doble envío mientras una solicitud está en curso y recibos
  append-only; el backend v1 no deduplica dos solicitudes completas repetidas;
- rutas legacy de escritura en estado `410`;
- responsive 1440/390/320, teclado, forced-colors, reduced-motion y controles de
  al menos 44 px;
- release truth y smoke autenticado antes de declarar Production.
