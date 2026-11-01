# Glossary

The words the factory uses, in plain terms. The rules behind each one are in the file named.

| Term | Means | Where |
|---|---|---|
| **Idea card** | Five questions anyone can answer to put an idea in. | `factory/project-files/idea-card.md` |
| **Idea brief** | A one- to two-page write-up of the idea that the factory drafts from the card, with every assumption marked. | `factory/project-files/idea-brief.md` |
| **Assessment** | The check on the brief that comes before any decision: knock-outs, the five foundations, a RICE score and the one thing. | `factory/stages/develop-assess.md` |
| **Knock-out** | A reason the idea cannot go ahead as it stands, for example it needs a kind of data the organisation does not allow. | `factory/stages/develop-assess.md` |
| **The five foundations** | Problem, Value, Data, Risk, and People and Process, each rated green, amber (a question to answer) or red (fix it first). | `factory/stages/develop-assess.md` |
| **RICE** | A score for ranking ideas: Reach × Impact × Confidence ÷ Effort. Higher means more value for the effort. | `factory/stages/develop-assess.md` |
| **The one thing** | The single most important thing to know or fix before investing. | `factory/stages/develop-assess.md` |
| **Gate** | A decision point where a named person approves, changes or stops the work. There are four: invest (1), the spec (2), the build and its audit (3), and publishing (4). | `factory/README.md` |
| **Go / Go as a spike / Get Ready / Stop** | The four answers at Gate 1. "Get Ready" means fix the named foundations first, then look again on a set date. | `factory/stages/develop-assess.md` |
| **Tier** | How mature a build is: 1 Spike, 2 Exploration prototype, 3 Business prototype, 4 Production app. It is chosen for each idea, and moving up a tier is a decision. | `factory/standards/tiers.md` |
| **Spike / light route** | Tier 1: a small, time-boxed build that answers one question, with a one-page plan instead of a spec. It ends with grow, keep or stop. | `factory/stages/light.md` |
| **Spec pack** | The documents that specify an app at tiers 2 to 4: requirements, user experience, data, security, stories, the delivery plan and so on. It scales with the tier. | `factory/standards/specification-pack.md` |
| **Data classes** | The kinds of information (Public, Internal, Confidential, Personal and so on) and whether each may be used in the factory, and on what conditions. | `factory/context/group/policies.md` (POL-11) |
| **Protection level A–D** | How well an app is protected. It follows the data the app holds and who can reach it, not its tier: A is the builder only, B is Internal data or staff, C is Confidential or personal data, D is anyone outside the organisation. | `factory/standards/security.md` |
| **POL-nn** | A policy: a rule that applies to every idea and is never broken. | `factory/context/group/policies.md` |
| **DEF-nn** | A default: what the factory does unless an idea decides otherwise. | `factory/context/group/defaults.md` |
| **Lens** | A set of questions from one point of view (security, operations, cost and so on), used in the assessment and, where it applies, in the spec. | `factory/context/lenses/README.md` |
| **Architecture as Code (AaC)** | The organisation's system landscape, and increasingly its processes, described as code and kept up to date by their owners. It is the factory's source of truth for what exists. | `factory/context/group/system-landscape.md` |
| **System landscape** | Every system the organisation runs, who owns it, the data it holds and how systems connect. | `factory/context/group/system-landscape.md` |
| **Process model** | How a piece of work is done today, step by step and who does it, as AaC. The starting point for an idea's as-is process (doc 13). | `factory/context/group/system-landscape.md` |
| **Reference card** | A catalogue entry for a system, process or policy that already exists. It points at its source of truth and has a maintainer who confirms it at set intervals. | `catalogue/README.md` |
| **Catalogue** | Approved, reusable building blocks, plus reference cards for the organisation's systems, which new apps are built from where they fit. | `catalogue/README.md` |
| **Template** | The starting point an app is built from, with its stack and standards. The templates in the registry are the organisation's approved technology list. | `templates/`, `factory/templates.json` |
| **Factory version** | The release of the shared guardrails, approach, policies, defaults and templates an idea was built on. Improvements are released as new versions. | `VERSION`, `CHANGELOG.md` |
| **Audit** | The checks before Gate 3, spec conformance first: does the app do what was specified? | `factory/stages/audit.md` |
| **Benefits review** | A look back at set points after publishing: were the success measures met? | `factory/stages/publish.md` |
