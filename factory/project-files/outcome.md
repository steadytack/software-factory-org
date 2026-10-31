```json outcome
{
  "schema_version": 1,
  "slug": "{slug}",
  "assessment_version": "{assessment_version}",
  "foundations": {foundations},
  "effort": {"estimated": {effort}, "actual": 0, "note": "<what took the time, or why it was quicker>"},
  "one_thing": {"text": {one_thing}, "held": "unchecked", "note": "<was it the thing that mattered?>"},
  "lessons": []
}
```

# {name}: outcome

Written at Gate 3 (`factory/stages/audit.md`), after the build and the audit: did the Gate 1 assessment hold? The block above is the record (schema `factory/schemas/outcome.schema.json`). `rated` and `estimated` are copied from the assessment approved at Gate 1; fill in the rest.

- **Each foundation:** `held` is `yes` (the rating was right), `partly` (right in kind, wrong in size) or `no` (a green or amber that turned out to be a blocker, or a red that was not); `note` says what showed it.
- **Effort:** `actual` is the person-weeks it took to Gate 3.
- **The one thing:** was it the thing that mattered?
- **Lessons:** what the factory should change because of this build, each a `kind` (`lens`, `knockout`, `default`, `rice`), the `ref` it would change (a lens name, a knock-out rule, `DEF-nn`, a RICE factor) and the `lesson` in one line. None is a valid answer: leave the list empty.

`python factory/scripts/learned.py review` reads every outcome with `learned.md`: a foundation missed, effort mis-estimated or a lesson repeated across ideas becomes a candidate change for an approver to accept or not. Nothing changes by itself.

## Notes
<Anything the record needs that does not fit in its lines, or "None".>
