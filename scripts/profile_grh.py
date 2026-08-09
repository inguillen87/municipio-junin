#!/usr/bin/env python3
"""Profile the canonical GRH MariaDB dump without loading the full 5M-row dump.

The script intentionally emits only executive aggregates and metadata.  It does
not copy names, DNI, addresses, bank accounts or other PII into public assets.
Those records must be ingested into the protected database layer later.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
import re
from pathlib import Path

try:
    from .grh_source_manifest import file_sha256, load_and_validate_canonical_source
except ImportError:  # Direct execution: python scripts/profile_grh.py
    from grh_source_manifest import file_sha256, load_and_validate_canonical_source

TABLES = {
    "legajo", "calculo", "totpago", "ausencia", "licencia", "legamov",
    "organiza", "sectores", "catego", "cargo", "codliq", "concepto",
    "costos", "convenio", "feriado", "fichadas", "legagremio", "legaestu",
    "otrotrab", "reparticiones_por_legajo", "histocal", "domicilio",
}

CREATE_RE = re.compile(r"CREATE TABLE `([^`]+)`")
INSERT_RE = re.compile(r"INSERT INTO `([^`]+)`(?:\s*\([^)]*\))?\s+VALUES\s*(.*);\s*$")
COL_RE = re.compile(r"^\s*`([^`]+)`\s+(.+?)(?:,)?\s*$")
SNAPSHOT_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})")


def infer_snapshot_date(source: Path) -> str:
    match = SNAPSHOT_RE.search(source.name)
    if not match:
        raise ValueError("El nombre del backup GRH no contiene una fecha YYYYMMDD")
    try:
        return dt.date(*(int(part) for part in match.groups())).isoformat()
    except ValueError as error:
        raise ValueError("La fecha del backup GRH no es valida") from error


def parse_generated_at(value: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise argparse.ArgumentTypeError("--generated-at debe ser un timestamp ISO-8601") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise argparse.ArgumentTypeError("--generated-at debe incluir una zona horaria")
    return parsed


def canonical_utc_timestamp(value: dt.datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("generated_at debe incluir una zona horaria")
    return value.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def tuples_from_values(values: str):
    """Yield SQL tuple fields, handling quoted commas and escaped quotes."""
    i, n = 0, len(values)
    while i < n:
        while i < n and values[i] not in "(":
            i += 1
        if i >= n:
            return
        i += 1
        fields, buf, quoted = [], [], False
        while i < n:
            ch = values[i]
            if quoted:
                if ch == "\\" and i + 1 < n:
                    buf.append(values[i + 1]); i += 2; continue
                if ch == "'":
                    if i + 1 < n and values[i + 1] == "'":
                        buf.append("'"); i += 2; continue
                    quoted = False; i += 1; continue
                buf.append(ch); i += 1; continue
            if ch == "'": quoted = True; i += 1; continue
            if ch == ",": fields.append("".join(buf).strip()); buf = []; i += 1; continue
            if ch == ")":
                fields.append("".join(buf).strip()); i += 1; break
            buf.append(ch); i += 1
        yield [None if x.upper() == "NULL" else x for x in fields]


def cast(v: str | None):
    if v is None: return None
    if re.fullmatch(r"-?\d+", v):
        try: return int(v)
        except ValueError: pass
    if re.fullmatch(r"-?\d+\.\d+", v):
        try: return float(v)
        except ValueError: pass
    return v


def profile(source: Path, generated_at: dt.datetime | None = None):
    schemas, counts = {}, collections.Counter()
    distinct = collections.defaultdict(set)
    aggregates = {
        "employees_by_sector": collections.Counter(),
        "employees_by_cost_center": collections.Counter(),
        "salary_by_period": collections.defaultdict(float),
        "absence_by_year": collections.Counter(),
        "leave_by_year": collections.Counter(),
        "payroll_by_period": collections.defaultdict(float),
        "movement_by_year": collections.Counter(),
    }
    current = None
    with gzip.open(source, "rt", encoding="latin1", errors="replace") as fh:
        for line in fh:
            match = CREATE_RE.match(line)
            if match:
                current = match.group(1)
                schemas.setdefault(current, [])
                continue
            if current in TABLES:
                col = COL_RE.match(line)
                if col and not line.lstrip().startswith(("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT")):
                    schemas[current].append(col.group(1))
                if line.startswith(") ENGINE"):
                    current = None
            ins = INSERT_RE.match(line)
            if not ins or ins.group(1) not in TABLES:
                continue
            table, values = ins.group(1), ins.group(2)
            cols = schemas.get(table, [])
            for row in tuples_from_values(values):
                counts[table] += 1
                item = {cols[i]: cast(row[i]) for i in range(min(len(cols), len(row)))}
                if table == "legajo":
                    distinct["legajo"] .add(item.get("LEGA_12"))
                    aggregates["employees_by_sector"][str(item.get("CODI_07") or "sin_sector")] += 1
                    aggregates["employees_by_cost_center"][str(item.get("CODI_06") or "sin_centro_costo")] += 1
                    if item.get("SUEL_12") is not None:
                        aggregates["salary_by_period"]["snapshot"] += float(item["SUEL_12"])
                elif table == "totpago":
                    period = f"{item.get('PERI_31')}-{int(item.get('MES_31') or 0):02d}"
                    aggregates["payroll_by_period"][period] += float(item.get("NETO_65") or 0)
                elif table == "ausencia":
                    year = str(item.get("FAUS_20") or "")[:4] or "sin_fecha"
                    aggregates["absence_by_year"][year] += 1
                elif table == "licencia":
                    year = str(item.get("FINI_24") or "")[:4] or "sin_fecha"
                    aggregates["leave_by_year"][year] += 1
                elif table == "legamov":
                    aggregates["movement_by_year"][str(item.get("ANO_30") or "sin_año")] += 1

    def serialise(value):
        if isinstance(value, collections.Counter):
            return dict(sorted(value.items(), key=lambda x: (-x[1], str(x[0]))))
        if isinstance(value, collections.defaultdict):
            return dict(sorted(value.items(), key=lambda x: str(x[0])))
        return value

    return {
        "schema_version": "grh-profile-v1",
        "source": source.name,
        "compressed_size_bytes": source.stat().st_size,
        "sha256": file_sha256(source),
        "snapshot_as_of": infer_snapshot_date(source),
        "generated_at": canonical_utc_timestamp(generated_at or dt.datetime.now(dt.timezone.utc)),
        "canonical_source": "GRH Junín",
        "excluded_sources": ["personas_junin"],
        "tables_profiled": len(schemas),
        "row_counts": dict(sorted(counts.items())),
        "candidate_keys": {"legajo": len(distinct["legajo"])},
        "aggregates": {k: serialise(v) for k, v in aggregates.items()},
        "quality_flags": {
            "pii_not_exported": True,
            "salary_amounts_are_source_values": True,
            "periods_require_complete_partition_check": True,
            "future_realtime_requires_incremental_ingestion": True,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, default=Path("api/_data/grh-profile.json"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json",
        help="Manifiesto aprobado que fija nombre, hash, tamaño y snapshot del backup GRH",
    )
    parser.add_argument(
        "--generated-at",
        type=parse_generated_at,
        help="Timestamp ISO-8601 controlado para una corrida reproducible",
    )
    args = parser.parse_args()
    load_and_validate_canonical_source(args.source, args.manifest)
    result = profile(args.source, generated_at=args.generated_at)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(args.out), "tables": result["tables_profiled"], "rows": result["row_counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
