# Lens: testing, deployment and operations

**Activate:** when it runs as a service or a scheduled job (tier 3 and above).

- How is it started, stopped, updated, backed up, restored and reset? Where does its data live?
- How is it triggered (for jobs): schedule, file arrival, manual? What are the retry, idempotency and rerun rules?
- Who notices when it breaks, and how (logs, a status page, an alert)?
  - If the app runs where nothing outside can reach it (ports bound to 127.0.0.1, no hosting yet), an outside poller can't watch it. Offer the web-app template option `heartbeat`: the app pings a dead-man's-switch service (healthchecks.io, an Uptime Kuma push monitor) while healthy, and that service alerts when the pings stop. `HEARTBEAT_URL` is set in `.env`; empty means off.
- What is run against the real stack before the audit, and what only in tests?

**Feeds:** `05-non-functional-requirements.md`, `10-architecture-and-deployment.md`, `11-delivery-plan.md` (test approach).
