#!/usr/bin/env python3
"""Build the aggregate-only GRH payroll-run control contract.

The extractor streams the approved compressed backup and retains source run
keys only in memory to reconcile ``histocal``, ``calculo`` and
``liquidacionlog``. The serialized artifact contains no employee identifiers,
source run identifiers, monetary amounts, conditions, messages or raw rows.
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
    )
    from grh_source_manifest import load_and_validate_canonical_source


SCHEMA_VERSION = "grh-payroll-run-control-v1"
GENERATED_AT = "2026-08-13T00:00:00.000Z"
MINIMUM_YEAR = 1979
PRIVACY_THRESHOLD = 10
TARGET_TABLES = {"histocal", "calculo", "liquidacionlog"}
RUN_KEY_FIELDS = ("CODI_01", "PERI_31", "MES_31", "FECA_31", "TIPO_31")
REASON_ORDER = (
    "year_before_policy",
    "year_after_snapshot",
    "period_after_snapshot",
    "month_out_of_range",
    "date_before_policy",
    "date_after_snapshot",
    "period_date_year_mismatch",
)

LIMITS = [
    {
        "code": "historical_snapshot_not_realtime",
        "text": "La información corresponde al respaldo del 6 de agosto de 2026 y no se actualiza en tiempo real.",
    },
    {
        "code": "close_flag_not_accounting_close",
        "text": "La marca de cierre es un dato operativo de histocal; no acredita cierre contable, pago ni presentación legal.",
    },
    {
        "code": "missing_close_flag_not_open",
        "text": "Una marca de cierre ausente significa sin dato informado; no debe leerse automáticamente como corrida abierta.",
    },
    {
        "code": "calculation_rows_not_payment",
        "text": "La presencia de detalle en calculo acredita filas técnicas asociadas; no acredita liquidación pagada.",
    },
    {
        "code": "technical_logs_not_confirmed_errors",
        "text": "liquidacionlog se publica sólo como cobertura agregada y no permite afirmar errores, causas ni resultados individuales.",
    },
    {
        "code": "no_budget_execution_or_bank_payment",
        "text": "Esta vista no integra ejecución presupuestaria, tesorería, transferencias bancarias ni declaraciones juradas.",
    },
]

CANONICAL_CONTROLS = {
    "sourceRunHeaders": 625,
    "validRunHeaders": 612,
    "quarantinedRunHeaders": 13,
    "validPeriodCount": 217,
    "calculationRows": 4_363_790,
    "calculationRunKeys": 611,
    "orphanCalculationRunKeys": 0,
    "validHeadersWithCalculation": 600,
    "validHeadersWithoutCalculation": 12,
    "validHeadersWithCloseFlag": 517,
    "validHeadersWithoutCloseFlag": 95,
    "quarantineHeadersWithCalculation": 11,
    "quarantineHeadersWithoutCalculation": 2,
    "quarantineCalculationRows": 20_270,
    "currentYear": {
        "year": 2026,
        "throughPeriod": "2026-07",
        "monthsObserved": 7,
        "runHeaders": 26,
        "headersWithCalculation": 26,
        "headersWithCloseFlag": 26,
    },
    "logCoverage": {
        "sourceRows": 122,
        "runKeys": 1,
        "joinedRunKeys": 1,
        "firstEventDate": "2026-06-30",
        "lastEventDate": "2026-06-30",
    },
    "reasonOccurrences": {
        "year_before_policy": 8,
        "year_after_snapshot": 3,
        "date_before_policy": 1,
        "date_after_snapshot": 5,
        "period_date_year_mismatch": 7,
    },
}


def _round_pct(numerator: int, denominator: int) -> float | None:
    return round(numerator * 100 / denominator, 4) if denominator else None


def _columns(explicit_columns: str | None, schema: TableSchema) -> list[str]:
    if explicit_columns:
        return [item.strip().strip("`") for item in explicit_columns.split(",")]
    return schema.columns


def _row(columns: list[str], raw_row: list[str | None]) -> dict[str, str | None]:
    return {columns[index]: raw_row[index] for index in range(min(len(columns), len(raw_row)))}


def _run_key(row: dict[str, str | None], *, lower_case: bool = False) -> tuple[Any, ...]:
    def value(name: str) -> str | None:
        return row.get(name.lower() if lower_case else name)

    anchor = parse_date(value("FECA_31"))
    run_type = value("TIPO_31")
    return (
        parse_int(value("CODI_01")),
        parse_int(value("PERI_31")),
        parse_int(value("MES_31")),
        anchor.isoformat() if anchor else None,
        run_type.strip() if isinstance(run_type, str) else None,
    )


def _header_reasons(row: dict[str, str | None], snapshot: dt.date) -> tuple[list[str], int | None, int | None, dt.date | None]:
    reasons: list[str] = []
    year = parse_int(row.get("PERI_31"))
    month = parse_int(row.get("MES_31"))
    anchor = parse_date(row.get("FECA_31"))
    if year is None:
        reasons.append("year_after_snapshot")
    elif year < MINIMUM_YEAR:
        reasons.append("year_before_policy")
    elif year > snapshot.year:
        reasons.append("year_after_snapshot")
    if month is None or not 1 <= month <= 12:
        reasons.append("month_out_of_range")
    elif year == snapshot.year and month > snapshot.month:
        reasons.append("period_after_snapshot")
    if anchor is None:
        reasons.append("date_after_snapshot")
    else:
        if anchor < dt.date(MINIMUM_YEAR, 1, 1):
            reasons.append("date_before_policy")
        elif anchor > snapshot:
            reasons.append("date_after_snapshot")
        if year is not None and anchor.year != year:
            reasons.append("period_date_year_mismatch")
    return sorted(set(reasons)), year, month, anchor


def _assert_canonical_controls(result: dict[str, Any]) -> None:
    coverage = result["coverage"]
    for key in (
        "sourceRunHeaders", "validRunHeaders", "quarantinedRunHeaders",
        "validPeriodCount", "calculationRows", "calculationRunKeys",
        "orphanCalculationRunKeys", "validHeadersWithCalculation",
        "validHeadersWithoutCalculation", "validHeadersWithCloseFlag",
        "validHeadersWithoutCloseFlag",
    ):
        if coverage[key] != CANONICAL_CONTROLS[key]:
            raise ValueError(f"Control canónico de corridas no conciliado: {key}")
    quarantine = result["quarantine"]
    expected_quarantine = {
        "runHeaders": CANONICAL_CONTROLS["quarantinedRunHeaders"],
        "headersWithCalculation": CANONICAL_CONTROLS["quarantineHeadersWithCalculation"],
        "headersWithoutCalculation": CANONICAL_CONTROLS["quarantineHeadersWithoutCalculation"],
        "calculationRows": CANONICAL_CONTROLS["quarantineCalculationRows"],
    }
    for key, expected in expected_quarantine.items():
        if quarantine[key] != expected:
            raise ValueError(f"Control canónico de cuarentena no conciliado: {key}")
    reason_counts = {item["code"]: item["count"] for item in quarantine["reasonOccurrences"]}
    if reason_counts != CANONICAL_CONTROLS["reasonOccurrences"]:
        raise ValueError("Motivos canónicos de cuarentena no conciliados")
    for key, expected in CANONICAL_CONTROLS["currentYear"].items():
        if result["currentYear"][key] != expected:
            raise ValueError(f"Control canónico 2026 no conciliado: {key}")
    for key, expected in CANONICAL_CONTROLS["logCoverage"].items():
        if result["logCoverage"][key] != expected:
            raise ValueError(f"Control canónico de log no conciliado: {key}")


def build_payroll_run_control(
    source: Path,
    manifest: dict[str, Any],
    *,
    generated_at: str = GENERATED_AT,
    enforce_canonical_controls: bool = False,
) -> dict[str, Any]:
    """Stream the approved backup and return governed run-level aggregates."""
    snapshot = dt.date.fromisoformat(manifest["snapshot_as_of"])
    schemas: dict[str, TableSchema] = {}
    current_table: str | None = None
    headers: dict[tuple[Any, ...], dict[str, Any]] = {}
    calculation_counts: collections.Counter[tuple[Any, ...]] = collections.Counter()
    technical_log_counts: collections.Counter[tuple[Any, ...]] = collections.Counter()
    technical_log_dates: list[dt.date] = []

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
            required = {
                "histocal": {*RUN_KEY_FIELDS, "CIER_31"},
                "calculo": set(RUN_KEY_FIELDS),
                "liquidacionlog": {field.lower() for field in RUN_KEY_FIELDS},
            }[table_name]
            if not required.issubset(columns):
                raise ValueError(f"Estructura requerida ausente en {table_name}")

            expected_rows = count_insert_rows(values_text)
            parsed_rows = 0
            for raw_row in parse_sql_tuples(values_text):
                parsed_rows += 1
                row = _row(columns, raw_row)
                if table_name == "calculo":
                    calculation_counts[_run_key(row)] += 1
                    continue
                if table_name == "liquidacionlog":
                    technical_log_counts[_run_key(row, lower_case=True)] += 1
                    event_date = parse_date(row.get("feca_31"))
                    if event_date is not None:
                        technical_log_dates.append(event_date)
                    continue

                run_key = _run_key(row)
                if run_key in headers:
                    raise ValueError("Clave de corrida duplicada en histocal")
                reasons, year, month, anchor = _header_reasons(row, snapshot)
                close_value = parse_int(row.get("CIER_31"))
                if close_value not in (None, 1):
                    raise ValueError("Marca de cierre no gobernada en histocal")
                headers[run_key] = {
                    "valid": not reasons,
                    "reasons": reasons,
                    "year": year,
                    "month": month,
                    "anchor": anchor,
                    "closeFlag": close_value == 1,
                }
            if parsed_rows != expected_rows:
                raise ValueError(
                    f"Row parser mismatch for {table_name}: counted {expected_rows}, parsed {parsed_rows}"
                )

    if not headers or not calculation_counts:
        raise ValueError("El backup no contiene cabeceras y detalle de cálculo")
    missing_tables = TARGET_TABLES - set(schemas)
    if missing_tables:
        raise ValueError(f"Fuentes requeridas ausentes: {sorted(missing_tables)}")

    valid_keys = {key for key, header in headers.items() if header["valid"]}
    quarantine_keys = set(headers) - valid_keys
    calculation_keys = set(calculation_counts)
    orphan_calculation_keys = calculation_keys - set(headers)
    valid_with_calculation = valid_keys & calculation_keys
    quarantine_with_calculation = quarantine_keys & calculation_keys
    valid_headers = [headers[key] for key in valid_keys]
    quarantined_headers = [headers[key] for key in quarantine_keys]

    periods: dict[str, dict[str, Any]] = {}
    for key in sorted(valid_keys):
        header = headers[key]
        year, month, anchor = header["year"], header["month"], header["anchor"]
        if year is None or month is None or anchor is None:
            raise ValueError("Cabecera válida sin período o fecha")
        period = f"{year:04d}-{month:02d}"
        bucket = periods.setdefault(period, {
            "period": period,
            "dates": [],
            "runHeaders": 0,
            "headersWithCalculation": 0,
            "headersWithoutCalculation": 0,
            "headersWithCloseFlag": 0,
            "headersWithoutCloseFlag": 0,
            "calculationRows": 0,
        })
        bucket["dates"].append(anchor.isoformat())
        bucket["runHeaders"] += 1
        has_calculation = key in calculation_keys
        bucket["headersWithCalculation" if has_calculation else "headersWithoutCalculation"] += 1
        bucket["headersWithCloseFlag" if header["closeFlag"] else "headersWithoutCloseFlag"] += 1
        bucket["calculationRows"] += calculation_counts.get(key, 0)

    monthly = []
    for period in sorted(periods):
        bucket = periods[period]
        dates = sorted(bucket.pop("dates"))
        monthly.append({
            "period": period,
            "firstEffectiveDate": dates[0],
            "lastEffectiveDate": dates[-1],
            **bucket,
        })

    current_rows = [item for item in monthly if item["period"].startswith("2026-")]
    current_run_headers = sum(item["runHeaders"] for item in current_rows)
    current_with_calculation = sum(item["headersWithCalculation"] for item in current_rows)
    current_with_close = sum(item["headersWithCloseFlag"] for item in current_rows)
    reason_counts: collections.Counter[str] = collections.Counter(
        reason for header in quarantined_headers for reason in header["reasons"]
    )
    calculation_rows = sum(calculation_counts.values())
    quarantine_calculation_rows = sum(calculation_counts[key] for key in quarantine_with_calculation)
    joined_log_keys = set(technical_log_counts) & set(headers)
    first_log_date = min(technical_log_dates).isoformat() if technical_log_dates else None
    last_log_date = max(technical_log_dates).isoformat() if technical_log_dates else None

    result = {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "canonicalSystem": manifest["canonical_system"],
            "sourceFile": manifest["source_file"],
            "sourceSha256": manifest["sha256"],
            "snapshotAsOf": manifest["snapshot_as_of"],
            "generatedAt": generated_at,
            "realtime": False,
            "tables": {
                "runHeaders": "histocal",
                "calculationDetails": "calculo",
                "technicalLogs": "liquidacionlog",
            },
            "firstValidPeriod": monthly[0]["period"],
            "lastValidPeriod": monthly[-1]["period"],
            "latestValidEffectiveDate": max(
                header["anchor"] for header in valid_headers if header["anchor"] is not None
            ).isoformat(),
        },
        "privacy": {
            "threshold": PRIVACY_THRESHOLD,
            "aggregateOnly": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "rawRowsExported": False,
            "sourceRunKeysExported": False,
            "monetaryAmountsExported": False,
            "rawTechnicalLogsExported": False,
            "rawMessagesExported": False,
        },
        "metric": {
            "runHeaderGrain": "una cabecera técnica distinta de histocal por empresa, período, mes, fecha efectiva y tipo de corrida",
            "calculationRunKeyGrain": "una clave técnica distinta de calculo reconciliada con su cabecera histocal",
            "monthlyGrain": "un período fuente válido PERI_31-MES_31 con corridas agregadas",
            "validityPolicy": "año 1979-2026, mes 1-12, fecha efectiva entre 1979-01-01 y 2026-08-06 y año coincidente con la fecha",
            "monthMismatchTreatment": "la diferencia entre mes fuente y mes de fecha es diagnóstica y no envía por sí sola una corrida a cuarentena",
            "closeFlagMeaning": "CIER_31=1 es una marca operativa informada; no prueba cierre contable ni pago",
            "missingCloseFlagMeaning": "CIER_31 ausente significa sin marca informada, no corrida abierta",
            "calculationMeaning": "detalle asociado significa filas en calculo para la misma clave técnica; no prueba pago",
            "technicalLogMeaning": "cobertura agregada de liquidacionlog; no prueba errores ni resultados individuales",
        },
        "coverage": {
            "sourceRunHeaders": len(headers),
            "validRunHeaders": len(valid_keys),
            "quarantinedRunHeaders": len(quarantine_keys),
            "validPeriodCount": len(monthly),
            "calculationRows": calculation_rows,
            "calculationRunKeys": len(calculation_keys),
            "orphanCalculationRunKeys": len(orphan_calculation_keys),
            "validHeadersWithCalculation": len(valid_with_calculation),
            "validHeadersWithoutCalculation": len(valid_keys - calculation_keys),
            "validHeadersWithCloseFlag": sum(header["closeFlag"] for header in valid_headers),
            "validHeadersWithoutCloseFlag": sum(not header["closeFlag"] for header in valid_headers),
            "validHeaderRatePct": _round_pct(len(valid_keys), len(headers)),
            "validHeaderWithCalculationRatePct": _round_pct(len(valid_with_calculation), len(valid_keys)),
            "calculationHeaderJoinCoveragePct": _round_pct(len(calculation_keys - orphan_calculation_keys), len(calculation_keys)),
        },
        "currentYear": {
            "year": 2026,
            "throughPeriod": current_rows[-1]["period"],
            "partial": True,
            "monthsObserved": len(current_rows),
            "runHeaders": current_run_headers,
            "headersWithCalculation": current_with_calculation,
            "headersWithCloseFlag": current_with_close,
            "allObservedRunsHaveCalculation": current_with_calculation == current_run_headers,
            "allObservedRunsHaveCloseFlag": current_with_close == current_run_headers,
        },
        "monthly": monthly,
        "quarantine": {
            "signalCode": "temporal_quarantine_present",
            "status": "attention_required" if quarantine_keys or quarantine_calculation_rows else "clear",
            "runHeaders": len(quarantine_keys),
            "headersWithCalculation": len(quarantine_with_calculation),
            "headersWithoutCalculation": len(quarantine_keys - calculation_keys),
            "calculationRows": quarantine_calculation_rows,
            "calculationRowRatePct": _round_pct(quarantine_calculation_rows, calculation_rows),
            "reasonOccurrences": [
                {"code": reason, "count": reason_counts[reason]}
                for reason in REASON_ORDER if reason_counts[reason] > 0
            ],
        },
        "logCoverage": {
            "sourceRows": sum(technical_log_counts.values()),
            "runKeys": len(technical_log_counts),
            "joinedRunKeys": len(joined_log_keys),
            "joinCoveragePct": _round_pct(len(joined_log_keys), len(technical_log_counts)),
            "firstEventDate": first_log_date,
            "lastEventDate": last_log_date,
            "rawDetailsWithheld": True,
        },
        "limits": LIMITS,
    }
    if enforce_canonical_controls:
        _assert_canonical_controls(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the approved GRH .sql.gz dump")
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-payroll-run-control.json"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
    )
    parser.add_argument("--generated-at", type=parse_generated_at, default=parse_generated_at(GENERATED_AT))
    args = parser.parse_args()
    manifest = load_and_validate_canonical_source(args.source, args.manifest)
    generated_at = canonical_utc_timestamp(args.generated_at)
    result = build_payroll_run_control(
        args.source,
        manifest,
        generated_at=generated_at,
        enforce_canonical_controls=True,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "schema": result["schemaVersion"],
        "valid_run_headers": result["coverage"]["validRunHeaders"],
        "quarantined_run_headers": result["quarantine"]["runHeaders"],
        "contains_pii": result["privacy"]["containsPii"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
