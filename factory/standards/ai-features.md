# AI features

Applies to an app that calls a language model (or another trained model) **while it runs**: to generate, extract, classify, summarise, answer questions, or act through tools as an agent. It is not about the assistant that builds the app. It applies at every tier, alongside `PRINCIPLES.md`, the stack standards and the protection level (`security.md`); copied into each app as `standards/ai-features.md`.

A model is an outside service that is sometimes wrong, can be steered by the text it reads, costs money per call and changes when its provider changes it. Each rule below follows from one of those.

## In the spec
When the idea uses a model at run time, Spec says so in the definition (the `data-and-integrations` and `security` lenses are active) and the pack carries:

| Doc | What it holds |
|---|---|
| 03 | Each model-backed behaviour as an FR, with RULEs for what output is acceptable (format, length, what it must never say or do) and what happens when the model is wrong, refuses, times out or is unavailable (a fallback the user can still work with) |
| 05 | An NFR for **quality** (the eval pass rate it must reach, below), for latency, and for **cost** (per use and a monthly cap) |
| 06 | What is stored from model calls (prompts, outputs, tool calls), for how long, and its data classes |
| 07 | SECs for prompt injection, output handling, tool permissions and the data sent to the provider (below); the provider's retention and training terms |
| 10 | The model adapter as a CMP; the provider as an INT; the model ID pinned |
| 11 | The eval set as a TEST, and when it runs |
| 13 | Each step where a person reviews or accepts the model's output, from the brief's Risk (where human judgement is needed) |

The provider is a third-party service: approved under DEF-11 before it is used. Only the data classes POL-11 allows may be sent to it, and the brief's Data section says which those would be.

## Rules
- **Behind an adapter** (`PRINCIPLES.md` 3): one module calls the provider; the rest of the app calls that module, so the provider, the model or a mock can be swapped in one place.
- **Pinned and versioned.** The model ID is pinned in configuration (never an alias such as "latest"). Prompts live in their own files under version control, each with a version that is logged with every call. A change to the model, the provider or a prompt is a change: the evals run again.
- **Output is untrusted input.** Validate it like anything a user types: parse it against a schema (structured output where the provider offers it), check it against the FR's RULEs, and reject or retry what fails. Never execute it, never render it as unescaped HTML, never put it into a query or a shell command; write it to storage only through the same validation as any other write.
- **Text the model reads is data, not instructions** (prompt injection). Content from users, documents, emails, web pages and tool results can contain instructions; the app's own instructions are kept apart from it, and nothing it says widens what the model may do.
- **Tools get the user's permissions, no more.** Each tool an agent can call checks permission server-side, as an API handler would; the prompt is never the control. An irreversible or outward-facing action (sending, paying, deleting, publishing) waits for a person to confirm it.
- **Human in the loop where the brief says judgement is needed:** the output is shown as a suggestion, a person accepts or corrects it, and who accepted is recorded where it matters (audit trail by protection level, `security.md`).
- **Minimum data out.** Send the provider only what the call needs; never secrets (POL-02); personal data only where POL-11 and the protection level allow it.
- **Limits.** A timeout and a bounded retry with backoff on every call; a per-user rate or token limit at protection B and above; the monthly cost cap from doc 05 enforced in code, with what happens when it is reached.
- **Logging:** the model ID, the prompt version, tokens, latency, tool calls and decisions (`PRINCIPLES.md` 4); prompt and output text only as the data classes allow, redacted otherwise.
- **Say what is generated** where a user could mistake it for a person's work or a checked fact.

## Evals
Tests prove the code; **evals** measure how good the model's answers are, which no unit test can.
- **The eval set:** realistic inputs, each with the expected output or the criteria a good answer meets, built from the FRs' RULE examples and ACs and kept in the app's repository. It includes hard and hostile cases: out of scope, empty, very long, ambiguous, and injection attempts (an input telling the model to ignore its instructions, reveal its prompt or call a tool it should not). Synthetic unless the data classes allow real records.
- **Size by tier:** tier 1, the handful the spike's question needs; tier 2, about 50, a fifth of them hostile; tier 3, as tier 2 plus a regression case for every failure seen in use.
- **Grading:** exact or rule-based checks wherever the output allows (fields, values, refusals); a model grader only with a written rubric, and a sample of its grades checked by a person.
- **When they run:** they call the real model, so they cost money and need the approved key (`testing.md`: an external service exercised because the test says so). They run before Gate 3 and after any change to the model, provider or a prompt. Below the doc 05 threshold is a failed requirement.
- **Unit and integration tests mock the model** for the paths around it: malformed output, a refusal, a timeout, the cost cap reached, an injection that tries to call a tool. Those run in the clean container with every other test.
- **Reported** in `verification.md`: the model ID, the prompt versions, the eval set's size, the pass rate against the threshold, the cost of the run, and the failures by kind.

## By protection level
The rules apply at every level; these are the additions (`security.md`).

| Level | Add |
|---|---|
| A | Evals on synthetic data; the cost cap |
| B | Hostile cases in the evals; tools checked server-side; per-user limits |
| C | No personal data to the provider unless POL-11 and a privacy review allow it; a person confirms every consequential output |
| D | Abuse testing in the hardening audit; output monitoring in use; a way for users to report a bad answer, each report becoming an eval case |
