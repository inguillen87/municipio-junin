import argparse
import datetime as dt
import gzip
import tempfile
import unittest
from pathlib import Path

from scripts.profile_grh import canonical_utc_timestamp, parse_generated_at, profile


FIXTURE = """\
CREATE TABLE `legajo` (\n
  `LEGA_12` int NOT NULL,\n
  `CODI_06` int,\n
  `CODI_07` int\n
) ENGINE=InnoDB;\n
INSERT INTO `legajo` VALUES (100,10,20);\n
"""


class GrhProfileTests(unittest.TestCase):
    def test_profile_uses_the_controlled_canonical_utc_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "grh_20260806.sql.gz"
            with gzip.open(source, "wt", encoding="latin1", newline="") as stream:
                stream.write(FIXTURE)

            result = profile(
                source,
                generated_at=dt.datetime(2026, 8, 9, 4, 5, 6, 789123, tzinfo=dt.timezone.utc),
            )

        self.assertEqual(result["generated_at"], "2026-08-09T04:05:06.789Z")
        self.assertEqual(result["row_counts"], {"legajo": 1})

    def test_timestamp_offsets_are_normalized_and_naive_values_fail_closed(self):
        parsed = parse_generated_at("2026-08-09T01:05:06.789-03:00")
        self.assertEqual(canonical_utc_timestamp(parsed), "2026-08-09T04:05:06.789Z")

        with self.assertRaises(argparse.ArgumentTypeError):
            parse_generated_at("2026-08-09T04:05:06.789")
        with self.assertRaises(ValueError):
            canonical_utc_timestamp(dt.datetime(2026, 8, 9, 4, 5, 6))


if __name__ == "__main__":
    unittest.main()
