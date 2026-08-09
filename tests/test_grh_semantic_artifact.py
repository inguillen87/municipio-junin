import datetime as dt
import json
import unittest
from pathlib import Path


ARTIFACT = Path(__file__).parents[1] / "api" / "_data" / "grh-semantic.json"
FORBIDDEN_RAW_FIELDS = {
    "NOMB_12",
    "CUIL_12",
    "NUDO_12",
    "cbu_12",
    "CBU",
    "IDPERSONA",
    "LEGA_12",
    "EMIA_12",
    "TELE_12",
    "DOMI_12",
}


@unittest.skipUnless(ARTIFACT.is_file(), "private GRH artifact not materialized in this checkout")
class GrhSemanticArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = ARTIFACT.read_text(encoding="utf-8")
        cls.data = json.loads(cls.raw)

    def test_snapshot_inventory_matches_forensic_control_totals(self):
        self.assertEqual(self.data["schema_version"], "grh-semantic-v2")
        dictionary = self.data["table_dictionary"]
        self.assertEqual(dictionary["total_tables"], 257)
        self.assertEqual(dictionary["non_empty_tables"], 147)
        self.assertEqual(dictionary["empty_tables"], 110)
        self.assertEqual(dictionary["total_rows"], 6_573_057)
        rows = {item["table"]: item["rows"] for item in dictionary["tables"]}
        self.assertEqual(rows["legajo"], 2_450)
        self.assertEqual(rows["calculo"], 4_363_790)
        self.assertEqual(rows["legamov"], 489_681)
        self.assertEqual(rows["ausencia"], 31_572)
        self.assertEqual(rows["licencia"], 3_448)
        self.assertEqual(rows["totpago"], 602)

    def test_annual_participant_cardinality_is_safe_and_reconciled(self):
        for domain in ("absence", "leave", "movements"):
            events = self.data[domain]["valid_by_year"]
            participants = self.data[domain]["distinct_participants_by_year"]
            self.assertEqual(set(participants), set(events))
            self.assertEqual(sum(events.values()), self.data[domain]["valid_rows"])
            for year, participant_count in participants.items():
                self.assertRegex(year, r"^\d{4}$")
                self.assertIs(type(participant_count), int)
                self.assertGreaterEqual(participant_count, 0)
                self.assertLessEqual(participant_count, events[year])

    def test_privacy_contract_excludes_raw_identity_fields(self):
        self.assertTrue(self.data["privacy"]["aggregate_only"])
        self.assertFalse(self.data["privacy"]["contains_pii"])
        self.assertTrue(self.data["privacy"]["employee_identifiers_exported"] is False)
        for field_name in FORBIDDEN_RAW_FIELDS:
            self.assertNotIn(f'"{field_name}"', self.raw)
        self.assertNotIn('"participant_keys"', self.raw)

    def test_payroll_controls_are_lossless(self):
        payroll = self.data["payroll"]
        self.assertTrue(payroll["source_equals_valid_plus_quarantine"])
        source = payroll["source_control_totals"]
        valid = payroll["valid_control_totals"]
        quarantine = payroll["quarantine_control_totals"]
        for field_name in (
            "rows",
            "gross_earnings_cents",
            "contributory_earnings_cents",
            "non_contributory_earnings_cents",
            "withholdings_cents",
            "net_payroll_cents",
            "source_tapo_cents",
            "reconciliation_variance_cents",
            "reconciled_rows",
        ):
            self.assertEqual(source[field_name], valid[field_name] + quarantine[field_name])

    def test_every_published_period_is_inside_snapshot_policy(self):
        minimum = dt.date.fromisoformat(self.data["period_policy"]["minimum_valid_date"])
        maximum = dt.date.fromisoformat(self.data["period_policy"]["maximum_valid_date"])
        for series_name in ("valid_period_series", "calculation_control_series"):
            periods = [item["period"] for item in self.data["payroll"][series_name]]
            self.assertEqual(periods, sorted(periods))
            self.assertEqual(len(periods), len(set(periods)))
            for period in periods:
                year, month = map(int, period.split("-"))
                self.assertGreaterEqual(dt.date(year, month, 1), minimum)
                self.assertLessEqual(dt.date(year, month, 1), maximum)

    def test_executive_payroll_uses_calculo_and_exposes_totpago_mismatch(self):
        payroll = self.data["payroll"]
        self.assertEqual(payroll["executive_metric_source"], "calculo control concepts")
        self.assertEqual(payroll["valid_period_series_status"], "totpago_diagnostic_only")
        latest = payroll["calculation_control_series"][-1]
        self.assertEqual(latest["period"], "2026-07")
        self.assertEqual(latest["distinct_payroll_participants"], 856)
        self.assertEqual(latest["net_payroll_cents"], 95_138_057_279)
        self.assertLessEqual(abs(latest["net_identity_variance_cents"]), 200)
        reconciliation = payroll["cross_source_reconciliation"]
        self.assertEqual(reconciliation["status"], "material_differences_detected")
        self.assertEqual(reconciliation["matched_runs"], 589)
        self.assertLess(reconciliation["value_agreement_pct"], 25)
        self.assertTrue(self.data["quality"]["risk_flags"]["totpago_cross_source_mismatch"])

    def test_latest_workforce_is_payroll_participation_not_active_status(self):
        workforce = self.data["workforce"]
        self.assertEqual(workforce["reference_period"], "2026-07")
        self.assertEqual(workforce["payroll_participants"], 856)
        self.assertEqual(workforce["matched_legajo_participants"], 856)
        self.assertIn("not a contractual active-status master", workforce["definition"])
        self.assertEqual(workforce["by_cost_center"][0]["label"], "SERVICIOS PUBLICOS")
        self.assertEqual(workforce["by_cost_center"][0]["participants"], 236)

    def test_quality_score_is_bounded_and_scoped(self):
        quality = self.data["quality"]
        self.assertGreaterEqual(quality["score"], 0)
        self.assertLessEqual(quality["score"], 100)
        self.assertIn("not fitness of every raw GRH table", quality["score_scope"])
        self.assertTrue(quality["risk_flags"]["historical_snapshot_not_realtime"])

    def test_quality_and_workforce_identities_are_reconciled(self):
        quality = self.data["quality"]
        components = quality["components"].values()
        self.assertEqual(sum(item["weight_pct"] for item in components), 100)
        weighted = sum(
            item["score"] * item["weight_pct"] / 100
            for item in quality["components"].values()
        )
        self.assertEqual(quality["score"], round(weighted, 2))

        workforce = self.data["workforce"]
        participants = workforce["payroll_participants"]
        matched = workforce["matched_legajo_participants"]
        self.assertEqual(
            workforce["legajo_match_rate_pct"],
            round(matched * 100 / participants, 4),
        )
        for ranking in ("by_sector", "by_cost_center", "by_agreement"):
            self.assertEqual(
                sum(item["participants"] for item in workforce[ranking]),
                participants,
            )

        series = self.data["payroll"]["calculation_control_series"]
        anomalous = sum(
            not item["control_identity_within_rounding_tolerance"]
            for item in series
        )
        risks = quality["risk_flags"]
        self.assertEqual(risks["calculation_control_anomalous_periods"], anomalous)
        self.assertTrue(risks["latest_calculation_control_within_rounding_tolerance"])
        suspicious_labels = sum(
            any(marker in str(item.get("label") or "") for marker in ("\u00c3", "\u00c2", "\ufffd"))
            for item in (
                self.data["payroll"]["latest_top_detail_concepts"]
                + workforce["by_sector"]
                + workforce["by_cost_center"]
                + workforce["by_agreement"]
            )
        )
        self.assertEqual(risks["suspicious_text_encoding_labels"], suspicious_labels)
        self.assertGreaterEqual(suspicious_labels, 1)
        self.assertTrue(series[-1]["control_identity_within_rounding_tolerance"])


if __name__ == "__main__":
    unittest.main()
