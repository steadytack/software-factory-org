# Lens: data and integrations

**Activate:** when data is stored, imported, exported or exchanged with another system.

- What does it store? Where does each piece come from, and what is the source of truth? (The system landscape, AaC, says which system holds what: `context/group/system-landscape.md`.)
- What is personal or sensitive? Why is it needed and how is it removed (POL-09)?
- How long is it kept? What must never be lost (volumes, backups)?
- Which outside systems does it read from or write to (`system-landscape.md`)? In what format, how often, and what happens when one is down or slow?
- Which calculations, orderings, limits or validations are not obvious? What is the exact rule, with an example, and the tie and empty cases?

**Screening (Develop and Assess, every idea):** for the **Data Foundations** foundation. Lots of data is not the same as ready data.
- Does the data it needs exist today? Where is it kept, and who owns it (`system-landscape.md`, reference cards)?
- Is it ready: complete, accurate, current and consistent enough to rely on? What evidence says so, beyond its volume?
- Can it be reached: an export or interface that exists, or one that would have to be built or bought (DEF-11)?
- Which data classes does it involve (POL-11), and does any need approval or synthetic data only?

**Feeds:** `06-data-model.md`, `03-functional-requirements.md` (rules), `10-architecture-and-deployment.md` (integrations).
