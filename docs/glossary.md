# Glossary

The words the factory uses, in plain terms. The rules behind each one are in the file named.

| Term | Means | Where |
|---|---|---|
| **Idea card** | Five questions anyone can answer to put an idea in. | `factory/project-files/idea-card.md` |
| **Idea owner** | The person developing an idea. Anyone can use the factory to develop their own idea. | `factory/README.md` |
| **Spike** | Tier 1: a small, time-boxed build that answers one question. It ends with grow, keep or stop. | `factory/stages/light.md` |
| **Spike card** | A spike's one page (`spike.md`): the problem, the question, success and stop, the time box, data and protection, the challenge and the sign-off. | `factory/project-files/spike.md` |
| **The one thing** | The single most important thing to know or fix before investing. | `factory/stages/light.md`, `develop-assess.md` |
| **Idea brief and assessment** | For an idea developed in full rather than as a spike: a write-up with every assumption marked, then a check on it (knock-outs, the five foundations, a RICE score). | `factory/stages/develop-assess.md` |
| **Knock-out** | A reason the idea cannot go ahead as it stands, for example it needs a kind of data the organisation does not allow. | `factory/stages/develop-assess.md` |
| **The five foundations** | Problem, Value, Data, Risk, and People and Process, each rated green, amber (a question to answer) or red (fix it first). | `factory/stages/develop-assess.md` |
| **RICE** | A score for ranking ideas developed in full: Reach × Impact × Confidence ÷ Effort. Spikes are not scored. | `factory/stages/develop-assess.md` |
| **Gate** | A decision point where a named person approves, changes or stops the work: invest (1), the spec (2), the build and its audit (3), publishing (4). A spike has Gates 1 and 3. | `factory/README.md` |
| **Sign-off** | A gate decision by a named gate approver, never the idea's own owner (who may only withdraw it). Recorded with who signed, in their words. | `factory/README.md` |
| **Go / Go as a spike / Get Ready / Stop** | The answers at Gate 1. "Get Ready" means fix the named foundations first, then look again on a set date. | `factory/stages/develop-assess.md` |
| **Challenge** | Before a gate, a fresh agent that did not see the drafting argues against the work; each challenge is answered. | `factory/standards/challenge.md` |
| **Tier** | How mature a build is: 1 Spike, 2 Prototype, 3 Production app. Chosen for each idea; moving up is a gate decision. | `factory/standards/tiers.md` |
| **Dormant** | Parts of the factory no idea has used yet (Spec, Publish, roadmaps), set aside until one needs them. | `factory/dormant/README.md` |
| **Spec pack** | The documents that specify a prototype or production app. Dormant until an idea needs one. | `factory/dormant/specification-pack.md` |
| **Bug** | The built app doing something other than what was approved. Fixed with a failing test first. | `factory/stages/bugs.md` |
| **Stand-in** | A fake of another system that a spike or prototype connects to instead of the real one, with made-up data. | `factory/context/group/defaults.md` (DEF-24) |
| **Synthetic data** | Made-up records that look like the real thing, used to build and test without real people's or customers' information. | `factory/context/group/policies.md` (POL-11) |
| **Data classes** | The kinds of information (Public, Internal, Confidential, Personal and so on) and whether each may be used, and on what conditions. | `factory/context/group/policies.md` (POL-11) |
| **Protection level A–D** | How well an app is protected. It follows the data it holds and who can reach it, not its tier. | `factory/standards/security.md` |
| **POL-nn / DEF-nn** | A policy (a rule never broken) / a default (what the factory does unless an idea decides otherwise). | `factory/context/group/` |
| **System landscape** | Every system the organisation runs, who owns it, the data it holds and how systems connect, kept as Architecture as Code by its owners. | `factory/context/group/system-landscape.md` |
| **Template** | The starting point an app is built from, with its stack and standards: the approved technology list. | `templates/`, `factory/templates.json` |
| **Catalogue** | Approved, reusable building blocks and reference cards for existing systems. | `catalogue/README.md` |
| **Audit** | The checks before Gate 3, spec conformance first: does the app do what was approved? | `factory/stages/audit.md` |
| **Outcome** | At Gate 3, whether the Gate 1 assessment or card held. | `factory/stages/light.md` |
| **Factory version** | The release of the factory an idea was built on. | `VERSION`, `CHANGELOG.md` |
| **Freeze** | A pause on changing the factory except to fix a problem a real idea hit, or to get simpler. One ran from 0.18.0 and was lifted at 0.20.0. | `CLAUDE.md` |
