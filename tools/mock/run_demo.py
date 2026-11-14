#!/usr/bin/env python3
"""One-command demo: starts mock cloud + mock gateway + mock node, then traces the last message.

  py tools/mock/run_demo.py                 # clean run
  py tools/mock/run_demo.py --drop-rate 0.3 # lossy radio: watch retries and delivery rate
  py tools/mock/run_demo.py --nodes 3       # 3 simulated nodes at the same time (scalability test)

Logs go to tools/mock/demo_out/ (git-ignored). Everything is MOCK data.
"""

import argparse
import json
import pathlib
import subprocess
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "demo_out"


def wait_health(url: str, tries: int = 50) -> bool:
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url + "/api/health", timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--count", type=int, default=15)
    p.add_argument("--nodes", type=int, default=1)
    p.add_argument("--drop-rate", type=float, default=0.0)
    p.add_argument("--cloud-port", type=int, default=8080)
    p.add_argument("--gateway-port", type=int, default=5001)
    a = p.parse_args()

    OUT.mkdir(exist_ok=True)
    for f in OUT.glob("*.jsonl"):
        f.unlink()
    py = sys.executable
    cloud_url = f"http://127.0.0.1:{a.cloud_port}"
    procs = []
    try:
        procs.append(subprocess.Popen([py, str(HERE / "mock_cloud.py"), "--port", str(a.cloud_port)]))
        if not wait_health(cloud_url):
            print("cloud did not start")
            return 2
        procs.append(subprocess.Popen([py, str(HERE / "mock_gateway.py"), "--listen", f"127.0.0.1:{a.gateway_port}",
                                       "--cloud", cloud_url, "--log", str(OUT / "gateway.jsonl")]))
        time.sleep(0.5)
        nodes = [subprocess.Popen([py, str(HERE / "mock_node.py"), "--gateway", f"127.0.0.1:{a.gateway_port}",
                                   "--node-id", str(i + 1), "--count", str(a.count), "--interval", "0.2",
                                   "--drop-rate", str(a.drop_rate), "--seed", str(i + 1),
                                   "--log", str(OUT / f"node{i + 1}.jsonl")]) for i in range(a.nodes)]
        rc = max(n.wait() for n in nodes)
        time.sleep(0.5)
        print("\n--- /api/sources (what a dashboard would read) ---")
        with urllib.request.urlopen(cloud_url + "/api/sources") as r:
            for env in json.load(r):
                print(f"{env['source_id']} [{env['origin_kind']}] seq={env['source_seq']} "
                      f"{env['measurements'].get('distance_cm')} cm freshness={env['freshness']}")
        print("\n--- trace of the last message of NODE_01 ---")
        subprocess.run([py, str(HERE / "trace_record.py"), "--source", "NODE_01", "--seq", str(a.count),
                        "--node-log", str(OUT / "node1.jsonl"), "--gateway-log", str(OUT / "gateway.jsonl"),
                        "--cloud", cloud_url])
        return rc
    finally:
        for pr in procs:
            pr.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
