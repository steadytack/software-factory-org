# Security baseline

`../context/policies.md` applies at every tier. This file sets the **protection level**, which follows what the app holds and who can reach it, not its tier (`tiers.md`): a spike on a real Internal sample, a business prototype with real staff and a production app with the same data and users are all protected at level B. Choose the highest level any of its data or users needs; a level never overrides a clear security, privacy or safety requirement in the spec.

| Level | When |
|---|---|
| **A** | Only its builder or a few named reviewers; synthetic or Public data |
| **B** | Internal data (real or a sample), or organisation users |
| **C** | Confidential or personal data (POL-11 conditions apply), or many users |
| **D** | Anyone outside the organisation (customers, the public), or money or regulated decisions |

| Area | A | B | C | D |
|---|---|---|---|---|
| Secrets | Env file, git-ignored | Same; generated per app; startup refuses placeholders | Same; rotation documented | Managed secret store |
| Authentication | Single login, or not reachable beyond the builder | A login; per-user accounts when more than one person uses it (the organisation's identity provider once named) | Per-user accounts; roles | Same, plus MFA where available |
| Authorisation | Admin-only writes | Server-side checks on every write | Role/action matrix enforced server-side and tested | Same, plus periodic review |
| Exposure | The Docker host only, behind its login | Reverse proxy, TLS, internal network only | Same, documented exposure | Same, plus monitoring |
| Input handling | Basic validation | Validate at the boundary; parameterised queries | Same, plus size and rate limits | Same, plus abuse testing |
| Audit trail | None | Change log where data matters | Who did what, when | Retained and reviewed |
| Dependencies | Pinned by the template | Pinned; known-vulnerability scan before Publish | Scan in CI | Scan in CI with a response process |
| Imported assets | Static review only | Static review; tests run in a container before approval | Same, plus licence review | Same, plus owner sign-off |
| Privacy | No real personal data | No personal data beyond names and work contact details, stated purpose (POL-09) | Privacy review before real data | Formal assessment where required |

The spec's `07-security-and-permissions.md` records the level, why, and any exception; the audit checks against it.
