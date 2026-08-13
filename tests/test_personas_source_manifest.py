import hashlib
import tempfile
import unittest
from pathlib import Path

from scripts.personas_source_manifest import validate_personas_source


def manifest_for(source: Path) -> dict:
    return {
        "schema_version": "personas-source-manifest-v1",
        "source_system": "PERSONAS Junín",
        "source_role": "auxiliary_identity_address_territory",
        "source_file": source.name,
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "compressed_size_bytes": source.stat().st_size,
        "snapshot_as_of": "2026-08-06",
        "canonical_labor_system": "GRH Junín",
        "approval_basis": "Fuente auxiliar aprobada para el test.",
    }


class PersonasSourceManifestTests(unittest.TestCase):
    def test_accepts_exact_auxiliary_source_and_keeps_grh_authoritative(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "personas_junin.backup_2026080615_plataforma.sql.gz"
            source.write_bytes(b"exact personas gzip fixture")
            result = validate_personas_source(source, manifest_for(source))
            self.assertEqual(result["source_role"], "auxiliary_identity_address_territory")
            self.assertEqual(result["canonical_labor_system"], "GRH Junín")

    def test_fails_closed_on_hash_size_name_date_role_or_extra_field_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "personas_junin.backup_2026080615_plataforma.sql.gz"
            source.write_bytes(b"exact personas gzip fixture")
            base = manifest_for(source)
            mutations = [
                {"sha256": "a" * 64},
                {"compressed_size_bytes": source.stat().st_size + 1},
                {"source_file": "personas_junin.other.sql.gz"},
                {"snapshot_as_of": "2026-08-05"},
                {"source_role": "labor_master"},
                {"canonical_labor_system": "PERSONAS Junín"},
                {"extra": True},
            ]
            for mutation in mutations:
                with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                    validate_personas_source(source, {**base, **mutation})


if __name__ == "__main__":
    unittest.main()
