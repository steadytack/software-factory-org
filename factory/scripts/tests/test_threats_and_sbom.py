"""Doc 07's threats (STRIDE per trust boundary, check_spec.py) and the SBOM at protection C and D (publish.py)."""

from pathlib import Path

import check_spec
import publish

DOC = """# 07 Security and permissions

## Threats
| Boundary | STRIDE | Threat | Mitigation |
|---|---|---|---|
{rows}
"""


def threats(tmp_path: Path, rows: str, protection: str | None = "B", live=("SEC-001", "RISK-002")) -> check_spec.Findings:
    (tmp_path / "07-security-and-permissions.md").write_text(DOC.format(rows=rows), encoding="utf-8")
    f = check_spec.Findings()
    check_spec.check_threats(tmp_path, set(live), protection, f)
    return f


def test_a_mitigated_threat_in_a_stride_category_passes(tmp_path):
    f = threats(tmp_path, "| Browser to API | Spoofing | A stolen session cookie | SEC-001 |\n| API to DB | T | A changed record | RISK-002 (accepted) |")
    assert f.warnings == []


def test_a_threat_needs_a_known_category_and_a_mitigation(tmp_path):
    f = threats(tmp_path, "| Browser to API | Phishing | A fake login page | none yet |")
    assert any("not one of STRIDE" in w for w in f.warnings)
    assert any("threat with no mitigation" in w for w in f.warnings)
    f = threats(tmp_path, "| Browser to API | S | A stolen cookie | SEC-404 |")  # not defined in the pack
    assert any("threat with no mitigation" in w for w in f.warnings)


def test_threats_are_listed_from_protection_b(tmp_path):
    assert any("no threats recorded: protection level C" in w for w in threats(tmp_path, "", "C").warnings)
    assert threats(tmp_path, "", "A").warnings == []
    assert threats(tmp_path, "", None).warnings == []


def test_an_sbom_is_published_at_protection_c_and_d():
    assert publish.sbom_problem("C", ["README.md"]).startswith("no SBOM: protection level C")
    assert publish.sbom_problem("D", ["backend/sbom-backend.cdx.json"]) is None
    assert publish.sbom_problem("D", ["sbom.json"]) is None
    assert publish.sbom_problem("B", ["README.md"]) is None
    assert publish.sbom_problem(None, []) is None


def test_the_protection_level_is_read_from_the_definition(tmp_path):
    (tmp_path / "application-definition.md").write_text('```json definition\n{"protection": {"value": "C"}}\n```\n', encoding="utf-8")
    assert publish.protection_of(tmp_path) == "C"
    assert publish.protection_of(tmp_path / "missing") is None
