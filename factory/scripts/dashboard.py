#!/usr/bin/env python3
"""A read-only web page: how the factory works, where each idea is, the apps built, and the documents.

Usage: python factory/scripts/dashboard.py [--port 8765]
       python factory/scripts/dashboard.py --write [path]

Without --write, serves on 127.0.0.1 only, for the owner: every idea (from status.collect), the
published apps, and any markdown document in the repository. Ideas are developed with /factory in
Claude Code, not from this page.
  --write    write one self-contained page to share (default ideas/dashboard.html). It holds only
             the documents listed in factory/web/share.json, rendered in. Before writing, the
             shared documents are checked for secrets (blocks), personal emails and machine paths
             (warnings).
"""

from __future__ import annotations

import html
import json
import os
import posixpath
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import scan  # noqa: E402
import status  # noqa: E402
import pipeline  # noqa: E402

PAGE = "factory/web/index.html"
SHARE = "factory/web/share.json"
SLUG = re.compile(r"^[a-z][a-z0-9-]*$")
SKIP_DIRS = {"node_modules", ".git", ".venv", "__pycache__", "dist", ".pytest_cache", "backups"}
IDEA_DOCS = ["idea.md", "spike.md", "overview.md", "idea-brief.md", "assessment.md", "decisions.md", "changes.md", "application-definition.md", "verification.md", "publish-report.md"]
PERSONAL = {
    "a personal email address": re.compile(r"[A-Za-z0-9._-]+@(gmail|googlemail|outlook|hotmail|yahoo|icloud)\.com"),
    "a machine path": re.compile(r"C:\\Users\\|/c/Users/|/home/[a-z]+/|/Users/[A-Za-z]+/"),
}


# ---------------------------------------------------------------- data

def parse_changes(path: Path) -> list[dict]:
    """The rows of the change-request table in changes.md, as {column: value}."""
    if not path.exists():
        return []
    header: list[str] | None = None
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if set("".join(cells)) <= set("-: "):
            continue
        if header is None:
            header = cells
        elif len(cells) == len(header) and re.match(r"CR-\d+", cells[0]):
            rows.append(dict(zip(header, cells)))
    return rows


def excluded(rel: str) -> bool:
    parts = rel.split("/")
    if SKIP_DIRS & set(parts):
        return True
    if len(parts) > 2 and parts[0] == "ideas" and parts[2] == "app":
        return True
    return len(parts) > 3 and parts[:2] == ["catalogue", "sources"] and parts[3] in ("original", "clone")


def all_docs(root: Path) -> list[str]:
    found = []
    for here, dirs, files in os.walk(root):
        rel_dir = Path(here).relative_to(root).as_posix()
        dirs[:] = [d for d in dirs if not excluded(posixpath.join(rel_dir, d, "x.md").lstrip("./"))]
        found += [posixpath.join(rel_dir, f).lstrip("./") for f in files if f.endswith(".md")]
    return sorted(found)


def idea_docs(root: Path, slug: str) -> list[str]:
    base = root / "ideas" / slug
    docs = [f"ideas/{slug}/{n}" for n in IDEA_DOCS if (base / n).exists()]
    for sub in ("gates", "spec"):
        docs += sorted(p.relative_to(root).as_posix() for p in (base / sub).glob("*.md")) if (base / sub).is_dir() else []
    return docs


def view(root: Path | None = None) -> dict:
    """Everything the page needs: ideas with gate progress, the apps, and the document lists."""
    base = root or lib.ROOT
    ideas = []
    for row in status.collect(base):
        slug = row["slug"]
        gates = []
        for n in range(1, 5):
            g = row.get("gates", {}).get(str(n), {})
            summary = f"ideas/{slug}/gates/gate-{n}.md"
            gates.append({"n": n, "status": g.get("status", "not-reached"), "date": g.get("date"),
                          "file": summary if SLUG.match(slug) and (base / summary).is_file() else None})
        ideas.append({
            "slug": slug, "name": row.get("name", slug), "kind": row.get("kind"), "stage": row.get("stage"),
            "status": row.get("status"), "tier": row.get("tier"), "template": row.get("template"),
            "updated": row.get("updated"), "next": row.get("next"), "blockers": row.get("blockers", []),
            "current": row.get("current") or {}, "last_verification": row.get("last_verification"),
            "gates": gates, "app": row.get("app"), "assessment": row.get("assessment"),
            "changes": parse_changes(base / "ideas" / slug / "changes.md"),
            "docs": idea_docs(base, slug) if SLUG.match(slug) else [],
        })
    factory_docs = [p for p in ["docs/for-leaders.md", "docs/for-staff.md", "README.md", "factory/README.md",
                                    "docs/glossary.md", "CHANGELOG.md", "CLAUDE.md"]
                    if (base / p).exists()]
    factory_docs += sorted(p.relative_to(base).as_posix() for p in (base / "factory" / "stages").glob("*.md")) if (base / "factory" / "stages").is_dir() else []
    factory_docs += [pipeline.REPORT] if (base / pipeline.REPORT).exists() else []
    return {
        "pipeline": pipeline.summary(base),
        "cycle": status.cycle_line(status.cycle_times(status.collect(base), base)),
        "overview": "README.md",
        "ideas": ideas,
        "apps": [{"slug": i["slug"], "name": i["name"], **i["app"]} for i in ideas if i["app"]],
        "docs": {"factory": factory_docs, "all": all_docs(base)},
    }


