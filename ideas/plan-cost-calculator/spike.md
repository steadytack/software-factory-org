```json assessment
{
  "schema_version": 1,
  "slug": "plan-cost-calculator",
  "version": "0.1",
  "period": "the time box",
  "data_classes": [
    "Internal",
    "Personal data"
  ],
  "template": "web-app",
  "assets": [
    "CAT-006"
  ],
  "one_thing": "Whether two or three planners and one finance person will give two working sessions to rank the plans blind and try to agree a weight set: without their judgement the spike cannot answer its question. The build starts only once both sessions are booked, and the spike stops if they are not booked within a week.",
  "decision": {
    "recommended": "go",
    "reason": "Go as a spike: the open questions (whether trade-offs fit one £ model, whether synthetic scenarios are realistic, whether the people take part) are answered faster by a working calculator checked against blind rankings than by more research.",
    "fix": [],
    "route": "light",
    "timebox": 1.5,
    "decided": "go",
    "date": "2026-11-01",
    "reply": "for the decisions 1.a, 2,b,3a [meaning: 1A Go as a spike; 2B Impact stays 0.5; 3A Risk stays green]"
  },
  "reassessments": []
}
```

# Plan cost calculator for field service scheduling: spike card

One page for a spike (tier 1, `factory/stages/light.md`). Condensed on 2026-11-04 (factory 0.19.0) from the brief, assessment, overview, plan and Gate 1 file approved on 2026-11-01; those are in git history at commit 3127021.

## Problem
The owner's scheduling specification (v0.5, §2-§4, held outside the repo: D-001) wants one objective, total plan cost in £, so a scheduler can trade overtime, weekend work, subcontractors, stay-away and GSOS penalties against each other. Nobody has written down the rates and weights (§5.0), and the stability weights are an open question (§24, Q6). If the weights are wrong, any scheduler, built or bought, optimises the wrong thing. Who has it: planners and finance *(assumed: the spec names no roles)*; how often and today's cost are unknown.

## The question
Does a single £ cost model reflect how planners and finance actually trade off overtime, weekend work, subcontractors, stay-away and GSOS, and can they agree a set of weights?

## Success and stop
The group's judgement is recorded **blind**, before it sees any cost. Session 1: the group ranks all eight comparison sets and answers four direct trade-off questions as ranges; a planner checks each sample plan is feasible. Session 2: weights are set on sets 1-5; sets 6-8 are held out.
- **Success:** one agreed weight set picks the group's blind-ranked best plan in at least 2 of the 3 held-out sets, and the trade-off ratios it implies fall in the stated ranges for at least 3 of 4. Finance confirms the match count.
- **Stop:** any one of: the group names two or more rules it would not break for any money (a term added in a session to cover a rule counts as the model lacking it); no weight set is agreed, or it matches 1 or 0 of 3; both sessions are not booked with two planners and one finance person within a week of the Go (by 2026-11-08); the sessions are not held within the time box.

## Time box
1.5 person-weeks within four calendar weeks of the Go (ends 2026-11-29). Week 1 books the sessions; the build starts only once they are booked.
- **In:** eight built-in comparison sets; load and download a plan as JSON; rates and weights through the configuration cascade (§5.0) showing where each value comes from; each plan's cost by term (travel, overtime, weekend premium, standby, subcontractor, stay-away, tardiness, GSOS, stability §17.3, unassigned §17.4); variants side by side with the deciding term and the implied trade-off ratios; blind rankings beside the calculator's, a match count, and the weight set saved and exported.
- **Out:** any solver; hard-constraint checking; maps or travel times; real plans, rates or people; integrations; participant accounts; the Timefold fit test and assignability diagnostics (later spikes).
- **Afterwards:** the scoring logic is kept as a tested module; the screens are throwaway.

## Data and protection
Synthetic only. Classes (POL-11): Internal (the cost model and made-up rates) and Personal data, synthetic only (engineers as codes such as ENG-01). No real staff data: the owner drives the tool, so there is one login and no participant accounts, and notes record roles, not names. Real rates are Confidential and would need a separate approval. Protection **B**: a login, secrets in a git-ignored env file, ports on 127.0.0.1 (POL-06), local Docker (DEF-02), on `web-app` (CAT-006).

## Challenge
A fresh reviewer raised 10 challenges on 2026-11-01; 9 changed the work and 1 was kept.
1. The success test was circular (scored on the sets the weights were tuned on): changed, so sets 6-8 are now held out and the ranking is blind.
2. The stop rule might never trigger (any "never" can be a huge penalty, and the owner judges): changed, so the group judges it and an added term counts as a missing rule.
3. Weights tuned on made-up rates may not carry over: changed, so the spike also records rate-independent trade-off ratios.
4. Participant logins would hold real staff data: changed, so there are no participant accounts.
5. Attendance is settled by asking, not building: changed, so sessions are booked before the build.
6. Impact assumed a scheduler decision: changed, so Impact is 0.5 (approver's choice 2B).
7. Reach counted the participants: changed in the scoring.
8. One person-week was understated: changed, so the time box is 1.5.
9. The alternatives (a spreadsheet) were dismissed on assumed grounds: changed, recorded as an assumption.
10. Risk should be amber (builder bias): kept green (approver's choice 3A), limited by blind rankings, held-out sets and finance confirming the result.

## Sign-off
2026-11-01, steadytack: "for the decisions 1.a, 2,b,3a" [meaning: 1A Go as a spike; 2B Impact stays 0.5; 3A Risk stays green]. Recorded with `pipeline.py decide plan-cost-calculator go --route light --timebox 1.5`; decisions.md D-007 to D-009.
