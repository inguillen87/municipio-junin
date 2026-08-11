"""Build the aggregate-only GRH workforce-finance source contract.

The builder reads the approved SQL gzip twice.  Pass one validates the schema,
discovers the calculation window and loads only dimension/reference and
``totpago`` controls.  Pass two aggregates the allowlisted ``calculo`` control
concepts at their observed company + employee + period + run dimensions.

No nominal row, employee key or raw SQL value is serialized or logged.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
import re
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Iterable

try:
    from .build_grh_semantic import (
        CREATE_RE,
        INSERT_RE,
        count_insert_rows,
        parse_decimal,
        parse_generated_at,
        parse_int,
        parse_sql_tuples,
        period_reasons,
        ratio,
        valid_employee_key,
        cents,
        canonical_utc_timestamp,
    )
    from .grh_source_manifest import load_and_validate_canonical_source
except ImportError:  # Direct execution: python scripts/build_grh_workforce_finance.py
    from build_grh_semantic import (
        CREATE_RE,
        INSERT_RE,
        count_insert_rows,
        parse_decimal,
        parse_generated_at,
        parse_int,
        parse_sql_tuples,
        period_reasons,
        ratio,
        valid_employee_key,
        cents,
        canonical_utc_timestamp,
    )
    from grh_source_manifest import load_and_validate_canonical_source


SOURCE_SCHEMA_VERSION = "grh-workforce-finance-source-v1"
PROJECTION_SCHEMA_VERSION = "grh-workforce-finance-v1"
POLICY_VERSION = "grh-workforce-finance-privacy-v1"
PROFILE_SCHEMA_VERSION = "grh-profile-v1"
SEMANTIC_SCHEMA_VERSION = "grh-semantic-v2"
PRIVACY_THRESHOLD = 10
PUBLISHED_WINDOW_MONTHS = 24
MAX_PUBLISHED_OBSERVABLES_PER_VIEW = 13
MAX_PROTECTED_TARGET_STATES_PER_PERIOD = 32768
MAX_SUBSET_EQUATIONS_PER_PERIOD = 12_000_000
PROTECTED_LABEL = "Otros (celdas protegidas)"
MINIMUM_VALID_YEAR = 1979

DIMENSIONS = ("sector", "cost_center", "agreement")
DIMENSION_FIELDS = {
    "sector": "CODI_07",
    "cost_center": "CODI_06",
    "agreement": "CODI_02",
}
REFERENCE_TABLES = {
    "sectores": ("sector", "CODI_07", ("DETA_07", "ABRE_07"), True),
    "costos": ("cost_center", "CODI_06", ("DETA_06",), True),
    "convenio": ("agreement", "CODI_02", ("DETA_02",), False),
}
CONTROL_CONCEPTS = {
    993: "contributory_earnings_cents",
    994: "non_contributory_earnings_cents",
    995: "family_allowances_cents",
    996: "employee_withholdings_cents",
    998: "net_payroll_cents",
    999: "net_to_pay_cents",
    990: "employer_contributions_cents",
}
COMPONENT_KEYS = (
    "gross_with_family_allowances_cents",
    "contributory_earnings_cents",
    "non_contributory_earnings_cents",
    "family_allowances_cents",
    "employee_withholdings_cents",
    "net_payroll_cents",
    "net_to_pay_cents",
    "employer_contributions_cents",
)
RECONCILIATION_FIELDS = {
    993: "THCA_65",
    994: "THSA_65",
    996: "TRET_65",
    998: "NETO_65",
    990: "TAPO_65",
}
TOTPAGO_FIELDS = tuple(RECONCILIATION_FIELDS.values())
TARGET_TABLES = {"calculo", "totpago", *REFERENCE_TABLES}

REQUIRED_COLUMNS = {
    "calculo": {
        "CODI_01", "PERI_31", "MES_31", "FECA_31", "TIPO_31",
        "LEGA_12", "CODI_27", "IMPO_31", "CODI_02", "CODI_06", "CODI_07",
    },
    "totpago": {
        "CODI_01", "PERI_31", "MES_31", "FECA_31", "TIPO_31",
        "THCA_65", "THSA_65", "TRET_65", "NETO_65", "TAPO_65",
    },
    "sectores": {"CODI_01", "CODI_07", "DETA_07", "ABRE_07"},
    "costos": {"CODI_01", "CODI_06", "DETA_06"},
    "convenio": {"CODI_02", "DETA_02"},
}

COLUMN_DEFINITION_RE = re.compile(r"^\s*`([^`]+)`\s+(.+?)(?:,)?\s*$")
MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
FORBIDDEN_OUTPUT_KEYS = {
    "legajo", "employee", "employee_key", "display_name", "nombre", "apellido",
    "dni", "cuil", "cbu", "email", "phone", "telefono", "address", "domicilio",
}


@dataclass
class DumpSchema:
    columns: list[str] = field(default_factory=list)
    definitions: dict[str, str] = field(default_factory=dict)


@dataclass
class RunBucket:
    participant: tuple[int | None, int | None]
    dimensions: dict[str, set[int | None]] = field(
        default_factory=lambda: {dimension: set() for dimension in DIMENSIONS}
    )
    controls: dict[int, Decimal] = field(default_factory=lambda: collections.defaultdict(Decimal))
    control_rows: int = 0


@dataclass
class RawCell:
    company_code: int | None
    source_code: int | None
    label: str | None
    force_protected: bool
    participants: set[tuple[int, int]] = field(default_factory=set)
    controls: dict[int, Decimal] = field(default_factory=lambda: collections.defaultdict(Decimal))


@dataclass(frozen=True)
class PublishedObservable:
    dimension: str
    period: str
    kind: str
    key: tuple[object, ...] | None
    participants: frozenset[tuple[int, int]]
    components: tuple[int, ...]
    protected_keys: frozenset[tuple[object, ...]] = frozenset()


@dataclass(frozen=True)
class CrossViewRisk:
    period: str
    left: PublishedObservable
    right: PublishedObservable


def exact_month(value: str) -> tuple[int, int]:
    match = MONTH_RE.fullmatch(value)
    if not match:
        raise ValueError(f"Invalid monthly period: {value}")
    return int(match.group(1)), int(match.group(2))


def shift_month(period: str, offset: int) -> str:
    year, month = exact_month(period)
    absolute = year * 12 + month - 1 + offset
    shifted_year, shifted_month_zero = divmod(absolute, 12)
    return f"{shifted_year:04d}-{shifted_month_zero + 1:02d}"


def month_window(latest_period: str, months: int) -> list[str]:
    if not isinstance(months, int) or months != PUBLISHED_WINDOW_MONTHS:
        raise ValueError(f"window_months must be exactly {PUBLISHED_WINDOW_MONTHS}")
    return [shift_month(latest_period, offset) for offset in range(-(months - 1), 1)]


def normalized_label(value: str | None) -> str | None:
    if value is None:
        return None
    label = " ".join(str(value).strip().split())
    if not label or len(label) > 160 or re.search(r"[\x00-\x1f\x7f]", label):
        return None
    return label


def first_label(row: dict[str, str | None], fields: Iterable[str]) -> str | None:
    for name in fields:
        label = normalized_label(row.get(name))
        if label:
            return label
    return None


def row_from_values(columns: list[str], values: list[str | None]) -> dict[str, str | None]:
    return {columns[index]: values[index] for index in range(min(len(columns), len(values)))}


def insert_columns(explicit_columns: str | None, schema: DumpSchema) -> list[str]:
    return (
        [item.strip().strip("`") for item in explicit_columns.split(",")]
        if explicit_columns
        else schema.columns
    )


def record_schema_line(
    schemas: dict[str, DumpSchema],
    current_table: str | None,
    line: str,
) -> str | None:
    create = CREATE_RE.match(line)
    if create:
        table = create.group(1)
        schemas.setdefault(table, DumpSchema())
        return table
    if current_table:
        match = COLUMN_DEFINITION_RE.match(line)
        if match and not line.lstrip().startswith(("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT")):
            name, definition = match.groups()
            schemas[current_table].columns.append(name)
            schemas[current_table].definitions[name] = definition.rstrip(",")
        if line.startswith(") ENGINE"):
            return None
    return current_table


def validate_schema(schemas: dict[str, DumpSchema]) -> None:
    errors = []
    for table, required in REQUIRED_COLUMNS.items():
        schema = schemas.get(table)
        if not schema:
            errors.append(f"missing_table:{table}")
            continue
        missing = sorted(required - set(schema.columns))
        errors.extend(f"missing_column:{table}.{column}" for column in missing)
    numeric_expectations = {
        "calculo": {"CODI_01", "PERI_31", "MES_31", "LEGA_12", "CODI_27", "CODI_02", "CODI_06", "CODI_07"},
        "totpago": {"CODI_01", "PERI_31", "MES_31"},
        "sectores": {"CODI_01", "CODI_07"},
        "costos": {"CODI_01", "CODI_06"},
        "convenio": {"CODI_02"},
    }
    for table, columns in numeric_expectations.items():
        schema = schemas.get(table)
        if not schema:
            continue
        for column in columns:
            definition = schema.definitions.get(column, "").lower()
            if definition and not re.match(r"^(?:tiny|small|medium|big)?int\b", definition):
                errors.append(f"column_type:{table}.{column}")
    for table, columns in {
        "calculo": {"FECA_31"},
        "totpago": {"FECA_31"},
    }.items():
        schema = schemas.get(table)
        if not schema:
            continue
        for column in columns:
            if not schema.definitions.get(column, "").lower().startswith("date"):
                errors.append(f"column_type:{table}.{column}")
    if errors:
        raise ValueError("GRH workforce-finance schema drift: " + ",".join(sorted(errors)))


def reference_key(dimension: str, company: int | None, code: int | None) -> tuple[int | None, int | None]:
    return (company if dimension != "agreement" else None, code)


def set_reference(
    references: dict[str, dict[tuple[int | None, int | None], str]],
    conflicts: dict[str, set[tuple[int | None, int | None]]],
    dimension: str,
    company: int | None,
    code: int | None,
    label: str | None,
) -> None:
    if code is None or label is None:
        return
    key = reference_key(dimension, company, code)
    previous = references[dimension].get(key)
    if previous is not None and previous != label:
        conflicts[dimension].add(key)
        references[dimension].pop(key, None)
        return
    if key not in conflicts[dimension]:
        references[dimension][key] = label


def period_from_row(row: dict[str, str | None], as_of: dt.date) -> tuple[list[str], str | None, dt.date | None]:
    reasons, year, month, anchor = period_reasons(
        row.get("PERI_31"), row.get("MES_31"), row.get("FECA_31"),
        min_year=MINIMUM_VALID_YEAR, as_of=as_of,
    )
    period = f"{year:04d}-{month:02d}" if year is not None and month is not None else None
    return reasons, period, anchor


def empty_totpago_values() -> dict[str, Decimal]:
    return {field_name: Decimal(0) for field_name in TOTPAGO_FIELDS}


def scan_first_pass(source: Path, as_of: dt.date) -> dict[str, object]:
    schemas: dict[str, DumpSchema] = {}
    current_table: str | None = None
    references = {dimension: {} for dimension in DIMENSIONS}
    reference_conflicts = {dimension: set() for dimension in DIMENSIONS}
    calculation_rows = 0
    calculation_valid_rows = 0
    calculation_quarantine_rows = 0
    calculation_periods: set[str] = set()
    totpago_runs: dict[tuple[object, ...], dict[str, Decimal]] = {}

    with gzip.open(source, "rt", encoding="utf-8", errors="replace", newline="") as stream:
        for line in stream:
            current_table = record_schema_line(schemas, current_table, line)
            insert = INSERT_RE.match(line)
            if not insert:
                continue
            table, explicit_columns, payload = insert.groups()
            if table not in TARGET_TABLES:
                continue
            schema = schemas.get(table, DumpSchema())
            columns = insert_columns(explicit_columns, schema)
            parsed = 0
            for values in parse_sql_tuples(payload):
                parsed += 1
                row = row_from_values(columns, values)
                company = parse_int(row.get("CODI_01"))
                if table in REFERENCE_TABLES:
                    dimension, code_field, label_fields, _ = REFERENCE_TABLES[table]
                    set_reference(
                        references, reference_conflicts, dimension, company,
                        parse_int(row.get(code_field)), first_label(row, label_fields),
                    )
                    continue

                reasons, period, anchor = period_from_row(row, as_of)
                if table == "calculo":
                    calculation_rows += 1
                    if reasons or period is None:
                        calculation_quarantine_rows += 1
                    else:
                        calculation_valid_rows += 1
                        calculation_periods.add(period)
                    continue

                if reasons or period is None:
                    continue
                run_key = (
                    company,
                    period,
                    anchor.isoformat() if anchor else None,
                    row.get("TIPO_31"),
                )
                if run_key in totpago_runs:
                    raise ValueError("Duplicate totpago run in canonical source")
                totpago_runs[run_key] = {
                    field_name: parse_decimal(row.get(field_name))
                    for field_name in TOTPAGO_FIELDS
                }
            expected = count_insert_rows(payload)
            if parsed != expected:
                raise ValueError(f"Row parser mismatch for {table}: counted {expected}, parsed {parsed}")

    validate_schema(schemas)
    if not calculation_periods:
        raise ValueError("The canonical source has no valid calculo period")
    if any(not references[dimension] for dimension in DIMENSIONS):
        raise ValueError("The canonical source has an empty workforce-finance reference")
    return {
        "schemas": schemas,
        "references": references,
        "reference_conflicts": reference_conflicts,
        "calculation_rows": calculation_rows,
        "calculation_valid_rows": calculation_valid_rows,
        "calculation_quarantine_rows": calculation_quarantine_rows,
        "calculation_periods": calculation_periods,
        "latest_period": max(calculation_periods),
        "totpago_runs": totpago_runs,
    }


def empty_run_bucket(participant: tuple[int | None, int | None]) -> RunBucket:
    return RunBucket(participant=participant)


def scan_second_pass(
    source: Path,
    as_of: dt.date,
    schemas: dict[str, DumpSchema],
    periods: set[str],
) -> dict[str, object]:
    current_table: str | None = None
    local_schemas: dict[str, DumpSchema] = {}
    run_buckets: dict[tuple[object, ...], RunBucket] = {}
    all_period_participants: dict[str, set[tuple[int, int]]] = collections.defaultdict(set)
    control_period_participants: dict[str, set[tuple[int, int]]] = collections.defaultdict(set)
    calculation_run_controls: dict[tuple[object, ...], dict[int, Decimal]] = collections.defaultdict(
        lambda: collections.defaultdict(Decimal)
    )
    window_rows = 0
    window_control_rows = 0
    invalid_employee_rows = 0
    invalid_control_employee_rows = 0
    null_control_amount_rows = 0

    with gzip.open(source, "rt", encoding="utf-8", errors="replace", newline="") as stream:
        for line in stream:
            current_table = record_schema_line(local_schemas, current_table, line)
            insert = INSERT_RE.match(line)
            if not insert or insert.group(1) != "calculo":
                continue
            table, explicit_columns, payload = insert.groups()
            columns = insert_columns(explicit_columns, schemas[table])
            parsed = 0
            for values in parse_sql_tuples(payload):
                parsed += 1
                row = row_from_values(columns, values)
                reasons, period, anchor = period_from_row(row, as_of)
                if reasons or period not in periods:
                    continue
                window_rows += 1
                company = parse_int(row.get("CODI_01"))
                employee = parse_int(row.get("LEGA_12"))
                participant = (company, employee)
                if valid_employee_key(participant):
                    all_period_participants[period].add((int(company), int(employee)))
                else:
                    invalid_employee_rows += 1

                concept = parse_int(row.get("CODI_27"))
                if concept not in CONTROL_CONCEPTS:
                    continue
                window_control_rows += 1
                if valid_employee_key(participant):
                    control_period_participants[period].add((int(company), int(employee)))
                else:
                    invalid_control_employee_rows += 1
                if row.get("IMPO_31") in (None, ""):
                    null_control_amount_rows += 1
                amount = parse_decimal(row.get("IMPO_31"))
                run_key = (
                    company,
                    period,
                    anchor.isoformat() if anchor else None,
                    row.get("TIPO_31"),
                )
                employee_run_key = (*run_key, employee)
                bucket = run_buckets.setdefault(employee_run_key, empty_run_bucket(participant))
                for dimension, field_name in DIMENSION_FIELDS.items():
                    bucket.dimensions[dimension].add(parse_int(row.get(field_name)))
                bucket.controls[concept] += amount
                bucket.control_rows += 1
                calculation_run_controls[run_key][concept] += amount
            expected = count_insert_rows(payload)
            if parsed != expected:
                raise ValueError(f"Row parser mismatch for calculo: counted {expected}, parsed {parsed}")

    return {
        "run_buckets": run_buckets,
        "all_period_participants": all_period_participants,
        "control_period_participants": control_period_participants,
        "calculation_run_controls": calculation_run_controls,
        "window_rows": window_rows,
        "window_control_rows": window_control_rows,
        "invalid_employee_rows": invalid_employee_rows,
        "invalid_control_employee_rows": invalid_control_employee_rows,
        "null_control_amount_rows": null_control_amount_rows,
    }


def controls_to_components(controls: dict[int, Decimal]) -> dict[str, int]:
    raw = {code: Decimal(controls.get(code, 0)) for code in CONTROL_CONCEPTS}
    return {
        "gross_with_family_allowances_cents": cents(raw[993] + raw[994] + raw[995]),
        "contributory_earnings_cents": cents(raw[993]),
        "non_contributory_earnings_cents": cents(raw[994]),
        "family_allowances_cents": cents(raw[995]),
        "employee_withholdings_cents": cents(raw[996]),
        "net_payroll_cents": cents(raw[998]),
        "net_to_pay_cents": cents(raw[999]),
        "employer_contributions_cents": cents(raw[990]),
    }


def add_controls(target: dict[int, Decimal], values: dict[int, Decimal]) -> None:
    for concept in CONTROL_CONCEPTS:
        target[concept] += Decimal(values.get(concept, 0))


def add_components(target: dict[str, int], values: dict[str, int]) -> None:
    for key in COMPONENT_KEYS:
        target[key] += int(values[key])


def null_components() -> dict[str, None]:
    return {key: None for key in COMPONENT_KEYS}


def control_payload(components: dict[str, int], participant_count: int) -> dict[str, int | bool]:
    net_variance = components["net_payroll_cents"] - (
        components["gross_with_family_allowances_cents"] -
        components["employee_withholdings_cents"]
    )
    net_to_pay_variance = components["net_to_pay_cents"] - components["net_payroll_cents"]
    tolerance = max(1, participant_count)
    return {
        "net_identity_variance_cents": net_variance,
        "net_to_pay_variance_cents": net_to_pay_variance,
        "rounding_tolerance_cents": tolerance,
        "identity_exactly_reconciled": abs(net_variance) <= 1 and abs(net_to_pay_variance) <= 1,
        "identity_within_rounding_tolerance": (
            abs(net_variance) <= tolerance and abs(net_to_pay_variance) <= tolerance
        ),
    }


def null_control() -> dict[str, None]:
    return {
        "net_identity_variance_cents": None,
        "net_to_pay_variance_cents": None,
        "rounding_tolerance_cents": None,
        "identity_exactly_reconciled": None,
        "identity_within_rounding_tolerance": None,
    }


def resolved_category(
    dimension: str,
    run_bucket: RunBucket,
    references: dict[str, dict[tuple[int | None, int | None], str]],
    conflicts: dict[str, set[tuple[int | None, int | None]]],
) -> tuple[tuple[object, ...], int | None, int | None, str | None, bool, str]:
    observed = run_bucket.dimensions[dimension]
    company = run_bucket.participant[0]
    if len(observed) != 1:
        reason = "ambiguous_code"
        return (("protected", reason, company, tuple(sorted(str(value) for value in observed))), None, None, None, True, reason)
    code = next(iter(observed))
    if code is None:
        reason = "missing_code"
        return (("protected", reason, company), None, None, None, True, reason)
    key = reference_key(dimension, company, code)
    if key in conflicts[dimension] or key not in references[dimension]:
        reason = "unresolved_reference"
        return (("protected", reason, company, code), None, None, None, True, reason)
    if not valid_employee_key(run_bucket.participant):
        reason = "invalid_employee_key"
        return (("protected", reason, company, code), None, None, None, True, reason)
    return (("released", company, code), int(company), code, references[dimension][key], False, "valid")


def build_raw_dimensions(
    run_buckets: dict[tuple[object, ...], RunBucket],
    references: dict[str, dict[tuple[int | None, int | None], str]],
    conflicts: dict[str, set[tuple[int | None, int | None]]],
) -> tuple[
    dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    dict[str, dict[str, set[tuple[int, int]]]],
    dict[str, collections.Counter[str]],
]:
    raw: dict[str, dict[str, dict[tuple[object, ...], RawCell]]] = {
        dimension: collections.defaultdict(dict) for dimension in DIMENSIONS
    }
    period_control_participants: dict[str, set[tuple[int, int]]] = collections.defaultdict(set)
    run_quality = {dimension: collections.Counter() for dimension in DIMENSIONS}
    for employee_run_key, bucket in run_buckets.items():
        period = str(employee_run_key[1])
        if valid_employee_key(bucket.participant):
            period_control_participants[period].add((int(bucket.participant[0]), int(bucket.participant[1])))
        for dimension in DIMENSIONS:
            category_key, company, code, label, force_protected, reason = resolved_category(
                dimension, bucket, references, conflicts,
            )
            run_quality[dimension][reason] += 1
            cells = raw[dimension][period]
            cell = cells.get(category_key)
            if cell is None:
                cell = RawCell(
                    company_code=company,
                    source_code=code,
                    label=label,
                    force_protected=force_protected,
                )
                cells[category_key] = cell
            if valid_employee_key(bucket.participant):
                cell.participants.add((int(bucket.participant[0]), int(bucket.participant[1])))
            add_controls(cell.controls, bucket.controls)
    return raw, period_control_participants, run_quality


def raw_period_controls(run_buckets: dict[tuple[object, ...], RunBucket]) -> dict[str, dict[int, Decimal]]:
    output: dict[str, dict[int, Decimal]] = collections.defaultdict(lambda: collections.defaultdict(Decimal))
    for key, bucket in run_buckets.items():
        add_controls(output[str(key[1])], bucket.controls)
    return output


def reconciliation_for_period(
    period: str,
    calculation_runs: dict[tuple[object, ...], dict[int, Decimal]],
    totpago_runs: dict[tuple[object, ...], dict[str, Decimal]],
) -> dict[str, int | float]:
    calculation_keys = {key for key in calculation_runs if key[1] == period}
    totpago_keys = {key for key in totpago_runs if key[1] == period}
    all_keys = calculation_keys | totpago_keys
    matched = calculation_keys & totpago_keys
    metric_cells = len(matched) * len(RECONCILIATION_FIELDS)
    exact_cells = 0
    fully_reconciled = 0
    absolute_variance = 0
    comparison_value = 0
    for key in sorted(matched, key=lambda item: tuple(str(value) for value in item)):
        exact_run = True
        controls = calculation_runs[key]
        payroll = totpago_runs[key]
        for concept, field_name in RECONCILIATION_FIELDS.items():
            calculation_cents = cents(Decimal(controls.get(concept, 0)))
            totpago_cents = cents(Decimal(payroll[field_name]))
            variance = totpago_cents - calculation_cents
            exact = abs(variance) <= 1
            exact_cells += int(exact)
            exact_run = exact_run and exact
            absolute_variance += abs(variance)
            comparison_value += max(abs(calculation_cents), abs(totpago_cents))
        fully_reconciled += int(exact_run)
    run_coverage = ratio(len(matched), len(all_keys))
    metric_exact_rate = ratio(exact_cells, metric_cells)
    value_agreement = (
        max(0.0, 100.0 - ratio(absolute_variance, comparison_value))
        if comparison_value else 0.0
    )
    return {
        "calculation_runs": len(calculation_keys),
        "totpago_runs": len(totpago_keys),
        "matched_runs": len(matched),
        "fully_reconciled_runs": fully_reconciled,
        "run_coverage_pct": run_coverage,
        "metric_exact_rate_pct": metric_exact_rate,
        "value_agreement_pct": round(value_agreement, 4),
        "absolute_variance_cents": absolute_variance,
    }


def null_reconciliation() -> dict[str, None]:
    return {
        "calculation_runs": None,
        "totpago_runs": None,
        "matched_runs": None,
        "fully_reconciled_runs": None,
        "run_coverage_pct": None,
        "metric_exact_rate_pct": None,
        "value_agreement_pct": None,
        "absolute_variance_cents": None,
    }


def build_period_totals(
    periods: list[str],
    period_controls: dict[str, dict[int, Decimal]],
    period_participants: dict[str, set[tuple[int, int]]],
    calculation_runs: dict[tuple[object, ...], dict[int, Decimal]],
    totpago_runs: dict[tuple[object, ...], dict[str, Decimal]],
) -> list[dict[str, object]]:
    output = []
    for period in periods:
        participant_count = len(period_participants.get(period, set()))
        if participant_count < PRIVACY_THRESHOLD:
            output.append({
                "period": period,
                "participant_count": None,
                "participant_display": f"<{PRIVACY_THRESHOLD}",
                "privacy_status": "suppressed",
                "components": null_components(),
                "control": null_control(),
                "reconciliation": null_reconciliation(),
            })
            continue
        components = controls_to_components(period_controls.get(period, {}))
        output.append({
            "period": period,
            "participant_count": participant_count,
            "participant_display": str(participant_count),
            "privacy_status": "released",
            "components": components,
            "control": control_payload(components, participant_count),
            "reconciliation": reconciliation_for_period(
                period, calculation_runs, totpago_runs,
            ),
        })
    return output


def cell_sort_key(item: tuple[tuple[object, ...], RawCell]) -> tuple[object, ...]:
    key, cell = item
    return (
        -Decimal(cell.controls.get(998, 0)),
        str(cell.label or ""),
        str(cell.company_code if cell.company_code is not None else ""),
        str(cell.source_code if cell.source_code is not None else ""),
        str(key),
    )


def active_cell(cell: RawCell) -> bool:
    return bool(cell.participants) or any(Decimal(value) != 0 for value in cell.controls.values())


def complete_period_protection(
    cells: dict[tuple[object, ...], RawCell],
    protected: set[tuple[object, ...]],
) -> bool:
    protected_people = set().union(
        *(cells[key].participants for key in protected)
    ) if protected else set()
    candidates = [
        item for item in cells.items()
        if item[0] not in protected and active_cell(item[1])
    ]
    candidates.sort(key=lambda item: (
        len(item[1].participants),
        str(item[1].label or ""),
        str(item[0]),
    ))
    while protected and (
        len(protected) < 2 or len(protected_people) < PRIVACY_THRESHOLD
    ):
        if not candidates:
            return False
        key, companion = candidates.pop(0)
        protected.add(key)
        protected_people.update(companion.participants)
    return True


def protected_categories_for_dimension(
    period_cells: dict[str, dict[tuple[object, ...], RawCell]],
    periods: list[str],
) -> tuple[dict[str, set[tuple[object, ...]]], set[str]]:
    protected_by_period: dict[str, set[tuple[object, ...]]] = {}
    suppressed_periods: set[str] = set()
    for period in periods:
        cells = period_cells.get(period, {})
        protected = {
            key for key, cell in cells.items()
            if active_cell(cell) and (
                cell.force_protected or len(cell.participants) < PRIVACY_THRESHOLD
            )
        }
        if not protected:
            protected_by_period[period] = protected
            continue
        if not complete_period_protection(cells, protected):
            suppressed_periods.add(period)
        protected_by_period[period] = protected
    return protected_by_period, suppressed_periods


def published_component_vector(cell: RawCell) -> tuple[int, ...]:
    components = cell_components(cell)
    return tuple(components[key] for key in COMPONENT_KEYS)


def published_observables_for_view(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    protected_by_dimension: dict[str, dict[str, set[tuple[object, ...]]]],
    suppressed_by_dimension: dict[str, set[str]],
    dimension: str,
    period: str,
) -> list[PublishedObservable]:
    if period in suppressed_by_dimension[dimension]:
        return []
    cells = raw_dimensions[dimension].get(period, {})
    protected = protected_by_dimension[dimension].get(period, set())
    observables = [
        PublishedObservable(
            dimension=dimension,
            period=period,
            kind="released",
            key=key,
            participants=frozenset(cell.participants),
            components=published_component_vector(cell),
        )
        for key, cell in cells.items()
        if key not in protected and active_cell(cell)
    ]
    protected_cells = [
        cells[key] for key in protected
        if key in cells and active_cell(cells[key])
    ]
    if protected_cells:
        aggregate = aggregate_protected_cell(protected_cells)
        observables.append(PublishedObservable(
            dimension=dimension,
            period=period,
            kind="protected_aggregate",
            key=None,
            participants=frozenset(aggregate.participants),
            components=published_component_vector(aggregate),
            protected_keys=frozenset(protected),
        ))
    return observables


def protected_constituent_vectors(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    observable: PublishedObservable,
    *,
    primary_only: bool,
) -> list[tuple[int, ...]]:
    if observable.kind != "protected_aggregate":
        return []
    cells = raw_dimensions[observable.dimension].get(observable.period, {})
    output = []
    for key in observable.protected_keys:
        constituent = cells[key]
        if primary_only and not (
            constituent.force_protected or
            0 < len(constituent.participants) < PRIVACY_THRESHOLD
        ):
            continue
        output.append(published_component_vector(constituent))
    return output


def cross_view_difference_risks(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    protected_by_dimension: dict[str, dict[str, set[tuple[object, ...]]]],
    suppressed_by_dimension: dict[str, set[str]],
    periods: list[str],
) -> list[CrossViewRisk]:
    def pair_is_risky(left: PublishedObservable, right: PublishedObservable) -> bool:
        left_people = set(left.participants)
        right_people = set(right.participants)
        residual = None
        if left_people.issubset(right_people):
            residual = right_people - left_people
        elif right_people.issubset(left_people):
            residual = left_people - right_people
        if residual is not None and 0 < len(residual) < PRIVACY_THRESHOLD:
            return True
        if left_people != right_people:
            return False
        left_minus_right = tuple(
            left_value - right_value
            for left_value, right_value in zip(left.components, right.components)
        )
        right_minus_left = tuple(-value for value in left_minus_right)
        return any(
            target == left_minus_right or target == right_minus_left
            for target in (
                protected_constituent_vectors(
                    raw_dimensions, left, primary_only=True,
                ) +
                protected_constituent_vectors(
                    raw_dimensions, right, primary_only=True,
                )
            )
        )

    risks: list[CrossViewRisk] = []
    for period in periods:
        by_dimension = {
            dimension: published_observables_for_view(
                raw_dimensions,
                protected_by_dimension,
                suppressed_by_dimension,
                dimension,
                period,
            )
            for dimension in DIMENSIONS
        }
        for left_index, left_dimension in enumerate(DIMENSIONS):
            for right_dimension in DIMENSIONS[left_index + 1:]:
                for left in by_dimension[left_dimension]:
                    for right in by_dimension[right_dimension]:
                        if pair_is_risky(left, right):
                            risks.append(CrossViewRisk(period, left, right))
    return risks


def coordinate_cross_view_protection(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    protected_by_dimension: dict[str, dict[str, set[tuple[object, ...]]]],
    suppressed_by_dimension: dict[str, set[str]],
    periods: list[str],
) -> dict[str, int]:
    initial = cross_view_difference_risks(
        raw_dimensions, protected_by_dimension, suppressed_by_dimension, periods,
    )
    coordinated: set[tuple[str, str, tuple[object, ...]]] = set()
    limit = sum(
        len(cells)
        for dimension in DIMENSIONS
        for cells in raw_dimensions[dimension].values()
    ) + 1
    passes = 0
    while True:
        risks = cross_view_difference_risks(
            raw_dimensions, protected_by_dimension, suppressed_by_dimension, periods,
        )
        if not risks:
            break
        passes += 1
        if passes > limit:
            raise ValueError("Cross-view difference protection did not converge")
        risk = risks[0]

        def protect_released(observable: PublishedObservable) -> bool:
            if observable.kind != "released" or observable.key is None:
                return False
            cells = raw_dimensions[observable.dimension].get(observable.period, {})
            protected = protected_by_dimension[observable.dimension].setdefault(
                observable.period, set(),
            )
            before = set(protected)
            protected.add(observable.key)
            if not complete_period_protection(cells, protected):
                suppressed_by_dimension[observable.dimension].add(observable.period)
            coordinated.update(
                (observable.period, observable.dimension, key)
                for key in protected - before
            )
            return protected != before or observable.period in suppressed_by_dimension[observable.dimension]

        def expand_aggregate(observable: PublishedObservable) -> bool:
            if observable.kind != "protected_aggregate":
                return False
            cells = raw_dimensions[observable.dimension].get(observable.period, {})
            protected = protected_by_dimension[observable.dimension].setdefault(
                observable.period, set(),
            )
            candidates = [
                item for item in cells.items()
                if item[0] not in protected and active_cell(item[1])
            ]
            candidates.sort(key=lambda item: (
                len(item[1].participants),
                str(item[1].label or ""),
                str(item[0]),
            ))
            if not candidates:
                return False
            before = set(protected)
            protected.add(candidates[0][0])
            if not complete_period_protection(cells, protected):
                suppressed_by_dimension[observable.dimension].add(observable.period)
            coordinated.update(
                (observable.period, observable.dimension, key)
                for key in protected - before
            )
            return True

        changed = (
            protect_released(risk.right) or
            protect_released(risk.left) or
            expand_aggregate(risk.right) or
            expand_aggregate(risk.left)
        )
        if not changed:
            target = risk.right
            suppressed_by_dimension[target.dimension].add(target.period)
            changed = True
        if not changed:
            raise ValueError("Cross-view difference risks cannot be protected")
    remaining = cross_view_difference_risks(
        raw_dimensions, protected_by_dimension, suppressed_by_dimension, periods,
    )
    if remaining:
        raise ValueError("Cross-view difference protection failed")
    return {
        "initial_single_cell_risks": len(initial),
        "coordinated_cells": len(coordinated),
        "remaining_single_cell_risks": len(remaining),
    }


def subset_sum_vectors(
    observables: list[PublishedObservable],
) -> dict[tuple[int, ...], int]:
    """Return every published subset sum and its minimum operand count."""
    zero = tuple(0 for _ in COMPONENT_KEYS)
    sums: dict[tuple[int, ...], int] = {zero: 0}
    for observable in observables:
        previous = list(sums.items())
        for vector, operand_count in previous:
            combined = tuple(
                left + right
                for left, right in zip(vector, observable.components)
            )
            combined_count = operand_count + 1
            existing = sums.get(combined)
            if existing is None or combined_count < existing:
                sums[combined] = combined_count
    return sums


def protected_small_union_target_vectors(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    observable: PublishedObservable,
    *,
    state_cap: int,
) -> tuple[set[tuple[int, ...]], int]:
    """Enumerate exact hidden vectors whose distinct participant union stays < k."""
    if observable.kind != "protected_aggregate":
        return set(), 0
    cells = raw_dimensions[observable.dimension].get(observable.period, {})
    zero = tuple(0 for _ in COMPONENT_KEYS)
    extendable_states: set[
        tuple[frozenset[tuple[int, int]], tuple[int, ...], bool]
    ] = {(frozenset(), zero, False)}
    target_states: set[
        tuple[frozenset[tuple[int, int]], tuple[int, ...]]
    ] = set()
    for key in sorted(observable.protected_keys, key=str):
        cell = cells[key]
        participants = frozenset(cell.participants)
        component_vector = published_component_vector(cell)
        target_states.add((participants, component_vector))
        additions = set()
        for prior_participants, prior_vector, _nonempty in list(extendable_states):
            combined_participants = prior_participants | participants
            if len(combined_participants) >= PRIVACY_THRESHOLD:
                continue
            combined_vector = tuple(
                left + right
                for left, right in zip(prior_vector, component_vector)
            )
            additions.add((combined_participants, combined_vector, True))
            target_states.add((combined_participants, combined_vector))
        extendable_states.update(additions)
        if len(target_states) > state_cap:
            raise ValueError(
                "Cross-view protected target state cap exceeded"
            )
    return {
        vector for _participants, vector in target_states
        if vector != zero
    }, len(target_states)


def audit_cross_view_subset_differences(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    protected_by_dimension: dict[str, dict[str, set[tuple[object, ...]]]],
    suppressed_by_dimension: dict[str, set[str]],
    periods: list[str],
) -> dict[str, int]:
    """Fail closed if any published cross-view subset equation isolates a cell."""
    maximum_observables = 0
    subset_vectors_checked = 0
    subset_equations_checked = 0
    protected_vectors_checked = 0
    maximum_protected_target_states = 0
    maximum_subset_equations = 0
    for period in periods:
        observables_by_dimension = {
            dimension: published_observables_for_view(
                raw_dimensions,
                protected_by_dimension,
                suppressed_by_dimension,
                dimension,
                period,
            )
            for dimension in DIMENSIONS
        }
        for observables in observables_by_dimension.values():
            maximum_observables = max(maximum_observables, len(observables))
            if len(observables) > MAX_PUBLISHED_OBSERVABLES_PER_VIEW:
                raise ValueError(
                    "Cross-view subset audit observable cap exceeded"
                )
        zero = tuple(0 for _ in COMPONENT_KEYS)
        targets: set[tuple[int, ...]] = set()
        period_target_states = 0
        for observables in observables_by_dimension.values():
            for observable in observables:
                if observable.kind != "protected_aggregate":
                    continue
                if observable.components == zero:
                    raise ValueError(
                        "Cross-view protected aggregate has a zero published vector"
                    )
                vectors, state_count = protected_small_union_target_vectors(
                    raw_dimensions,
                    observable,
                    state_cap=(
                        MAX_PROTECTED_TARGET_STATES_PER_PERIOD - period_target_states
                    ),
                )
                period_target_states += state_count
                targets.update(vectors)
        maximum_protected_target_states = max(
            maximum_protected_target_states, period_target_states,
        )
        if not targets:
            continue
        protected_vectors_checked += len(targets)
        signed_targets = targets | {
            tuple(-value for value in target) for target in targets
        }
        signed_target_signatures = {
            (target[5], target[7]) for target in signed_targets
        }
        sums_by_dimension = {
            dimension: subset_sum_vectors(observables)
            for dimension, observables in observables_by_dimension.items()
        }
        subset_vectors_checked += sum(
            len(vectors) for vectors in sums_by_dimension.values()
        )
        period_subset_equations = 0
        for left_index, left_dimension in enumerate(DIMENSIONS):
            for right_dimension in DIMENSIONS[left_index + 1:]:
                left_sums = sums_by_dimension[left_dimension]
                right_sums = sums_by_dimension[right_dimension]
                plan = min(
                    (
                        len(left_sums) * len(right_sums),
                        "left_right",
                    ),
                    (
                        2 * len(left_sums) * len(targets),
                        "left_target",
                    ),
                    (
                        2 * len(right_sums) * len(targets),
                        "right_target",
                    ),
                )
                planned_equations = plan[0]
                if (
                    period_subset_equations + planned_equations >
                    MAX_SUBSET_EQUATIONS_PER_PERIOD
                ):
                    raise ValueError(
                        "Cross-view subset equation cap exceeded"
                    )
                period_subset_equations += planned_equations
                subset_equations_checked += planned_equations
                if plan[1] == "left_right":
                    for left_vector in left_sums:
                        for right_vector in right_sums:
                            if (
                                left_vector[5] - right_vector[5],
                                left_vector[7] - right_vector[7],
                            ) not in signed_target_signatures:
                                continue
                            difference = tuple(
                                left - right
                                for left, right in zip(left_vector, right_vector)
                            )
                            if difference in signed_targets:
                                raise ValueError(
                                    "Cross-view subset difference risk detected after fixed point"
                                )
                elif plan[1] == "left_target":
                    for left_vector in left_sums:
                        for target in targets:
                            if tuple(
                                left - value
                                for left, value in zip(left_vector, target)
                            ) in right_sums or tuple(
                                left + value
                                for left, value in zip(left_vector, target)
                            ) in right_sums:
                                raise ValueError(
                                    "Cross-view subset difference risk detected after fixed point"
                                )
                else:
                    for right_vector in right_sums:
                        for target in targets:
                            if tuple(
                                right - value
                                for right, value in zip(right_vector, target)
                            ) in left_sums or tuple(
                                right + value
                                for right, value in zip(right_vector, target)
                            ) in left_sums:
                                raise ValueError(
                                    "Cross-view subset difference risk detected after fixed point"
                                )
        maximum_subset_equations = max(
            maximum_subset_equations, period_subset_equations,
        )
    return {
        "max_observables_per_view": maximum_observables,
        "observable_cap": MAX_PUBLISHED_OBSERVABLES_PER_VIEW,
        "protected_vectors_checked": protected_vectors_checked,
        "max_protected_target_states_per_period": maximum_protected_target_states,
        "protected_target_state_cap": MAX_PROTECTED_TARGET_STATES_PER_PERIOD,
        "subset_vectors_checked": subset_vectors_checked,
        "subset_equations_checked": subset_equations_checked,
        "max_subset_equations_per_period": maximum_subset_equations,
        "subset_equation_cap_per_period": MAX_SUBSET_EQUATIONS_PER_PERIOD,
        "remaining_subset_difference_risks": 0,
    }


def cell_components(cell: RawCell) -> dict[str, int]:
    return controls_to_components(cell.controls)


def unavailable_change(previous_period: str, reason: str) -> dict[str, object]:
    return {
        "status": "unavailable",
        "reason": reason,
        "previous_period": previous_period,
        "distinct_participants_delta": None,
        "gross_with_family_allowances_delta_cents": None,
        "employee_withholdings_delta_cents": None,
        "net_payroll_delta_cents": None,
        "employer_contributions_delta_cents": None,
        "net_payroll_delta_pct": None,
    }


def released_change(
    previous_period: str,
    current: dict[str, object],
    previous: dict[str, object],
) -> dict[str, object]:
    current_components = current["components"]
    previous_components = previous["components"]
    previous_net = previous_components["net_payroll_cents"]
    net_delta = current_components["net_payroll_cents"] - previous_net
    return {
        "status": "released",
        "reason": "both_consecutive_periods_released",
        "previous_period": previous_period,
        "distinct_participants_delta": (
            current["distinct_participants_observed"] - previous["distinct_participants_observed"]
        ),
        "gross_with_family_allowances_delta_cents": (
            current_components["gross_with_family_allowances_cents"] -
            previous_components["gross_with_family_allowances_cents"]
        ),
        "employee_withholdings_delta_cents": (
            current_components["employee_withholdings_cents"] -
            previous_components["employee_withholdings_cents"]
        ),
        "net_payroll_delta_cents": net_delta,
        "employer_contributions_delta_cents": (
            current_components["employer_contributions_cents"] -
            previous_components["employer_contributions_cents"]
        ),
        "net_payroll_delta_pct": (
            round(float(Decimal(net_delta) * Decimal(100) / Decimal(abs(previous_net))), 4)
            if previous_net else None
        ),
    }


def aggregate_protected_cell(cells: list[RawCell]) -> RawCell:
    aggregate = RawCell(None, None, PROTECTED_LABEL, True)
    for cell in cells:
        aggregate.participants.update(cell.participants)
        add_controls(aggregate.controls, cell.controls)
    return aggregate


def source_cell(
    cell: RawCell,
    total_components: dict[str, int],
    privacy_status: str,
    allocation_enabled: bool,
) -> dict[str, object]:
    components = cell_components(cell)
    total_net = total_components["net_payroll_cents"]
    allocation = (
        round(float(Decimal(components["net_payroll_cents"]) * Decimal(100) / Decimal(total_net)), 4)
        if allocation_enabled and total_net > 0 else None
    )
    count = len(cell.participants)
    return {
        "company_code": cell.company_code if privacy_status == "released" else None,
        "source_code": cell.source_code if privacy_status == "released" else None,
        "label": cell.label if privacy_status == "released" else PROTECTED_LABEL,
        "distinct_participants_observed": count,
        "participant_display": str(count),
        "participant_privacy_status": "released",
        "allocation_share_pct": allocation,
        "privacy_status": privacy_status,
        "components": components,
        "control": control_payload(components, count),
        "change": unavailable_change("", "pending_comparison"),
    }


def protect_source_cell_participant_count(cell: dict[str, object]) -> None:
    cell["distinct_participants_observed"] = None
    cell["participant_display"] = "Protegido"
    cell["participant_privacy_status"] = "protected_difference_attack"
    cell["control"]["rounding_tolerance_cents"] = None
    cell["control"]["identity_within_rounding_tolerance"] = None


def suppressed_source_cell() -> dict[str, object]:
    return {
        "company_code": None,
        "source_code": None,
        "label": PROTECTED_LABEL,
        "distinct_participants_observed": None,
        "participant_display": f"<{PRIVACY_THRESHOLD}",
        "participant_privacy_status": "suppressed",
        "allocation_share_pct": None,
        "privacy_status": "suppressed",
        "components": null_components(),
        "control": null_control(),
        "change": unavailable_change("", "privacy_protected"),
    }


def attach_changes(
    period_rows: list[dict[str, object]],
    membership_by_period: dict[str, dict[tuple[object, object], set[tuple[int, int]]]],
) -> None:
    visible_by_period: dict[str, dict[tuple[object, object], dict[str, object]]] = {}
    for period_row in period_rows:
        visible_by_period[period_row["period"]] = {
            (cell["company_code"], cell["source_code"]): cell
            for cell in period_row["cells"]
            if cell["privacy_status"] == "released"
        }
    for period_row in period_rows:
        period = period_row["period"]
        previous_period = shift_month(period, -1)
        previous_cells = visible_by_period.get(previous_period)
        for cell in period_row["cells"]:
            if cell["privacy_status"] != "released":
                cell["change"] = unavailable_change(previous_period, "protected_bucket_composition")
                continue
            if previous_cells is None:
                cell["change"] = unavailable_change(previous_period, "previous_period_missing")
                continue
            previous = previous_cells.get((cell["company_code"], cell["source_code"]))
            if previous is None:
                cell["change"] = unavailable_change(previous_period, "category_not_comparable")
                continue
            current_people = membership_by_period.get(period, {}).get(
                (cell["company_code"], cell["source_code"]), set(),
            )
            previous_people = membership_by_period.get(previous_period, {}).get(
                (cell["company_code"], cell["source_code"]), set(),
            )
            membership_change = len(current_people.symmetric_difference(previous_people))
            if 0 < membership_change < PRIVACY_THRESHOLD:
                protect_source_cell_participant_count(cell)
                cell["change"] = unavailable_change(
                    previous_period, "membership_change_protected",
                )
                continue
            if (
                cell["participant_privacy_status"] != "released" or
                previous["participant_privacy_status"] != "released"
            ):
                cell["change"] = unavailable_change(
                    previous_period, "participant_count_protected",
                )
                continue
            cell["change"] = released_change(previous_period, cell, previous)


def protect_participant_accounting_sums(
    period_rows: list[dict[str, object]],
) -> None:
    for period_row in period_rows:
        if any(
            cell["participant_privacy_status"] == "protected_difference_attack"
            for cell in period_row["cells"]
        ):
            period_row["participant_accounting"][
                "sum_cell_distinct_participants_observed"
            ] = None


def build_dimension_views(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    periods: list[str],
    period_totals: list[dict[str, object]],
    period_participants: dict[str, set[tuple[int, int]]],
) -> tuple[
    list[dict[str, object]],
    list[dict[str, object]],
    list[dict[str, object]],
    list[dict[str, object]],
    dict[str, int],
]:
    totals_by_period = {row["period"]: row for row in period_totals}
    views = []
    partition_checks = []
    multi_category_quality = []
    sign_quality = []
    protected_by_dimension: dict[
        str, dict[str, set[tuple[object, ...]]]
    ] = {}
    suppressed_by_dimension: dict[str, set[str]] = {}
    for dimension in DIMENSIONS:
        protected_by_dimension[dimension], suppressed_by_dimension[dimension] = (
            protected_categories_for_dimension(raw_dimensions[dimension], periods)
        )
    cross_view_receipt = coordinate_cross_view_protection(
        raw_dimensions,
        protected_by_dimension,
        suppressed_by_dimension,
        periods,
    )
    cross_view_receipt.update(audit_cross_view_subset_differences(
        raw_dimensions,
        protected_by_dimension,
        suppressed_by_dimension,
        periods,
    ))
    for dimension in DIMENSIONS:
        period_cells = raw_dimensions[dimension]
        protected_by_period = protected_by_dimension[dimension]
        suppressed_periods = suppressed_by_dimension[dimension]
        output_periods = []
        component_failures = 0
        net_failures = 0
        allocation_failures = 0
        employee_periods = 0
        multi_employee_periods = 0
        negative_component_cells = {key: 0 for key in COMPONENT_KEYS}
        cells_checked = 0
        allocation_periods_available = 0
        allocation_periods_unavailable = 0
        membership_by_period: dict[
            str, dict[tuple[object, object], set[tuple[int, int]]]
        ] = {}
        for period in periods:
            total = totals_by_period[period]
            cells = period_cells.get(period, {})
            protected = protected_by_period.get(period, set())
            participant_categories: dict[tuple[int, int], set[tuple[object, ...]]] = collections.defaultdict(set)
            for category, cell in cells.items():
                for participant in cell.participants:
                    participant_categories[participant].add(category)
            membership_by_period[period] = {
                (cell.company_code, cell.source_code): set(cell.participants)
                for cell in cells.values()
                if not cell.force_protected and cell.company_code is not None and cell.source_code is not None
            }
            employee_periods += len(participant_categories)
            multi_count = sum(len(categories) > 1 for categories in participant_categories.values())
            multi_employee_periods += multi_count
            multi_protected = 0 < multi_count < PRIVACY_THRESHOLD
            accounting = {
                "period_distinct_participants": len(period_participants.get(period, set())),
                "sum_cell_distinct_participants_observed": (
                    None if multi_protected
                    else sum(len(cell.participants) for cell in cells.values())
                ),
                "multi_category_participants": None if multi_protected else multi_count,
                "multi_category_participant_display": (
                    f"<{PRIVACY_THRESHOLD}" if multi_protected else str(multi_count)
                ),
                "multi_category_privacy_status": (
                    "protected" if multi_protected
                    else ("released" if multi_count else "not_observed")
                ),
                "participants_may_overlap": multi_count > 0,
            }
            if total["privacy_status"] != "released" or period in suppressed_periods:
                output_periods.append({
                    "period": period,
                    "privacy_status": "suppressed",
                    "participant_accounting": accounting,
                    "cells": [suppressed_source_cell()],
                })
                continue
            active_components = [
                cell_components(cell) for cell in cells.values() if active_cell(cell)
            ]
            cells_checked += len(active_components)
            for components in active_components:
                for key in COMPONENT_KEYS:
                    negative_component_cells[key] += int(components[key] < 0)
            allocation_enabled = (
                total["components"]["net_payroll_cents"] > 0 and
                all(value >= 0 for value in total["components"].values()) and
                all(value >= 0 for components in active_components for value in components.values())
            )
            if allocation_enabled:
                allocation_periods_available += 1
            else:
                allocation_periods_unavailable += 1
            visible = [
                (key, cell) for key, cell in cells.items()
                if key not in protected and active_cell(cell)
            ]
            visible.sort(key=cell_sort_key)
            output_cells = [
                source_cell(cell, total["components"], "released", allocation_enabled)
                for _, cell in visible
            ]
            protected_cells = [
                cell for key, cell in cells.items()
                if key in protected and active_cell(cell)
            ]
            if protected_cells:
                protected_cell = aggregate_protected_cell(protected_cells)
                if len(protected_cell.participants) < PRIVACY_THRESHOLD or len(protected_cells) < 2:
                    raise ValueError(f"Unsafe protected aggregate for {dimension} {period}")
                output_cells.append(source_cell(
                    protected_cell, total["components"], "protected_aggregate",
                    allocation_enabled,
                ))
            if multi_protected:
                count_companions = [
                    cell for cell in output_cells
                    if cell["privacy_status"] == "released" and
                    cell["participant_privacy_status"] == "released"
                ]
                if count_companions:
                    companion = min(count_companions, key=lambda cell: (
                        cell["distinct_participants_observed"],
                        str(cell["label"]),
                        str(cell["company_code"]),
                        str(cell["source_code"]),
                    ))
                    protect_source_cell_participant_count(companion)
            output_component_total = {key: 0 for key in COMPONENT_KEYS}
            for cell in output_cells:
                add_components(output_component_total, cell["components"])
            if output_component_total != total["components"]:
                component_failures += 1
            if output_component_total["net_payroll_cents"] != total["components"]["net_payroll_cents"]:
                net_failures += 1
            allocation_values = [
                cell["allocation_share_pct"] for cell in output_cells
            ]
            if allocation_enabled:
                if any(value is None for value in allocation_values) or abs(sum(allocation_values) - 100) > 0.01:
                    allocation_failures += 1
            elif any(value is not None for value in allocation_values):
                allocation_failures += 1
            output_periods.append({
                "period": period,
                "privacy_status": "released",
                "participant_accounting": accounting,
                "cells": output_cells,
            })
        attach_changes(output_periods, membership_by_period)
        protect_participant_accounting_sums(output_periods)
        views.append({
            "dimension": dimension,
            "assignment_semantics": "dimension_observed_on_calculo_run_not_contract_status",
            "periods": output_periods,
        })
        partition_checks.append({
            "dimension": dimension,
            "periods_checked": len(periods),
            "component_identity_failures": component_failures,
            "net_allocation_identity_failures": net_failures,
            "allocation_share_failures": allocation_failures,
        })
        multi_category_quality.append({
            "dimension": dimension,
            "employee_periods": employee_periods,
            "multi_category_employee_periods": multi_employee_periods,
            "multi_category_pct": ratio(multi_employee_periods, employee_periods),
        })
        sign_quality.append({
            "dimension": dimension,
            "cells_checked": cells_checked,
            "negative_component_cells": negative_component_cells,
            "allocation_periods_available": allocation_periods_available,
            "allocation_periods_unavailable": allocation_periods_unavailable,
        })
    return views, partition_checks, multi_category_quality, sign_quality, cross_view_receipt


def canonical_release_number(value: int | float) -> str:
    if type(value) is int:
        if abs(value) > 9_007_199_254_740_991:
            raise ValueError("Workforce-finance release integer exceeds safe JSON range")
        return str(value)
    if type(value) is not float or not math.isfinite(value):
        raise ValueError("Workforce-finance release number is not finite")
    if value.is_integer() and abs(value) > 9_007_199_254_740_991:
        raise ValueError("Workforce-finance release integer exceeds safe JSON range")
    decimal_value = Decimal(str(value))
    if decimal_value == 0:
        return "0"
    if decimal_value != decimal_value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP):
        raise ValueError("Workforce-finance release number exceeds four decimals")
    rendered = format(decimal_value, "f").rstrip("0").rstrip(".")
    return rendered or "0"


def canonical_release_json(value: object) -> str:
    if isinstance(value, dict):
        if not all(type(key) is str for key in value):
            raise ValueError("Workforce-finance release object key is not a string")
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_release_json(value[key])
            for key in sorted(value)
        ) + "}"
    if isinstance(value, list):
        return "[" + ",".join(canonical_release_json(item) for item in value) + "]"
    if value is None:
        return "null"
    if type(value) is bool:
        return "true" if value else "false"
    if type(value) is str:
        return json.dumps(value, ensure_ascii=False)
    if type(value) in (int, float):
        return canonical_release_number(value)
    raise ValueError("Workforce-finance release content is not canonical JSON")


def release_content_digest(artifact: dict[str, object]) -> str:
    if not isinstance(artifact, dict):
        raise ValueError("Workforce-finance release artifact must be an object")
    content = {key: value for key, value in artifact.items() if key != "release_id"}
    encoded = canonical_release_json(content).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def release_id(artifact: dict[str, object]) -> str:
    source = artifact.get("source")
    cohort = artifact.get("cohort")
    if not isinstance(source, dict) or not isinstance(cohort, dict):
        raise ValueError("Workforce-finance release identity missing")
    material = "|".join((
        SOURCE_SCHEMA_VERSION,
        POLICY_VERSION,
        str(source.get("sha256", "")),
        str(source.get("snapshot_as_of", "")),
        str(cohort.get("first_period", "")),
        str(cohort.get("last_period", "")),
        "calculo_row_observed",
        release_content_digest(artifact),
    ))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def reference_quality(
    raw_dimensions: dict[str, dict[str, dict[tuple[object, ...], RawCell]]],
    run_quality: dict[str, collections.Counter[str]],
    run_count: int,
) -> list[dict[str, object]]:
    output = []
    for dimension in DIMENSIONS:
        observed = {
            (cell.company_code, cell.source_code)
            for cells in raw_dimensions[dimension].values()
            for cell in cells.values()
            if not cell.force_protected
        }
        unresolved_runs = int(run_quality[dimension]["unresolved_reference"])
        resolved_runs = int(run_quality[dimension]["valid"])
        output.append({
            "dimension": dimension,
            "observed_codes": len(observed),
            "resolved_codes": len(observed),
            "unresolved_codes": 0 if unresolved_runs == 0 else None,
            "observed_control_runs": run_count,
            "resolved_control_runs": resolved_runs,
            "coverage_pct": ratio(resolved_runs, run_count),
        })
    return output


def assignment_quality(
    run_quality: dict[str, collections.Counter[str]],
    run_count: int,
    multi_category: list[dict[str, object]],
) -> dict[str, object]:
    checks = []
    invalid_run_union = 0
    for dimension in DIMENSIONS:
        quality = run_quality[dimension]
        invalid = sum(quality[reason] for reason in (
            "ambiguous_code", "missing_code", "unresolved_reference", "invalid_employee_key",
        ))
        invalid_run_union = max(invalid_run_union, invalid)
        checks.append({
            "dimension": dimension,
            "employee_period_runs": run_count,
            "valid_runs": int(quality["valid"]),
            "ambiguous_runs": int(quality["ambiguous_code"]),
            "missing_code_runs": int(quality["missing_code"]),
            "unresolved_reference_runs": int(quality["unresolved_reference"]),
            "invalid_employee_key_runs": int(quality["invalid_employee_key"]),
            "coverage_pct": ratio(int(quality["valid"]), run_count),
        })
    return {
        "employee_period_runs": run_count,
        "invalid_employee_period_runs": invalid_run_union,
        "dimension_run_checks": checks,
        "multi_category_employee_periods": multi_category,
    }


def participant_set_reconciliation(
    periods: list[str],
    all_period_participants: dict[str, set[tuple[int, int]]],
    control_period_participants: dict[str, set[tuple[int, int]]],
) -> dict[str, int | bool]:
    exact_periods = sum(
        all_period_participants.get(period, set()) ==
        control_period_participants.get(period, set())
        for period in periods
    )
    return {
        "periods_checked": len(periods),
        "exact_periods": exact_periods,
        "mismatched_periods": len(periods) - exact_periods,
        "all_calculo_employee_periods": sum(
            len(all_period_participants.get(period, set())) for period in periods
        ),
        "control_employee_periods": sum(
            len(control_period_participants.get(period, set())) for period in periods
        ),
        "control_cohort_used_for_finance": True,
    }


def amount_sign_quality(
    period_totals: list[dict[str, object]],
    dimension_signs: list[dict[str, object]],
) -> dict[str, object]:
    released = [row for row in period_totals if row["privacy_status"] == "released"]
    return {
        "periods_checked": len(released),
        "periods_with_nonpositive_net_payroll": sum(
            row["components"]["net_payroll_cents"] <= 0 for row in released
        ),
        "negative_period_components": {
            key: sum(row["components"][key] < 0 for row in released)
            for key in COMPONENT_KEYS
        },
        "dimensions": dimension_signs,
    }


def assert_no_forbidden_keys(value: object, path: str = "root") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).casefold() in FORBIDDEN_OUTPUT_KEYS:
                raise ValueError(f"Forbidden output key at {path}.{key}")
            assert_no_forbidden_keys(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_no_forbidden_keys(child, f"{path}[{index}]")


def strict_non_negative_integer(value: object) -> bool:
    return type(value) is int and value >= 0


def strict_percentage(value: object) -> bool:
    return (
        type(value) in (int, float) and
        math.isfinite(value) and
        0 <= value <= 100
    )


def validate_reconciliation_contract(value: object) -> None:
    expected = {
        "calculation_runs", "totpago_runs", "matched_runs", "fully_reconciled_runs",
        "run_coverage_pct", "metric_exact_rate_pct", "value_agreement_pct",
        "absolute_variance_cents",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("Workforce-finance reconciliation shape drift")
    integer_keys = (
        "calculation_runs", "totpago_runs", "matched_runs",
        "fully_reconciled_runs", "absolute_variance_cents",
    )
    if not all(strict_non_negative_integer(value.get(key)) for key in integer_keys):
        raise ValueError("Workforce-finance reconciliation integer drift")
    if not all(strict_percentage(value.get(key)) for key in (
        "run_coverage_pct", "metric_exact_rate_pct", "value_agreement_pct",
    )):
        raise ValueError("Workforce-finance reconciliation percentage drift")
    calculation_runs = value["calculation_runs"]
    totpago_runs = value["totpago_runs"]
    matched_runs = value["matched_runs"]
    fully_reconciled_runs = value["fully_reconciled_runs"]
    if matched_runs > min(calculation_runs, totpago_runs):
        raise ValueError("Workforce-finance reconciliation matched bounds failed")
    if fully_reconciled_runs > matched_runs:
        raise ValueError("Workforce-finance reconciliation full bounds failed")
    observed_runs = calculation_runs + totpago_runs - matched_runs
    if value["run_coverage_pct"] != ratio(matched_runs, observed_runs):
        raise ValueError("Workforce-finance reconciliation coverage drift")
    if matched_runs == 0:
        if any(value[key] != 0 for key in (
            "fully_reconciled_runs", "metric_exact_rate_pct",
            "value_agreement_pct", "absolute_variance_cents",
        )):
            raise ValueError("Workforce-finance empty reconciliation drift")
        return
    metric_cells = matched_runs * len(RECONCILIATION_FIELDS)
    implied_exact_cells = int((
        Decimal(str(value["metric_exact_rate_pct"])) * Decimal(metric_cells) /
        Decimal(100)
    ).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if (
        ratio(implied_exact_cells, metric_cells) != value["metric_exact_rate_pct"] or
        implied_exact_cells < fully_reconciled_runs * len(RECONCILIATION_FIELDS) or
        implied_exact_cells > fully_reconciled_runs * len(RECONCILIATION_FIELDS) +
            (matched_runs - fully_reconciled_runs) * (len(RECONCILIATION_FIELDS) - 1)
    ):
        raise ValueError("Workforce-finance reconciliation metric drift")
    if value["absolute_variance_cents"] == 0 and (
        fully_reconciled_runs != matched_runs or
        value["metric_exact_rate_pct"] != 100
    ):
        raise ValueError("Workforce-finance zero reconciliation variance drift")


def validate_participant_accounting_contract(artifact: dict[str, object]) -> None:
    totals = {row["period"]: row for row in artifact["period_totals"]}
    for view in artifact["dimension_views"]:
        for row in view["periods"]:
            accounting = row["participant_accounting"]
            total = totals[row["period"]]
            period_count = accounting.get("period_distinct_participants")
            if not strict_non_negative_integer(period_count) or (
                period_count != total["participant_count"]
            ):
                raise ValueError("Workforce-finance participant period identity drift")
            cells = row["cells"]
            has_protected_count = any(
                cell.get("participant_privacy_status") == "protected_difference_attack"
                for cell in cells
            )
            status = accounting.get("multi_category_privacy_status")
            cell_sum = accounting.get("sum_cell_distinct_participants_observed")
            if status == "protected":
                if not (
                    accounting.get("multi_category_participants") is None and
                    cell_sum is None and
                    accounting.get("multi_category_participant_display") ==
                        f"<{PRIVACY_THRESHOLD}" and
                    accounting.get("participants_may_overlap") is True
                ):
                    raise ValueError("Workforce-finance protected overlap drift")
                continue
            multi_count = accounting.get("multi_category_participants")
            if not strict_non_negative_integer(multi_count):
                raise ValueError("Workforce-finance overlap count drift")
            if accounting.get("multi_category_participant_display") != str(multi_count):
                raise ValueError("Workforce-finance overlap display drift")
            if status == "not_observed":
                if multi_count != 0 or accounting.get("participants_may_overlap") is not False:
                    raise ValueError("Workforce-finance no-overlap identity drift")
            elif status == "released":
                if not (
                    0 < multi_count <= period_count and
                    accounting.get("participants_may_overlap") is True
                ):
                    raise ValueError("Workforce-finance released overlap identity drift")
            else:
                raise ValueError("Workforce-finance overlap status drift")
            if has_protected_count:
                if cell_sum is not None:
                    raise ValueError("Workforce-finance protected count sum leak")
            elif not strict_non_negative_integer(cell_sum):
                raise ValueError("Workforce-finance participant cell sum drift")
            elif status == "not_observed" and cell_sum != period_count:
                raise ValueError("Workforce-finance no-overlap sum drift")
            elif status == "released" and cell_sum < period_count + multi_count:
                raise ValueError("Workforce-finance released overlap sum drift")


def require_exact_mapping(
    value: object,
    keys: set[str],
    error_message: str,
) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(error_message)
    return value


def validate_quality_contract(artifact: dict[str, object]) -> None:
    quality = require_exact_mapping(artifact.get("quality"), {
        "calculation", "references", "assignment", "participant_set_reconciliation",
        "amount_signs", "partition_checks", "warnings",
    }, "Workforce-finance quality shape drift")

    calculation = require_exact_mapping(quality.get("calculation"), {
        "source_rows", "valid_rows", "quarantine_rows", "valid_rate_pct",
        "window_rows", "window_control_rows", "window_periods",
    }, "Workforce-finance calculation quality shape drift")
    calculation_count_keys = (
        "source_rows", "valid_rows", "quarantine_rows", "window_rows",
        "window_control_rows", "window_periods",
    )
    if not all(strict_non_negative_integer(calculation.get(key)) for key in calculation_count_keys):
        raise ValueError("Workforce-finance calculation quality count drift")
    if not strict_percentage(calculation.get("valid_rate_pct")):
        raise ValueError("Workforce-finance calculation quality percentage drift")
    if calculation["source_rows"] != calculation["valid_rows"] + calculation["quarantine_rows"]:
        raise ValueError("Workforce-finance calculation row partition drift")
    if calculation["valid_rate_pct"] != ratio(
        calculation["valid_rows"], calculation["source_rows"],
    ):
        raise ValueError("Workforce-finance calculation valid rate drift")
    if not (
        calculation["window_control_rows"] <= calculation["window_rows"] <=
        calculation["valid_rows"]
    ):
        raise ValueError("Workforce-finance calculation window bounds drift")
    if calculation["window_periods"] != PUBLISHED_WINDOW_MONTHS:
        raise ValueError("Workforce-finance calculation window period drift")

    references = quality.get("references")
    if not isinstance(references, list) or len(references) != len(DIMENSIONS):
        raise ValueError("Workforce-finance reference quality shape drift")
    reference_by_dimension: dict[str, dict[str, object]] = {}
    for index, value in enumerate(references):
        row = require_exact_mapping(value, {
            "dimension", "observed_codes", "resolved_codes", "unresolved_codes",
            "observed_control_runs", "resolved_control_runs", "coverage_pct",
        }, "Workforce-finance reference quality row shape drift")
        dimension = DIMENSIONS[index]
        if row.get("dimension") != dimension:
            raise ValueError("Workforce-finance reference quality dimension drift")
        for key in (
            "observed_codes", "resolved_codes", "unresolved_codes",
            "observed_control_runs", "resolved_control_runs",
        ):
            if not strict_non_negative_integer(row.get(key)):
                raise ValueError("Workforce-finance reference quality count drift")
        if not strict_percentage(row.get("coverage_pct")):
            raise ValueError("Workforce-finance reference quality percentage drift")
        if row["resolved_codes"] + row["unresolved_codes"] != row["observed_codes"]:
            raise ValueError("Workforce-finance reference code partition drift")
        if row["resolved_control_runs"] > row["observed_control_runs"]:
            raise ValueError("Workforce-finance reference run bounds drift")
        if row["coverage_pct"] != ratio(
            row["resolved_control_runs"], row["observed_control_runs"],
        ):
            raise ValueError("Workforce-finance reference coverage drift")
        reference_by_dimension[dimension] = row

    assignment = require_exact_mapping(quality.get("assignment"), {
        "employee_period_runs", "invalid_employee_period_runs", "dimension_run_checks",
        "multi_category_employee_periods",
    }, "Workforce-finance assignment quality shape drift")
    employee_period_runs = assignment.get("employee_period_runs")
    invalid_employee_period_runs = assignment.get("invalid_employee_period_runs")
    if not strict_non_negative_integer(employee_period_runs) or not strict_non_negative_integer(
        invalid_employee_period_runs,
    ):
        raise ValueError("Workforce-finance assignment count drift")
    if invalid_employee_period_runs > employee_period_runs:
        raise ValueError("Workforce-finance assignment invalid run bounds drift")
    run_checks = assignment.get("dimension_run_checks")
    if not isinstance(run_checks, list) or len(run_checks) != len(DIMENSIONS):
        raise ValueError("Workforce-finance assignment run check shape drift")
    invalid_counts = []
    for index, value in enumerate(run_checks):
        row = require_exact_mapping(value, {
            "dimension", "employee_period_runs", "valid_runs", "ambiguous_runs",
            "missing_code_runs", "unresolved_reference_runs", "invalid_employee_key_runs",
            "coverage_pct",
        }, "Workforce-finance assignment run row shape drift")
        dimension = DIMENSIONS[index]
        if row.get("dimension") != dimension:
            raise ValueError("Workforce-finance assignment run dimension drift")
        run_count_keys = (
            "employee_period_runs", "valid_runs", "ambiguous_runs", "missing_code_runs",
            "unresolved_reference_runs", "invalid_employee_key_runs",
        )
        if not all(strict_non_negative_integer(row.get(key)) for key in run_count_keys):
            raise ValueError("Workforce-finance assignment run count drift")
        if not strict_percentage(row.get("coverage_pct")):
            raise ValueError("Workforce-finance assignment run percentage drift")
        invalid = sum(row[key] for key in run_count_keys[2:])
        invalid_counts.append(invalid)
        if row["employee_period_runs"] != employee_period_runs:
            raise ValueError("Workforce-finance assignment run population drift")
        if row["valid_runs"] + invalid != row["employee_period_runs"]:
            raise ValueError("Workforce-finance assignment run partition drift")
        if row["coverage_pct"] != ratio(row["valid_runs"], row["employee_period_runs"]):
            raise ValueError("Workforce-finance assignment run coverage drift")
        reference = reference_by_dimension[dimension]
        if (
            reference["observed_control_runs"] != row["employee_period_runs"] or
            reference["resolved_control_runs"] != row["valid_runs"]
        ):
            raise ValueError("Workforce-finance reference assignment identity drift")
    if invalid_employee_period_runs != max(invalid_counts, default=0):
        raise ValueError("Workforce-finance assignment invalid run identity drift")

    participant = require_exact_mapping(quality.get("participant_set_reconciliation"), {
        "periods_checked", "exact_periods", "mismatched_periods",
        "all_calculo_employee_periods", "control_employee_periods",
        "control_cohort_used_for_finance",
    }, "Workforce-finance participant reconciliation shape drift")
    participant_count_keys = (
        "periods_checked", "exact_periods", "mismatched_periods",
        "all_calculo_employee_periods", "control_employee_periods",
    )
    if not all(strict_non_negative_integer(participant.get(key)) for key in participant_count_keys):
        raise ValueError("Workforce-finance participant reconciliation count drift")
    if not (
        participant["periods_checked"] == PUBLISHED_WINDOW_MONTHS and
        participant["exact_periods"] + participant["mismatched_periods"] ==
            participant["periods_checked"] and
        participant["exact_periods"] == participant["periods_checked"] and
        participant["mismatched_periods"] == 0 and
        participant["all_calculo_employee_periods"] == participant["control_employee_periods"] and
        participant.get("control_cohort_used_for_finance") is True
    ):
        raise ValueError("Workforce-finance participant reconciliation identity drift")
    period_participant_total = sum(row["participant_count"] for row in artifact["period_totals"])
    if participant["control_employee_periods"] != period_participant_total:
        raise ValueError("Workforce-finance participant period total identity drift")

    multi_category = assignment.get("multi_category_employee_periods")
    if not isinstance(multi_category, list) or len(multi_category) != len(DIMENSIONS):
        raise ValueError("Workforce-finance multi-category quality shape drift")
    for index, value in enumerate(multi_category):
        row = require_exact_mapping(value, {
            "dimension", "employee_periods", "multi_category_employee_periods",
            "multi_category_pct",
        }, "Workforce-finance multi-category quality row shape drift")
        if row.get("dimension") != DIMENSIONS[index]:
            raise ValueError("Workforce-finance multi-category dimension drift")
        if not strict_non_negative_integer(row.get("employee_periods")) or not (
            strict_non_negative_integer(row.get("multi_category_employee_periods"))
        ):
            raise ValueError("Workforce-finance multi-category count drift")
        if not strict_percentage(row.get("multi_category_pct")):
            raise ValueError("Workforce-finance multi-category percentage drift")
        if row["employee_periods"] != participant["control_employee_periods"]:
            raise ValueError("Workforce-finance multi-category population drift")
        if row["multi_category_employee_periods"] > row["employee_periods"]:
            raise ValueError("Workforce-finance multi-category bounds drift")
        if row["multi_category_pct"] != ratio(
            row["multi_category_employee_periods"], row["employee_periods"],
        ):
            raise ValueError("Workforce-finance multi-category percentage identity drift")

    amount_signs = require_exact_mapping(quality.get("amount_signs"), {
        "periods_checked", "periods_with_nonpositive_net_payroll",
        "negative_period_components", "dimensions",
    }, "Workforce-finance amount-sign quality shape drift")
    if not strict_non_negative_integer(amount_signs.get("periods_checked")) or (
        amount_signs["periods_checked"] != PUBLISHED_WINDOW_MONTHS
    ):
        raise ValueError("Workforce-finance amount-sign period identity drift")
    if not strict_non_negative_integer(amount_signs.get("periods_with_nonpositive_net_payroll")) or (
        amount_signs["periods_with_nonpositive_net_payroll"] != 0
    ):
        raise ValueError("Workforce-finance v1 requires positive period net payroll")
    negative_period_components = require_exact_mapping(
        amount_signs.get("negative_period_components"), set(COMPONENT_KEYS),
        "Workforce-finance amount-sign component shape drift",
    )
    if not all(
        strict_non_negative_integer(negative_period_components.get(key)) and
        negative_period_components[key] == 0
        for key in COMPONENT_KEYS
    ):
        raise ValueError("Workforce-finance v1 rejects negative period components")
    dimension_signs = amount_signs.get("dimensions")
    if not isinstance(dimension_signs, list) or len(dimension_signs) != len(DIMENSIONS):
        raise ValueError("Workforce-finance amount-sign dimension shape drift")
    for index, value in enumerate(dimension_signs):
        row = require_exact_mapping(value, {
            "dimension", "cells_checked", "negative_component_cells",
            "allocation_periods_available", "allocation_periods_unavailable",
        }, "Workforce-finance amount-sign dimension row shape drift")
        if row.get("dimension") != DIMENSIONS[index]:
            raise ValueError("Workforce-finance amount-sign dimension drift")
        for key in (
            "cells_checked", "allocation_periods_available", "allocation_periods_unavailable",
        ):
            if not strict_non_negative_integer(row.get(key)):
                raise ValueError("Workforce-finance amount-sign dimension count drift")
        negative_cells = require_exact_mapping(
            row.get("negative_component_cells"), set(COMPONENT_KEYS),
            "Workforce-finance amount-sign cell component shape drift",
        )
        if not all(
            strict_non_negative_integer(negative_cells.get(key)) and negative_cells[key] == 0
            for key in COMPONENT_KEYS
        ):
            raise ValueError("Workforce-finance v1 rejects signed cells")
        if not (
            row["allocation_periods_available"] + row["allocation_periods_unavailable"] ==
                PUBLISHED_WINDOW_MONTHS and
            row["allocation_periods_unavailable"] == 0
        ):
            raise ValueError("Workforce-finance allocation availability drift")

    partitions = quality.get("partition_checks")
    if not isinstance(partitions, list) or len(partitions) != len(DIMENSIONS):
        raise ValueError("Workforce-finance partition quality shape drift")
    for index, value in enumerate(partitions):
        row = require_exact_mapping(value, {
            "dimension", "periods_checked", "component_identity_failures",
            "net_allocation_identity_failures", "allocation_share_failures",
        }, "Workforce-finance partition quality row shape drift")
        if row.get("dimension") != DIMENSIONS[index]:
            raise ValueError("Workforce-finance partition dimension drift")
        for key in (
            "periods_checked", "component_identity_failures",
            "net_allocation_identity_failures", "allocation_share_failures",
        ):
            if not strict_non_negative_integer(row.get(key)):
                raise ValueError("Workforce-finance partition quality count drift")
        if not (
            row["periods_checked"] == PUBLISHED_WINDOW_MONTHS and
            row["component_identity_failures"] == 0 and
            row["net_allocation_identity_failures"] == 0 and
            row["allocation_share_failures"] == 0
        ):
            raise ValueError("Workforce-finance partition identity drift")


def validate_built_artifact(artifact: dict[str, object]) -> None:
    if set(artifact) != {
        "schema_version", "policy_version", "release_id", "source", "metric",
        "cohort", "privacy", "capabilities", "period_totals", "dimension_views", "quality",
    }:
        raise ValueError("Workforce-finance source top-level shape drift")
    if artifact["schema_version"] != SOURCE_SCHEMA_VERSION:
        raise ValueError("Workforce-finance source version drift")
    source_identity = artifact.get("source")
    if not isinstance(source_identity, dict):
        raise ValueError("Workforce-finance source identity drift")
    generated_at = source_identity.get("generated_at")
    if not isinstance(generated_at, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z",
        generated_at,
    ):
        raise ValueError("Workforce-finance generated timestamp drift")
    try:
        parsed_generated_at = dt.datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Workforce-finance generated timestamp drift") from error
    canonical_generated_at = canonical_utc_timestamp(parsed_generated_at)
    expected_generated_at = (
        canonical_generated_at if "." in generated_at
        else canonical_generated_at.replace(".000Z", "Z")
    )
    if expected_generated_at != generated_at:
        raise ValueError("Workforce-finance generated timestamp drift")
    if not isinstance(artifact.get("release_id"), str) or not re.fullmatch(
        r"[0-9a-f]{64}", artifact["release_id"],
    ) or artifact["release_id"] != release_id(artifact):
        raise ValueError("Workforce-finance release content identity drift")
    if artifact["capabilities"] != {
        "cohort_finance": "released",
        "cell_arithmetic_control": "released",
        "period_cross_source_reconciliation": "released",
        "cohort_cross_source_reconciliation": "unavailable_no_dimensional_totpago_join",
        "cohort_absence": "not_in_source_v1",
        "cohort_leave": "not_in_source_v1",
    }:
        raise ValueError("Workforce-finance capability drift")
    for period_total in artifact["period_totals"]:
        validate_reconciliation_contract(period_total["reconciliation"])
    validate_participant_accounting_contract(artifact)
    validate_quality_contract(artifact)
    if [view["dimension"] for view in artifact["dimension_views"]] != list(DIMENSIONS):
        raise ValueError("Workforce-finance source dimension drift")
    warnings = artifact["quality"]["warnings"]
    required_warnings = {
        "cross_view_single_cell_difference_gate_passed",
        "cross_view_remaining_single_cell_risks:0",
        "cross_view_subset_difference_gate_passed",
        "cross_view_remaining_subset_difference_risks:0",
    }
    if not isinstance(warnings, list) or not required_warnings.issubset(warnings):
        raise ValueError("Workforce-finance privacy receipt drift")
    assert_no_forbidden_keys(artifact)


def build_workforce_finance(
    source: Path,
    *,
    manifest_path: Path = Path("config/grh-source-manifest.json"),
    generated_at: dt.datetime | None = None,
    window_months: int = PUBLISHED_WINDOW_MONTHS,
) -> dict[str, object]:
    source = source.resolve()
    manifest = load_and_validate_canonical_source(source, manifest_path.resolve())
    as_of = dt.date.fromisoformat(manifest["snapshot_as_of"])
    first = scan_first_pass(source, as_of)
    all_window_periods = month_window(str(first["latest_period"]), window_months)
    observed_window_periods = [
        period for period in all_window_periods
        if period in first["calculation_periods"]
    ]
    if observed_window_periods != all_window_periods:
        raise ValueError("The workforce-finance source does not contain 24 consecutive periods")
    second = scan_second_pass(
        source, as_of, first["schemas"], set(observed_window_periods),
    )
    raw_dimensions, control_participants, run_quality = build_raw_dimensions(
        second["run_buckets"], first["references"], first["reference_conflicts"],
    )
    period_controls = raw_period_controls(second["run_buckets"])
    period_totals = build_period_totals(
        observed_window_periods,
        period_controls,
        second["control_period_participants"],
        second["calculation_run_controls"],
        first["totpago_runs"],
    )
    (
        dimension_views,
        partition_checks,
        multi_category,
        dimension_signs,
        cross_view_receipt,
    ) = build_dimension_views(
        raw_dimensions,
        observed_window_periods,
        period_totals,
        second["control_period_participants"],
    )
    references = reference_quality(
        raw_dimensions, run_quality, len(second["run_buckets"]),
    )
    warnings = [
        "source_currency_not_declared",
        "calculation_control_not_bank_disbursement",
        "participants_may_overlap_across_run_categories",
        "period_cross_source_reconciliation_not_cohort_reconciliation",
    ]
    if second["null_control_amount_rows"]:
        warnings.append("null_control_amount_rows_treated_as_zero")
    if second["invalid_control_employee_rows"]:
        warnings.append("invalid_control_employee_rows_protected")
    if any(item["coverage_pct"] < 100 for item in references):
        warnings.append("dimension_reference_runs_protected")
    warnings.extend([
        "cross_view_single_cell_difference_gate_passed",
        f"cross_view_initial_single_cell_risks:{cross_view_receipt['initial_single_cell_risks']}",
        f"cross_view_coordinated_cells:{cross_view_receipt['coordinated_cells']}",
        "cross_view_remaining_single_cell_risks:0",
        "cross_view_subset_difference_gate_passed",
        f"cross_view_max_observables_per_view:{cross_view_receipt['max_observables_per_view']}",
        f"cross_view_max_protected_target_states_per_period:{cross_view_receipt['max_protected_target_states_per_period']}",
        f"cross_view_subset_equations_checked:{cross_view_receipt['subset_equations_checked']}",
        f"cross_view_max_subset_equations_per_period:{cross_view_receipt['max_subset_equations_per_period']}",
        "cross_view_remaining_subset_difference_risks:0",
    ])

    generated = canonical_utc_timestamp(generated_at or dt.datetime.now(dt.timezone.utc))
    artifact = {
        "schema_version": SOURCE_SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "release_id": None,
        "source": {
            "canonical_system": manifest["canonical_system"],
            "file": manifest["source_file"],
            "sha256": manifest["sha256"],
            "compressed_size_bytes": manifest["compressed_size_bytes"],
            "snapshot_as_of": manifest["snapshot_as_of"],
            "generated_at": generated,
            "latest_valid_calculation_period": str(first["latest_period"]),
            "profile_schema_version": PROFILE_SCHEMA_VERSION,
            "semantic_schema_version": SEMANTIC_SCHEMA_VERSION,
            "realtime": False,
        },
        "metric": {
            "grain": "calendar_month_x_observed_run_dimension",
            "currency": "not_declared_in_source",
            "amount_unit": "source_currency_cents",
            "status": "calculation_control_not_bank_disbursement",
            "allocation_basis": "net_payroll_cents",
            "allocation_rule": "released_only_when_all_period_cell_components_nonnegative_and_period_net_positive",
            "interpretation": "run_observed_allocation_not_exclusive_workforce_distribution",
        },
        "cohort": {
            "participant_definition": "distinct_company_employee_key_observed_in_allowlisted_control_concepts",
            "assignment_mode": "calculo_row_observed",
            "assignment_grain": "company_employee_period_calculation_date_run_type",
            "assignment_semantics": "dimension_observed_on_calculo_run_not_contract_status",
            "published_window_months": PUBLISHED_WINDOW_MONTHS,
            "first_period": observed_window_periods[0],
            "last_period": observed_window_periods[-1],
            "one_way_dimensions": list(DIMENSIONS),
            "participants_may_overlap_across_categories": True,
        },
        "privacy": {
            "threshold": PRIVACY_THRESHOLD,
            "aggregate_only": True,
            "contains_pii": False,
            "employee_identifiers_exported": False,
            "raw_rows_exported": False,
            "arbitrary_filters_allowed": False,
            "intersections_allowed": False,
            "primary_suppression": True,
            "complementary_suppression": True,
            "cross_period_protection": "consecutive_participant_count_difference_protection",
            "small_overlap_protection": True,
            "released_amounts_remain_arithmetically_comparable": True,
            "protected_bucket_label": PROTECTED_LABEL,
        },
        "capabilities": {
            "cohort_finance": "released",
            "cell_arithmetic_control": "released",
            "period_cross_source_reconciliation": "released",
            "cohort_cross_source_reconciliation": "unavailable_no_dimensional_totpago_join",
            "cohort_absence": "not_in_source_v1",
            "cohort_leave": "not_in_source_v1",
        },
        "period_totals": period_totals,
        "dimension_views": dimension_views,
        "quality": {
            "calculation": {
                "source_rows": int(first["calculation_rows"]),
                "valid_rows": int(first["calculation_valid_rows"]),
                "quarantine_rows": int(first["calculation_quarantine_rows"]),
                "valid_rate_pct": ratio(
                    int(first["calculation_valid_rows"]), int(first["calculation_rows"]),
                ),
                "window_rows": int(second["window_rows"]),
                "window_control_rows": int(second["window_control_rows"]),
                "window_periods": len(observed_window_periods),
            },
            "references": references,
            "assignment": assignment_quality(
                run_quality, len(second["run_buckets"]), multi_category,
            ),
            "participant_set_reconciliation": participant_set_reconciliation(
                observed_window_periods,
                second["all_period_participants"],
                second["control_period_participants"],
            ),
            "amount_signs": amount_sign_quality(period_totals, dimension_signs),
            "partition_checks": partition_checks,
            "warnings": warnings,
        },
    }
    artifact["release_id"] = release_id(artifact)
    validate_built_artifact(artifact)
    return artifact


def write_artifact(path: Path, artifact: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(
        artifact, ensure_ascii=False, sort_keys=True, indent=2,
    ) + "\n"
    path.write_text(encoded, encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--manifest", type=Path, default=Path("config/grh-source-manifest.json"))
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-workforce-finance.json"))
    parser.add_argument("--generated-at", type=parse_generated_at)
    args = parser.parse_args()
    artifact = build_workforce_finance(
        args.source,
        manifest_path=args.manifest,
        generated_at=args.generated_at,
    )
    write_artifact(args.out, artifact)
    receipt = {
        "schema_version": artifact["schema_version"],
        "release_id": artifact["release_id"],
        "periods": len(artifact["period_totals"]),
        "source_rows": artifact["quality"]["calculation"]["source_rows"],
        "window_rows": artifact["quality"]["calculation"]["window_rows"],
        "output_bytes": args.out.stat().st_size,
    }
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
