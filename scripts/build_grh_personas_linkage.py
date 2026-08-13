#!/usr/bin/env python3
"""Build an aggregate-only readiness contract for the GRH/PERSONAS bridge.

The two approved GZIP sources are validated before extraction. Only the
``persona`` rows needed by the matcher and PERSONAS ``domicilio``/``contacto``
rows needed for inventory controls are parsed. Identifiers, names, documents,
addresses and candidate pairs exist only transiently and are never serialized.
"""
from __future__ import annotations

import argparse
import collections
import gzip
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from .build_grh_semantic import COLUMN_RE, CREATE_RE, INSERT_RE, count_insert_rows, parse_sql_tuples
    from .grh_source_manifest import load_and_validate_canonical_source
    from .personas_source_manifest import load_and_validate_personas_source
except ImportError:
    from build_grh_semantic import COLUMN_RE, CREATE_RE, INSERT_RE, count_insert_rows, parse_sql_tuples
    from grh_source_manifest import load_and_validate_canonical_source
    from personas_source_manifest import load_and_validate_personas_source


SCHEMA_VERSION = "grh-personas-linkage-readiness-v1"
ALGORITHM_VERSION = "grh-personas-linkage-matcher-v1"
GENERATED_AT = "2026-08-13T00:00:00.000Z"
TARGETS = {
    "grh": {"persona"},
    "personas": {"persona", "domicilio", "contacto"},
}
EXPECTED = {
    "grh": {"physicalTables": 257, "views": 7, "totalRows": 6_573_057, "persons": 2_349},
    "personas": {
        "physicalTables": 32,
        "views": 8,
        "totalRows": 371_947,
        "persons": 96_777,
        "addresses": 273_314,
        "personsWithAddress": 90_365,
        "validCuilRows": 44_333,
        "distinctValidCuil": 41_376,
        "geocodedAddresses": 183,
        "contacts": 350,
    },
    "tiers": {
        "unique_valid_cuil": 1_432,
        "unique_dni_backup": 203,
        "duplicate_valid_cuil_unique_name": 58,
        "duplicate_dni_unique_name": 6,
    },
    "candidates": 1_699,
    "ambiguous": 157,
    "unmatched": 493,
    "targetCollisions": 0,
    "idOverlaps": 6,
    "idConcordant": 0,
}
LIMITS = [
    {"code": "baseline_not_certified", "text": "Los 1.699 resultados son candidatos reproducibles de ingeniería; todavía no forman un padrón productivo certificado."},
    {"code": "ambiguous_require_review", "text": "Los 157 casos ambiguos requieren revisión humana y no se vinculan automáticamente."},
    {"code": "no_idpersona_join", "text": "Los identificadores IDPERSONA pertenecen a cada sistema y nunca se usan para unir las bases."},
    {"code": "personas_auxiliary_only", "text": "GRH conserva la autoridad laboral; PERSONAS sólo puede enriquecer identidad, domicilio y territorio mediante un puente aprobado."},
    {"code": "geocoded_addresses_unlinked", "text": "Los 183 registros con coordenadas no están vinculados de forma verificable a personas y no habilitan cobertura territorial individual."},
    {"code": "report_subdivision_unverified", "text": "El desglose 40 + 24 del informe recibido no tiene algoritmo ejecutable; se publica la reproducción verificable 58 + 6."},
    {"code": "historical_snapshot_not_realtime", "text": "Ambas fuentes corresponden al respaldo del 6 de agosto de 2026 y no se actualizan en tiempo real."},
]


@dataclass(frozen=True)
class PersonRecord:
    source_id: str | None
    cuil: str | None
    dni: str | None
    name: str | None
    birth_date: str | None


def digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def normalize_cuil(value: Any) -> str | None:
    candidate = digits(value)
    if len(candidate) != 11 or candidate == "0" * 11:
        return None
    remainder = sum(int(char) * weight for char, weight in zip(candidate[:10], (5, 4, 3, 2, 7, 6, 5, 4, 3, 2))) % 11
    check = 11 - remainder
    expected = 0 if check == 11 else 9 if check == 10 else check
    return candidate if int(candidate[-1]) == expected else None


def normalize_dni(value: Any) -> str | None:
    candidate = digits(value).lstrip("0")
    return candidate if 6 <= len(candidate) <= 8 else None


def dni_is_missing(value: Any) -> bool:
    candidate = digits(value)
    return not candidate or set(candidate) <= {"0"}


def normalize_name(value: Any) -> str | None:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii").upper()
    return " ".join(ascii_name.strip().split()) or None


