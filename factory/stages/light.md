# The light route: a spike (tier 1)

The fast way through the factory: build the smallest thing that answers one question, in a time box (1 person-week by default), instead of writing a spec. A spike has **one document, its card** (`spike.md`), in place of a brief, assessment, overview and plan. It skips Spec and Gate 2, and ends at Gate 3 with **grow** (to tier 2 or 3), **keep** or **stop**.

```
spike card ─gate 1 (Go as a spike)→ Build, time-boxed ─gate 3→ grow (to Spec at tier 2 or 3) │ keep │ stop
```

## When
When one question decides whether the idea is worth more (is it feasible, does the approach work, does the data support it) and building something small answers it faster than research. Never to step around a policy. An idea that needs more than one question answered, or real investment from the start, goes through Develop and Assess in full (`develop-assess.md`).

## The card (before Gate 1)
1. `python factory/scripts/pipeline.py develop IDEA-nnn --spike` makes `ideas/<slug>/spike.md` (for an idea not in the register: `scaffold.py new <slug> --name "..." --spike`).
2. Fill it in, keeping it to about a page:
   - **The block at the top:** the data classes (checked against POL-11; a class allowed only by approval needs `pipeline.py approve-data` first), the one thing, the recommendation (Go, or Stop with its reason) and the time box.
   - **Problem**, with where the evidence comes from; evidence with no source is an assumption.
   - **The question**, and the answer that would settle it.
   - **Success and stop**, decided now and judged on evidence the build does not tune to (held-out cases, or a judgement recorded before the build), so the test can fail.
   - **Time box**, with what is in and out.
   - **Data and protection** (`factory/standards/security.md`) and the template.
   - **Template features** (DEF-26): when the template declares `options` in `factory/templates.json` (web-app: Share, the Theme changer, Help with Guides and Feedback, where each feedback type goes, and the outbound Heartbeat), list each one pre-filled with its default under **Template features** at Gate 1. They are not among the at-most-5 questions: each already has a default, and the approver changes only what they want different. A feedback type (Problem, Suggestion, Question) takes `email:<address>`, `email:` (the admin's address, set in the app), `store` (kept in the app's admin list only) or `off`. Record the choices in the block's `template_options`, keyed by option id (for example `{"share": false, "feedback.question": "store"}`); a missing id keeps the default. `scaffold.py app` removes what is off, so the app carries no unused code.
   - **Data sources:** for each external one (a feed, an API, a file another system writes), a real sample saved under `source/` (for example `source/samples/<name>.json`; from its test environment, or real data the card's data classes allow; the stand-in, DEF-24, is built from it) and the fields the spike will use, read from the sample, not only the published field list; or why none can be had yet (no key, no access), which is a risk: anything resting on that source is at most partially verified until a sample is seen (`spec-conformance.md`). "None" when the spike reads no outside data.
   - **Challenge:** a fresh subagent that did not see the drafting argues against the card (`factory/standards/challenge.md`); one line per challenge, with what changed or why it was kept.
3. `python factory/scripts/check_spec.py <slug> --assessment` must pass: every section there, nothing left to fill in, the data classes allowed.

## Gate 1
Show the card to a gate approver for the idea's scope (not its owner, who may only stop it). Their reply is recorded exactly, with `[meaning: ...]` when it points at numbered choices: A change to the **Template features** goes into the block's `template_options` before `scaffold.py app`. `pipeline.py decide <slug> go --by <approver> --reply "..." [--timebox N]` writes it into the card's **Sign-off**, records Gates 1 and 2 as approved and moves the idea to Build at tier 1. A Stop: `pipeline.py decide <slug> stop --reason "..." --by <approver> --reply "..."`.

## Build
1. `python factory/scripts/scaffold.py app <slug> <template>`, then Build steps 2 and 3 (`build.md`: safe beside everything else, the baseline checks).
2. Build only what the card says is in. The main path tested (`testing.md`). Record shortcuts in `decisions.md` as you take them. A spike that runs as a stack (anything with a server) is rebuilt and restarted after each change (`docker compose up -d --build`, or the app README's own command), and `python factory/scripts/status.py --stack <slug>` prints "stack current" before a result is looked at, judged or shown: passing tests do not change what the running build shows.
3. Stop at the time box with what you have. Running out of time is a result, not a failure.

## Gate 3
1. Check the result against the success and stop criteria, as run, and run the spec-conformance audit against the card (`factory/audits/README.md`, which also says when a spike needs the other audits).
2. `python factory/scripts/learned.py outcome <slug>`, filled in (the time box is the estimate); `learned.py check <slug>` must pass.
3. Write `gates/gate-3.md`, short: what was built and how to run it; the results exactly as run against each criterion; **what this does not show** (stand-ins and synthetic data in place of live systems, access, the people and process around it, and that the spike's effort is no estimate for a full build); the recommendation; the risks. When the spike has screens and the recommendation is keep or grow, the gate offers the UI polish audit (`factory/audits/ui-polish.md`) before anyone else is shown it; it runs when the approver asks. The factory retro (`factory/audits/factory-retro.md`) runs only when the approver asks for it.
4. Record the approver's reply with `python factory/scripts/pipeline.py light <slug> grow|keep|stop --by <approver> --reply "..." [--tier 2|3] [--reason "..."]`:
   - **Grow** (the tier is required): on to Spec (`factory/dormant/spec.md`, brought back for it) at that tier, starting from what the spike showed. What it does not show stays an open question, and the effort is estimated afresh.
   - **Keep:** good enough as it is, as a demonstration or a tool for its builder; Publish (`factory/dormant/publish.md`) comes back for it. Anything other people will rely on grows instead.
   - **Stop:** closed with its reason, which is as useful an answer as a Go.
