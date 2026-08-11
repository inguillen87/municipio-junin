import collections
import copy
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from scripts.build_grh_workforce_finance import (
    CONTROL_CONCEPTS,
    PRIVACY_THRESHOLD,
    RawCell,
    audit_cross_view_subset_differences,
    attach_changes,
    cell_sort_key,
    coordinate_cross_view_protection,
    canonical_release_json,
    cross_view_difference_risks,
    month_window,
    protect_source_cell_participant_count,
    protect_participant_accounting_sums,
    protected_small_union_target_vectors,
    protected_categories_for_dimension,
    published_observables_for_view,
    release_id,
    release_content_digest,
    source_cell,
    validate_built_artifact,
    write_artifact,
)


def people(first, last):
    return {(1, value) for value in range(first, last + 1)}


def controls(net=100):
    return collections.defaultdict(Decimal, {
        993: Decimal(net),
        994: Decimal(0),
        995: Decimal(0),
        996: Decimal(0),
        998: Decimal(net),
        999: Decimal(net),
        990: Decimal(10),
    })


def raw_cell(code, participants, net=100, *, protected=False):
    participant_set = set(participants)
    return RawCell(
        company_code=1,
        source_code=code,
        label=f"Categoria {code}",
        force_protected=protected,
        participants=participant_set,
        controls=controls(net),
    )


def subcent_raw_cell(code, participants, value):
    cell = raw_cell(code, participants, 0)
    cell.controls = collections.defaultdict(Decimal, {
        993: Decimal(value),
        994: Decimal(0),
        995: Decimal(0),
        996: Decimal(0),
        998: Decimal(value),
        999: Decimal(value),
        990: Decimal(0),
    })
    return cell


