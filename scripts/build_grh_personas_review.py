#!/usr/bin/env python3
"""Materialize the private GRH/PERSONAS review queue as encrypted NDJSON.

The command accepts only the two manifest-pinned GZIP backups.  Nominal data
exists in memory long enough to create an AES-256-GCM evidence envelope; it is
never written as plaintext, included in identifiers, or emitted to logs.
"""
from __future__ import annotations

import argparse
import base64
import collections
import datetime as dt
import gzip
import hashlib
import hmac
import json
import os
import re
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

try:
    from .build_grh_personas_linkage import (
        ALGORITHM_VERSION,
        normalize_cuil,
        normalize_dni,
        normalize_name,
        dni_is_missing,
        row_map,
    )
    from .build_grh_semantic import COLUMN_RE, CREATE_RE, INSERT_RE, parse_sql_tuples
    from .grh_source_manifest import load_and_validate_canonical_source
    from .personas_source_manifest import load_and_validate_personas_source
except ImportError:
    from build_grh_personas_linkage import (
        ALGORITHM_VERSION,
        normalize_cuil,
        normalize_dni,
        normalize_name,
        dni_is_missing,
        row_map,
    )
    from build_grh_semantic import COLUMN_RE, CREATE_RE, INSERT_RE, parse_sql_tuples
    from grh_source_manifest import load_and_validate_canonical_source
    from personas_source_manifest import load_and_validate_personas_source


STREAM_SCHEMA_VERSION = "grh-personas-review-stream-v1"
RUN_SCHEMA_VERSION = "grh-personas-review-run-v1"
MATERIALIZER_VERSION = "grh-personas-review-materializer-v2"
EVIDENCE_POLICY_VERSION = "grh-personas-review-evidence-v2"
ENVELOPE_SCHEMA_VERSION = "grh-personas-review-envelope-v1"
KEY_VERSION = "v1"
RUN_UUID_NAMESPACE = uuid.UUID("3d4bb1eb-8509-5f52-a0b3-5a7d05414d60")
HMAC_ENV = "GRH_PERSONAS_REVIEW_HMAC_KEY_V1"
EVIDENCE_ENV = "GRH_PERSONAS_REVIEW_EVIDENCE_KEY_V1"
EXPECTED = {
    "totalCaseCount": 2_349,
    "totalOptionCount": 2_185,
    "candidateCaseCount": 1_699,
    "ambiguousCaseCount": 157,
    "unmatchedCaseCount": 493,
    "documentConflictCount": 23,
    "autoApprovedCount": 0,
}
TIER_METHODS = {
    "unique_valid_cuil": "UNIQUE_VALID_CUIL",
    "unique_dni_backup": "UNIQUE_DNI_BACKUP",
    "duplicate_valid_cuil_unique_name": "DUPLICATE_VALID_CUIL_NAME",
    "duplicate_dni_unique_name": "DUPLICATE_DNI_NAME",
}


class ReviewMaterializationError(Exception):
    """Detail-free public failure used by the CLI boundary."""


@dataclass(frozen=True)
class PrivatePerson:
    source_id: str
    display_name: str | None
    birth_date: str | None
    birth_date_invalid: bool
    display_cuil: str | None
    display_dni: str | None
    cuil: str | None
    dni: str | None
    name: str | None


@dataclass(frozen=True)
class MatchCase:
    grh_index: int
    classification: str
    tier_key: str | None
    option_indexes: tuple[int, ...]
    signal: str


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def decode_key(value: str | None) -> bytes:
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]{43}", value):
        raise ReviewMaterializationError("KEY_INVALID")
    try:
        decoded = base64.urlsafe_b64decode(value + "=")
    except Exception as error:
        raise ReviewMaterializationError("KEY_INVALID") from error
    if len(decoded) != 32 or base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != value:
        raise ReviewMaterializationError("KEY_INVALID")
    return decoded


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def hmac_ref(key: bytes, domain: str, *parts: str) -> str:
    values = (domain, *parts)
    if any(not isinstance(value, str) or not value or "\0" in value for value in values):
        raise ReviewMaterializationError("HMAC_INPUT_INVALID")
    return hmac.new(key, "\0".join(values).encode("utf-8"), hashlib.sha256).hexdigest()


