#!/usr/bin/env python3
"""Secrets are Compose secret files, not settings (SEC: secrets never in .env or the image).

* every secret is declared in docker-compose.yml as a file in SECRETS_DIR;
* no service is given a secret as an environment variable (a *_FILE pointer is fine);
* `.env.example` sets no secret;
* the backend reads /run/secrets;
* the backup service holds only its own read-only database password.

Usage: python scripts/check_secrets.py. Add a secret to SECRETS when the app gains one.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRETS = (
    "db_superuser_password", "app_db_password", "backup_db_password",
    "admin_password", "jwt_secret", "smtp_password",
)
# Names a secret would have as a setting (the backend accepts POSTGRES_PASSWORD off Compose).
ENV_NAMES = {n.upper() for n in SECRETS} | {"POSTGRES_PASSWORD", "DATABASE_URL"}
BACKUP_ONLY = {"backup_db_password"}


def service_block(compose: str, service: str) -> str:
    match = re.search(rf"^  {service}:\n(.*?)(?=^  \S|^\S|\Z)", compose, re.M | re.S)
    return match.group(1) if match else ""


def findings(compose: str, example: str, config: str) -> list[str]:
    out = []
    for name in SECRETS:
        if not re.search(rf"^  {name}:\n    file: \$\{{SECRETS_DIR[^}}]*\}}/{name}$", compose, re.M):
            out.append(f"docker-compose.yml: secret {name} is not a file in SECRETS_DIR")
    for line in example.splitlines():
        key = line.split("=", 1)[0].strip()
        if line.strip() and not line.lstrip().startswith("#") and key in ENV_NAMES:
            out.append(f".env.example sets {key}, which is a secret")
    for line in compose.splitlines():
        if re.match(r"\s+[A-Z_]*(PASSWORD|SECRET|TOKEN)[A-Z_]*:\s*\S", line) and "_FILE:" not in line:
            out.append(f"docker-compose.yml passes a secret as a variable: {line.strip().split(':')[0]}")
    backup = service_block(compose, "backup")
    if not backup:
        out.append("docker-compose.yml: no backup service")
    for name in set(SECRETS) - BACKUP_ONLY:
        if re.search(rf"(?<![a-z_]){name}(?![a-z_])", backup) or "*app-secrets" in backup:
            out.append(f"docker-compose.yml: the backup service is given {name}")
    if "secrets_dir=" not in config or '"/run/secrets"' not in config:
        out.append("backend config does not read /run/secrets")
    return out


def main() -> int:
    found = findings(
        (ROOT / "docker-compose.yml").read_text(encoding="utf-8"),
        (ROOT / ".env.example").read_text(encoding="utf-8"),
        (ROOT / "backend" / "app" / "core" / "config.py").read_text(encoding="utf-8"),
    )
    for finding in found:
        print("FAIL", finding)
    print(f"secrets check: {len(SECRETS)} secrets, {len(found)} finding(s)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
