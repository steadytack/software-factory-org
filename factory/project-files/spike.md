```json assessment
{
  "schema_version": 1,
  "slug": "{slug}",
  "version": "0.1",
  "period": "the time box",
  "data_classes": [],
  "one_thing": "<The one thing the spike must find out or settle first.>",
  "decision": {
    "recommended": "go",
    "reason": "<Why a small build answers the question faster than more research.>",
    "fix": [],
    "route": "light",
    "timebox": 1
  },
  "reassessments": []
}
```

# {name}: spike card

One page for a spike (tier 1, `factory/stages/light.md`). The block above is what the scripts read: the data classes (checked against POL-11), the one thing, the recommendation and the time box in person-weeks.

## Problem
<Who has the problem, what it costs them today, and where the evidence comes from (a link, a document or a person; with no source it is an assumption).>

## The question
<The one question the spike answers, and the answer that would settle it.>

## Success and stop
- **Success:** <what must be true, judged on evidence the build does not tune to (held-out cases, a judgement recorded before the build).>
- **Stop:** <any one of these stops the spike.>

## Time box
<Person-weeks, within how many calendar weeks, and what is in and out.>

## Data and protection
<Synthetic, a real sample or real data, as far as the data classes allow; the protection level (`factory/standards/security.md`); the template.>

## Data sources
<Each external source (a feed, an API, a file another system writes): its real sample under `source/` (from a test environment, or data the classes allow) and the fields used, read from the sample; or why no sample can be had yet, as a risk. "None" if the spike reads no outside data.>

## Challenge
<A fresh reviewer's strongest challenges, one line each, with what changed or why it was kept.>

## Sign-off
Not signed off yet. `pipeline.py decide` writes the approver's reply here.
