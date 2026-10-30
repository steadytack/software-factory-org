#!/usr/bin/env python3
"""Check that an app is safe to publish, and publish it only on a typed confirmation.

Usage: python factory/scripts/publish.py <slug> [--fix] [--create] [--public]

Dry run by default: checks ideas/<slug>/app and writes ideas/<slug>/publish-report.md. The only
change it makes is copying spec/ into app/docs/spec/ (and, with --fix, adding a LICENSE).
  --create   after a report with no blockers, create the GitHub repository and push; the repository
             name must be typed back to confirm (policy POL-01). Private unless --public.
  --public   make the new repository public; the word "public" must also be typed.

Where the repository is created, its licence and copyright holder come from the `publish` settings in
factory/context/scopes.json (the group's, overridden by the idea's business). Without them: the
signed-in GitHub user, MIT, copyright git user.name.
"""

from __future__ import annotations

import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import scan  # noqa: E402
import scopes  # noqa: E402

MIT = """MIT License

Copyright (c) {year} {name}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
PROPRIETARY = """Copyright (c) {year} {name}. All rights reserved.

This software is confidential and proprietary to {name}. It may not be copied, distributed or used
except as {name} permits in writing.
"""
LICENCES = {"MIT": MIT, "proprietary": PROPRIETARY}
SKIP_TEXT = re.compile(r"\.lock$|package-lock\.json|openapi|\.png$|\.jpe?g$|\.ico$|\.woff2?$|\.pdf$")


class Report:
    def __init__(self) -> None:
        self.blockers: list[str] = []
        self.warnings: list[str] = []
        self.passed: list[str] = []

    def check(self, ok: bool, passed: str, failed: str, blocking: bool = True) -> None:
        if ok:
            self.passed.append(passed)
        else:
            (self.blockers if blocking else self.warnings).append(failed)

    def markdown(self, slug: str) -> str:
        def section(title: str, items: list[str], empty: str = "None.") -> str:
            body = "\n".join(f"- {i}" for i in items) if items else empty
            return f"## {title} ({len(items)})\n{body}\n"

        stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return (
            f"# Publish report: {slug}\n\nRun {stamp}. Dry run unless noted. Nothing was pushed.\n\n"
            + section("Blockers", self.blockers) + "\n" + section("Warnings", self.warnings) + "\n" + section("Passed", self.passed)
        )


def git(app: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(app), *args], capture_output=True, text=True)


def files_with(app: Path, tracked: list[str], pattern: str) -> list[str]:
    hits = []
    for rel in tracked:
        if not rel or SKIP_TEXT.search(rel):
            continue
        text = scan.read_text(app / rel)
        if text and re.search(pattern, text):
            hits.append(rel)
    return hits


def settings_for(slug: str, root: Path | None = None) -> dict:
    """The publish settings for the idea's scope (scopes.json), or the single-owner defaults."""
    try:
        state = lib.load_state(slug, root)
    except lib.FactoryError:
        state = {}
    return scopes.publish_settings(scopes.idea_scope(state), scopes.registry(root))


