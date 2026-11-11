"""Write .env from .env.example, and the secret files with fresh random values (never printed).

    python scripts/make_env.py                      # once, for this machine
    python scripts/make_env.py --set FRONTEND_PORT=5194 --set MULTI_USER_ENABLED=true

Refuses to overwrite an existing .env or secret file, so it cannot replace a password a database
already holds. Secrets go to SECRETS_DIR (from --set, else .env.example's value, default ./secrets),
one file per secret, as docker-compose.yml expects. The folder is made owner-only; the files are
readable inside it, because Compose mounts them as they are and the containers run as other users.

Proven in an app built from this template.
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Each secret file docker-compose.yml names, and how to make a fresh value ("" = left empty).
SECRETS = {
    "db_superuser_password": lambda: secrets.token_urlsafe(24),
    "app_db_password": lambda: secrets.token_urlsafe(24),
    "backup_db_password": lambda: secrets.token_urlsafe(24),
    "admin_password": lambda: secrets.token_urlsafe(18),
    "jwt_secret": lambda: secrets.token_urlsafe(48),
    "smtp_password": lambda: "",  # email is off until SMTP_HOST is set; put the password here then
}


def env_lines(overrides: dict[str, str]) -> list[str]:
    """.env.example's lines with the overrides applied (a key not in the example is added at the end)."""
    lines, seen = [], set()
    for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
        key = line.split("=", 1)[0].strip()
        if "=" in line and not line.lstrip().startswith("#") and key in overrides:
            lines.append(f"{key}={overrides[key]}")
            seen.add(key)
        else:
            lines.append(line)
    lines += [f"{k}={v}" for k, v in overrides.items() if k not in seen]
    return lines


def secrets_dir(lines: list[str]) -> Path:
    for line in lines:
        if line.startswith("SECRETS_DIR="):
            value = line.split("=", 1)[1].strip() or "./secrets"
            path = Path(value)
            return path if path.is_absolute() else (ROOT / path).resolve()
    return ROOT / "secrets"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="a .env setting")
    args = parser.parse_args(argv)
    overrides = dict(item.split("=", 1) for item in args.set)

    env = ROOT / ".env"
    if env.exists():
        print(".env already exists; nothing written")
        return 1
    lines = env_lines(overrides)
    folder = secrets_dir(lines)
    existing = [name for name in SECRETS if (folder / name).exists()]
    if existing:
        print(f"secret files already exist in {folder} ({', '.join(existing)}); nothing written")
        return 1

    folder.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(folder, 0o700)
    except OSError:
        pass  # Windows: the folder takes the user profile's permissions
    for name, fresh in SECRETS.items():
        path = folder / name
        path.write_text(fresh(), encoding="utf-8", newline="")
        try:
            os.chmod(path, 0o644)
        except OSError:
            pass
    env.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote .env and {len(SECRETS)} secret files in {folder} (values not shown)")
    print("sign in as ADMIN_EMAIL from .env; the password is the file admin_password there")
    return 0


if __name__ == "__main__":
    sys.exit(main())