def row_map(columns: list[str], raw_row: list[str | None]) -> dict[str, str | None]:
    return {columns[index]: raw_row[index] for index in range(min(len(columns), len(raw_row)))}


def person_from_row(row: dict[str, str | None], *, source: str) -> PersonRecord:
    cuil = normalize_cuil(row.get("CUIL_12"))
    dni = normalize_dni(row.get("NUDO_12"))
    if source == "personas" and dni is None and dni_is_missing(row.get("NUDO_12")) and cuil:
        dni = normalize_dni(cuil[2:10])
    return PersonRecord(
        source_id=digits(row.get("IDPERSONA")) or None,
        cuil=cuil,
        dni=dni,
        name=normalize_name(row.get("NOMB_12")),
        birth_date=str(row.get("FENA_12") or "")[:10] or None,
    )


def scan_source(path: Path, source: str) -> tuple[list[PersonRecord], dict[str, int]]:
    columns: dict[str, list[str]] = {}
    current_table: str | None = None
    physical_tables: set[str] = set()
    views: set[str] = set()
    total_rows = 0
    persons: list[PersonRecord] = []
    address_person_ids: set[str] = set()
    address_rows = geocoded_addresses = geocoded_linked_identifiers = contact_rows = 0

    with gzip.open(path, "rt", encoding="utf-8", errors="replace", newline="") as stream:
        for line in stream:
            create = CREATE_RE.match(line)
            if create:
                current_table = create.group(1)
                physical_tables.add(current_table)
                columns[current_table] = []
                continue
            view = re.match(r"^(?:CREATE .*\bVIEW|/\*!\d+ VIEW) `([^`]+)`", line)
            if view:
                views.add(view.group(1))
            if current_table:
                column = COLUMN_RE.match(line)
                if column and not line.lstrip().startswith(("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT")):
                    columns[current_table].append(column.group(1))
                if line.startswith(") ENGINE"):
                    current_table = None

            insert = INSERT_RE.match(line)
            if not insert:
                continue
            table, explicit, values = insert.groups()
            expected_rows = count_insert_rows(values)
            total_rows += expected_rows
            if table not in TARGETS[source]:
                continue
            table_columns = [item.strip().strip("`") for item in explicit.split(",")] if explicit else columns.get(table, [])
            required = {
                "persona": {"IDPERSONA", "NOMB_12", "FENA_12", "NUDO_12", "CUIL_12"},
                "domicilio": {"persona_IDPERSONA", "contribuyente_id", "oi_id", "id_oi", "latitud", "longitud"},
                "contacto": {"id"},
            }[table]
            if not required.issubset(table_columns):
                raise ValueError(f"Estructura requerida ausente en {source}.{table}")
            parsed = 0
            for raw in parse_sql_tuples(values):
                parsed += 1
                row = row_map(table_columns, raw)
                if table == "persona":
                    persons.append(person_from_row(row, source=source))
                elif table == "domicilio":
                    address_rows += 1
                    source_id = digits(row.get("persona_IDPERSONA"))
                    if source_id and set(source_id) != {"0"}:
                        address_person_ids.add(source_id)
                    try:
                        latitude = float(row.get("latitud") or 0)
                        longitude = float(row.get("longitud") or 0)
                    except (TypeError, ValueError):
                        latitude = longitude = 0
                    if latitude != 0 and longitude != 0:
                        geocoded_addresses += 1
                        linked_values = (
                            row.get("persona_IDPERSONA"), row.get("contribuyente_id"),
                            row.get("oi_id"), row.get("id_oi"),
                        )
                        if any(digits(value) and set(digits(value)) != {"0"} for value in linked_values):
                            geocoded_linked_identifiers += 1
                elif table == "contacto":
                    contact_rows += 1
            if parsed != expected_rows:
                raise ValueError(f"Row parser mismatch for {source}.{table}: counted {expected_rows}, parsed {parsed}")

    return persons, {
        "physicalTables": len(physical_tables),
        "views": len(views),
        "totalRows": total_rows,
        "persons": len(persons),
        "addresses": address_rows,
        "personsWithAddress": len(address_person_ids),
        "validCuilRows": sum(person.cuil is not None for person in persons),
        "distinctValidCuil": len({person.cuil for person in persons if person.cuil}),
        "geocodedAddresses": geocoded_addresses,
        "_geocodedLinkedIdentifiers": geocoded_linked_identifiers,
        "contacts": contact_rows,
    }


