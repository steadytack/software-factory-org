# Context: Organisation A

What the factory knows about the organisation, its people and machines, and what has been learned. Separate from the catalogue (reusable assets and reference cards) and from each project's own files. An idea reads only its layers: `python factory/scripts/scopes.py context <slug>` lists the files in precedence order.

| Path | Holds | Can a project override it? |
|---|---|---|
| `scopes.json` | The group, its businesses and brands, approvers, publish settings | No |
| `group/policies.md` | Mandatory rules, the data classes (POL-11) included | No. Only a group approver changes a policy |
| `group/business-context.md` | The organisation's general context | Yes |
| `group/system-landscape.md` | Pointer to the reference cards; systems without a card | Yes |
| `group/defaults.md` | Standing preferences the factory recommends | Yes, recorded in the project's `decisions.md` |
| `group/team.md` | Who uses the factory and how | Yes, if the project says why |
| `businesses/<b>/` | One business: `business-context.md`, extra `policies.md`, `system-landscape.md`, `defaults.md` | As the group files |
| `brands/<x>/` | One brand: `brand.md` (audience, tone, domains, legal entity), `defaults.md` | As the group files |
| `environment.md` | Each person's machine, tools, ports (git-ignored; copy `environment.example.md`) | No for facts; re-check live |
| `learned.md` | Dated choices that differed from a recommendation (`learned.py add`); with each built idea's `outcome.md`, reviewed at every gate for candidate changes | Never applied as a rule by itself |
| `lenses/` | Screening questions for the five foundations (Develop and Assess, every idea) and discovery frameworks for Spec (part of the factory, maintained in this repo) | Screening always; discovery activated per project |

## Precedence (highest first)
1. **Policies**, every layer's; a business or brand may tighten a group policy, never relax it. A conflict is a stop.
2. **Project decisions** (`ideas/<slug>/decisions.md`, approved at a gate).
3. **Runtime facts** (`environment.md`, checked live).
4. **Context and defaults**, the most specific layer first: brand, then business, then group.
5. **Learned** entries: evidence for changing a default, not a rule.

## How the factory learns
It records, then proposes; an approver decides. Every gate answer that differs from a recommendation is appended to `learned.md`. At Gate 3 each built idea gets `outcome.md`: did each foundation's rating, the effort and the one thing hold, and what should the factory change? At every gate `python factory/scripts/learned.py review` reads both and lists candidate changes: the same override in two or more projects (promote it to a default?), a foundation rated wrongly in two or more builds (review that lens's screening questions?), effort off by half or more (re-calibrate RICE?), the same lesson twice. Each goes on the gate page as a decision. On yes, the entries are marked `confirmed` and the default, lens or knock-out rule is edited as a change to the factory, so the next idea starts from it. Nothing changes by itself.