class WorkforceFinanceBuilderTests(unittest.TestCase):
    def test_validator_rejects_false_quality_claims_and_noncanonical_timestamp(self):
        artifact_path = Path(__file__).resolve().parents[1] / (
            "api/_data/grh-workforce-finance.json"
        )
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        mutations = []

        source_rows = copy.deepcopy(artifact)
        source_rows["quality"]["calculation"]["source_rows"] = "banana"
        mutations.append(source_rows)
        valid_rate = copy.deepcopy(artifact)
        valid_rate["quality"]["calculation"]["valid_rate_pct"] = 999
        mutations.append(valid_rate)
        reference_count = copy.deepcopy(artifact)
        reference_count["quality"]["references"][0]["observed_codes"] = -1
        mutations.append(reference_count)
        assignment_count = copy.deepcopy(artifact)
        assignment_count["quality"]["assignment"]["employee_period_runs"] = -5
        mutations.append(assignment_count)
        row_partition = copy.deepcopy(artifact)
        row_partition["quality"]["calculation"]["valid_rows"] -= 1
        mutations.append(row_partition)
        reference_partition = copy.deepcopy(artifact)
        reference_partition["quality"]["references"][0]["unresolved_codes"] = 1
        mutations.append(reference_partition)
        participant_identity = copy.deepcopy(artifact)
        participant_identity["quality"]["participant_set_reconciliation"][
            "control_employee_periods"
        ] += 1
        mutations.append(participant_identity)
        generated_at = copy.deepcopy(artifact)
        generated_at["source"]["generated_at"] = "2026-08-11Z"
        mutations.append(generated_at)

        validate_built_artifact(artifact)
        for mutation in mutations:
            with self.assertRaises(ValueError):
                validate_built_artifact(mutation)

    def test_release_identity_and_serialization_are_replay_stable(self):
        artifact = {
            "release_id": None,
            "source": {"sha256": "a" * 64, "snapshot_as_of": "2026-08-06"},
            "cohort": {"first_period": "2024-08", "last_period": "2026-07"},
            "quality": {"rate": 100.0, "minimum": 0.0001},
        }
        first = release_id(artifact)
        artifact["release_id"] = first
        second = release_id(artifact)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)
        mutated = copy.deepcopy(artifact)
        mutated["quality"]["minimum"] = 0.0002
        self.assertNotEqual(release_id(mutated), first)
        self.assertNotEqual(release_content_digest(mutated), release_content_digest(artifact))
        self.assertEqual(canonical_release_json([100.0, 100, -0.0, 0.0001]),
                         "[100,100,0,0.0001]")
        with self.assertRaises(ValueError):
            canonical_release_json([9_007_199_254_740_992.0])
        with tempfile.TemporaryDirectory() as directory:
            left = Path(directory) / "left.json"
            right = Path(directory) / "right.json"
            write_artifact(left, {"z": 1, "a": [3, 2, 1]})
            write_artifact(right, {"a": [3, 2, 1], "z": 1})
            self.assertEqual(left.read_bytes(), right.read_bytes())

    def test_window_is_exactly_24_consecutive_months(self):
        window = month_window("2026-07", 24)
        self.assertEqual(len(window), 24)
        self.assertEqual(window[0], "2024-08")
        self.assertEqual(window[-1], "2026-07")
        with self.assertRaises(ValueError):
            month_window("2026-07", 12)

    def test_primary_cell_gets_a_period_local_complementary_companion(self):
        period = "2026-07"
        cells = {
            ("released", 1, 1): raw_cell(1, people(1, 5), 50),
            ("released", 1, 2): raw_cell(2, people(6, 25), 200),
            ("released", 1, 3): raw_cell(3, people(26, 55), 300),
        }
        protected, suppressed = protected_categories_for_dimension(
            {period: cells}, [period],
        )
        self.assertEqual(len(protected[period]), 2)
        self.assertIn(("released", 1, 1), protected[period])
        self.assertEqual(suppressed, set())
        union = set().union(*(cells[key].participants for key in protected[period]))
        self.assertGreaterEqual(len(union), PRIVACY_THRESHOLD)

    def test_cross_view_equivalent_companion_is_coordinated(self):
        period = "2026-07"
        small = raw_cell(1, people(1, 5), 50)
        companion = raw_cell(2, people(6, 15), 100)
        equivalent = raw_cell(10, people(6, 15), 100)
        other = raw_cell(11, people(16, 30), 150)
        raw = {
            "sector": {period: {"small": small, "companion": companion}},
            "cost_center": {period: {"equivalent": equivalent, "other": other}},
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"small", "companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {name: set() for name in raw}

        self.assertEqual(len(cross_view_difference_risks(raw, protected, suppressed, [period])), 1)
        receipt = coordinate_cross_view_protection(raw, protected, suppressed, [period])

        self.assertEqual(receipt["initial_single_cell_risks"], 1)
        self.assertEqual(receipt["remaining_single_cell_risks"], 0)
        self.assertIn("equivalent", protected["cost_center"][period])
        self.assertEqual(
            cross_view_difference_risks(raw, protected, suppressed, [period]), [],
        )

    def test_cross_view_equal_membership_component_residual_is_coordinated(self):
        period = "2026-07"
        primary = raw_cell(1, people(1, 5), 50)
        companion = raw_cell(2, people(1, 15), 100)
        public_equivalent = raw_cell(10, people(1, 15), 100)
        public_other = raw_cell(11, people(16, 30), 150)
        raw = {
            "sector": {period: {"primary": primary, "companion": companion}},
            "cost_center": {
                period: {"public_equivalent": public_equivalent, "public_other": public_other},
            },
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"primary", "companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {name: set() for name in raw}

        risks = cross_view_difference_risks(raw, protected, suppressed, [period])
        self.assertEqual(len(risks), 1)
        receipt = coordinate_cross_view_protection(raw, protected, suppressed, [period])

        self.assertEqual(receipt["initial_single_cell_risks"], 1)
        self.assertEqual(receipt["remaining_single_cell_risks"], 0)
        self.assertIn("public_equivalent", protected["cost_center"][period])

    def test_cross_view_equal_membership_symmetric_component_residual_is_coordinated(self):
        period = "2026-07"
        primary = raw_cell(1, people(1, 5), 50)
        companion = raw_cell(2, people(1, 15), 100)
        public_larger = raw_cell(10, people(1, 15), 200)
        public_larger.controls = collections.defaultdict(Decimal, {
            concept: primary.controls[concept] * 2 + companion.controls[concept]
            for concept in CONTROL_CONCEPTS
        })
        public_other = raw_cell(11, people(16, 30), 150)
        raw = {
            "sector": {period: {"primary": primary, "companion": companion}},
            "cost_center": {
                period: {"public_larger": public_larger, "public_other": public_other},
            },
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"primary", "companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {name: set() for name in raw}

        self.assertEqual(
            len(cross_view_difference_risks(raw, protected, suppressed, [period])), 1,
        )
        receipt = coordinate_cross_view_protection(raw, protected, suppressed, [period])
        self.assertEqual(receipt["remaining_single_cell_risks"], 0)
        self.assertIn("public_larger", protected["cost_center"][period])

    def test_cross_view_gate_compares_the_exact_published_cent_vectors(self):
        period = "2026-07"
        primary = subcent_raw_cell(1, people(1, 5), "1.004")
        companion = subcent_raw_cell(2, people(1, 15), "2.004")
        public_candidate = subcent_raw_cell(10, people(1, 15), "2.006")
        public_other = subcent_raw_cell(11, people(16, 30), "3.000")
        raw = {
            "sector": {period: {"primary": primary, "companion": companion}},
            "cost_center": {
                period: {"public_candidate": public_candidate, "public_other": public_other},
            },
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"primary", "companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {name: set() for name in raw}

        self.assertEqual(
            len(cross_view_difference_risks(raw, protected, suppressed, [period])), 1,
        )
        receipt = coordinate_cross_view_protection(raw, protected, suppressed, [period])
        self.assertEqual(receipt["remaining_single_cell_risks"], 0)
        self.assertIn("public_candidate", protected["cost_center"][period])

    def test_cross_view_gate_compares_symmetric_published_cent_vectors(self):
        period = "2026-07"
        primary = subcent_raw_cell(1, people(1, 5), "1.004")
        companion = subcent_raw_cell(2, people(1, 15), "2.004")
        public_candidate = subcent_raw_cell(10, people(1, 15), "4.006")
        public_other = subcent_raw_cell(11, people(16, 30), "3.000")
        raw = {
            "sector": {period: {"primary": primary, "companion": companion}},
            "cost_center": {
                period: {"public_candidate": public_candidate, "public_other": public_other},
            },
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"primary", "companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {name: set() for name in raw}

        self.assertEqual(
            len(cross_view_difference_risks(raw, protected, suppressed, [period])), 1,
        )
        receipt = coordinate_cross_view_protection(raw, protected, suppressed, [period])
        self.assertEqual(receipt["remaining_single_cell_risks"], 0)
        self.assertIn("public_candidate", protected["cost_center"][period])

    def test_cross_view_protected_aggregates_are_both_observable_operands(self):
        period = "2026-07"
        for direction in ("left_minus_right", "right_minus_left"):
            with self.subTest(direction=direction):
                if direction == "left_minus_right":
                    sector_primary_net, sector_companion_net = 50, 100
                    cost_primary_net, cost_companion_net = 20, 80
                else:
                    sector_primary_net, sector_companion_net = 20, 80
                    cost_primary_net, cost_companion_net = 50, 100
                raw = {
                    "sector": {period: {
                        "sector_primary": raw_cell(1, people(1, 5), sector_primary_net),
                        "sector_companion": raw_cell(2, people(1, 15), sector_companion_net),
                    }},
                    "cost_center": {period: {
                        "cost_primary": raw_cell(10, people(1, 5), cost_primary_net),
                        "cost_companion": raw_cell(11, people(1, 15), cost_companion_net),
                    }},
                    "agreement": {period: {}},
                }
                if direction == "left_minus_right":
                    raw["cost_center"][period]["cost_primary"].controls[990] = Decimal(5)
                    raw["cost_center"][period]["cost_companion"].controls[990] = Decimal(5)
                else:
                    raw["sector"][period]["sector_primary"].controls[990] = Decimal(5)
                    raw["sector"][period]["sector_companion"].controls[990] = Decimal(5)
                protected = {
                    "sector": {period: {"sector_primary", "sector_companion"}},
                    "cost_center": {period: {"cost_primary", "cost_companion"}},
                    "agreement": {period: set()},
                }
                suppressed = {name: set() for name in raw}

                self.assertEqual(
                    len(cross_view_difference_risks(raw, protected, suppressed, [period])), 1,
                )
                receipt = coordinate_cross_view_protection(
                    raw, protected, suppressed, [period],
                )
                self.assertEqual(receipt["remaining_single_cell_risks"], 0)
                self.assertTrue(
                    period in suppressed["sector"] or period in suppressed["cost_center"],
                )

    def test_cross_view_multi_operand_subset_equation_aborts_the_build(self):
        period = "2026-07"
        raw = {
            "sector": {period: {
                "primary": raw_cell(1, people(1, 5), 50),
                "companion": raw_cell(2, people(6, 25), 140),
            }},
            "cost_center": {period: {
                "left": raw_cell(10, people(101, 112), 70),
                "right": raw_cell(11, people(113, 124), 80),
            }},
            "agreement": {period: {
                "offset": raw_cell(20, people(201, 212), 100),
            }},
        }
        protected = {
            "sector": {period: {"primary", "companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {dimension: set() for dimension in raw}

        self.assertEqual(
            cross_view_difference_risks(raw, protected, suppressed, [period]), [],
        )
        with self.assertRaisesRegex(ValueError, "subset difference risk"):
            audit_cross_view_subset_differences(
                raw, protected, suppressed, [period],
            )

    def test_cross_view_sum_of_two_small_hidden_targets_aborts_the_build(self):
        period = "2026-07"
        primary_a = raw_cell(1, people(1, 3), 20)
        primary_b = raw_cell(2, people(4, 6), 30)
        primary_a.controls[990] = Decimal(5)
        primary_b.controls[990] = Decimal(5)
        raw = {
            "sector": {period: {
                "primary_a": primary_a,
                "primary_b": primary_b,
                "companion": raw_cell(3, people(10, 24), 140),
            }},
            "cost_center": {period: {
                "left": raw_cell(10, people(101, 112), 70),
                "right": raw_cell(11, people(113, 124), 80),
            }},
            "agreement": {period: {
                "offset": raw_cell(20, people(201, 212), 100),
            }},
        }
        protected = {
            "sector": {period: {"primary_a", "primary_b", "companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {dimension: set() for dimension in raw}

        self.assertEqual(
            cross_view_difference_risks(raw, protected, suppressed, [period]), [],
        )
        with self.assertRaisesRegex(ValueError, "subset difference risk"):
            audit_cross_view_subset_differences(
                raw, protected, suppressed, [period],
            )

    def test_protected_target_dp_keeps_distinct_vectors_for_the_same_union(self):
        period = "2026-07"
        first = raw_cell(1, people(1, 3), 20)
        second = raw_cell(2, people(1, 3), 30)
        raw = {
            "sector": {period: {"first": first, "second": second}},
            "cost_center": {period: {}},
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"first", "second"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {dimension: set() for dimension in raw}
        observable = next(item for item in published_observables_for_view(
            raw, protected, suppressed, "sector", period,
        ) if item.kind == "protected_aggregate")

        vectors, state_count = protected_small_union_target_vectors(
            raw, observable, state_cap=100,
        )

        self.assertEqual(state_count, 3)
        self.assertEqual(len(vectors), 3)

    def test_cross_view_subset_audit_fails_closed_above_observable_cap(self):
        period = "2026-07"
        raw = {
            "sector": {period: {
                f"cell-{index}": raw_cell(
                    index, people(index * 20 + 1, index * 20 + 12), 100 + index,
                )
                for index in range(14)
            }},
            "cost_center": {period: {}},
            "agreement": {period: {}},
        }
        protected = {
            dimension: {period: set()} for dimension in raw
        }
        suppressed = {dimension: set() for dimension in raw}

        with self.assertRaisesRegex(ValueError, "observable cap exceeded"):
            audit_cross_view_subset_differences(
                raw, protected, suppressed, [period],
            )

    def test_cross_view_protected_target_state_cap_is_fail_closed(self):
        period = "2026-07"
        protected_cells = {
            f"cell-{index}": subcent_raw_cell(
                index, set(), str(2 ** index),
            )
            for index in range(16)
        }
        raw = {
            "sector": {period: protected_cells},
            "cost_center": {period: {}},
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: set(protected_cells)},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {dimension: set() for dimension in raw}

        with self.assertRaisesRegex(ValueError, "target state cap exceeded"):
            audit_cross_view_subset_differences(
                raw, protected, suppressed, [period],
            )

    def test_cross_view_subset_audit_ignores_only_the_empty_zero_identity(self):
        period = "2026-07"
        raw = {
            "sector": {period: {
                "zero_primary": subcent_raw_cell(1, people(1, 5), "0"),
                "companion_a": subcent_raw_cell(2, people(6, 20), "100"),
                "companion_b": subcent_raw_cell(3, people(21, 35), "140"),
            }},
            "cost_center": {period: {}},
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"zero_primary", "companion_a", "companion_b"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {dimension: set() for dimension in raw}

        receipt = audit_cross_view_subset_differences(
            raw, protected, suppressed, [period],
        )

        self.assertEqual(receipt["remaining_subset_difference_risks"], 0)
        self.assertGreater(receipt["subset_equations_checked"], 0)

    def test_cross_view_zero_protected_aggregate_aborts_the_build(self):
        period = "2026-07"
        raw = {
            "sector": {period: {
                "zero_primary": subcent_raw_cell(1, people(1, 5), "0"),
                "zero_companion": subcent_raw_cell(2, people(6, 20), "0"),
            }},
            "cost_center": {period: {}},
            "agreement": {period: {}},
        }
        protected = {
            "sector": {period: {"zero_primary", "zero_companion"}},
            "cost_center": {period: set()},
            "agreement": {period: set()},
        }
        suppressed = {dimension: set() for dimension in raw}

        with self.assertRaisesRegex(ValueError, "zero published vector"):
            audit_cross_view_subset_differences(
                raw, protected, suppressed, [period],
            )

    def test_unsafe_consecutive_count_and_tolerance_are_masked_but_amounts_remain(self):
        total = {
            "gross_with_family_allowances_cents": 10000,
            "contributory_earnings_cents": 10000,
            "non_contributory_earnings_cents": 0,
            "family_allowances_cents": 0,
            "employee_withholdings_cents": 0,
            "net_payroll_cents": 10000,
            "net_to_pay_cents": 10000,
            "employer_contributions_cents": 1000,
        }
        previous_raw = raw_cell(7, people(1, 10), 100)
        current_raw = raw_cell(7, people(1, 11), 100)
        previous = source_cell(previous_raw, total, "released", True)
        current = source_cell(current_raw, total, "released", True)
        rows = [
            {
                "period": "2026-06",
                "participant_accounting": {
                    "sum_cell_distinct_participants_observed": 10,
                },
                "cells": [previous],
            },
            {
                "period": "2026-07",
                "participant_accounting": {
                    "sum_cell_distinct_participants_observed": 11,
                },
                "cells": [current],
            },
        ]
        memberships = {
            "2026-06": {(1, 7): set(previous_raw.participants)},
            "2026-07": {(1, 7): set(current_raw.participants)},
        }

        attach_changes(rows, memberships)
        protect_participant_accounting_sums(rows)

        self.assertIsNone(current["distinct_participants_observed"])
        self.assertEqual(current["participant_display"], "Protegido")
        self.assertIsNone(current["control"]["rounding_tolerance_cents"])
        self.assertIsNone(current["control"]["identity_within_rounding_tolerance"])
        self.assertEqual(current["components"]["net_payroll_cents"], 10000)
        self.assertEqual(current["change"]["reason"], "membership_change_protected")
        self.assertTrue(all(
            current["change"][key] is None
            for key in current["change"]
            if key not in {"status", "reason", "previous_period"}
        ))
        self.assertIsNone(
            rows[1]["participant_accounting"][
                "sum_cell_distinct_participants_observed"
            ],
        )

    def test_hidden_participant_count_never_controls_public_order(self):
        low_amount = raw_cell(1, people(1, 50), 100)
        high_amount = raw_cell(2, people(51, 60), 200)
        before = sorted([("low", low_amount), ("high", high_amount)], key=cell_sort_key)
        low_amount.participants = people(1, 500)
        high_amount.participants = people(501, 510)
        after = sorted([("low", low_amount), ("high", high_amount)], key=cell_sort_key)
        self.assertEqual([key for key, _ in before], ["high", "low"])
        self.assertEqual([key for key, _ in after], ["high", "low"])

    def test_mask_helper_nulls_the_count_dependent_control_only(self):
        total = {
            "gross_with_family_allowances_cents": 10000,
            "contributory_earnings_cents": 10000,
            "non_contributory_earnings_cents": 0,
            "family_allowances_cents": 0,
            "employee_withholdings_cents": 0,
            "net_payroll_cents": 10000,
            "net_to_pay_cents": 10000,
            "employer_contributions_cents": 1000,
        }
        cell = source_cell(raw_cell(1, people(1, 12), 100), total, "released", True)
        protect_source_cell_participant_count(cell)
        self.assertIsNone(cell["distinct_participants_observed"])
        self.assertIsNone(cell["control"]["rounding_tolerance_cents"])
        self.assertIsInstance(cell["control"]["net_identity_variance_cents"], int)


if __name__ == "__main__":
    unittest.main()
