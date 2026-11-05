# Defaults: Organisation A (group)

Standing preferences. The factory follows these and lists them at the gates as "answered from your defaults"; the approver for an idea's scope overrides one per idea when needed (recorded in its `decisions.md`). Mandatory rules are in `policies.md`, not here. IDs are never reused: DEF-12, DEF-16 and DEF-19 to DEF-22 were retired or merged in factory 0.19.0.

| ID | Topic | Default | Notes |
|---|---|---|---|
| DEF-01 | Tier | None: chosen per idea, with a reason (`factory/standards/tiers.md`) | 1 Spike, 2 Prototype, 3 Production app |
| DEF-02 | Deployment | Docker (Compose) at every tier, developed and tested locally in the same containers | Host: {organisation sets it}. Until then, builds run locally |
| DEF-03 | Authentication | A login for anything reachable by anyone but its builder; per-user accounts when more than one person uses it | Set by the protection level (`factory/standards/security.md`) |
| DEF-04 | Data store | PostgreSQL (the `web-app` template) | |
| DEF-05 | Data retention | Keep until the owner deletes it | |
| DEF-06 | Backups | A nightly database dump where data matters; persistent volumes for anything that must survive a rebuild | |
| DEF-07 | Locale | UK English, UK dates, `Europe/London`, GBP | |
| DEF-08 | Accessibility | Keyboard usable, visible focus, labelled inputs, 4.5:1 contrast, status never by colour alone | |
| DEF-09 | Brand and design | Unbranded, on the template's design system | |
| DEF-10 | Testing | A test per requirement; an end-to-end journey for anything that crosses the UI | |
| DEF-11 | Third-party services | Only services the organisation has approved; ask before anything that costs money, needs a key or sends data outside | Approved services: {organisation lists them} |
| DEF-13 | Licence | From the scope's publish settings in `scopes.json`: proprietary unless a business sets its own | |
| DEF-14 | Repository visibility | Private; public only on approval | |
| DEF-15 | Stack | Whatever the template uses; no extra frameworks without a requirement | |
| DEF-17 | Question rounds | At most one round of the factory's own questions before Gate 1; then recommend with stated assumptions | A conversation the owner leads is not a round |
| DEF-18 | Working economy | One piece of work per session, its state in the idea's files, not the chat; keep large output out of the conversation (verdicts and failing lines, not whole logs); wide searches go to a helper that returns a summary; batch independent steps; match the effort to the task | Every turn re-reads the conversation so far, so one long session is the main cost. Resume with `/factory resume <slug>` |
| DEF-23 | Work in progress | At most 3 ideas per operator past Gate 1 and not finished | Operators are listed in `scopes.json` (`group.operators`). A Go beyond the limit is flagged in `ideas/pipeline.md` |
| DEF-24 | Integrations by tier | Spikes and prototypes connect to stand-ins: a fake built from the other system's schema with synthetic data, or its test environment. A live connection to a production system of record is tier 3 | A stand-in sits behind the adapter the live connection will use |
