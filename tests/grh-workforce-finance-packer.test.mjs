import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const python = process.platform === 'win32' ? 'python' : 'python3';
const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('packer validates through the canonical builder and never prints sealed values', () => {
  const source = readFileSync(
    path.join(repositoryRoot, 'scripts', 'pack_grh_workforce_finance.py'),
    'utf8',
  );
  assert.match(source, /validate_impl:\s*Callable\[\[dict\[str, object\]\], None\]\s*=\s*validate_built_artifact/u);
  assert.match(source, /validate_impl\(artifact\)/u);
  assert.match(source, /validate_canonical_source_contract\(artifact\)/u);
  assert.match(source, /validate_canonical_source_manifest\(artifact, source_manifest_path\)/u);
  assert.match(source, /gzip\.compress\(envelope_bytes, compresslevel=9, mtime=0\)/u);
  assert.doesNotMatch(source, /print\((?:environment|encoded|fragments|envelope)/u);
});

test('packer refuses an implicit deployment target', () => {
  const program = String.raw`
from scripts.pack_grh_workforce_finance import pack_artifact

try:
    pack_artifact({}, tenant_id="tenant-junin", validate_impl=lambda value: None)
    blocked = False
except ValueError as error:
    blocked = str(error) == "pack target invalid"
print("true" if blocked else "false")
`;
  const execution = spawnSync(python, ['-c', program], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), 'true');
});

