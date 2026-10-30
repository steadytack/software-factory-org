```json assessment
{
  "schema_version": 1,
  "slug": "{slug}",
  "version": "0.1",
  "period": "per month",
  "data_classes": [],
  "foundations": {
    "problem": {"rating": "unrated", "reason": "<Are we clear exactly what we're trying to improve?>"},
    "value": {"rating": "unrated", "reason": "<Do we know what success looks like and what it's worth?>"},
    "data": {"rating": "unrated", "reason": "<Do we have the right quality data? Lots of data is not the same as ready data.>"},
    "risk": {"rating": "unrated", "reason": "<What happens if it gets something wrong or misses something?>"},
    "people": {"rating": "unrated", "reason": "<Who owns it and how would it fit the process?>"}
  },
  "rice": {
    "reach": {"value": 0, "reason": "<people or processes touched per period, from the brief>"},
    "impact": {"value": 0, "reason": "<0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive, from the brief>"},
    "confidence": {"value": 0, "reason": "<how well the brief's evidence backs the estimate>"},
    "effort": {"value": 0, "reason": "<rough person-weeks to a first release>"}
  },
  "template": "<the likely template, or none>",
  "assets": [],
  "one_thing": "<The one thing to know or fix before investing.>",
  "decision": {"recommended": "undecided", "reason": "<why, in one line>", "fix": []},
  "reassessments": []
}
```

# {name}: assessment

The block above is the record (schema `factory/schemas/assessment.schema.json`), rated against `idea-brief.md` as `factory/stages/develop-assess.md` says: knock-outs first, then the five foundations (each green, amber or red with a one-line reason), RICE from the brief's evidence, the one thing to know or fix before investing, and the recommendation for Gate 1: `go`, `get-ready` or `stop`. `python factory/scripts/pipeline.py render` ranks it with every other idea in `ideas/pipeline.md`.

## Notes
<Anything a rating needs that does not fit in its line, or "None".>
