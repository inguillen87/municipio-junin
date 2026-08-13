import datetime as dt
import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_absence_insights import build_absence_insights


def fixture() -> str:
    catalogue = """CREATE TABLE `motause` (\n  `CODI_21` int,\n  `DETA_21` varchar(200)\n) ENGINE=InnoDB;\nINSERT INTO `motause` VALUES (21,'LICENCIA ANUAL ORDINARIA'),(4,'LICENCIA ESPECIAL POR MATRIMONIO');\n"""
    absence = [
        "CREATE TABLE `ausencia` (",
        "  `CODI_01` int,",
        "  `LEGA_12` int,",
        "  `FAUS_20` date,",
        "  `CODI_21` int,",
        "  `DIAS_24` int",
        ") ENGINE=InnoDB;",
    ]
    rows = []
    for index in range(10):
        rows.append((1, 100 + index, '2024-01-10', 21, 2))
        rows.append((1, 200 + index, '2020-01-10', 21, 1))
    rows.extend([
        (1, 999, '2024-02-10', 4, 3),
        (1, 998, '2024-02-11', 4, 2),
        (1, 997, '2020-02-10', 4, 1),
        (1, 996, '0007-12-30', 21, 9),
    ])
    values = ",".join(
        f"({company},{legajo},'{date}',{reason},{days})"
        for company, legajo, date, reason, days in rows
    )
    return catalogue + "\n".join(absence) + "\nINSERT INTO `ausencia` VALUES " + values + ";\n"


class GrhAbsenceInsightsBuilderTests(unittest.TestCase):
    def test_builds_only_aggregate_periods_and_combines_small_groups(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_test_20260806.sql.gz"
            with gzip.open(source, "wt", encoding="utf-8", newline="") as stream:
                stream.write(fixture())
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            manifest = {
                "canonical_system": "GRH Junín",
                "source_file": source.name,
                "sha256": digest,
                "snapshot_as_of": "2026-08-06",
            }
            result = build_absence_insights(source, manifest)

        self.assertEqual(result["schemaVersion"], "grh-absence-insights-v1")
        self.assertEqual(result["summary"]["rawAbsenceRows"], 24)
        self.assertEqual(result["summary"]["validAbsenceRows"], 23)
        self.assertEqual(result["summary"]["quarantinedRows"], 1)
        self.assertEqual(result["comparison"]["current"], {"events": 12, "people": 12, "days": 25})
        self.assertEqual(result["comparison"]["prior"], {"events": 11, "people": 11, "days": 11})
        self.assertEqual(result["coverage"]["current"]["publishedCategoryEvents"], 10)
        self.assertEqual(result["coverage"]["current"]["protectedEvents"], 2)
        self.assertEqual(result["coverage"]["prior"]["publishedCategoryEvents"], 10)
        self.assertEqual(result["coverage"]["prior"]["protectedEvents"], 1)
        self.assertEqual(result["categories"][0]["label"], "Descanso anual")
        self.assertEqual(result["protectedBucket"]["current"]["people"], 2)
        self.assertEqual(result["protectedBucket"]["prior"]["people"], 1)
        serialized = json.dumps(result, ensure_ascii=False)
        for forbidden in ("LEGA_12", "CODI_01", "LICENCIA ANUAL ORDINARIA", "participant_keys"):
            self.assertNotIn(forbidden, serialized)

    def test_rejects_snapshot_drift_and_unknown_public_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_test_20260806.sql.gz"
            with gzip.open(source, "wt", encoding="utf-8", newline="") as stream:
                stream.write(fixture().replace("(21,'LICENCIA ANUAL ORDINARIA')", "(99,'NUEVO MOTIVO')").replace(",21,", ",99,"))
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            base = {
                "canonical_system": "GRH Junín",
                "source_file": source.name,
                "sha256": digest,
                "snapshot_as_of": "2026-08-06",
            }
            with self.assertRaisesRegex(ValueError, "etiqueta municipal"):
                build_absence_insights(source, base)
            with self.assertRaisesRegex(ValueError, "corte del manifiesto"):
                build_absence_insights(source, {**base, "snapshot_as_of": "2026-08-05"})


if __name__ == "__main__":
    unittest.main()
