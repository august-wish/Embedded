"""Checks for the serial capture tool (no board needed).  Run:  py -m unittest discover -s tools/serial -v"""

import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

import capture_serial as cap
import smartcane_codec as sc

HERE = pathlib.Path(__file__).resolve().parent
TRACE = HERE.parent / "mock" / "trace_record.py"
GOOD_HEX = sc.encode_telemetry(1, 0x1A2B3C4D, 7, 100, 46.2, {"x": 0, "y": 0, "z": 1}, {"x": 0, "y": 0, "z": 0}).hex()


class ParseTests(unittest.TestCase):
    def test_tx_line(self):
        kind, e = cap.parse_line(f"TX node=1 seq=7 dist_cm=46.2 attempt=0 hex={GOOD_HEX}")
        self.assertEqual((kind, e["event"], e["source_id"], e["seq"], e["distance_cm"]), ("TX", "sent", "NODE_01", 7, 46.2))
        self.assertEqual(e["hex_check"], "match")

    def test_invalid_distance_is_none_not_zero(self):
        _, e = cap.parse_line("TX node=1 seq=8 dist_cm=invalid")
        self.assertIsNone(e["distance_cm"])

    def test_hex_mismatch_is_flagged(self):
        _, e = cap.parse_line(f"RX node=1 seq=99 dist_cm=46.2 hex={GOOD_HEX}")  # hex says seq=7
        self.assertTrue(e["hex_check"].startswith("MISMATCH"))

    def test_bad_hex_is_flagged(self):
        _, e = cap.parse_line("RX node=1 seq=7 hex=ZZ")
        self.assertTrue(e["hex_check"].startswith("invalid"))

    def test_noise_and_bad_lines_ignored(self):
        for line in ("ESP32 boot", "", "TX node=x seq=1", "TX seq=1", "TX node=1 seq=2 dist_cm=abc", "XTX node=1 seq=1"):
            self.assertIsNone(cap.parse_line(line), line)

    def test_role_filter(self):
        with tempfile.TemporaryDirectory() as d:
            out = str(pathlib.Path(d) / "o.jsonl")
            stats = cap.process(["TX node=1 seq=1 dist_cm=5", "RX node=1 seq=1 dist_cm=5"], "node", out, echo=False)
            self.assertEqual((stats["logged"], stats["ignored"]), (1, 1))


class ReplayAndTraceTests(unittest.TestCase):
    def test_sample_files_trace_pass(self):
        with tempfile.TemporaryDirectory() as d:
            node, gw = str(pathlib.Path(d) / "n.jsonl"), str(pathlib.Path(d) / "g.jsonl")
            with open(HERE / "sample_node.txt", encoding="utf-8") as f:
                sn = cap.process(f, "node", node, echo=False)
            with open(HERE / "sample_gateway.txt", encoding="utf-8") as f:
                sg = cap.process(f, "gateway", gw, echo=False)
            self.assertEqual((sn["logged"], sn["hex_problems"], sg["logged"], sg["hex_problems"]), (7, 0, 6, 0))
            r = subprocess.run([sys.executable, str(TRACE), "--source", "NODE_01", "--seq", "2",
                                "--node-log", node, "--gateway-log", gw, "--cloud", ""],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("PASS        node log      sent 2x", r.stdout)  # seq 2 was retried once
            self.assertIn("PASS        gateway log", r.stdout)
            with open(gw, encoding="utf-8") as f:
                rows = [json.loads(x) for x in f]
            self.assertEqual(rows[0]["event"], "rx")


if __name__ == "__main__":
    unittest.main()
