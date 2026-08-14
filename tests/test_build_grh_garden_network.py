import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_garden_network import (
    build_garden_network,
    serialize_garden_network,
)


def _quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _periods():
    periods = []
    year, month = 2024, 8
    for _index in range(24):
        periods.append((year, month))
        month += 1
        if month == 13:
            year += 1
            month = 1
    return periods


def fixture(*, ambiguous_person=False, missing_person_link=False):
    calculation_rows = []
    for year, month in _periods():
        for person in range(1, 21):
            if person <= 10:
                sector = 10  # Amanecer.
            elif person <= 19:
                sector = 11  # Del Sol, protected in this fixture.
            else:
                sector = 21  # Generic temporary assignment, no specific unit.
            calculation_rows.append((1, year, month, person, 5, sector))
        # Same person and month, second employment key. The generic garden
        # sector must never become a unit and the person must remain one.
        calculation_rows.append((1, year, month, 101, 5, 11 if ambiguous_person else 20))

    legajo_rows = [
        (1, employee, 1000 + employee)
        for employee in range(1, 21)
        if not (missing_person_link and employee == 20)
    ]
    legajo_rows.append((1, 101, 1001))
    sector_rows = [
        (1, 10, "AMANECER"),
        (1, 11, "DEL SOL"),
        (1, 20, "DOCENTES JARDINES MATERNALES"),
        (1, 21, "TEMPORARIOS"),
    ]

    lines = [
        "CREATE TABLE `calculo` (\n",
        "  `CODI_01` int,\n", "  `PERI_31` int,\n", "  `MES_31` int,\n",
        "  `LEGA_12` int,\n", "  `CODI_02` int,\n", "  `CODI_07` int,\n",
        ") ENGINE=InnoDB;\n",
        "INSERT INTO `calculo` VALUES " + ",".join(
            "(" + ",".join(_quote(value) for value in row) + ")"
            for row in calculation_rows
        ) + ";\n",
        "CREATE TABLE `legajo` (\n",
        "  `CODI_01` int,\n", "  `LEGA_12` int,\n", "  `IDPERSONA` int,\n",
        ") ENGINE=InnoDB;\n",
        "INSERT INTO `legajo` VALUES " + ",".join(
            "(" + ",".join(_quote(value) for value in row) + ")"
            for row in legajo_rows
        ) + ";\n",
        "CREATE TABLE `sectores` (\n",
        "  `CODI_01` int,\n", "  `CODI_07` int,\n", "  `DETA_07` varchar(255),\n",
        ") ENGINE=InnoDB;\n",
        "INSERT INTO `sectores` VALUES " + ",".join(
            "(" + ",".join(_quote(value) for value in row) + ")"
            for row in sector_rows
        ) + ";\n",
    ]
    return "".join(lines)


class GrhGardenNetworkBuilderTests(unittest.TestCase):
    def _build(self, text):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_fixture_20260806.sql.gz"
            with gzip.open(source, "wt", encoding="utf-8", newline="") as stream:
                stream.write(text)
            manifest = {
                "canonical_system": "GRH Junín",
                "source_file": source.name,
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "snapshot_as_of": "2026-08-06",
            }
            return build_garden_network(source, manifest)

    def test_deduplicates_generic_and_specific_employments_before_assigning_one_unit(self):
        result = self._build(fixture())
        self.assertEqual(result["schemaVersion"], "grh-garden-network-v1")
        self.assertEqual(result["quality"]["assignmentPolicyVersion"],
                         "grh-garden-network-assignment-v1")
        self.assertEqual(result["quality"]["sourceEmploymentKeys"], 21)
        self.assertEqual(result["summary"]["people"], 20)
        self.assertNotIn("assignedPeople", result["quality"])
        self.assertNotIn("unassignedPeople", result["quality"])
        self.assertNotIn("assignedPeople", result["summary"])
        self.assertNotIn("unassignedPeople", result["summary"])
        self.assertEqual(result["releasedUnits"], [
            {"label": "Amanecer", "people": 10, "sharePct": 50.0},
        ])
        self.assertEqual(result["protectedBucket"], {
            "label": "Otros jardines y sin unidad específica",
            "people": 10,
            "sharePct": 50.0,
            "privacyStatus": "protected_aggregate",
        })
        self.assertEqual(len(result["monthlyTrend"]), 24)
        self.assertTrue(all(row["people"] == 20 for row in result["monthlyTrend"]))

    def test_two_specific_units_for_one_person_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "más de una unidad específica"):
            self._build(fixture(ambiguous_person=True))

    def test_missing_legajo_person_join_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "no posee IDPERSONA GRH válido"):
            self._build(fixture(missing_person_link=True))

    def test_serialization_is_reproducible_and_aggregate_only(self):
        first = self._build(fixture())
        second = self._build(fixture())
        first_bytes = serialize_garden_network(first).encode("utf-8")
        second_bytes = serialize_garden_network(second).encode("utf-8")
        self.assertEqual(first_bytes, second_bytes)
        serialized = first_bytes.decode("utf-8")
        self.assertNotIn('"IDPERSONA":', serialized)
        self.assertNotIn('"CODI_01":', serialized)
        self.assertNotIn('"CODI_02":', serialized)
        self.assertNotIn('"CODI_07":', serialized)
        self.assertNotIn('"LEGA_12":', serialized)
        self.assertNotIn('"rows":', serialized)
        self.assertNotIn('"assignedPeople":', serialized)
        self.assertNotIn('"unassignedPeople":', serialized)


class GrhGardenNetworkArtifactTests(unittest.TestCase):
    def test_committed_artifact_reconciles_the_canonical_cut_without_private_rows(self):
        path = Path(__file__).resolve().parents[1] / "api" / "_data" / "grh-garden-network.json"
        raw = path.read_text(encoding="utf-8")
        result = json.loads(raw)
        self.assertLess(len(raw.encode("utf-8")), 8 * 1024)
        self.assertEqual(result["source"]["sourceSha256"],
                         "e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9")
        self.assertEqual(result["referencePeriod"]["period"], "2026-07")
        self.assertEqual(result["quality"]["sourceEmploymentKeys"], 165)
        self.assertEqual(result["quality"]["linkedEmploymentKeys"], 165)
        self.assertEqual(result["summary"], {
            "people": 107,
            "releasedPeople": 45,
            "protectedPeople": 62,
            "releasedUnitCount": 4,
            "observedUnitCount": 16,
        })
        self.assertEqual(
            [(row["label"], row["people"]) for row in result["releasedUnits"]],
            [("Amanecer", 12), ("Manitos de Colores", 12),
             ("Del Sol", 11), ("Pata Garabata", 10)],
        )
        self.assertEqual(result["protectedBucket"]["people"], 62)
        self.assertEqual(
            result["summary"]["releasedPeople"] + result["summary"]["protectedPeople"],
            result["summary"]["people"],
        )
        for forbidden in (
            '"IDPERSONA":', '"CODI_01":', '"CODI_02":', '"CODI_07":',
            '"LEGA_12":', '"companyCode":', '"personId":', '"rows":',
            '"assignedPeople":', '"unassignedPeople":',
        ):
            self.assertNotIn(forbidden, raw)


if __name__ == "__main__":
    unittest.main()
