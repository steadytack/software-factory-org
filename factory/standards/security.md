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
| Dependencies | Pinned by the template; each new one vetted (below) | Pinned; known-vulnerability scan before Publish | Scan in CI; an SBOM published with the app | Scan in CI with a response process; an SBOM published with the app |
| Threats | None recorded | STRIDE per trust boundary in doc 07, each answered | Same | Same, plus abuse testing in the hardening audit |
| Imported assets | Static review only | Static review; tests run in a container before approval | Same, plus licence review | Same, plus owner sign-off |
| Privacy | No real personal data | No personal data beyond names and work contact details, stated purpose (POL-09) | Privacy review and DPIA screening before real data | A DPIA where the screening says so |

**Vetting a new dependency** (every level): before a package is added, confirm on its registry (PyPI, npm) that it exists under that exact name, is maintained (a release in the last year), widely used and from the publisher you expect; AI tools invent plausible package names, and an attacker may have registered one (slopsquatting). A name that does not resolve is never guessed at. Record it in `decisions.md` with what was checked. The **SBOM** (a software bill of materials, CycloneDX JSON, `sbom*.json` or `*.cdx.json` in the repository) is generated at Publish at levels C and D; `publish.py` refuses without one. **Threats** in doc 07 are STRIDE (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege) for each boundary where data or a request crosses between parties or components, each answered by a SEC, PERM, NFR or an accepted RISK; `check_spec.py` warns at levels B to D when there are none, or one is unanswered.

**Personal data and a DPIA:** before real personal data is used (the `data` choice is real or a sample, and the data classes include personal data), screen it for a data protection impact assessment: one is required for processing likely to be high risk (special category data, monitoring people, large scale, automated decisions with real effects, new technology such as a model at run time, UK GDPR article 35). Record the screening in doc 07 and, when one is required, the DPIA's owner and outcome as a DEP that blocks `release`.

An app that calls a model while it runs adds the controls in `ai-features.md` (prompt injection, output handling, tool permissions, data sent to the provider) at its level.

The spec's `07-security-and-permissions.md` records the level, why, and any exception; the audit checks against it.
