#!/usr/bin/env python3
"""Build the aggregate-only GRH maternal-garden network contract.

The approved compressed backup is streamed directly. Employment keys and
``legajo.IDPERSONA`` are retained only in memory to deduplicate people across
simultaneous labour relationships; neither value is serialized. The public
artifact contains only monthly totals, four k-anonymous garden totals and one
complementary protected bucket.
"""
from __future__ import annotations

import argparse
import calendar
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
        parse_int,
        parse_sql_tuples,
        valid_employee_key,
    )
    from grh_source_manifest import load_and_validate_canonical_source


SCHEMA_VERSION = "grh-garden-network-v1"
ASSIGNMENT_POLICY_VERSION = "grh-garden-network-assignment-v1"
GENERATED_AT = "2026-08-14T00:00:00.000Z"
PRIVACY_THRESHOLD = 10
TREND_MONTHS = 24
COHORT_CODE = 5
TARGET_TABLES = {"calculo", "legajo", "sectores"}
GENERIC_UNIT_LABELS = frozenset({
    "DOCENTES JARDINES MATERNALES",
    "TEMPORARIOS",
})
REVIEWED_GARDEN_LABELS = {
    "AMANECER": "Amanecer",
    "ANGEL DE LA GUARDA": "Ángel de la Guarda",
    "CASITA DE CHOCOLATE": "Casita de Chocolate",
    "CASTILLO DE SUEÑOS": "Castillo de Sueños",
    "COLIBRI": "Colibrí",
    "CORAZONES SALTARINES": "Corazones Saltarines",
    "DEL SOL": "Del Sol",
    "DULCES SONRISAS": "Dulces Sonrisas",
    "ELEFANTE TROMPITA": "Elefante Trompita",
    "LUNA LUNERA": "Luna Lunera",
    "MANITOS DE COLORES": "Manitos de Colores",
    "MI ARCO IRIS": "Mi Arco Iris",
    "MI RINCONCITO": "Mi Rinconcito",
    "PATA GARABATA": "Pata Garabata",
    "PICO PICOTERO": "Pico Picotero",
    "RONDA DE ALEGRIA": "Ronda de Alegría",
}
MONTH_LABELS = (
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
)
FULL_MONTH_LABELS = (
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
)
LIMITS = [
    {
        "code": "historical_snapshot_not_realtime",
        "text": "La información corresponde al respaldo del 6 de agosto de 2026; no se actualiza en tiempo real.",
    },
    {
        "code": "latest_complete_calculation_month",
        "text": "Agosto de 2026 estaba incompleto al corte; el último mes de cálculo comparable es julio de 2026.",
    },
    {
        "code": "calculation_cohort_not_total_staff",
        "text": "La serie cuenta personas con registros de cálculo de la cohorte de Jardines Maternales; no representa por sí sola toda la dotación activa.",
    },
    {
        "code": "person_grain_across_employments",
        "text": "Una persona se cuenta una sola vez aunque tenga más de una clave laboral en el mismo período.",
    },
    {
        "code": "unit_assignment_from_calculation",
        "text": "La unidad surge de la asignación sectorial registrada en el cálculo del período y no reemplaza al organigrama formal.",
    },
    {
        "code": "small_units_are_combined",
        "text": "Los jardines con menos de 10 personas y quienes no tienen una unidad específica se reúnen en un único grupo protegido.",
    },
    {
        "code": "official_locations_not_available",
        "text": "La fuente no aporta domicilios ni geolocalización oficial de los jardines; esta versión no publica ni inventa un mapa.",
    },
    {
        "code": "enrollment_not_available",
        "text": "La fuente no contiene matrícula de niñas y niños por jardín.",
    },
    {
        "code": "capacity_not_available",
        "text": "La fuente no contiene capacidad habilitada ni vacantes por jardín.",
    },
    {
        "code": "attendance_not_available",
        "text": "La fuente no contiene presentismo de niñas, niños ni personal por jardín.",
    },
    {
        "code": "budget_not_available",
        "text": "La fuente no contiene presupuesto ni ejecución de gastos por jardín.",
    },
]

