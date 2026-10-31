```json benefits
{
  "schema_version": 1,
  "slug": "{slug}",
  "published": "{published}",
  "estimated": {estimated},
  "reviews": {reviews}
}
```

# {name}: benefits review

Written at Publish (`factory/stages/publish.md`) and filled in 30 and 90 days later: did the app deliver what Gate 1 expected, now that people use it? The block above is the record (schema `factory/schemas/benefits.schema.json`). `estimated` is copied from the assessment approved at Gate 1; each review is filled in on or after its `due` date, from the owner's numbers.

- **Measures:** one row per success measure in the brief and the objectives (spec doc 02): the `target`, what was `actual`ly measured (and how), and whether it was `met` (`yes`, `partly`, `no`).
- **Reach:** the people or processes it reached per period, measured, against the estimate; 0 is a real answer.
- **Impact:** did the impact per person or process hold? **In use:** is it still used the way the to-be process (doc 13) expects?
- **Done:** the date the review was done. **Lessons:** as in `outcome.md`, each naming the lens, knock-out rule, default or RICE factor it would change; none is a valid answer.

`ideas/pipeline.md` lists every review due and flags one past its date. `python factory/scripts/learned.py review` reads the reviews done with the outcomes: reach mis-estimated, impact that did not hold or success measures missed across ideas becomes a candidate change for an approver.

## Notes
<Anything the record needs that does not fit in its lines, or "None".>
