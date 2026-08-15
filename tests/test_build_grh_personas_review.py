import json
import os
import unittest
from collections import Counter
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from scripts.build_grh_personas_review import (
    EXPECTED,
    PrivatePerson,
    _semantic_inputs,
    build_match_cases,
    build_review_stream,
    canonical_json,
    encrypt_evidence,
    hmac_ref,
    normalize_birth,
    person_from_private_row,
)


ROOT = Path(__file__).parents[1]
GRH_SOURCE = Path.home() / "Downloads" / "grh_junin.backup_2026080615_plataforma.sql.gz"
PERSONAS_SOURCE = Path.home() / "Downloads" / "personas_junin.backup_2026080615_plataforma.sql.gz"
HMAC_KEY = bytes([1]) * 32
EVIDENCE_KEY = bytes([2]) * 32
TENANT = "tenant-junin"
RUN_ID = "57c2774e-134c-54dd-b516-085864bea6a6"


def private_person(source_id, *, cuil=None, dni=None, name=None, birth=None):
    return PrivatePerson(
        source_id=str(source_id),
        display_name=name,
        birth_date=birth,
        birth_date_invalid=False,
        display_cuil=cuil,
        display_dni=dni,
        cuil=cuil,
        dni=dni,
        name=name,
    )


class GrhPersonasReviewMaterializerTests(unittest.TestCase):
    def test_materializer_rejects_reusing_the_reference_key_for_encryption(self):
        with self.assertRaisesRegex(Exception, "KEY_REUSE_FORBIDDEN"):
            build_review_stream(
                tenant_id=TENANT,
                grh_source=Path("missing-grh.gz"),
                personas_source=Path("missing-personas.gz"),
                grh_manifest_path=Path("missing-grh-manifest.json"),
                personas_manifest_path=Path("missing-personas-manifest.json"),
                hmac_key=HMAC_KEY,
                evidence_key=HMAC_KEY,
            )

    def test_stable_refs_are_domain_separated_and_do_not_depend_on_a_run(self):
        grh_ref = hmac_ref(HMAC_KEY, "grh-personas-review:source-ref:v1", TENANT, "GRH", "17")
        personas_ref = hmac_ref(HMAC_KEY, "grh-personas-review:source-ref:v1", TENANT, "PERSONAS", "17")
        case_key = hmac_ref(HMAC_KEY, "grh-personas-review:case-key:v1", TENANT, grh_ref)
        pair_ref = hmac_ref(HMAC_KEY, "grh-personas-review:pair-ref:v1", TENANT, grh_ref, personas_ref)
        option_key = hmac_ref(HMAC_KEY, "grh-personas-review:option-key:v1", TENANT, pair_ref)
        self.assertRegex(grh_ref, r"^[0-9a-f]{64}$")
        self.assertNotEqual(grh_ref, personas_ref)
        self.assertEqual(case_key, hmac_ref(HMAC_KEY, "grh-personas-review:case-key:v1", TENANT, grh_ref))
        self.assertEqual(option_key, hmac_ref(HMAC_KEY, "grh-personas-review:option-key:v1", TENANT, pair_ref))

    def test_aes_envelope_authenticates_exact_case_aad_and_contains_no_aad(self):
        case_key = "a" * 64
        plaintext = {
            "schemaVersion": "grh-personas-review-case-evidence-v1",
            "person": {
                "displayName": "Persona de prueba",
                "birthDate": "1980-01-02",
                "documents": {"cuil": "20068912335", "dni": "6891233"},
            },
        }
        envelope = encrypt_evidence(
            key=EVIDENCE_KEY,
            plaintext=plaintext,
            tenant_id=TENANT,
            run_id=RUN_ID,
            case_key=case_key,
            record_type="case",
            stable_key=case_key,
            nonce_factory=lambda size: bytes([7]) * size,
        )
        self.assertEqual(set(envelope), {"schemaVersion", "keyVersion", "algorithm", "iv", "ciphertext", "tag"})
        self.assertNotIn("aad", envelope)
        import base64
        decode = lambda value: base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        aad = canonical_json({
            "caseKey": case_key,
            "keyVersion": "v1",
            "recordType": "case",
            "runId": RUN_ID,
            "stableKey": case_key,
            "tenantId": TENANT,
        }).encode("utf-8")
        encrypted = decode(envelope["ciphertext"]) + decode(envelope["tag"])
        observed = AESGCM(EVIDENCE_KEY).decrypt(decode(envelope["iv"]), encrypted, aad)
        self.assertEqual(json.loads(observed), plaintext)

    def test_personas_fallback_is_encrypted_as_derived_dni_and_sentinels_are_null(self):
        row = {
            "IDPERSONA": "1",
            "NOMB_12": "Persona de prueba",
            "FENA_12": "1992-12-31",
            "NUDO_12": "0",
            "CUIL_12": "20068912335",
        }
        person = person_from_private_row(row, "PERSONAS")
        self.assertEqual(person.dni, "6891233")
        self.assertEqual(person.display_dni, "6891233")
        self.assertIsNone(person.birth_date)
        self.assertTrue(person.birth_date_invalid)
        self.assertEqual(normalize_birth("1111-11-11"), (None, True))
        self.assertEqual(normalize_birth(""), (None, False))

    def test_matcher_never_promotes_name_only_evidence(self):
        grh = [
            private_person(1, cuil="20111111111", dni="11111111", name="UNO", birth="1980-01-01"),
            private_person(2, name="DOS", birth="1981-01-01"),
        ]
        personas = [
            private_person(10, cuil="20111111111", dni="11111111", name="UNO", birth="1980-01-01"),
            private_person(20, name="DOS", birth="1981-01-01"),
        ]
        cases = build_match_cases(grh, personas)
        self.assertEqual(cases[0].classification, "CANDIDATE")
        self.assertEqual(cases[1].classification, "AMBIGUOUS")
        self.assertEqual(cases[1].signal, "name_birthdate_signal")

    def test_unique_dni_requires_name_or_birth_date_support_for_assisted_evidence(self):
        grh = [
            private_person(1, dni="11111111", name="NOMBRE DISTINTO", birth="1980-01-01"),
            private_person(2, dni="22222222", name="COINCIDE", birth=None),
            private_person(3, dni="33333333", name="SIN APOYO", birth=None),
        ]
        personas = [
            private_person(10, dni="11111111", name="OTRO NOMBRE", birth="1980-01-01"),
            private_person(20, dni="22222222", name="COINCIDE", birth=None),
            private_person(30, dni="33333333", name="TAMPOCO COINCIDE", birth=None),
        ]
        cases = build_match_cases(grh, personas)
        self.assertTrue(all(item.classification == "CANDIDATE" for item in cases))
        self.assertTrue(all(item.signal == "unique_dni_backup" for item in cases))
        _, options, _, _ = _semantic_inputs(
            tenant_id=TENANT,
            hmac_key=HMAC_KEY,
            grh_people=grh,
            personas_people=personas,
            cases=cases,
        )
        self.assertEqual(Counter(row["evidenceLevel"] for row in options), {
            "ASSISTED": 2,
            "INSUFFICIENT": 1,
        })

    @unittest.skipUnless(GRH_SOURCE.is_file() and PERSONAS_SOURCE.is_file(), "exact municipal backups are not present")
    def test_real_sources_materialize_only_encrypted_pending_records_with_frozen_counts(self):
        nonce_counter = iter(range(1, EXPECTED["totalCaseCount"] + EXPECTED["totalOptionCount"] + 1))

        def nonce_factory(size):
            return next(nonce_counter).to_bytes(size, "big")

        manifest, records = build_review_stream(
            tenant_id=TENANT,
            grh_source=GRH_SOURCE,
            personas_source=PERSONAS_SOURCE,
            grh_manifest_path=ROOT / "config" / "grh-source-manifest.json",
            personas_manifest_path=ROOT / "config" / "personas-source-manifest.json",
            hmac_key=HMAC_KEY,
            evidence_key=EVIDENCE_KEY,
            nonce_factory=nonce_factory,
        )
        self.assertEqual(manifest["counts"], EXPECTED)
        self.assertEqual(len(records), EXPECTED["totalCaseCount"] + EXPECTED["totalOptionCount"])
        self.assertTrue(all(record["status"] == "PENDING" for record in records))
        self.assertTrue(all(record.get("requiresManualCheck", True) for record in records))
        self.assertFalse(manifest["autoApprovalAllowed"])
        self.assertFalse(manifest["crosswalkPublished"])
        self.assertEqual(manifest["materializerVersion"], "grh-personas-review-materializer-v2")
        self.assertEqual(manifest["evidencePolicyVersion"], "grh-personas-review-evidence-v2")
        options = [record for record in records if record["recordType"] == "option"]
        unique_dni_levels = Counter(
            record["evidenceLevel"]
            for record in options
            if record["matchMethod"] == "UNIQUE_DNI_BACKUP"
        )
        self.assertEqual(unique_dni_levels, {
            "CONFLICT": 95,
            "INSUFFICIENT": 81,
            "ASSISTED": 27,
        })
        duplicate_dni_levels = Counter(
            record["evidenceLevel"]
            for record in options
            if record["matchMethod"] == "DUPLICATE_DNI_NAME"
        )
        self.assertEqual(duplicate_dni_levels, {"CONFLICT": 4, "ASSISTED": 2})
        serialized = json.dumps(records, ensure_ascii=False)
        for forbidden in ('"displayName"', '"birthDate"', '"documents"', '"sourceId"'):
            self.assertNotIn(forbidden, serialized)


if __name__ == "__main__":
    unittest.main()
