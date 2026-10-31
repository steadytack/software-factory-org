# Lenses

Discovery frameworks, used twice:
- **Screening, in Develop and Assess, for every idea.** Four lenses carry a short **Screening** block, one per foundation it informs. Their questions are answered in the idea brief (or listed there as unknowns), and each foundation's rating gives its reason from those answers. The screening is short: a few questions, not a discovery exercise.
- **Discovery, in Spec, activated per project**, not a questionnaire every idea must complete. Spec records which lenses apply and why (in the Application Definition), and the ones not used are listed with a one-line reason.

| Lens | Screens foundation (Develop and Assess) | Active in Spec | Feeds spec docs |
|---|---|---|---|
| [business-value](business-value.md) | Problem, Value | Always | 01, 02 |
| [users-and-workflows](users-and-workflows.md) | People & Process | Always | 02, 03, 04, 08 |
| [data-and-integrations](data-and-integrations.md) | Data Foundations | When data is stored or exchanged | 06, 10 |
| [architecture](architecture.md) | - | When there is more than one component or a server | 10, 12 |
| [security](security.md) | Risk | When there are users, stored data or exposure (tier 3+ always) | 07, 05 |
| [ux-and-accessibility](ux-and-accessibility.md) | - | When there is a visual interface | 04, 05 |
| [operations](operations.md) | - | When it runs as a service or a job (tier 2+) | 05, 10 |
| [cost-and-maintainability](cost-and-maintainability.md) | - | When there are outside services, keys or licences | 10, 12 |

## Rules for questions
- Ask only questions whose answer changes a meaningful decision (architecture, cost, risk, usability, delivery). Questions answered by `defaults.md`, `policies.md` or the source material are listed as answered, not asked.
- At most one round of the factory's questions in Develop and Assess and one in Spec (DEF-17); then recommend with explicit assumptions. When the owner wants to work an idea through, that conversation is not a round: follow it, offer options and challenges, and draft from where it lands.
- Number questions across the round, one thing per question, 2-3 options, the recommendation marked with a reason in one clause:
```
7. [Data] How long should saved plans be kept?
   A. Until I delete them  (recommended: matches DEF-05; nothing is lost by surprise)
   B. 90 days, then archived
   C. Forever, no delete
```
- A finished answer can become a requirement, a rule, a data field, a decision or an assumption. If it cannot, it is not finished.
