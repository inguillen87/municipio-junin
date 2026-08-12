import datetime as dt
import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_grh_directory import build_directory, employment_status, write_private_json


FIXTURE = """\
CREATE TABLE `persona` (\n
  `CODI_01` int,\n
  `IDPERSONA` int,\n
  `NUDO_12` varchar(20),\n
  `NOMB_12` varchar(200),\n
  `DNI` varchar(20),\n
  `TELE_12` varchar(40)\n
) ENGINE=InnoDB;\n
INSERT INTO `persona` VALUES (NULL,9001,'DOC-1','ALFA ANA','30111222','555-111'),(NULL,9002,'DOC-2','BETA BEA','30222333','555-222');\n
CREATE TABLE `legajo` (\n
  `CODI_01` int,\n
  `LEGA_12` int,\n
  `IDPERSONA` int,\n
  `CODI_02` int,\n
  `CODI_10` int,\n
  `CARGOID` int,\n
  `IDORGANIZA` int,\n
  `CODI_07` int,\n
  `CODI_06` int,\n
  `FING_12` date,\n
  `FEGR_12` date,\n
  `CODI_03` int,\n
  `IDREVISTA` int,\n
  `CODI_29` int,\n
  `SUEL_12` decimal(10,2),\n
  PRIMARY KEY (`CODI_01`,`LEGA_12`)\n
) ENGINE=InnoDB;\n
INSERT INTO `legajo` VALUES (1,100,9001,2,3,4,5,7,60,'2000-01-01',NULL,1,1,1,999.99),(1,101,9002,9,3,4,5,8,61,'2010-01-01','2020-01-01',2,2,1,888.88),(1,0,9001,2,3,4,5,7,60,'1111-11-11','1111-11-11',NULL,NULL,NULL,777.77);\n
CREATE TABLE `regcontr` (\n
  `CODI_03` int,\n
  `DETA_03` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `regcontr` VALUES (1,'PLANTA PERMANENTE'),(2,'PERSONAL CONTRATADO');\n
CREATE TABLE `revista` (\n
  `IDREVISTA` int,\n
  `REVISTA` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `revista` VALUES (1,'NORMAL'),(2,'LICENCIA');\n
CREATE TABLE `motibaja` (\n
  `CODI_29` int,\n
  `DETA_29` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `motibaja` VALUES (1,'RENUNCIA');\n
CREATE TABLE `calculo` (\n
  `CODI_01` int,\n
  `PERI_31` int,\n
  `MES_31` int,\n
  `FECA_31` date,\n
  `TIPO_31` varchar(1),\n
  `LEGA_12` int\n
) ENGINE=InnoDB;\n
INSERT INTO `calculo` VALUES (1,2026,7,'2026-07-31','M',100),(1,2026,7,'2026-07-31','M',100),(1,2026,8,'2026-08-01','A',101),(1,2027,1,'2027-01-31','M',101);\n
CREATE TABLE `sectores` (\n
  `CODI_01` int,\n
  `CODI_07` int,\n
  `DETA_07` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `sectores` VALUES (1,7,'SECTOR SIETE'),(1,8,'SECTOR OCHO');\n
CREATE TABLE `costos` (\n
  `CODI_01` int,\n
  `CODI_06` int,\n
  `DETA_06` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `costos` VALUES (1,60,'CENTRO SESENTA'),(1,61,'CENTRO SESENTA Y UNO'),(2,60,'OTRA EMPRESA');\n
CREATE TABLE `organiza` (\n
  `IDORGANIZA` int,\n
  `N1_DESC` varchar(200),\n
  `CODI_01` int\n
) ENGINE=InnoDB;\n
INSERT INTO `organiza` VALUES (5,'ORGANIZACION',1);\n
CREATE TABLE `cargo` (\n
  `CARGOID` int,\n
  `DENOCARGO` varchar(200),\n
  `PADREID` int,\n
  `REPORTA_A` varchar(50),\n
  `DEPENDEID` int,\n
  `CODI_01` int\n
) ENGINE=InnoDB;\n
INSERT INTO `cargo` VALUES (4,'CARGO',40,'PRIVATE PERSON',50,1),(40,'SECRETARIA',NULL,NULL,NULL,1),(50,'MUNICIPIO',NULL,NULL,NULL,1);\n
CREATE TABLE `histolegajo` (\n
  `CODI_01` int,\n
  `LEGA_12` int,\n
  `FECA_31` date,\n
  `MES_31` int,\n
  `PERI_31` int,\n
  `CARGO` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `histolegajo` VALUES (1,100,'2026-08-31',8,2026,'PUESTO OBSERVADO'),(1,101,'2026-08-31',8,2026,NULL);\n
CREATE TABLE `catego` (\n
  `CODI_02` int,\n
  `CODI_10` int,\n
  `DETA_10` varchar(200),\n
  `CODI_01` int\n
) ENGINE=InnoDB;\n
INSERT INTO `catego` VALUES (2,3,'CATEGORIA',1),(9,3,'CATEGORIA NUEVE',1);\n
CREATE TABLE `convenio` (\n
  `CODI_02` int,\n
  `DETA_02` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `convenio` VALUES (2,'CONVENIO'),(9,'OTRO CONVENIO');\n
CREATE TABLE `ausencia` (\n
  `CODI_01` int,\n
  `LEGA_12` int,\n
  `FAUS_20` date,\n
  `DIAS_24` int,\n
  `MOTI_20` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `ausencia` VALUES (1,100,'2026-06-01',2,'PRIVATE CAUSE'),(1,100,'2026-07-01',1,'PRIVATE CAUSE'),(1,101,'2026-09-01',3,'FUTURE');\n
CREATE TABLE `legamov` (\n
  `CODI_01` int,\n
  `LEGA_12` int,\n
  `ANO_30` int,\n
  `MES_30` int,\n
  `TIPO_30` varchar(20),\n
  `IMPO_30` decimal(10,2),\n
  `CAUSA` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `legamov` VALUES (1,100,2026,7,'PRIVATE TYPE',999.99,'PRIVATE CAUSE'),(1,100,2026,7,'PRIVATE TYPE',888.88,'PRIVATE CAUSE'),(1,100,2026,6,'PRIVATE TYPE',777.77,'PRIVATE CAUSE'),(1,101,2026,9,'FUTURE',666.66,'PRIVATE CAUSE'),(1,101,1900,1,'OLD',555.55,'PRIVATE CAUSE');\n
CREATE TABLE `licencia` (\n
  `CODI_01` int,\n
  `LEGA_12` int,\n
  `FINI_24` date,\n
  `FFIN_24` date,\n
  `DIAS_24` int,\n
  `MOTI_24` varchar(200)\n
) ENGINE=InnoDB;\n
INSERT INTO `licencia` VALUES (1,101,'2026-05-01','2026-05-10',10,'PRIVATE CAUSE'),(1,101,'2026-07-01','2026-06-30',5,'INVALID');\n
"""


