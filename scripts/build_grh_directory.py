#!/usr/bin/env python3
"""Build the private, person-level GRH directory contract.

The source is streamed from the approved compressed MySQL dump. Only the
minimum fields required for an institutional read-only directory are retained;
documents, tax identifiers, addresses, contact details, bank data, salary and
event causes are deliberately neither serialized nor logged.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:
    from .build_grh_semantic import (
        COLUMN_RE,
        CREATE_RE,
        INSERT_RE,
        TableSchema,
        canonical_utc_timestamp,
        count_insert_rows,
        date_reasons,
        parse_date,
        parse_generated_at,
        parse_int,
        parse_sql_tuples,
        period_reasons,
        valid_employee_key,
    )
    from .grh_source_manifest import load_and_validate_canonical_source
except ImportError:  # Direct execution: python scripts/build_grh_directory.py
    from build_grh_semantic import (
        COLUMN_RE,
        CREATE_RE,
        INSERT_RE,
        TableSchema,
        canonical_utc_timestamp,
        count_insert_rows,
        date_reasons,
        parse_date,
        parse_generated_at,
        parse_int,
        parse_sql_tuples,
        period_reasons,
        valid_employee_key,
    )
    from grh_source_manifest import load_and_validate_canonical_source


SCHEMA_VERSION = "grh-directory-v2"
DEFAULT_MIN_YEAR = 1979
TARGET_TABLES = {
    "persona",
    "legajo",
    "legamov",
    "sectores",
    "costos",
    "organiza",
    "cargo",
    "catego",
    "convenio",
    "histolegajo",
    "ausencia",
    "licencia",
}

# Only explicit aliases are accepted. A new source spelling must be reviewed
# and added here; fuzzy column discovery could silently turn a sensitive field
# into a directory attribute.
COMPANY_FIELDS = ("CODI_01", "EMPRESA", "COMPANY_CODE")
LEGAJO_FIELDS = ("LEGA_12", "LEGAJO")
# The canonical backup exposes IDPERSONA on both persona and legajo. We do not
# inspect or retain document numbers as a fallback join key.
PERSON_ID_FIELDS = ("IDPERSONA", "ID_PERSONA", "PERS_12", "IDPE_12")
FULL_NAME_FIELDS = ("NOMB_12", "NOMB_10", "NOMB_42", "NOMBRE", "NOMB", "RAZO_10")
FIRST_NAME_FIELDS = ("NOM1_12", "NOM2_12", "NOMBRES")
SURNAME_FIELDS = ("APEL_12", "APEL_10", "APEL_42", "APELLIDO")
POSITION_RELATION_FIELDS = {
    "parent": ("PADREID",),
    "depends_on": ("DEPENDEID",),
}


@dataclass(frozen=True)
class ReferenceSpec:
    table: str
    output: str
    assignment_fields: tuple[str, ...]
    code_fields: tuple[str, ...]
    label_fields: tuple[str, ...]
    company_scoped: bool = True
    scope_fields: tuple[str, ...] = ()


REFERENCE_SPECS = (
    ReferenceSpec("sectores", "sector", ("CODI_07", "SECT_12"), ("CODI_07",), ("DETA_07", "ABRE_07")),
    ReferenceSpec("costos", "cost_center", ("CODI_06",), ("CODI_06",), ("DETA_06",)),
    ReferenceSpec("organiza", "organization", ("IDORGANIZA",), ("IDORGANIZA",), ("N1_DESC", "N1_ABRE")),
    ReferenceSpec("cargo", "position", ("CARGOID",), ("CARGOID",), ("DENOCARGO",)),
    ReferenceSpec(
        "catego",
        "category",
        ("CODI_10",),
        ("CODI_10",),
        ("DETA_10", "ABRE_10"),
        scope_fields=("CODI_02",),
    ),
    ReferenceSpec("convenio", "agreement", ("CODI_02", "CONV_12"), ("CODI_02",), ("DETA_02", "ABRE_02", "NOMB_02"), False),
)
REFERENCE_BY_TABLE = {spec.table: spec for spec in REFERENCE_SPECS}


def first_value(row: dict[str, str | None], fields: Iterable[str]) -> str | None:
    for field in fields:
        value = row.get(field)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def normalized_text(value: str | None, *, maximum: int = 200) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(re.sub(r"[\x00-\x1f\x7f]", " ", str(value)).split())
    if not cleaned:
        return None
    return cleaned[:maximum]


def display_name(row: dict[str, str | None]) -> str | None:
    full = normalized_text(first_value(row, FULL_NAME_FIELDS))
    if full:
        return full
    first = normalized_text(first_value(row, FIRST_NAME_FIELDS))
    surname = normalized_text(first_value(row, SURNAME_FIELDS))
    return normalized_text(" ".join(part for part in (surname, first) if part))


def company_code(row: dict[str, str | None]) -> int | None:
    return parse_int(first_value(row, COMPANY_FIELDS))


def person_links(row: dict[str, str | None]) -> list[tuple[int | None, int]]:
    company = company_code(row)
    person_id = parse_int(first_value(row, PERSON_ID_FIELDS))
    return [(company, person_id)] if person_id is not None and person_id > 0 else []


def reference_code(row: dict[str, str | None], fields: Iterable[str]) -> int | None:
    return parse_int(first_value(row, fields))


def reference_label(row: dict[str, str | None], fields: Iterable[str]) -> str | None:
    return normalized_text(first_value(row, fields))


def empty_event_summary() -> dict[str, object]:
    return {"count": 0, "latest_start": None, "latest_end": None}


def record_event(summary: dict[str, object], start: dt.date, end: dt.date | None = None) -> None:
    summary["count"] = int(summary["count"]) + 1
    start_value = start.isoformat()
    if summary["latest_start"] is None or start_value > str(summary["latest_start"]):
        summary["latest_start"] = start_value
        summary["latest_end"] = end.isoformat() if end is not None else None
    elif start_value == summary["latest_start"] and end is not None:
        end_value = end.isoformat()
        if summary["latest_end"] is None or end_value > str(summary["latest_end"]):
            summary["latest_end"] = end_value


def source_leave_days(value: str | None) -> int | None:
    days = parse_int(value)
    return days if days is not None and days >= 0 else None


def positive_relation_code(row: dict[str, str | None], fields: Iterable[str]) -> int | None:
    value = reference_code(row, fields)
    return value if value is not None and value > 0 else None


def resolve_reference(
    references: dict[str, dict[tuple[int | None, int, int], dict[str, object]]],
    output: str,
    company: int,
    code: int | None,
    scope: int = 0,
) -> dict[str, object] | None:
    if code is None:
        return None
    values = references[output]
    value = values.get((company, scope, code))
    if value is None and output != "cost_center":
        value = values.get((None, scope, code))
    label = value.get("label") if value else None
    if output != "position":
        return {"code": code, "label": label}

    def relation(name: str) -> dict[str, object] | None:
        relation_code = value.get(name) if value else None
        if not isinstance(relation_code, int) or relation_code <= 0:
            return None
        relation_value = values.get((company, 0, relation_code)) or values.get((None, 0, relation_code))
        return {
            "code": relation_code,
            "label": relation_value.get("label") if relation_value else None,
        }

    return {
        "code": code,
        "label": label,
        "parent": relation("parent"),
        "depends_on": relation("depends_on"),
    }


def build_directory(
    source: Path,
    *,
    manifest_path: Path = Path("config/grh-source-manifest.json"),
    generated_at: dt.datetime | None = None,
    min_year: int = DEFAULT_MIN_YEAR,
) -> dict[str, object]:
    manifest = load_and_validate_canonical_source(source, manifest_path)
    as_of = dt.date.fromisoformat(manifest["snapshot_as_of"])
    if min_year > as_of.year:
        raise ValueError("min_year must not be after the snapshot year")

    schemas: dict[str, TableSchema] = {}
    current_table: str | None = None
    legajos: dict[tuple[int, int], dict[str, object]] = {}
    people_by_link: dict[tuple[int | None, int], str] = {}
    ambiguous_global_person_ids: set[int] = set()
    duplicate_person_links = 0
    references: dict[str, dict[tuple[int | None, int, int], dict[str, object]]] = {
        spec.output: {} for spec in REFERENCE_SPECS
    }
    absence_by_employee: dict[tuple[int, int], dict[str, object]] = collections.defaultdict(empty_event_summary)
    absence_history_by_employee: dict[tuple[int, int], list[dict[str, object]]] = collections.defaultdict(list)
    leave_by_employee: dict[tuple[int, int], dict[str, object]] = collections.defaultdict(empty_event_summary)
    leave_history_by_employee: dict[tuple[int, int], list[dict[str, object]]] = collections.defaultdict(list)
    movement_periods_by_employee: dict[tuple[int, int], collections.Counter[str]] = collections.defaultdict(collections.Counter)
    position_observation_by_employee: dict[tuple[int, int], dict[str, object]] = {}
    source_counts = collections.Counter()
    valid_event_counts = collections.Counter()
    quarantine_event_counts = collections.Counter()
    directory_quality_counts = collections.Counter()

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
            insert_count = count_insert_rows(values_text)
            source_counts[table_name] += insert_count
            schema_columns = schemas.get(table_name, TableSchema(table_name)).columns
            columns = (
                [item.strip().strip("`") for item in explicit_columns.split(",")]
                if explicit_columns else schema_columns
            )
            parsed_count = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_count += 1
                row = {columns[index]: raw_row[index] for index in range(min(len(columns), len(raw_row)))}

                if table_name == "persona":
                    name = display_name(row)
                    if name:
                        for link in person_links(row):
                            previous = people_by_link.get(link)
                            if previous is not None and previous != name:
                                raise ValueError("Conflicting company+IDPERSONA link in canonical GRH source")
                            people_by_link[link] = name
                            person_id = link[1]
                            global_link = (None, person_id)
                            global_name = people_by_link.get(global_link)
                            if global_name is not None and global_name != name:
                                ambiguous_global_person_ids.add(person_id)
                                people_by_link.pop(global_link, None)
                            elif person_id not in ambiguous_global_person_ids:
                                people_by_link[global_link] = name
                    continue

                if table_name == "legajo":
                    company = company_code(row)
                    employee = parse_int(first_value(row, LEGAJO_FIELDS))
                    if not valid_employee_key((company, employee)):
                        directory_quality_counts["invalid_employee_key_rows"] += 1
                        continue
                    key = (int(company), int(employee))
                    if key in legajos:
                        raise ValueError("Duplicate company+legajo key in canonical GRH source")
                    assignments = {
                        spec.output: reference_code(row, spec.assignment_fields)
                        for spec in REFERENCE_SPECS
                    }
                    legajos[key] = {
                        "source_name": display_name(row),
                        "person_links": person_links(row),
                        "assignments": assignments,
                    }
                    continue

                if table_name == "histolegajo":
                    company = company_code(row)
                    employee = parse_int(first_value(row, LEGAJO_FIELDS))
                    if not valid_employee_key((company, employee)):
                        directory_quality_counts["quarantined_position_observation_rows"] += 1
                        continue
                    label = normalized_text(row.get("CARGO"))
                    if not label:
                        directory_quality_counts["blank_position_observation_rows"] += 1
                        continue
                    observed_date = parse_date(row.get("FECA_31"))
                    period_year = parse_int(row.get("PERI_31"))
                    period_month = parse_int(row.get("MES_31"))
                    if (
                        observed_date is None
                        or period_year is None
                        or period_month is None
                        or not 1 <= period_month <= 12
                        or observed_date.year != period_year
                        or observed_date.month != period_month
                    ):
                        directory_quality_counts["quarantined_position_observation_rows"] += 1
                        continue
                    status = (
                        "source_future_effective"
                        if observed_date > as_of
                        else "historical_observation"
                    )
                    candidate = {
                        "label": label,
                        "observed_date": observed_date.isoformat(),
                        "observed_period": f"{period_year:04d}-{period_month:02d}",
                        "status": status,
                        "source_table": "histolegajo",
                    }
                    key = (int(company), int(employee))
                    previous = position_observation_by_employee.get(key)
                    candidate_order = (candidate["observed_date"], candidate["observed_period"])
                    previous_order = (
                        (previous["observed_date"], previous["observed_period"])
                        if previous
                        else None
                    )
                    if previous_order == candidate_order and previous["label"] != label:
                        raise ValueError("Conflicting position observation in canonical GRH source")
                    if previous_order is None or candidate_order > previous_order:
                        position_observation_by_employee[key] = candidate
                    directory_quality_counts["valid_position_observation_rows"] += 1
                    if status == "source_future_effective":
                        directory_quality_counts["future_effective_position_observation_rows"] += 1
                    continue

                reference_spec = REFERENCE_BY_TABLE.get(table_name)
                if reference_spec:
                    code = reference_code(row, reference_spec.code_fields)
                    label = reference_label(row, reference_spec.label_fields)
                    company = company_code(row) if reference_spec.company_scoped else None
                    scope = reference_code(row, reference_spec.scope_fields) if reference_spec.scope_fields else 0
                    if code is not None and label:
                        reference_value: dict[str, object] = {"label": label}
                        if reference_spec.output == "position":
                            reference_value.update({
                                name: positive_relation_code(row, fields)
                                for name, fields in POSITION_RELATION_FIELDS.items()
                            })
                        if scope is None:
                            continue
                        key = (company, scope, code)
                        previous = references[reference_spec.output].get(key)
                        if previous is not None and previous != reference_value:
                            raise ValueError(
                                f"Conflicting {reference_spec.output} reference in canonical GRH source"
                            )
                        references[reference_spec.output][key] = reference_value
                    continue

                company = company_code(row)
                employee = parse_int(first_value(row, LEGAJO_FIELDS))
                if not valid_employee_key((company, employee)):
                    quarantine_event_counts[table_name] += 1
                    continue
                key = (int(company), int(employee))
                if table_name == "ausencia":
                    reasons, start = date_reasons(row.get("FAUS_20"), min_year=min_year, as_of=as_of)
                    if reasons or start is None:
                        quarantine_event_counts[table_name] += 1
                    else:
                        valid_event_counts[table_name] += 1
                        record_event(absence_by_employee[key], start)
                        absence_history_by_employee[key].append({
                            "date": start.isoformat(),
                            "days": source_leave_days(row.get("DIAS_24")),
                        })
                elif table_name == "legamov":
                    reasons, year, month, _ = period_reasons(
                        row.get("ANO_30"),
                        row.get("MES_30"),
                        None,
                        min_year=min_year,
                        as_of=as_of,
                        require_date=False,
                    )
                    if reasons or year is None or month is None:
                        quarantine_event_counts[table_name] += 1
                    else:
                        valid_event_counts[table_name] += 1
                        movement_periods_by_employee[key][f"{year:04d}-{month:02d}"] += 1
                else:  # licencia
                    reasons, start = date_reasons(row.get("FINI_24"), min_year=min_year, as_of=as_of)
                    end = parse_date(row.get("FFIN_24"))
                    if row.get("FFIN_24") and end is None:
                        reasons.append("end_date_invalid")
                    elif start and end and end < start:
                        reasons.append("end_date_before_start")
                    elif end and end > as_of:
                        reasons.append("end_date_after_snapshot")
                    if reasons or start is None:
                        quarantine_event_counts[table_name] += 1
                    else:
                        valid_event_counts[table_name] += 1
                        record_event(leave_by_employee[key], start, end)
                        leave_history_by_employee[key].append({
                            "start_date": start.isoformat(),
                            "end_date": end.isoformat() if end is not None else None,
                            "days": source_leave_days(row.get("DIAS_24")),
                        })

            if parsed_count != insert_count:
                raise ValueError(
                    f"Row parser mismatch for {table_name}: counted {insert_count}, parsed {parsed_count}"
                )

    records = []
    join_counts = collections.Counter()
    for (company, employee), raw in sorted(legajos.items()):
        matched_name = None
        for link in raw["person_links"]:
            matched_name = people_by_link.get(link)
            if not matched_name:
                person_id = link[1]
                if person_id in ambiguous_global_person_ids:
                    raise ValueError("Ambiguous global IDPERSONA fallback in canonical GRH source")
                matched_name = people_by_link.get((None, person_id))
            if matched_name:
                break
        if matched_name:
            join_counts["person_matched"] += 1
        source_name = raw["source_name"]
        name = matched_name or source_name
        if name:
            join_counts["with_name"] += 1
        else:
            join_counts["without_name"] += 1
        assignments = raw["assignments"]
        absence = absence_by_employee.get((company, employee), empty_event_summary())
        absence_history = sorted(
            absence_history_by_employee.get((company, employee), []),
            key=lambda event: (
                str(event["date"]),
                int(event["days"]) if event["days"] is not None else -1,
            ),
            reverse=True,
        )
        leave = leave_by_employee.get((company, employee), empty_event_summary())
        leave_history = sorted(
            leave_history_by_employee.get((company, employee), []),
            key=lambda event: (
                str(event["start_date"]),
                str(event["end_date"] or ""),
                int(event["days"]) if event["days"] is not None else -1,
            ),
            reverse=True,
        )
        movement_history = [
            {"period": period, "row_count": count}
            for period, count in sorted(
                movement_periods_by_employee.get((company, employee), {}).items(),
                reverse=True,
            )
        ]
        movement_row_count = sum(item["row_count"] for item in movement_history)
        records.append({
            "company_code": company,
            "legajo": employee,
            "display_name": name,
            **{
                spec.output: resolve_reference(
                    references,
                    spec.output,
                    company,
                    assignments[spec.output],
                    assignments["agreement"] if spec.output == "category" else 0,
                )
                for spec in REFERENCE_SPECS
            },
            "absence": {
                "event_count": absence["count"],
                "latest_date": absence["latest_start"],
            },
            "absence_history": absence_history,
            "leave": {
                "event_count": leave["count"],
                "latest_start_date": leave["latest_start"],
                "latest_end_date": leave["latest_end"],
            },
            "leave_history": leave_history,
            "movement": {
                "row_count": movement_row_count,
                "period_count": len(movement_history),
                "latest_period": movement_history[0]["period"] if movement_history else None,
            },
            "movement_history": movement_history,
            "position_observation": position_observation_by_employee.get((company, employee)),
        })

    return {
        "schema_version": SCHEMA_VERSION,
        "source": {
            "canonical_system": manifest["canonical_system"],
            "file": manifest["source_file"],
            "sha256": manifest["sha256"],
            "compressed_size_bytes": manifest["compressed_size_bytes"],
            "snapshot_as_of": manifest["snapshot_as_of"],
            "generated_at": canonical_utc_timestamp(generated_at or dt.datetime.now(dt.timezone.utc)),
        },
        "privacy": {
            "contains_personal_data": True,
            "private_storage_required": True,
            "excluded_fields": [
                "dni", "cuil", "contact", "address", "bank_account", "salary", "event_cause"
            ],
        },
        "counts": {
            "source_rows": {name: source_counts[name] for name in sorted(TARGET_TABLES)},
            "directory_records": len(records),
            "person_matches": join_counts["person_matched"],
            "records_with_name": join_counts["with_name"],
            "records_without_name": join_counts["without_name"],
            "duplicate_person_links": duplicate_person_links,
            "invalid_employee_key_rows": directory_quality_counts["invalid_employee_key_rows"],
            "valid_absence_events": valid_event_counts["ausencia"],
            "quarantined_absence_events": quarantine_event_counts["ausencia"],
            "valid_leave_events": valid_event_counts["licencia"],
            "quarantined_leave_events": quarantine_event_counts["licencia"],
            "valid_movement_rows": valid_event_counts["legamov"],
            "quarantined_movement_rows": quarantine_event_counts["legamov"],
            "valid_position_observation_rows": directory_quality_counts["valid_position_observation_rows"],
            "blank_position_observation_rows": directory_quality_counts["blank_position_observation_rows"],
            "quarantined_position_observation_rows": directory_quality_counts[
                "quarantined_position_observation_rows"
            ],
            "future_effective_position_observation_rows": directory_quality_counts[
                "future_effective_position_observation_rows"
            ],
            "records_with_position_observation": sum(
                1 for record in records if record["position_observation"] is not None
            ),
        },
        "records": records,
    }


def write_private_json(path: Path, payload: dict[str, object]) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(serialized)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.chmod(temporary, 0o600)
        except OSError:
            pass
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the private GRH directory contract")
    parser.add_argument("source", type=Path)
    parser.add_argument("--manifest", type=Path, default=Path("config/grh-source-manifest.json"))
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-directory.json"))
    parser.add_argument("--generated-at", type=parse_generated_at)
    parser.add_argument("--min-year", type=int, default=DEFAULT_MIN_YEAR)
    args = parser.parse_args()
    result = build_directory(
        args.source,
        manifest_path=args.manifest,
        generated_at=args.generated_at,
        min_year=args.min_year,
    )
    write_private_json(args.out, result)
    print(f"Directorio GRH privado generado: {result['counts']['directory_records']} registros.")


if __name__ == "__main__":
    main()