def source_ref(key: bytes, tenant_id: str, system: str, source_id: str) -> str:
    return hmac_ref(key, "grh-personas-review:source-ref:v1", tenant_id, system, source_id)


def evidence_digest(key: bytes, record_type: str, plaintext: dict[str, Any]) -> str:
    return hmac_ref(
        key,
        "grh-personas-review:evidence-digest:v1",
        record_type,
        canonical_json(plaintext),
    )


def normalize_birth(value: Any) -> tuple[str | None, bool]:
    candidate = str(value or "").strip()[:10]
    if not candidate:
        return None, False
    try:
        parsed = dt.date.fromisoformat(candidate)
    except (TypeError, ValueError):
        return None, True
    sentinels = {dt.date(1900, 1, 1), dt.date(1992, 12, 31), dt.date(1111, 11, 11)}
    if parsed in sentinels or not dt.date(1900, 1, 2) <= parsed <= dt.date(2026, 8, 6):
        return None, True
    return parsed.isoformat(), False


def display_text(value: Any) -> str | None:
    candidate = " ".join(str(value or "").strip().split())
    if len(candidate) > 200 or any(ord(char) < 32 or ord(char) == 127 for char in candidate):
        raise ReviewMaterializationError("DISPLAY_TEXT_INVALID")
    return candidate or None


def display_document(value: Any) -> str | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    digits_only = re.sub(r"\D", "", candidate)
    if digits_only and set(digits_only) <= {"0"}:
        return None
    return candidate


def person_from_private_row(row: dict[str, str | None], source: str) -> PrivatePerson:
    source_id = str(row.get("IDPERSONA") or "")
    if not source_id or len(source_id) > 512 or source_id != source_id.strip() or "\0" in source_id:
        raise ReviewMaterializationError("SOURCE_IDENTIFIER_INVALID")
    normalized_cuil = normalize_cuil(row.get("CUIL_12"))
    normalized_dni = normalize_dni(row.get("NUDO_12"))
    birth_date, birth_date_invalid = normalize_birth(row.get("FENA_12"))
    if source == "PERSONAS" and normalized_dni is None and dni_is_missing(row.get("NUDO_12")) and normalized_cuil:
        normalized_dni = normalize_dni(normalized_cuil[2:10])
    return PrivatePerson(
        source_id=source_id,
        display_name=display_text(row.get("NOMB_12")),
        birth_date=birth_date,
        birth_date_invalid=birth_date_invalid,
        display_cuil=normalized_cuil,
        # PERSONAS uses the documented fallback only when NUDO_12 is absent:
        # the private UI labels this value as obtained from a valid CUIL.
        display_dni=normalized_dni,
        cuil=normalized_cuil,
        dni=normalized_dni,
        name=normalize_name(row.get("NOMB_12")),
    )


def scan_private_people(path: Path, source: str) -> list[PrivatePerson]:
    columns: dict[str, list[str]] = {}
    current_table: str | None = None
    people: list[PrivatePerson] = []
    with gzip.open(path, "rt", encoding="utf-8", errors="replace", newline="") as stream:
        for line in stream:
            create = CREATE_RE.match(line)
            if create:
                current_table = create.group(1)
                columns[current_table] = []
                continue
            if current_table:
                column = COLUMN_RE.match(line)
                if column and not line.lstrip().startswith(("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT")):
                    columns[current_table].append(column.group(1))
                if line.startswith(") ENGINE"):
                    current_table = None
            insert = INSERT_RE.match(line)
            if not insert or insert.group(1) != "persona":
                continue
            _, explicit, values = insert.groups()
            table_columns = [item.strip().strip("`") for item in explicit.split(",")] if explicit else columns.get("persona", [])
            required = {"IDPERSONA", "NOMB_12", "FENA_12", "NUDO_12", "CUIL_12"}
            if not required.issubset(table_columns):
                raise ReviewMaterializationError("SOURCE_SCHEMA_INVALID")
            for raw in parse_sql_tuples(values):
                people.append(person_from_private_row(row_map(table_columns, raw), source))
    identifiers = [person.source_id for person in people]
    if len(identifiers) != len(set(identifiers)):
        raise ReviewMaterializationError("SOURCE_IDENTIFIER_DUPLICATE")
    return people


