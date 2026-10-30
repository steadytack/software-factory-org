# Lenses

Discovery frameworks for Develop and Assess and for Spec. They are **activated per project**, not a questionnaire every idea must complete. Develop and Assess draws on the two that are always on to write the idea brief; Spec records which lenses apply and why (in the Application Definition), and the ones not used are listed with a one-line reason.

| Lens | Always on? | Feeds spec docs |
|---|---|---|
| [business-value](business-value.md) | Yes | 01, 02 |
| [users-and-workflows](users-and-workflows.md) | Yes | 02, 03, 04, 08 |
| [data-and-integrations](data-and-integrations.md) | When data is stored or exchanged | 06, 10 |
| [architecture](architecture.md) | When there is more than one component or a server | 10, 12 |
| [security](security.md) | When there are users, stored data or exposure (tier 3+ always) | 07, 05 |
| [ux-and-accessibility](ux-and-accessibility.md) | When there is a visual interface | 04, 05 |
| [operations](operations.md) | When it runs as a service or a job (tier 2+) | 05, 10 |
| [cost-and-maintainability](cost-and-maintainability.md) | When there are outside services, keys or licences | 10, 12 |

## Rules for questions
- Ask only questions whose answer changes a meaningful decision (architecture, cost, risk, usability, delivery). Questions answered by `defaults.md`, `policies.md` or the source material are listed as answered, not asked.
- At most one round in Develop and Assess and one in Spec (DEF-17); then recommend with explicit assumptions.
- Number questions across the round, one thing per question, 2-3 options, the recommendation marked with a reason in one clause:
```
7. [Data] How long should saved plans be kept?
   A. Until I delete them  (recommended: matches DEF-05; nothing is lost by surprise)
   B. 90 days, then archived
   C. Forever, no delete
```
- A finished answer can become a requirement, a rule, a data field, a decision or an assumption. If it cannot, it is not finished.
