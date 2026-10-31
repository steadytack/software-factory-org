# The software factory: assessment

The factory's own case, rated against [the brief](idea-brief.md) the way every idea is (`factory/stages/develop-assess.md`): knock-outs first, then the five foundations, the priority score, a pre-mortem, the one thing to know or fix, and the recommendation. For a real idea, this record is also kept as data that the factory checks and ranks.

## Knock-outs
None. The factory uses only data classes the policy allows (Internal *(assumed)*), and it needs no service, cost or account the organisation hasn't approved.

## The five foundations
| Foundation | Rating | Why |
|---|---|---|
| **Problem** | Amber | The backlog and the inconsistency are widely recognised, but neither is measured here yet *(assumed)*. |
| **Value** | Amber | The success measures are clear and the factory reports them itself, but there is no baseline for today to compare against. |
| **Data** | Amber | The context exists (the business context document, the Architecture as Code landscape) but isn't brought in or connected yet; the processes are being started. |
| **Risk** | Green | Four human gates, independent challenge, enforced data policy, audits and typed approval for anything outward-facing. The remaining risk is approvers not reading the gates, which the work-in-progress limit and one-page gate summaries address. |
| **People and process** | Amber | The operating model is written, but operators, approvers and architecture and process owners are still to be named. |

No foundation is red, and every amber is a question a small pilot answers faster than more research.

## Priority score
| Factor | Value | Why |
|---|---|---|
| Reach | 24 ideas a year | 2 a month at first *(assumed)* |
| Impact | 2 (high) | Each idea gets a decision in days instead of a queue, and every app is built one way |
| Confidence | 50% | Sound design, but no idea through it end to end yet |
| Effort | 8 person-weeks | Naming the roles, bringing in the context, the pilot and the first months of operating *(assumed)*. The factory itself is already built. |
| **Score** | **3** | Reach × Impact × Confidence ÷ Effort. Comparable only with other ideas scored the same way |

## Pre-mortem
It is a year from now and the factory failed. The three likeliest reasons:
1. **Nobody sent ideas, or nobody trusted the results** (Problem, Value). Partly allowed for by the ambers. The answer is a visible first win from the pilot, and a reply to every idea card within a week.
2. **The gates became the bottleneck** (People and process). Allowed for: operators and approvers are named before opening to staff, and the work-in-progress limit grows with them.
3. **Apps were built without the real context, so they duplicated systems or integrated badly** (Data). Allowed for by the amber: the business context and the landscape come in before most ideas, and every integration must name a system the landscape knows.

## The one thing to know or fix before investing
**No idea has been through the factory end to end.** One real pilot, run through to the end of its spike, will show the cycle time, the quality of the output and the effort the gates take. Everything else follows from that evidence.

## Recommendation
**Go as a spike.** Run one small, real, low-risk idea (Internal data only) through the factory to the end of its spike, within a two-week time box.
- **Success:** a decision at Gate 1 within 5 working days of capture; a working spike within its time box; the sponsor and the idea's owner agree it answered its question.
- **Kill:** the pilot can't reach Gate 3 in the time box, or the gates take more effort than building the spike did.
- **Then:** grow (name the roles, bring in the context, open to staff), keep piloting with a second idea, or stop.
