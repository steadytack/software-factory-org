# Challenge before a gate

The factory drafts the brief, rates it and recommends, and then writes the spec it will build. Left alone, it marks its own work. So before Gate 1 and Gate 2 a **challenger** argues against the recommendation, and every challenge is answered before the owner sees the gate. (Stage-Gate relies on gatekeepers who did not do the work; this is the factory's version.)

## Who challenges
A **fresh context** that did not draft the work: a subagent, or a new session, given only the files below and this page. It does not see the drafting conversation or the factory's reasoning. Where the tool offers no fresh context, the factory does it itself in a separate pass and says so on the gate page: a weaker challenge, stated, beats none. The owner can also be the challenger.

| Gate | The challenger reads | It challenges |
|---|---|---|
| 1 | `idea-brief.md`, `assessment.md` (its pre-mortem included), `overview.md`, `spike.md` for a spike (the challenge goes in its Challenge section), `roadmap.md` for a project or programme, the scope's `policies.md` and `defaults.md` | Each foundation rated more generously than the brief's evidence supports; RICE factors overstated (Reach and Impact especially), and Confidence higher than the ambers allow; an assumption not marked *(assumed)*; evidence with no source, or thin evidence (one anecdote, one source) behind a green; an alternative not considered (doing nothing, a process change, an existing system or catalogue asset); a pre-mortem reason the ratings ignore; whether the one thing is really the one thing; for a spike, kill criteria that could never trigger, and a success test that could not fail (judged on the cases the build tunes to, rather than held-out cases or a judgement recorded blind or before the build); for a roadmap, a build epic started before the spike that would answer its risk, an amber no spike answers, and a project or programme squeezed into one build (or an app split into a roadmap it does not need) |
| 2 | `application-definition.md`, the spec pack, `composition.json`, the Gate 1 assessment and `decisions.md` | A requirement that cannot be tested as written, or that no to-be step in doc 13 needs; a missing negative or edge case in the acceptance criteria; a permission that is not enforced by any requirement or test; a tier, protection level or deployment heavier or lighter than the brief justifies; an architecture more complex than the requirements; an NFR or design choice justified by an "-ity" (scalability, extensibility, configurability, security) with no example scenario that needs it; a composition presented as proven that is not; a Gate 1 amber or the one thing with no matching ASM, RISK or Q in doc 09; for an AI feature, what `ai-features.md` asks for that is missing |

It looks for the strongest case against, not for typos: ten small points and no big one is a challenge that has not looked. It does not rewrite the work.

## The record
`ideas/<slug>/gates/challenge-<gate>.md`, written by the challenger and answered by the factory:

```
# Challenge before Gate 1

Challenger: a fresh subagent (or: the factory, in a separate pass; or: the owner)

| # | Where | Challenge | Answer | Outcome |
|---|---|---|---|---|
| 1 | assessment.md, reach | 40 swaps a month is a guess; the rota shows about 12 | Reach lowered to 15 from the rota export | changed |
| 2 | idea-brief.md, data | The rota export may not include agency staff | Checked: it does (source: the export's header) | kept |
```

- **Where** names the file and the item (a foundation, a RICE factor, an ID).
- **Answer** says what was done, or why the work stands, with the evidence.
- **Outcome** is `changed` (the work was edited) or `kept` (it stands, for the reason given).

`check_spec.py` (`--assessment` at Gate 1, the spec check at Gate 2) warns when the file is missing and blocks a row with no answer or an outcome other than `changed` or `kept`; a table with no rows is a warning.

## At the gate
The gate page shows a **Challenge** line under Done: who challenged, how many challenges, how many changed the work, and any `kept` challenge the owner should weigh (one that disputes a rating, the score or the recommendation), each as a numbered decision. A re-assessment or a delta gate is challenged on what changed only.
