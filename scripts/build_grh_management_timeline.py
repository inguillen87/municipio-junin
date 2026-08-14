#!/usr/bin/env python3
"""Build the governed four-year GRH management timeline.

The extractor streams the approved compressed backup. Source employee keys and
``legajo.IDPERSONA`` exist only in memory to resolve distinct-person counts;
neither identifiers nor raw rows are serialized. The current mandate is
clamped to the manifest snapshot and compared with the same number of inclusive
days in the previous mandate.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

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
        valid_employee_key,
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
        date_reasons,
        parse_date,
        parse_generated_at,
        parse_int,
        parse_sql_tuples,
        valid_employee_key,
    )
    from grh_source_manifest import load_and_validate_canonical_source


SCHEMA_VERSION = "grh-management-timeline-v1"
GENERATED_AT = "2026-08-14T00:00:00.000Z"
PRIVACY_THRESHOLD = 10
MINIMUM_YEAR = 1979
CURRENT_TERM = (dt.date(2023, 12, 9), dt.date(2027, 12, 8))
PRIOR_TERM = (dt.date(2019, 12, 9), dt.date(2023, 12, 8))
PLANNED_DAYS = 1_461
TARGET_TABLES = {"legajo", "ausencia", "foja", "fijos"}
DOMAIN_KEYS = (
    "reportedAbsence",
    "documentedEmploymentActions",
    "reportedIngressDates",
    "reportedExitDates",
    "fixedConceptStarts",
)
MATRIX_DOMAIN_KEYS = DOMAIN_KEYS[:4]
PRIVACY_RULE = (
    "protect_paired_domain_block_when_any_current_prior_or_absolute_delta_"
    "measure_is_1_to_9_and_apply_complementary_year_suppression"
)

DOMAIN_DEFINITIONS: dict[str, dict[str, Any]] = {
    "reportedAbsence": {
        "label": "Ausencias informadas",
        "description": (
            "Registros de ausencia, personas GRH distintas alcanzadas y días informados "
            "en tramos calendario equivalentes."
        ),
        "comparisonStatus": "comparable",
        "measures": ("eventRows", "distinctPersons", "reportedDays"),
    },
    "documentedEmploymentActions": {
        "label": "Actuaciones laborales documentadas",
        "description": (
            "Filas fechadas de GRH.foja y personas GRH distintas alcanzadas; una fila no "
            "equivale necesariamente a un cambio único."
        ),
        "comparisonStatus": "comparable",
        "measures": ("eventRows", "distinctPersons"),
    },
    "reportedIngressDates": {
        "label": "Fechas de ingreso informadas",
        "description": (
            "Legajos cuya fecha de ingreso informada cae en el tramo; no acredita altas "
            "de dotación."
        ),
        "comparisonStatus": "comparable",
        "measures": ("eventRows", "distinctPersons"),
    },
    "reportedExitDates": {
        "label": "Fechas de egreso informadas",
        "description": (
            "Legajos cuya fecha de egreso informada cae en el tramo; no acredita bajas "
            "de dotación."
        ),
        "comparisonStatus": "comparable",
        "measures": ("eventRows", "distinctPersons"),
    },
    "fixedConceptStarts": {
        "label": "Altas informadas de conceptos fijos",
        "description": (
            "FECHA_ALTA de GRH.fijos; describe el inicio informado de un concepto y no "
            "un ingreso laboral."
        ),
        "comparisonStatus": "context_only",
        "measures": ("eventRows", "distinctPersons"),
    },
}

LIMITS = (
    {
        "code": "historical_snapshot_not_realtime",
        "text": "La lectura proviene de un respaldo histórico y no se actualiza en tiempo real.",
    },
    {
        "code": "planned_mandate_contains_unobserved_future",
        "text": "El mandato planificado dura 1.461 días; los días posteriores al corte se muestran como no observados, nunca como cero.",
    },
    {
        "code": "equal_observed_windows_not_full_mandates",
        "text": "Los totales comparan igual cantidad de días observados; mientras el mandato actual esté incompleto no representan dos mandatos completos.",
    },
    {
        "code": "comparison_not_causal_evaluation",
        "text": "Las diferencias describen registros del origen y no atribuyen causas, mérito ni desempeño a una gestión.",
    },
    {
        "code": "absence_rows_not_performance",
        "text": "Las ausencias informadas no miden desempeño, productividad ni impacto operativo y no publican causas.",
    },
    {
        "code": "reported_dates_not_staffing_actions",
        "text": "Las fechas de ingreso y egreso informadas no acreditan altas, bajas ni dotación activa.",
    },
    {
        "code": "foja_rows_not_unique_changes",
        "text": "Cada fila de foja es una actuación documentada y no representa necesariamente un cambio laboral único.",
    },
    {
        "code": "fixed_concept_starts_not_employment_ingress",
        "text": "FECHA_ALTA de fijos corresponde al concepto; se publica sólo como contexto y no como alta laboral.",
    },
    {
        "code": "fixed_concept_metadata_not_comparable",
        "text": "La completitud de metadatos de conceptos fijos cambia entre ventanas; el dominio no es comparable para evaluar gestiones.",
    },
    {
        "code": "repartitions_and_gardens_excluded",
        "text": "Reparticiones y jardines quedan fuera de esta versión hasta gobernar cobertura temporal, solapes y una clasificación histórica verificable.",
    },
    {
        "code": "aggregate_only_no_pii",
        "text": "La salida contiene sólo agregados; no exporta identificadores, nombres, causas, instrumentos ni filas fuente.",
    },
)


@dataclass(frozen=True)
class Event:
    date: dt.date
    person_id: int | None
    reported_days: int | None = None


def _inclusive_days(start: dt.date, end: dt.date) -> int:
    return max(0, (end - start).days + 1)


def _percentage(numerator: int, denominator: int) -> float:
    return round(numerator * 100 / denominator, 4) if denominator else 0.0


def _row(columns: list[str], raw: list[str | None]) -> dict[str, str | None]:
    return {columns[index]: raw[index] for index in range(min(len(columns), len(raw)))}


def _employee_key(row: dict[str, str | None]) -> tuple[int | None, int | None]:
    return parse_int(row.get("CODI_01")), parse_int(row.get("LEGA_12"))


def _reported_days(value: str | None) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not parsed.is_finite() or parsed < 0 or parsed != parsed.to_integral_value():
        return None
    integer = int(parsed)
    return integer if integer <= 9_007_199_254_740_991 else None


def _year_ranges(term: tuple[dt.date, dt.date]) -> list[tuple[dt.date, dt.date]]:
    start, term_end = term
    ranges = []
    for offset in range(4):
        year_start = dt.date(start.year + offset, start.month, start.day)
        next_start = (
            dt.date(start.year + offset + 1, start.month, start.day)
            if offset < 3
            else term_end + dt.timedelta(days=1)
        )
        ranges.append((year_start, next_start - dt.timedelta(days=1)))
    if ranges[-1][1] != term_end:
        raise ValueError("El mandato planificado no forma cuatro años de gestión")
    return ranges


def _intersection(
    left: tuple[dt.date, dt.date],
    right: tuple[dt.date, dt.date] | None,
) -> tuple[dt.date, dt.date] | None:
    if right is None:
        return None
    start = max(left[0], right[0])
    end = min(left[1], right[1])
    return (start, end) if start <= end else None


def _observed_windows(snapshot: dt.date) -> dict[str, tuple[dt.date, dt.date] | None]:
    current_start, current_end = CURRENT_TERM
    if snapshot < current_start:
        raise ValueError("El snapshot GRH es anterior al inicio de la gestión actual")
    current_cut = min(snapshot, current_end)
    observed_days = _inclusive_days(current_start, current_cut)
    prior_cut = min(PRIOR_TERM[0] + dt.timedelta(days=observed_days - 1), PRIOR_TERM[1])
    return {
        "current": (current_start, current_cut),
        "prior": (PRIOR_TERM[0], prior_cut),
    }


def _period_status(observed_days: int, planned_days: int, *, prior: bool) -> str:
    if observed_days == 0:
        return "not_compared" if prior else "future"
    if observed_days == planned_days:
        return "matched_complete" if prior else "complete"
    return "matched_partial" if prior else "partial"


def _small(value: int) -> bool:
    return 0 < abs(value) < PRIVACY_THRESHOLD


def _values(events: Iterable[Event], measures: tuple[str, ...]) -> dict[str, int]:
    selected = list(events)
    unresolved = sum(event.person_id is None for event in selected)
    if unresolved:
        raise ValueError(
            "Una fila dentro de la comparación no posee IDPERSONA GRH válido"
        )
    values = {
        "eventRows": len(selected),
        "distinctPersons": len({event.person_id for event in selected}),
    }
    if "reportedDays" in measures:
        if any(event.reported_days is None for event in selected):
            raise ValueError(
                "Una ausencia comparada no posee días informados válidos"
            )
        values["reportedDays"] = sum(int(event.reported_days or 0) for event in selected)
    return values


def _period_values(
    events: list[Event],
    period: tuple[dt.date, dt.date] | None,
    measures: tuple[str, ...],
) -> dict[str, int] | None:
    if period is None:
        return None
    return _values(
        (event for event in events if period[0] <= event.date <= period[1]),
        measures,
    )


def _difference(current: dict[str, int], prior: dict[str, int]) -> dict[str, int]:
    return {key: current[key] - prior[key] for key in current}


def _primary_protection(
    current: dict[str, int],
    prior: dict[str, int],
    delta: dict[str, int],
) -> bool:
    return any(_small(value) for values in (current, prior, delta) for value in values.values())


def _cell(status: str, measures: tuple[str, ...], values: dict[str, int] | None) -> dict[str, Any]:
    if status != "released":
        values = {measure: None for measure in measures}
    return {"privacyStatus": status, "values": values}


def _domain(
    key: str,
    current: dict[str, int] | None,
    prior: dict[str, int] | None,
    status: str,
) -> dict[str, Any]:
    definition = DOMAIN_DEFINITIONS[key]
    measures = definition["measures"]
    delta = _difference(current, prior) if current is not None and prior is not None else None
    return {
        "key": key,
        "label": definition["label"],
        "description": definition["description"],
        "comparisonStatus": definition["comparisonStatus"],
        "measures": list(measures),
        "current": _cell(status, measures, current),
        "prior": _cell(status, measures, prior),
        "delta": _cell(status, measures, delta),
    }


def _coverage(
    raw_rows: list[tuple[tuple[int | None, int | None], str | None, Any]],
    person_by_key: dict[tuple[int | None, int | None], int],
    snapshot: dt.date,
) -> tuple[list[Event], dict[str, int]]:
    events: list[Event] = []
    valid_rows = 0
    quarantine_rows = 0
    resolved_rows = 0
    unresolved_rows = 0
    for employee_key, date_value, reported_days in raw_rows:
        reasons, event_date = date_reasons(
            date_value,
            min_year=MINIMUM_YEAR,
            as_of=snapshot,
        )
        if reasons or event_date is None:
            quarantine_rows += 1
            continue
        valid_rows += 1
        person_id = person_by_key.get(employee_key)
        if person_id is None:
            unresolved_rows += 1
        else:
            resolved_rows += 1
        events.append(Event(event_date, person_id, reported_days))
    return events, {
        "sourceRows": len(raw_rows),
        "validDateRows": valid_rows,
        "quarantineDateRows": quarantine_rows,
        "resolvedPersonRows": resolved_rows,
        "unresolvedPersonRows": unresolved_rows,
    }


def _extract(source: Path, snapshot: dt.date) -> tuple[dict[str, list[Event]], dict[str, Any]]:
    schemas: dict[str, TableSchema] = {}
    source_rows: collections.Counter[str] = collections.Counter()
    current_table: str | None = None
    employment_rows: list[
        tuple[
            tuple[int | None, int | None],
            int | None,
            str | None,
            str | None,
        ]
    ] = []
    absence_rows: list[tuple[tuple[int | None, int | None], str | None, int | None]] = []
    action_rows: list[tuple[tuple[int | None, int | None], str | None, None]] = []
    fixed_rows: list[tuple[tuple[int | None, int | None], str | None, None]] = []
    required_columns = {
        "legajo": {"CODI_01", "LEGA_12", "IDPERSONA", "FING_12", "FEGR_12"},
        "ausencia": {"CODI_01", "LEGA_12", "FAUS_20", "DIAS_24"},
        "foja": {"CODI_01", "LEGA_12", "FECH_FJ"},
        "fijos": {"CODI_01", "LEGA_12", "FECHA_ALTA"},
    }

    with gzip.open(source, "rt", encoding="utf-8", errors="replace", newline="") as stream:
        for line in stream:
            create_match = CREATE_RE.match(line)
            if create_match:
                current_table = create_match.group(1)
                schemas[current_table] = TableSchema(current_table)
                continue
            if current_table:
                column_match = COLUMN_RE.match(line)
                if column_match and not line.lstrip().startswith(
                    ("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT")
                ):
                    schemas[current_table].columns.append(column_match.group(1))
                if line.startswith(") ENGINE"):
                    current_table = None

            insert_match = INSERT_RE.match(line)
            if not insert_match:
                continue
            table_name, explicit_columns, values_text = insert_match.groups()
            if table_name not in TARGET_TABLES:
                continue
            schema = schemas.get(table_name, TableSchema(table_name))
            columns = (
                [item.strip().strip("`") for item in explicit_columns.split(",")]
                if explicit_columns
                else schema.columns
            )
            if not required_columns[table_name].issubset(columns):
                raise ValueError(f"Estructura requerida ausente en {table_name}")
            expected_rows = count_insert_rows(values_text)
            parsed_rows = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_rows += 1
                source_rows[table_name] += 1
                row = _row(columns, raw_row)
                employee_key = _employee_key(row)
                if table_name == "legajo":
                    employment_rows.append(
                        (
                            employee_key,
                            parse_int(row.get("IDPERSONA")),
                            row.get("FING_12"),
                            row.get("FEGR_12"),
                        )
                    )
                elif table_name == "ausencia":
                    absence_rows.append(
                        (employee_key, row.get("FAUS_20"), _reported_days(row.get("DIAS_24")))
                    )
                elif table_name == "foja":
                    action_rows.append((employee_key, row.get("FECH_FJ"), None))
                else:
                    fixed_rows.append((employee_key, row.get("FECHA_ALTA"), None))
            if parsed_rows != expected_rows:
                raise ValueError(
                    f"Row parser mismatch for {table_name}: counted {expected_rows}, parsed {parsed_rows}"
                )

    missing_tables = TARGET_TABLES - set(source_rows)
    if missing_tables:
        raise ValueError(f"Fuentes requeridas ausentes: {sorted(missing_tables)}")

    person_by_key: dict[tuple[int | None, int | None], int] = {}
    valid_employee_key_rows = 0
    invalid_employee_key_rows = 0
    invalid_person_rows = 0
    for employee_key, person_id, _ingress, _exit in employment_rows:
        if not valid_employee_key(employee_key):
            invalid_employee_key_rows += 1
            continue
        valid_employee_key_rows += 1
        if person_id is None or person_id <= 0:
            invalid_person_rows += 1
            continue
        previous = person_by_key.get(employee_key)
        if previous is not None and previous != person_id:
            raise ValueError("Clave laboral enlazada a más de una persona GRH")
        person_by_key[employee_key] = person_id

    reported_ingress_rows = [
        (employee_key, ingress, None)
        for employee_key, _person_id, ingress, _exit in employment_rows
    ]
    reported_exit_rows = [
        (employee_key, exit_date, None)
        for employee_key, _person_id, _ingress, exit_date in employment_rows
    ]
    facts: dict[str, list[Event]] = {}
    coverage: dict[str, Any] = {
        "employment": {
            "sourceRows": len(employment_rows),
            "validEmployeeKeyRows": valid_employee_key_rows,
            "invalidEmployeeKeyRows": invalid_employee_key_rows,
            "mappedEmployeeKeys": len(person_by_key),
            "invalidPersonRows": invalid_person_rows,
            "distinctPersons": len(set(person_by_key.values())),
        }
    }
    for key, raw_rows in (
        ("reportedAbsence", absence_rows),
        ("documentedEmploymentActions", action_rows),
        ("reportedIngressDates", reported_ingress_rows),
        ("reportedExitDates", reported_exit_rows),
        ("fixedConceptStarts", fixed_rows),
    ):
        facts[key], coverage[key] = _coverage(raw_rows, person_by_key, snapshot)

    return facts, {
        "rowCounts": {key: source_rows[key] for key in sorted(TARGET_TABLES)},
        "coverage": coverage,
    }


def _build_years(
    facts: dict[str, list[Event]],
    observed_windows: dict[str, tuple[dt.date, dt.date] | None],
) -> list[dict[str, Any]]:
    current_ranges = _year_ranges(CURRENT_TERM)
    prior_ranges = _year_ranges(PRIOR_TERM)
    staged: list[dict[str, Any]] = []
    raw_domains: dict[str, list[dict[str, Any]]] = {key: [] for key in DOMAIN_KEYS}

    for index, (current_range, prior_range) in enumerate(
        zip(current_ranges, prior_ranges, strict=True),
        start=1,
    ):
        current_observed = _intersection(current_range, observed_windows["current"])
        prior_observed = _intersection(prior_range, observed_windows["prior"])
        current_days = (
            _inclusive_days(*current_observed) if current_observed is not None else 0
        )
        prior_days = _inclusive_days(*prior_observed) if prior_observed is not None else 0
        if current_days != prior_days:
            raise ValueError("Los años comparados no conservan igual cantidad de días")
        planned_days = _inclusive_days(*current_range)
        if planned_days != _inclusive_days(*prior_range):
            raise ValueError("Los años de gestión no conservan igual duración")
        year = {
            "key": f"management-year-{index}",
            "ordinal": index,
            "label": f"Año {index}",
            "plannedDays": planned_days,
            "current": {
                "plannedStartDate": current_range[0].isoformat(),
                "plannedEndDate": current_range[1].isoformat(),
                "observedStartDate": (
                    current_observed[0].isoformat() if current_observed else None
                ),
                "observedEndDate": (
                    current_observed[1].isoformat() if current_observed else None
                ),
                "observedDays": current_days,
                "status": _period_status(current_days, planned_days, prior=False),
            },
            "prior": {
                "plannedStartDate": prior_range[0].isoformat(),
                "plannedEndDate": prior_range[1].isoformat(),
                "observedStartDate": prior_observed[0].isoformat() if prior_observed else None,
                "observedEndDate": prior_observed[1].isoformat() if prior_observed else None,
                "observedDays": prior_days,
                "status": _period_status(prior_days, planned_days, prior=True),
            },
            "domains": {},
        }
        staged.append(year)
        for domain_key in DOMAIN_KEYS:
            measures = DOMAIN_DEFINITIONS[domain_key]["measures"]
            current_values = _period_values(
                facts[domain_key], current_observed, measures
            )
            prior_values = _period_values(facts[domain_key], prior_observed, measures)
            if current_values is None or prior_values is None:
                status = "unavailable"
                delta = None
            else:
                delta = _difference(current_values, prior_values)
                status = (
                    "protected_primary"
                    if _primary_protection(current_values, prior_values, delta)
                    else "released"
                )
            raw_domains[domain_key].append(
                {
                    "current": current_values,
                    "prior": prior_values,
                    "delta": delta,
                    "status": status,
                }
            )

    # A released total plus exactly one protected year would reconstruct that
    # hidden year. Protect the nearest preceding released year as a deterministic
    # companion. The canonical source consequently protects years 2 and 3 for
    # ingress, exit and fixed-concept starts.
    for domain_key, rows in raw_domains.items():
        protected = [
            index for index, row in enumerate(rows) if row["status"] == "protected_primary"
        ]
        observed = [index for index, row in enumerate(rows) if row["status"] != "unavailable"]
        if len(protected) == 1 and len(observed) >= 2:
            primary = protected[0]
            candidates = [index for index in observed if index != primary]
            companion = max(
                candidates,
                key=lambda index: (
                    index < primary,
                    -abs(index - primary),
                    index,
                ),
            )
            rows[companion]["status"] = "protected_complementary"

    for year_index, year in enumerate(staged):
        for domain_key in DOMAIN_KEYS:
            row = raw_domains[domain_key][year_index]
            year["domains"][domain_key] = _domain(
                domain_key,
                row["current"],
                row["prior"],
                row["status"],
            )
    return staged


def _build_comparison(
    facts: dict[str, list[Event]],
    observed_windows: dict[str, tuple[dt.date, dt.date] | None],
    management_years: list[dict[str, Any]],
) -> dict[str, Any]:
    observed_days = (
        _inclusive_days(*observed_windows["current"])
        if observed_windows["current"] is not None
        else 0
    )
    domains: dict[str, Any] = {}
    for domain_key in DOMAIN_KEYS:
        measures = DOMAIN_DEFINITIONS[domain_key]["measures"]
        current = _period_values(facts[domain_key], observed_windows["current"], measures)
        prior = _period_values(facts[domain_key], observed_windows["prior"], measures)
        if current is None or prior is None:
            status = "unavailable"
        else:
            delta = _difference(current, prior)
            status = (
                "protected_primary"
                if _primary_protection(current, prior, delta)
                else "released"
            )
            protected_years = sum(
                year["domains"][domain_key]["current"]["privacyStatus"]
                in {"protected_primary", "protected_complementary"}
                for year in management_years
            )
            if protected_years == 1:
                # There was no possible complementary year. Publishing the
                # total would reveal the only protected bucket.
                status = "protected_complementary"
        domains[domain_key] = _domain(domain_key, current, prior, status)
    return {
        "observedDays": observed_days,
        "matrixDomainKeys": list(MATRIX_DOMAIN_KEYS),
        "domains": domains,
    }


def _assert_canonical(result: dict[str, Any]) -> None:
    expected_rows = {
        "ausencia": 31_572,
        "fijos": 8_729,
        "foja": 9_481,
        "legajo": 2_450,
    }
    if result["source"]["rowCounts"] != expected_rows:
        raise ValueError("Los conteos fuente del backup canónico cambiaron")
    employment = result["source"]["coverage"]["employment"]
    expected_identity = {
        "sourceRows": 2_450,
        "validEmployeeKeyRows": 2_449,
        "invalidEmployeeKeyRows": 1,
        "mappedEmployeeKeys": 2_449,
        "invalidPersonRows": 0,
        "distinctPersons": 2_325,
    }
    if employment != expected_identity:
        raise ValueError("La identidad IDPERSONA canónica cambió")
    expected_totals = {
        "reportedAbsence": ((5_936, 749, 65_847), (3_395, 662, 52_190)),
        "documentedEmploymentActions": ((3_882, 714), (3_226, 631)),
        "reportedIngressDates": ((281, 275), (216, 199)),
        "reportedExitDates": ((232, 228), (173, 169)),
        "fixedConceptStarts": ((60, 56), (423, 387)),
    }
    for key, (current, prior) in expected_totals.items():
        domain = result["comparison"]["domains"][key]
        current_values = tuple(domain["current"]["values"].values())
        prior_values = tuple(domain["prior"]["values"].values())
        if (current_values, prior_values) != (current, prior):
            raise ValueError(f"Los totales canónicos cambiaron en {key}")
    expected_days = [366, 365, 241, 0]
    if [year["current"]["observedDays"] for year in result["managementYears"]] != expected_days:
        raise ValueError("Los años observados canónicos cambiaron")
    for key in ("reportedIngressDates", "reportedExitDates", "fixedConceptStarts"):
        statuses = [
            year["domains"][key]["current"]["privacyStatus"]
            for year in result["managementYears"]
        ]
        if statuses != [
            "released",
            "protected_complementary",
            "protected_primary",
            "unavailable",
        ]:
            raise ValueError(f"La supresión canónica cambió en {key}")


def build_management_timeline(
    source: Path,
    manifest: dict[str, Any],
    *,
    generated_at: str = GENERATED_AT,
    enforce_canonical_controls: bool = False,
) -> dict[str, Any]:
    try:
        snapshot = dt.date.fromisoformat(manifest["snapshot_as_of"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("El manifiesto no contiene un corte válido") from error
    for field in ("canonical_system", "source_file", "sha256"):
        if not isinstance(manifest.get(field), str) or not manifest[field]:
            raise ValueError(f"El manifiesto no contiene {field}")
    if _inclusive_days(*CURRENT_TERM) != PLANNED_DAYS or _inclusive_days(*PRIOR_TERM) != PLANNED_DAYS:
        raise ValueError("Los mandatos gobernados deben durar 1.461 días inclusivos")

    observed_windows = _observed_windows(snapshot)
    facts, extraction = _extract(source, snapshot)
    management_years = _build_years(facts, observed_windows)
    observed_days = sum(year["current"]["observedDays"] for year in management_years)
    current_observed = observed_windows["current"]
    prior_observed = observed_windows["prior"]
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "source": {
            "canonicalSystem": manifest["canonical_system"],
            "fileName": manifest["source_file"],
            "sha256": manifest["sha256"],
            "snapshotAsOf": snapshot.isoformat(),
            "realtime": False,
            "rowCounts": extraction["rowCounts"],
            "coverage": extraction["coverage"],
        },
        "privacy": {
            "mode": "aggregate_only",
            "threshold": PRIVACY_THRESHOLD,
            "personKey": "legajo.IDPERSONA",
            "rule": PRIVACY_RULE,
            "protectedValue": None,
            "complementarySuppression": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "rawRowsExported": False,
        },
        "terms": {
            "current": {
                "key": "current",
                "label": "Gestión actual",
                "startDate": CURRENT_TERM[0].isoformat(),
                "endDate": CURRENT_TERM[1].isoformat(),
                "plannedDays": PLANNED_DAYS,
            },
            "prior": {
                "key": "prior",
                "label": "Gestión anterior",
                "startDate": PRIOR_TERM[0].isoformat(),
                "endDate": PRIOR_TERM[1].isoformat(),
                "plannedDays": PLANNED_DAYS,
            },
        },
        "observed": {
            "current": {
                "startDate": current_observed[0].isoformat() if current_observed else None,
                "endDate": current_observed[1].isoformat() if current_observed else None,
                "days": observed_days,
                "progressPct": _percentage(observed_days, PLANNED_DAYS),
                "status": (
                    "complete" if observed_days == PLANNED_DAYS
                    else "partial" if observed_days else "not_started"
                ),
            },
            "prior": {
                "startDate": prior_observed[0].isoformat() if prior_observed else None,
                "endDate": prior_observed[1].isoformat() if prior_observed else None,
                "days": observed_days,
                "progressPct": _percentage(observed_days, PLANNED_DAYS),
                "status": (
                    "matched_complete" if observed_days == PLANNED_DAYS
                    else "matched_window" if observed_days else "not_compared"
                ),
            },
        },
        "managementYears": management_years,
        "comparison": _build_comparison(facts, observed_windows, management_years),
        "limits": [dict(limit) for limit in LIMITS],
    }
    if enforce_canonical_controls:
        _assert_canonical(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the approved GRH .sql.gz dump")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("api/_data/grh-management-timeline.json"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
    )
    parser.add_argument(
        "--generated-at",
        type=parse_generated_at,
        default=parse_generated_at(GENERATED_AT),
    )
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    result = build_management_timeline(
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
    print(
        json.dumps(
            {
                "schema": result["schemaVersion"],
                "snapshot_as_of": result["source"]["snapshotAsOf"],
                "observed_days": result["comparison"]["observedDays"],
                "contains_pii": result["privacy"]["containsPii"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