def run_checks(slug: str, fix: bool, root: Path | None = None) -> Report:
    base = root or lib.ROOT
    idea = lib.idea_dir(slug, root)
    app = idea / "app"
    r = Report()
    if not app.is_dir():
        raise lib.FactoryError(f"no app at ideas/{slug}/app")

    is_repo = git(app, "rev-parse", "--git-dir").returncode == 0
    r.check(is_repo, "app is a git repository", "app is not a git repository")
    remote = git(app, "remote").stdout.strip()
    r.check(not remote, "no git remote yet", f"app already has a git remote: {remote}")
    tracked = git(app, "ls-files").stdout.splitlines() if is_repo else []

    # 1. the spec travels with the app, and passes its check
    spec = idea / "spec"
    if spec.is_dir() and any(spec.glob("*.md")):
        (app / "docs" / "spec").mkdir(parents=True, exist_ok=True)
        for md in spec.glob("*.md"):
            shutil.copy(md, app / "docs" / "spec" / md.name)
        r.passed.append("spec copied to app/docs/spec/")
        checker = base / "factory" / "scripts" / "check_spec.py"
        if checker.exists():
            done = subprocess.run([sys.executable, str(checker), slug], capture_output=True, text=True)
            r.check(done.returncode == 0, "spec check passes", "spec check fails (run check_spec.py)")
        else:
            r.warnings.append("spec check not run (check_spec.py is not installed)")
    else:
        r.blockers.append("no spec in ideas/<slug>/spec")

    # 2-4. secrets: files, patterns in the tree, files ever added to history
    findings = scan.scan_secrets(app, tracked)
    hard = [f"{f.what} in {f.where}" for f in findings if f.severity == "blocker" and f.what != "a secret-looking file"]
    files = [f.where for f in findings if f.what == "a secret-looking file"]
    r.check(not files, "no .env or key files tracked", "secret-looking files tracked: " + " ".join(files))
    r.check(not hard, "no known secret patterns in the tree", "secrets in the tree: " + "; ".join(hard))
    r.warnings += [f"{f.what} in {f.where}" for f in findings if f.severity == "warning"]
    added = git(app, "log", "--all", "--diff-filter=A", "--name-only", "--pretty=format:").stdout.splitlines()
    history = sorted({n for n in added if re.search(r"(^|/)\.env$|\.pem$|id_rsa", n) and "example" not in n})
    r.check(not history, "no .env or key files in history",
            f"secret-looking files in git history: {' '.join(history)} (rotate them and clean history before publishing)")

    # 5. hygiene
    gitignore = scan.read_text(app / ".gitignore") or ""
    r.check(bool(re.search(r"(?m)^\.env", gitignore)), ".gitignore covers .env", ".gitignore missing or does not ignore .env")
    settings = settings_for(slug, root)
    licence = settings["licence"]
    if (app / "LICENSE").exists():
        is_mit = (scan.read_text(app / "LICENSE") or "").lstrip().startswith("MIT License")
        r.check(is_mit == (licence == "MIT"), "LICENSE present", f"LICENSE does not look like the {licence} licence this scope publishes under", blocking=False)
    elif fix:
        name = settings["copyright"] or git(app, "config", "user.name").stdout.strip() or "owner"
        (app / "LICENSE").write_text(LICENCES[licence].format(year=dt.date.today().year, name=name), encoding="utf-8", newline="\n")
        r.passed.append(f"LICENSE ({licence}) created by --fix")
    else:
        r.blockers.append(f"no LICENSE (run with --fix to add the {licence} licence)")
    readme = scan.read_text(app / "README.md")
    if readme is None:
        r.blockers.append("no README.md")
    else:
        covers = re.search(r"(?i)run|start|install", readme) and re.search(r"(?i)test", readme)
        r.check(bool(covers), "README covers running and testing", "README should say how to run and test it", blocking=False)
    r.check(any((app / ".github" / "workflows").glob("*.yml")), "CI workflow present", "no CI workflow in .github/workflows", blocking=False)
    paths = files_with(app, tracked, r"C:\\Users\\|/c/Users/|/home/[a-z]+/")
    r.check(not paths, "no machine-specific paths", "machine-specific paths in: " + " ".join(paths), blocking=False)
    mail = files_with(app, tracked, r"[A-Za-z0-9._-]+@(gmail|googlemail|outlook|hotmail)\.com")
    r.check(not mail, "no personal email addresses", "personal email addresses in: " + " ".join(mail), blocking=False)
    left = files_with(app, tracked, r"web app template|web-app-template|Web App Template")
    r.check(not left, "no template leftovers", "template wording left in: " + " ".join(left), blocking=False)
    clean = is_repo and not git(app, "status", "--porcelain").stdout.strip()
    r.check(clean, "working tree clean", "uncommitted changes (the spec copy counts); commit before publishing", blocking=False)

    # 6. open items the spec says must be settled before publishing
    register = spec / "09-assumptions-risks-decisions.md"
    if register.exists():
        items = [
            m.group(1)
            for line in register.read_text(encoding="utf-8").splitlines()
            if re.search(r"(?i)before publish|blocks:? *(release|publish)", line)
            for m in [re.match(r"^\|\s*([A-Z]+-\d+)", line)]
            if m
        ]
        r.check(not items, "no spec items waiting on publishing", "spec items to settle before publishing: " + ", ".join(items), blocking=False)
    return r


