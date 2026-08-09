#!/usr/bin/env python3
"""Build the governed, aggregate-only semantic layer for the GRH dump.

The extractor streams the compressed MariaDB dump and never materialises raw
records.  Its JSON contract intentionally excludes employee identifiers and
all other PII: only schema metadata, counts, periods and monetary control
totals are exported.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Iterable

try:
    from .grh_source_manifest import file_sha256, load_and_validate_canonical_source
except ImportError:  # Direct execution: python scripts/build_grh_semantic.py
    from grh_source_manifest import file_sha256, load_and_validate_canonical_source


SCHEMA_VERSION = "grh-semantic-v2"
DEFAULT_MIN_YEAR = 1979
TARGET_TABLES = {
    "legajo", "calculo", "totpago", "ausencia", "licencia", "legamov",
    "concepto", "sectores", "costos", "convenio",
}
FACT_TABLES = ("calculo", "legamov", "ausencia", "licencia")
ANNUAL_PARTICIPANT_TABLES = ("ausencia", "licencia", "legamov")
PAYROLL_FIELDS = ("THCA_65", "THSA_65", "TRET_65", "NETO_65", "TAPO_65")
CALC_CONTROL_CONCEPTS = {
    993: "contributory_earnings",
    994: "non_contributory_earnings",
    995: "family_allowances",
    996: "employee_withholdings",
    998: "net_payroll",
    999: "net_to_pay",
    990: "employer_contributions",
}
CALC_TO_TOTPAGO = {
    993: "THCA_65",
    994: "THSA_65",
    996: "TRET_65",
    998: "NETO_65",
    990: "TAPO_65",
}

CREATE_RE = re.compile(r"^CREATE TABLE `([^`]+)`")
INSERT_RE = re.compile(
    r"^INSERT INTO `([^`]+)`(?:\s*\(([^)]*)\))?\s+VALUES\s*(.*);\s*$"
)
COLUMN_RE = re.compile(r"^\s*`([^`]+)`\s+(.+?)(?:,)?\s*$")
# The first branch consumes complete SQL strings, including escaped quotes, so
# tuple-looking text inside a value is never counted as a record separator.
ROW_SEPARATOR_RE = re.compile(r"'(?:\\.|[^'\\])*'|(\),\()")
SNAPSHOT_RE = re.compile(r"(?<!\d)(20\d{6})\d*(?!\d)")


def parse_sql_tuples(values: str) -> Iterable[list[str | None]]:
    """Yield fields from an extended INSERT VALUES payload.

    This deliberately implements only the MariaDB dump grammar used by the
    supplied snapshot.  Backslash escapes and doubled single quotes are both
    handled; commas and parentheses inside strings remain data.
    """
    index, length = 0, len(values)
    while index < length:
        while index < length and values[index] != "(":
            index += 1
        if index >= length:
            return
        index += 1
        fields: list[str | None] = []
        buffer: list[str] = []
        quoted = False
        while index < length:
            char = values[index]
            if quoted:
                if char == "\\" and index + 1 < length:
                    buffer.append(values[index + 1])
                    index += 2
                    continue
                if char == "'":
                    if index + 1 < length and values[index + 1] == "'":
                        buffer.append("'")
                        index += 2
                        continue
                    quoted = False
                    index += 1
                    continue
                buffer.append(char)
                index += 1
                continue
            if char == "'":
                quoted = True
                index += 1
                continue
            if char == ",":
                value = "".join(buffer).strip()
                fields.append(None if value.upper() == "NULL" else value)
                buffer = []
                index += 1
                continue
            if char == ")":
                value = "".join(buffer).strip()
                fields.append(None if value.upper() == "NULL" else value)
                index += 1
                break
            buffer.append(char)
            index += 1
        yield fields


def count_insert_rows(values: str) -> int:
    if not values.strip():
        return 0
    return 1 + sum(match.group(1) is not None for match in ROW_SEPARATOR_RE.finditer(values))


def parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def valid_employee_key(key: tuple[int | None, int | None]) -> bool:
    """Return whether the source compound key is safe for cardinality use."""
    company, employee = key
    return isinstance(company, int) and company > 0 and isinstance(employee, int) and employee > 0


def parse_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except (TypeError, ValueError):
        return None


def parse_decimal(value: str | None) -> Decimal:
    if value in (None, ""):
        return Decimal(0)
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(0)


def cents(value: Decimal) -> int:
    return int((value * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def ratio(numerator: int | Decimal, denominator: int | Decimal) -> float:
    if not denominator:
        return 0.0
    return round(float(Decimal(numerator) * 100 / Decimal(denominator)), 4)


def parse_generated_at(value: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise argparse.ArgumentTypeError("--generated-at must be an ISO-8601 timestamp") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise argparse.ArgumentTypeError("--generated-at must include a timezone")
    return parsed


def canonical_utc_timestamp(value: dt.datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("generated_at must include a timezone")
    return value.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def reconciliation_run_sort_key(item: dict[str, object]) -> tuple[str, str, bool, int]:
    """Return a total, deterministic order for published reconciliation runs."""
    company_code = item.get("company_code")
    return (
        str(item["calculation_date"]),
        str(item["source_run_type"]),
        company_code is None,
        int(company_code or 0),
    )


def infer_snapshot_date(source: Path) -> dt.date:
    match = SNAPSHOT_RE.search(source.name)
    if not match:
        raise ValueError("No snapshot date in filename; pass --as-of YYYY-MM-DD")
    return dt.datetime.strptime(match.group(1), "%Y%m%d").date()


def period_reasons(
    year_value: str | None,
    month_value: str | None,
    date_value: str | None,
    *,
    min_year: int,
    as_of: dt.date,
    require_date: bool = True,
) -> tuple[list[str], int | None, int | None, dt.date | None]:
    reasons: list[str] = []
    year = parse_int(year_value)
    month = parse_int(month_value)
    anchor = parse_date(date_value)
    if year is None:
        reasons.append("year_missing_or_invalid")
    elif year < min_year:
        reasons.append("year_before_policy")
    elif year > as_of.year:
        reasons.append("year_after_snapshot")
    if month is None or not 1 <= month <= 12:
        reasons.append("month_out_of_range")
    elif year == as_of.year and month > as_of.month:
        reasons.append("period_after_snapshot")
    if require_date:
        if anchor is None:
            reasons.append("date_missing_or_invalid")
        else:
            if anchor < dt.date(min_year, 1, 1):
                reasons.append("date_before_policy")
            elif anchor > as_of:
                reasons.append("date_after_snapshot")
            if year is not None and anchor.year != year:
                reasons.append("period_date_year_mismatch")
    return sorted(set(reasons)), year, month, anchor


def date_reasons(
    value: str | None, *, min_year: int, as_of: dt.date
) -> tuple[list[str], dt.date | None]:
    anchor = parse_date(value)
    if anchor is None:
        return ["date_missing_or_invalid"], None
    reasons = []
    if anchor < dt.date(min_year, 1, 1):
        reasons.append("date_before_policy")
    elif anchor > as_of:
        reasons.append("date_after_snapshot")
    return reasons, anchor


@dataclass
class TableSchema:
    name: str
    columns: list[str] = field(default_factory=list)
    primary_key: bool = False
    unique_keys: int = 0
    foreign_keys: int = 0


@dataclass
class TemporalStats:
    rows: int = 0
    valid_rows: int = 0
    quarantine_rows: int = 0
    quarantine_reasons: collections.Counter[str] = field(default_factory=collections.Counter)
    valid_by_year: collections.Counter[int] = field(default_factory=collections.Counter)
    valid_by_period: collections.Counter[str] = field(default_factory=collections.Counter)
    quarantine_by_period: collections.Counter[str] = field(default_factory=collections.Counter)
    date_month_mismatch_rows: int = 0

    def record(
        self,
        reasons: list[str],
        *,
        year: int | None = None,
        month: int | None = None,
        anchor: dt.date | None = None,
        quarantine_bucket: str | None = None,
    ) -> bool:
        self.rows += 1
        if reasons:
            self.quarantine_rows += 1
            self.quarantine_reasons.update(reasons)
            self.quarantine_by_period[quarantine_bucket or "unparseable"] += 1
            return False
        self.valid_rows += 1
        effective_year = year if year is not None else (anchor.year if anchor else None)
        if effective_year is not None:
            self.valid_by_year[effective_year] += 1
        if year is not None and month is not None:
            self.valid_by_period[f"{year:04d}-{month:02d}"] += 1
            if anchor and anchor.month != month:
                self.date_month_mismatch_rows += 1
        return True


def empty_money() -> dict[str, Decimal | int]:
    return {
        "rows": 0,
        "THCA_65": Decimal(0),
        "THSA_65": Decimal(0),
        "TRET_65": Decimal(0),
        "NETO_65": Decimal(0),
        "TAPO_65": Decimal(0),
        "reconciled_rows": 0,
        "variance": Decimal(0),
    }


def add_money(bucket: dict[str, Decimal | int], values: dict[str, Decimal]) -> None:
    bucket["rows"] = int(bucket["rows"]) + 1
    for field_name in PAYROLL_FIELDS:
        bucket[field_name] = Decimal(bucket[field_name]) + values[field_name]
    gross = values["THCA_65"] + values["THSA_65"]
    derived_net = gross - values["TRET_65"]
    variance = values["NETO_65"] - derived_net
    bucket["variance"] = Decimal(bucket["variance"]) + variance
    if variance == 0:
        bucket["reconciled_rows"] = int(bucket["reconciled_rows"]) + 1


def serialise_money(bucket: dict[str, Decimal | int]) -> dict[str, int | float]:
    gross = Decimal(bucket["THCA_65"]) + Decimal(bucket["THSA_65"])
    rows = int(bucket["rows"])
    reconciled_rows = int(bucket["reconciled_rows"])
    return {
        "rows": rows,
        "gross_earnings_cents": cents(gross),
        "contributory_earnings_cents": cents(Decimal(bucket["THCA_65"])),
        "non_contributory_earnings_cents": cents(Decimal(bucket["THSA_65"])),
        "withholdings_cents": cents(Decimal(bucket["TRET_65"])),
        "net_payroll_cents": cents(Decimal(bucket["NETO_65"])),
        "source_tapo_cents": cents(Decimal(bucket["TAPO_65"])),
        "reconciliation_variance_cents": cents(Decimal(bucket["variance"])),
        "reconciled_rows": reconciled_rows,
        "reconciled_row_rate_pct": ratio(reconciled_rows, rows),
    }


def empty_calculation_control() -> dict[str, object]:
    return {
        "calculation_rows": 0,
        "control_rows": 0,
        "participants": set(),
        "controls": collections.defaultdict(Decimal),
    }


def add_calculation_row(
    bucket: dict[str, object],
    *,
    employee_key: tuple[int | None, int | None],
    concept_code: int | None,
    amount: Decimal,
) -> None:
    bucket["calculation_rows"] = int(bucket["calculation_rows"]) + 1
    if employee_key[0] is not None and employee_key[1] is not None:
        participants = bucket["participants"]
        assert isinstance(participants, set)
        participants.add(employee_key)
    if concept_code in CALC_CONTROL_CONCEPTS:
        bucket["control_rows"] = int(bucket["control_rows"]) + 1
        controls = bucket["controls"]
        controls[concept_code] += amount


def serialise_calculation_control(bucket: dict[str, object]) -> dict[str, object]:
    controls = bucket["controls"]
    participants = bucket["participants"]
    values = {code: Decimal(controls.get(code, 0)) for code in CALC_CONTROL_CONCEPTS}
    credits = values[993] + values[994] + values[995]
    derived_net = credits - values[996]
    net_variance = values[998] - derived_net
    net_to_pay_variance = values[999] - values[998]
    rounding_tolerance_cents = max(1, len(participants))
    exact_identity = abs(cents(net_variance)) <= 1 and abs(cents(net_to_pay_variance)) <= 1
    within_rounding_tolerance = (
        abs(cents(net_variance)) <= rounding_tolerance_cents and
        abs(cents(net_to_pay_variance)) <= rounding_tolerance_cents
    )
    return {
        "calculation_rows": int(bucket["calculation_rows"]),
        "control_rows": int(bucket["control_rows"]),
        "distinct_payroll_participants": len(participants),
        "gross_with_family_allowances_cents": cents(credits),
        "contributory_earnings_cents": cents(values[993]),
        "non_contributory_earnings_cents": cents(values[994]),
        "family_allowances_cents": cents(values[995]),
        "employee_withholdings_cents": cents(values[996]),
        "net_payroll_cents": cents(values[998]),
        "net_to_pay_cents": cents(values[999]),
        "employer_contributions_cents": cents(values[990]),
        "net_identity_variance_cents": cents(net_variance),
        "net_to_pay_variance_cents": cents(net_to_pay_variance),
        "rounding_tolerance_cents": rounding_tolerance_cents,
        "control_identity_reconciled": exact_identity,
        "control_identity_within_rounding_tolerance": within_rounding_tolerance,
    }


def temporal_payload(stats: TemporalStats) -> dict[str, object]:
    valid_periods = sorted(stats.valid_by_period)
    valid_years = sorted(stats.valid_by_year)
    return {
        "rows": stats.rows,
        "valid_rows": stats.valid_rows,
        "quarantine_rows": stats.quarantine_rows,
        "valid_rate_pct": ratio(stats.valid_rows, stats.rows),
        "valid_periods": len(valid_periods),
        "first_valid_period": valid_periods[0] if valid_periods else None,
        "last_valid_period": valid_periods[-1] if valid_periods else None,
        "first_valid_year": valid_years[0] if valid_years else None,
        "last_valid_year": valid_years[-1] if valid_years else None,
        "date_month_mismatch_rows": stats.date_month_mismatch_rows,
        "quarantine_by_period": dict(sorted(stats.quarantine_by_period.items())),
        "quarantine_reason_occurrences": dict(sorted(stats.quarantine_reasons.items())),
        "quarantine_reasons_are_non_exclusive": True,
    }


def build_semantic_layer(
    source: Path,
    *,
    as_of: dt.date | None = None,
    min_year: int = DEFAULT_MIN_YEAR,
    generated_at: dt.datetime | None = None,
) -> dict[str, object]:
    if not source.is_file():
        raise FileNotFoundError(source)
    as_of = as_of or infer_snapshot_date(source)
    generated_at = canonical_utc_timestamp(generated_at or dt.datetime.now(dt.timezone.utc))
    if min_year > as_of.year:
        raise ValueError("min_year must not be after the snapshot year")

    schemas: dict[str, TableSchema] = {}
    table_rows: collections.Counter[str] = collections.Counter()
    temporal = {name: TemporalStats() for name in ("calculo", "totpago", "legamov", "ausencia", "licencia")}
    employee_keys: set[tuple[int | None, int | None]] = set()
    fact_key_rows = {name: collections.Counter() for name in FACT_TABLES}
    fact_valid_keys = {name: set() for name in FACT_TABLES}
    annual_participant_keys = {
        name: collections.defaultdict(set) for name in ANNUAL_PARTICIPANT_TABLES
    }
    payroll_all = empty_money()
    payroll_valid = empty_money()
    payroll_quarantine = empty_money()
    payroll_periods: dict[str, dict[str, Decimal | int]] = collections.defaultdict(empty_money)
    payroll_runs: dict[tuple[object, ...], dict[str, Decimal]] = {}
    payroll_null_measures = collections.Counter()
    calculation_periods: dict[str, dict[str, object]] = collections.defaultdict(empty_calculation_control)
    calculation_runs: dict[tuple[object, ...], dict[str, object]] = collections.defaultdict(empty_calculation_control)
    latest_calculation_period: str | None = None
    latest_concepts: dict[int | None, dict[str, object]] = collections.defaultdict(
        lambda: {"rows": 0, "amount": Decimal(0), "participants": set()}
    )
    legajo_assignments: dict[tuple[int | None, int | None], dict[str, int | None]] = {}
    concept_reference: dict[int, dict[str, str | None]] = {}
    sector_reference: dict[tuple[int | None, int | None], str] = {}
    cost_center_reference: dict[tuple[int | None, int | None], str] = {}
    agreement_reference: dict[int, str] = {}
    absence_days = Decimal(0)
    license_days = Decimal(0)
    current_table: str | None = None

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
                stripped = line.lstrip()
                if stripped.startswith("PRIMARY KEY"):
                    schema.primary_key = True
                elif stripped.startswith("UNIQUE KEY"):
                    schema.unique_keys += 1
                if " FOREIGN KEY " in f" {stripped}":
                    schema.foreign_keys += 1
                if line.startswith(") ENGINE"):
                    current_table = None

            insert_match = INSERT_RE.match(line)
            if not insert_match:
                continue
            table_name, explicit_columns, values_text = insert_match.groups()
            insert_count = count_insert_rows(values_text)
            table_rows[table_name] += insert_count
            if table_name not in TARGET_TABLES:
                continue
            schema_columns = schemas.get(table_name, TableSchema(table_name)).columns
            if explicit_columns:
                columns = [item.strip().strip("`") for item in explicit_columns.split(",")]
            else:
                columns = schema_columns
            parsed_count = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_count += 1
                row = {columns[index]: raw_row[index] for index in range(min(len(columns), len(raw_row)))}
                company = parse_int(row.get("CODI_01"))
                employee = parse_int(row.get("LEGA_12"))
                key = (company, employee)

                if table_name == "legajo":
                    employee_keys.add(key)
                    legajo_assignments[key] = {
                        "sector": parse_int(row.get("CODI_07")),
                        "cost_center": parse_int(row.get("CODI_06")),
                        "agreement": parse_int(row.get("CODI_02")),
                    }
                    continue

                if table_name == "concepto":
                    concept_code = parse_int(row.get("CODI_27"))
                    if concept_code is not None:
                        concept_reference[concept_code] = {
                            "label": (row.get("DETA_15") or row.get("ABRE_15") or "").strip() or None,
                            "source_class_code": row.get("CALC_15"),
                            "source_type_code": row.get("TIPO_15"),
                        }
                    continue

                if table_name == "sectores":
                    sector_code = parse_int(row.get("CODI_07"))
                    label = (row.get("DETA_07") or row.get("ABRE_07") or "").strip()
                    if sector_code is not None and label:
                        sector_reference[(company, sector_code)] = label
                    continue

                if table_name == "costos":
                    cost_code = parse_int(row.get("CODI_06"))
                    label = (row.get("DETA_06") or "").strip()
                    if cost_code is not None and label:
                        cost_center_reference[(company, cost_code)] = label
                    continue

                if table_name == "convenio":
                    agreement_code = parse_int(row.get("CODI_02"))
                    label = (row.get("DETA_02") or "").strip()
                    if agreement_code is not None and label:
                        agreement_reference[agreement_code] = label
                    continue

                if table_name in fact_key_rows:
                    fact_key_rows[table_name][key] += 1
                if table_name in ("calculo", "totpago"):
                    reasons, year, month, anchor = period_reasons(
                        row.get("PERI_31"), row.get("MES_31"), row.get("FECA_31"),
                        min_year=min_year, as_of=as_of,
                    )
                elif table_name == "legamov":
                    reasons, year, month, anchor = period_reasons(
                        row.get("ANO_30"), row.get("MES_30"), None,
                        min_year=min_year, as_of=as_of, require_date=False,
                    )
                elif table_name == "ausencia":
                    reasons, anchor = date_reasons(row.get("FAUS_20"), min_year=min_year, as_of=as_of)
                    year, month = (anchor.year, anchor.month) if anchor else (None, None)
                else:  # licencia
                    reasons, anchor = date_reasons(row.get("FINI_24"), min_year=min_year, as_of=as_of)
                    year, month = (anchor.year, anchor.month) if anchor else (None, None)
                    end_date = parse_date(row.get("FFIN_24"))
                    if row.get("FFIN_24") and end_date is None:
                        reasons.append("end_date_invalid")
                    elif anchor and end_date and end_date < anchor:
                        reasons.append("end_date_before_start")
                    elif end_date and end_date > as_of:
                        reasons.append("end_date_after_snapshot")
                    reasons = sorted(set(reasons))

                quarantine_bucket = (
                    f"{year:04d}-{month:02d}"
                    if year is not None and month is not None
                    else (f"{anchor.year:04d}-{anchor.month:02d}" if anchor else "unparseable")
                )
                is_valid = temporal[table_name].record(
                    reasons,
                    year=year,
                    month=month,
                    anchor=anchor,
                    quarantine_bucket=quarantine_bucket,
                )
                if is_valid and table_name in fact_valid_keys:
                    fact_valid_keys[table_name].add(key)
                if (
                    is_valid
                    and table_name in annual_participant_keys
                    and year is not None
                    and valid_employee_key(key)
                ):
                    annual_participant_keys[table_name][year].add(key)

                if table_name == "calculo" and is_valid and year is not None and month is not None:
                    period = f"{year:04d}-{month:02d}"
                    run_key = (
                        company, year, month, anchor.isoformat() if anchor else None,
                        row.get("TIPO_31"),
                    )
                    concept_code = parse_int(row.get("CODI_27"))
                    amount = parse_decimal(row.get("IMPO_31"))
                    add_calculation_row(
                        calculation_periods[period], employee_key=key,
                        concept_code=concept_code, amount=amount,
                    )
                    add_calculation_row(
                        calculation_runs[run_key], employee_key=key,
                        concept_code=concept_code, amount=amount,
                    )
                    if latest_calculation_period is None or period > latest_calculation_period:
                        latest_calculation_period = period
                        latest_concepts.clear()
                    if period == latest_calculation_period:
                        detail = latest_concepts[concept_code]
                        detail["rows"] = int(detail["rows"]) + 1
                        detail["amount"] = Decimal(detail["amount"]) + amount
                        participants = detail["participants"]
                        assert isinstance(participants, set)
                        if key[0] is not None and key[1] is not None:
                            participants.add(key)

                if table_name == "ausencia" and is_valid:
                    absence_days += parse_decimal(row.get("DIAS_24"))
                elif table_name == "licencia" and is_valid:
                    license_days += parse_decimal(row.get("DIAS_24"))
                elif table_name == "totpago":
                    money = {field_name: parse_decimal(row.get(field_name)) for field_name in PAYROLL_FIELDS}
                    for field_name in PAYROLL_FIELDS:
                        if row.get(field_name) is None:
                            payroll_null_measures[field_name] += 1
                    add_money(payroll_all, money)
                    target = payroll_valid if is_valid else payroll_quarantine
                    add_money(target, money)
                    if is_valid and year is not None and month is not None:
                        add_money(payroll_periods[f"{year:04d}-{month:02d}"], money)
                        payroll_runs[(
                            company, year, month, anchor.isoformat() if anchor else None,
                            row.get("TIPO_31"),
                        )] = money

            if parsed_count != insert_count:
                raise ValueError(
                    f"Row parser mismatch for {table_name}: counted {insert_count}, parsed {parsed_count}"
                )

    for schema_name in schemas:
        table_rows.setdefault(schema_name, 0)

    dictionary = [
        {
            "table": name,
            "rows": table_rows[name],
            "columns": len(schema.columns),
            "has_primary_key": schema.primary_key,
            "unique_keys": schema.unique_keys,
            "foreign_keys": schema.foreign_keys,
        }
        for name, schema in sorted(schemas.items())
    ]
    non_empty = sum(entry["rows"] > 0 for entry in dictionary)

    coverage_facts: dict[str, object] = {}
    integrity_rates: list[Decimal] = []
    for table_name in FACT_TABLES:
        key_counts = fact_key_rows[table_name]
        matched_keys = {key for key in key_counts if key in employee_keys}
        orphan_rows = sum(count for key, count in key_counts.items() if key not in employee_keys)
        total_rows = sum(key_counts.values())
        matched_rows = total_rows - orphan_rows
        if total_rows:
            integrity_rates.append(Decimal(matched_rows) / Decimal(total_rows))
        valid_matched_keys = fact_valid_keys[table_name] & employee_keys
        coverage_facts[table_name] = {
            "rows": total_rows,
            "matched_rows": matched_rows,
            "orphan_rows": orphan_rows,
            "join_integrity_pct": ratio(matched_rows, total_rows),
            "distinct_employee_keys": len(key_counts),
            "valid_matched_employee_keys": len(valid_matched_keys),
            "employee_coverage_pct": ratio(len(valid_matched_keys), len(employee_keys)),
        }

    payroll_series = []
    for period in sorted(payroll_periods):
        item = {"period": period}
        item.update(serialise_money(payroll_periods[period]))
        payroll_series.append(item)

    calculation_series = []
    for period in sorted(calculation_periods):
        item = {"period": period}
        item.update(serialise_calculation_control(calculation_periods[period]))
        calculation_series.append(item)

    latest_participants: set[tuple[int | None, int | None]] = set()
    if latest_calculation_period:
        participant_value = calculation_periods[latest_calculation_period]["participants"]
        assert isinstance(participant_value, set)
        latest_participants = participant_value

    def workforce_dimension(field_name: str) -> list[dict[str, object]]:
        counts: collections.Counter[tuple[int | None, int | None]] = collections.Counter()
        for employee_key in latest_participants:
            assignment = legajo_assignments.get(employee_key, {})
            counts[(employee_key[0], assignment.get(field_name))] += 1
        payload = []
        for (company_code, code), count in sorted(
            counts.items(), key=lambda item: (-item[1], str(item[0]))
        ):
            if field_name == "sector":
                label = sector_reference.get((company_code, code))
            elif field_name == "cost_center":
                label = cost_center_reference.get((company_code, code))
            else:
                label = agreement_reference.get(code) if code is not None else None
            payload.append({
                "company_code": company_code,
                "source_code": code,
                "label": label or "Sin asignación declarada",
                "participants": count,
                "share_pct": ratio(count, len(latest_participants)),
            })
        return payload

    top_latest_concepts = []
    latest_non_control = [
        (code, item) for code, item in latest_concepts.items()
        if code not in CALC_CONTROL_CONCEPTS
    ]
    for code, item in sorted(
        latest_non_control,
        key=lambda entry: abs(Decimal(entry[1]["amount"])),
        reverse=True,
    )[:20]:
        reference = concept_reference.get(code or -1, {})
        participants = item["participants"]
        assert isinstance(participants, set)
        top_latest_concepts.append({
            "source_code": code,
            "label": reference.get("label") or f"Concepto {code}",
            "source_class_code": reference.get("source_class_code"),
            "source_type_code": reference.get("source_type_code"),
            "rows": int(item["rows"]),
            "distinct_participants": len(participants),
            "amount_cents": cents(Decimal(item["amount"])),
        })

    calculation_runs_with_controls = {
        key: value for key, value in calculation_runs.items()
        if int(value["control_rows"]) > 0
    }
    all_run_keys = set(calculation_runs_with_controls) | set(payroll_runs)
    matched_run_keys = set(calculation_runs_with_controls) & set(payroll_runs)
    exact_metric_cells = 0
    total_metric_cells = len(matched_run_keys) * len(CALC_TO_TOTPAGO)
    fully_reconciled_runs = 0
    absolute_variance_cents = 0
    comparison_value_cents = 0
    reconciliation_by_period: dict[str, dict[str, int]] = collections.defaultdict(
        lambda: {
            "calculation_runs": 0, "totpago_runs": 0, "matched_runs": 0,
            "fully_reconciled_runs": 0, "metric_cells": 0,
            "exact_metric_cells": 0, "absolute_variance_cents": 0,
            "comparison_value_cents": 0,
        }
    )
    latest_run_comparisons = []

    for run_key in all_run_keys:
        period = f"{int(run_key[1]):04d}-{int(run_key[2]):02d}"
        period_stats = reconciliation_by_period[period]
        calculation_bucket = calculation_runs_with_controls.get(run_key)
        totpago_values = payroll_runs.get(run_key)
        if calculation_bucket:
            period_stats["calculation_runs"] += 1
        if totpago_values:
            period_stats["totpago_runs"] += 1
        if not calculation_bucket or not totpago_values:
            continue
        period_stats["matched_runs"] += 1
        controls = calculation_bucket["controls"]
        run_metrics = []
        run_is_exact = True
        for concept_code, totpago_field in CALC_TO_TOTPAGO.items():
            calculation_cents = cents(Decimal(controls.get(concept_code, 0)))
            totpago_cents = cents(Decimal(totpago_values[totpago_field]))
            variance_cents = totpago_cents - calculation_cents
            is_exact = abs(variance_cents) <= 1
            exact_metric_cells += int(is_exact)
            period_stats["exact_metric_cells"] += int(is_exact)
            run_is_exact = run_is_exact and is_exact
            absolute_variance_cents += abs(variance_cents)
            period_stats["absolute_variance_cents"] += abs(variance_cents)
            value_basis = max(abs(calculation_cents), abs(totpago_cents))
            comparison_value_cents += value_basis
            period_stats["comparison_value_cents"] += value_basis
            run_metrics.append({
                "metric": CALC_CONTROL_CONCEPTS[concept_code],
                "calculo_cents": calculation_cents,
                "totpago_cents": totpago_cents,
                "variance_cents": variance_cents,
                "within_one_cent": is_exact,
            })
        period_stats["metric_cells"] += len(CALC_TO_TOTPAGO)
        if run_is_exact:
            fully_reconciled_runs += 1
            period_stats["fully_reconciled_runs"] += 1
        if period == latest_calculation_period:
            latest_run_comparisons.append({
                "company_code": run_key[0],
                "period": period,
                "calculation_date": run_key[3],
                "source_run_type": run_key[4],
                "fully_reconciled": run_is_exact,
                "metrics": run_metrics,
            })

    run_coverage = ratio(len(matched_run_keys), len(all_run_keys))
    metric_exact_rate = ratio(exact_metric_cells, total_metric_cells)
    value_agreement = (
        max(0.0, 100.0 - ratio(absolute_variance_cents, comparison_value_cents))
        if comparison_value_cents else 0.0
    )
    cross_source_score = round((run_coverage + metric_exact_rate + value_agreement) / 3, 4)
    reconciliation_period_series = []
    for period, item in sorted(reconciliation_by_period.items()):
        union_runs = item["calculation_runs"] + item["totpago_runs"] - item["matched_runs"]
        reconciliation_period_series.append({
            "period": period,
            **{key: item[key] for key in (
                "calculation_runs", "totpago_runs", "matched_runs", "fully_reconciled_runs",
                "absolute_variance_cents",
            )},
            "run_coverage_pct": ratio(item["matched_runs"], union_runs),
            "metric_exact_rate_pct": ratio(item["exact_metric_cells"], item["metric_cells"]),
            "value_agreement_pct": (
                max(0.0, 100.0 - ratio(item["absolute_variance_cents"], item["comparison_value_cents"]))
                if item["comparison_value_cents"] else 0.0
            ),
        })

    temporal_rates = [
        Decimal(stats.valid_rows) / Decimal(stats.rows)
        for stats in temporal.values()
        if stats.rows
    ]
    temporal_component = sum(temporal_rates, Decimal(0)) / max(len(temporal_rates), 1)
    integrity_component = sum(integrity_rates, Decimal(0)) / max(len(integrity_rates), 1)
    valid_gross = Decimal(payroll_valid["THCA_65"]) + Decimal(payroll_valid["THSA_65"])
    valid_rows = int(payroll_valid["rows"])
    exact_rate = (
        Decimal(int(payroll_valid["reconciled_rows"])) / Decimal(valid_rows)
        if valid_rows else Decimal(0)
    )
    value_coherence = Decimal(1)
    if valid_gross:
        value_coherence = max(
            Decimal(0),
            Decimal(1) - abs(Decimal(payroll_valid["variance"])) / abs(valid_gross),
        )
    totpago_internal_reconciliation_component = (exact_rate + value_coherence) / 2
    reconciliation_component = Decimal(str(cross_source_score)) / Decimal(100)
    key_component = Decimal(len(employee_keys)) / Decimal(table_rows.get("legajo", 1) or 1)
    component_weights = {
        "temporal_validity": Decimal("0.30"),
        "referential_integrity": Decimal("0.30"),
        "payroll_reconciliation": Decimal("0.30"),
        "legajo_key_uniqueness": Decimal("0.10"),
    }
    component_values = {
        "temporal_validity": temporal_component,
        "referential_integrity": integrity_component,
        "payroll_reconciliation": reconciliation_component,
        "legajo_key_uniqueness": min(key_component, Decimal(1)),
    }
    quality_score = sum(
        component_values[name] * weight for name, weight in component_weights.items()
    ) * 100
    calculation_control_anomalous_periods = sum(
        1 for row in calculation_series
        if not row["control_identity_within_rounding_tolerance"]
    )
    latest_calculation_control = next(
        row for row in calculation_series if row["period"] == latest_calculation_period
    )
    workforce_dimensions = {
        "by_sector": workforce_dimension("sector"),
        "by_cost_center": workforce_dimension("cost_center"),
        "by_agreement": workforce_dimension("agreement"),
    }
    published_labels = [
        str(item.get("label") or "")
        for rows in workforce_dimensions.values()
        for item in rows
    ] + [str(item.get("label") or "") for item in top_latest_concepts]
    suspicious_text_encoding_labels = sum(
        any(marker in label for marker in ("\u00c3", "\u00c2", "\ufffd"))
        for label in published_labels
    )
    annual_participant_counts = {
        table_name: {
            str(year): len(annual_participant_keys[table_name].get(year, set()))
            for year in sorted(temporal[table_name].valid_by_year)
        }
        for table_name in ANNUAL_PARTICIPANT_TABLES
    }

    source_total = serialise_money(payroll_all)
    valid_total = serialise_money(payroll_valid)
    quarantine_total = serialise_money(payroll_quarantine)
    control_identity = all(
        source_total[field_name] == valid_total[field_name] + quarantine_total[field_name]
        for field_name in (
            "rows", "gross_earnings_cents", "contributory_earnings_cents",
            "non_contributory_earnings_cents", "withholdings_cents",
            "net_payroll_cents", "source_tapo_cents", "reconciliation_variance_cents",
            "reconciled_rows",
        )
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "source": {
            "file": source.name,
            "compressed_size_bytes": source.stat().st_size,
            "sha256": file_sha256(source),
            "snapshot_as_of": as_of.isoformat(),
            "generated_at": generated_at,
            "canonical_system": "GRH Junín",
            "realtime": False,
        },
        "privacy": {
            "aggregate_only": True,
            "contains_pii": False,
            "employee_identifiers_exported": False,
            "excluded_sources": ["personas_junin"],
        },
        "table_dictionary": {
            "total_tables": len(dictionary),
            "non_empty_tables": non_empty,
            "empty_tables": len(dictionary) - non_empty,
            "total_rows": sum(entry["rows"] for entry in dictionary),
            "tables": dictionary,
        },
        "period_policy": {
            "minimum_valid_date": f"{min_year:04d}-01-01",
            "maximum_valid_date": as_of.isoformat(),
            "valid_month_range": [1, 12],
            "date_year_must_match_period_year": True,
            "date_month_mismatch_is_diagnostic_not_quarantine": True,
        },
        "period_quality": {
            name: temporal_payload(stats) for name, stats in sorted(temporal.items())
        },
        "payroll": {
            "source_table": "totpago",
            "source_tables": ["calculo", "totpago", "concepto"],
            "currency": "not_declared_in_source",
            "amount_unit": "source_currency_cents",
            "executive_metric_source": "calculo control concepts",
            "executive_metric_status": "calculation_control_not_bank_disbursement",
            "mass_salary_definition": (
                "gross_with_family_allowances = concepto 993 + 994 + 995; "
                "net_payroll = concepto 998"
            ),
            "calculation_reconciliation_formula": (
                "concepto 998 = 993 + 994 + 995 - 996; concepto 999 = concepto 998"
            ),
            "totpago_diagnostic_status": "not_cross_source_reconciled",
            "totpago_internal_formula": "NETO_65 = THCA_65 + THSA_65 - TRET_65",
            "totpago_internal_reconciliation_score_pct": round(
                float(totpago_internal_reconciliation_component * 100), 2
            ),
            "source_control_totals": source_total,
            "valid_control_totals": valid_total,
            "quarantine_control_totals": quarantine_total,
            "source_equals_valid_plus_quarantine": control_identity,
            "null_measure_cells": dict(sorted(payroll_null_measures.items())),
            "valid_period_series": payroll_series,
            "valid_period_series_status": "totpago_diagnostic_only",
            "calculation_control_series": calculation_series,
            "latest_calculation_period": latest_calculation_period,
            "latest_top_detail_concepts": top_latest_concepts,
            "cross_source_reconciliation": {
                "status": (
                    "reconciled" if cross_source_score == 100
                    else "material_differences_detected"
                ),
                "comparison": "calculo concepts 993/994/996/998/990 versus totpago fields",
                "tolerance_cents": 1,
                "calculation_runs": len(calculation_runs_with_controls),
                "totpago_runs": len(payroll_runs),
                "matched_runs": len(matched_run_keys),
                "fully_reconciled_runs": fully_reconciled_runs,
                "run_coverage_pct": run_coverage,
                "metric_exact_rate_pct": metric_exact_rate,
                "value_agreement_pct": value_agreement,
                "score_pct": cross_source_score,
                "absolute_variance_cents": absolute_variance_cents,
                "period_series": reconciliation_period_series,
                "latest_period_runs": sorted(
                    latest_run_comparisons,
                    key=reconciliation_run_sort_key,
                ),
            },
        },
        "workforce": {
            "definition": (
                "distinct legajo keys present in at least one valid calculo row in the latest valid period; "
                "this is payroll participation, not a contractual active-status master"
            ),
            "reference_period": latest_calculation_period,
            "payroll_participants": len(latest_participants),
            "matched_legajo_participants": len(latest_participants & employee_keys),
            "legajo_match_rate_pct": ratio(len(latest_participants & employee_keys), len(latest_participants)),
            **workforce_dimensions,
        },
        "absence": {
            "source_table": "ausencia",
            "valid_rows": temporal["ausencia"].valid_rows,
            "quarantine_rows": temporal["ausencia"].quarantine_rows,
            "valid_reported_days": float(absence_days),
            "valid_by_year": {
                str(year): count for year, count in sorted(temporal["ausencia"].valid_by_year.items())
            },
            "distinct_participants_by_year": annual_participant_counts["ausencia"],
        },
        "leave": {
            "source_table": "licencia",
            "valid_rows": temporal["licencia"].valid_rows,
            "quarantine_rows": temporal["licencia"].quarantine_rows,
            "valid_reported_days": float(license_days),
            "valid_by_year": {
                str(year): count for year, count in sorted(temporal["licencia"].valid_by_year.items())
            },
            "distinct_participants_by_year": annual_participant_counts["licencia"],
        },
        "movements": {
            "source_table": "legamov",
            "valid_rows": temporal["legamov"].valid_rows,
            "quarantine_rows": temporal["legamov"].quarantine_rows,
            "valid_by_year": {
                str(year): count for year, count in sorted(temporal["legamov"].valid_by_year.items())
            },
            "distinct_participants_by_year": annual_participant_counts["legamov"],
        },
        "coverage": {
            "legajo_rows": table_rows.get("legajo", 0),
            "unique_legajo_keys": len(employee_keys),
            "facts": coverage_facts,
        },
        "quality": {
            "score": round(float(quality_score), 2),
            "score_scope": "governed aggregate extract, not fitness of every raw GRH table",
            "components": {
                name: {
                    "score": round(float(component_values[name] * 100), 2),
                    "weight_pct": int(component_weights[name] * 100),
                    **({"basis": "calculo versus totpago run-level controls"}
                       if name == "payroll_reconciliation" else {}),
                }
                for name in component_weights
            },
            "risk_flags": {
                "raw_source_contains_sensitive_pii": True,
                "historical_snapshot_not_realtime": True,
                "currency_not_declared_in_source": True,
                "legacy_import_error_rows": table_rows.get("errorimportacion", 0),
                "quarantined_temporal_rows": sum(item.quarantine_rows for item in temporal.values()),
                "totpago_cross_source_mismatch": cross_source_score < 100,
                "calculation_control_anomalous_periods": calculation_control_anomalous_periods,
                "latest_calculation_control_within_rounding_tolerance": (
                    latest_calculation_control["control_identity_within_rounding_tolerance"]
                ),
                "suspicious_text_encoding_labels": suspicious_text_encoding_labels,
            },
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the GRH .sql.gz dump")
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-semantic.json"))
    parser.add_argument("--as-of", type=dt.date.fromisoformat)
    parser.add_argument("--min-year", type=int, default=DEFAULT_MIN_YEAR)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
        help="Manifiesto aprobado que fija nombre, hash, tamaño y snapshot del backup GRH",
    )
    parser.add_argument(
        "--generated-at",
        type=parse_generated_at,
        help="Optional deterministic generation timestamp (ISO-8601)",
    )
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    if args.as_of is not None and args.as_of.isoformat() != manifest["snapshot_as_of"]:
        raise ValueError("--as-of no puede contradecir el snapshot del manifiesto GRH")
    result = build_semantic_layer(
        args.source,
        as_of=args.as_of,
        min_year=args.min_year,
        generated_at=args.generated_at,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "out": str(args.out),
        "tables": result["table_dictionary"]["total_tables"],
        "rows": result["table_dictionary"]["total_rows"],
        "quality_score": result["quality"]["score"],
        "contains_pii": result["privacy"]["contains_pii"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
