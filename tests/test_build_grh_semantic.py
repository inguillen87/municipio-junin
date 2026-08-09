import datetime as dt
import gzip
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_semantic import (
    build_semantic_layer,
    canonical_utc_timestamp,
    count_insert_rows,
    parse_generated_at,
    parse_sql_tuples,
    reconciliation_run_sort_key,
)


FIXTURE = """\
CREATE TABLE `legajo` (\n
  `CODI_01` int NOT NULL,\n
  `LEGA_12` int NOT NULL,\n
  PRIMARY KEY (`CODI_01`,`LEGA_12`)\n
) ENGINE=InnoDB;\n
INSERT INTO `legajo` VALUES (1,100),(1,101);\n
CREATE TABLE `totpago` (\n
  `CODI_01` int NOT NULL,\n
  `PERI_31` int NOT NULL,\n
  `MES_31` int NOT NULL,\n
  `FECA_31` date NOT NULL,\n
  `TIPO_31` varchar(1) NOT NULL,\n
  `THCA_65` decimal(10,2),\n
  `THSA_65` decimal(10,2),\n
  `TRET_65` decimal(10,2),\n
  `NETO_65` decimal(10,2),\n
  `TAPO_65` decimal(10,2),\n
  `LEGA_65` int,\n
  `TLEG_65` int\n
) ENGINE=InnoDB;\n
INSERT INTO `totpago` VALUES (1,2026,7,'2026-07-31','M',100.00,50.00,20.00,130.00,10.00,2,2),(1,2223,3,'2223-03-31','M',10.00,0.00,0.00,10.00,1.00,1,1);\n
CREATE TABLE `calculo` (\n
  `CODI_01` int,\n
  `PERI_31` int,\n
  `MES_31` int,\n
  `FECA_31` date,\n
  `TIPO_31` varchar(1),\n
  `LEGA_12` int,\n
  `CODI_27` int,\n
  `IMPO_31` decimal(10,2),\n
  `CODI_02` int,\n
  `CODI_06` int,\n
  `CODI_07` int\n
) ENGINE=InnoDB;\n
INSERT INTO `calculo` VALUES (1,2026,7,'2026-07-31','M',100,993,100.00,1,1,1),(1,2026,7,'2026-07-31','M',100,994,50.00,1,1,1),(1,2026,7,'2026-07-31','M',100,995,0.00,1,1,1),(1,2026,7,'2026-07-31','M',100,996,20.00,1,1,1),(1,2026,7,'2026-07-31','M',100,998,130.00,1,1,1),(1,2026,7,'2026-07-31','M',100,999,130.00,1,1,1),(1,2026,7,'2026-07-31','M',100,990,10.00,1,1,1),(1,2223,3,'2223-03-31','M',999,998,10.00,1,1,1);\n
CREATE TABLE `legamov` (\n
  `CODI_01` int,\n
  `ANO_30` int,\n
  `MES_30` int,\n
  `TIPO_31` varchar(1),\n
  `LEGA_12` int\n
) ENGINE=InnoDB;\n
INSERT INTO `legamov` VALUES (1,2026,7,'M',101),(1,2026,6,'M',101),(1,2025,1,'M',100),(0,2026,5,'M',555),(1,8,1,'M',999);\n
CREATE TABLE `ausencia` (\n
  `CODI_01` int,\n
  `LEGA_12` int,\n
  `FAUS_20` date,\n
  `DIAS_24` int\n
) ENGINE=InnoDB;\n
INSERT INTO `ausencia` VALUES (1,100,'2026-07-01',2),(1,100,'2026-07-02',1),(1,101,'2025-07-01',1),(NULL,777,'2026-07-03',1),(1,999,'0007-12-30',1);\n
CREATE TABLE `licencia` (\n
  `CODI_01` int,\n
  `LEGA_12` int,\n
  `FINI_24` date,\n
  `FFIN_24` date,\n
  `DIAS_24` int\n
) ENGINE=InnoDB;\n
INSERT INTO `licencia` VALUES (1,101,'2026-06-01','2026-06-02',2),(1,101,'2026-07-01','2026-07-02',2),(1,100,'2025-06-01','2025-06-02',2),(NULL,777,'2026-05-01','2026-05-02',2);\n
CREATE TABLE `errorimportacion` (\n
  `iderror` int\n
) ENGINE=InnoDB;\n
INSERT INTO `errorimportacion` VALUES (1),(2),(3);\n
CREATE TABLE `vacia` (\n
  `id` int,\n
  PRIMARY KEY (`id`)\n
) ENGINE=InnoDB;\n
"""