def build_match_cases(grh_people: list[PrivatePerson], personas_people: list[PrivatePerson]) -> list[MatchCase]:
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

    cases: list[MatchCase] = []
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
            cases.append(MatchCase(grh_index, "CANDIDATE", tier, (target,), tier))
            continue

        document_indexes = set()
        if person.cuil:
            document_indexes.update(by_cuil.get(person.cuil, ()))
        if person.dni:
            document_indexes.update(by_dni.get(person.dni, ()))
        if document_indexes:
            cases.append(MatchCase(
                grh_index,
                "AMBIGUOUS",
                None,
                tuple(sorted(document_indexes, key=lambda item: personas_people[item].source_id)),
                "document_candidate",
            ))
            continue
        name_indexes = by_name.get(person.name or "", [])
        if len(name_indexes) > 1:
            cases.append(MatchCase(
                grh_index,
                "AMBIGUOUS",
                None,
                tuple(sorted(name_indexes, key=lambda item: personas_people[item].source_id)),
                "name_only_signal",
            ))
        elif len(name_indexes) == 1 and person.birth_date and personas_people[name_indexes[0]].birth_date == person.birth_date:
            cases.append(MatchCase(
                grh_index,
                "AMBIGUOUS",
                None,
                (name_indexes[0],),
                "name_birthdate_signal",
            ))
        else:
            cases.append(MatchCase(grh_index, "UNMATCHED", None, (), "unmatched"))
    return cases


def evidence_state(left: str | None, right: str | None, *, different: str = "CONFLICT") -> str:
    if not left or not right:
        return "MISSING"
    return "MATCH" if left == right else different


def birth_evidence_state(left: PrivatePerson, right: PrivatePerson) -> str:
    if left.birth_date_invalid or right.birth_date_invalid:
        return "CONFLICT"
    return evidence_state(left.birth_date, right.birth_date)


def person_evidence(person: PrivatePerson, schema_version: str) -> dict[str, Any]:
    return {
        "schemaVersion": schema_version,
        "person": {
            "displayName": person.display_name,
            "birthDate": person.birth_date,
            "documents": {"cuil": person.display_cuil, "dni": person.display_dni},
        },
    }


def encrypt_evidence(
    *,
    key: bytes,
    plaintext: dict[str, Any],
    tenant_id: str,
    run_id: str,
    case_key: str | None,
    record_type: str,
    stable_key: str,
    nonce_factory: Callable[[int], bytes] = os.urandom,
) -> dict[str, str]:
    aad = {
        "caseKey": case_key,
        "keyVersion": KEY_VERSION,
        "recordType": record_type,
        "runId": run_id,
        "stableKey": stable_key,
        "tenantId": tenant_id,
    }
    nonce = nonce_factory(12)
    if not isinstance(nonce, bytes) or len(nonce) != 12:
        raise ReviewMaterializationError("NONCE_INVALID")
    ciphertext_and_tag = AESGCM(key).encrypt(
        nonce,
        canonical_json(plaintext).encode("utf-8"),
        canonical_json(aad).encode("utf-8"),
    )
    return {
        "schemaVersion": ENVELOPE_SCHEMA_VERSION,
        "keyVersion": KEY_VERSION,
        "algorithm": "A256GCM",
        "iv": b64url(nonce),
        "ciphertext": b64url(ciphertext_and_tag[:-16]),
        "tag": b64url(ciphertext_and_tag[-16:]),
    }


