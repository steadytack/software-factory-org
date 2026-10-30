# Stage 0: Triage

Many ideas in, the few that move the needle out. Knock out what cannot go ahead, score the rest with RICE, rank them, and let the owner pick which go to Analyse. Output: `ideas/triage.json` (the register, schema `factory/schemas/triage.schema.json`) and `ideas/triage.md` (generated). Ends at **Gate 0**.

Triage is light: minutes per idea, not an analysis. Nothing gets an idea folder until it is picked.

## Before you start
1. Read the policies for the scope the ideas are for (`python factory/scripts/scopes.py context --scope <scope>`; policies first), `factory/context/defaults.md` (DEF-11) and the template table in `analyse.md`.
2. Take the ideas in:
   - **A bulk list** (`/factory triage`): the owner puts ideas in `ideas/inbox.md`, one per line or bullet. `python factory/scripts/triage.py intake` adds every line not yet in the register as `new` (`TRI-nnn`); lines already there are skipped, so re-running is safe.
   - **A single idea** (`/factory triage <idea>`): `python factory/scripts/triage.py add "<idea>"`.
3. Work through every entry with status `new`, editing `ideas/triage.json`. Give each a short `title` if the generated one is poor. Set `scope` on an entry only when it differs from the register's.

## Knock-outs first
Record `data_classes` for every entry (the classes from the data-classes table, POL-11, that the idea would need; `[]` for none). Then knock an idea out, with `status: knocked-out` and a `knockout` of `rule`, `ref` and a one-line `reason`, when it:

| Rule | When | Ref |
|---|---|---|
| `data-class` | It needs a data class the scope's `policies.md` answers "no" for (POL-11). `triage.py` enforces this: a surviving entry that needs a barred class is a problem. A class allowed only on conditions (approval, synthetic data only) is not a knock-out: the condition is shown beside its score. | `POL-11` |
| `policy` | It cannot be done without breaking a policy | the `POL-nn` |
| `paid-service` | It needs a paid service, an account or a key that is not approved (DEF-11) | `DEF-11` |
| `duplicate` | It duplicates an existing idea, an approved catalogue asset or another entry (`python factory/scripts/catalogue.py search <terms>`; `status.py`) | `ideas/<slug>`, `CAT-nnn` or `TRI-nnn` (checked to exist) |

When in doubt, do not knock out: score it with low Confidence and say why.

## RICE for the survivors
`status: scored`, and `rice` with the four factors, each a `value` and a one-line `reason`:
- **Reach:** people or processes touched per `period` (one period for the whole register, `per month` by default).
- **Impact:** per person or process reached: 0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive.
- **Confidence:** a percentage: 100 backed by data, 80 a good argument, 50 a hunch; lower still for a wild guess.
- **Effort:** rough person-weeks to a first release, informed by the likely template (the table in `analyse.md`; record it in `template`) and the approved catalogue assets that would be reused (`assets`, `CAT-nnn`, checked to exist).

Score = Reach x Impact x Confidence% / Effort. The script computes it; never type a score in.

## Check and rank
`python factory/scripts/triage.py render` validates the register and writes `ideas/triage.md`: the ranked table (rank, score, factors, the reasons, conditions), then picked, parked and knocked-out ideas and anything not yet triaged. Ties are broken by higher Confidence, then lower Effort, then ID. Fix every problem it reports; `check_factory.py` checks the register too.

## Gate 0
Same protocol as every gate (the skill). The check is `triage.py render`. Write `ideas/gate-0.md` and show one page:
- **Done:** how many ideas came in, knocked out (by rule), scored; the check exactly as run; a link to `ideas/triage.md`.
- **Recommended:** the top of the ranking to take to Analyse now (usually one to three, by score and by what the owner can run at once), and what to park.
- **Decisions for you:** numbered: which ideas go to Analyse, which are parked; any knock-out the owner may want to overrule.
- **Answered from your defaults**, **Risks** (low-confidence scores, conditional data classes), **Next:** Analyse for each pick.

**Stop.** Accept `approve` (the recommendation), `accept all`, `pick TRI-nnn[, TRI-nnn]`, `park TRI-nnn`, `change 2 to B`, or free text for a change; ask again otherwise. On the reply:
1. Each picked idea: `python factory/scripts/triage.py pick TRI-nnn [<slug>] --reply "<the reply>"`. It scaffolds `ideas/<slug>/` (`scaffold.py new`), writes the idea and its triage record (RICE factors and reasons, data classes) into `idea.md`, records gate `0` `approved` (date, reply, `ideas/gate-0.md`) and `triage` in `state.json`, and marks the entry `picked`.
2. Each parked idea: `python factory/scripts/triage.py park TRI-nnn --reason "<why>"`. A parked idea can be picked at a later Gate 0.
3. Record the reply and date in `ideas/gate-0.md`; then `triage.py render` again.
4. Start Analyse for each picked idea in its own session (DEF-18): `/factory resume <slug>`.

An overruled knock-out: the owner says why; record it in the entry's reasons, set `status: scored` with RICE, and remove the `knockout`. A data-class knock-out cannot be overruled here: the policy changes first.
