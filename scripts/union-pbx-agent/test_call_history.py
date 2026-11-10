import csv
import io
import json
from pathlib import Path
import tempfile
import unittest

import call_history as history


EXT = "uw-" + "a" * 32
ALLOWED = {"union-301", EXT, "union-fvx-in", "union-fvx-out-test"}


def row(**changes):
    values = dict(uniqueid="1794260000.12", sequence="1", linkedid="1794260000.12",
                  start="1794260000.125", answer="1794260003.25", end="1794260010.5",
                  src="301", dst="302", channel="PJSIP/union-301-00000001",
                  dstchannel="PJSIP/" + EXT + "-00000002", disposition="ANSWERED",
                  duration="10", billsec="7")
    values.update(changes)
    stream = io.StringIO(newline="")
    csv.writer(stream, lineterminator="\n").writerow([values[key] for key in history.FIELDS])
    return stream.getvalue().encode()


class CallHistoryTests(unittest.TestCase):
    def test_cdr_template_preserves_endpoint_hyphens_and_exact_schema(self):
        import re
        template = Path(__file__).with_name("cdr_custom.conf").read_text()
        self.assertIn("${CSV_QUOTE(${CDR(channel)})}", template)
        self.assertIn("${CSV_QUOTE(${CDR(dstchannel)})}", template)
        mapping = next(line for line in template.splitlines() if line.startswith("union-calls.csv =>"))
        self.assertEqual(re.findall(r"CDR\((\w+)(?:,u)?\)", mapping), list(history.FIELDS))
        self.assertNotIn("MixMonitor", template)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "union-calls.csv"
        self.cursor = Path(self.tmp.name) / "cursor.json"

    def collect(self, sender=lambda records: {"accepted": True}):
        return history.sync_history(self.path, self.cursor, ALLOWED, sender)

    def test_collects_exact_endpoints_and_epoch_times(self):
        self.path.write_bytes(row())
        sent = []
        self.assertEqual(self.collect(lambda records: sent.extend(records) or {"accepted": True}), 1)
        self.assertEqual(sent[0]["source_endpoint"], "union-301")
        self.assertEqual(sent[0]["destination_endpoint"], EXT)
        self.assertEqual(sent[0]["event_id"], "1794260000.12:1")
        self.assertEqual(sent[0]["started_at"], "2026-11-09T21:33:20.125000+00:00")
        self.assertEqual(self.collect(lambda _: self.fail("duplicate upload")), 0)

    def test_failed_or_unconfirmed_upload_replays_without_cursor_advance(self):
        self.path.write_bytes(row())
        with self.assertRaises(history.HistoryError):
            self.collect(lambda _: {"accepted": False})
        self.assertFalse(self.cursor.exists())
        with self.assertRaises(TimeoutError):
            self.collect(lambda _: (_ for _ in ()).throw(TimeoutError()))
        self.assertEqual(self.collect(), 1)

    def test_incomplete_line_waits_for_next_cycle(self):
        data = row()
        self.path.write_bytes(data[:-3])
        self.assertEqual(self.collect(), 0)
        with self.path.open("ab") as stream:
            stream.write(data[-3:])
        self.assertEqual(self.collect(), 1)

    def test_unknown_and_cross_tenant_legs_never_leave_vps(self):
        self.path.write_bytes(row(channel="PJSIP/101-00000001", dstchannel="") +
                              row(dstchannel="PJSIP/other-company-00000002") +
                              row(channel="Local/850@shared-00000001;1"))
        self.assertEqual(self.collect(lambda _: self.fail("foreign metadata uploaded")), 0)

    def test_no_answer_keeps_null_answer_and_accepts_no_destination_channel(self):
        self.path.write_bytes(row(answer="0.000000", billsec="0", dstchannel="", disposition="NO ANSWER"))
        sent = []
        self.collect(lambda records: sent.extend(records) or {"accepted": True})
        self.assertIsNone(sent[0]["answered_at"])
        self.assertIsNone(sent[0]["destination_endpoint"])

    def test_rejects_control_characters_invalid_time_and_inconsistent_duration(self):
        for changes in ({"src": "301\nsecret"}, {"start": "nan"}, {"end": "1"},
                        {"billsec": "99"}, {"sequence": "-1"}, {"disposition": "unexpected"}):
            self.path.write_bytes(row(**changes))
            self.cursor.unlink(missing_ok=True)
            self.assertEqual(self.collect(lambda _: self.fail("malformed uploaded")), 0)

    def test_small_batches_bound_signed_body(self):
        self.path.write_bytes(b"".join(row(uniqueid=f"1794260000.{i}") for i in range(25)))
        sizes = []
        sender = lambda records: sizes.append(len(json.dumps(records))) or {"accepted": True}
        self.assertEqual(self.collect(sender), 10)
        self.assertEqual(self.collect(sender), 10)
        self.assertEqual(self.collect(sender), 5)
        self.assertTrue(all(size < 15000 for size in sizes))

    def test_rotation_drains_previous_inode_before_new_file(self):
        self.path.write_bytes(row())
        self.collect()
        with self.path.open("ab") as stream:
            stream.write(row(uniqueid="1794260000.13"))
        self.path.rename(self.path.with_suffix(".csv.1"))
        self.path.write_bytes(row(uniqueid="1794260000.14"))
        seen = []
        sender = lambda records: seen.extend(r["event_id"] for r in records) or {"accepted": True}
        self.assertEqual(self.collect(sender), 1)
        self.assertEqual(self.collect(sender), 1)
        self.assertEqual(seen, ["1794260000.13:1", "1794260000.14:1"])

    def test_copytruncate_detected_even_if_new_file_grows_past_old_offset(self):
        self.path.write_bytes(row())
        self.collect()
        self.path.write_bytes(row(uniqueid="1794260000.15") + row(uniqueid="1794260000.16"))
        self.assertEqual(self.collect(), 2)

    def test_inbound_technical_destination_and_withheld_caller_are_retained(self):
        self.path.write_bytes(row(channel="PJSIP/union-fvx-in-00000001", src="anonymous", dst="s"))
        seen = []
        self.assertEqual(self.collect(lambda records: seen.extend(records) or {"accepted": True}), 1)
        self.assertEqual(seen[0]["source"], "")
        self.assertEqual(seen[0]["destination"], "")

    def test_multiple_rotations_do_not_skip_intermediate_file(self):
        self.path.write_bytes(row())
        self.collect()
        with self.path.open("ab") as stream:
            stream.write(row(uniqueid="1794260000.18"))
        self.path.rename(self.path.with_suffix(".csv.2"))
        self.path.with_suffix(".csv.1").write_bytes(row(uniqueid="1794260000.19"))
        self.path.write_bytes(row(uniqueid="1794260000.20"))
        seen = []
        sender = lambda records: seen.extend(r["event_id"] for r in records) or {"accepted": True}
        for _ in range(3):
            self.collect(sender)
        self.assertEqual(seen, ["1794260000.18:1", "1794260000.19:1", "1794260000.20:1"])

    def test_missing_rotated_file_fails_closed(self):
        self.path.write_bytes(row())
        self.collect()
        other = self.path.with_suffix(".new")
        other.write_bytes(row(uniqueid="1794260000.17"))
        self.path.unlink()
        other.replace(self.path)
        with self.assertRaises(history.HistoryError):
            self.collect()

    def test_missing_backend_is_harmless_and_corrupt_cursor_not_overwritten(self):
        self.assertEqual(self.collect(), 0)
        self.path.write_bytes(row())
        self.cursor.write_text("invalid")
        with self.assertRaises(history.HistoryError):
            self.collect()
        self.assertEqual(self.cursor.read_text(), "invalid")

    def test_oversized_record_does_not_advance(self):
        self.path.write_bytes(b"a" * 17000 + b"\n")
        with self.assertRaises(history.HistoryError):
            self.collect()
        self.assertFalse(self.cursor.exists())


if __name__ == "__main__":
    unittest.main()
