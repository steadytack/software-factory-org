"""Smoke test of the running stack: what a person, a browser and the operator rely on.

Run from the project folder after `docker compose up -d --build --wait`:

    python scripts/smoke.py              # add --backup to take and check one backup too

It reads the ports from .env and the admin password from its secret file (never printing a
secret). With MULTI_USER_ENABLED=true it creates (or resets) one viewer and disables it again at
the end. Exit code 0 when every check passes. Extend `domain_checks` with the app's own reads.

Proven in an app built from this template.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = {
    k.strip(): v.strip()
    for k, _, v in (
        line.partition("=")
        for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
        if "=" in line and not line.lstrip().startswith("#")
    )
}
SECRETS = ROOT / ENV.get("SECRETS_DIR", "./secrets")
WEB = f"http://127.0.0.1:{ENV.get('FRONTEND_PORT', '5174')}"
API = f"http://127.0.0.1:{ENV.get('BACKEND_PORT', '8001')}"
APP_ROLE = ENV.get("POSTGRES_USER", "app")
VIEWER = {"email": "smoke-viewer@example.com", "password": "Smoke#Viewer#Pass1"}
# Reads that must refuse an anonymous caller. Add the app's own lists here.
PROTECTED = ["/api/auth/me", "/api/sites", "/api/surveys", "/api/stats/dashboard"]

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  (' + detail + ')') if detail else ''}")


class Client:
    def __init__(self, base: str, origin: str | None = None) -> None:
        self.base = base
        self.origin = origin
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

    def call(self, method: str, path: str, body: object = None) -> tuple[int, object, dict]:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.base + path, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if self.origin:
            request.add_header("Origin", self.origin)
        try:
            with self.opener.open(request, timeout=20) as response:
                raw = response.read()
                body = json.loads(raw) if raw[:1] in (b"{", b"[") else raw
                return response.status, body, dict(response.headers)
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                return exc.code, json.loads(raw), dict(exc.headers)
            except ValueError:
                return exc.code, raw, dict(exc.headers)

    def login(self, who: dict) -> int:
        return self.call("POST", "/api/auth/login", who)[0]


def compose(*args: str, timeout: int = 300) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", "compose", *args], cwd=ROOT, capture_output=True, text=True, timeout=timeout
    )


def sql(query: str) -> str:
    """One value from the database, as its superuser (inside the db container, no password)."""
    run = compose("exec", "-T", "db", "psql", "-U", "postgres", "-d", ENV.get("POSTGRES_DB", "app"), "-tAc", query)
    return run.stdout.strip()


def domain_checks(admin: Client, viewer: Client | None) -> None:
    """The app's own reads; the template's are the sample sites and surveys."""
    status, body, _ = admin.call("GET", "/api/sites?limit=1")
    check("the admin reads the sites list", status == 200 and "items" in body)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", action="store_true", help="take one backup and check it")
    args = parser.parse_args(argv)
    admin_who = {"email": ENV["ADMIN_EMAIL"], "password": (SECRETS / "admin_password").read_text().strip()}
    multi_user = ENV.get("MULTI_USER_ENABLED", "false").lower() == "true"

    # The stack answers, through the web server too.
    status, body, _ = Client(API).call("GET", "/api/health")
    check("API health answers with the database reachable", status == 200 and body == {"status": "ok", "database": "ok"})
    status, page, headers = Client(WEB).call("GET", "/")
    check("web app serves its page", status == 200 and b'id="root"' in page)
    check("the page carries a Content-Security-Policy", "Content-Security-Policy" in headers)
    status, _, _ = Client(WEB).call("GET", "/api/health")
    check("web app proxies the API", status == 200)

    # Access.
    anonymous = Client(API)
    refused = [p for p in PROTECTED if anonymous.call("GET", p)[0] != 401]
    check("anonymous reads are refused (401)", not refused, ", ".join(refused))
    admin = Client(API)
    check("the admin signs in", admin.login(admin_who) == 200)
    status, me, _ = admin.call("GET", "/api/auth/me")
    check("the admin's role is admin", status == 200 and me.get("role") == "admin")

    viewer = None
    if multi_user:
        status, _, _ = admin.call("POST", "/api/users", {**VIEWER, "role": "viewer"})
        if status == 409:
            users = admin.call("GET", "/api/users")[1]
            user = next(u for u in users if u["email"] == VIEWER["email"])
            admin.call("PATCH", f"/api/users/{user['id']}", {"role": "viewer", "is_active": True})
            admin.call("POST", f"/api/users/{user['id']}/password", {"password": VIEWER["password"]})
            status = 201
        check("an admin creates a viewer", status == 201)
        viewer = Client(API)
        check("the viewer signs in", viewer.login(VIEWER) == 200)
        blocked = [
            f"{m} {p}"
            for m, p, b in (("GET", "/api/users", None), ("POST", "/api/sites", {"name": "x"}))
            if viewer.call(m, p, b)[0] != 403
        ]
        check("a viewer is refused admin and edit actions (403)", not blocked, ", ".join(blocked))

    domain_checks(admin, viewer)

    # A browser from another site cannot act with the person's session.
    # From each origin .env allows (CORS_ORIGINS), as a browser on that address would.
    for origin in [o.strip() for o in ENV.get("CORS_ORIGINS", WEB).split(",") if o.strip()]:
        check(f"sign-in through the web app from {origin}", Client(WEB, origin=origin).login(admin_who) == 200)
    status, _, _ = Client(WEB, origin="http://evil.example").call("POST", "/api/auth/login", admin_who)
    check("another site's Origin is refused (403)", status == 403)

    # Least privilege in the database (docker/db-init/roles.sh).
    check("the app's database role is not a superuser", sql(f"select rolsuper from pg_roles where rolname = '{APP_ROLE}'") == "f")
    check(
        "the backup role reads but cannot write",
        sql(f"select pg_has_role('{APP_ROLE}_backup', 'pg_read_all_data', 'member')") == "t"
        and sql(f"select pg_has_role('{APP_ROLE}_backup', 'pg_write_all_data', 'member')") == "f",
    )

    # The scheduler is running.
    logs = compose("logs", "scheduler").stdout
    check("the scheduler started", "scheduler_sleeping" in logs)

    if args.backup:
        before = {p.name for p in (ROOT / "backups").glob("*")} if (ROOT / "backups").is_dir() else set()
        run = compose("run", "--rm", "-T", "-e", "BACKUP_ONCE=1", "backup")
        new = sorted({p.name for p in (ROOT / "backups").glob("*")} - before)
        check(
            "a backup runs on demand and leaves a finished dump and archive",
            run.returncode == 0
            and any(n.startswith("db-") and n.endswith(".dump") for n in new)
            and any(n.startswith("uploads-") and n.endswith(".tar.gz") for n in new),
            ", ".join(new) or run.stderr.strip()[-160:],
        )

    if viewer is not None:  # leave no account behind with a known password
        users = admin.call("GET", "/api/users")[1]
        left = next((u for u in users if u["email"] == VIEWER["email"]), None)
        if left:
            admin.call("PATCH", f"/api/users/{left['id']}", {"is_active": False})

    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} of {len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
