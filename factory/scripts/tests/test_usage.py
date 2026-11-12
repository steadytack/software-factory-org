"""usage.py: token counts per session and idea from Claude Code transcripts."""

import json

import usage


def line(sid, cwd, rid=None, usage_=None, side=False, ts="2026-11-01T10:00:00Z", text=""):
    d = {"sessionId": sid, "cwd": cwd, "timestamp": ts, "isSidechain": side, "type": "user",
         "message": {"content": text}}
    if rid:
        d.update(type="assistant", requestId=rid, message={"model": "m1", "usage": usage_, "content": text})
    return json.dumps(d)


def u(inp=0, write=0, read=0, out=0):
    return {"input_tokens": inp, "cache_creation_input_tokens": write, "cache_read_input_tokens": read,
            "output_tokens": out}


def setup(tmp_path, files):
    root = tmp_path / "repo"
    for slug in ("alpha", "beta"):
        (root / "ideas" / slug).mkdir(parents=True, exist_ok=True)
    projects = tmp_path / "projects"
    for rel, lines in files.items():
        f = projects / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return root, projects


def read(root, projects):
    return usage.read_sessions(projects, root, {"alpha", "beta"})


def test_counts_each_call_once_and_splits_helpers(tmp_path):
    r = str(tmp_path / "repo")
    root, projects = setup(tmp_path, {
        "p/s1.jsonl": [
            line("s1", r, "q1", u(10, 100, 0, 5)),
            line("s1", r, "q1", u(10, 100, 0, 7)),  # same response, later line: final counts
            line("s1", r, "q2", u(1, 20, 110, 9)),
            "not json",
        ],
        "p/s1/subagents/agent-x.jsonl": [line("s1", r, "h1", u(0, 50, 0, 50), side=True)],
    })
    s = read(root, projects)["s1"]
    t = s.totals()
    assert t["calls"] == 2
    assert t["base"] == 110 and t["peak"] == 131
    assert (t["fresh"], t["reread"], t["out"]) == (181, 110, 66)
    row = usage.session_rows([s], max_context=130)[0]
    assert row["flag"] == "split"
    assert row["helper_share"] == round(100 / 357, 3)


def test_ignores_other_repositories_and_maps_ideas(tmp_path):
    r = str(tmp_path / "repo")
    root, projects = setup(tmp_path, {
        "p/a.jsonl": [line("a", r + "/ideas/alpha/app", "q", u(1))],
        "p/b.jsonl": [line("b", r, "q", u(1))] + [line("b", r, text="ideas/beta/x") for _ in range(5)],
        "p/c.jsonl": [line("c", r, "q", u(1)), line("c", r, text="ideas/alpha ideas/alpha")],
        "p/o.jsonl": [line("o", r + "-org", "q", u(1))],  # a sibling folder with the same prefix
    })
    sessions = read(root, projects)
    assert {k: v.idea for k, v in sessions.items()} == {"a": "alpha", "b": "beta", "c": "factory"}


def test_several_ideas_without_a_clear_lead(tmp_path):
    r = str(tmp_path / "repo")
    lines = [line("s", r, "q", u(1))]
    lines += [line("s", r, text="ideas/alpha") for _ in range(5)]
    lines += [line("s", r, text="ideas/beta") for _ in range(4)]
    root, projects = setup(tmp_path, {"p/s.jsonl": lines})
    assert read(root, projects)["s"].idea == "several"


def test_idea_rows_and_cli(tmp_path, capsys):
    r = str(tmp_path / "repo")
    root, projects = setup(tmp_path, {
        "p/a.jsonl": [line("a", r + "/ideas/alpha", "q", u(0, 100, 0, 10))],
        "p/b.jsonl": [line("b", r + "/ideas/alpha", "q", u(0, 50, 50, 10))],
    })
    out_csv = tmp_path / "u.csv"
    assert usage.main(["--projects", str(projects), "--root", str(root), "--by", "idea", "--csv", str(out_csv)]) == 0
    text = capsys.readouterr().out
    assert "alpha" in text and "2 sessions" in text
    assert out_csv.read_text(encoding="utf-8").splitlines()[1].startswith("alpha,2,0,2,")


def test_counts_only_this_repository_not_a_folder_it_is_named_after(tmp_path):
    root = tmp_path / "acme-factory-org"
    (root / "ideas").mkdir(parents=True)
    projects = tmp_path / "projects"
    (projects / "p").mkdir(parents=True)
    other = str(tmp_path / "acme-factory")
    (projects / "p" / "x.jsonl").write_text(
        "\n".join([line("own", str(root), "q", u(1)), line("other", other, "q", u(1)),
                   line("child", other + "/ideas/alpha", "q", u(1))]) + "\n",
        encoding="utf-8",
    )
    assert set(usage.read_sessions(projects, root, set())) == {"own"}