def build_linkage_readiness(grh_source: Path, personas_source: Path, grh_manifest: dict[str, Any], personas_manifest: dict[str, Any], *, enforce_canonical_controls: bool = False) -> dict[str, Any]:
    if grh_manifest["snapshot_as_of"] != personas_manifest["snapshot_as_of"]:
        raise ValueError("Los cortes GRH y PERSONAS no coinciden")
    grh_people, grh_counts_raw = scan_source(grh_source, "grh")
    personas_people, personas_counts_raw = scan_source(personas_source, "personas")
    grh_counts = {key: grh_counts_raw[key] for key in ("physicalTables", "views", "totalRows", "persons")}
    geocoded_linked_identifiers = personas_counts_raw["_geocodedLinkedIdentifiers"]
    personas_counts = {key: value for key, value in personas_counts_raw.items() if not key.startswith("_")}
    if geocoded_linked_identifiers != 0:
        raise ValueError("Las coordenadas PERSONAS no satisfacen el control de desvinculación")

    by_cuil: dict[str, list[int]] = collections.defaultdict(list)
    by_dni: dict[str, list[int]] = collections.defaultdict(list)
    by_name: dict[str, list[int]] = collections.defaultdict(list)
    for index, person in enumerate(personas_people):
        if person.cuil:
            by_cuil[person.cuil].append(index)
        if person.dni:
            by_dni[person.dni].append(index)
        if person.name:
            by_name[person.name].append(index)

    tier_counts: collections.Counter[str] = collections.Counter()
    links: list[tuple[int, int, str]] = []
    unresolved: list[PersonRecord] = []
    unresolved_document_candidates = 0
    name_multiple_review = 0
    unique_name_birth_review = 0
    for grh_index, person in enumerate(grh_people):
        target: int | None = None
        tier: str | None = None
        if person.cuil and len(by_cuil[person.cuil]) == 1:
            target, tier = by_cuil[person.cuil][0], "unique_valid_cuil"
        elif person.dni and len(by_dni[person.dni]) == 1:
            target, tier = by_dni[person.dni][0], "unique_dni_backup"
        elif person.cuil and len(by_cuil[person.cuil]) > 1:
            same_name = [index for index in by_cuil[person.cuil] if personas_people[index].name == person.name]
            if len(same_name) == 1:
                target, tier = same_name[0], "duplicate_valid_cuil_unique_name"
        elif person.dni and len(by_dni[person.dni]) > 1:
            same_name = [index for index in by_dni[person.dni] if personas_people[index].name == person.name]
            if len(same_name) == 1:
                target, tier = same_name[0], "duplicate_dni_unique_name"
        if target is not None and tier:
            tier_counts[tier] += 1
            links.append((grh_index, target, tier))
            continue

        unresolved.append(person)
        has_document_candidates = bool(
            (person.cuil and by_cuil[person.cuil]) or
            (person.dni and by_dni[person.dni])
        )
        if has_document_candidates:
            unresolved_document_candidates += 1
            continue
        name_candidates = by_name.get(person.name or "", [])
        if len(name_candidates) > 1:
            name_multiple_review += 1
        elif len(name_candidates) == 1 and person.birth_date and personas_people[name_candidates[0]].birth_date == person.birth_date:
            unique_name_birth_review += 1

    target_counts = collections.Counter(target for _, target, _ in links)
    target_collisions = sum(count - 1 for count in target_counts.values() if count > 1)
    name_only_review_signals = name_multiple_review + unique_name_birth_review
    ambiguous = unresolved_document_candidates + name_only_review_signals
    unmatched = len(unresolved) - ambiguous

    grh_by_id = {person.source_id: person for person in grh_people if person.source_id}
    personas_by_id = {person.source_id: person for person in personas_people if person.source_id}
    overlapping_ids = set(grh_by_id) & set(personas_by_id)
    concordant = 0
    for source_id in overlapping_ids:
        left, right = grh_by_id[source_id], personas_by_id[source_id]
        same_cuil = bool(left.cuil and left.cuil == right.cuil)
        same_dni_name = bool(left.dni and left.dni == right.dni and left.name and left.name == right.name)
        concordant += int(same_cuil or same_dni_name)

    tier_definitions = [
        ("unique_valid_cuil", "CUIL válido y único", "high"),
        ("unique_dni_backup", "DNI único usado como respaldo", "assisted"),
        ("duplicate_valid_cuil_unique_name", "CUIL duplicado resuelto por un único nombre normalizado", "assisted"),
        ("duplicate_dni_unique_name", "DNI duplicado resuelto por un único nombre normalizado", "assisted"),
    ]
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "diagnostic_ready",
        "source": {
            "snapshotAsOf": grh_manifest["snapshot_as_of"],
            "generatedAt": GENERATED_AT,
            "grh": {
                "system": grh_manifest["canonical_system"],
                "sourceFile": grh_manifest["source_file"],
                "sourceSha256": grh_manifest["sha256"],
                "compressedSizeBytes": grh_manifest["compressed_size_bytes"],
                "manifestSchemaVersion": grh_manifest["schema_version"],
                "tables": {"person": "persona"},
                "counts": grh_counts,
            },
            "personas": {
                "system": personas_manifest["source_system"],
                "sourceFile": personas_manifest["source_file"],
                "sourceSha256": personas_manifest["sha256"],
                "compressedSizeBytes": personas_manifest["compressed_size_bytes"],
                "manifestSchemaVersion": personas_manifest["schema_version"],
                "tables": {"person": "persona", "address": "domicilio", "contact": "contacto"},
                "counts": personas_counts,
            },
        },
        "algorithm": {
            "version": ALGORITHM_VERSION,
            "nameNormalization": "NFKD_ASCII_UPPER_TRIM_COLLAPSE_WHITESPACE_PRESERVE_PUNCTUATION",
            "dniPolicy": {"grh": "NUDO_12_DIGITS_ONLY", "personas": "NUDO_12_DIGITS_ONLY_ELSE_MIDDLE_8_OF_VALID_CUIL_WHEN_MISSING"},
            "priority": [key for key, _, _ in tier_definitions],
            "ambiguityPolicy": "unresolved_document_candidates_or_name_only_review_signal",
            "nameOnlyMatching": False,
            "sexEvidenceUsed": False,
            "idPersonaJoinAllowed": False,
            "tiers": [
                {"key": key, "label": label, "count": tier_counts[key], "confidence": confidence}
                for key, label, confidence in tier_definitions
            ],
            "receivedReportSubdivisionVerified": False,
        },
        "reconciliation": {
            "grhPersons": len(grh_people),
            "candidates": len(links),
            "coveragePct": round(len(links) * 100 / len(grh_people), 1),
            "ambiguous": ambiguous,
            "unmatched": unmatched,
            "targetCollisions": target_collisions,
            "ambiguousBreakdown": {
                "unresolvedDocumentCandidates": unresolved_document_candidates,
                "nameOnlyReviewSignals": name_only_review_signals,
                "multipleNameCandidates": name_multiple_review,
                "uniqueNameAndBirthDate": unique_name_birth_review,
                "promotedFromNameOnly": 0,
            },
            "reconciled": len(links) + ambiguous + unmatched == len(grh_people),
        },
        "idPersonaControl": {
            "joinKey": "IDPERSONA",
            "joinAllowed": False,
            "overlappingValues": len(overlapping_ids),
            "concordantIdentities": concordant,
            "status": "forbidden",
        },
        "privacy": {
            "aggregateOnly": True,
            "containsPii": False,
            "rawRowsExported": False,
            "sourceIdentifiersExported": False,
            "namesExported": False,
            "documentsExported": False,
            "addressesExported": False,
            "contactsExported": False,
            "candidateRowsExported": False,
        },
        "readiness": {
            "aggregateDiagnostic": "available",
            "productionCrosswalk": "not_published",
            "humanReview": "pending",
            "institutionalApproval": "pending",
            "safeForCurrentGrhKpis": False,
        },
        "limits": LIMITS,
    }
    if enforce_canonical_controls:
        observed = {
            "grh": grh_counts,
            "personas": personas_counts,
            "tiers": dict(tier_counts),
            "candidates": len(links),
            "ambiguous": ambiguous,
            "unmatched": unmatched,
            "targetCollisions": target_collisions,
            "idOverlaps": len(overlapping_ids),
            "idConcordant": concordant,
        }
        if observed != EXPECTED:
            raise ValueError(f"Controles canónicos GRH/PERSONAS no conciliados: {observed}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grh-source", required=True, type=Path)
    parser.add_argument("--grh-manifest", default=Path("config/grh-source-manifest.json"), type=Path)
    parser.add_argument("--personas-source", required=True, type=Path)
    parser.add_argument("--personas-manifest", default=Path("config/personas-source-manifest.json"), type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--enforce-canonical-controls", action="store_true")
    args = parser.parse_args()
    grh_manifest = load_and_validate_canonical_source(args.grh_source, args.grh_manifest)
    personas_manifest = load_and_validate_personas_source(args.personas_source, args.personas_manifest)
    result = build_linkage_readiness(
        args.grh_source,
        args.personas_source,
        grh_manifest,
        personas_manifest,
        enforce_canonical_controls=args.enforce_canonical_controls,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
