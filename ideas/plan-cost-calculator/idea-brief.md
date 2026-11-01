# Plan cost calculator for field service scheduling: idea brief

One to two pages in plain language, for the people who will decide. Drafted by the factory in Stage 1 (Develop and Assess) from the idea and the scope's context; every assumption is marked *(assumed)*. It is the evidence `assessment.md` rates, so say what is known and what is not.

## The idea
A small web calculator that scores a field service plan in pounds. Planners and finance load a sample plan (made-up engineers, work orders, days and routes), set the rates and the aversion weights, and see the plan's total cost broken down by term: travel, overtime (times its aversion weight), weekend or unsocial premium, standby allowance and callout, subcontractor cost, stay-away (hotel and subsistence), tardiness (priority 0-100 scaled by severity) and GSOS exposure (a large one-off cost when a guaranteed-standard window is missed). They put alternative versions of the same plan side by side (overtime against a subcontractor against a weekend visit, say) and see which is cheaper and why. Optional: an appointment-stability penalty (a cost per change plus per minute moved, tiered confirmed, internal, unconfirmed). It scores plans; it does not make them (no solver).

It is the first, lowest-risk spike from the owner's field service scheduling and route optimisation specification (v0.5, held outside the repo). Only its cost model (§2), constraints (§3), priority and GSOS scoring (§4), configuration cascade (§5.0), appointment stability and unassigned work (§17.3-17.4) and open question 6 (the stability weights, §24) are used here. The rest, the build-versus-buy and procurement sections included, is out of this idea.

## Problem
The specification wants one objective, total plan cost in £, so that a scheduler can trade overtime, weekend work, subcontractors, stay-away and GSOS penalties against each other explicitly (§2, §3.2, §4). That only works if the £ figures and aversion weights reflect how the people who own those trade-offs actually decide. Today nobody has written them down: the rates and weights are configuration "at Utility level" (§5.0) with no agreed values, and the stability weights are an open question (§24, Q6). If the weights are wrong, any scheduler, built or bought, optimises the wrong thing, and that is found only after it is chosen and configured.

Who has it: planners, who make the trade-offs day to day, and finance, who pay for them *(assumed: the spec names no roles)*. How often: every plan that needs overtime, a weekend visit, a subcontractor or a stay-away, or risks a GSOS miss; the frequency and today's cost are unknown.

One problem, one question: can these trade-offs be expressed as one £ model with weights the two groups agree? Feasibility of a solver (a Timefold fit test) and why work cannot be assigned (assignability diagnostics) are separate, later spikes.

## Outcome and success measures
- **Success:** planners and finance agree one weight set, and with it the calculator picks the same best plan as their own ranking, made blind before they see any cost, on comparisons held out from setting the weights (at least 2 of 3, `plan.md`).
- **Stop:** they cannot express their trade-offs in £ (for example, a rule like "never send this engineer away two nights running" that no weight reproduces), or they cannot agree a set.
- **Worth:** either answer is useful whether the organisation builds or buys a scheduler *(assumed: a scheduler decision is pending and depends on it; not yet confirmed)*: an agreed weight set and a scorer to test any candidate against, or early evidence that the cost model needs hard rules alongside £ before anyone commits to a scheduler. Baseline today: no agreed weights and no way to compare plans in £.

## How it's done today
No process model exists yet (the business-process AaC is "being started", `factory/context/group/system-landscape.md`), so this is *(assumed)*: planners build plans in today's scheduling tool or by hand, decide case by case whether to approve overtime, a weekend visit, a subcontractor or a stay-away, and escalate the expensive ones to a manager; finance sees the cost afterwards, in pay and supplier invoices. Trade-offs live in people's heads and are not compared side by side in £. To be confirmed with a planner in the first session.

