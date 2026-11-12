"""dashboard.py: the view model, the markdown viewer's limits, the shareable page and the local server."""

import json
import shutil
import threading
import urllib.error
import urllib.request
from pathlib import Path

import dashboard
import factory_lib as lib
import publish
import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "brew-ratio"


@pytest.fixture
def root(repo: Path) -> Path:
    shutil.copytree(FIXTURE, repo / "ideas" / "brew-ratio", dirs_exist_ok=True)
    return repo


def test_view_lists_ideas_with_four_gates(root):
    data = dashboard.view(root)
    idea = next(i for i in data["ideas"] if i["slug"] == "brew-ratio")
    assert [g["n"] for g in idea["gates"]] == [1, 2, 3, 4]
    assert idea["app"] is None
    assert "factory/README.md" in data["docs"]["factory"]
    spec = "docs/missing-spec-v0.1.md"
    assert (spec in data["docs"]["factory"]) == (root / spec).exists()


def test_gate_links_to_its_summary_when_written(root):
    gates = root / "ideas" / "brew-ratio" / "gates"
    gates.mkdir(exist_ok=True)
    (gates / "gate-1.md").write_text("Status: approved.\n", encoding="utf-8")
    idea = next(i for i in dashboard.view(root)["ideas"] if i["slug"] == "brew-ratio")
    assert idea["gates"][0]["file"] == "ideas/brew-ratio/gates/gate-1.md"


def test_published_app_appears_in_apps(root):
    publish.record_app("brew-ratio", "me/brew-ratio", "https://github.com/me/brew-ratio", root)
    apps = [a for a in dashboard.view(root)["apps"] if a["slug"] == "brew-ratio"]
    assert apps == [{"slug": "brew-ratio", "name": apps[0]["name"], "repo": "me/brew-ratio", "url": "https://github.com/me/brew-ratio"}]


def test_app_field_rejects_a_non_http_url(root):
    state = lib.load_state("brew-ratio", root)
    state["app"] = {"repo": "me/x", "url": "javascript:alert(1)"}
    assert lib.validate("state", state, root)


def test_changes_table_is_parsed(tmp_path):
    f = tmp_path / "changes.md"
    f.write_text("| CR | Date | What |\n|---|---|---|\n| CR-001 | 2026-10-20 | Add x |\n", encoding="utf-8")
    assert dashboard.parse_changes(f) == [{"CR": "CR-001", "Date": "2026-10-20", "What": "Add x"}]


def test_markdown_escapes_html_and_drops_unsafe_links():
    out = dashboard.render_markdown("# T <script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://a.example/b) [d](other.md)", "docs/a.md")
    assert "<script>" not in out
    assert "javascript:" not in out
    assert 'href="https://a.example/b"' in out
    assert 'href="#doc=docs/other.md"' in out


def test_markdown_renders_tables_lists_and_code_and_drops_comments():
    out = dashboard.render_markdown("<!-- marker -->\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n- y\n\n```\n<b>\n```\n")
    assert "<table>" in out and "<ul>" in out and "&lt;b&gt;" in out
    assert "marker" not in out


@pytest.mark.parametrize("rel", ["../outside.md", "ideas/brew-ratio/state.json", "ideas/brew-ratio/app/README.md", "node_modules/x.md", "/etc/passwd.md"])
def test_read_doc_refuses_paths_outside_the_allowed_set(root, rel):
    (root / "ideas" / "brew-ratio" / "app").mkdir(exist_ok=True)
    (root / "ideas" / "brew-ratio" / "app" / "README.md").write_text("# x", encoding="utf-8")
    assert dashboard.read_doc(root, rel) is None


def test_read_doc_reads_a_repo_document(root):
    assert "<p>" in dashboard.read_doc(root, "CLAUDE.md")


# ---------------------------------------------------------------- shareable page

def test_shared_page_holds_only_the_listed_documents(root):
    idea = root / "ideas" / "brew-ratio"
    (idea / "source").mkdir(exist_ok=True)
    (idea / "source" / "notes.md").write_text("# private\n", encoding="utf-8")
    (root / "drafts").mkdir(exist_ok=True)
    (root / "drafts" / "x.md").write_text("# draft\n", encoding="utf-8")
    data, docs = dashboard.shared_view(root)
    assert "README.md" in docs and data["overview"] == "README.md"
    assert not any(p.startswith("drafts/") or "/source/" in p for p in docs)
    assert data["docs"]["all"] == []
    brew = next(i for i in data["ideas"] if i["slug"] == "brew-ratio")
    assert set(brew["docs"]) <= set(docs)
    assert any(p.startswith("ideas/brew-ratio/spec/") for p in brew["docs"])


def test_shared_page_can_leave_an_idea_out(root):
    rules = lib.read_json(root / dashboard.SHARE)
    lib.write_json(root / dashboard.SHARE, {**rules, "ideas_exclude": ["brew-ratio"]})
    data, docs = dashboard.shared_view(root)
    assert "brew-ratio" not in [i["slug"] for i in data["ideas"]]
    assert not any(p.startswith("ideas/brew-ratio/") for p in docs)


def test_shared_page_is_refused_when_a_document_holds_a_secret(root, tmp_path):
    (root / "ideas" / "brew-ratio" / "idea.md").write_text("key AKIAQ7XYZ4PL2MNB5RTV here\n", encoding="utf-8")
    target = tmp_path / "out.html"
    assert dashboard.write_shared(root, target) == 1
    assert not target.exists()


def test_shared_page_warns_about_personal_details(root, capsys):
    (root / "ideas" / "brew-ratio" / "idea.md").write_text("mail someone@gmail.com\n", encoding="utf-8")
    _, warnings = dashboard.privacy_findings(root, ["ideas/brew-ratio/idea.md"])
    assert warnings == ["a personal email address in ideas/brew-ratio/idea.md"]


def test_shared_page_is_self_contained(root, tmp_path):
    target = tmp_path / "out.html"
    assert dashboard.write_shared(root, target) == 0
    page = target.read_text(encoding="utf-8")
    assert '"static": true' in page and "/api/" not in page.split("const BOOT")[1].split(";")[0]
    assert "</script>" not in page.split("const BOOT = ")[1].split("\n")[0]


# ---------------------------------------------------------------- local server

@pytest.fixture
def server(root):
    srv = dashboard.make_server(root, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def call(url, host=None, method="GET"):
    req = urllib.request.Request(url, method=method, headers={"Host": host} if host else {})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def test_server_serves_state_and_documents(server):
    code, body = call(server + "/api/state")
    assert code == 200 and json.loads(body)["ideas"]
    assert call(server + "/api/doc?path=CLAUDE.md")[0] == 200
    assert call(server + "/api/doc?path=../x.md")[0] == 404


def test_server_refuses_a_foreign_host(server):
    assert call(server + "/api/state", host="evil.example")[0] == 403


def test_server_has_no_way_to_change_anything(server):
    assert call(server + "/api/act", method="POST")[0] == 501
