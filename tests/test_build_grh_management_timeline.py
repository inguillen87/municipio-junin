import gzip
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_management_timeline import build_management_timeline


def _quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _insert(table, rows):
    values = ",".join(
        "(" + ",".join(_quote(value) for value in row) + ")"
        for row in rows
    )
    return f"INSERT INTO `{table}` VALUES {values};\n"


def fixture(*, unresolved_absence=False):
    ingress_groups = (
        (30, "2024-01-10"),
        (10, "2020-01-10"),
        (30, "2025-01-10"),
        (10, "2021-01-10"),
        (9, "2026-01-10"),
        (20, "2022-01-10"),
    )
    employment_rows = []
    employee = 1
    for size, event_date in ingress_groups:
        for _ in range(size):
            employment_rows.append((1, employee, employee, event_date, event_date))
            employee += 1

    period_rows = (
        (range(1, 31), "2024-02-10", range(1, 11), "2020-02-10"),
        (range(1, 31), "2025-02-10", range(1, 11), "2021-02-10"),
        (range(1, 31), "2026-02-10", range(1, 11), "2022-02-10"),
    )
    absence_rows = []
    action_rows = []
    for current_people, current_date, prior_people, prior_date in period_rows:
        absence_rows.extend((1, item, current_date, 2) for item in current_people)
        absence_rows.extend((1, item, prior_date, 2) for item in prior_people)
        action_rows.extend((1, item, current_date) for item in current_people)
        action_rows.extend((1, item, prior_date) for item in prior_people)
    if unresolved_absence:
        absence_rows.append((1, 999, "2026-03-01", 2))

    fixed_rows = []
    for current_people, current_date, prior_people, prior_date in (
        (range(1, 31), "2024-03-10", range(1, 11), "2020-03-10"),
        (range(1, 31), "2025-03-10", range(1, 11), "2021-03-10"),
        (range(1, 10), "2026-03-10", range(1, 21), "2022-03-10"),
    ):
        fixed_rows.extend((1, item, current_date) for item in current_people)
        fixed_rows.extend((1, item, prior_date) for item in prior_people)

    return "".join([
        "CREATE TABLE `ausencia` (\n",
        "  `CODI_01` int,\n  `LEGA_12` int,\n  `FAUS_20` date,\n  `DIAS_24` int,\n",
        ") ENGINE=InnoDB;\n",
        _insert("ausencia", absence_rows),
        "CREATE TABLE `foja` (\n",
        "  `CODI_01` int,\n  `LEGA_12` int,\n  `FECH_FJ` date,\n",
        ") ENGINE=InnoDB;\n",
        _insert("foja", action_rows),
        "CREATE TABLE `fijos` (\n",
        "  `CODI_01` int,\n  `LEGA_12` int,\n  `FECHA_ALTA` date,\n",
        ") ENGINE=InnoDB;\n",
        _insert("fijos", fixed_rows),
        "CREATE TABLE `legajo` (\n",
        "  `CODI_01` int,\n  `LEGA_12` int,\n  `IDPERSONA` int,\n",
        "  `FING_12` date,\n  `FEGR_12` date,\n",
        ") ENGINE=InnoDB;\n",
        _insert("legajo", employment_rows),
    ])


