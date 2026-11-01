```json assessment
{
  "schema_version": 1,
  "slug": "plan-cost-calculator",
  "version": "0.1",
  "period": "per month",
  "data_classes": [
    "Internal",
    "Personal data"
  ],
  "foundations": {
    "problem": {
      "rating": "amber",
      "reason": "One clear question (can the trade-offs be one £ model with agreed weights), grounded in the spec's §2-§4 and open question 6; but how often the trade-offs arise and what they cost today is unknown, with no process model. Settled by a planner describing a typical week in the first session."
    },
    "value": {
      "rating": "amber",
      "reason": "Success and stop are measurable against blind rankings (an agreed weight set that matches at least 2 of 3 held-out comparisons), but the worth is indirect: it de-risks a scheduler decision that is not yet shown to be committed (assumed), with no baseline in £. Settled if the owner confirms a scheduler decision depends on it."
    },
    "data": {
      "rating": "amber",
      "reason": "All data is authored for the spike (Internal, synthetic engineers), so it exists and is reachable; whether made-up scenarios are realistic enough to judge is unproven, and weights tuned on made-up rates may not carry over to real ones, so the spike also records rate-independent trade-off ratios. Settled in session 1, when a planner checks the plans, and later by real rates under a separate approval."
    },
    "risk": {
      "rating": "green",
      "reason": "It scores synthetic plans and decides nothing; people rank the plans themselves, blind, before seeing any cost; no real, personal or Confidential data is held, no integrations, one login. The worst case, a weight set that looks endorsed but does not hold for real work, would only be carried forward by a later decision at its own gate; facilitator bias is limited by the blind rankings, held-out sets, a planner checking the plans and finance confirming the match."
    },
    "people": {
      "rating": "amber",
      "reason": "The owner wants it and will run it, but the planners and finance people who must take part have not been asked for their two sessions. Settled when two or three planners and one finance person agree dates."
    }
  },
  "rice": {
    "reach": {
      "value": 5,
      "reason": "The two or three planners and one or two finance people whose trade-offs the spike captures, in its month (assumed: not yet asked); they are also its cost, in time."
    },
    "impact": {
      "value": 0.5,
      "reason": "Low: it changes no daily work now; it would set the objective for a scheduler, built or bought, but no scheduler decision is yet shown to depend on it (assumed). Medium once the owner confirms one does."
    },
    "confidence": {
      "value": 40,
      "reason": "Four ambers, participation not yet asked, the scenarios unproven and made-up rates that may not carry over: below a hunch, though the spec is clear."
    },
    "effort": {
      "value": 1.5,
      "reason": "1.5 person-weeks (assumed): about ten cost terms and the cascade as a tested module, a few screens on the web-app template, authoring eight feasible comparison sets, plus running two sessions; no integrations."
    }
  },
  "template": "web-app",
  "assets": [
    "CAT-006"
  ],
  "one_thing": "Whether two or three planners and one finance person will give two working sessions to rank the plans blind and try to agree a weight set: without their judgement the spike cannot answer its question. The plan settles it first: the build starts only once both sessions are booked, and the spike stops if they are not booked within a week.",
  "decision": {
    "recommended": "go",
    "reason": "Go as a spike: no red foundation, and the ambers (whether trade-offs fit one £ model, whether synthetic scenarios are realistic, whether the people take part) are answered faster by a working calculator checked against blind rankings than by more research.",
    "fix": [],
    "route": "light",
    "timebox": 1.5,
    "decided": "go",
    "date": "2026-11-01",
    "reply": "for the decisions 1.a, 2,b,3a"
  },
  "reassessments": []
}
```

# Plan cost calculator for field service scheduling: assessment

The block above is the record (schema `factory/schemas/assessment.schema.json`), rated against `idea-brief.md` as `factory/stages/develop-assess.md` says: knock-outs first, then the five foundations (each green, amber or red with a one-line reason), RICE from the brief's evidence, the one thing to know or fix before investing, and the recommendation for Gate 1: `go`, `get-ready` or `stop`. `python factory/scripts/pipeline.py render` ranks it with every other idea in `ideas/pipeline.md`.

**Knock-outs:** none. Data classes: Internal (allowed) and Personal data (synthetic only: made-up engineers with codes, no real people). No Confidential class is needed: all rates are made up, and the spec's build-versus-buy and procurement sections are not used. No paid service, account or key. No duplicate: the register and the catalogue have no scheduling or cost asset.

## Pre-mortem
It is November 2027 and the calculator failed. The three likeliest reasons:
1. **Planners and finance never sat down together** (People & Process). The sessions slipped behind operational work and the weights were set by the builder. The amber allows for it, and it is the one thing.
2. **The weights were agreed on made-up scenarios and did not hold for real work** (Data Foundations). Real rates (Confidential) and real plans changed the ranking. The amber allows for the realism of the scenarios but not fully for rates: the plan therefore treats the agreed set as relative weights, and the Gate 3 outcome must say that real rates need a separate approval before the set is relied on. Confidence lowered to 40 for it, and the spike records the trade-off ratios the weights imply (hours of overtime per stay-away, per GSOS miss), which hold whatever the real rates are.
3. **The trade-offs were not additive** (Problem). Planners used rules ("never two stay-aways in a week", "GSOS on a vulnerable customer is never worth it") that no £ weight reproduces, and the group argued about the formula instead of the weights. The Problem amber allows for it, and it is the spike's stop criterion, so it is an answer, not a failure: the plan records each such rule in the group's words, and a rule patched in-session with a new term or a prohibitive weight counts as one the model lacks.

## Notes
- Effort includes authoring the sample plans and running the sessions; the participants' time is about two hours per session *(assumed)*.
- The sample plans are hand-authored to be feasible and checked by a planner in session 1; the calculator does not check the hard constraints (§3.1) and says so on screen.
- Go as a spike rather than Get Ready for the booking: booking is the first week of the time box, with a stop if it fails, so it costs no extra gate (challenge 5).