## Data
- **What it needs:** sample plans and a configuration, all made up: engineers (a code, a base, a shift pattern, contracted hours, max overtime, can-stay-away and standby flags), work orders and their types (priority, severity, due date, GSOS applicable and amount, window, subcontractor-eligible, stability tier), days, routes as an ordered list of stops with miles and minutes given (no map or travel-time provider), and rates and aversion weights at the cascade's levels (Global, Utility, Work Order Type, Work Order; §5.0).
- **Where it lives:** in the calculator's own files. No existing system is read. The system landscape (AaC) is not yet connected and no catalogue reference card exists for a scheduling, workforce or finance system (`catalogue.py search`, 2026-11-01), so the systems that hold real plans and rates are unknown; none is needed for this spike.
- **Quality:** the data is authored for the spike, so it is as good as the scenarios are realistic. The risk is that made-up plans feel unlike real work, and planners will not judge them *(assumed: realistic enough; settled in the first session)*.
- **Data classes (POL-11):** Internal (the cost model and terms). Personal data, synthetic only: made-up engineers, identified by codes not names. No real rates or commercial terms: those are Confidential, need an approval this idea does not have, and are not needed to agree relative weights. No integrations.

## Risk
- **Worst outcome:** a weight set is agreed on made-up scenarios and carried into scheduler configuration where it does not hold for real work. Who bears it: the later scheduler project, not customers or staff now. It would be carried forward only by a later decision at its own gate, and real rates need a separate approval first; the later spikes are not yet proposed *(assumed)*.
- **Misleading result:** a hand-made sample plan that breaks a hard rule (statutory rest, competency) could look cheapest. The sample plans are authored feasible and checked by a planner in session 1, and the calculator says it does not check hard constraints (§3.1).
- **Facilitator bias:** the owner wants the idea, builds it and runs the sessions. Limited by recording the group's rankings blind before any cost is shown, scoring on held-out comparisons, and having the finance participant confirm the match count.
- **Where people judge:** the whole point; planners and finance rank the plans themselves and the calculator is checked against them. It makes no decisions and acts on nothing.
- **Data and reach:** synthetic only, Internal; the owner drives the tool in the sessions, so no participant accounts and no real staff details are held. Unavailable for a day: nothing stops.

## People and process
- **Owner:** steadytack, who wants it and will run the sessions *(assumed: owner of the scheduling work)*.
- **Users:** two or three planners and one or two people from finance, for two working sessions: one to check the scenarios and rank them blind, one to agree the weights and score the held-out comparisons *(assumed: not yet asked; booked before the build starts)*. The owner drives the tool.
- **Fit:** it changes no live process. It is a workshop tool; what changes later is the scheduler's objective. Nobody loses anything; the cost is their time.

## Strategic fit
It is the smallest, most reusable first step of the scheduling specification, and useful whichever way the organisation goes: the agreed cost model is the objective for a built scheduler and the yardstick for a bought one. It is also the factory's first pilot: small, one clear question, Internal and synthetic data only, an owner who wants it, a measurable outcome and no integrations (`docs/operating-model.md`, "Choosing the pilot idea"). The business context file is still a placeholder, so fit to the organisation's stated objectives cannot be cited.

## Assumptions and unknowns
- Planners and finance will give two sessions *(assumed)*; if not, the spike cannot answer its question (the one thing).
- Synthetic scenarios are realistic enough to judge *(assumed)*; if not, the first session reshapes them.
- Weights agreed on made-up rates carry over to real rates *(assumed, and doubtful)*: weights compensate for rates in the wrong proportion. So the spike also records the trade-off ratios the group states and the weights imply (hours of overtime per stay-away, per GSOS miss), which hold whatever the rates are; real rates need a Confidential approval before the weights themselves are relied on.
- The tardiness curve is not defined beyond "rising, scaled by priority and severity" (§4) *(assumed: a simple £ per day late x priority/100 x severity multiplier, shown and adjustable)*.
- Today's process, its frequency and its cost are unknown (no process model).
- Alternatives considered:
  - **A spreadsheet** would compute the same sums, and finance know it. The calculator is preferred for the configuration cascade (where each value comes from), the held-out scoring and a scorer a later fit-test spike could reuse *(assumed: reuse; that spike is not yet proposed)*; it is also the factory's pilot. A spreadsheet stays a fair fallback.
  - **A facilitated trade-off exercise with no build** ("how many hours of overtime would you accept to avoid one GSOS miss?"): it elicits the trade-offs directly but does not test whether one set of weights reproduces the group's rankings. The spike includes it: session 1 asks these questions before the tool is shown.
  - **Today's scheduling tool** may already hold rates, priorities or cost settings *(unknown)*: asked in session 1, and read first if it does.
  - **Doing nothing** leaves the weights to be guessed when a scheduler is configured.
