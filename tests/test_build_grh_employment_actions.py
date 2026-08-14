import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_employment_actions import build_employment_actions


FOJA_COLUMNS = [
    "CODI_01", "LEGA_12", "FECH_FJ", "INST_FJ", "nins_fj",
    "MOTI_FJ", "codi_fj", "MOTI_FJ_DETA",
]


def _quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def fixture(*, unknown_code=False):
    lines = [
        "CREATE TABLE `foja` (\n",
        *(f"  `{column}` varchar(255),\n" for column in FOJA_COLUMNS),
        ") ENGINE=InnoDB;\n",
    ]
    rows = []
    # One initially protected category (9 persons), plus one publishable
    # category. Complementary suppression must hide both.
    for employee in range(1, 21):
        code = 99 if unknown_code and employee == 1 else 18
        rows.append((1, employee, "2024-01-10", "RES", f"N-{employee}", code, "DOC", "raw label secret"))
    for employee in range(1, 11):
        rows.append((1, employee, "2020-01-10", "RES", f"P-{employee}", 18, "DOC", "raw label secret"))
    for employee in range(21, 30):
        rows.append((1, employee, "2024-02-10", "RES", f"C-{employee}", 24, "DOC", "raw label secret"))
    values = ",".join("(" + ",".join(_quote(value) for value in row) + ")" for row in rows)
    lines.append("INSERT INTO `foja` VALUES " + values + ";\n")
    lines.extend([
        "CREATE TABLE `legajo` (\n",
        "  `CODI_01` int,\n",
        "  `LEGA_12` int,\n",
        "  `IDPERSONA` int,\n",
        ") ENGINE=InnoDB;\n",
        # Employees 1 and 21 deliberately belong to the same GRH person. This
        # proves participant cardinality is not a count of employment keys.
        "INSERT INTO `legajo` VALUES " + ",".join(
            f"(1,{employee},{1 if employee in (1, 21) else employee})"
            for employee in range(1, 30)
        ) + ";\n",
    ])
    return "".join(lines)


class GrhEmploymentActionsBuilderTests(unittest.TestCase):
    def _build(self, text):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_test.sql.gz"
            with gzip.open(source, "wt", encoding="utf-8", newline="") as stream:
                stream.write(text)
            manifest = {
                "canonical_system": "GRH Junín",
                "source_file": source.name,
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "snapshot_as_of": "2026-08-06",
            }
            return build_employment_actions(source, manifest)

    def test_builds_only_aggregate_windows_with_complementary_suppression(self):
        result = self._build(fixture())
        self.assertEqual(result["schemaVersion"], "grh-employment-actions-v1")
        self.assertEqual(result["comparison"]["current"]["actionEvents"], 29)
        self.assertEqual(result["comparison"]["prior"]["actionEvents"], 10)
        self.assertEqual(result["comparison"]["deltas"]["actionEvents"], 19)
        self.assertEqual(result["comparison"]["current"]["distinctPersons"], 28)
        self.assertEqual(result["comparison"]["prior"]["distinctPersons"], 10)
        self.assertEqual(result["comparison"]["deltas"]["distinctPersons"], 18)
        self.assertEqual(result["periods"]["current"]["days"], 972)
        self.assertEqual(result["periods"]["prior"]["days"], 972)
        self.assertEqual(result["protectedBucket"]["categoryCount"], 2)
        self.assertEqual(result["protectedBucket"]["deltas"]["events"], 19)
        self.assertEqual(result["categories"], [])
        self.assertEqual(result["classification"]["totalWindowEvents"], 39)
        self.assertEqual(result["classification"]["classifiedWindowEvents"], 39)
        serialized = json.dumps(result, ensure_ascii=False)
        for forbidden in ("raw label secret", "N-1", "P-1", "C-21", "CODI_01", "LEGA_12"):
            self.assertNotIn(forbidden, serialized)
        self.assertFalse(result["privacy"]["instrumentValuesExported"])
        self.assertFalse(result["privacy"]["observationsExported"])
        self.assertFalse(result["privacy"]["userValuesExported"])

    def test_rejects_an_unclassified_action_inside_a_comparison_window(self):
        with self.assertRaisesRegex(ValueError, "clasificación gobernada en ventana"):
            self._build(fixture(unknown_code=True))

    def test_requires_the_governed_legajo_person_link(self):
        source = fixture().replace("  `IDPERSONA` int,\n", "")
        with self.assertRaisesRegex(ValueError, "Estructura requerida ausente en legajo"):
            self._build(source)

    def test_rejects_an_action_key_without_a_valid_grh_person(self):
        source = fixture().replace("(1,1,1)", "(1,1,NULL)")
        with self.assertRaisesRegex(ValueError, "no posee IDPERSONA GRH válido"):
            self._build(source)


class GrhEmploymentActionsArtifactTests(unittest.TestCase):
    def test_committed_artifact_is_pinned_aggregate_and_exhaustive(self):
        artifact = Path(__file__).resolve().parents[1] / "api" / "_data" / "grh-employment-actions.json"
        result = json.loads(artifact.read_text(encoding="utf-8"))
        self.assertEqual(result["source"]["sourceSha256"], "e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9")
        self.assertEqual(result["coverage"], {
            "sourceRows": 9481,
            "validRows": 9478,
            "quarantineRows": 3,
            "matchedRows": 9481,
            "orphanRows": 0,
            "distinctEmployeeKeys": 1302,
            "validDateRatePct": 99.9684,
            "joinIntegrityPct": 100.0,
        })
        self.assertEqual(result["comparison"]["current"]["actionEvents"], 3882)
        self.assertEqual(result["comparison"]["prior"]["actionEvents"], 3226)
        self.assertEqual(result["comparison"]["current"]["distinctPersons"], 714)
        self.assertEqual(result["comparison"]["prior"]["distinctPersons"], 631)
        self.assertEqual(result["comparison"]["deltas"]["distinctPersons"], 83)
        self.assertEqual(result["protectedBucket"]["categoryCount"], 9)
        self.assertEqual(result["classification"]["releasedCategoryCount"], 13)
        self.assertEqual(result["classification"]["totalWindowEvents"], 7108)
        self.assertEqual(result["classification"]["classifiedWindowEvents"], 7108)
        serialized = json.dumps(result, ensure_ascii=False)
        for forbidden in ("obse_fj", "USER_FJ", "nins_fj", "DETA_FJ", "MOTI_FJ_DETA"):
            self.assertNotIn(forbidden, serialized)


if __name__ == "__main__":
    unittest.main()
