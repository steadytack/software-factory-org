# Audits

Prompts run in a fresh session against a built app, logged per `LOG_PROTOCOL.md` in the app's `audits/runs/`.

| Audit | When |
|---|---|
| [spec-conformance.md](spec-conformance.md) | **Mandatory** at the end of Build, before Gate 3, as written; re-run after any change request that touches built work. Reports the five outcomes: verified, partially verified, not verified, failed, not applicable |
| [refactor-hardening.md](refactor-hardening.md) | Recommended before Publish, and at tier 3 and above |
| [data-integrity.md](data-integrity.md) | When the app stores, imports or queries data that matters |
| [ui-polish.md](ui-polish.md) | After UI work, for apps with a visual interface |

Licence and security reviews of imported assets are part of the catalogue importer (`catalogue/README.md`), not these prompts.
