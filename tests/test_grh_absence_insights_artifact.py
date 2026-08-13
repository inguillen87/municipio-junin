import json
import unittest
from pathlib import Path


ARTIFACT = Path(__file__).parents[1] / "api" / "_data" / "grh-absence-insights.json"
SOURCE_SHA = "e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9"


class GrhAbsenceInsightsArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = ARTIFACT.read_text(encoding="utf-8")
        cls.data = json.loads(cls.raw)

    def test_matches_canonical_source_and_control_totals(self):
        data = self.data
        self.assertEqual(data["schemaVersion"], "grh-absence-insights-v1")
        self.assertEqual(data["source"]["sourceSha256"], SOURCE_SHA)
        self.assertEqual(data["source"]["snapshotAsOf"], "2026-08-06")
        self.assertEqual(data["summary"]["rawAbsenceRows"], 31_572)
        self.assertEqual(data["summary"]["validAbsenceRows"], 31_559)
        self.assertEqual(data["summary"]["quarantinedRows"], 13)
        self.assertEqual(data["summary"]["validReportedDays"], 395_559)
        self.assertEqual(data["comparison"]["current"], {"events": 5_936, "people": 752, "days": 65_847})
        self.assertEqual(data["comparison"]["prior"], {"events": 3_395, "people": 662, "days": 52_190})

    def test_has_no_person_rows_or_raw_cause_catalogue(self):
        self.assertTrue(self.data["privacy"]["aggregateOnly"])
        self.assertFalse(self.data["privacy"]["containsPii"])
        for forbidden in (
            '"LEGA_12"', '"CODI_01"', '"CODI_21"', '"DETA_21"',
            '"displayName"', '"legajo"', '"dni"', '"cuil"', '"textoReporte"',
        ):
            self.assertNotIn(forbidden, self.raw)

    def test_every_event_is_reconciled_without_adding_legacy_leave(self):
        self.assertEqual(self.data["source"]["tables"]["historicalLeave"], "licencia")
        for period in ("current", "prior"):
            coverage = self.data["coverage"][period]
            self.assertEqual(
                coverage["totalEvents"],
                coverage["publishedCategoryEvents"] + coverage["protectedEvents"],
            )
            self.assertEqual(coverage["coveragePct"], 100)
        self.assertEqual(self.data["coverage"]["current"]["publishedCategoryEvents"], 5_885)
        self.assertEqual(self.data["coverage"]["prior"]["publishedCategoryEvents"], 3_368)


if __name__ == "__main__":
    unittest.main()
