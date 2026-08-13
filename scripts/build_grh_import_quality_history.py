#!/usr/bin/env python3
"""Build the aggregate-only history of GRH import controls.

Only ``errorimportacion`` is streamed from the pinned GRH backup. Source error
texts are used transiently for reviewed classification rules, but neither the
texts nor row/report/person identifiers are serialized into the artifact.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
import unicodedata
from pathlib import Path
from typing import Any

try:
    from .build_grh_semantic import INSERT_RE, parse_int, parse_sql_tuples
    from .grh_source_manifest import load_and_validate_canonical_source
except ImportError:  # Direct execution
    from build_grh_semantic import INSERT_RE, parse_int, parse_sql_tuples
    from grh_source_manifest import load_and_validate_canonical_source


SCHEMA_VERSION = "grh-import-quality-history-v1"
RULE_VERSION = "grh-import-quality-classification-v1"
GENERATED_AT = "2026-08-13T00:00:00.000Z"
TARGET_TABLE = "errorimportacion"
DEFAULT_COLUMNS = (
    "iderror", "idformato", "item", "posicion", "nrolinea", "fecha",
    "error", "nroreporte", "TIPOMENSAJE",
)
CATEGORY_ORDER = (
    "amount_zero",
    "quantity_zero",
    "dni_without_active_legajo",
    "format_or_length",
    "dni_multiple_legajos",
    "other_technical",
)
CATEGORY_COPY = {
    "amount_zero": (
        "Importes informados en cero",
        "Control histórico que marcó un importe con valor cero durante la importación.",
    ),
    "quantity_zero": (
        "Cantidades informadas en cero",
        "Control histórico que marcó una cantidad con valor cero durante la importación.",
    ),
    "dni_without_active_legajo": (
        "Documento sin legajo activo",
        "Control histórico que no pudo vincular un documento con un legajo activo.",
    ),
    "format_or_length": (
        "Formato o longitud no válida",
        "Control histórico que detectó una estructura de campo incompatible con el formato esperado.",
    ),
    "dni_multiple_legajos": (
        "Documento asociado a más de un legajo",
        "Control histórico que encontró más de un legajo para un mismo documento.",
    ),
    "other_technical": (
        "Otros controles técnicos",
        "Resto exhaustivo de validaciones históricas del importador, agrupadas sin publicar mensajes fuente.",
    ),
}
CANONICAL_CONTROLS = {
    "incidents": 1_186_239,
    "importRuns": 4_913,
    "firstEventDate": "2008-10-08",
    "lastEventDate": "2026-08-05",
    "currentPartialIncidents": 59_148,
    "currentPartialRuns": 202,
    "categories": {
        "amount_zero": 603_125,
        "quantity_zero": 410_465,
        "dni_without_active_legajo": 116_954,
        "format_or_length": 24_570,
        "dni_multiple_legajos": 4_806,
        "other_technical": 26_319,
    },
}
LIMITS = (
    {
        "code": "historical_import_controls_not_current_employee_errors",
        "text": "Son controles registrados por importaciones históricas; no describen errores actuales de empleados.",
    },
    {
        "code": "not_platform_availability",
        "text": "La cantidad de incidencias no mide disponibilidad, caídas ni tiempo operativo de la plataforma.",
    },
    {
        "code": "partial_2026_through_last_source_event",
        "text": "El año 2026 es parcial y llega hasta el 5 de agosto, última fecha registrada en la fuente.",
    },
    {
        "code": "incident_not_confirmed_impact",
        "text": "Una incidencia documenta una validación del importador; no confirma por sí sola impacto laboral o económico.",
    },
    {
        "code": "raw_messages_withheld",
        "text": "Los mensajes originales no se publican porque pueden contener documentos personales u otros datos identificatorios.",
    },
)


def _normalize_message(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", (value or "").strip().casefold())
    return "".join(character for character in normalized if not unicodedata.combining(character))


def classify_message(value: str | None) -> str:
    """Classify one source message with deterministic, reviewed precedence."""
    normalized = _normalize_message(value)
    if normalized == "el importe leido es 0":
        return "amount_zero"
    if normalized == "la cantidad leida es 0":
        return "quantity_zero"
    if normalized.startswith("el dni leido") and "no esta asociado" in normalized:
        return "dni_without_active_legajo"
    if normalized.startswith("string index out of range"):
        return "format_or_length"
    if normalized.startswith("existe mas de un legajo asociado al dni"):
        return "dni_multiple_legajos"
    return "other_technical"


def _date(value: str | None) -> dt.date:
    try:
        parsed = dt.date.fromisoformat((value or "")[:10])
    except ValueError as error:
        raise ValueError("errorimportacion contiene una fecha no interpretable") from error
    return parsed


def _ratio(numerator: int, denominator: int) -> float:
    return 0 if denominator == 0 else round(numerator * 100 / denominator, 4)


def _assert_canonical_controls(result: dict[str, Any]) -> None:
    if result["totals"] != {
        "incidents": CANONICAL_CONTROLS["incidents"],
        "importRuns": CANONICAL_CONTROLS["importRuns"],
    }:
        raise ValueError("El total histórico de controles de importación no concilió")
    source = result["source"]
    for field in ("firstEventDate", "lastEventDate"):
        if source[field] != CANONICAL_CONTROLS[field]:
            raise ValueError(f"El rango histórico no concilió: {field}")
    current = result["currentPartial"]
    if current["incidents"] != CANONICAL_CONTROLS["currentPartialIncidents"] or \
            current["importRuns"] != CANONICAL_CONTROLS["currentPartialRuns"]:
        raise ValueError("El corte parcial 2026 no concilió")
    observed_categories = {row["key"]: row["incidents"] for row in result["categories"]}
    if observed_categories != CANONICAL_CONTROLS["categories"]:
        raise ValueError("La clasificación histórica no concilió")


def build_import_quality_history(
    source: Path,
    manifest: dict[str, Any],
    *,
    enforce_canonical_controls: bool,
) -> dict[str, Any]:
    incidents_by_year: collections.Counter[int] = collections.Counter()
    reports_by_year: dict[int, set[int]] = collections.defaultdict(set)
    all_reports: set[int] = set()
    category_counts: collections.Counter[str] = collections.Counter()
    first_event: dt.date | None = None
    last_event: dt.date | None = None
    insert_seen = False

    with gzip.open(source, "rt", encoding="utf-8", errors="replace", newline="") as stream:
        for line in stream:
            insert_match = INSERT_RE.match(line)
            if not insert_match or insert_match.group(1) != TARGET_TABLE:
                continue
            insert_seen = True
            columns = (
                tuple(part.strip().strip("`") for part in insert_match.group(2).split(","))
                if insert_match.group(2)
                else DEFAULT_COLUMNS
            )
            if set(columns) != set(DEFAULT_COLUMNS):
                raise ValueError("Deriva de columnas en errorimportacion")
            for raw_row in parse_sql_tuples(insert_match.group(3)):
                if len(raw_row) != len(columns):
                    raise ValueError("Fila inconsistente en errorimportacion")
                row = dict(zip(columns, raw_row))
                event_date = _date(row["fecha"])
                report = parse_int(row["nroreporte"])
                if report is None or report < 0:
                    raise ValueError("errorimportacion contiene un identificador de lote no válido")
                incidents_by_year[event_date.year] += 1
                reports_by_year[event_date.year].add(report)
                all_reports.add(report)
                category_counts[classify_message(row["error"])] += 1
                first_event = event_date if first_event is None else min(first_event, event_date)
                last_event = event_date if last_event is None else max(last_event, event_date)

    if not insert_seen or first_event is None or last_event is None:
        raise ValueError("El backup no contiene errorimportacion")
    years = list(range(first_event.year, last_event.year + 1))
    if any(incidents_by_year[year] == 0 or not reports_by_year[year] for year in years):
        raise ValueError("La serie anual de errorimportacion contiene huecos")
    total_incidents = sum(incidents_by_year.values())
    if sum(category_counts.values()) != total_incidents:
        raise ValueError("La clasificación no cubre todas las incidencias")
    if sum(len(reports_by_year[year]) for year in years) != len(all_reports):
        raise ValueError("Un lote de importación aparece en más de un año")

    annual = [
        {
            "year": year,
            "incidents": incidents_by_year[year],
            "importRuns": len(reports_by_year[year]),
            "partial": year == last_event.year,
        }
        for year in years
    ]
    categories = [
        {
            "key": key,
            "label": CATEGORY_COPY[key][0],
            "meaning": CATEGORY_COPY[key][1],
            "incidents": category_counts[key],
            "sharePct": _ratio(category_counts[key], total_incidents),
        }
        for key in CATEGORY_ORDER
    ]
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "canonicalSystem": manifest["canonical_system"],
            "sourceFile": manifest["source_file"],
            "sourceSha256": manifest["sha256"],
            "snapshotAsOf": manifest["snapshot_as_of"],
            "generatedAt": GENERATED_AT,
            "realtime": False,
            "table": TARGET_TABLE,
            "firstEventDate": first_event.isoformat(),
            "lastEventDate": last_event.isoformat(),
            "partialThrough": last_event.isoformat(),
        },
        "privacy": {
            "aggregateOnly": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "rawRowsExported": False,
            "rawMessagesExported": False,
        },
        "scope": {
            "unit": "historical_import_control_incident",
            "meaning": "Cada incidencia es un control registrado por el importador histórico de GRH.",
            "notCurrentEmployeeErrors": True,
            "notSystemAvailability": True,
        },
        "totals": {
            "incidents": total_incidents,
            "importRuns": len(all_reports),
        },
        "currentPartial": {
            "year": last_event.year,
            "incidents": incidents_by_year[last_event.year],
            "importRuns": len(reports_by_year[last_event.year]),
            "partial": True,
            "through": last_event.isoformat(),
        },
        "annual": annual,
        "categories": categories,
        "classification": {
            "status": "exhaustive",
            "ruleVersion": RULE_VERSION,
            "classifiedIncidents": sum(category_counts.values()),
            "coveragePct": 100,
        },
        "limits": list(LIMITS),
    }
    if enforce_canonical_controls:
        _assert_canonical_controls(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the approved GRH .sql.gz dump")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("api/_data/grh-import-quality-history.json"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
    )
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    result = build_import_quality_history(
        args.source,
        manifest,
        enforce_canonical_controls=True,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "out": str(args.out),
        "schema": result["schemaVersion"],
        "incidents": result["totals"]["incidents"],
        "import_runs": result["totals"]["importRuns"],
        "contains_pii": result["privacy"]["containsPii"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
