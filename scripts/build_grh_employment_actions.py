#!/usr/bin/env python3
"""Build the aggregate-only GRH employment-actions contract.

The generator streams ``foja`` and ``legajo`` from the approved compressed
backup. Compound employee keys are used transiently for join controls, then
resolved through ``legajo.IDPERSONA`` before participant cardinalities are
computed. Neither kind of identifier is serialized. Instrument numbers,
observations, users, document values and raw category labels are never retained
in the artifact.
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
        count_insert_rows,
        date_reasons,
        parse_int,
        parse_sql_tuples,
        valid_employee_key,
    )
    from .grh_source_manifest import load_and_validate_canonical_source
except ImportError:  # Direct execution.
    from build_grh_semantic import (
        COLUMN_RE,
        CREATE_RE,
        INSERT_RE,
        TableSchema,
        count_insert_rows,
        date_reasons,
        parse_int,
        parse_sql_tuples,
        valid_employee_key,
    )
    from grh_source_manifest import load_and_validate_canonical_source


SCHEMA_VERSION = "grh-employment-actions-v1"
GENERATED_AT = "2026-08-13T00:00:00.000Z"
MINIMUM_YEAR = 1979
PRIVACY_THRESHOLD = 10
TARGET_TABLES = {"foja", "legajo"}
CLASSIFICATION_RULE_VERSION = "grh-foja-action-codes-v1"
PRIVACY_RULE = (
    "protect_category_when_current_prior_or_absolute_delta_is_1_to_9_"
    "and_apply_complementary_suppression"
)
PERIODS = {
    "current": {
        "label": "Gestión actual hasta el corte",
        "startDate": "2023-12-09",
        "endDate": "2026-08-06",
        "days": 972,
    },
    "prior": {
        "label": "Mismo tiempo de la gestión anterior",
        "startDate": "2019-12-09",
        "endDate": "2022-08-06",
        "days": 972,
    },
}

# Labels and meanings are reviewed product language. Raw DETA_FJ and
# MOTI_FJ_DETA values are not copied to the aggregate artifact.
CATEGORY_DEFINITIONS: dict[int, dict[str, str]] = {
    11: {"key": "unclassified-record", "label": "Actuación sin clasificación", "meaning": "Registro legado sin clasificación funcional suficiente."},
    18: {"key": "competition-status", "label": "Condición de concurso informada", "meaning": "Actuación sobre una condición de concurso documentada."},
    19: {"key": "jurisdiction", "label": "Jurisdicción informada", "meaning": "Actuación sobre la jurisdicción registrada."},
    21: {"key": "incapacity-status", "label": "Incapacidad informada", "meaning": "Actuación administrativa vinculada con una incapacidad informada."},
    22: {"key": "personnel-type", "label": "Tipo de personal", "meaning": "Actuación sobre el tipo de personal informado."},
    24: {"key": "labor-agreement", "label": "Convenio laboral", "meaning": "Actuación sobre el convenio laboral informado."},
    25: {"key": "reported-entry-date", "label": "Fecha de ingreso informada", "meaning": "Actuación sobre una fecha de ingreso; no equivale a un alta única."},
    26: {"key": "reported-exit-date", "label": "Fecha de egreso informada", "meaning": "Actuación sobre una fecha de egreso; no equivale a una baja única."},
    27: {"key": "category", "label": "Categoría laboral", "meaning": "Actuación sobre la categoría laboral informada."},
    28: {"key": "leave-regime", "label": "Régimen de licencia", "meaning": "Actuación sobre el régimen de licencia informado."},
    29: {"key": "indemnity-cap", "label": "Tope indemnizatorio", "meaning": "Actuación sobre el tope indemnizatorio informado."},
    30: {"key": "grouping", "label": "Agrupamiento", "meaning": "Actuación sobre el agrupamiento informado."},
    31: {"key": "workplace", "label": "Lugar de trabajo", "meaning": "Actuación sobre el lugar de trabajo informado."},
    32: {"key": "area", "label": "Área municipal", "meaning": "Actuación sobre el área municipal informada."},
    33: {"key": "distribution", "label": "Repartición", "meaning": "Actuación sobre la repartición informada."},
    34: {"key": "function", "label": "Función", "meaning": "Actuación sobre la función informada."},
    35: {"key": "unhealthy-work", "label": "Condición de insalubridad", "meaning": "Actuación sobre una condición de insalubridad informada."},
    36: {"key": "contract-type", "label": "Tipo de contrato", "meaning": "Actuación sobre el tipo de contrato informado."},
    37: {"key": "seniority", "label": "Antigüedad", "meaning": "Actuación sobre la antigüedad informada."},
    38: {"key": "temporary-assignment", "label": "Subrogancia", "meaning": "Actuación sobre una subrogancia informada."},
    39: {"key": "employment-status", "label": "Situación de revista", "meaning": "Actuación sobre la situación de revista informada."},
    40: {"key": "position-structure", "label": "Estructura de cargos", "meaning": "Actuación sobre la estructura de cargos informada."},
}

CANONICAL_CONTROLS = {
    "sourceRows": 9_481,
    "validRows": 9_478,
    "quarantineRows": 3,
    "matchedRows": 9_481,
    "orphanRows": 0,
    "distinctEmployeeKeys": 1_302,
    "firstValidDate": "1979-05-11",
    "lastValidDate": "2026-08-06",
    "current": {"actionEvents": 3_882, "distinctPersons": 714},
    "prior": {"actionEvents": 3_226, "distinctPersons": 631},
    "categoryCount": 22,
    "releasedCategoryCount": 13,
    "protectedCategoryCount": 9,
    "totalWindowEvents": 7_108,
}

LIMITS = [
    {"code": "historical_snapshot_not_realtime", "text": "La información corresponde al respaldo del 6 de agosto de 2026 y no se actualiza en tiempo real."},
    {"code": "action_rows_not_unique_changes", "text": "Cada fila es una actuación documentada; no representa necesariamente un cambio único."},
    {"code": "effective_date_not_current_validity", "text": "La fecha efectiva informada no prueba que una condición continúe vigente en la actualidad."},
    {"code": "entry_exit_actions_not_staffing_events", "text": "Las actuaciones sobre fechas de ingreso o egreso no deben interpretarse automáticamente como altas o bajas de dotación."},
    {"code": "comparison_not_causal_attribution", "text": "La comparación usa ventanas iguales de 972 días; describe registros y no atribuye causas ni desempeño de gestión."},
    {"code": "sensitive_source_values_withheld", "text": "No se publican valores de instrumentos, observaciones, usuarios, documentos ni identificadores personales."},
    {"code": "source_labels_normalized", "text": "Las categorías usan una clasificación municipal versionada; no copian etiquetas libres del sistema legado."},
]


def _empty_stats() -> dict[str, Any]:
    return {
        "events": 0,
        "persons": set(),
        "instrumentTypePresent": 0,
        "instrumentNumberPresent": 0,
        "sourceCategoryPresent": 0,
        "documentCodePresent": 0,
    }


def _present(value: Any) -> bool:
    return value is not None and bool(str(value).strip())


def _period_dates(period: dict[str, Any]) -> tuple[dt.date, dt.date]:
    return dt.date.fromisoformat(period["startDate"]), dt.date.fromisoformat(period["endDate"])


def _add_event(stats: dict[str, Any], employee_key: tuple[int, int], row: dict[str, Any]) -> None:
    stats["events"] += 1
    stats["persons"].add(employee_key)
    stats["instrumentTypePresent"] += int(_present(row.get("INST_FJ")))
    stats["instrumentNumberPresent"] += int(_present(row.get("nins_fj")))
    stats["sourceCategoryPresent"] += int(_present(row.get("MOTI_FJ_DETA")))
    stats["documentCodePresent"] += int(_present(row.get("codi_fj")))


def _resolve_participants(
    stats: dict[str, Any],
    person_by_employee_key: dict[tuple[int, int], int],
) -> None:
    """Replace transient employment keys with canonical GRH person IDs."""
    stats["persons"] = {
        person_by_employee_key[employee_key]
        for employee_key in stats["persons"]
        if employee_key in person_by_employee_key
    }


def _small(value: int) -> bool:
    return 1 <= abs(value) <= PRIVACY_THRESHOLD - 1


def _requires_protection(current: dict[str, Any], prior: dict[str, Any]) -> bool:
    values = (
        current["events"], len(current["persons"]),
        prior["events"], len(prior["persons"]),
        current["events"] - prior["events"],
        len(current["persons"]) - len(prior["persons"]),
    )
    return any(_small(value) for value in values)


def _bucket_metrics(codes: set[int], stats: dict[int, dict[str, Any]]) -> dict[str, Any]:
    persons: set[int] = set()
    events = 0
    for code in codes:
        events += stats[code]["events"]
        persons.update(stats[code]["persons"])
    return {"events": events, "persons": len(persons)}


def _rounded_pct(numerator: int, denominator: int) -> float | None:
    return round(numerator * 100 / denominator, 4) if denominator else None


def _comparison_metrics(stats: dict[str, Any]) -> dict[str, Any]:
    persons = len(stats["persons"])
    return {
        "privacyStatus": "released",
        "actionEvents": stats["events"],
        "distinctPersons": persons,
        "actionsPerPerson": round(stats["events"] / persons, 4) if persons else None,
        "instrumentTypePresent": stats["instrumentTypePresent"],
        "instrumentNumberPresent": stats["instrumentNumberPresent"],
        "sourceCategoryPresent": stats["sourceCategoryPresent"],
        "documentCodePresent": stats["documentCodePresent"],
    }


def _assert_canonical_controls(result: dict[str, Any]) -> None:
    coverage = result["coverage"]
    for key in ("sourceRows", "validRows", "quarantineRows", "matchedRows", "orphanRows", "distinctEmployeeKeys"):
        if coverage[key] != CANONICAL_CONTROLS[key]:
            raise ValueError(f"Control canónico de foja no conciliado: {key}")
    for key in ("firstValidDate", "lastValidDate"):
        if result["source"][key] != CANONICAL_CONTROLS[key]:
            raise ValueError(f"Control temporal canónico no conciliado: {key}")
    for period_key in ("current", "prior"):
        for metric, expected in CANONICAL_CONTROLS[period_key].items():
            if result["comparison"][period_key][metric] != expected:
                raise ValueError(f"Control canónico de período no conciliado: {period_key}.{metric}")
    classification = result["classification"]
    for key in ("categoryCount", "releasedCategoryCount", "protectedCategoryCount", "totalWindowEvents"):
        if classification[key] != CANONICAL_CONTROLS[key]:
            raise ValueError(f"Control canónico de clasificación no conciliado: {key}")


def build_employment_actions(
    source: Path,
    manifest: dict[str, Any],
    *,
    enforce_canonical_controls: bool = False,
) -> dict[str, Any]:
    """Stream the approved backup and return only governed aggregates."""
    snapshot = dt.date.fromisoformat(manifest["snapshot_as_of"])
    if snapshot.isoformat() != PERIODS["current"]["endDate"]:
        raise ValueError("El corte del manifiesto no coincide con los períodos gobernados")
    for period in PERIODS.values():
        start, end = _period_dates(period)
        if (end - start).days + 1 != period["days"]:
            raise ValueError("Las ventanas gobernadas deben conservar 972 días inclusivos")

    schemas: dict[str, TableSchema] = {}
    current_table: str | None = None
    source_rows = 0
    valid_rows = 0
    first_valid_date: dt.date | None = None
    last_valid_date: dt.date | None = None
    action_key_counts: collections.Counter[tuple[int, int]] = collections.Counter()
    employment_keys: set[tuple[int, int]] = set()
    person_by_employee_key: dict[tuple[int, int], int] = {}
    totals = {key: _empty_stats() for key in PERIODS}
    categories = {
        key: collections.defaultdict(_empty_stats)
        for key in PERIODS
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
            schema_columns = schemas.get(table_name, TableSchema(table_name)).columns
            columns = (
                [item.strip().strip("`") for item in explicit_columns.split(",")]
                if explicit_columns else schema_columns
            )
            required = (
                {"CODI_01", "LEGA_12", "FECH_FJ", "INST_FJ", "nins_fj", "MOTI_FJ", "codi_fj", "MOTI_FJ_DETA"}
                if table_name == "foja" else {"CODI_01", "LEGA_12", "IDPERSONA"}
            )
            if not required.issubset(columns):
                raise ValueError(f"Estructura requerida ausente en {table_name}")
            expected_rows = count_insert_rows(values_text)
            parsed_rows = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_rows += 1
                row = {columns[index]: raw_row[index] for index in range(min(len(columns), len(raw_row)))}
                company = parse_int(row.get("CODI_01"))
                employee = parse_int(row.get("LEGA_12"))
                employee_key = (company, employee)
                if not valid_employee_key(employee_key):
                    if table_name == "legajo":
                        continue
                    raise ValueError(f"Clave compuesta inválida en {table_name}")
                typed_key = (int(company), int(employee))
                if table_name == "legajo":
                    employment_keys.add(typed_key)
                    person_id = parse_int(row.get("IDPERSONA"))
                    if person_id is None or person_id <= 0:
                        continue
                    previous_person_id = person_by_employee_key.get(typed_key)
                    if previous_person_id is not None and previous_person_id != person_id:
                        raise ValueError("Clave laboral enlazada a más de una persona GRH")
                    person_by_employee_key[typed_key] = int(person_id)
                    continue

                source_rows += 1
                action_key_counts[typed_key] += 1
                reasons, effective_date = date_reasons(
                    row.get("FECH_FJ"), min_year=MINIMUM_YEAR, as_of=snapshot,
                )
                if reasons or effective_date is None:
                    continue
                valid_rows += 1
                first_valid_date = effective_date if first_valid_date is None else min(first_valid_date, effective_date)
                last_valid_date = effective_date if last_valid_date is None else max(last_valid_date, effective_date)
                action_code = parse_int(row.get("MOTI_FJ"))
                for period_key, period in PERIODS.items():
                    start, end = _period_dates(period)
                    if not start <= effective_date <= end:
                        continue
                    if action_code not in CATEGORY_DEFINITIONS:
                        raise ValueError(f"Código de actuación sin clasificación gobernada en ventana: {action_code}")
                    _add_event(totals[period_key], typed_key, row)
                    _add_event(categories[period_key][int(action_code)], typed_key, row)
            if parsed_rows != expected_rows:
                raise ValueError(f"Row parser mismatch for {table_name}: counted {expected_rows}, parsed {parsed_rows}")

    if source_rows == 0 or not employment_keys or first_valid_date is None or last_valid_date is None:
        raise ValueError("El backup no contiene las fuentes laborales requeridas")
    matched_rows = sum(count for key, count in action_key_counts.items() if key in employment_keys)
    orphan_rows = source_rows - matched_rows
    action_keys_without_person = set(action_key_counts).intersection(employment_keys) - set(person_by_employee_key)
    if action_keys_without_person:
        raise ValueError("Una actuación enlazada a legajo no posee IDPERSONA GRH válido")

    # Participant metrics are people, not employment records. Resolve every
    # transient key only after the full stream has loaded the legajo mapping;
    # SQL table order therefore cannot alter the result.
    for stats in totals.values():
        _resolve_participants(stats, person_by_employee_key)
    for period_categories in categories.values():
        for stats in period_categories.values():
            _resolve_participants(stats, person_by_employee_key)

    all_codes = set(categories["current"]) | set(categories["prior"])
    protected_codes = {
        code for code in all_codes
        if _requires_protection(categories["current"][code], categories["prior"][code])
    }
    # Complementary suppression prevents a single hidden category from being
    # recovered by subtracting all released categories from a total.
    while len(protected_codes) == 1 and len(protected_codes) < len(all_codes):
        candidates = all_codes - protected_codes
        companion = min(candidates, key=lambda code: (
            categories["current"][code]["events"] + categories["prior"][code]["events"], code,
        ))
        protected_codes.add(companion)

    while protected_codes:
        bucket_current = _bucket_metrics(protected_codes, categories["current"])
        bucket_prior = _bucket_metrics(protected_codes, categories["prior"])
        bucket_values = (
            bucket_current["events"], bucket_current["persons"],
            bucket_prior["events"], bucket_prior["persons"],
            bucket_current["events"] - bucket_prior["events"],
            bucket_current["persons"] - bucket_prior["persons"],
        )
        if not any(_small(value) for value in bucket_values):
            break
        candidates = all_codes - protected_codes
        if not candidates:
            raise ValueError("No se pudo construir un bucket protegido publicable")
        protected_codes.add(min(candidates, key=lambda code: (
            categories["current"][code]["events"] + categories["prior"][code]["events"], code,
        )))

    released_categories = []
    for code in sorted(all_codes - protected_codes, key=lambda item: CATEGORY_DEFINITIONS[item]["key"]):
        definition = CATEGORY_DEFINITIONS[code]
        current = {
            "events": categories["current"][code]["events"],
            "persons": len(categories["current"][code]["persons"]),
        }
        prior = {
            "events": categories["prior"][code]["events"],
            "persons": len(categories["prior"][code]["persons"]),
        }
        released_categories.append({
            **definition,
            "privacyStatus": "released",
            "current": current,
            "prior": prior,
            "deltas": {key: current[key] - prior[key] for key in ("events", "persons")},
        })

    comparison_current = _comparison_metrics(totals["current"])
    comparison_prior = _comparison_metrics(totals["prior"])
    delta_fields = (
        "actionEvents", "distinctPersons", "instrumentTypePresent",
        "instrumentNumberPresent", "sourceCategoryPresent", "documentCodePresent",
    )
    actions_per_person_delta = (
        round(comparison_current["actionsPerPerson"] - comparison_prior["actionsPerPerson"], 4)
        if comparison_current["actionsPerPerson"] is not None and comparison_prior["actionsPerPerson"] is not None
        else None
    )
    bucket_current = _bucket_metrics(protected_codes, categories["current"])
    bucket_prior = _bucket_metrics(protected_codes, categories["prior"])
    total_window_events = comparison_current["actionEvents"] + comparison_prior["actionEvents"]
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "canonicalSystem": manifest["canonical_system"],
            "sourceFile": manifest["source_file"],
            "sourceSha256": manifest["sha256"],
            "snapshotAsOf": manifest["snapshot_as_of"],
            "generatedAt": GENERATED_AT,
            "realtime": False,
            "tables": {"actions": "foja", "employment": "legajo"},
            "firstValidDate": first_valid_date.isoformat(),
            "lastValidDate": last_valid_date.isoformat(),
        },
        "privacy": {
            "threshold": PRIVACY_THRESHOLD,
            "rule": PRIVACY_RULE,
            "aggregateOnly": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "rawRowsExported": False,
            "instrumentValuesExported": False,
            "observationsExported": False,
            "userValuesExported": False,
            "rawCategoryValuesExported": False,
        },
        "metric": {
            "eventUnit": "actuación documentada en GRH.foja",
            "participantUnit": "persona GRH distinta enlazada por legajo con al menos una actuación",
            "effectiveDateMeaning": "fecha efectiva informada en FECH_FJ",
            "comparisonRule": "dos ventanas inclusivas de 972 días con el mismo mes y día de corte",
            "classificationRuleVersion": CLASSIFICATION_RULE_VERSION,
        },
        "coverage": {
            "sourceRows": source_rows,
            "validRows": valid_rows,
            "quarantineRows": source_rows - valid_rows,
            "matchedRows": matched_rows,
            "orphanRows": orphan_rows,
            "distinctEmployeeKeys": len(action_key_counts),
            "validDateRatePct": _rounded_pct(valid_rows, source_rows),
            "joinIntegrityPct": _rounded_pct(matched_rows, source_rows),
        },
        "periods": PERIODS,
        "comparison": {
            "current": comparison_current,
            "prior": comparison_prior,
            "deltas": {
                **{key: comparison_current[key] - comparison_prior[key] for key in delta_fields},
                "actionsPerPerson": actions_per_person_delta,
            },
        },
        "categories": released_categories,
        "protectedBucket": {
            "privacyStatus": "protected",
            "label": "Otras actuaciones protegidas",
            "categoryCount": len(protected_codes),
            "current": bucket_current,
            "prior": bucket_prior,
            "deltas": {key: bucket_current[key] - bucket_prior[key] for key in ("events", "persons")},
        },
        "classification": {
            "status": "exhaustive_governed_mapping",
            "ruleVersion": CLASSIFICATION_RULE_VERSION,
            "categoryCount": len(all_codes),
            "releasedCategoryCount": len(released_categories),
            "protectedCategoryCount": len(protected_codes),
            "totalWindowEvents": total_window_events,
            "classifiedWindowEvents": total_window_events,
            "coveragePct": 100,
        },
        "limits": LIMITS,
    }
    if enforce_canonical_controls:
        _assert_canonical_controls(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the approved GRH .sql.gz dump")
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-employment-actions.json"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
    )
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    result = build_employment_actions(args.source, manifest, enforce_canonical_controls=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "out": str(args.out),
        "schema": result["schemaVersion"],
        "valid_rows": result["coverage"]["validRows"],
        "released_categories": len(result["categories"]),
        "protected_categories": result["protectedBucket"]["categoryCount"],
        "contains_pii": result["privacy"]["containsPii"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
