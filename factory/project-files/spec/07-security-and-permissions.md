# 07 Security and permissions

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-07 | 0.1 | draft | {date} | application-definition {definition_version} |

The baseline for tier {tier} is in the factory's `standards/security.md`; this document records what applies and any exception.

## Authentication
<How users prove who they are, or "Not applicable: reason".>

## Roles
| ROLE | Role | Who | Can |
|---|---|---|---|

## Permissions
| PERM | Action | Resource | Roles | FR | Enforced at | Test |
|---|---|---|---|---|---|---|

## Security and privacy requirements
| SEC | Requirement | Threat or reason | Verification | Source |
|---|---|---|---|---|

## Threats
STRIDE for each trust boundary (where data or a request crosses from one party or component to another: the browser to the API, the API to the database, the app to an outside system or model provider). Each threat names what answers it: a SEC, PERM or NFR, or a RISK in 09 accepted with its reason. Protection B and above list them; level A may say `Not applicable: reason`.
| Boundary | STRIDE | Threat | Mitigation |
|---|---|---|---|

## Secrets, exposure and audit
<Which secrets exist and where they live; what is exposed and to whom; which events are recorded.>

## Residual risks
<Point at RISK items in 09.>
