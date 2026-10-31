# Lens: testing, deployment and operations

**Activate:** when it runs as a service or a scheduled job (tier 3 and above).

- How is it started, stopped, updated, backed up, restored and reset? Where does its data live?
- How is it triggered (for jobs): schedule, file arrival, manual? What are the retry, idempotency and rerun rules?
- Who notices when it breaks, and how (logs, a status page, an alert)?
- What is run against the real stack before the audit, and what only in tests?

**Feeds:** `05-non-functional-requirements.md`, `10-architecture-and-deployment.md`, `11-delivery-plan.md` (test approach).