# ---------------------------------------------------------------- markdown

def inline(text: str, doc_dir: str) -> str:
    text = html.escape(text, quote=True)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])", r"<em>\1</em>", text)

    def link(m: re.Match) -> str:
        label, target = m.group(1), html.unescape(m.group(2)).split(" ")[0]
        if re.match(r"https?://", target):
            return f'<a href="{html.escape(target)}" target="_blank" rel="noopener noreferrer">{label}</a>'
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#") or target.startswith("//"):
            return label
        path, _, _ = target.partition("#")
        resolved = posixpath.normpath(posixpath.join(doc_dir, path))
        if path.endswith(".md") and not resolved.startswith(".."):
            return f'<a href="#doc={html.escape(resolved)}">{label}</a>'
        return label

    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, text)


def render_markdown(text: str, doc_path: str = "") -> str:
    """A small, safe markdown renderer: headings, lists, tables, code fences, quotes, inline marks."""
    d = posixpath.dirname(doc_path)
    text = re.sub(r"<!--.*?-->", "", text.replace("\r\n", "\n"), flags=re.S)
    out: list[str] = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            out.append(f"<pre><code>{html.escape(chr(10).join(code))}</code></pre>")
            i += 1
            continue
        if m := re.match(r"^(#{1,6})\s+(.*)$", line):
            n = len(m.group(1))
            out.append(f"<h{n}>{inline(m.group(2), d)}</h{n}>")
        elif line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|?\s*$", lines[i + 1]):
            def cells(s: str) -> list[str]:
                return [c.strip() for c in s.strip().strip("|").split("|")]

            head = cells(line)
            i += 2
            body = []
            while i < len(lines) and lines[i].startswith("|"):
                body.append(cells(lines[i]))
                i += 1
            th = "".join(f"<th>{inline(c, d)}</th>" for c in head)
            tr = "".join("<tr>" + "".join(f"<td>{inline(c, d)}</td>" for c in r) + "</tr>" for r in body)
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>")
            continue
        elif re.match(r"^\s*([-*]|\d+\.)\s+", line):
            tag = "ol" if re.match(r"^\s*\d+\.", line) else "ul"
            items = []
            while i < len(lines) and re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                items.append(re.sub(r"^\s*([-*]|\d+\.)\s+", "", lines[i]))
                i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{inline(t, d)}</li>" for t in items) + f"</{tag}>")
            continue
        elif line.startswith(">"):
            quote = []
            while i < len(lines) and lines[i].startswith(">"):
                quote.append(lines[i].lstrip("> ").rstrip())
                i += 1
            out.append(f"<blockquote>{inline(' '.join(quote), d)}</blockquote>")
            continue
        elif re.match(r"^(-{3,}|\*{3,})\s*$", line):
            out.append("<hr>")
        elif line.strip():
            para = [line]
            while i + 1 < len(lines) and lines[i + 1].strip() and not re.match(r"^(#|```|\||>|\s*([-*]|\d+\.)\s)", lines[i + 1]):
                i += 1
                para.append(lines[i])
            out.append(f"<p>{inline(' '.join(para), d)}</p>")
        i += 1
    return "\n".join(out)


def read_doc(root: Path, rel: str) -> str | None:
    """The rendered document at `rel`, or None when it is not a readable .md file inside the repository."""
    if not rel.endswith(".md") or "\x00" in rel or excluded(rel):
        return None
    base = root.resolve()
    path = (base / rel).resolve()
    if base not in path.parents or not path.is_file():
        return None
    return render_markdown(path.read_text(encoding="utf-8", errors="replace"), path.relative_to(base).as_posix())


# ---------------------------------------------------------------- the shareable page

def share_rules(root: Path) -> dict:
    return lib.read_json(root / SHARE)


