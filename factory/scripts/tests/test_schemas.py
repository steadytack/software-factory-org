"""The factory's JSON schemas accept good examples and reject bad ones."""

import copy

import factory_lib as lib
import pytest
from conftest import REAL_ROOT

DEFINITION = {
    "schema_version": 1, "slug": "tide-times", "name": "Tide times", "version": "0.1", "status": "draft",
    "maturity_tier": {"value": 2, "state": "recommended", "default": "DEF-01"},
    "deployment": {"value": "simple", "state": "recommended", "development": "Node 24 locally"},
    "interfaces": {"value": ["web", "mobile"], "state": "accepted"},
    "brand": {"value": "unbranded", "state": "recommended"},
    "design_system": {"value": "template design file", "state": "recommended"},
    "interaction_style": {"value": "single page with a chart", "state": "recommended"},
    "lenses": {"active": ["business-value", "users-and-workflows"], "skipped": [{"lens": "security", "reason": "no data, no users"}]},
    "sources": [{"kind": "idea", "ref": "idea.md"}],
}
COMPOSITION = {
    "schema_version": 1, "strategy": "multi-component",
    "components": [
        {"name": "engine", "role": "pipeline", "base": {"id": "CAT-004", "version": "1.0.0"},
         "modules": [{"id": "CAT-020", "version": "1.0.0", "namespace": "agent", "parts": ["agent"]}]},
        {"name": "docs", "role": "documentation site", "base": {"id": "CAT-002", "version": "1.0.0"}},
    ],
    "links": [{"from": "engine", "to": "docs", "kind": "file", "what": "the run report"}],
    "validation": {"status": "not-run"},
}


def test_every_schema_is_a_valid_schema():
    import jsonschema

    for name in lib.SCHEMAS:
        jsonschema.Draft202012Validator.check_schema(lib.schema(name, REAL_ROOT))


def test_a_good_application_definition_passes():
    assert lib.validate("application-definition", DEFINITION, REAL_ROOT) == []


@pytest.mark.parametrize(
    ("path", "value", "fragment"),
    [
        (("maturity_tier", "value"), 5, "5 is not one of"),
        (("deployment", "value"), "cloud", "'cloud' is not one of"),
        (("interfaces", "value"), [], "should be non-empty"),
        (("brand", "state"), "maybe", "'maybe' is not one of"),
        (("version",), "1", "does not match"),
        (("lenses", "active"), ["astrology"], "'astrology' is not one of"),
    ],
)
def test_a_bad_application_definition_fails(path, value, fragment):
    data = copy.deepcopy(DEFINITION)
    target = data
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    assert any(fragment in p for p in lib.validate("application-definition", data, REAL_ROOT))


def test_a_skipped_lens_needs_a_reason():
    data = copy.deepcopy(DEFINITION)
    data["lenses"]["skipped"] = [{"lens": "security"}]
    assert any("'reason' is a required property" in p for p in lib.validate("application-definition", data, REAL_ROOT))


def test_a_good_composition_passes_and_a_secret_shaped_field_is_not_allowed():
    assert lib.validate("composition", COMPOSITION, REAL_ROOT) == []
    data = copy.deepcopy(COMPOSITION)
    data["components"][0]["password"] = "x"
    assert any("Additional properties" in p for p in lib.validate("composition", data, REAL_ROOT))
    data = copy.deepcopy(COMPOSITION)
    data["components"][0]["base"]["id"] = "agent"
    assert any("does not match" in p for p in lib.validate("composition", data, REAL_ROOT))


def test_state_gates_are_numbered_one_to_four():
    state = {
        "schema_version": 1, "slug": "x", "name": "X", "kind": "app", "stage": "develop", "status": "in-progress",
        "factory_version": "0.1.0", "updated": "2026-10-19", "gates": {"1": {"status": "approved"}}, "next": "",
    }
    assert lib.validate("state", state, REAL_ROOT) == []
    state["gates"]["5"] = {"status": "approved"}
    assert lib.validate("state", state, REAL_ROOT)
