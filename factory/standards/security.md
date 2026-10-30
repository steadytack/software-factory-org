# Security baseline

`../context/policies.md` applies at every tier. This file adds what each maturity tier expects; a lower tier never overrides a clear security, privacy or safety requirement in the spec.

| Area | Tier 1 Explore | Tier 2 Personal tool | Tier 3 Shared pilot | Tier 4 Operational |
|---|---|---|---|---|
| Secrets | Env file, git-ignored | Same; generated per app; startup refuses placeholders | Same; rotation documented | Managed secret store |
| Authentication | None if local only | Single login when anything is exposed beyond the machine | Per-user accounts; roles | Defined identity provider; MFA where available |
| Authorisation | n/a | Admin-only writes | Role/action matrix enforced server-side and tested | Same, plus periodic review |
| Exposure | 127.0.0.1 | 127.0.0.1 | Reverse proxy, TLS, documented exposure | Same, plus monitoring |
| Input handling | Basic validation | Validate at the boundary; parameterised queries | Same, plus size and rate limits | Same, plus abuse testing |
| Audit trail | None | Change log where data matters | Who did what, when | Retained and reviewed |
| Dependencies | Pinned by the template | Pinned; known-vulnerability scan before Publish | Scan in CI | Scan in CI with a response process |
| Imported assets | Static review only | Static review; tests run in a container before approval | Same, plus licence review | Same, plus owner sign-off |
| Privacy | No real personal data | Minimal personal data, stated purpose (POL-09) | Privacy review before real data | Formal assessment where required |

The spec's `07-security-and-permissions.md` records which row applies and any exception; the audit checks against it.
