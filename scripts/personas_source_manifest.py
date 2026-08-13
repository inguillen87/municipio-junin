"""Fail-closed identity gate for the approved auxiliary PERSONAS snapshot."""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

try:
    from .grh_source_manifest import file_sha256
except ImportError:
    from grh_source_manifest import file_sha256


MANIFEST_SCHEMA_VERSION = "personas-source-manifest-v1"
MANIFEST_KEYS = {
    "schema_version",
    "source_system",
    "source_role",
    "source_file",
    "sha256",
    "compressed_size_bytes",
    "snapshot_as_of",
    "canonical_labor_system",
    "approval_basis",
}
SNAPSHOT_RE = re.compile(r"(?<!\d)(20\d{6})\d*(?!\d)")


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"No existe el manifiesto PERSONAS: {path}") from error
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"El manifiesto PERSONAS no es JSON válido: {path}") from error
    if not isinstance(manifest, dict):
        raise ValueError("El manifiesto PERSONAS debe ser un objeto JSON")
    return manifest


def validate_personas_source(source: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    if set(manifest) != MANIFEST_KEYS:
        missing = sorted(MANIFEST_KEYS - set(manifest))
        extra = sorted(set(manifest) - MANIFEST_KEYS)
        raise ValueError(f"Contrato de manifiesto PERSONAS inválido; faltan={missing}, sobran={extra}")
    if manifest["schema_version"] != MANIFEST_SCHEMA_VERSION:
        raise ValueError("Versión de manifiesto PERSONAS no soportada")
    if manifest["source_system"] != "PERSONAS Junín":
        raise ValueError("El manifiesto no identifica PERSONAS Junín")
    if manifest["source_role"] != "auxiliary_identity_address_territory":
        raise ValueError("PERSONAS debe conservar su rol auxiliar")
    if manifest["canonical_labor_system"] != "GRH Junín":
        raise ValueError("GRH Junín debe conservar la autoridad laboral")
    if not isinstance(manifest["approval_basis"], str) or not manifest["approval_basis"].strip():
        raise ValueError("El manifiesto PERSONAS no documenta su base de aprobación")

    source = source.resolve()
    if not source.is_file():
        raise ValueError(f"No existe el backup PERSONAS: {source}")
    if source.name != manifest["source_file"]:
        raise ValueError("El nombre del backup no coincide con el manifiesto PERSONAS")
    if "personas_junin" not in source.name.casefold() or not source.name.lower().endswith(".sql.gz"):
        raise ValueError("El backup auxiliar debe ser el archivo .sql.gz de personas_junin")
    expected_size = manifest["compressed_size_bytes"]
    if not isinstance(expected_size, int) or expected_size <= 0 or source.stat().st_size != expected_size:
        raise ValueError("El tamaño del backup no coincide con el manifiesto PERSONAS")
    expected_hash = manifest["sha256"]
    if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
        raise ValueError("El SHA-256 del manifiesto PERSONAS es inválido")
    if file_sha256(source) != expected_hash:
        raise ValueError("El SHA-256 del backup no coincide con el manifiesto PERSONAS")
    try:
        snapshot = dt.date.fromisoformat(manifest["snapshot_as_of"])
    except (TypeError, ValueError) as error:
        raise ValueError("La fecha de snapshot PERSONAS es inválida") from error
    filename_date = SNAPSHOT_RE.search(source.name)
    if not filename_date or dt.datetime.strptime(filename_date.group(1), "%Y%m%d").date() != snapshot:
        raise ValueError("La fecha del archivo no coincide con el snapshot PERSONAS")
    return manifest


def load_and_validate_personas_source(source: Path, manifest_path: Path) -> dict[str, Any]:
    return validate_personas_source(source, load_manifest(manifest_path))
