# Plan cost calculator for field service scheduling: spike plan

A spike (tier 1, the light route) builds the smallest thing that answers one question, instead of writing a spec. This plan is approved with Gate 1, the build is time-boxed, and it ends at Gate 3 with **grow** (to the tier the owner names), **keep** or **stop**. Rules: `factory/stages/light.md`.

## The question
**Does a single £ cost model reflect how planners and finance actually trade off overtime, weekend work, subcontractors, stay-away and GSOS, and can they agree a set of weights?** It settles the ambers:
- Problem and Value: can every trade-off they make be written as a £ term with a weight? Settled when, for each comparison, they can say why one plan beats another in terms the calculator has, or name the rule it lacks.
- Data: are made-up scenarios realistic enough to judge? Settled in session 1, when a planner checks each sample plan is one they could run (feasible, lifelike) or reshapes it with made-up values.
- People: will planners and finance take part? Settled first: both sessions are booked before the build starts.

## Success and kill criteria
Decided now, before anything is built. The group's judgement is recorded **blind**, before it sees any cost from the calculator, so the weights cannot simply be fitted to it.
- **Session 1 (no calculator shown):** the group ranks all eight comparison sets by judgement, and answers direct trade-off questions ("how many hours of overtime would you accept to avoid one GSOS miss? one stay-away? one weekend visit?"), recorded as ranges. A planner checks each sample plan is feasible.
- **Session 2:** the group sets the weights using sets 1-5 only (calibration). Sets 6-8 (held out) are then scored with the agreed weights and compared with the session 1 rankings.
- **Grow or keep (success):** the group agrees one weight set, and with it the calculator picks the same best plan as the group's blind ranking in at least 2 of the 3 held-out sets (a tie matches only if the group also called it a tie), and the trade-off ratios the weights imply fall within the group's stated ranges for at least three of the four questions.
- **Stop (kill):** any of
  - the group itself names two or more rules it would not break for any amount of money, recorded in their words. A term or weight added during a session to cover a rule, or a penalty larger than the most expensive plan's total, counts as the model lacking that rule, not as covering it;
  - no weight set is agreed in session 2, or the agreed set matches 1 or 0 of the 3 held-out sets;
  - both sessions are not booked, with at least two planners and one finance person, within the first week after the Go: stop before building, and say so;
  - the sessions are not held within the time box.
- Anything between is a result for Gate 3 to weigh: each mismatch and its cause is recorded. The finance participant confirms the match count, not only the owner.

## Time box
1.5 person-weeks of build, with the sessions, within four calendar weeks of the Go (ends 2026-11-29 if approved on 2026-11-01; otherwise four weeks from the Go date). Week 1 books the sessions; the build starts only once they are booked. At the end the spike stops and goes to Gate 3 with what it has.

## In and out
**In:**
- Eight built-in comparison sets, each one base plan and two to four variants, covering: overtime against a subcontractor; a weekend visit against a GSOS miss; a stay-away against two long days of travel; a standby callout against leaving work unassigned; a confirmed appointment moved against overtime (the optional stability penalty); and three held-out sets mixing these. One to three days, four to eight made-up engineers, ten to thirty work orders each.
- Load a plan from a JSON file in the same shape, and download one.
- Rates and aversion weights set through the configuration cascade (Global, Utility, Work Order Type, Work Order, with the engineer side; §5.0), showing where each effective value comes from.
- The cost of each plan by term: travel, overtime x aversion weight, weekend/unsocial premium x weight, standby allowance and callout, subcontractor, stay-away (hotel and subsistence) x weight, tardiness (priority 0-100 x severity), GSOS exposure, the stability penalty (cost per change plus per minute moved, tiered confirmed / internal / unconfirmed; §17.3) and unassigned work (its tardiness plus GSOS; §17.4).
- Variants side by side: total, each term, the difference from the base, and the rank, with the term that decided it; the trade-off ratios the weights imply (hours of overtime per stay-away, per weekend visit, per GSOS miss), because they hold whatever the real rates are.
- The group's blind rankings and stated ranges entered beside the calculator's, a match count for calibration and held-out sets, and the weight set saved and exported (JSON) with a name and date.

**Out:** any solver or optimisation; hard-constraint checking (§3.1; a planner checks the sample plans in session 1 and the screen says the tool does not); maps or a travel-time provider (miles and minutes are given in the plan); real plans, real rates, real people; integrations; accounts for participants; the Timefold fit test and assignability diagnostics (later spikes, not yet proposed).

## Data and protection
Synthetic only. Classes (POL-11): Internal (the cost model, terms, made-up rates) and Personal data, synthetic only (made-up engineers with codes such as ENG-01; no names, no real people). **No real staff data is held:** the owner drives the tool in both sessions, so there is one login, the builder's, and no participant accounts; session notes record roles (planner 1, finance 1), not names. When scenarios are reshaped in session 1, values stay made up: a profile copied from a real engineer, a real job or a real rate is refused and the request recorded (real rates and commercial terms are Confidential and need an approval under POL-11). Protection level **B** (`factory/standards/security.md`) for the Internal cost model: a login, secrets in a git-ignored env file, ports bound to 127.0.0.1 (POL-06), run locally in Docker (DEF-02).

## Template
`web-app` (CAT-006, approved), the only approved template: several screens (comparison, configuration, plan view) and saved weight sets. Its database is used only for saved weight sets and loaded plans; its sample site code is removed.

## Afterwards
A **seed**: the scoring logic (the cost terms and the cascade) is kept as a tested module, because a later fit-test spike, if one is proposed, would need the same scorer to compare a solver's plans with the agreed weights *(assumed: that spike is not yet proposed)*. The screens are throwaway.
