"""scopes.py and the scope-aware catalogue: an idea sees the group, its business and its brands, never another business."""

import json
from pathlib import Path

import catalogue
import check_spec
import pytest
import scopes
from conftest import run

REGISTRY = {
    "schema_version": 1,
    "group": {"name": "Group", "publish": {"owner": "group-org", "licence": "proprietary", "copyright": "Group Ltd"}},
    "businesses": {"retail": {"name": "Retail", "publish": {"owner": "retail-org"}}, "trade": {"name": "Trade"}},
    "brands": {"shopfront": {"name": "Shopfront", "business": "retail"}, "pro": {"name": "Pro", "business": "trade"},
               "house": {"name": "House", "business": None}},
}


def write(root: Path, rel: str, text: str = "x\n") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture
def scoped(repo: Path) -> Path:
    write(repo, "factory/context/scopes.json", json.dumps(REGISTRY))
    return repo


def test_an_idea_sees_its_business_and_brands_but_not_another_business():
    seen = scopes.visible({"business": "retail", "brands": []}, REGISTRY)
    assert seen == {"group", "business:retail", "brand:shopfront", "brand:house"}
    assert scopes.visible({"business": None, "brands": []}, REGISTRY) == {"group", "brand:house"}


def test_a_scope_string_becomes_an_idea_scope_and_unknown_names_are_errors():
    assert scopes.parse("brand:shopfront", REGISTRY) == {"business": "retail", "brands": ["shopfront"]}
    assert scopes.parse("group", REGISTRY) == {"business": None, "brands": []}
    with pytest.raises(scopes.lib.FactoryError):
        scopes.parse("business:nope", REGISTRY)
    assert scopes.unknown({"business": "nope", "brands": ["pro", "gone"]}, REGISTRY) == ["business 'nope'", "brand 'gone'"]


def test_context_is_read_policies_first_then_most_specific_layer_first(tmp_path):
    for rel in ("factory/context/policies.md", "factory/context/about-me.md", "factory/context/learned.md",
                "factory/context/group/policies.md", "factory/context/group/business-context.md",
                "factory/context/businesses/retail/policies.md", "factory/context/businesses/retail/business-context.md",
                "factory/context/businesses/trade/business-context.md", "factory/context/brands/shopfront/brand.md",
                "ideas/demo/decisions.md"):
        write(tmp_path, rel)
    files = scopes.context_files({"business": "retail", "brands": ["shopfront"]}, tmp_path, slug="demo")
    assert [p.relative_to(tmp_path).as_posix() for p in files] == [
        "factory/context/policies.md", "factory/context/group/policies.md", "factory/context/businesses/retail/policies.md",
        "ideas/demo/decisions.md",
        "factory/context/brands/shopfront/brand.md", "factory/context/businesses/retail/business-context.md",
        "factory/context/group/business-context.md", "factory/context/about-me.md", "factory/context/learned.md",
    ]


def test_publish_settings_default_to_the_single_owner_and_a_business_overrides_the_group():
    assert scopes.publish_settings({"business": None, "brands": []}, {"group": {"name": "me"}}) == scopes.PUBLISH_DEFAULTS
    retail = scopes.publish_settings({"business": "retail", "brands": []}, REGISTRY)
    assert retail == {"owner": "retail-org", "visibility": "private", "licence": "proprietary", "copyright": "Group Ltd"}


def test_a_card_is_found_only_once_confirmed_and_only_within_scope(scoped):
    card = catalogue.card("system", "Order hub", "https://wiki.example/hub", "Ops team", "Takes every retail order",
                          "tester", scope="business:retail", tags=["orders"], root=scoped)
    assert card["status"] == "draft" and card["scope"] == "business:retail"
    assert not catalogue.search(["orders"], root=scoped)
    catalogue.confirm(card["id"], "Ops team", root=scoped)
    retail = scopes.visible({"business": "retail", "brands": []}, REGISTRY)
    trade = scopes.visible({"business": "trade", "brands": []}, REGISTRY)
    assert [e["id"] for _s, e in catalogue.search(["orders"], root=scoped, scope=retail)] == [card["id"]]
    assert not catalogue.search(["orders"], root=scoped, scope=trade)
    with pytest.raises(catalogue.CatalogueError, match="confirm, not approve"):
        catalogue.approve(card["id"], "tester", root=scoped)
    with pytest.raises(scopes.lib.FactoryError):
        catalogue.card("process", "X", "https://x", "me", "y", "tester", scope="business:nope", root=scoped)


def test_check_factory_warns_on_a_stale_card_and_rejects_an_unknown_scope(scoped, py):
    card = catalogue.card("process", "Returns", "https://wiki.example/returns", "CS team", "How returns work", "tester", root=scoped)
    catalogue.confirm(card["id"], "CS team", review_by="2020-01-01", root=scoped)
    done = run([py, str(scoped / "factory/scripts/check_factory.py"), "--root", str(scoped)], scoped)
    assert done.returncode == 0 and "card is stale" in done.stdout
    path = scoped / "catalogue/assets" / f"{card['id']}.json"
    entry = json.loads(path.read_text(encoding="utf-8"))
    path.write_text(json.dumps({**entry, "scope": "business:gone"}), encoding="utf-8")
    done = run([py, str(scoped / "factory/scripts/check_factory.py"), "--root", str(scoped)], scoped)
    assert done.returncode == 1 and "scope business:gone is not in factory/context/scopes.json" in done.stdout


def test_the_spec_check_blocks_a_card_and_another_business_asset_unless_decided():
    asset = {"id": "CAT-900", "type": "module", "status": "approved", "version": "1.0.0", "scope": "business:trade"}
    card = {**asset, "id": "CAT-901", "type": "system", "status": "confirmed", "scope": "group"}
    catalogue_ = {"CAT-900": asset, "CAT-901": card}
    retail = (scopes.visible({"business": "retail", "brands": []}, REGISTRY), "")
    f = check_spec.Findings()
    check_spec.check_selected("CAT-900", "CAT-900 1.0.0", catalogue_, "CAP-001", f, retail)
    check_spec.check_selected("CAT-901", "CAT-901", catalogue_, "CAP-002", f, retail)
    assert any("outside this idea's scope" in b for b in f.blockers)
    assert any("reference card" in b for b in f.blockers)
    decided = check_spec.Findings()
    check_spec.check_selected("CAT-900", "CAT-900 1.0.0", catalogue_, "CAP-001", decided, (retail[0], "D-007 use CAT-900 from Trade: shared"))
    assert not decided.blockers
