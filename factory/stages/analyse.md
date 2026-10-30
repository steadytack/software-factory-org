# Stage 1: Analyse

Understand the request and recommend what kind of application it should be. Output: `ideas/<slug>/application-definition.md`. Ends at **Gate 1** (the Application Definition).

## Before you start
1. Read `factory/context/README.md`, then the files `python factory/scripts/scopes.py context --scope <scope>` lists, in order, and `factory/standards/PRINCIPLES.md`. Without `factory/context/scopes.json` the scope is `group`. With it, establish which business and brands the idea is for (ask at Gate 1 if unclear) and record `scope` in `state.json`.
2. `python factory/scripts/status.py`; never reuse another idea's slug.
3. New idea: `python factory/scripts/scaffold.py new <slug> --name "<name>"`, then put the idea as given into `idea.md`. Existing idea: read `state.json`, `idea.md`, `decisions.md` and continue.

## Source mode (a document, spec or project is supplied)
1. A document: `python factory/scripts/import_source.py <file> <slug>` writes `source/<version>/` (markdown, images, the original, `ids.json`); check the printed counts against the document and read any warning. Record it in `state.json` `imports` and in the definition's `sources`.
2. A project or repository to reuse from: that is the catalogue importer's job (`catalogue/README.md`), not this stage; record the source ID.
3. Summarise what the source **already decides** and what it **leaves open**. Never rewrite the source.

## Steps
1. `python factory/scripts/scaffold.py definition <slug>`, then fill it in. Every choice in the JSON block is `recommended` (with `reason`, and `default` when a DEF-nn answered it) until the owner answers at the gate.
2. **Problem and outcome.** The idea as given; who has the problem and what it costs now; the real problem in one sentence (not the proposed solution); the outcome that shows it is solved; success measures.
3. **Users and workflows.** Who, how often, on what device; the three to five things they do.
4. **Lenses.** Activate the relevant lenses (`context/lenses/README.md`); record active and skipped (with reasons) in the definition.
5. **Maturity tier** (1 Explore, 2 Personal tool, 3 Shared pilot, 4 Operational; default DEF-01). The tier sets the depth of testing, security and documentation, not the deployment. A low tier never overrides a clear security or privacy need.
6. **Deployment category**: simple/self-contained (no Docker just for consistency), local (Docker Compose, the default when a server is needed), hosted/shared, automated/background. State the development environment when it differs.
7. **Interfaces** (combinable): web, mobile, specialist visual (map, timeline, chart, editor), conversational, non-visual (API, CLI, job, agent). **Design:** brand, design system and interaction style; infer the visual direction from them, and ask only if it is materially ambiguous.
8. **Template and catalogue.** Compare the idea with the template table below and search the catalogue (`python factory/scripts/catalogue.py search <terms> --scope <scope>`). Recommend one template, or **none fits**, with why, the runner-up and what it does not cover. List candidate assets (`candidate_assets`) with their fit and limitations, and the initial composition hypothesis. Only `approved` assets are reused (POL-10). Confirmed reference cards (systems, processes, policies) are not reused: they say what already exists, so the idea integrates with them, follows them, or says why it duplicates them; read the card's source link when the idea touches it, and flag a stale card.
9. **Data, identity, integrations, security, operations:** what is stored and how sensitive it is, who logs in, outside systems (`system-landscape.md`), what could go wrong, how it is run and backed up.
10. **Assumptions, risks, questions** (ASM, RISK, Q), carried into spec `09`.
11. **Questions:** only those whose answer materially changes architecture, cost, risk, usability or delivery (rules in `context/lenses/README.md`). They go at Gate 1 as numbered decisions. At most two question rounds across Analyse and Spec.
12. `python factory/scripts/check_spec.py <slug> --definition` must pass. Then write `gates/gate-1.md`, set `state.json` (`status: awaiting-approval`, gate 1 `awaiting-approval`) and stop (gate protocol in the skill).

## Template table
Pick the simplest template that meets the must-haves; if two fit, prefer the earlier row. Generated from `factory/templates.json`.

<!-- templates:start -->
| The idea needs... | Template | Deployment | Weak at |
|---|---|---|---|
| Login, stored records, files, several screens, roles, offline or a map | `web-app` | local, hosted | small ideas (heavy: database, backups, auth); sample sites/surveys code must be removed |
<!-- templates:end -->

## Gate 1 shows
**Done:** the definition, and the source summary in source mode. **Recommended:** tier, deployment, interfaces, design choices, template (and runner-up), candidate assets. **Decisions for you:** numbered, 2-3 options each, the recommendation marked with its reason. **Answered from your defaults:** listed, not asked. **Risks.** **Next:** Spec, with how many questions to expect.

On approval: each choice becomes `accepted` (or `rejected`/`deferred`), the definition `version` becomes `1.0` and `status` `approved`, the reply goes into `approvals` and the gate file, and `state.json` moves to `spec`.
