# Component Catalogue

<!-- Web-app projects only — skip for static sites, CLIs, pipelines, and agents. -->

A living reference for every reusable component/block in this project — what it does, what states it has, and where it's used. Update this whenever you add or change a block; it's the single place to check "what does this component do" instead of re-deriving it from the code each time.

Delete this instruction block and the example entry once you've got real components to list.

## How to add an entry

Copy the template below per component. Keep entries short — a few lines each is enough; this is a lookup reference, not a spec document.

```
#### <ComponentName>
- **Purpose:** What it does, in one sentence.
- **Variants:** Different flavours of the same component, if any (e.g. compact vs full).
- **States:** Loading, empty, populated, error, editing, disabled — whichever apply.
- **Data:** What it reads/writes, if applicable.
- **Permissions:** Who can see or use it, if that varies (skip for a single-admin project).
- **Accessibility:** Anything non-obvious — keyboard nav, labelling, focus handling.
- **Used on:** Which pages/blocks use this component.
```

---

## Example entry

#### DataTable
- **Purpose:** Sortable, filterable table for listing records of one entity, with a row action to open a record's detail.
- **Variants:** None yet — add one here if a second table shape emerges (e.g. a compact embedded table vs. the full-page one).
- **States:** Loading, empty ("No records yet"), populated, error.
- **Data:** Whatever entity the page is listing.
- **Permissions:** Not applicable at single-admin scale.
- **Accessibility:** Keyboard-navigable rows, accessible column headers.
- **Used on:** Dashboard, any record-list page.

---

## Catalogue

<!-- Add real entries below as you build blocks. Delete the example above once you have at least one real entry, or leave it as a reference — your call. -->
