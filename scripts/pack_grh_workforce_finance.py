"""Validate and seal one tenant-bound GRH workforce-finance source artifact.

The command requires an explicit target. ``generic_test`` writes portable
local/test fragments; ``vercel`` enforces the platform environment ceiling and
fails when the artifact cannot be deployed there. Stdout contains only a
non-sensitive receipt; it never prints the artifact or base64 payload.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Callable

try:
    from .build_grh_workforce_finance import (
        SOURCE_SCHEMA_VERSION,
        validate_built_artifact,
    )
except ImportError:  # Direct execution
    from build_grh_workforce_finance import (
        SOURCE_SCHEMA_VERSION,
        validate_built_artifact,
    )


ARTIFACT_KEY = "workforce_finance"
TENANT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MIN_PART_SIZE = 512
MAX_PART_SIZE = 32768
MAX_PARTS = 16
VERCEL_ENV_BUDGET_BYTES = 65536
DEFAULT_SOURCE_MANIFEST = (
    Path(__file__).resolve().parents[1] / "config" / "grh-source-manifest.json"
)


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def source_identity(artifact: dict[str, object]) -> tuple[str, str]:
    source = artifact.get("source")
    if not isinstance(source, dict):
        raise ValueError("workforce-finance source identity missing")
    source_sha256 = source.get("sha256")
    snapshot_as_of = source.get("snapshot_as_of")
    if not isinstance(source_sha256, str) or not SHA256_RE.fullmatch(source_sha256):
        raise ValueError("workforce-finance source sha256 invalid")
    if not isinstance(snapshot_as_of, str) or not DATE_RE.fullmatch(snapshot_as_of):
        raise ValueError("workforce-finance snapshot invalid")
    return source_sha256, snapshot_as_of


def validate_canonical_source_contract(artifact: dict[str, object]) -> None:
    node = shutil.which("node")
    if not node:
        raise ValueError("canonical workforce-finance inspector unavailable")
    contract_uri = (
        Path(__file__).resolve().parents[1] /
        "api" / "lib" / "grh-workforce-finance-source-contract.js"
    ).as_uri()
    program = f"""