CANONICAL_TREND = (
    ("2024-08", 90), ("2024-09", 91), ("2024-10", 92), ("2024-11", 90),
    ("2024-12", 90), ("2025-01", 90), ("2025-02", 92), ("2025-03", 91),
    ("2025-04", 105), ("2025-05", 107), ("2025-06", 107), ("2025-07", 105),
    ("2025-08", 105), ("2025-09", 106), ("2025-10", 107), ("2025-11", 106),
    ("2025-12", 105), ("2026-01", 106), ("2026-02", 106), ("2026-03", 108),
    ("2026-04", 108), ("2026-05", 109), ("2026-06", 109), ("2026-07", 107),
)
CANONICAL_RELEASED_UNITS = (
    ("Amanecer", 12),
    ("Manitos de Colores", 12),
    ("Del Sol", 11),
    ("Pata Garabata", 10),
)


def _normalize_label(value: Any) -> str | None:
    label = " ".join(str(value or "").split()).upper()
    return label or None


def _previous_complete_month(snapshot: dt.date) -> tuple[int, int]:
    last_day = calendar.monthrange(snapshot.year, snapshot.month)[1]
    if snapshot.day == last_day:
        return snapshot.year, snapshot.month
    previous = snapshot.replace(day=1) - dt.timedelta(days=1)
    return previous.year, previous.month


def _month_sequence(end_year: int, end_month: int, count: int) -> list[str]:
    index = end_year * 12 + end_month - 1
    periods = []
    for offset in range(count - 1, -1, -1):
        value = index - offset
        year, zero_month = divmod(value, 12)
        periods.append(f"{year:04d}-{zero_month + 1:02d}")
    return periods


def _period_label(period: str) -> str:
    year, month = (int(item) for item in period.split("-"))
    return f"{MONTH_LABELS[month - 1]} {year}"


def _share_pct(people: int, total: int) -> float:
    return round((people / total) * 100, 1) if total else 0.0


def _canonical_controls(result: dict[str, Any]) -> None:
    quality = result["quality"]
    summary = result["summary"]
    expected_quality = {
        "latestValidCalculationPeriod": "2026-07",
        "sourceEmploymentKeys": 165,
        "linkedEmploymentKeys": 165,
        "people": 107,
        "observedUnitCount": 16,
        "releasedUnitCount": 4,
    }
    for key, expected in expected_quality.items():
        if quality[key] != expected:
            raise ValueError(f"Control canónico de Jardines Maternales no conciliado: {key}")
    if (
        summary["releasedPeople"] != 45 or
        summary["protectedPeople"] != 62 or
        result["protectedBucket"]["people"] != 62
    ):
        raise ValueError("Control canónico del bucket protegido de jardines no conciliado")
    trend = tuple((row["period"], row["people"]) for row in result["monthlyTrend"])
    if trend != CANONICAL_TREND:
        raise ValueError("Control canónico de tendencia de jardines no conciliado")
    released = tuple((row["label"], row["people"]) for row in result["releasedUnits"])
    if released != CANONICAL_RELEASED_UNITS:
        raise ValueError("Control canónico de unidades liberadas no conciliado")


