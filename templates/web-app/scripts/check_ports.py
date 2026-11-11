#!/usr/bin/env python3
"""Every published port binds to 127.0.0.1, so nothing listens on the network (POL-06).

Reads `docker compose config`, so it checks what Compose will really do, with .env applied.
Usage: python scripts/check_ports.py   (needs Docker and a .env; CI copies .env.example)
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def findings_in(services: dict) -> tuple[int, list[str]]:
    findings, published = [], 0
    for name, service in services.items():
        for port in service.get("ports", []):
            published += 1
            if port.get("host_ip") != "127.0.0.1":
                where = port.get("host_ip") or "every address"
                findings.append(f"{name} publishes {port.get('published')} on {where}")
    return published, findings


def main() -> int:
    result = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        print("FAIL docker compose config:", result.stderr.strip().splitlines()[-1:])
        return 1
    published, findings = findings_in(json.loads(result.stdout)["services"])
    for finding in findings:
        print("FAIL", finding)
    print(f"ports check: {published} published port(s), {len(findings)} not on 127.0.0.1")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