class GrhSemanticTests(unittest.TestCase):
    def test_generation_timestamp_is_timezone_aware_and_canonical_utc(self):
        parsed = parse_generated_at("2026-08-09T01:05:06.789-03:00")
        self.assertEqual(canonical_utc_timestamp(parsed), "2026-08-09T04:05:06.789Z")

        with self.assertRaises(ValueError):
            canonical_utc_timestamp(dt.datetime(2026, 8, 9, 4, 5, 6))

    def test_reconciliation_runs_have_a_total_deterministic_order(self):
        runs = [
            {"calculation_date": "2026-07-31", "source_run_type": "M", "company_code": 20},
            {"calculation_date": "2026-07-31", "source_run_type": "M", "company_code": 3},
            {"calculation_date": "2026-07-31", "source_run_type": "M", "company_code": None},
            {"calculation_date": "2026-07-15", "source_run_type": "A", "company_code": 99},
        ]

        ordered = sorted(runs, key=reconciliation_run_sort_key)

        self.assertEqual([item["company_code"] for item in ordered], [99, 3, 20, None])

    def test_sql_parser_ignores_tuple_markers_inside_strings(self):
        payload = "(1,'texto ),( seguro'),(2,'it\\'s fine')"
        self.assertEqual(count_insert_rows(payload), 2)
        self.assertEqual(len(list(parse_sql_tuples(payload))), 2)

    def test_builds_aggregate_only_reconciled_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_2026080615.sql.gz"
            with gzip.open(source, "wt", encoding="utf-8", newline="") as stream:
                stream.write(FIXTURE)
            result = build_semantic_layer(
                source,
                as_of=dt.date(2026, 8, 6),
                generated_at=dt.datetime(2026, 8, 8, tzinfo=dt.timezone.utc),
            )

        self.assertEqual(result["table_dictionary"]["total_tables"], 8)
        self.assertEqual(result["schema_version"], "grh-semantic-v2")
        self.assertEqual(result["source"]["generated_at"], "2026-08-08T00:00:00.000Z")
        self.assertEqual(result["table_dictionary"]["total_rows"], 29)
        self.assertFalse(result["privacy"]["contains_pii"])
        self.assertEqual(result["period_quality"]["totpago"]["valid_rows"], 1)
        self.assertEqual(result["period_quality"]["totpago"]["quarantine_rows"], 1)
        self.assertEqual(result["period_quality"]["totpago"]["quarantine_by_period"], {"2223-03": 1})
        self.assertEqual(result["payroll"]["valid_control_totals"]["gross_earnings_cents"], 15000)
        self.assertEqual(result["payroll"]["valid_control_totals"]["net_payroll_cents"], 13000)
        self.assertTrue(result["payroll"]["source_equals_valid_plus_quarantine"])
        calculation = result["payroll"]["calculation_control_series"]
        self.assertEqual(len(calculation), 1)
        self.assertEqual(calculation[0]["gross_with_family_allowances_cents"], 15000)
        self.assertEqual(calculation[0]["net_payroll_cents"], 13000)
        self.assertTrue(calculation[0]["control_identity_reconciled"])
        cross_source = result["payroll"]["cross_source_reconciliation"]
        self.assertEqual(cross_source["status"], "reconciled")
        self.assertEqual(cross_source["score_pct"], 100)
        self.assertEqual(result["absence"]["valid_by_year"], {"2025": 1, "2026": 3})
        self.assertEqual(result["absence"]["distinct_participants_by_year"], {"2025": 1, "2026": 1})
        self.assertEqual(result["leave"]["valid_by_year"], {"2025": 1, "2026": 3})
        self.assertEqual(result["leave"]["distinct_participants_by_year"], {"2025": 1, "2026": 1})
        self.assertEqual(result["movements"]["valid_by_year"], {"2025": 1, "2026": 3})
        self.assertEqual(result["movements"]["distinct_participants_by_year"], {"2025": 1, "2026": 1})
        self.assertEqual(result["coverage"]["facts"]["calculo"]["orphan_rows"], 1)
        self.assertGreaterEqual(result["quality"]["score"], 0)
        self.assertLessEqual(result["quality"]["score"], 100)
        serialized = json.dumps(result, ensure_ascii=False)
        self.assertNotIn("participant_keys", serialized)
        self.assertNotIn("LEGA_12", serialized)


if __name__ == "__main__":
    unittest.main()
