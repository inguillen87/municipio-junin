#!/usr/bin/env python3
"""Build the aggregate-only GRH fixed-concept control contract.

The extractor streams the approved compressed backup and performs compound-key
joins only in memory.  The serialized artifact contains no employee identifiers,
source fixed identifiers, monetary amounts, legal-instrument values or raw rows.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
from pathlib import Path
from typing import Any

try:
    from .build_grh_semantic import (
        COLUMN_RE,
        CREATE_RE,
        INSERT_RE,
        TableSchema,
        canonical_utc_timestamp,
        count_insert_rows,
        parse_date,
        parse_generated_at,
        parse_int,
        parse_sql_tuples,
        period_reasons,
    )
    from .grh_source_manifest import load_and_validate_canonical_source
except ImportError:  # Direct execution.
    from build_grh_semantic import (
        COLUMN_RE,
        CREATE_RE,
        INSERT_RE,
        TableSchema,
        canonical_utc_timestamp,
        count_insert_rows,
        parse_date,
        parse_generated_at,
        parse_int,
        parse_sql_tuples,
        period_reasons,
    )
    from grh_source_manifest import load_and_validate_canonical_source


SCHEMA_VERSION = "grh-fixed-concept-control-v1"
POLICY_VERSION = "grh-fixed-concept-control-policy-v1"
GENERATED_AT = "2026-08-14T00:00:00.000Z"
PRIVACY_THRESHOLD = 10
MINIMUM_YEAR = 1979
CALCULATION_PERIOD = "2026-07"
CALCULATION_PERIOD_END = dt.date(2026, 7, 31)
TARGET_TABLES = {"fijos", "concepto", "calculo", "legajo"}
CURRENT_WINDOW = (dt.date(2023, 12, 9), dt.date(2026, 8, 6))
PRIOR_WINDOW = (dt.date(2019, 12, 9), dt.date(2022, 8, 6))
PROTECTED_CATEGORY_LABEL = "Otros conceptos protegidos"

STATE_DEFINITIONS = (
    (
        "same_person_and_concept_observed",
        "Misma persona y concepto observados",
    ),
    (
        "person_observed_concept_absent",
        "Persona observada; concepto no observado",
    ),
    (
        "person_not_observed_in_period",
        "Persona no observada en el período",
    ),
)

LIMITS = [
    {
        "code": "historical_snapshot_not_realtime",
        "text": "La información corresponde al respaldo del 6 de agosto de 2026 y no se actualiza en tiempo real.",
    },
    {
        "code": "observation_not_authorization_or_payment",
        "text": "Observar la misma persona y concepto en cálculo no acredita autorización, corrección, devengado ni pago.",
    },
    {
        "code": "absence_not_error",
        "text": "No observar una persona o concepto en julio de 2026 es una señal de revisión y no demuestra un error.",
    },
    {
        "code": "fixed_range_not_employment_status",
        "text": "La vigencia por fechas de fijos no acredita vínculo laboral activo ni participación en una liquidación.",
    },
    {
        "code": "reported_start_not_employment_ingress",
        "text": "FECHA_ALTA es el alta informada del concepto fijo; no representa el ingreso laboral de una persona.",
    },
    {
        "code": "administration_comparison_descriptive_only",
        "text": "Las ventanas iguales describen registros de origen y no evalúan gestiones, causas, mérito ni desempeño.",
    },
    {
        "code": "no_amounts_budget_procurement_or_treasury",
        "text": "La vista no publica importes ni integra presupuesto, compras, tesorería o transferencias bancarias.",
    },
]

CANONICAL = {
    "coverage": {
        "sourceFixedRows": 8_729,
        "uniqueFixedIds": 8_729,
        "duplicateFixedIdRows": 0,
        "validEmployeeKeyRows": 8_729,
        "matchedLegajoRows": 8_729,
        "orphanLegajoRows": 0,
        "validRangeRows": 8_066,
        "missingStartRows": 0,
        "missingEndRows": 2,
        "endBeforeStartRows": 661,
        "exactBusinessKeyExtraRows": 79,
        "calculationRows": 29_395,
        "calculationParticipants": 856,
        "calculationPersonConceptPairs": 22_181,
    },
    "reconciliation": {
        "eligibleFixedRows": 191,
        "eligiblePeople": 185,
        "states": {
            "same_person_and_concept_observed": (94, 90),
            "person_observed_concept_absent": (19, 18),
            "person_not_observed_in_period": (78, 77),
        },
    },
    "snapshot": {
        "eligibleFixedRows": 193,
        "eligiblePeople": 187,
        "authorizedStateRows": 192,
        "missingStateRows": 1,
        "movementTypeReportedRows": 84,
        "legalInstrumentReportedRows": 0,
        "conceptsObserved": 11,
        "releasedCategories": {
            "RESPONSABILIDAD JERARQUICA": (113, 113),
            "ESTADO DOCENTE": (59, 59),
        },
        "protectedCategoryCount": 9,
        "protectedRows": 21,
        "protectedPeople": 19,
    },
    "comparison": {
        "current": (60, 56, 7, 60, 60, 0),
        "prior": (423, 387, 7, 146, 146, 0),
    },
}


def _pct(numerator: int, denominator: int) -> float | None:
    return round(numerator * 100 / denominator, 4) if denominator else None


def _columns(explicit_columns: str | None, schema: TableSchema) -> list[str]:
    if explicit_columns:
        return [item.strip().strip("`") for item in explicit_columns.split(",")]
    return schema.columns


def _row(columns: list[str], raw_row: list[str | None]) -> dict[str, str | None]:
    return {columns[index]: raw_row[index] for index in range(min(len(columns), len(raw_row)))}


def _employee_key(row: dict[str, str | None]) -> tuple[int, int] | None:
    company = parse_int(row.get("CODI_01"))
    employee = parse_int(row.get("LEGA_12"))
    if company is None or company <= 0 or employee is None or employee <= 0:
        return None
    return company, employee


def _reported(value: str | None) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _eligible(row: dict[str, Any], anchor: dt.date) -> bool:
    start = row["start"]
    end = row["end"]
    return isinstance(start, dt.date) and isinstance(end, dt.date) and start <= anchor <= end


def _assert_releasable(value: int, label: str) -> None:
    if 0 < value < PRIVACY_THRESHOLD:
        raise ValueError(f"Celda pequeña no publicable: {label}")


def _build_window(
    fixed_rows: list[dict[str, Any]],
    *,
    code: str,
    label: str,
    start: dt.date,
    end: dt.date,
) -> dict[str, Any]:
    selected = [row for row in fixed_rows if isinstance(row["start"], dt.date) and start <= row["start"] <= end]
    people = {row["personId"] for row in selected if row["personId"] is not None}
    concepts = {row["conceptCode"] for row in selected if row["conceptCode"] is not None}
    _assert_releasable(len(selected), f"comparison.{code}.startRows")
    _assert_releasable(len(people), f"comparison.{code}.distinctPeople")
    return {
        "code": code,
        "label": label,
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "days": (end - start).days + 1,
        "startRows": len(selected),
        "distinctPeople": len(people),
        "concepts": len(concepts),
        "stateReportedRows": sum(row["stateReported"] for row in selected),
        "movementTypeReportedRows": sum(row["movementTypeReported"] for row in selected),
        "legalInstrumentReportedRows": sum(row["legalInstrumentReported"] for row in selected),
        "privacyStatus": "released",
    }


def _build_categories(
    eligible_rows: list[dict[str, Any]],
    concept_labels: dict[int, str],
) -> dict[str, Any]:
    rows_by_concept: collections.Counter[int] = collections.Counter()
    people_by_concept: dict[int, set[int]] = collections.defaultdict(set)
    for row in eligible_rows:
        code = row["conceptCode"]
        person_id = row["personId"]
        if code is None or person_id is None:
            raise ValueError("Concepto fijo elegible sin clave gobernada")
        rows_by_concept[code] += 1
        people_by_concept[code].add(person_id)

    released: list[dict[str, Any]] = []
    protected_codes: list[int] = []
    for code in sorted(rows_by_concept):
        people = len(people_by_concept[code])
        label = concept_labels.get(code)
        if people >= PRIVACY_THRESHOLD and isinstance(label, str) and label.strip():
            released.append({
                "label": label.strip(),
                "rows": rows_by_concept[code],
                "people": people,
                "privacyStatus": "released",
            })
        else:
            protected_codes.append(code)

    released.sort(key=lambda row: (-row["rows"], row["label"]))
    output = list(released)
    if protected_codes:
        protected_people: set[int] = set()
        protected_rows = 0
        for code in protected_codes:
            protected_rows += rows_by_concept[code]
            protected_people.update(people_by_concept[code])
        if len(protected_codes) < 2 or len(protected_people) < PRIVACY_THRESHOLD:
            raise ValueError("Agregado complementario de conceptos no publicable")
        output.append({
            "label": PROTECTED_CATEGORY_LABEL,
            "rows": protected_rows,
            "people": len(protected_people),
            "privacyStatus": "protected_aggregate",
        })
    return {
        "sourceCategoryCount": len(rows_by_concept),
        "releasedCategoryCount": len(released),
        "protectedCategoryCount": len(protected_codes),
        "rows": output,
    }


def _assert_canonical(result: dict[str, Any]) -> None:
    coverage = result["coverage"]
    for key, expected in CANONICAL["coverage"].items():
        if coverage.get(key) != expected:
            raise ValueError(f"Control canónico de conceptos fijos no conciliado: coverage.{key}")
    if coverage["catalogMatchedRows"] != coverage["sourceFixedRows"] or coverage["catalogOrphanRows"] != 0:
        raise ValueError("Catálogo de conceptos fijos no conciliado")

    reconciliation = result["reconciliation"]
    for key in ("eligibleFixedRows", "eligiblePeople"):
        if reconciliation[key] != CANONICAL["reconciliation"][key]:
            raise ValueError(f"Control canónico no conciliado: reconciliation.{key}")
    observed_states = {row["code"]: (row["rows"], row["people"]) for row in reconciliation["states"]}
    if observed_states != CANONICAL["reconciliation"]["states"]:
        raise ValueError("Estados canónicos de observación no conciliados")

    snapshot = result["snapshot"]
    for key in (
        "eligibleFixedRows", "eligiblePeople", "authorizedStateRows", "missingStateRows",
        "movementTypeReportedRows", "legalInstrumentReportedRows", "conceptsObserved",
    ):
        if snapshot[key] != CANONICAL["snapshot"][key]:
            raise ValueError(f"Control canónico no conciliado: snapshot.{key}")
    categories = snapshot["categories"]
    if categories["protectedCategoryCount"] != CANONICAL["snapshot"]["protectedCategoryCount"]:
        raise ValueError("Cantidad de categorías protegidas no conciliada")
    released = {
        row["label"]: (row["rows"], row["people"])
        for row in categories["rows"] if row["privacyStatus"] == "released"
    }
    if released != CANONICAL["snapshot"]["releasedCategories"]:
        raise ValueError("Categorías canónicas liberadas no conciliadas")
    protected = [row for row in categories["rows"] if row["privacyStatus"] == "protected_aggregate"]
    if len(protected) != 1 or (
        protected[0]["rows"], protected[0]["people"]
    ) != (CANONICAL["snapshot"]["protectedRows"], CANONICAL["snapshot"]["protectedPeople"]):
        raise ValueError("Agregado canónico protegido no conciliado")

    comparison = result["administrationComparison"]
    for key in ("current", "prior"):
        window = comparison[key]
        observed = (
            window["startRows"], window["distinctPeople"], window["concepts"],
            window["stateReportedRows"], window["movementTypeReportedRows"],
            window["legalInstrumentReportedRows"],
        )
        if observed != CANONICAL["comparison"][key]:
            raise ValueError(f"Ventana canónica no conciliada: {key}")


def build_fixed_concept_control(
    source: Path,
    manifest: dict[str, Any],
    *,
    generated_at: str = GENERATED_AT,
    enforce_canonical_controls: bool = False,
) -> dict[str, Any]:
    """Stream the approved backup and return a governed aggregate projection."""
    snapshot_date = dt.date.fromisoformat(manifest["snapshot_as_of"])
    if snapshot_date != CURRENT_WINDOW[1]:
        raise ValueError("El snapshot no coincide con la ventana administrativa actual")

    schemas: dict[str, TableSchema] = {}
    current_table: str | None = None
    fixed_rows: list[dict[str, Any]] = []
    legajo_keys: set[tuple[int, int]] = set()
    person_by_employee_key: dict[tuple[int, int], int] = {}
    concept_labels: dict[int, str] = {}
    calculation_people: set[tuple[int, int]] = set()
    calculation_pairs: set[tuple[int, int, int]] = set()
    calculation_rows = 0
    source_row_counts: collections.Counter[str] = collections.Counter()

    required_columns = {
        "fijos": {
            "FIJO_ID", "CODI_01", "LEGA_12", "CODI_27", "FECHA_ALTA", "FVTO_53",
            "NRO_INSTRUMENTO_LEGAL", "TIPO_MOVIMIENTO", "ESTADO",
        },
        "concepto": {"CODI_27", "DETA_15", "ABRE_15"},
        "calculo": {"CODI_01", "LEGA_12", "CODI_27", "PERI_31", "MES_31", "FECA_31"},
        "legajo": {"CODI_01", "LEGA_12", "IDPERSONA"},
    }

    with gzip.open(source, "rt", encoding="utf-8", errors="replace", newline="") as stream:
        for line in stream:
            create_match = CREATE_RE.match(line)
            if create_match:
                current_table = create_match.group(1)
                schemas[current_table] = TableSchema(current_table)
                continue
            if current_table:
                schema = schemas[current_table]
                column_match = COLUMN_RE.match(line)
                if column_match and not line.lstrip().startswith(("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT")):
                    schema.columns.append(column_match.group(1))
                if line.startswith(") ENGINE"):
                    current_table = None

            insert_match = INSERT_RE.match(line)
            if not insert_match:
                continue
            table_name, explicit_columns, values_text = insert_match.groups()
            if table_name not in TARGET_TABLES:
                continue
            schema = schemas.get(table_name, TableSchema(table_name))
            columns = _columns(explicit_columns, schema)
            if not required_columns[table_name].issubset(columns):
                raise ValueError(f"Estructura requerida ausente en {table_name}")
            expected_rows = count_insert_rows(values_text)
            parsed_rows = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_rows += 1
                row = _row(columns, raw_row)
                source_row_counts[table_name] += 1
                if table_name == "legajo":
                    key = _employee_key(row)
                    if key is not None:
                        legajo_keys.add(key)
                        person_id = parse_int(row.get("IDPERSONA"))
                        if person_id is not None and person_id > 0:
                            previous_person_id = person_by_employee_key.get(key)
                            if previous_person_id is not None and previous_person_id != person_id:
                                raise ValueError("Clave laboral enlazada a más de una persona GRH")
                            person_by_employee_key[key] = person_id
                    continue
                if table_name == "concepto":
                    code = parse_int(row.get("CODI_27"))
                    label = (row.get("DETA_15") or row.get("ABRE_15") or "").strip()
                    if code is not None and label:
                        concept_labels[code] = label
                    continue
                if table_name == "calculo":
                    year = parse_int(row.get("PERI_31"))
                    month = parse_int(row.get("MES_31"))
                    if year != 2026 or month != 7:
                        continue
                    reasons, *_ = period_reasons(
                        row.get("PERI_31"), row.get("MES_31"), row.get("FECA_31"),
                        min_year=MINIMUM_YEAR, as_of=snapshot_date,
                    )
                    if reasons:
                        continue
                    key = _employee_key(row)
                    concept = parse_int(row.get("CODI_27"))
                    if key is None or concept is None:
                        raise ValueError("Fila de cálculo válida sin clave gobernada")
                    calculation_rows += 1
                    calculation_people.add(key)
                    calculation_pairs.add((*key, concept))
                    continue

                fixed_rows.append({
                    "fixedId": parse_int(row.get("FIJO_ID")),
                    "employeeKey": _employee_key(row),
                    "personId": None,
                    "conceptCode": parse_int(row.get("CODI_27")),
                    "start": parse_date(row.get("FECHA_ALTA")),
                    "end": parse_date(row.get("FVTO_53")),
                    "state": (row.get("ESTADO") or "").strip(),
                    "stateReported": _reported(row.get("ESTADO")),
                    "movementTypeReported": _reported(row.get("TIPO_MOVIMIENTO")),
                    "legalInstrumentReported": _reported(row.get("NRO_INSTRUMENTO_LEGAL")),
                })
            if parsed_rows != expected_rows:
                raise ValueError(
                    f"Row parser mismatch for {table_name}: counted {expected_rows}, parsed {parsed_rows}"
                )

    missing_tables = TARGET_TABLES - set(schemas)
    if missing_tables:
        raise ValueError(f"Fuentes requeridas ausentes: {sorted(missing_tables)}")
    if not fixed_rows or not legajo_keys or not concept_labels or not calculation_rows:
        raise ValueError("El backup no contiene las fuentes requeridas para conceptos fijos")

    fixed_ids = [row["fixedId"] for row in fixed_rows]
    valid_fixed_ids = [value for value in fixed_ids if value is not None and value > 0]
    if len(valid_fixed_ids) != len(fixed_rows):
        raise ValueError("fijos contiene identificadores primarios ausentes o inválidos")
    fixed_id_counts = collections.Counter(valid_fixed_ids)
    duplicate_fixed_id_rows = sum(count - 1 for count in fixed_id_counts.values() if count > 1)
    if duplicate_fixed_id_rows:
        raise ValueError("Identificador primario duplicado en fijos")
    valid_key_rows = sum(row["employeeKey"] is not None for row in fixed_rows)
    matched_rows = sum(row["employeeKey"] in legajo_keys for row in fixed_rows if row["employeeKey"] is not None)
    orphan_rows = valid_key_rows - matched_rows
    matched_keys_without_person = {
        row["employeeKey"]
        for row in fixed_rows
        if row["employeeKey"] in legajo_keys and row["employeeKey"] not in person_by_employee_key
    }
    if matched_keys_without_person:
        raise ValueError("Un concepto fijo enlazado a legajo no posee IDPERSONA GRH válido")
    for row in fixed_rows:
        row["personId"] = person_by_employee_key.get(row["employeeKey"])
    catalog_matched_rows = sum(row["conceptCode"] in concept_labels for row in fixed_rows)
    catalog_orphan_rows = len(fixed_rows) - catalog_matched_rows

    missing_start_rows = sum(row["start"] is None for row in fixed_rows)
    missing_end_rows = sum(row["end"] is None for row in fixed_rows)
    end_before_start_rows = sum(
        isinstance(row["start"], dt.date) and isinstance(row["end"], dt.date) and row["end"] < row["start"]
        for row in fixed_rows
    )
    valid_range_rows = sum(
        isinstance(row["start"], dt.date) and isinstance(row["end"], dt.date) and row["start"] <= row["end"]
        for row in fixed_rows
    )
    business_keys = collections.Counter(
        (row["employeeKey"], row["conceptCode"], row["start"], row["end"])
        for row in fixed_rows
    )
    exact_business_key_extra_rows = sum(count - 1 for count in business_keys.values() if count > 1)

    calculation_eligible = [row for row in fixed_rows if _eligible(row, CALCULATION_PERIOD_END)]
    reconciliation_counts: collections.Counter[str] = collections.Counter()
    reconciliation_people: dict[str, set[int]] = collections.defaultdict(set)
    for row in calculation_eligible:
        key = row["employeeKey"]
        person_id = row["personId"]
        concept = row["conceptCode"]
        if key is None or person_id is None or concept is None:
            raise ValueError("Concepto fijo elegible sin clave gobernada")
        pair = (*key, concept)
        state = (
            "same_person_and_concept_observed" if pair in calculation_pairs
            else "person_observed_concept_absent" if key in calculation_people
            else "person_not_observed_in_period"
        )
        reconciliation_counts[state] += 1
        reconciliation_people[state].add(person_id)

    states = []
    for code, label in STATE_DEFINITIONS:
        rows = reconciliation_counts[code]
        people = len(reconciliation_people[code])
        _assert_releasable(rows, f"reconciliation.{code}.rows")
        _assert_releasable(people, f"reconciliation.{code}.people")
        states.append({
            "code": code,
            "label": label,
            "rows": rows,
            "people": people,
            "privacyStatus": "released",
        })

    snapshot_eligible = [row for row in fixed_rows if _eligible(row, snapshot_date)]
    snapshot_people = {row["personId"] for row in snapshot_eligible if row["personId"] is not None}
    current = _build_window(
        fixed_rows,
        code="current",
        label="Gestión actual comparable",
        start=CURRENT_WINDOW[0],
        end=CURRENT_WINDOW[1],
    )
    prior = _build_window(
        fixed_rows,
        code="prior",
        label="Mismo tramo cuatro años antes",
        start=PRIOR_WINDOW[0],
        end=PRIOR_WINDOW[1],
    )
    if current["days"] != prior["days"] or current["days"] != 972:
        raise ValueError("Las ventanas administrativas no tienen igual duración")

    quality_signals = [
        {
            "code": "fixed_range_end_before_start",
            "label": "Vencimiento anterior al alta",
            "severity": "high",
            "rows": end_before_start_rows,
            "ratePct": _pct(end_before_start_rows, len(fixed_rows)),
            "meaning": "El rango no puede usarse para determinar vigencia hasta ser saneado.",
        },
        {
            "code": "fixed_range_end_missing",
            "label": "Vencimiento no informado",
            "severity": "medium",
            "rows": missing_end_rows,
            "ratePct": _pct(missing_end_rows, len(fixed_rows)),
            "meaning": "La vigencia por rango no puede evaluarse cuando falta el vencimiento.",
        },
        {
            "code": "snapshot_eligible_legal_instrument_missing",
            "label": "Instrumento legal no informado",
            "severity": "high",
            "rows": sum(not row["legalInstrumentReported"] for row in snapshot_eligible),
            "ratePct": _pct(
                sum(not row["legalInstrumentReported"] for row in snapshot_eligible),
                len(snapshot_eligible),
            ),
            "meaning": "La columna existe, pero su ausencia no permite verificar respaldo legal desde esta fuente.",
        },
        {
            "code": "snapshot_eligible_movement_type_missing",
            "label": "Tipo de movimiento no informado",
            "severity": "medium",
            "rows": sum(not row["movementTypeReported"] for row in snapshot_eligible),
            "ratePct": _pct(
                sum(not row["movementTypeReported"] for row in snapshot_eligible),
                len(snapshot_eligible),
            ),
            "meaning": "La ausencia reduce la capacidad de interpretar cómo se originó o modificó el registro.",
        },
    ]

    result = {
        "schemaVersion": SCHEMA_VERSION,
        "policyVersion": POLICY_VERSION,
        "source": {
            "canonicalSystem": manifest["canonical_system"],
            "sourceFile": manifest["source_file"],
            "sourceSha256": manifest["sha256"],
            "snapshotAsOf": manifest["snapshot_as_of"],
            "generatedAt": generated_at,
            "realtime": False,
            "tables": {
                "fixedConcepts": "fijos",
                "conceptCatalog": "concepto",
                "calculationDetails": "calculo",
                "employmentMaster": "legajo",
            },
            "calculationPeriod": CALCULATION_PERIOD,
            "calculationPeriodEnd": CALCULATION_PERIOD_END.isoformat(),
        },
        "privacy": {
            "threshold": PRIVACY_THRESHOLD,
            "aggregateOnly": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "sourceKeysExported": False,
            "rawRowsExported": False,
            "monetaryAmountsExported": False,
            "legalInstrumentValuesExported": False,
            "arbitraryFiltersAllowed": False,
            "complementarySuppression": True,
        },
        "metric": {
            "fixedRowGrain": "una fila fuente de fijos identificada internamente por FIJO_ID, nunca exportado",
            "eligibleFixedConceptDefinition": "FECHA_ALTA menor o igual al ancla y FVTO_53 mayor o igual al ancla, con ambas fechas válidas",
            "exactObservationDefinition": "misma clave laboral interna CODI_01, LEGA_12 y CODI_27 en al menos una fila válida de calculo del período",
            "personObservedConceptAbsentDefinition": "el mismo registro laboral aparece en calculo del período, pero no se observa el mismo CODI_27",
            "personNotObservedDefinition": "la clave laboral interna no aparece en ninguna fila válida de calculo del período",
            "observationMeaning": "observado describe presencia técnica en la fuente; no acredita autorización, corrección, devengado ni pago",
            "absenceMeaning": "no observado es una señal de revisión; no demuestra error, baja, deuda ni incumplimiento",
            "comparisonRule": "dos ventanas inclusivas de 972 días: 2023-12-09..2026-08-06 y 2019-12-09..2022-08-06",
        },
        "coverage": {
            "sourceFixedRows": len(fixed_rows),
            "uniqueFixedIds": len(fixed_id_counts),
            "duplicateFixedIdRows": duplicate_fixed_id_rows,
            "validEmployeeKeyRows": valid_key_rows,
            "matchedLegajoRows": matched_rows,
            "orphanLegajoRows": orphan_rows,
            "legajoJoinCoveragePct": _pct(matched_rows, valid_key_rows),
            "catalogMatchedRows": catalog_matched_rows,
            "catalogOrphanRows": catalog_orphan_rows,
            "validRangeRows": valid_range_rows,
            "missingStartRows": missing_start_rows,
            "missingEndRows": missing_end_rows,
            "endBeforeStartRows": end_before_start_rows,
            "validRangeRatePct": _pct(valid_range_rows, len(fixed_rows)),
            "exactBusinessKeyExtraRows": exact_business_key_extra_rows,
            "calculationRows": calculation_rows,
            "calculationParticipants": len(calculation_people),
            "calculationPersonConceptPairs": len(calculation_pairs),
        },
        "reconciliation": {
            "calculationPeriod": CALCULATION_PERIOD,
            "fixedEligibilityDate": CALCULATION_PERIOD_END.isoformat(),
            "eligibleFixedRows": len(calculation_eligible),
            "eligiblePeople": len({row["personId"] for row in calculation_eligible}),
            "states": states,
            "exactObservationRatePct": _pct(
                reconciliation_counts["same_person_and_concept_observed"],
                len(calculation_eligible),
            ),
        },
        "snapshot": {
            "asOf": snapshot_date.isoformat(),
            "eligibleFixedRows": len(snapshot_eligible),
            "eligiblePeople": len(snapshot_people),
            "authorizedStateRows": sum(row["state"] == "Autorizado" for row in snapshot_eligible),
            "missingStateRows": sum(not row["stateReported"] for row in snapshot_eligible),
            "movementTypeReportedRows": sum(row["movementTypeReported"] for row in snapshot_eligible),
            "legalInstrumentReportedRows": sum(row["legalInstrumentReported"] for row in snapshot_eligible),
            "conceptsObserved": len({row["conceptCode"] for row in snapshot_eligible}),
            "categories": _build_categories(snapshot_eligible, concept_labels),
        },
        "administrationComparison": {
            "rule": "reported_fixed_concept_start_dates_in_equal_972_day_windows",
            "current": current,
            "prior": prior,
            "differences": {
                "startRows": current["startRows"] - prior["startRows"],
                "distinctPeople": current["distinctPeople"] - prior["distinctPeople"],
            },
            "metadataComparable": False,
            "interpretation": "FECHA_ALTA describe el alta informada del concepto fijo y la completitud de metadatos cambia entre ventanas; no son altas laborales ni evaluación de gestiones.",
        },
        "quality": {
            "status": "attention_required",
            "signals": quality_signals,
        },
        "limits": LIMITS,
    }
    if enforce_canonical_controls:
        _assert_canonical(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the approved GRH .sql.gz dump")
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-fixed-concept-control.json"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
    )
    parser.add_argument("--generated-at", type=parse_generated_at, default=parse_generated_at(GENERATED_AT))
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    result = build_fixed_concept_control(
        args.source,
        manifest,
        generated_at=canonical_utc_timestamp(args.generated_at),
        enforce_canonical_controls=True,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "schema": result["schemaVersion"],
        "fixed_rows": result["coverage"]["sourceFixedRows"],
        "eligible_rows": result["reconciliation"]["eligibleFixedRows"],
        "contains_pii": result["privacy"]["containsPii"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
