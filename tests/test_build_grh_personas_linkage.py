import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_personas_linkage import (
    build_linkage_readiness,
    normalize_cuil,
    normalize_dni,
    normalize_name,
    person_from_row,
)
from scripts.grh_source_manifest import load_and_validate_canonical_source
from scripts.personas_source_manifest import load_and_validate_personas_source


ROOT = Path(__file__).parents[1]
ARTIFACT = ROOT / "api" / "_data" / "grh-personas-linkage-readiness.json"
GRH_SOURCE = Path.home() / "Downloads" / "grh_junin.backup_2026080615_plataforma.sql.gz"
PERSONAS_SOURCE = Path.home() / "Downloads" / "personas_junin.backup_2026080615_plataforma.sql.gz"


class LinkageNormalizationTests(unittest.TestCase):
    def test_normalizers_are_deterministic_and_never_use_fuzzy_names(self):
        self.assertEqual(normalize_cuil("20-06891233-5"), "20068912335")
        self.assertIsNone(normalize_cuil("20-06891233-4"))
        self.assertEqual(normalize_dni("06.891.233"), "6891233")
        self.assertEqual(normalize_name("  José   Pérez-Sosa  "), "JOSE PEREZ-SOSA")

    def test_personas_dni_fallback_is_used_only_when_nudo_is_missing(self):
        base = {
            "IDPERSONA": "1", "NOMB_12": "Persona de prueba", "FENA_12": "2000-01-01",
            "CUIL_12": "20068912335",
        }
        self.assertEqual(person_from_row({**base, "NUDO_12": "0"}, source="personas").dni, "6891233")
        self.assertIsNone(person_from_row({**base, "NUDO_12": "1234"}, source="personas").dni)

    def test_published_artifact_contains_only_aggregate_controls(self):
        data = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        self.assertEqual(data["reconciliation"]["candidates"], 1699)
        self.assertEqual(data["reconciliation"]["ambiguous"], 157)
        self.assertEqual(data["reconciliation"]["unmatched"], 493)
        self.assertEqual(data["reconciliation"]["targetCollisions"], 0)
        self.assertEqual(data["reconciliation"]["ambiguousBreakdown"]["promotedFromNameOnly"], 0)
        self.assertFalse(data["algorithm"]["nameOnlyMatching"])
        self.assertFalse(data["algorithm"]["sexEvidenceUsed"])
        self.assertFalse(data["idPersonaControl"]["joinAllowed"])
        self.assertEqual(data["idPersonaControl"]["overlappingValues"], 6)
        self.assertEqual(data["idPersonaControl"]["concordantIdentities"], 0)
        serialized = json.dumps(data, ensure_ascii=False)
        for forbidden in ("NOMB_12", "NUDO_12\":", "CUIL_12\":", "persona_IDPERSONA", "TELE_12", "domicilioString"):
            self.assertNotIn(forbidden, serialized)

    @unittest.skipUnless(GRH_SOURCE.is_file() and PERSONAS_SOURCE.is_file(), "exact municipal backups are not present")
    def test_real_backups_rebuild_the_artifact_byte_for_byte(self):
        grh_manifest = load_and_validate_canonical_source(GRH_SOURCE, ROOT / "config" / "grh-source-manifest.json")
        personas_manifest = load_and_validate_personas_source(PERSONAS_SOURCE, ROOT / "config" / "personas-source-manifest.json")
        rebuilt = build_linkage_readiness(
            GRH_SOURCE, PERSONAS_SOURCE, grh_manifest, personas_manifest,
            enforce_canonical_controls=True,
        )
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "rebuilt.json"
            output.write_text(json.dumps(rebuilt, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
            self.assertEqual(output.read_bytes(), ARTIFACT.read_bytes())


if __name__ == "__main__":
    unittest.main()
