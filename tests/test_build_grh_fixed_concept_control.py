import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_fixed_concept_control import GENERATED_AT, build_fixed_concept_control
from scripts.grh_source_manifest import load_and_validate_canonical_source


REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SOURCE = Path(r"C:\Users\guill\Downloads\grh_junin.backup_2026080615_plataforma.sql.gz")
CANONICAL_MANIFEST = REPO_ROOT / "config" / "grh-source-manifest.json"
CANONICAL_ARTIFACT = REPO_ROOT / "api" / "_data" / "grh-fixed-concept-control.json"
CANONICAL_ARTIFACT_SHA256 = "19fb261158f9c71a6200a6a5522f6a14a43a46eb21cdeaf7c6e933ebe33b7bf8"
CANONICAL_ARTIFACT_SIZE = 6_471


def _quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _insert(table, rows):
    values = ",".join("(" + ",".join(_quote(value) for value in row) + ")" for row in rows)
    return f"INSERT INTO `{table}` VALUES {values};\n"


def fixture(*, duplicate_id=False, small_state=False, shared_identity=False, missing_person=False):
    people = list(range(1001, 1031))
    fixed_rows = []
    for index, employee in enumerate(people):
        if index < 10:
            start = "2024-01-01"
        elif index < 20:
            start = "2020-01-01"
        else:
            start = "2010-01-01"
        fixed_id = 1 if duplicate_id and index == 1 else index + 1
        fixed_rows.append((101, employee, 80, 1, "2050-12-31", start, fixed_id, None, "M", "Autorizado"))

    exact_count = 9 if small_state else 10
    calculation_rows = [
        (101, 2026, 7, "2026-07-31", "M", employee, 80)
        for employee in people[:exact_count]
    ]
    calculation_rows.extend(
        (101, 2026, 7, "2026-07-31", "M", employee, 81)
        for employee in people[10:20]
    )
    if small_state:
        calculation_rows.append((101, 2026, 7, "2026-07-31", "M", people[9], 81))

    return "".join([
        "CREATE TABLE `legajo` (\n  `CODI_01` int,\n  `LEGA_12` int,\n  `IDPERSONA` int\n) ENGINE=InnoDB;\n",
        _insert("legajo", [
            (
                101,
                employee,
                None if missing_person and index == 0
                else 9_001 if shared_identity and index in (0, 10)
                else 9_001 + index,
            )
            for index, employee in enumerate(people)
        ]),
        "CREATE TABLE `concepto` (\n  `CODI_27` int,\n  `DETA_15` varchar(80),\n  `ABRE_15` varchar(20)\n) ENGINE=InnoDB;\n",
        _insert("concepto", [(80, "RESPONSABILIDAD JERARQUICA", "RJ"), (81, "CONCEPTO DE CONTROL", "CC")]),
        "CREATE TABLE `fijos` (\n"
        "  `CODI_01` int,\n  `LEGA_12` int,\n  `CODI_27` int,\n  `IMPO_53` decimal(8,2),\n"
        "  `FVTO_53` date,\n  `FECHA_ALTA` date,\n  `FIJO_ID` int,\n"
        "  `NRO_INSTRUMENTO_LEGAL` varchar(255),\n  `TIPO_MOVIMIENTO` varchar(255),\n  `ESTADO` varchar(255)\n"
        ") ENGINE=InnoDB;\n",
        _insert("fijos", fixed_rows),
        "CREATE TABLE `calculo` (\n"
        "  `CODI_01` int,\n  `PERI_31` int,\n  `MES_31` int,\n  `FECA_31` date,\n"
        "  `TIPO_31` varchar(1),\n  `LEGA_12` int,\n  `CODI_27` int\n"
        ") ENGINE=InnoDB;\n",
        _insert("calculo", calculation_rows),
    ])


