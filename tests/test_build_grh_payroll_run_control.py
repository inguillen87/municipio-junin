import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_payroll_run_control import build_payroll_run_control


def _quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _insert(table, rows):
    values = ",".join("(" + ",".join(_quote(value) for value in row) + ")" for row in rows)
    return f"INSERT INTO `{table}` VALUES {values};\n"


def fixture():
    return "".join([
        "CREATE TABLE `histocal` (\n",
        "  `CODI_01` int,\n  `PERI_31` int,\n  `MES_31` int,\n",
        "  `FECA_31` date,\n  `TIPO_31` varchar(1),\n  `CIER_31` int,\n",
        ") ENGINE=InnoDB;\n",
        _insert("histocal", [
            (1, 2026, 2, "2026-02-28", "M", 1),
            (1, 2026, 3, "2026-03-31", "M", None),
            # Month mismatch stays valid; only the year/date identity is a
            # quarantine condition in this contract.
            (1, 2026, 4, "2026-03-31", "X", 1),
            (1, 2223, 1, "2223-01-31", "M", 1),
        ]),
        "CREATE TABLE `calculo` (\n",
        "  `CODI_01` int,\n  `PERI_31` int,\n  `MES_31` int,\n",
        "  `FECA_31` date,\n  `TIPO_31` varchar(1),\n  `LEGA_12` int,\n",
        "  `CODI_27` int,\n  `IMPO_31` decimal(15,2),\n",
        ") ENGINE=InnoDB;\n",
        _insert("calculo", [
            (1, 2026, 2, "2026-02-28", "M", 9001, 998, 123.45),
            (1, 2026, 4, "2026-03-31", "X", 9002, 998, 50),
            (1, 2223, 1, "2223-01-31", "M", 9003, 998, 75),
        ]),
        "CREATE TABLE `liquidacionlog` (\n",
        "  `id` bigint,\n  `cantidadFalso` varchar(20),\n  `cantidadVerdadero` varchar(20),\n",
        "  `codi_01` bigint,\n  `condicion` varchar(20),\n  `denominacion` varchar(20),\n",
        "  `feca_31` datetime,\n  `lega_12` bigint,\n  `mes_31` bigint,\n",
        "  `peri_31` bigint,\n  `tipo_31` varchar(20),\n  `unidad` varchar(20),\n",
        ") ENGINE=InnoDB;\n",
        _insert("liquidacionlog", [
            (1, "raw false", "raw true", 1, "raw condition", "raw denomination", "2026-02-28 10:00:00", 9001, 2, 2026, "M", "raw unit"),
        ]),
    ])


class GrhPayrollRunControlBuilderTests(unittest.TestCase):
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
            return build_payroll_run_control(source, manifest)

    def test_builds_only_aggregate_run_controls_and_keeps_month_mismatch_diagnostic(self):
        result = self._build(fixture())
        self.assertEqual(result["schemaVersion"], "grh-payroll-run-control-v1")
        self.assertEqual(result["coverage"]["sourceRunHeaders"], 4)
        self.assertEqual(result["coverage"]["validRunHeaders"], 3)
        self.assertEqual(result["coverage"]["quarantinedRunHeaders"], 1)
        self.assertEqual(result["coverage"]["calculationRunKeys"], 3)
        self.assertEqual(result["coverage"]["orphanCalculationRunKeys"], 0)
        self.assertEqual(result["coverage"]["validHeadersWithCalculation"], 2)
        self.assertEqual(result["coverage"]["validHeadersWithoutCalculation"], 1)
        self.assertEqual(result["monthly"][-1]["period"], "2026-04")
        self.assertEqual(result["monthly"][-1]["firstEffectiveDate"], "2026-03-31")
        self.assertEqual(result["quarantine"]["calculationRows"], 1)
        self.assertEqual(result["logCoverage"]["sourceRows"], 1)
        self.assertEqual(result["logCoverage"]["joinedRunKeys"], 1)

        serialized = json.dumps(result, ensure_ascii=False)
        for forbidden in (
            "9001", "9002", "9003", "123.45", "raw condition",
            "raw denomination", "raw false", "raw true", "raw unit",
        ):
            self.assertNotIn(forbidden, serialized)
        self.assertFalse(result["privacy"]["personIdentifiersExported"])
        self.assertFalse(result["privacy"]["monetaryAmountsExported"])
        self.assertFalse(result["privacy"]["rawTechnicalLogsExported"])

    def test_rejects_duplicate_run_headers_and_unknown_close_values(self):
        duplicate = fixture().replace(
            "(1,2026,3,'2026-03-31','M',NULL)",
            "(1,2026,2,'2026-02-28','M',1)",
        )
        with self.assertRaisesRegex(ValueError, "duplicada"):
            self._build(duplicate)

        unknown_close = fixture().replace(
            "(1,2026,3,'2026-03-31','M',NULL)",
            "(1,2026,3,'2026-03-31','M',2)",
        )
        with self.assertRaisesRegex(ValueError, "Marca de cierre"):
            self._build(unknown_close)


class GrhPayrollRunControlArtifactTests(unittest.TestCase):
    def test_committed_artifact_is_pinned_aggregate_and_reconciled(self):
        artifact = Path(__file__).resolve().parents[1] / "api" / "_data" / "grh-payroll-run-control.json"
        result = json.loads(artifact.read_text(encoding="utf-8"))
        self.assertEqual(result["source"]["sourceSha256"], "e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9")
        self.assertEqual(result["coverage"]["sourceRunHeaders"], 625)
        self.assertEqual(result["coverage"]["validRunHeaders"], 612)
        self.assertEqual(result["coverage"]["quarantinedRunHeaders"], 13)
        self.assertEqual(result["coverage"]["validHeadersWithCalculation"], 600)
        self.assertEqual(result["coverage"]["validHeadersWithoutCalculation"], 12)
        self.assertEqual(result["coverage"]["calculationRunKeys"], 611)
        self.assertEqual(result["coverage"]["orphanCalculationRunKeys"], 0)
        self.assertEqual(result["quarantine"]["calculationRows"], 20_270)
        self.assertEqual(result["currentYear"]["runHeaders"], 26)
        self.assertTrue(result["currentYear"]["allObservedRunsHaveCalculation"])
        self.assertTrue(result["currentYear"]["allObservedRunsHaveCloseFlag"])
        self.assertEqual(result["logCoverage"]["sourceRows"], 122)
        serialized = json.dumps(result, ensure_ascii=False)
        for forbidden in ("LEGA_12", "lega_12", "IMPO_31", "condicion", "denominacion", "cantidadFalso"):
            self.assertNotIn(forbidden, serialized)


if __name__ == "__main__":
    unittest.main()
