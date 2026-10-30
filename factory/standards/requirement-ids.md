# Requirement IDs

Every item in a spec pack has a stable ID: `PREFIX-nnn` (three digits). Acceptance criteria hang off their story: `US-004-AC2`. IDs are never reused or renumbered; a removed item keeps its ID with status `withdrawn` (or `superseded`, naming what replaces it).

A table **defines** IDs only when its first header cell is the prefix (`| FR | ... |`). A table that merely lists items by ID (an entity's fields, a mapping) starts with another header, so its rows are references. A rule may instead be a heading: `## RULE-003 Name`.

| Prefix | Item | Defined in | Must link to |
|---|---|---|---|
| OBJ | Objective with a success measure | 02-product-definition | |
| JRN | User journey or workflow | 02-product-definition | an OBJ (recommended) |
| FR | Functional requirement | 03-functional-requirements | a JRN or OBJ; has a priority (Must, Should, Could) |
| RULE | Business rule, calculation or validation | 03-functional-requirements | an FR |
| SCR | Screen or page | 04-user-experience | the FRs it serves |
| NFR | Non-functional requirement | 05-non-functional-requirements | a threshold and a verification |
| DATA | Data entity | 06-data-model | the FRs that need it |
| REL | Relationship between entities | 06-data-model | two DATA items |
| ROLE | User role | 07-security-and-permissions | |
| PERM | Permission (action on a resource) | 07-security-and-permissions | the ROLEs allowed and the FR |
| SEC | Security or privacy requirement | 07-security-and-permissions | a verification |
| US | User story | 08-user-stories | the FR it satisfies, its EPIC; has at least one AC |
| AC | Acceptance criterion (`US-nnn-ACn`) | 08-user-stories | a verification (test intent or a TEST) |
| ASM, Q, RISK, DEP | Assumption, open question, risk, dependency | 09-assumptions-risks-decisions | a status, an owner, what it blocks |
| DEC | Decision | 09-assumptions-risks-decisions | rationale, date, who decided |
| CR | Change request | 09-assumptions-risks-decisions (and the project's `changes.md`) | the IDs it affects |
| CMP | Component of the architecture | 10-architecture-and-deployment | what it is built from (a CAT asset, custom, or external: a third-party component not yet catalogued) |
| INT | Integration: an outside system, or an interface between two components | 10-architecture-and-deployment | the FRs it serves |
| EPIC | Epic (a coherent, testable increment) | 11-delivery-plan | the FRs and stories it delivers |
| TEST | Planned test or check | 11-delivery-plan | what it verifies (AC, FR, NFR, SEC, PERM) |
| CAP | Required capability | 12-component-selection-and-gaps | the requirements it supports; a decision |
| CAT | Catalogue asset | `catalogue/assets/` (outside the pack) | referenced from CMP and CAP |

## Values that checks read
- **Priority:** Must, Should, Could.
- **Status** (open items): open, closed, accepted, withdrawn.
- **Blocks:** none, spec, build, release. An open item that blocks `spec` stops Gate 2.
- **Component decision** (CAP): reuse, adapt, build, import, redesign, defer.
- **Reuse scope** (CAP): project, catalogue (the new work is meant for the catalogue).

## Importing other IDs
A pack converted from another format, or built from a document with its own IDs, keeps a mapping: `spec/id-map.md` (`| Old ID | New ID | Note |`) for a converted pack, and `spec/source-map.md` (`| Source ID | Maps to | Status | Note |`, Status Mapped or Deferred with a reason) for an imported source. `check_spec.py` checks the source map.