test('explicit local/test sealing capacity accepts the real governed artifact', () => {
  const program = String.raw`
import json
from pathlib import Path
from scripts.pack_grh_workforce_finance import pack_artifact

artifact = json.loads(Path("api/_data/grh-workforce-finance.json").read_text(encoding="utf-8"))
_, receipt = pack_artifact(artifact, tenant_id="tenant-junin", target="generic_test")
print(json.dumps(receipt, sort_keys=True))
`;
  const execution = spawnSync(python, ['-c', program], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(execution.status, 0, execution.stderr);
  const receipt = JSON.parse(execution.stdout);
  assert.ok(receipt.parts >= 1 && receipt.parts <= 16);
  assert.ok(receipt.compressed_bytes > 0 && receipt.compressed_bytes <= 1024 * 1024);
  assert.equal(receipt.target, 'generic_test');
  assert.ok(receipt.environment_bytes > 0);
  assert.doesNotMatch(execution.stdout, /GRH_WORKFORCE_FINANCE_SEALED_|H4sI|payload/u);
});

test('canonical packer rejects capability, reconciliation, privacy, quality and provenance drift', () => {
  const program = String.raw`
import copy, json
from pathlib import Path
from scripts.build_grh_workforce_finance import release_id
from scripts.pack_grh_workforce_finance import pack_artifact

source = json.loads(Path("api/_data/grh-workforce-finance.json").read_text(encoding="utf-8"))
mutations = []
capability = copy.deepcopy(source)
capability["capabilities"]["cohort_cross_source_reconciliation"] = "released"
mutations.append(capability)
reconciliation = copy.deepcopy(source)
reconciliation["period_totals"][0]["reconciliation"]["matched_runs"] = (
    reconciliation["period_totals"][0]["reconciliation"]["calculation_runs"] + 1
)
mutations.append(reconciliation)
receipt = copy.deepcopy(source)
receipt["quality"]["warnings"] = [
    item for item in receipt["quality"]["warnings"]
    if item != "cross_view_remaining_subset_difference_risks:0"
]
mutations.append(receipt)
accounting = copy.deepcopy(source)
for view in accounting["dimension_views"]:
    for period in view["periods"]:
        if any(
            cell["participant_privacy_status"] == "protected_difference_attack"
            for cell in period["cells"]
        ):
            period["participant_accounting"]["sum_cell_distinct_participants_observed"] = 999
            mutations.append(accounting)
            break
    if len(mutations) == 4:
        break
calculation_type = copy.deepcopy(source)
calculation_type["quality"]["calculation"]["source_rows"] = "banana"
mutations.append(calculation_type)
calculation_rate = copy.deepcopy(source)
calculation_rate["quality"]["calculation"]["valid_rate_pct"] = 999
mutations.append(calculation_rate)
reference_count = copy.deepcopy(source)
reference_count["quality"]["references"][0]["observed_codes"] = -1
mutations.append(reference_count)
assignment_count = copy.deepcopy(source)
assignment_count["quality"]["assignment"]["employee_period_runs"] = -5
mutations.append(assignment_count)
canonical_system = copy.deepcopy(source)
canonical_system["source"]["canonical_system"] = "GRH Mars"
mutations.append(canonical_system)
source_file = copy.deepcopy(source)
source_file["source"]["file"] = "grh_junin.fake.sql.gz"
mutations.append(source_file)
compressed_size = copy.deepcopy(source)
compressed_size["source"]["compressed_size_bytes"] = 1
mutations.append(compressed_size)
generated_at = copy.deepcopy(source)
generated_at["source"]["generated_at"] = "2026-08-11Z"
mutations.append(generated_at)
coordinated_cents = copy.deepcopy(source)
coordinated_cents["period_totals"][0]["components"]["employer_contributions_cents"] += 1
for view in coordinated_cents["dimension_views"]:
    protected = next(
        cell for cell in view["periods"][0]["cells"]
        if cell["privacy_status"] == "protected_aggregate"
    )
    protected["components"]["employer_contributions_cents"] += 1
coordinated_cents["release_id"] = release_id(coordinated_cents)
mutations.append(coordinated_cents)
rejected = []
for artifact in mutations:
    try:
        pack_artifact(artifact, tenant_id="tenant-junin", target="generic_test")
        rejected.append(False)
    except ValueError:
        rejected.append(True)
print(json.dumps({"rejected": rejected}, sort_keys=True))
`;
  const execution = spawnSync(python, ['-c', program], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(JSON.parse(execution.stdout).rejected, Array(13).fill(true));
  assert.doesNotMatch(execution.stdout, /payload|GRH_WORKFORCE_FINANCE_SEALED_|H4sI/u);
});

test('Vercel preflight rejects the governed sealed environment above 64KB', () => {
  const program = String.raw`
import json
from pathlib import Path
from scripts.pack_grh_workforce_finance import pack_artifact

artifact = json.loads(Path("api/_data/grh-workforce-finance.json").read_text(encoding="utf-8"))
try:
    pack_artifact(artifact, tenant_id="tenant-junin", target="vercel")
    blocked = False
except ValueError as error:
    blocked = "environment exceeds target budget" in str(error)
try:
    pack_artifact(
        artifact,
        tenant_id="tenant-junin",
        target="vercel",
        environment_budget_bytes=100000,
    )
    raised_budget_blocked = False
except ValueError as error:
    raised_budget_blocked = "cannot exceed platform limit" in str(error)
_, generic_receipt = pack_artifact(
    artifact,
    tenant_id="tenant-junin",
    target="generic_test",
    environment_budget_bytes=100000,
)
print(json.dumps({
    "blocked": blocked,
    "generic_large_budget_allowed": generic_receipt["environment_budget_bytes"] == 100000,
    "raised_budget_blocked": raised_budget_blocked,
}, sort_keys=True))
`;
  const execution = spawnSync(python, ['-c', program], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(JSON.parse(execution.stdout), {
    blocked: true,
    generic_large_budget_allowed: true,
    raised_budget_blocked: true,
  });
});

test('packer writes an exact tenant-bound fragmented envelope and stdout only exposes its receipt', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'municontrol-workforce-packer-'));
  const output = path.join(temporary, 'sealed.json');
  const program = String.raw`
import json, os, sys
from pathlib import Path
from scripts.pack_grh_workforce_finance import pack_artifact, write_environment_file

artifact = {
    "schema_version": "grh-workforce-finance-source-v1",
    "source": {"sha256": "a" * 64, "snapshot_as_of": "2026-08-06"},
    "private_marker": "Mauricio-legajo-123",
    "entropy": os.urandom(1500).hex(),
}
environment, receipt = pack_artifact(
    artifact,
    tenant_id="tenant-junin",
    part_size=512,
    target="generic_test",
    validate_impl=lambda value: None,
)
write_environment_file(Path(sys.argv[1]), environment)
print(json.dumps(receipt, sort_keys=True))
`;
  try {
    const execution = spawnSync(python, ['-c', program, output], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(execution.status, 0, execution.stderr);
    assert.doesNotMatch(execution.stdout, /Mauricio|legajo|GRH_WORKFORCE_FINANCE_SEALED_|H4sI/u);
    const receipt = JSON.parse(execution.stdout);
    assert.equal(receipt.schema_version, 'grh-workforce-finance-source-v1');
    assert.ok(receipt.parts >= 2 && receipt.parts <= 16);

    const environment = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(environment.GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE, 'sealed');
    assert.equal(Number(environment.GRH_WORKFORCE_FINANCE_SEALED_PARTS), receipt.parts);
    const encoded = Array.from({ length: receipt.parts }, (_, index) => (
      environment[`GRH_WORKFORCE_FINANCE_SEALED_${String(index + 1).padStart(2, '0')}`]
    )).join('');
    const envelope = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
    assert.deepEqual(Object.keys(envelope).sort(), [
      'artifact', 'payload', 'schemaVersion', 'snapshotAsOf', 'sourceSha256', 'tenantId',
    ]);
    assert.equal(envelope.tenantId, 'tenant-junin');
    assert.equal(envelope.artifact, 'workforce_finance');
    assert.equal(envelope.payload.private_marker, 'Mauricio-legajo-123');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