def build_garden_network(
    source: Path,
    manifest: dict[str, Any],
    *,
    enforce_canonical_controls: bool = False,
) -> dict[str, Any]:
    """Stream the approved source and return the governed aggregate contract."""
    snapshot = dt.date.fromisoformat(manifest["snapshot_as_of"])
    reference_year, reference_month = _previous_complete_month(snapshot)
    reference_period = f"{reference_year:04d}-{reference_month:02d}"
    trend_periods = _month_sequence(reference_year, reference_month, TREND_MONTHS)
    trend_period_set = set(trend_periods)

    schemas: dict[str, TableSchema] = {}
    current_table: str | None = None
    period_keys: dict[str, set[tuple[int | None, int | None]]] = collections.defaultdict(set)
    reference_units: dict[tuple[int | None, int | None], set[tuple[int, int]]] = collections.defaultdict(set)
    person_by_key: dict[tuple[int | None, int | None], int] = {}
    unit_labels: dict[tuple[int, int], str] = {}
    observed_tables: set[str] = set()

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
            observed_tables.add(table_name)
            schema_columns = schemas.get(table_name, TableSchema(table_name)).columns
            columns = (
                [item.strip().strip("`") for item in explicit_columns.split(",")]
                if explicit_columns else schema_columns
            )
            required = {
                "calculo": {"CODI_01", "PERI_31", "MES_31", "LEGA_12", "CODI_02", "CODI_07"},
                "legajo": {"CODI_01", "LEGA_12", "IDPERSONA"},
                "sectores": {"CODI_01", "CODI_07"},
            }[table_name]
            if not required.issubset(columns):
                raise ValueError(f"Estructura requerida ausente en {table_name}")
            if table_name == "sectores" and not ({"DETA_07", "ABRE_07"} & set(columns)):
                raise ValueError("Estructura de etiqueta requerida ausente en sectores")

            expected_rows = count_insert_rows(values_text)
            parsed_rows = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_rows += 1
                row = {
                    columns[index]: raw_row[index]
                    for index in range(min(len(columns), len(raw_row)))
                }
                if table_name == "calculo":
                    if parse_int(row.get("CODI_02")) != COHORT_CODE:
                        continue
                    year = parse_int(row.get("PERI_31"))
                    month = parse_int(row.get("MES_31"))
                    company = parse_int(row.get("CODI_01"))
                    employee = parse_int(row.get("LEGA_12"))
                    employee_key = (company, employee)
                    if (
                        year is None or month is None or not 1 <= month <= 12 or
                        not valid_employee_key(employee_key)
                    ):
                        continue
                    period = f"{year:04d}-{month:02d}"
                    if period not in trend_period_set:
                        continue
                    period_keys[period].add(employee_key)
                    if period == reference_period:
                        sector = parse_int(row.get("CODI_07"))
                        if company is not None and sector is not None:
                            reference_units[employee_key].add((company, sector))
                elif table_name == "legajo":
                    company = parse_int(row.get("CODI_01"))
                    employee = parse_int(row.get("LEGA_12"))
                    person = parse_int(row.get("IDPERSONA"))
                    employee_key = (company, employee)
                    if not valid_employee_key(employee_key) or person is None or person <= 0:
                        continue
                    previous = person_by_key.get(employee_key)
                    if previous is not None and previous != person:
                        raise ValueError("Una clave laboral enlaza a más de un IDPERSONA")
                    person_by_key[employee_key] = person
                else:
                    company = parse_int(row.get("CODI_01"))
                    sector = parse_int(row.get("CODI_07"))
                    label = _normalize_label(row.get("DETA_07") or row.get("ABRE_07"))
                    if company is None or sector is None or label is None:
                        continue
                    unit_key = (company, sector)
                    previous = unit_labels.get(unit_key)
                    if previous is not None and previous != label:
                        raise ValueError("El catálogo de sectores contiene etiquetas contradictorias")
                    unit_labels[unit_key] = label
            if parsed_rows != expected_rows:
                raise ValueError(
                    f"Row parser mismatch for {table_name}: counted {expected_rows}, parsed {parsed_rows}"
                )

    if observed_tables != TARGET_TABLES:
        raise ValueError("El backup no contiene todas las fuentes requeridas para la Red de Jardines")
    if any(not period_keys[period] for period in trend_periods):
        raise ValueError("La fuente no cubre los 24 períodos requeridos para la tendencia")

    monthly_people: dict[str, set[int]] = {}
    for period in trend_periods:
        keys = period_keys[period]
        missing = [key for key in keys if key not in person_by_key]
        if missing:
            raise ValueError("Una clave laboral de la cohorte no posee IDPERSONA GRH válido")
        monthly_people[period] = {person_by_key[key] for key in keys}

    reference_keys = period_keys[reference_period]
    reference_people = monthly_people[reference_period]
    labels_by_person: dict[int, set[str]] = collections.defaultdict(set)
    for employee_key in reference_keys:
        person = person_by_key[employee_key]
        for unit_key in reference_units.get(employee_key, set()):
            label = unit_labels.get(unit_key)
            if label is None:
                raise ValueError("Una asignación sectorial no posee etiqueta revisable")
            labels_by_person[person].add(label)

    assignment_by_person: dict[int, str] = {}
    for person in reference_people:
        source_labels = labels_by_person.get(person, set())
        specific = source_labels - GENERIC_UNIT_LABELS
        unknown = specific - set(REVIEWED_GARDEN_LABELS)
        if unknown:
            raise ValueError("La cohorte contiene una unidad específica sin etiqueta municipal revisada")
        if len(specific) > 1:
            raise ValueError("Una persona posee más de una unidad específica en el período")
        if specific:
            assignment_by_person[person] = next(iter(specific))

    unit_counts = collections.Counter(assignment_by_person.values())
    if not unit_counts:
        raise ValueError("La cohorte no contiene unidades específicas revisadas")
    released = [
        (REVIEWED_GARDEN_LABELS[source_label], people)
        for source_label, people in unit_counts.items()
        if people >= PRIVACY_THRESHOLD
    ]
    released.sort(key=lambda item: (-item[1], item[0]))

    total_people = len(reference_people)
    if total_people < PRIVACY_THRESHOLD:
        raise ValueError("La cohorte completa no alcanza el umbral mínimo de privacidad")
    assigned_people = len(assignment_by_person)
    unassigned_people = total_people - assigned_people
    if (
        assigned_people + unassigned_people != total_people or
        assigned_people != sum(unit_counts.values())
    ):
        raise ValueError("La clasificación interna de unidades no reconcilia con la cohorte")
    protected_people = total_people - sum(people for _, people in released)
    # Complementary suppression: publishing the grand total must never expose
    # a residual cohort smaller than k. Withdraw the smallest released units
    # until the single protected bucket is either empty or itself k-anonymous.
    while 0 < protected_people < PRIVACY_THRESHOLD and released:
        released.sort(key=lambda item: (item[1], item[0]), reverse=True)
        _label, people = released.pop()
        protected_people += people
    released.sort(key=lambda item: (-item[1], item[0]))
    released_people = sum(people for _, people in released)
    protected_people = total_people - released_people
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": GENERATED_AT,
        "source": {
            "canonicalSystem": manifest["canonical_system"],
            "sourceFile": manifest["source_file"],
            "sourceSha256": manifest["sha256"],
            "snapshotAsOf": manifest["snapshot_as_of"],
            "realtime": False,
        },
        "privacy": {
            "status": "released_with_protected_bucket",
            "threshold": PRIVACY_THRESHOLD,
            "aggregateOnly": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "employmentKeysExported": False,
            "sourceCodesExported": False,
            "rawRowsExported": False,
            "complementarySuppression": True,
        },
        "grain": {
            "entity": "person",
            "identityBasis": "legajo.IDPERSONA",
            "deduplication": "distinct_person_across_employment_keys",
        },
        "quality": {
            "status": "reconciled",
            "assignmentPolicyVersion": ASSIGNMENT_POLICY_VERSION,
            "latestValidCalculationPeriod": reference_period,
            "sourceEmploymentKeys": len(reference_keys),
            "linkedEmploymentKeys": sum(key in person_by_key for key in reference_keys),
            "people": total_people,
            "observedUnitCount": len(unit_counts),
            "releasedUnitCount": len(released),
            "reconciliationOk": True,
        },
        "referencePeriod": {
            "period": reference_period,
            "label": f"{FULL_MONTH_LABELS[reference_month - 1]} {reference_year}",
            "status": "latest_valid_calculation",
        },
        "summary": {
            "people": total_people,
            "releasedPeople": released_people,
            "protectedPeople": protected_people,
            "releasedUnitCount": len(released),
            "observedUnitCount": len(unit_counts),
        },
        "monthlyTrend": [
            {
                "period": period,
                "label": _period_label(period),
                "people": len(monthly_people[period]),
            }
            for period in trend_periods
        ],
        "releasedUnits": [
            {
                "label": label,
                "people": people,
                "sharePct": _share_pct(people, total_people),
            }
            for label, people in released
        ],
        "protectedBucket": {
            "label": "Otros jardines y sin unidad específica",
            "people": protected_people,
            "sharePct": _share_pct(protected_people, total_people),
            "privacyStatus": "protected_aggregate",
        },
        "limits": LIMITS,
    }
    if enforce_canonical_controls:
        _canonical_controls(result)
    return result


def serialize_garden_network(value: dict[str, Any]) -> str:
    """Return the canonical byte representation used by Node at runtime."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the approved GRH .sql.gz dump")
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-garden-network.json"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
    )
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    result = build_garden_network(args.source, manifest, enforce_canonical_controls=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(serialize_garden_network(result), encoding="utf-8")
    print(json.dumps({
        "out": str(args.out),
        "schema": result["schemaVersion"],
        "reference_period": result["referencePeriod"]["period"],
        "people": result["summary"]["people"],
        "released_units": result["summary"]["releasedUnitCount"],
        "contains_pii": result["privacy"]["containsPii"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