import {{
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  inspectGrhWorkforceFinanceSourceContract,
}} from {json.dumps(contract_uri)};
let input = '';
for await (const chunk of process.stdin) input += chunk;
let value;
try {{ value = JSON.parse(input); }} catch {{ process.exit(2); }}
const inspection = inspectGrhWorkforceFinanceSourceContract(value);
if (!inspection.ok) process.exit(3);
if (value.release_id !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID) process.exit(4);
process.stdout.write('ok');
"""
    try:
        execution = subprocess.run(
            [node, "--input-type=module", "--eval", program],
            input=canonical_json_bytes(artifact).decode("utf-8"),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise ValueError("canonical workforce-finance inspection failed") from error
    if execution.returncode != 0 or execution.stdout != "ok":
        raise ValueError("canonical workforce-finance contract rejected artifact")


def validate_canonical_source_manifest(
    artifact: dict[str, object],
    manifest_path: Path,
) -> None:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("canonical GRH source manifest unavailable") from error
    if not isinstance(manifest, dict) or manifest.get("schema_version") != "grh-source-manifest-v1":
        raise ValueError("canonical GRH source manifest invalid")
    source = artifact.get("source")
    if not isinstance(source, dict):
        raise ValueError("workforce-finance source identity missing")
    expected = {
        "canonical_system": manifest.get("canonical_system"),
        "file": manifest.get("source_file"),
        "sha256": manifest.get("sha256"),
        "compressed_size_bytes": manifest.get("compressed_size_bytes"),
        "snapshot_as_of": manifest.get("snapshot_as_of"),
    }
    if any(source.get(key) != value for key, value in expected.items()):
        raise ValueError("workforce-finance source manifest identity mismatch")


def pack_artifact(
    artifact: dict[str, object],
    *,
    tenant_id: str,
    part_size: int = MAX_PART_SIZE,
    target: str | None = None,
    environment_budget_bytes: int | None = None,
    source_manifest_path: Path = DEFAULT_SOURCE_MANIFEST,
    validate_impl: Callable[[dict[str, object]], None] = validate_built_artifact,
) -> tuple[dict[str, str], dict[str, object]]:
    if not isinstance(artifact, dict):
        raise ValueError("workforce-finance artifact must be an object")
    if not TENANT_ID_RE.fullmatch(tenant_id):
        raise ValueError("tenant id invalid")
    if not isinstance(part_size, int) or not MIN_PART_SIZE <= part_size <= MAX_PART_SIZE:
        raise ValueError("part size invalid")
    if target not in {"generic_test", "vercel"}:
        raise ValueError("pack target invalid")
    if environment_budget_bytes is not None and (
        not isinstance(environment_budget_bytes, int) or
        isinstance(environment_budget_bytes, bool) or
        environment_budget_bytes <= 0
    ):
        raise ValueError("environment budget invalid")

    validate_impl(artifact)
    if validate_impl is validate_built_artifact:
        validate_canonical_source_contract(artifact)
        validate_canonical_source_manifest(artifact, source_manifest_path)
    if artifact.get("schema_version") != SOURCE_SCHEMA_VERSION:
        raise ValueError("workforce-finance schema version invalid")
    source_sha256, snapshot_as_of = source_identity(artifact)
    envelope = {
        "artifact": ARTIFACT_KEY,
        "payload": artifact,
        "schemaVersion": SOURCE_SCHEMA_VERSION,
        "snapshotAsOf": snapshot_as_of,
        "sourceSha256": source_sha256,
        "tenantId": tenant_id,
    }
    envelope_bytes = canonical_json_bytes(envelope)
    compressed = gzip.compress(envelope_bytes, compresslevel=9, mtime=0)
    encoded = base64.b64encode(compressed).decode("ascii")
    fragments = [encoded[index:index + part_size] for index in range(0, len(encoded), part_size)]
    if not fragments or len(fragments) > MAX_PARTS:
        raise ValueError("sealed workforce-finance artifact exceeds fragment limit")

    output = {"GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE": "sealed"}
    if len(fragments) == 1:
        output["GRH_WORKFORCE_FINANCE_SEALED_BASE64"] = fragments[0]
    else:
        output["GRH_WORKFORCE_FINANCE_SEALED_PARTS"] = str(len(fragments))
        output.update({
            f"GRH_WORKFORCE_FINANCE_SEALED_{index:02d}": fragment
            for index, fragment in enumerate(fragments, start=1)
        })
    environment_bytes = sum(
        len(key.encode("utf-8")) + len(value.encode("utf-8")) + 2
        for key, value in output.items()
    )
    if target == "vercel" and (
        environment_budget_bytes is not None and
        environment_budget_bytes > VERCEL_ENV_BUDGET_BYTES
    ):
        raise ValueError("Vercel environment budget cannot exceed platform limit")
    effective_budget = (
        min(
            environment_budget_bytes
            if environment_budget_bytes is not None else VERCEL_ENV_BUDGET_BYTES,
            VERCEL_ENV_BUDGET_BYTES,
        )
        if target == "vercel" else environment_budget_bytes
    )
    if effective_budget is not None and environment_bytes > effective_budget:
        raise ValueError("sealed workforce-finance environment exceeds target budget")

    receipt = {
        "schema_version": SOURCE_SCHEMA_VERSION,
        "artifact": ARTIFACT_KEY,
        "tenant_hash": hashlib.sha256(tenant_id.encode("utf-8")).hexdigest(),
        "source_sha256": source_sha256,
        "snapshot_as_of": snapshot_as_of,
        "envelope_sha256": hashlib.sha256(envelope_bytes).hexdigest(),
        "compressed_sha256": hashlib.sha256(compressed).hexdigest(),
        "expanded_bytes": len(envelope_bytes),
        "compressed_bytes": len(compressed),
        "base64_bytes": len(encoded),
        "parts": len(fragments),
        "target": target,
        "environment_bytes": environment_bytes,
        "environment_budget_bytes": effective_budget,
    }
    return output, receipt


def write_environment_file(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(values, ensure_ascii=True, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--part-size", type=int, default=MAX_PART_SIZE)
    parser.add_argument("--target", choices=("generic_test", "vercel"), required=True)
    parser.add_argument("--environment-budget-bytes", type=int)
    args = parser.parse_args()

    artifact = json.loads(args.source.read_text(encoding="utf-8"))
    environment, receipt = pack_artifact(
        artifact,
        tenant_id=args.tenant_id,
        part_size=args.part_size,
        target=args.target,
        environment_budget_bytes=args.environment_budget_bytes,
    )
    write_environment_file(args.out, environment)
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
