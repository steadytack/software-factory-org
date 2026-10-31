"""Spec pack checks added in 0.10.0: the transition (doc 13), the C4 and ER diagrams (docs 10 and 06), issues (ISS)
and contract tests for integrations (INT). Each is checked on a small pack, without the factory's templates."""

import shutil
from collections import defaultdict
from pathlib import Path

import check_spec

FIXTURE = Path(__file__).parent / "fixtures" / "brew-ratio" / "spec"

PROCESS = """# 13 Business process

## As-is
```mermaid
flowchart TD
    A --> B
```

## To-be
```mermaid
flowchart TD
    A --> B
```

| Step | Who | What happens | Relies on |
|---|---|---|---|
| 1 | Brewer | Picks a recipe | FR-001 |

## What changes
| Step | Change | Who does it now | Who does it then | Expected saving |
|---|---|---|---|---|
| 1 | automated | Brewer | App | a minute |
{transition}"""


def process(tmp_path: Path, transition: str) -> check_spec.Findings:
    (tmp_path / "13-business-process.md").write_text(PROCESS.format(transition=transition), encoding="utf-8")
    f = check_spec.Findings()
    check_spec.check_process(tmp_path, {}, f)
    return f


def test_the_transition_is_a_table_or_not_applicable(tmp_path):
    assert any("no '## Transition' section" in w for w in process(tmp_path, "").warnings)
    assert any("'Transition' has no table" in w for w in process(tmp_path, "\n## Transition\nWe will tell people.\n").warnings)
    assert not any("ransition" in w for w in process(tmp_path, "\n## Transition\nNot applicable: one user.\n").warnings)
    table = "\n## Transition\n| Item | What | Who | When |\n|---|---|---|---|\n| Training | A demo | The owner | Week 1 |\n"
    assert not any("ransition" in w for w in process(tmp_path, table).warnings)


def kinds_of(spec: Path) -> dict:
    items, _ = check_spec.parse(spec)
    kinds = defaultdict(dict)
    for it in items:
        kinds[it.kind][it.id] = it
    return kinds


def diagrams(spec: Path) -> list[str]:
    f = check_spec.Findings()
    check_spec.check_diagrams(spec, kinds_of(spec), f)
    return f.warnings


def test_diagrams_are_asked_for_once_the_model_or_architecture_has_parts(tmp_path):
    spec = tmp_path / "spec"
    shutil.copytree(FIXTURE, spec)
    assert diagrams(spec) == []  # one entity, one component, no integration: no diagram needed
    data = spec / "06-data-model.md"
    data.write_text(data.read_text(encoding="utf-8").replace("## Fields", "| DATA-002 | Brew | A brew made | FR-001 | no | kept |\n\n## Fields", 1), encoding="utf-8")
    arch = spec / "10-architecture-and-deployment.md"
    arch.write_text(arch.read_text(encoding="utf-8") + "\n| INT | Integration | Kind | From | To | Data | FRs | Failure behaviour |\n|---|---|---|---|---|---|---|---|\n"
                    "| INT-001 | Weather feed | external | CMP-001 | Met Office | temperature | FR-001 | shows the last value |\n", encoding="utf-8")
    found = diagrams(spec)
    assert any("no entity-relationship diagram" in w for w in found), found
    assert any("no architecture diagram (the C4 context and container views" in w for w in found), found
    data.write_text(data.read_text(encoding="utf-8") + "\n```mermaid\nerDiagram\n    RECIPE ||--o{ BREW : makes\n```\n", encoding="utf-8")
    arch.write_text(arch.read_text(encoding="utf-8") + "\n```mermaid\nflowchart LR\n    a --> b\n```\n", encoding="utf-8")
    assert diagrams(spec) == []


def test_an_issue_is_an_open_item():
    assert "ISS" in check_spec.PREFIXES and "ISS" in check_spec.OPEN_ITEMS
    assert check_spec.ID_ONLY.match("ISS-001") and check_spec.kind_of("ISS-001") == "ISS"


def test_an_integration_needs_a_contract_test_from_tier_3(tmp_path):
    idea = tmp_path / "brew-ratio"
    shutil.copytree(FIXTURE.parent, idea)
    arch = idea / "spec/10-architecture-and-deployment.md"
    arch.write_text(arch.read_text(encoding="utf-8") + "\n| INT | Integration | Kind | From | To | Data | FRs | Failure behaviour |\n|---|---|---|---|---|---|---|---|\n"
                    "| INT-001 | Weather feed | external | CMP-001 | Met Office | temperature | FR-001 | shows the last value |\n", encoding="utf-8")
    f = check_spec.run(str(idea))[0]
    assert any("INT-001 has no contract or integration test" in w for w in f.warnings)
    plan = idea / "spec/11-delivery-plan.md"
    plan.write_text(plan.read_text(encoding="utf-8").replace("| tests/ratio.test.mjs |", "| tests/ratio.test.mjs |\n| TEST-006 | The feed's shape | contract | INT-001 | tests/feed.test.mjs |", 1), encoding="utf-8")
    assert not any("INT-001 has no contract" in w for w in check_spec.run(str(idea))[0].warnings)
