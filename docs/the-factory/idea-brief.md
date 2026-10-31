# The software factory: idea brief

The factory's own case, in the brief every idea gets. Every assumption is marked *(assumed)*.

## The idea
One AI-assisted production line that takes any staff idea from a five-question idea card to a working, audited app. AI does the drafting and the building, and people decide at four gates. Every idea, spec and app is built with the same guardrails, approach, policies, defaults and organisational context, from an approved list of technology. All of that is kept as versioned content that improves with every idea.

## Problem
- **Ideas outrun capacity.** Around 2,500 staff have far more ideas for better tools than an IT team of 120 can take on as projects. Most wait in a queue or are never raised *(assumed)*.
- **What does get built is built many ways.** Spreadsheets, stand-alone tools and one-off projects each use their own technology and their own idea of what is safe. That makes them hard to support, secure, integrate or retire *(assumed)*.
- **AI makes building faster, but on its own it makes the inconsistency worse:** more apps, built faster, each one different, with no shared guardrails and no memory of what worked.
- **Ideas are judged unevenly.** There is no common way to compare ideas, so investment follows whoever asks loudest rather than value *(assumed)*.

## Outcome and success measures
Good ideas get a fast, fair decision. Most are tried as a one-week spike, and the ones that work grow into supported apps, all built one way. Success measures:
- **Days from idea to decision (Gate 1):** a median of 14 days or fewer.
- **Spikes within their time box:** at least 3 in 4.
- **Ideas that reach a working spike or app:** a measure that rises each quarter.
- **Benefits delivered:** published apps meet their own success measures at the 90-day review in at least half of cases.
- **Consistency:** every app built on an approved template, with every gate recorded. Exceptions are counted, never hidden.

The factory reports the first two itself (`status.py`), and the benefits reviews report the fourth. Baselines for today are not yet measured *(assumed)*.

## How it's done today
An idea reaches IT through a manager, a ticket or a project request. It is weighed case by case, and if accepted it joins a project queue. Small ideas rarely qualify, so teams build workarounds themselves *(assumed)*. AI coding tools are used by individuals, each in their own way, with no shared rules, context or checks *(assumed)*.

**With the factory**, it works like this:
1. Anyone sends an idea card.
2. The factory drafts a brief and an assessment within days.
3. A named approver decides: go, go as a spike, get ready, or stop.
4. A spike is built in about a week.
5. It grows, is kept as it is, or stops.

Ideas that grow are specified, built epic by epic with tests, audited against their spec, and published on approval. They are reviewed after 30 and 90 days.

## Data
The factory's data is what it knows about the organisation:
- **Business context:** a large document exists, to be brought in by business so each idea reads only its own.
- **The system landscape as Architecture as Code:** it exists, but isn't connected to the factory yet.
- **Business processes as Architecture as Code:** being started.
- **Policies, defaults and the approved technology list:** all in the repository.

Data classes: Internal *(assumed for the business context and models; to be confirmed with their owners)*. The data-class policy already says which classes ideas may use and on what conditions. Apps use synthetic data, a sample or real data, as each idea's classes allow.

## Risk
The main risks, and the human judgement each needs:
- **The agent gets something wrong.** Independent challenge, deterministic checks, audits and four human gates exist to catch it. None of them is enough alone.
- **Gates become a rubber stamp or a bottleneck.** Approvers must actually read the one-page gate summaries. A work-in-progress limit of 3 ideas per operator protects their capacity.
- **Prototypes quietly become production.** Moving up a size is always a gate decision, and only production apps (tier 4) are handed to a supporting team.
- **Sensitive data leaks into a build.** The data-class policy is enforced by the scripts, and each app is protected for the data it holds and who can reach it, from one-week spikes to production apps.

## People and process
- **Owner:** the factory owner (the group gate approver until named), who also approves changes to the factory itself.
- **Users:** staff who send ideas, operators in IT who run the factory, gate approvers, architecture and process owners, and the teams that support production apps.
- **How it fits:** a weekly triage, a Gate 1 meeting every two weeks and a monthly report (`docs/operating-model.md`).
- **Today:** one person is operator and approver. Operators and approvers are still to be named.

## Strategic fit
It turns AI from individual experiments into an organisational capability, with consistency, safety and evidence built in. It reduces shadow IT, makes small improvements worth doing, and keeps the system landscape complete by offering every new app back to its architecture models.

## Assumptions and unknowns
- How many ideas arrive each month once it is open to staff *(assumed: 2 a month at first)*. If far more arrive, operators and approvers become the limit sooner.
- Whether a one-week spike suits most ideas *(assumed)*. The only template today, `web-app`, is heavy for a spike. A lighter template would make the fast route faster.
- No idea has been through the factory end to end yet. The first pilot gives the first real cycle times.
- The formats of the Architecture as Code models and how the factory gets access to them, which decide how soon the factory reads them directly.