class GrhFixedConceptControlBuilderTests(unittest.TestCase):
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
            return build_fixed_concept_control(source, manifest)

    def test_builds_aggregate_reconciliation_without_pii_amounts_or_raw_keys(self):
        result = self._build(fixture())
        self.assertEqual(result["schemaVersion"], "grh-fixed-concept-control-v1")
        self.assertEqual(result["coverage"]["sourceFixedRows"], 30)
        self.assertEqual(result["coverage"]["matchedLegajoRows"], 30)
        self.assertEqual(result["coverage"]["orphanLegajoRows"], 0)
        self.assertEqual(result["coverage"]["calculationRows"], 20)
        self.assertEqual(result["reconciliation"]["eligibleFixedRows"], 30)
        self.assertEqual(
            [(row["rows"], row["people"]) for row in result["reconciliation"]["states"]],
            [(10, 10), (10, 10), (10, 10)],
        )
        self.assertEqual(result["administrationComparison"]["current"]["startRows"], 10)
        self.assertEqual(result["administrationComparison"]["prior"]["startRows"], 10)
        self.assertEqual(result["snapshot"]["categories"]["releasedCategoryCount"], 1)
        self.assertEqual(result["snapshot"]["categories"]["protectedCategoryCount"], 0)

        serialized = json.dumps(result, ensure_ascii=False)
        for forbidden in ('"FIJO_ID":', '"LEGA_12":', '"CODI_01":', '"CODI_27":', '"IMPO_53":', "1001", "1030"):
            self.assertNotIn(forbidden, serialized)
        self.assertFalse(result["privacy"]["containsPii"])
        self.assertFalse(result["privacy"]["personIdentifiersExported"])
        self.assertFalse(result["privacy"]["monetaryAmountsExported"])
        self.assertFalse(result["privacy"]["legalInstrumentValuesExported"])

    def test_fails_closed_on_small_reconciliation_cell_and_duplicate_primary_id(self):
        with self.assertRaisesRegex(ValueError, "Celda pequeña"):
            self._build(fixture(small_state=True))
        with self.assertRaisesRegex(ValueError, "Identificador primario duplicado"):
            self._build(fixture(duplicate_id=True))

    def test_people_cardinalities_resolve_through_grh_person_identity(self):
        result = self._build(fixture(shared_identity=True))
        self.assertEqual(result["reconciliation"]["eligibleFixedRows"], 30)
        self.assertEqual(result["reconciliation"]["eligiblePeople"], 29)
        self.assertEqual([row["people"] for row in result["reconciliation"]["states"]], [10, 10, 10])
        self.assertEqual(result["snapshot"]["eligiblePeople"], 29)
        self.assertEqual(result["snapshot"]["categories"]["rows"][0]["people"], 29)

    def test_fails_closed_when_matched_employment_has_no_grh_person_identity(self):
        with self.assertRaisesRegex(ValueError, "no posee IDPERSONA GRH válido"):
            self._build(fixture(missing_person=True))


class GrhFixedConceptControlArtifactTests(unittest.TestCase):
    def test_committed_artifact_is_canonical_compact_and_contains_no_sensitive_grain(self):
        artifact = Path(__file__).resolve().parents[1] / "api" / "_data" / "grh-fixed-concept-control.json"
        raw = artifact.read_text(encoding="utf-8")
        result = json.loads(raw)
        self.assertEqual(
            result["source"]["sourceSha256"],
            "e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9",
        )
        self.assertEqual(result["coverage"]["sourceFixedRows"], 8_729)
        self.assertEqual(result["coverage"]["validRangeRows"], 8_066)
        self.assertEqual(result["coverage"]["endBeforeStartRows"], 661)
        self.assertEqual(result["coverage"]["calculationRows"], 29_395)
        self.assertEqual(result["reconciliation"]["eligibleFixedRows"], 191)
        self.assertEqual([row["rows"] for row in result["reconciliation"]["states"]], [94, 19, 78])
        self.assertEqual(result["snapshot"]["eligibleFixedRows"], 193)
        self.assertEqual(result["snapshot"]["legalInstrumentReportedRows"], 0)
        self.assertEqual(result["administrationComparison"]["current"]["startRows"], 60)
        self.assertEqual(result["administrationComparison"]["prior"]["startRows"], 423)
        self.assertEqual(raw, json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        for forbidden in (
            '"FIJO_ID"', '"LEGA_12"', '"CODI_01"', '"CODI_27"', '"IMPO_53"',
            '"NRO_INSTRUMENTO_LEGAL":', '"employeeId":',
        ):
            self.assertNotIn(forbidden, raw)

    @unittest.skipUnless(CANONICAL_SOURCE.is_file(), "El respaldo canónico GRH no está disponible localmente")
    def test_canonical_source_rebuilds_twice_byte_identically_to_committed_artifact(self):
        manifest = load_and_validate_canonical_source(CANONICAL_SOURCE, CANONICAL_MANIFEST)

        def rebuild_bytes():
            result = build_fixed_concept_control(
                CANONICAL_SOURCE,
                manifest,
                generated_at=GENERATED_AT,
                enforce_canonical_controls=True,
            )
            return json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

        first = rebuild_bytes()
        second = rebuild_bytes()
        committed = CANONICAL_ARTIFACT.read_bytes()
        self.assertEqual(first, second)
        self.assertEqual(first, committed)
        self.assertEqual(len(committed), CANONICAL_ARTIFACT_SIZE)
        self.assertEqual(hashlib.sha256(committed).hexdigest(), CANONICAL_ARTIFACT_SHA256)


if __name__ == "__main__":
    unittest.main()
