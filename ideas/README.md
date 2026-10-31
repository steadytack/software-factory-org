# Ideas

One folder per idea, created by the factory (`/factory <idea>` in Claude Code). Each holds its `state.json`, idea brief, assessment, overview, Application Definition, decisions, changes, gates, spec pack and `app/` (its own git repository, ignored here). The table is refreshed by `python factory/scripts/status.py --write`.

Ideas come in through `inbox.md` (one per line) or `inbox.csv`: a form tool's export of idea cards (`factory/project-files/idea-card.md`), with the columns `title`, `problem`, `who`, `today`, `better` and `data`. Other columns are ignored and never stored, and `inbox.csv` is git-ignored because a form's export may hold submitters' names or emails. `python factory/scripts/pipeline.py capture` adds every line and row not yet captured.

<!-- status:start -->
<!-- status:end -->
