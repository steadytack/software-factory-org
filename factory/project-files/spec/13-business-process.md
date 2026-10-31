# 13 Business process

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-13 | 0.1 | draft | {date} | application-definition {definition_version} |

How the work is done today, how it will be done with the app, and what changes. Plain enough for the people who do the work to check it. Each section needs a Mermaid flowchart; each to-be step names the requirements (FR) it relies on.

## As-is
<Who does what today, in order, including hand-offs, waits and rework.>

```mermaid
flowchart TD
    A[Trigger] --> B[First step]
    B --> C[Last step]
```

## To-be
<The same work with the app: what people still do, what the app does for them.>

```mermaid
flowchart TD
    A[Trigger] --> B[First step]
    B --> C[Last step]
```

| Step | Who | What happens | Relies on |
|---|---|---|---|

## What changes
Change is removed, automated, changed or new. The saving is the expected time or errors saved, per occurrence or per period.

| Step | Change | Who does it now | Who does it then | Expected saving |
|---|---|---|---|---|

## Transition
How people get from the as-is to the to-be: what they need to know, when the old way stops, and who helps them in the first weeks. A personal tool may say `Not applicable: <reason>`.

| Item | What | Who | When |
|---|---|---|---|
| Training | <what each role needs to learn, and how: a demo, a one-page guide, help in the app> | | |
| Communication | <who is told what, and when> | | |
| Cutover | <when the old way stops; what happens to its data and records> | | |
| Support | <who helps in the first weeks, how people ask, and when it becomes normal support> | | |