def shared_view(root: Path) -> tuple[dict, dict[str, str]]:
    """The view and the rendered documents for the shareable page: only what share.json lists."""
    rules = share_rules(root)
    data = view(root)
    data["ideas"] = [i for i in data["ideas"] if i["slug"] not in rules.get("ideas_exclude", [])]
    data["apps"] = [a for a in data["apps"] if a["slug"] not in rules.get("ideas_exclude", [])]

    def matches(patterns: list[str], base: Path) -> list[str]:
        found = {p.relative_to(root).as_posix() for pat in patterns for p in base.glob(pat) if p.is_file() and p.suffix == ".md"}
        return sorted(r for r in found if not excluded(r))

    factory = matches(rules.get("factory", []), root)
    for idea in data["ideas"]:
        idea["docs"] = matches(rules.get("idea", []), root / "ideas" / idea["slug"]) if SLUG.match(idea["slug"]) else []
        for g in idea["gates"]:
            if g["file"] not in idea["docs"]:
                g["file"] = None
    order = {p: n for n, p in enumerate(p for p in rules.get("factory", []) if "*" not in p)}  # the order share.json lists them
    data["docs"] = {"factory": sorted(factory, key=lambda p: order.get(p, 99)), "all": []}
    data["overview"] = rules.get("overview") if rules.get("overview") in factory else None
    data["pipeline"] = data["pipeline"] if pipeline.REPORT in factory else None  # internal unless share.json lists ideas/pipeline.md
    paths = factory + [d for i in data["ideas"] for d in i["docs"]]
    docs = {p: read_doc(root, p) for p in paths}
    return data, {p: h for p, h in docs.items() if h is not None}


def privacy_findings(root: Path, paths: list[str]) -> tuple[list[str], list[str]]:
    """(blockers, warnings) for the documents about to be shared."""
    blockers = [f"{f.what} in {f.where}" for f in scan.scan_secrets(root, paths) if f.severity == "blocker"]
    warnings = []
    for rel in paths:
        text = scan.read_text(root / rel) or ""
        warnings += [f"{what} in {rel}" for what, pattern in PERSONAL.items() if pattern.search(text)]
    return blockers, warnings


def page_html(root: Path, data: dict | None, docs: dict[str, str] | None = None) -> str:
    text = (root / PAGE).read_text(encoding="utf-8")
    boot = {"static": data is not None, "data": data, "docs": docs or {}}
    return text.replace("/*BOOT*/null", json.dumps(boot).replace("</", "<\\/"))


def write_shared(root: Path, target: Path) -> int:
    data, docs = shared_view(root)
    blockers, warnings = privacy_findings(root, sorted(docs))
    for w in warnings:
        print(f" warning: {w}")
    if blockers:
        for b in blockers:
            print(f" blocker: {b}", file=sys.stderr)
        print("Not written: remove the secrets or drop those documents from factory/web/share.json.", file=sys.stderr)
        return 1
    target.write_text(page_html(root, data, docs), encoding="utf-8", newline="\n")
    print(f"wrote {target}: {len(data['ideas'])} ideas, {len(docs)} documents, {len(warnings)} warnings")
    return 0


# ---------------------------------------------------------------- local server

def make_server(root: Path, port: int) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args) -> None:  # keep the terminal quiet
            pass

        def _send(self, code: int, body: bytes, kind: str = "application/json") -> None:
            self.send_response(code)
            self.send_header("Content-Type", f"{kind}; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, data: object) -> None:
            self._send(code, json.dumps(data).encode("utf-8"))

        def do_GET(self) -> None:
            # Only this machine's own names: another site cannot read the documents through DNS rebinding
            if self.headers.get("Host", "") not in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"):
                return self._json(403, {"error": "bad host"})
            url = urlparse(self.path)
            if url.path == "/":
                return self._send(200, page_html(root, None).encode("utf-8"), "text/html")
            if url.path == "/api/state":
                return self._json(200, view(root))
            if url.path == "/api/doc":
                body = read_doc(root, (parse_qs(url.query).get("path") or [""])[0])
                return self._json(200, {"html": body}) if body is not None else self._json(404, {"error": "not a readable document"})
            self._json(404, {"error": "not found"})

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main(argv: list[str]) -> int:
    if "-h" in argv[1:] or "--help" in argv[1:]:
        print(__doc__)
        return 0
    if "--write" in argv:
        i = argv.index("--write")
        target = Path(argv[i + 1]) if i + 1 < len(argv) and not argv[i + 1].startswith("--") else lib.ROOT / "ideas" / "dashboard.html"
        return write_shared(lib.ROOT, target)
    port = int(argv[argv.index("--port") + 1]) if "--port" in argv else 8765
    server = make_server(lib.ROOT, port)
    print(f"Factory dashboard: http://127.0.0.1:{server.server_port}/  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
