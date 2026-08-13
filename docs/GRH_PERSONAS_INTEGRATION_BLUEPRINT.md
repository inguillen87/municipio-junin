# Integración gobernada entre GRH y PERSONAS

**Versión:** `grh-personas-integration-blueprint-v1`
**Corte de fuentes:** 6 de agosto de 2026
**Estado:** Fase 1A implementada localmente como diagnóstico agregado;
tabla puente, revisión institucional y uso productivo pendientes

## Decisión

- **GRH es la fuente laboral central.** Conserva personas laborales, legajos,
  liquidaciones, movimientos, ausencias, convenios, categorías, cargos y
  estructura municipal.
- **PERSONAS es una fuente auxiliar.** Puede enriquecer identidad, domicilios y
  territorio, pero no reemplaza a GRH ni decide el estado laboral.
- Los valores de `IDPERSONA` pertenecen a cada sistema. **Nunca se unen GRH y
  PERSONAS por igualdad de `IDPERSONA`** ni se copia un identificador de una base
  como si fuera el de la otra.
- La integración futura debe pasar por una tabla puente versionada y auditable.
  Hasta completar sus controles, los artefactos, APIs, tableros y publicaciones
  GRH actuales continúan usando exclusivamente GRH.

## Evidencia reproducida

La inspección read-only de los respaldos exactos confirmó:

| Fuente | Evidencia al corte |
|---|---|
| GRH | 257 tablas físicas, 7 vistas, 6.573.057 filas, 2.349 filas de persona y 2.450 filas de legajo |
| PERSONAS | 32 tablas físicas, 8 vistas, 371.947 filas, 96.777 personas y 273.314 domicilios |

En PERSONAS también se observaron 21 tablas vacías, 90.365 personas con al menos
un domicilio, 44.333 filas con CUIL que supera el dígito verificador, 41.376 CUIL
válidos distintos, 183 filas de domicilio con latitud y longitud no cero y 350
registros de contacto. Esas 183 filas no tienen un vínculo verificable a una
persona y no habilitan un mapa individual. Estos conteos describen el respaldo; no certifican
vigencia, exactitud de domicilio ni autorización de uso operativo.

El diagnóstico de vinculación produjo esta línea de base:

| Resultado | Personas GRH | Interpretación |
|---|---:|---|
| Coincidencia automática por CUIL válido y único | 1.432 | Candidato de alta confianza, aún no promovido a producción |
| Candidatos asistidos por evidencia adicional | 267 | Requieren conservar método, evidencia y revisión |
| **Candidatos vinculables** | **1.699** | **72,3% de las 2.349 personas GRH; no es un crosswalk productivo certificado** |
| Casos ambiguos | 157 | No elegir una identidad automáticamente |
| Sin coincidencia | 493 | Mantener pendientes; no completar por aproximación |

Los 267 candidatos asistidos se reprodujeron como 58 coincidencias con CUIL
duplicado resueltas por nombre, 203 por DNI único y 6 con DNI duplicado resueltas
por nombre. El informe recibido no incluye un algoritmo ejecutable que permita
certificar su desglose interno; por eso la plataforma conserva esta reproducción
como evidencia de ingeniería y no como decisión de identidad.

La Fase 1A fija esas reglas como `grh-personas-linkage-matcher-v1`. El algoritmo
no usa sexo como evidencia, no promueve coincidencias basadas sólo en nombre y
no crea enlaces. Los 157 casos ambiguos incluyen candidatos documentales no
resueltos y tres señales de nombre/fecha que sirven únicamente para formar la
futura cola de revisión humana. El resultado agregado reconcilia las 2.349
personas GRH sin colisiones de destino.

## Reglas de vinculación

1. Normalizar CUIL a once dígitos y validar su dígito verificador. Nulos, ceros o
   valores inválidos no pueden crear una identidad canónica.
2. Admitir CUIL válido y único como candidato automático de alta confianza.
3. Ante CUIL duplicado, exigir evidencia adicional y no resolver si queda más de
   una persona posible.
4. Usar DNI sólo como respaldo, acompañado por nombre normalizado y, cuando esté
   disponible, fecha de nacimiento.
5. Tratar nombre y fecha de nacimiento como evidencia de validación, nunca como
   llave única suficiente.
6. Conservar permanentemente los identificadores originales de ambos sistemas,
   el método, la confianza, la evidencia, la versión y la vigencia de cada enlace.
7. Enviar los casos ambiguos a revisión humana y permitir que un enlace sea
   corregido o cerrado sin borrar su historia.

## Contrato objetivo

La futura capa canónica debe separar:

- `person_identity`: identidad municipal normalizada;
- `employment_contract`: vínculo laboral cuya autoridad sigue siendo GRH;
- `source_xref` o `crosswalk_persona`: enlace versionado entre cada identificador
  fuente y la identidad canónica, con `match_method`, `confidence`, `evidence`,
  `valid_from` y `valid_to`;
- una cola de revisión para los 157 casos ambiguos y los futuros conflictos.

La tabla puente no se publica en el navegador ni autoriza por sí sola fichas,
domicilios o datos personales. Cada consumidor requiere finalidad, rol, tenant,
campos permitidos, auditoría y política de retención propios.

## Fases y controles de aceptación

### Fase 0 — vigente

- GRH continúa como única entrada de los contratos GRH actuales.
- `personas_junin` continúa excluida de `config/grh-source-manifest.json`, de los
  artefactos GRH, del frontend, de Neon y de Production.
- Los 1.699 enlaces son una línea de base reproducible, no datos productivos.

### Fase 1A — diagnóstico agregado local

- manifiesto propio de PERSONAS con archivo, SHA-256, tamaño y corte exactos;
- matcher versionado y determinista sobre los dos respaldos aprobados;
- artefacto agregado sin nombres, documentos, domicilios ni identificadores;
- contrato `grh-personas-linkage-readiness-v1` y una lectura municipal que
  explican 1.699 candidatos, 157 casos para revisar y 493 sin coincidencia;
- `IDPERSONA` prohibido como llave entre sistemas y cero cambios en los KPI o
  fichas GRH actuales.

Esta fase permite evaluar la preparación de la integración. No publica un
crosswalk ni habilita datos de PERSONAS dentro del directorio laboral.

### Fase 1B — staging privado y revisión reproducible

- staging inmutable de ambas fuentes, sin sobrescribir sus identificadores;
- export privado de evidencia y muestreo sin exponer PII en el navegador;
- reconciliación exacta de 1.699 candidatos, 157 ambiguos y 493 pendientes, o
  explicación documentada de cada variación.

### Fase 2 — revisión y publicación privada

- aprobación institucional de finalidad, campos, retención y responsables;
- revisión humana de ambiguos y muestreo de candidatos automáticos;
- cero enlaces promovidos por igualdad de `IDPERSONA` entre sistemas;
- cero CUIL inválidos promovidos a identidad canónica;
- migración tenant-bound, auditoría de lectura/cambio, rollback y restore probados;
- publicación únicamente a vistas privadas minimizadas y autorizadas.

Ninguna fase cambia silenciosamente los KPI existentes. Un tablero sólo podrá
usar PERSONAS cuando su contrato indique fuente, cobertura, versión del
crosswalk, fecha de corte y límites de interpretación.
