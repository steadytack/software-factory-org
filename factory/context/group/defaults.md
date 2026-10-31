# Defaults: Organisation A (group)

Standing preferences. The factory recommends these and lists them at the gates as "answered from your defaults"; the approver for an idea's scope overrides per project when needed (recorded in the project's `decisions.md`). Mandatory rules are in `policies.md`, not here.

| ID | Topic | Default | Notes |
|---|---|---|---|
| DEF-01 | Tier | Tier 3, Business prototype, on the full route | The light route for an idea a small build answers faster: tier 1 Spike, tier 2 Exploration prototype; tier 4 Production app when it is to be relied on (`factory/standards/tiers.md`) |
| DEF-02 | Deployment | Hosted, in Docker (Compose), at every tier; developed and tested locally in the same containers | Host: {organisation sets it: which Docker host, who runs it, how an app gets there}. Until it is set, builds run locally in the same containers |
| DEF-03 | Authentication | A login for anything reachable by anyone but its builder; per-user accounts from tier 3 (real users) | Roles when the idea needs them; the organisation's identity provider once it is named in `system-landscape.md` |
| DEF-04 | Data store | PostgreSQL for `web-app`; SQLite for `streamlit-app` and `etl-pipeline`; none for static | |
| DEF-05 | Data retention | Keep until the owner deletes it; soft delete with a recycle bin where the template has one | |
| DEF-06 | Backups | Nightly database dump plus uploads where data matters; persistent volumes for anything that must survive a rebuild | |
| DEF-07 | Locale | UK English, UK dates, `Europe/London`, GBP, UK postcodes | |
| DEF-08 | Accessibility | Keyboard usable, visible focus, labelled inputs, 4.5:1 contrast, status never by colour alone | |
| DEF-09 | Brand and design | The brand in the idea's scope (`factory/context/brands/<x>/brand.md` and its `brand-kit` catalogue entry); unbranded when the idea has no brand; the template's design file as the design system otherwise | |
| DEF-10 | Testing | A test per requirement; an end-to-end journey for anything that crosses the UI; run the real stack before the audit | |
| DEF-11 | Third-party services | Only services the organisation has approved (list them here or in `group/system-landscape.md`); ask before anything that costs money, needs a key or sends data outside the organisation | Approved services: {organisation lists them} |
| DEF-12 | Offline | Not required unless the idea says so | |
| DEF-13 | Licence | From the scope's publish settings in `scopes.json` (`licence`, `copyright`): proprietary, copyright the legal entity, unless a business sets its own | `publish.py --fix` writes the matching LICENSE |
| DEF-14 | Repository visibility | Private | Public only on approval at Publish |
| DEF-15 | Stack | Whatever the chosen template uses; no extra frameworks without a requirement | |
| DEF-16 | Delivery | One epic for a small app; milestones of coherent epics otherwise | |
| DEF-17 | Question rounds | At most one round of the factory's questions in Develop and Assess and one in Spec; then recommend with stated assumptions | An owner-led working session (working the idea through) is not a round and has no limit |
| DEF-18 | One session per piece of work | A change request, an audit or a bug fix starts in a fresh session; its state lives in the files (`state.json`, `decisions.md`, `changes.md`, the gate file), not in the conversation. Every turn re-reads the whole conversation so far, so one long session is the main cost: measured on the DNO Outage Matcher, about 92 % of a 267-million-unit session was re-reading and re-saving the conversation (2026-10-27) | Resume with `/factory resume <slug>` |
| DEF-19 | Keep large output out of the conversation | Run checks so only the verdict and the failing lines come back (`verify.py` prints a short tail; `VERIFY_TAIL=n` for more); write long output to a file and read the part needed; search, then read a range, not a whole file; no whole-page text or whole API specs unless asked | What enters the conversation is re-read on every later turn |
| DEF-20 | Explore in a helper | A search across many files or logs that needs only a conclusion goes to a sub-agent that returns a short summary; the bulk never enters the main conversation (two helpers cost under 0.5 % of the DNO Outage Matcher session) | Not for work that needs the context already held |
| DEF-21 | Fewer, fuller turns | Independent steps go in one batch of tool calls; do not re-read a file just written or re-run a check that has not changed | |
| DEF-22 | Effort to the task | Routine edits, formatting and test runs do not need the deepest thinking or the largest model | |
