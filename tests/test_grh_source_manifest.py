import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.grh_source_manifest import validate_canonical_source


def manifest_for(source: Path) -> dict:
    return {
        "schema_version": "grh-source-manifest-v1",
        "canonical_system": "GRH Junín",
        "source_file": source.name,
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "compressed_size_bytes": source.stat().st_size,
        "snapshot_as_of": "2026-08-06",
        "excluded_sources": ["personas_junin"],
        "approval_basis": "Fixture aprobada para prueba",
    }


class GrhSourceManifestTests(unittest.TestCase):
    def test_accepts_only_exact_approved_source_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_junin.backup_2026080615_plataforma.sql.gz"
            source.write_bytes(b"approved-grh")
            manifest = manifest_for(source)
            self.assertEqual(validate_canonical_source(source, manifest), manifest)

    def test_rejects_personas_source_even_with_self_consistent_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "personas_junin.backup_2026080615_plataforma.sql.gz"
            source.write_bytes(b"personas")
            with self.assertRaisesRegex(ValueError, "personas_junin"):
                validate_canonical_source(source, manifest_for(source))

    def test_rejects_renamed_or_modified_dump_without_manifest_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_junin.backup_2026080615_plataforma.sql.gz"
            source.write_bytes(b"approved-grh")
            manifest = manifest_for(source)

            renamed = Path(directory) / "grh_junin.backup_2026080615_copia.sql.gz"
            renamed.write_bytes(source.read_bytes())
            with self.assertRaisesRegex(ValueError, "nombre"):
                validate_canonical_source(renamed, manifest)

            source.write_bytes(b"personas-renamed-as-grh")
            with self.assertRaisesRegex(ValueError, "tamaño|SHA-256"):
                validate_canonical_source(source, manifest)

    def test_manifest_contract_rejects_extra_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_junin.backup_2026080615_plataforma.sql.gz"
            source.write_bytes(b"approved-grh")
            manifest = manifest_for(source)
            manifest["raw_payload"] = json.dumps({"dni": "12345678"})
            with self.assertRaisesRegex(ValueError, "sobran"):
                validate_canonical_source(source, manifest)


if __name__ == "__main__":
    unittest.main()
