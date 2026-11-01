# Plan cost calculator for field service scheduling: overview

For sponsors and the team: one document, readable without the factory. Plain language throughout, with no requirement IDs, codes or jargon. Written at the end of Develop and Assess from the idea brief and the assessment, and shown at Gate 1, the investment decision. Any term it must use is in the [glossary](../../docs/glossary.md).

## Executive summary

**The problem.** A field service scheduler, whether we build or buy one, decides between overtime, weekend work, subcontractors, overnight stays and missing a guaranteed-standard appointment window by adding up what each costs in pounds. Nobody has yet agreed what those pounds and the "how much we dislike it" weights should be. If they are wrong, the scheduler optimises the wrong thing, and we find out only after choosing and configuring it.

**The impact.** Planners and finance either agree one set of weights, and the calculator then picks the plan they would on comparisons they ranked beforehand without seeing any costs (at least two of three held back for the test), or we learn early that their trade-offs cannot be put in pounds and the scheduler needs firm rules as well. Either answer would shape a scheduler decision before money is spent on it (assumed: that decision is pending; to be confirmed).

| Reach | Impact | Confidence | Effort | Priority score |
|---|---|---|---|---|
| 5 per month (assumed: not yet asked) | 0.5 (low) | 40% | 1.5 person-weeks | 0.67 |

From the assessment, where it is ranked with every other idea (`ideas/pipeline.md`): Reach is the people or processes touched per month; Impact runs from 0.25 (minimal) to 3 (massive) for each; Confidence is how sure the estimate is; Effort is rough person-weeks to a first release. Priority score = Reach x Impact x Confidence / Effort.

**Are the foundations in place?**

| Foundation | Rating | Why |
|---|---|---|
| Problem | Amber | One clear question, taken from the scheduling specification's cost model; how often these trade-offs come up, and what they cost today, is not yet known. A planner describing a typical week settles it. |
| Value | Amber | Success and failure can be measured against rankings made beforehand, but the value is indirect: it reduces the risk of a scheduler decision not yet shown to be pending, and there is no figure in pounds for today. |
| Data Foundations | Amber | All the data is made up for the trial, so it exists and is easy to reach; whether the made-up plans are realistic enough is not yet proven, and weights set on made-up rates may not carry over to real ones, so the trial also records trade-offs that do not depend on rates. |
| Risk | Green | It only scores made-up plans; people make every judgement themselves, before seeing any cost; no real, personal or commercial data is held, no links to other systems, one login. |
| People & Process | Amber | The owner wants it, but the planners and finance staff who must take part have not yet been asked. |

**The one thing to know or fix before investing.** Whether two or three planners and one finance person will give two working sessions to check the sample plans, rank the alternatives and try to agree a set of weights: without their judgement the trial cannot answer its question. The sessions are booked before anything is built, and the trial stops if they cannot be booked within a week.

**Who benefits.** Planners (two or three) and finance (one or two), who get their trade-offs written down and tested; the owner of the scheduling work, who gets an agreed cost model to configure or test a scheduler against.

**Effort and cost.** About one and a half person-weeks, including writing the sample plans and running the sessions, plus two sessions of about two hours for the participants. No services, licences, accounts or running costs; it runs on the factory's approved web template on a local machine.

**Key risks.** People not finding time (book the sessions before building, stop if they cannot be booked); made-up plans not feeling real (a planner checks and reshapes them in the first session); weights set on made-up rates not holding for real rates (also record the rate-free trade-offs, and set real rates later under a separate approval); the owner steering the result (rankings are made before any cost is shown, and finance confirms the result).

**The decision asked.** Recommended: **Go as a spike**, a small trial build: no foundation is red, and the open questions are answered faster by a working calculator checked against the group's own rankings than by more research. It commits one and a half person-weeks and two sessions, within four weeks. It does not commit to building or buying a scheduler, or to using any real data.

## What it is
A small web tool that works out what a field service plan costs in pounds. A plan is a set of made-up engineers, jobs, days and routes. People set the rates and weights, and the tool shows the total and its parts: travel, overtime, weekend and unsocial-hours premiums, standby and callout, subcontractors, overnight stays, lateness against due dates, and the payment due when a guaranteed-standard window is missed. Optionally, it also counts the cost of moving an appointment already confirmed with a customer. It puts alternative versions of a plan side by side, says which is cheaper and which part of the cost decided it. It does not make plans itself.

## How it changes people's work
Today, planners make these trade-offs case by case, from experience, and finance sees the cost afterwards (to be confirmed with a planner). With the tool, for two sessions only, they rank the same alternatives together by judgement before seeing any costs, say how much overtime they would trade for a stay-away or a missed window, then set weights and see whether the weights reproduce their rankings on comparisons kept back for the test. The owner drives the tool; participants need no account. Nobody's daily work changes now; what changes later is what any scheduler is told to aim for.

## In scope and out of scope
**In:** eight ready-made comparisons (overtime against a subcontractor, a weekend visit against a missed guaranteed window, an overnight stay against two long travel days, a standby callout against leaving work unassigned, moving a confirmed appointment against overtime, and three mixed ones kept back for the test); loading and saving plans; setting rates and weights at company, job-type and job level; the side-by-side comparison; recording the group's ranking and the agreed weights.
**Out:** working out plans automatically; checking that a plan obeys hard rules such as rest periods (the sample plans are written to obey them); maps; real plans, rates or people; links to other systems; testing a scheduling product, which is a later trial.

## What happens next
On Go as a spike: the sessions are booked first, the tool is built, the two sessions are held, and within four weeks the results come back to the owner, who decides whether to grow it into a fuller prototype, keep it as it is, or stop. On stop, the reason is recorded; learning that the trade-offs do not fit one cost model is itself a useful answer.
