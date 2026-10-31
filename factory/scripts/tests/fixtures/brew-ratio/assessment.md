```json assessment
{
  "schema_version": 1,
  "slug": "brew-ratio",
  "version": "0.1",
  "period": "per month",
  "data_classes": ["Public"],
  "foundations": {
    "problem": {"rating": "green", "reason": "One clear step to improve: the sum done on a calculator before every brew"},
    "value": {"rating": "green", "reason": "Success is measurable: two weeks of brews without a calculator"},
    "data": {"rating": "green", "reason": "Only the brewer's own recipes, entered by hand; nothing to clean or connect"},
    "risk": {"rating": "green", "reason": "A wrong amount wastes one brew, and the brewer sees the numbers before pouring"},
    "people": {"rating": "amber", "reason": "One owner and user; that it replaces the habit of the calculator is assumed"}
  },
  "rice": {
    "reach": {"value": 30, "reason": "About one brew a day"},
    "impact": {"value": 1, "reason": "Saves a minute and the odd wasted brew each time"},
    "confidence": {"value": 80, "reason": "A good argument from the brief; the habit change is assumed"},
    "effort": {"value": 0.5, "reason": "One page on a ready template"}
  },
  "template": "single-page-html",
  "assets": [],
  "one_thing": "Whether recipes kept in one browser are safe enough, or export and import are needed from the start",
  "decision": {"recommended": "go", "reason": "Every foundation is green or amber, and the effort is small", "fix": [], "decided": "go", "date": "2026-10-19", "reply": "test fixture, not a real decision"},
  "reassessments": []
}
```

# Brew ratio: assessment

A test fixture (acceptance scenario A), not a real project.

## Pre-mortem
1. The brewer kept using the calculator out of habit (people: the amber allows for it).
2. Recipes were lost when the browser was cleared (risk: not allowed for; it is the one thing).
3. A rounding error spoiled a brew (risk: allowed for; the numbers are shown before pouring).

## Notes
None.
