"""Automated checks for the mock chain. Run:  py -m unittest discover -s tools/mock -v

These prove the MOCKS and the CANDIDATE contract agree with each other. They do not prove
that real boards, radio, cloud or dashboard work (see docs/integration/INTEGRATION_PLAN.md).
"""

import json
import threading
import unittest
import urllib.error
import urllib.request

import smartcane_codec as sc  # first: puts tools/validator on sys.path
import candidate_validator as cv
import mock_cloud
import mock_gateway

ACCEL = {"x": 0.02, "y": 0.13, "z": 0.98}
GYRO = {"x": 1.1, "y": -0.4, "z": 0.6}


def golden_frame() -> bytes:
    return sc.encode_telemetry(1, 0x1A2B3C4D, 125, 128500, 46.2, ACCEL, GYRO, sc.ORIGIN_PHYSICAL)


class CodecTests(unittest.TestCase):
    def test_encoder_matches_golden_hex_t01(self):
        self.assertEqual(golden_frame(), bytes.fromhex(cv.GOLDEN_TLM_01))

    def test_ack_matches_golden_hex_a01(self):
        ack = sc.encode_ack(1, 0x1A2B3C4D, 125, sc.ACK_ACCEPTED, 1, 234510)
        self.assertEqual(ack, bytes.fromhex(cv.GOLDEN_ACK_01))

    def test_invalid_distance_is_not_zero(self):
        d = sc.decode_telemetry(sc.encode_telemetry(1, 1, 1, 0, None, ACCEL, GYRO))
        self.assertIsNone(d["distance_cm"])
        self.assertFalse(d["distance_valid"])


class GatewayTests(unittest.TestCase):
    def test_accept_then_duplicate(self):
        gw = mock_gateway.Gateway()
        ack, rec, _ = gw.handle_frame(golden_frame())
        self.assertEqual(sc.decode_ack(ack)["status"], "accepted")
        cv.validate_logical("cloud.telemetry", rec)
        self.assertEqual(rec["record_id"], "GW_01:NODE_01:BOOT_1A2B3C4D:125")
        self.assertIsNone(rec["gateway_received_at_utc"])
        ack2, rec2, _ = gw.handle_frame(golden_frame())
        self.assertEqual(sc.decode_ack(ack2)["status"], "duplicate")
        self.assertIsNone(rec2)  # a replayed packet must not create a second record

    def test_bad_payload_rejected_with_ack(self):
        gw = mock_gateway.Gateway()
        frame = bytearray(golden_frame())
        frame[32] = 0xFF  # reserved validity bits set
        ack, rec, _ = gw.handle_frame(bytes(frame))
        self.assertEqual(sc.decode_ack(ack)["status"], "rejected")
        self.assertIsNone(rec)

    def test_garbage_gets_no_ack(self):
        gw = mock_gateway.Gateway()
        ack, rec, _ = gw.handle_frame(b"\x00" * 34)
        self.assertIsNone(ack)
        self.assertIsNone(rec)
        self.assertEqual(gw.counters["dropped"], 1)

    def test_two_nodes_stay_distinct(self):
        gw = mock_gateway.Gateway()
        a = gw.handle_frame(sc.encode_telemetry(1, 5, 1, 0, 10.0, ACCEL, GYRO))[1]
        b = gw.handle_frame(sc.encode_telemetry(2, 5, 1, 0, 20.0, ACCEL, GYRO, sc.ORIGIN_SIMULATED))[1]
        self.assertNotEqual(a["record_id"], b["record_id"])
        self.assertEqual((a["source_id"], b["source_id"]), ("NODE_01", "NODE_02"))
        self.assertEqual((a["origin_kind"], b["origin_kind"]), ("physical", "simulated"))


class CloudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = mock_cloud.serve(0)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def post(self, path, body):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as exc:
            return exc.code, json.load(exc)

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return json.load(r)

    def record(self, seq, dist=46.2, node=7):
        gw = mock_gateway.Gateway()
        return gw.handle_frame(sc.encode_telemetry(node, 9, seq, 1000, dist, ACCEL, GYRO))[1]

    def test_store_duplicate_and_readback(self):
        rec = self.record(1)
        self.assertEqual(self.post("/api/telemetry", rec)[0], 201)
        status, body = self.post("/api/telemetry", rec)  # replay -> idempotent
        self.assertEqual((status, body["status"]), (200, "duplicate"))
        env = self.get("/api/latest?source=NODE_07")
        cv.validate_logical("dashboard.latest", env)
        self.assertEqual(env["measurements"]["distance_cm"], 46.2)
        self.assertEqual(env["freshness"], "fresh")
        self.assertIsNotNone(env["cloud_ingested_at_utc"])
        self.assertEqual(len([r for r in self.get("/api/history?source=NODE_07") if r["source_seq"] == 1]), 1)

    def test_invalid_record_rejected(self):
        rec = self.record(2, node=8)
        rec["validity"]["distance"] = False  # but distance_cm still numeric -> masquerade
        status, body = self.post("/api/telemetry", rec)
        self.assertEqual(status, 400)
        self.assertIn("masquerade", body["error"])

    def test_unknown_source_404(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.get("/api/latest?source=NOPE")
        self.assertEqual(ctx.exception.code, 404)

    def test_event_dedup_by_event_id(self):
        _, _, event, _ = cv.fixtures()
        self.assertEqual(self.post("/api/events", event)[0], 201)
        self.assertEqual(self.post("/api/events", event)[1]["status"], "duplicate")


class UploaderTests(unittest.TestCase):
    def test_buffers_when_cloud_down_and_replays_in_order(self):
        up = mock_gateway.Uploader("http://127.0.0.1:1", capacity=3)  # nothing listens on port 1
        gw = mock_gateway.Gateway()
        for seq in range(1, 6):
            rec = gw.handle_frame(sc.encode_telemetry(1, 1, seq, 0, 10.0, ACCEL, GYRO))[1]
            self.assertTrue(up.submit(rec).startswith("cloud_down"))
        self.assertEqual([r["source_seq"] for r in up.buffer], [3, 4, 5])  # bounded, oldest dropped
        self.assertEqual(up.overflow_dropped, 2)  # data loss is counted, not silent


if __name__ == "__main__":
    unittest.main()
