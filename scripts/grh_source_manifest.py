"""Fail-closed identity gate for the user-approved canonical GRH snapshot."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from typing import Any


MANIFEST_SCHEMA_VERSION = "grh-source-manifest-v1"
MANIFEST_KEYS = {
    "schema_version",
    "canonical_system",
    "source_file",
    "sha256",
    "compressed_size_bytes",
    "snapshot_as_of",
    "excluded_sources",
    "approval_basis",
}
SNAPSHOT_RE = re.compile(r"(?<!\d)(20\d{6})\d*(?!\d)")


def file_sha256(source: Path) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"No existe el manifiesto canónico GRH: {path}") from error
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"El manifiesto canónico GRH no es JSON válido: {path}") from error
    if not isinstance(manifest, dict):
        raise ValueError("El manifiesto canónico GRH debe ser un objeto JSON")
    return manifest


def validate_canonical_source(source: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    """Validate filename, content hash, size and snapshot before extraction."""
    if set(manifest) != MANIFEST_KEYS:
        missing = sorted(MANIFEST_KEYS - set(manifest))
        extra = sorted(set(manifest) - MANIFEST_KEYS)
        raise ValueError(f"Contrato de manifiesto GRH inválido; faltan={missing}, sobran={extra}")
    if manifest["schema_version"] != MANIFEST_SCHEMA_VERSION:
        raise ValueError("Versión de manifiesto GRH no soportada")
    if manifest["canonical_system"] != "GRH Junín":
        raise ValueError("El manifiesto no identifica al sistema canónico GRH Junín")
    if manifest["excluded_sources"] != ["personas_junin"]:
        raise ValueError("El manifiesto debe excluir exclusivamente personas_junin")
    if not isinstance(manifest["approval_basis"], str) or not manifest["approval_basis"].strip():
        raise ValueError("El manifiesto GRH no documenta su base de aprobación")

    source = source.resolve()
    if not source.is_file():
        raise ValueError(f"No existe el backup GRH: {source}")
    source_name = source.name
    if "personas" in source_name.casefold():
        raise ValueError("personas_junin está excluida y no puede generar contratos GRH")
    if source_name != manifest["source_file"]:
        raise ValueError("El nombre del backup no coincide con el manifiesto GRH aprobado")
    if not source_name.lower().endswith(".sql.gz"):
        raise ValueError("El backup canónico GRH debe ser un archivo .sql.gz")

    expected_size = manifest["compressed_size_bytes"]
    if not isinstance(expected_size, int) or expected_size <= 0:
        raise ValueError("El tamaño declarado en el manifiesto GRH es inválido")
    if source.stat().st_size != expected_size:
        raise ValueError("El tamaño del backup no coincide con el manifiesto GRH aprobado")

    expected_hash = manifest["sha256"]
    if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
        raise ValueError("El SHA-256 declarado en el manifiesto GRH es inválido")
    if file_sha256(source) != expected_hash:
        raise ValueError("El SHA-256 del backup no coincide con el manifiesto GRH aprobado")

    try:
        snapshot = dt.date.fromisoformat(manifest["snapshot_as_of"])
    except (TypeError, ValueError) as error:
        raise ValueError("La fecha de snapshot del manifiesto GRH es inválida") from error
    filename_date = SNAPSHOT_RE.search(source_name)
    if not filename_date or dt.datetime.strptime(filename_date.group(1), "%Y%m%d").date() != snapshot:
        raise ValueError("La fecha del archivo no coincide con el snapshot aprobado")
    return manifest


def load_and_validate_canonical_source(source: Path, manifest_path: Path) -> dict[str, Any]:
    return validate_canonical_source(source, load_manifest(manifest_path))