def _semantic_inputs(
    *,
    tenant_id: str,
    hmac_key: bytes,
    grh_people: list[PrivatePerson],
    personas_people: list[PrivatePerson],
    cases: list[MatchCase],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[int, str], dict[int, str]]:
    grh_refs = {index: source_ref(hmac_key, tenant_id, "GRH", person.source_id) for index, person in enumerate(grh_people)}
    personas_refs = {index: source_ref(hmac_key, tenant_id, "PERSONAS", person.source_id) for index, person in enumerate(personas_people)}
    by_cuil: dict[str, set[int]] = collections.defaultdict(set)
    by_dni: dict[str, set[int]] = collections.defaultdict(set)
    for index, person in enumerate(personas_people):
        if person.cuil:
            by_cuil[person.cuil].add(index)
        if person.dni:
            by_dni[person.dni].add(index)
    case_semantics: list[dict[str, Any]] = []
    option_semantics: list[dict[str, Any]] = []
    for item in cases:
        grh = grh_people[item.grh_index]
        grh_ref = grh_refs[item.grh_index]
        selected = personas_people[item.option_indexes[0]] if item.classification == "CANDIDATE" else None
        cuil_candidates = by_cuil.get(grh.cuil or "", set())
        dni_candidates = by_dni.get(grh.dni or "", set())
        document_conflict = bool(
            selected and cuil_candidates and dni_candidates and
            cuil_candidates.isdisjoint(dni_candidates)
        )
        birth_conflict = grh.birth_date_invalid or bool(selected and birth_evidence_state(grh, selected) == "CONFLICT")
        name_support = bool(selected and evidence_state(grh.name, selected.name, different="DIFFERENT") == "MATCH")
        priority = "DOCUMENT_CONFLICT" if document_conflict else (
            "MANUAL_REVIEW" if item.classification == "AMBIGUOUS" or birth_conflict or
            (item.classification == "CANDIDATE" and item.tier_key != "unique_valid_cuil") else "STANDARD"
        )
        case_plaintext = person_evidence(grh, "grh-personas-review-case-evidence-v1")
        case_semantics.append({
            "recordType": "case",
            "grhRef": grh_ref,
            "classification": item.classification,
            "reviewLane": item.signal,
            "tierKey": item.tier_key,
            "priority": priority,
            "optionCount": len(item.option_indexes),
            "documentConflict": document_conflict,
            "birthDateConflict": birth_conflict,
            "nameSupport": name_support,
            "evidenceDigest": evidence_digest(hmac_key, "case", case_plaintext),
            "_plaintext": case_plaintext,
            "_grhIndex": item.grh_index,
        })
        for rank, personas_index in enumerate(item.option_indexes, 1):
            target = personas_people[personas_index]
            cuil_state = evidence_state(grh.cuil, target.cuil)
            dni_state = evidence_state(grh.dni, target.dni)
            name_state = evidence_state(grh.name, target.name, different="DIFFERENT")
            birth_state = birth_evidence_state(grh, target)
            conflict = "CONFLICT" in (cuil_state, dni_state, birth_state)
            independent_identity_support = name_state == "MATCH" or birth_state == "MATCH"
            if item.signal == "name_only_signal":
                method, evidence_level = "NAME_ONLY_SIGNAL", "INSUFFICIENT"
            elif item.signal == "name_birthdate_signal":
                method, evidence_level = "NAME_BIRTHDATE_SIGNAL", "INSUFFICIENT"
            else:
                method = TIER_METHODS.get(item.signal, "DOCUMENT_CANDIDATE")
                evidence_level = "CONFLICT" if conflict else (
                    "INSUFFICIENT"
                    if item.tier_key == "unique_dni_backup" and not independent_identity_support
                    else "STRONG" if item.tier_key == "unique_valid_cuil" else "ASSISTED"
                )
            option_plaintext = person_evidence(target, "grh-personas-review-option-evidence-v1")
            option_semantics.append({
                "recordType": "option",
                "grhRef": grh_ref,
                "personasRef": personas_refs[personas_index],
                "rank": rank,
                "matchMethod": method,
                "evidenceLevel": evidence_level,
                "cuilEvidence": cuil_state,
                "dniEvidence": dni_state,
                "nameEvidence": name_state,
                "birthDateEvidence": birth_state,
                "requiresManualCheck": True,
                "evidenceDigest": evidence_digest(hmac_key, "option", option_plaintext),
                "_plaintext": option_plaintext,
                "_grhIndex": item.grh_index,
                "_personasIndex": personas_index,
            })
    case_semantics.sort(key=lambda row: row["grhRef"])
    option_semantics.sort(key=lambda row: (row["personasRef"], row["grhRef"], row["rank"]))
    return case_semantics, option_semantics, grh_refs, personas_refs


