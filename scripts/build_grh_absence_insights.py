#!/usr/bin/env python3
"""Build the aggregate-only GRH absence insights contract.

The generator streams only ``ausencia`` and its catalogue ``motause`` from
the approved compressed backup. Employee keys are used transiently to count
distinct people and are never serialized. The legacy ``licencia`` table is
deliberately not folded into these metrics: it is a different historical
source and must remain labelled separately in the product.
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
except ImportError:  # Direct execution: python scripts/build_grh_absence_insights.py
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


SCHEMA_VERSION = "grh-absence-insights-v1"
GENERATED_AT = "2026-08-13T00:00:00.000Z"
MINIMUM_YEAR = 1979
PRIVACY_THRESHOLD = 10
TARGET_TABLES = {"ausencia", "motause"}
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

# Reviewed municipal wording. Source descriptions are intentionally not
# copied verbatim: some are abbreviated legacy labels and some expose more
# medical detail than an aggregate executive view needs.
MUNICIPAL_LABELS = {
    2: "Accidentes de trabajo",
    3: "Paternidad",
    4: "Matrimonio",
    5: "Salud con familiar a cargo · antigüedad mayor a 5 años",
    6: "Fallecimiento de familiar",
    7: "Fallecimiento de hermano o hermana",
    8: "Exámenes y cursos",
    9: "Donación de sangre",
    10: "Cuidado de familiar enfermo",
    11: "Razones particulares",
    12: "Protección por maternidad",
    14: "Cursos técnicos y profesionales",
    15: "Protección por maternidad · registro legado",
    16: "Razones particulares sin goce de haberes",
    17: "Compensación de horas trabajadas",
    18: "Permiso gremial",
    20: "Inasistencias",
    21: "Descanso anual",
    22: "Períodos inactivos",
    30: "Descanso anual con régimen de riesgo",
    31: "Salud con familiar a cargo · antigüedad menor a 5 años",
    32: "Salud sin familiar a cargo · antigüedad menor a 5 años",
    33: "Salud sin familiar a cargo · antigüedad mayor a 5 años",
    36: "Estudio médico preventivo",
}

CANONICAL_CONTROLS = {
    "rawAbsenceRows": 31_572,
    "validAbsenceRows": 31_559,
    "quarantinedRows": 13,
    "validReportedDays": 395_559,
    "motiveCatalogEntries": 27,
    "current": {"events": 5_936, "people": 752, "days": 65_847},
    "prior": {"events": 3_395, "people": 662, "days": 52_190},
    "publishedEvents": {"current": 5_885, "prior": 3_368},
}

LIMITS = [
    {
        "code": "historical_snapshot_not_realtime",
        "text": "La información corresponde al respaldo del 6 de agosto de 2026; no se actualiza en tiempo real.",
    },
    {
        "code": "absence_records_not_all_leave",
        "text": "Estos son registros de ausencia. No todos representan una licencia y no describen por sí solos la situación laboral de una persona.",
    },
    {
        "code": "legacy_leave_kept_separate",
        "text": "La tabla histórica de licencias se mantiene separada y no se suma a estos motivos de ausencia.",
    },
    {
        "code": "equal_periods_not_causes",
        "text": "La comparación usa dos períodos de 972 días. Muestra diferencias registradas, pero no explica sus causas ni evalúa gestiones.",
    },
    {
        "code": "small_groups_are_combined",
        "text": "Los motivos con menos de 10 personas se reúnen en Otros motivos para evitar identificar situaciones individuales.",
    },
]


def _period_dates(period: dict[str, Any]) -> tuple[dt.date, dt.date]:
    return dt.date.fromisoformat(period["startDate"]), dt.date.fromisoformat(period["endDate"])


def _empty_stats() -> dict[str, Any]:
    return {"events": 0, "people": set(), "days": 0}


def _released_metrics(stats: dict[str, Any]) -> dict[str, Any]:
    people = len(stats["people"])
    released = people == 0 or people >= PRIVACY_THRESHOLD
    return {
        "privacyStatus": "released" if released else "protected",
        "events": int(stats["events"]) if released else None,
        "people": people if released else None,
        "days": int(stats["days"]) if released else None,
    }


def _exact_metrics(stats: dict[str, Any]) -> dict[str, Any]:
    return {
        "privacyStatus": "released",
        "events": int(stats["events"]),
        "people": len(stats["people"]),
        "days": int(stats["days"]),
    }


def _delta(current: dict[str, Any], prior: dict[str, Any]) -> dict[str, int | None]:
    if current["privacyStatus"] != "released" or prior["privacyStatus"] != "released":
        return {"events": None, "people": None, "days": None}
    return {
        key: int(current[key]) - int(prior[key])
        for key in ("events", "people", "days")
    }


def _assert_canonical_controls(result: dict[str, Any]) -> None:
    summary = result["summary"]
    for key in (
        "rawAbsenceRows", "validAbsenceRows", "quarantinedRows",
        "validReportedDays", "motiveCatalogEntries",
    ):
        if summary[key] != CANONICAL_CONTROLS[key]:
            raise ValueError(f"Control canónico de ausencias no conciliado: {key}")
    for period_key in ("current", "prior"):
        observed = result["comparison"][period_key]
        if observed != CANONICAL_CONTROLS[period_key]:
            raise ValueError(f"Control canónico de período no conciliado: {period_key}")
        coverage = result["coverage"][period_key]
        if coverage["publishedCategoryEvents"] != CANONICAL_CONTROLS["publishedEvents"][period_key]:
            raise ValueError(f"Cobertura canónica de motivos no conciliada: {period_key}")


def build_absence_insights(
    source: Path,
    manifest: dict[str, Any],
    *,
    enforce_canonical_controls: bool = False,
) -> dict[str, Any]:
    """Stream the approved source and return only governed aggregates."""
    snapshot = dt.date.fromisoformat(manifest["snapshot_as_of"])
    if snapshot.isoformat() != PERIODS["current"]["endDate"]:
        raise ValueError("El corte del manifiesto no coincide con los períodos gobernados")
    for period in PERIODS.values():
        start, end = _period_dates(period)
        if (end - start).days + 1 != period["days"]:
            raise ValueError("Los períodos gobernados no conservan igual duración")

    schemas: dict[str, TableSchema] = {}
    current_table: str | None = None
    raw_absence_rows = 0
    valid_absence_rows = 0
    valid_reported_days = 0
    catalogue: dict[int, str] = {}
    # Only valid date, transient employee key, reason code and non-sensitive
    # day count are held. No name, document or person record is read.
    events: list[tuple[dt.date, tuple[int | None, int | None], int | None, int]] = []

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
                {"CODI_01", "LEGA_12", "FAUS_20", "CODI_21", "DIAS_24"}
                if table_name == "ausencia" else {"CODI_21", "DETA_21"}
            )
            if not required.issubset(columns):
                raise ValueError(f"Estructura requerida ausente en {table_name}")
            expected_rows = count_insert_rows(values_text)
            parsed_rows = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_rows += 1
                row = {columns[index]: raw_row[index] for index in range(min(len(columns), len(raw_row)))}
                if table_name == "motause":
                    code = parse_int(row.get("CODI_21"))
                    label = " ".join(str(row.get("DETA_21") or "").split())
                    if code is None or not label:
                        raise ValueError("El catálogo motause contiene una clave o descripción inválida")
                    if code in catalogue and catalogue[code] != label:
                        raise ValueError("El catálogo motause contiene códigos contradictorios")
                    catalogue[code] = label
                    continue

                raw_absence_rows += 1
                reasons, event_date = date_reasons(
                    row.get("FAUS_20"), min_year=MINIMUM_YEAR, as_of=snapshot,
                )
                if reasons or event_date is None:
                    continue
                days = parse_int(row.get("DIAS_24"))
                if days is None or days < 0:
                    raise ValueError("Una ausencia temporalmente válida no tiene días utilizables")
                company = parse_int(row.get("CODI_01"))
                employee = parse_int(row.get("LEGA_12"))
                employee_key = (company, employee)
                if not valid_employee_key(employee_key):
                    # It remains a valid temporal row in the source totals, but
                    # cannot contribute a reliable distinct-person count.
                    employee_key = (company, employee)
                valid_absence_rows += 1
                valid_reported_days += days
                events.append((event_date, employee_key, parse_int(row.get("CODI_21")), days))
            if parsed_rows != expected_rows:
                raise ValueError(f"Row parser mismatch for {table_name}: counted {expected_rows}, parsed {parsed_rows}")

    if not catalogue or raw_absence_rows == 0:
        raise ValueError("El backup no contiene las fuentes de ausencia requeridas")

    stats: dict[str, collections.defaultdict[int | None, dict[str, Any]]] = {
        key: collections.defaultdict(_empty_stats) for key in PERIODS
    }
    totals: dict[str, dict[str, Any]] = {key: _empty_stats() for key in PERIODS}
    for event_date, employee_key, reason_code, days in events:
        for period_key, period in PERIODS.items():
            start, end = _period_dates(period)
            if not start <= event_date <= end:
                continue
            reason = stats[period_key][reason_code]
            reason["events"] += 1
            reason["people"].add(employee_key)
            reason["days"] += days
            total = totals[period_key]
            total["events"] += 1
            total["people"].add(employee_key)
            total["days"] += days

    all_codes = set(stats["current"]) | set(stats["prior"])
    visible_codes: list[int] = []
    for code in all_codes:
        if code is None:
            continue
        if code not in MUNICIPAL_LABELS:
            if any(len(stats[key][code]["people"]) >= PRIVACY_THRESHOLD for key in PERIODS):
                raise ValueError(f"Un motivo publicable no tiene etiqueta municipal revisada: {code}")
            continue
        if any(len(stats[key][code]["people"]) >= PRIVACY_THRESHOLD for key in PERIODS):
            visible_codes.append(code)

    categories = []
    protected_stats = {key: _empty_stats() for key in PERIODS}
    published_events = {key: 0 for key in PERIODS}
    for period_key in PERIODS:
        for code in all_codes:
            source_stats = stats[period_key][code]
            people_count = len(source_stats["people"])
            if 0 < people_count < PRIVACY_THRESHOLD:
                target = protected_stats[period_key]
                target["events"] += source_stats["events"]
                target["people"].update(source_stats["people"])
                target["days"] += source_stats["days"]
            else:
                published_events[period_key] += source_stats["events"]

    for code in sorted(visible_codes):
        current = _released_metrics(stats["current"][code])
        prior = _released_metrics(stats["prior"][code])
        categories.append({
            "key": f"reason_{code:02d}",
            "label": MUNICIPAL_LABELS[code],
            "meaning": "Motivo del catálogo municipal aplicado a registros de ausencia.",
            "current": current,
            "prior": prior,
            "deltas": _delta(current, prior),
        })

    protected_current = _exact_metrics(protected_stats["current"])
    protected_prior = _exact_metrics(protected_stats["prior"])
    comparison_current = {
        "events": int(totals["current"]["events"]),
        "people": len(totals["current"]["people"]),
        "days": int(totals["current"]["days"]),
    }
    comparison_prior = {
        "events": int(totals["prior"]["events"]),
        "people": len(totals["prior"]["people"]),
        "days": int(totals["prior"]["days"]),
    }
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "canonicalSystem": manifest["canonical_system"],
            "sourceFile": manifest["source_file"],
            "sourceSha256": manifest["sha256"],
            "snapshotAsOf": manifest["snapshot_as_of"],
            # Fixed by this versioned analytical build, so regenerating from
            # the same approved source remains byte-for-byte reproducible.
            "generatedAt": GENERATED_AT,
            "realtime": False,
            "tables": {
                "absenceRecords": "ausencia",
                "absenceReasons": "motause",
                "historicalLeave": "licencia",
            },
        },
        "privacy": {
            "status": "released_with_protected_bucket",
            "threshold": PRIVACY_THRESHOLD,
            "aggregateOnly": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "rawRowsExported": False,
            "sourceCauseLabelsExported": False,
        },
        "summary": {
            "rawAbsenceRows": raw_absence_rows,
            "validAbsenceRows": valid_absence_rows,
            "quarantinedRows": raw_absence_rows - valid_absence_rows,
            "validReportedDays": valid_reported_days,
            "motiveCatalogEntries": len(catalogue),
        },
        "periods": PERIODS,
        "comparison": {
            "current": comparison_current,
            "prior": comparison_prior,
            "deltas": {
                key: comparison_current[key] - comparison_prior[key]
                for key in ("events", "people", "days")
            },
        },
        "categories": categories,
        "protectedBucket": {
            "key": "other_protected_motives",
            "label": "Otros motivos",
            "meaning": "Suma de motivos que, por separado, alcanzan a menos de 10 personas.",
            "current": protected_current,
            "prior": protected_prior,
            "deltas": _delta(protected_current, protected_prior),
        },
        "coverage": {
            key: {
                "totalEvents": int(totals[key]["events"]),
                "publishedCategoryEvents": published_events[key],
                "protectedEvents": int(protected_stats[key]["events"]),
                "coveragePct": 100,
            }
            for key in PERIODS
        },
        "limits": LIMITS,
    }
    if enforce_canonical_controls:
        _assert_canonical_controls(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the approved GRH .sql.gz dump")
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-absence-insights.json"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
    )
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    result = build_absence_insights(args.source, manifest, enforce_canonical_controls=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "out": str(args.out),
        "schema": result["schemaVersion"],
        "valid_absence_rows": result["summary"]["validAbsenceRows"],
        "categories": len(result["categories"]),
        "contains_pii": result["privacy"]["containsPii"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
