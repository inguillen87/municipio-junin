# Capa semántica GRH v2

`api/_data/grh-semantic.json` es la salida agregada, reproducible y sin PII del
snapshot GRH. Su fuente canónica es únicamente `grh_junin`; `personas_junin`
queda excluida porque es una base de ejemplo y sus identificadores no deben
cruzarse con el dominio GRH.

Los JSON generados son artefactos privados ignorados por Git y Vercel.
Producción debe leerlos desde `grh_artifacts`, vinculados al CUID del tenant
propietario y al SHA-256 aprobado. Nunca deben publicarse como assets estáticos
ni adjuntarse a un repositorio público.

## Cambio de v1 a v2

La versión 2 agrega `distinct_participants_by_year` a `absence`, `leave` y
`movements`. La cardinalidad se calcula con la clave compuesta
`CODI_01 + LEGA_12`, sólo para filas temporalmente válidas. No se exporta
ninguna clave individual.

El campo permite decidir si un agregado anual alcanza el umbral de privacidad.
El número de eventos por sí solo no demuestra cuántas personas distintas están
detrás de la métrica.

`grh-semantic-v1` se rechaza de forma explícita: agregar una clave a un contrato
exact-key es un cambio incompatible y no se oculta bajo la versión anterior.

## Contrato analítico

- El corte temporal se toma del nombre del backup (`YYYYMMDD`) o de `--as-of`.
- Son válidos los años desde 1979 hasta la fecha del snapshot, con meses 1–12.
- `calculo` y `totpago` exigen fecha válida y coherencia del año. Una diferencia
  de mes se informa como diagnóstico porque puede corresponder a una corrida
  fuera de ciclo.
- La serie ejecutiva de liquidación se deriva de los conceptos de control de
  `calculo`: 993 (haberes sujetos), 994 (haberes no sujetos), 995 (asignaciones
  familiares), 996 (retenciones), 998 (neto), 999 (neto a pagar) y 990
  (contribución patronal). Su identidad es `998 = 993 + 994 + 995 - 996` y
  `999 = 998`.
- Esa serie representa control de cálculo, no acreditación bancaria ni pago
  ejecutado. `totpago` se conserva como diagnóstico porque el backup contiene
  diferencias materiales entre ambas fuentes.
- La conciliación cross-source compara por empresa, período, fecha y tipo de
  corrida los conceptos 993/994/996/998/990 contra
  `THCA_65/THSA_65/TRET_65/NETO_65/TAPO_65`.
- Los importes se publican en centavos enteros de la unidad de origen. El dump
  no declara código de moneda, por lo que no se etiqueta ARS.
- La dotación del último período significa claves de legajo distintas con al
  menos una fila válida en `calculo`. Es participación en liquidación, no un
  maestro contractual de empleados activos.
- Ausencias, licencias y movimientos conservan conteos de eventos y
  cardinalidad anual de participantes distintos. La publicación al navegador
  depende de la [política de privacidad y agregación](../GRH_PRIVACY_AGGREGATION_POLICY.md).

## Identidades obligatorias de v2

Para cada uno de los tres dominios anuales:

- los años de `valid_by_year` y `distinct_participants_by_year` deben coincidir;
- cada cardinalidad es un entero no negativo;
- participantes distintos no puede superar eventos válidos del mismo año;
- la suma de `valid_by_year` debe coincidir con `valid_rows`;
- las claves incompletas no cuentan como participantes;
- no se serializan conjuntos, legajos, empresas ni identificadores personales.

El contrato de salida para navegadores aplica luego k-anonimato: k=5 para
rankings laborales interactivos y k=10 para métricas sensibles o portables.

## Quality score

El puntaje evalúa este extracto gobernado, no la aptitud de las 257 tablas raw.
Pondera validez temporal (30 %), integridad referencial de hechos (30 %),
conciliación cross-source `calculo` versus `totpago` (30 %) y unicidad de la
clave compuesta de `legajo` (10 %).

Los riesgos estructurales —PII en origen, snapshot histórico, moneda no
declarada, diferencias de liquidación y errores de importación legacy—
permanecen visibles. El score no certifica tiempo real ni pagos acreditados.

## Reproducción

```powershell
python scripts/build_grh_semantic.py `
  '<ruta-privada-al-backup-grh>.sql.gz' `
  --out api/_data/grh-semantic.json

python -m unittest discover -s tests -v

# Después de aplicar y certificar la migración de grh_artifacts:
$env:DATABASE_URL='<secreto>'
node scripts/publish_grh_artifacts.mjs --tenant-id '<tenants.id real>'
```

La publicación conectada requiere baseline, tenant, transporte TLS, SHA aprobado
y revisión institucional. Generar el JSON local no certifica una base remota ni
autoriza un deployment.