class GrhManagementTimelineBuilderTests(unittest.TestCase):
    def _build(self, text, *, snapshot="2026-08-06"):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "fixture.sql.gz"
            with gzip.open(source, "wt", encoding="utf-8", newline="") as stream:
                stream.write(text)
            manifest = {
                "canonical_system": "GRH Junín",
                "source_file": source.name,
                "sha256": "a" * 64,
                "snapshot_as_of": snapshot,
            }
            first = build_management_timeline(source, manifest)
            second = build_management_timeline(source, manifest)
            return first, second

    def test_builds_four_year_plan_equal_observed_windows_and_governed_privacy(self):
        result, repeated = self._build(fixture())
        self.assertEqual(result, repeated)
        self.assertEqual(result["schemaVersion"], "grh-management-timeline-v1")
        self.assertEqual(result["observed"]["current"], {
            "startDate": "2023-12-09",
            "endDate": "2026-08-06",
            "days": 972,
            "progressPct": 66.5298,
            "status": "partial",
        })
        self.assertEqual(
            [year["current"]["observedDays"] for year in result["managementYears"]],
            [366, 365, 241, 0],
        )
        self.assertEqual(
            [
                year["domains"]["fixedConceptStarts"]["current"]["privacyStatus"]
                for year in result["managementYears"]
            ],
            ["released", "protected_complementary", "protected_primary", "unavailable"],
        )
        for year_index in (1, 2):
            block = result["managementYears"][year_index]["domains"]["fixedConceptStarts"]
            for side in ("current", "prior", "delta"):
                self.assertEqual(
                    block[side]["values"],
                    {"eventRows": None, "distinctPersons": None},
                )
        self.assertEqual(
            result["comparison"]["matrixDomainKeys"],
            [
                "reportedAbsence",
                "documentedEmploymentActions",
                "reportedIngressDates",
                "reportedExitDates",
            ],
        )
        self.assertEqual(
            result["comparison"]["domains"]["fixedConceptStarts"]["comparisonStatus"],
            "context_only",
        )
        self.assertFalse(result["privacy"]["containsPii"])

    def test_future_snapshot_clamps_at_full_mandate_instead_of_inventing_days(self):
        result, _ = self._build(fixture(), snapshot="2029-01-15")
        self.assertEqual(result["source"]["snapshotAsOf"], "2029-01-15")
        self.assertEqual(result["observed"]["current"], {
            "startDate": "2023-12-09",
            "endDate": "2027-12-08",
            "days": 1461,
            "progressPct": 100.0,
            "status": "complete",
        })
        self.assertEqual(result["observed"]["prior"]["endDate"], "2023-12-08")
        self.assertEqual(result["observed"]["prior"]["days"], 1461)
        self.assertEqual(
            [year["current"]["observedDays"] for year in result["managementYears"]],
            [366, 365, 365, 365],
        )
        self.assertEqual(result["managementYears"][3]["current"]["status"], "complete")

    def test_rejects_snapshot_before_current_mandate_without_extracting_facts(self):
        with self.assertRaisesRegex(ValueError, "anterior al inicio de la gestión actual"):
            self._build(fixture(), snapshot="2023-12-08")

    def test_fails_closed_when_a_compared_row_cannot_resolve_idpersona(self):
        with self.assertRaisesRegex(ValueError, "IDPERSONA GRH válido"):
            self._build(fixture(unresolved_absence=True))

    def test_requires_idpersona_column(self):
        source = fixture().replace("  `IDPERSONA` int,\n", "")
        with self.assertRaisesRegex(ValueError, "Estructura requerida ausente en legajo"):
            self._build(source)


class GrhManagementTimelineArtifactTests(unittest.TestCase):
    def test_committed_artifact_has_corrected_person_counts_and_no_raw_identity(self):
        artifact_path = (
            Path(__file__).resolve().parents[1]
            / "api"
            / "_data"
            / "grh-management-timeline.json"
        )
        raw = artifact_path.read_text(encoding="utf-8")
        result = json.loads(raw)
        self.assertNotIn("\n", raw)
        self.assertEqual(
            result["source"]["sha256"],
            "e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9",
        )
        totals = result["comparison"]["domains"]
        self.assertEqual(
            totals["reportedAbsence"]["current"]["values"],
            {"eventRows": 5936, "distinctPersons": 749, "reportedDays": 65847},
        )
        self.assertEqual(
            totals["reportedAbsence"]["prior"]["values"],
            {"eventRows": 3395, "distinctPersons": 662, "reportedDays": 52190},
        )
        self.assertEqual(
            totals["reportedIngressDates"]["current"]["values"],
            {"eventRows": 281, "distinctPersons": 275},
        )
        self.assertEqual(
            totals["reportedExitDates"]["current"]["values"],
            {"eventRows": 232, "distinctPersons": 228},
        )
        self.assertEqual(
            result["source"]["coverage"]["reportedAbsence"]["unresolvedPersonRows"],
            6,
        )
        for forbidden in (
            '"employeeKey"', '"personId"', '"CODI_01"', '"LEGA_12"',
            '"displayName"', '"cause"',
        ):
            self.assertNotIn(forbidden, raw)


if __name__ == "__main__":
    unittest.main()
