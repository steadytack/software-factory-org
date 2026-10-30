# 07 Security and permissions

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-07 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

## Authentication
Not applicable: no accounts; the page runs in the owner's browser.

## Roles and permissions
Not applicable: one user, no server.

## Security and privacy requirements
| SEC | Requirement | Threat or reason | Verification | Source |
|---|---|---|---|---|
| SEC-001 | An imported file is parsed as data only, validated before use, and never executed | A hostile or broken file | TEST-003 | lens: data-and-integrations |

## Secrets, exposure and audit
No secrets; nothing is exposed beyond the browser; no audit trail needed.
