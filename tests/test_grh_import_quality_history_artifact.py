import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_import_quality_history import classify_message


ROOT = Path(__file__).parents[1]
ARTIFACT = ROOT / "api" / "_data" / "grh-import-quality-history.json"
BUILDER = ROOT / "scripts" / "build_grh_import_quality_history.py"
SOURCE = Path(r"C:\Users\guill\Downloads\grh_junin.backup_2026080615_plataforma.sql.gz")
SOURCE_SHA = "e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9"


class GrhImportQualityHistoryArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = ARTIFACT.read_bytes()
        cls.data = json.loads(cls.raw)

    def test_canonical_source_and_all_control_totals_reconcile(self):
        data = self.data
        self.assertEqual(data["schemaVersion"], "grh-import-quality-history-v1")
        self.assertEqual(data["source"]["sourceSha256"], SOURCE_SHA)
        self.assertEqual(data["source"]["firstEventDate"], "2008-10-08")
        self.assertEqual(data["source"]["lastEventDate"], "2026-08-05")
        self.assertEqual(data["totals"], {"incidents": 1_186_239, "importRuns": 4_913})
        self.assertEqual(
            {row["key"]: row["incidents"] for row in data["categories"]},
            {
                "amount_zero": 603_125,
                "quantity_zero": 410_465,
                "dni_without_active_legajo": 116_954,
                "format_or_length": 24_570,
                "dni_multiple_legajos": 4_806,
                "other_technical": 26_319,
            },
        )
        self.assertEqual(sum(row["incidents"] for row in data["categories"]), 1_186_239)
        self.assertEqual(sum(row["incidents"] for row in data["annual"]), 1_186_239)
        self.assertEqual(sum(row["importRuns"] for row in data["annual"]), 4_913)
        self.assertEqual(data["currentPartial"], {
            "year": 2026,
            "incidents": 59_148,
            "importRuns": 202,
            "partial": True,
            "through": "2026-08-05",
        })

    def test_artifact_is_small_aggregate_only_and_withholds_raw_messages(self):
        self.assertLess(len(self.raw), 16 * 1024)
        self.assertEqual(self.data["privacy"], {
            "aggregateOnly": True,
            "containsPii": False,
            "personIdentifiersExported": False,
            "rawRowsExported": False,
            "rawMessagesExported": False,
        })
        serialized = self.raw.decode("utf-8")
        for forbidden in (
            '"dni"', '"cuil"', '"legajo"', '"nroreporte"', '"nrolinea"',
            '"error"', '"rawMessages"', '"message"',
        ):
            self.assertNotIn(forbidden, serialized.casefold())

    def test_classification_is_accent_tolerant_but_does_not_relabel_nonzero_values(self):
        self.assertEqual(classify_message("El importe leído es 0"), "amount_zero")
        self.assertEqual(classify_message("La cantidad leída es 0"), "quantity_zero")
        self.assertEqual(classify_message("El importe leído es 7"), "other_technical")
        self.assertEqual(classify_message("La cantidad leída es -1"), "other_technical")

    @unittest.skipUnless(SOURCE.is_file(), "canonical GRH backup is not available")
    def test_rebuild_from_the_pinned_gzip_is_byte_identical(self):
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(), SOURCE_SHA)
        with tempfile.TemporaryDirectory() as temporary:
            rebuilt = Path(temporary) / "history.json"
            subprocess.run(
                ["python", str(BUILDER), str(SOURCE), "--out", str(rebuilt)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(rebuilt.read_bytes(), self.raw)


if __name__ == "__main__":
    unittest.main()