def create(slug: str, app: Path, public: bool, ask=input, owner: str | None = None) -> int:
    """Create the GitHub repository and push, after the owner types the confirmation.
    `owner` is the user or organisation to create it under; None: the signed-in user."""
    login = subprocess.run(["gh", "api", "user", "-q", ".login"], capture_output=True, text=True)
    if login.returncode != 0:
        print("gh is not signed in", file=sys.stderr)
        return 1
    owner = owner or login.stdout.strip()
    visibility = "public" if public else "private"
    print(f"This creates a {visibility.upper()} repository {owner}/{slug} and pushes the app to it.")
    if ask("Type the repository name to confirm: ").strip() != slug:
        print("Name did not match; nothing created.", file=sys.stderr)
        return 1
    if public and ask('Type "public" to make it visible to everyone: ').strip() != "public":
        print("Not confirmed as public; nothing created.", file=sys.stderr)
        return 1
    git(app, "add", "-A", "docs", "LICENSE")
    if git(app, "diff", "--cached", "--quiet").returncode != 0:
        git(app, "commit", "-q", "-m", "Add spec and licence for publishing")
    repo = f"{owner}/{slug}"
    done = subprocess.run(["gh", "repo", "create", repo, f"--{visibility}", "--source", str(app), "--push"])
    print("created and pushed" if done.returncode == 0 else "gh repo create FAILED; see the output above")
    if done.returncode == 0:
        try:
            record_app(slug, repo, f"https://github.com/{repo}", app.parents[2])
        except lib.FactoryError as exc:  # the push worked; do not report it as failed
            print(f"pushed, but the link was not recorded in state.json: {exc}", file=sys.stderr)
    return done.returncode


def record_app(slug: str, repo: str, url: str, root: Path | None = None) -> None:
    """Remember where the app was published, so the status view can link to it."""
    state = lib.load_state(slug, root)
    state["app"] = {"repo": repo, "url": url}
    lib.save_state(slug, state, root)


def main(argv: list[str]) -> int:
    args = argv[1:]
    flags = {a for a in args if a.startswith("--")}
    rest = [a for a in args if not a.startswith("--")]
    unknown = flags - {"--fix", "--create", "--public"}
    if len(rest) != 1 or unknown:
        print(__doc__)
        return 2
    slug = rest[0]
    try:
        report = run_checks(slug, fix="--fix" in flags)
    except lib.FactoryError as exc:
        print(f"publish: {exc}", file=sys.stderr)
        return 1
    path = lib.idea_dir(slug) / "publish-report.md"
    path.write_text(report.markdown(slug), encoding="utf-8", newline="\n")
    print(f"Report: {path}  (blockers {len(report.blockers)}, warnings {len(report.warnings)}, passed {len(report.passed)})")
    for b in report.blockers:
        print(f" blocker: {b}")
    if "--create" in flags:
        if report.blockers:
            print("Not creating: fix the blockers first.", file=sys.stderr)
            return 1
        settings = settings_for(slug)
        public = "--public" in flags or settings["visibility"] == "public"
        return create(slug, lib.idea_dir(slug) / "app", public=public, owner=settings["owner"])
    return 0 if not report.blockers else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
