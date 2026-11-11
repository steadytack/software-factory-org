# Audits

Prompts run in a fresh session against a built app, logged per `LOG_PROTOCOL.md` in the app's `audits/runs/`. Run them in this order; each reads the reports of those before it.

| Audit | When | For a spike |
|---|---|---|
| 1. [spec-conformance.md](spec-conformance.md) | **Mandatory** at the end of Build, before Gate 3; re-run after any change that touches built work. Reports five outcomes: verified, partially verified, not verified, failed, not applicable | Mandatory, against the card (`spike.md`): its question, success and stop criteria and the "In" list |
| 2. [refactor-hardening.md](refactor-hardening.md) | Required at tier 3; recommended for a prototype with Confidential or personal data, and before publishing anything public | Only if it holds real Internal or higher data, or is to be kept; the security and secrets steps, not the refactoring |
| 3. [data-integrity.md](data-integrity.md) | When the app stores, imports or queries data that matters | When the spike's answer rests on its numbers (a calculation, a match count), so the result can be trusted |
| 4. [ui-polish.md](ui-polish.md) | After UI work, for apps with a visual interface | Not for a throwaway spike; before a kept one is shown to others |
| [factory-retro.md](factory-retro.md) | Reviews the factory's run of the idea, not the app: offered at Gate 3 at tiers 2 and 3, run when asked. Writes `ideas/<slug>/retro.md` | Only on request |

At Gate 3, offer the audits the table calls for, with a one-line reason each; the approver chooses. An audit not run is reported "not run" (POL-03).

Licence and security reviews of imported assets are part of the catalogue importer (`catalogue/README.md`), not these prompts.