def _public_semantic(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


def build_review_stream(
    *,
    tenant_id: str,
    grh_source: Path,
    personas_source: Path,
    grh_manifest_path: Path,
    personas_manifest_path: Path,
    hmac_key: bytes,
    evidence_key: bytes,
    nonce_factory: Callable[[int], bytes] = os.urandom,
    enforce_canonical_controls: bool = True,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", tenant_id or ""):
        raise ReviewMaterializationError("TENANT_INVALID")
    if len(hmac_key) != 32 or len(evidence_key) != 32:
        raise ReviewMaterializationError("KEY_INVALID")
    if hmac.compare_digest(hmac_key, evidence_key):
        raise ReviewMaterializationError("KEY_REUSE_FORBIDDEN")
    grh_manifest = load_and_validate_canonical_source(grh_source, grh_manifest_path)
    personas_manifest = load_and_validate_personas_source(personas_source, personas_manifest_path)
    if grh_manifest["snapshot_as_of"] != personas_manifest["snapshot_as_of"]:
        raise ReviewMaterializationError("SOURCE_SNAPSHOT_MISMATCH")

    grh_people = scan_private_people(grh_source, "GRH")
    personas_people = scan_private_people(personas_source, "PERSONAS")
    cases = build_match_cases(grh_people, personas_people)
    case_semantics, option_semantics, _, _ = _semantic_inputs(
        tenant_id=tenant_id,
        hmac_key=hmac_key,
        grh_people=grh_people,
        personas_people=personas_people,
        cases=cases,
    )
    counts = {
        "totalCaseCount": len(case_semantics),
        "totalOptionCount": len(option_semantics),
        "candidateCaseCount": sum(row["classification"] == "CANDIDATE" for row in case_semantics),
        "ambiguousCaseCount": sum(row["classification"] == "AMBIGUOUS" for row in case_semantics),
        "unmatchedCaseCount": sum(row["classification"] == "UNMATCHED" for row in case_semantics),
        "documentConflictCount": sum(bool(row["documentConflict"]) for row in case_semantics),
        "autoApprovedCount": 0,
    }
    semantic_digest = sha256_json([
        *[_public_semantic(row) for row in case_semantics],
        *[_public_semantic(row) for row in option_semantics],
    ])
    run_identity = {
        "schemaVersion": RUN_SCHEMA_VERSION,
        "tenantId": tenant_id,
        "snapshotAsOf": grh_manifest["snapshot_as_of"],
        "grhSourceSha256": grh_manifest["sha256"],
        "personasSourceSha256": personas_manifest["sha256"],
        "matcherVersion": ALGORITHM_VERSION,
        "evidencePolicyVersion": EVIDENCE_POLICY_VERSION,
        **counts,
        "semanticDigest": semantic_digest,
    }
    run_digest = sha256_json(run_identity)
    run_id = str(uuid.uuid5(RUN_UUID_NAMESPACE, run_digest))

    records: list[dict[str, Any]] = []
    case_keys: dict[int, str] = {}
    for semantic in case_semantics:
        grh_index = semantic["_grhIndex"]
        case_key = hmac_ref(
            hmac_key,
            "grh-personas-review:case-key:v1",
            tenant_id,
            semantic["grhRef"],
        )
        case_keys[grh_index] = case_key
        records.append({
            "recordType": "case",
            "tenantId": tenant_id,
            "runId": run_id,
            "caseKey": case_key,
            "grhRef": semantic["grhRef"],
            "classification": semantic["classification"],
            "reviewLane": semantic["reviewLane"],
            "status": "PENDING",
            "tierKey": semantic["tierKey"],
            "priority": semantic["priority"],
            "optionCount": semantic["optionCount"],
            "documentConflict": semantic["documentConflict"],
            "birthDateConflict": semantic["birthDateConflict"],
            "nameSupport": semantic["nameSupport"],
            "evidenceDigest": semantic["evidenceDigest"],
            "evidenceEnvelope": encrypt_evidence(
                key=evidence_key,
                plaintext=semantic["_plaintext"],
                tenant_id=tenant_id,
                run_id=run_id,
                case_key=case_key,
                record_type="case",
                stable_key=case_key,
                nonce_factory=nonce_factory,
            ),
        })
    for semantic in option_semantics:
        case_key = case_keys[semantic["_grhIndex"]]
        pair_ref = hmac_ref(
            hmac_key,
            "grh-personas-review:pair-ref:v1",
            tenant_id,
            semantic["grhRef"],
            semantic["personasRef"],
        )
        option_key = hmac_ref(
            hmac_key,
            "grh-personas-review:option-key:v1",
            tenant_id,
            pair_ref,
        )
        records.append({
            "recordType": "option",
            "tenantId": tenant_id,
            "runId": run_id,
            "caseKey": case_key,
            "optionKey": option_key,
            "pairRef": pair_ref,
            "personasRef": semantic["personasRef"],
            "rank": semantic["rank"],
            "matchMethod": semantic["matchMethod"],
            "evidenceLevel": semantic["evidenceLevel"],
            "status": "PENDING",
            "cuilEvidence": semantic["cuilEvidence"],
            "dniEvidence": semantic["dniEvidence"],
            "nameEvidence": semantic["nameEvidence"],
            "birthDateEvidence": semantic["birthDateEvidence"],
            "requiresManualCheck": semantic["requiresManualCheck"],
            "evidenceDigest": semantic["evidenceDigest"],
            "evidenceEnvelope": encrypt_evidence(
                key=evidence_key,
                plaintext=semantic["_plaintext"],
                tenant_id=tenant_id,
                run_id=run_id,
                case_key=None,
                record_type="option",
                stable_key=option_key,
                nonce_factory=nonce_factory,
            ),
        })
    if enforce_canonical_controls and counts != EXPECTED:
        raise ReviewMaterializationError("CANONICAL_COUNTS_MISMATCH")
    if counts["candidateCaseCount"] + counts["ambiguousCaseCount"] + counts["unmatchedCaseCount"] != counts["totalCaseCount"]:
        raise ReviewMaterializationError("PARTITION_INVALID")
    if any(record["status"] != "PENDING" for record in records):
        raise ReviewMaterializationError("STATUS_INVALID")

    manifest = {
        "recordType": "manifest",
        "schemaVersion": STREAM_SCHEMA_VERSION,
        "runSchemaVersion": RUN_SCHEMA_VERSION,
        "materializerVersion": MATERIALIZER_VERSION,
        "matcherVersion": ALGORITHM_VERSION,
        "evidencePolicyVersion": EVIDENCE_POLICY_VERSION,
        "encryptionKeyVersion": KEY_VERSION,
        "tenantId": tenant_id,
        "runId": run_id,
        "runDigest": run_digest,
        "semanticDigest": semantic_digest,
        "snapshotAsOf": grh_manifest["snapshot_as_of"],
        "grhSourceSha256": grh_manifest["sha256"],
        "personasSourceSha256": personas_manifest["sha256"],
        "counts": counts,
        "allPending": True,
        "autoApprovalAllowed": False,
        "crosswalkPublished": False,
    }
    return manifest, records


def iter_ndjson(manifest: dict[str, Any], records: Iterable[dict[str, Any]], *, dry_run: bool = False) -> Iterable[str]:
    yield canonical_json(manifest)
    if not dry_run:
        for record in records:
            yield canonical_json(record)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--grh-source", required=True, type=Path)
    parser.add_argument("--personas-source", required=True, type=Path)
    parser.add_argument("--grh-manifest", default=Path("config/grh-source-manifest.json"), type=Path)
    parser.add_argument("--personas-manifest", default=Path("config/personas-source-manifest.json"), type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        hmac_key = decode_key(os.environ.get(HMAC_ENV))
        evidence_key = decode_key(os.environ.get(EVIDENCE_ENV))
        manifest, records = build_review_stream(
            tenant_id=args.tenant_id,
            grh_source=args.grh_source,
            personas_source=args.personas_source,
            grh_manifest_path=args.grh_manifest,
            personas_manifest_path=args.personas_manifest,
            hmac_key=hmac_key,
            evidence_key=evidence_key,
        )
        for line in iter_ndjson(manifest, records, dry_run=args.dry_run):
            sys.stdout.write(line + "\n")
    except Exception:
        sys.stderr.write("[GRH-PERSONAS-REVIEW] MATERIALIZATION_FAILED\n")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