def manifest_for(source: Path) -> dict:
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    return {
        "schema_version": "grh-source-manifest-v1",
        "canonical_system": "GRH Junín",
        "source_file": source.name,
        "sha256": digest,
        "compressed_size_bytes": source.stat().st_size,
        "snapshot_as_of": "2026-08-06",
        "excluded_sources": ["personas_junin"],
        "approval_basis": "Fixture unitario aprobado para pruebas.",
    }


class GrhDirectoryBuilderTests(unittest.TestCase):
    def fixture_paths(self, directory: str) -> tuple[Path, Path]:
        source = Path(directory) / "grh_directory_20260806.sql.gz"
        with gzip.open(source, "wt", encoding="utf-8", newline="") as stream:
            stream.write(FIXTURE)
        manifest = Path(directory) / "manifest.json"
        manifest.write_text(json.dumps(manifest_for(source), ensure_ascii=False), encoding="utf-8")
        return source, manifest

    def test_builds_minimal_private_directory_with_governed_event_summaries(self):
        with tempfile.TemporaryDirectory() as directory:
            source, manifest = self.fixture_paths(directory)
            result = build_directory(
                source,
                manifest_path=manifest,
                generated_at=dt.datetime(2026, 8, 10, 15, 0, tzinfo=dt.timezone.utc),
            )

        self.assertEqual(result["schema_version"], "grh-directory-v3")
        self.assertEqual(result["source"]["snapshot_as_of"], "2026-08-06")
        self.assertEqual(result["source"]["generated_at"], "2026-08-10T15:00:00.000Z")
        self.assertTrue(result["privacy"]["contains_personal_data"])
        self.assertTrue(result["privacy"]["private_storage_required"])
        self.assertIn("absence_leave_event_cause", result["privacy"]["excluded_fields"])
        self.assertNotIn("event_cause", result["privacy"]["excluded_fields"])
        self.assertEqual(result["counts"]["directory_records"], 2)
        self.assertEqual(result["counts"]["person_matches"], 2)
        self.assertEqual(result["counts"]["valid_absence_events"], 2)
        self.assertEqual(result["counts"]["quarantined_absence_events"], 1)
        self.assertEqual(result["counts"]["valid_leave_events"], 1)
        self.assertEqual(result["counts"]["quarantined_leave_events"], 1)
        self.assertEqual(result["counts"]["valid_movement_rows"], 3)
        self.assertEqual(result["counts"]["quarantined_movement_rows"], 2)
        self.assertEqual(result["counts"]["invalid_employee_key_rows"], 1)
        self.assertEqual(result["counts"]["valid_position_observation_rows"], 1)
        self.assertEqual(result["counts"]["blank_position_observation_rows"], 1)
        self.assertEqual(result["counts"]["quarantined_position_observation_rows"], 0)
        self.assertEqual(result["counts"]["future_effective_position_observation_rows"], 1)
        self.assertEqual(result["counts"]["records_with_position_observation"], 1)
        self.assertEqual(result["counts"]["valid_calculation_rows"], 3)
        self.assertEqual(result["counts"]["quarantined_calculation_rows"], 1)
        self.assertEqual(result["counts"]["reference_payroll_period"], "2026-07")
        self.assertEqual(result["counts"]["reference_payroll_rows"], 2)
        self.assertEqual(result["counts"]["records_observed_in_reference_payroll"], 1)
        self.assertEqual(result["counts"]["employment_statuses"], {
            "ended_by_reported_dates": 1,
            "current_by_reported_dates": 1,
            "unknown_missing_ingress": 0,
            "unknown_sentinel_ingress": 0,
            "unknown_implausible_active_tenure": 0,
            "invalid_chronology": 0,
        })

        first, second = result["records"]
        self.assertEqual((first["company_code"], first["legajo"], first["display_name"]), (1, 100, "ALFA ANA"))
        self.assertEqual(first["sector"], {"code": 7, "label": "SECTOR SIETE"})
        self.assertEqual(first["cost_center"], {"code": 60, "label": "CENTRO SESENTA"})
        self.assertEqual(first["organization"], {"code": 5, "label": "ORGANIZACION"})
        self.assertEqual(first["position"], {
            "code": 4,
            "label": "CARGO",
            "parent": {"code": 40, "label": "SECRETARIA"},
            "depends_on": {"code": 50, "label": "MUNICIPIO"},
        })
        self.assertEqual(first["category"], {"code": 3, "label": "CATEGORIA"})
        self.assertEqual(first["agreement"], {"code": 2, "label": "CONVENIO"})
        self.assertEqual(first["contract_regime"], {"code": 1, "label": "PLANTA PERMANENTE"})
        self.assertEqual(first["service_situation"], {"code": 1, "label": "NORMAL"})
        self.assertIsNone(first["termination_reason"])
        self.assertEqual(first["employment"], {
            "reported_ingress_date": "2000-01-01",
            "reported_exit_date": None,
            "reported_status": "current_by_reported_dates",
            "as_of": "2026-08-06",
            "basis": "legajo_reported_dates",
            "reference_payroll_participation": {
                "period": "2026-07", "observed": True, "row_count": 2,
            },
        })
        self.assertEqual(first["position_observation"], {
            "label": "PUESTO OBSERVADO",
            "observed_date": "2026-08-31",
            "observed_period": "2026-08",
            "status": "source_future_effective",
            "source_table": "histolegajo",
        })
        self.assertIsNone(second["position_observation"])
        self.assertEqual(second["category"], {"code": 3, "label": "CATEGORIA NUEVE"})
        self.assertEqual(second["agreement"], {"code": 9, "label": "OTRO CONVENIO"})
        self.assertEqual(second["contract_regime"], {"code": 2, "label": "PERSONAL CONTRATADO"})
        self.assertEqual(second["service_situation"], {"code": 2, "label": "LICENCIA"})
        self.assertEqual(second["termination_reason"], {"code": 1, "label": "RENUNCIA"})
        self.assertEqual(second["employment"]["reported_status"], "ended_by_reported_dates")
        self.assertEqual(second["employment"]["reference_payroll_participation"], {
            "period": "2026-07", "observed": False, "row_count": 0,
        })
        self.assertEqual(first["absence"], {"event_count": 2, "latest_date": "2026-07-01"})
        self.assertEqual(first["absence_history"], [
            {"date": "2026-07-01", "days": 1},
            {"date": "2026-06-01", "days": 2},
        ])
        self.assertEqual(first["movement"], {
            "row_count": 3,
            "period_count": 2,
            "latest_period": "2026-07",
        })
        self.assertEqual(first["movement_history"], [
            {"period": "2026-07", "row_count": 2},
            {"period": "2026-06", "row_count": 1},
        ])
        self.assertEqual(second["movement"], {
            "row_count": 0,
            "period_count": 0,
            "latest_period": None,
        })
        self.assertEqual(second["leave"], {
            "event_count": 1,
            "latest_start_date": "2026-05-01",
            "latest_end_date": "2026-05-10",
        })
        self.assertEqual(second["leave_history"], [{
            "start_date": "2026-05-01",
            "end_date": "2026-05-10",
            "days": 10,
        }])

        serialized = json.dumps(result, ensure_ascii=False).casefold()
        for forbidden in [
            "30111222", "30222333", "555-111", "999.99", "777.77", "private cause",
            "private person", "private type", "moti_20", "suel_12", "idpersona",
            "tipo_30", "impo_30", "causa"
        ]:
            self.assertNotIn(forbidden, serialized)
        self.assertTrue(all(
            set(event) == {"date", "days"}
            for record in result["records"] for event in record["absence_history"]
        ))
        self.assertTrue(all(
            set(event) == {"start_date", "end_date", "days"}
            for record in result["records"] for event in record["leave_history"]
        ))

    def test_canonical_manifest_gate_fails_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            source, manifest_path = self.fixture_paths(directory)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["sha256"] = "0" * 64
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                build_directory(source, manifest_path=manifest_path)

    def test_employment_status_is_conservative_for_missing_sentinel_implausible_and_invalid_dates(self):
        as_of = dt.date(2026, 8, 6)
        self.assertEqual(employment_status(None, None, as_of=as_of)[0], "unknown_missing_ingress")
        self.assertEqual(
            employment_status("1111-11-11", "1111-11-11", as_of=as_of),
            ("unknown_sentinel_ingress", None, None),
        )
        self.assertEqual(
            employment_status("1966-08-05", None, as_of=as_of)[0],
            "unknown_implausible_active_tenure",
        )
        self.assertEqual(
            employment_status("2027-01-01", None, as_of=as_of)[0],
            "invalid_chronology",
        )
        self.assertEqual(
            employment_status("2020-01-02", "2020-01-01", as_of=as_of)[0],
            "invalid_chronology",
        )

    def test_private_writer_is_atomic_and_round_trips_utf8(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "private" / "directory.json"
            payload = {"name": "Junín", "records": []}
            write_private_json(target, payload)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), payload)
            self.assertEqual(list(target.parent.glob(".directory.json.*")), [])


if __name__ == "__main__":
    unittest.main()
