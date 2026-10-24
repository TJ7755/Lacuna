# Semantic answer-match prototype (exploratory)

Offline prototype harness: does a
small classifier over frozen sentence embeddings beat plain string comparison
(`src/utils/answerComparison.ts`) at recognising a correct paraphrase of a short,
canonical typed answer? This is not a committed feature and this directory is not imported
by the app, same convention as `tooling/short-term-memory`.

## Workflow

1. **Generate a batch.** Open a ChatGPT conversation on **GPT-5.6 Luna, low thinking
   effort**. Copy the prompt in [`prompts/generation_prompt.md`](prompts/generation_prompt.md),
   fill in a subject and topic, and send it. Save the reply verbatim as
   `data/raw/llm_batches/<subject>-<topic>.jsonl`. Repeat per subject/topic.

2. **Validate and merge.**

   ```sh
   uv sync
   uv run match-harness ingest data/raw/llm_batches data/raw/examples.jsonl
   ```

   This validates every line of every batch file against the schema in
   `match_harness/schema.py`, drops cross-batch duplicate prompts (a chat model has no
   memory of what a previous message already asked for, so repeats across batches are
   expected, not a bug), and writes one clean, merged dataset. It reports invalid lines and
   duplicates to stderr rather than silently dropping them — if a batch has a formatting
   problem, re-generate that one batch rather than hand-editing the JSON.

3. **Inspect the summary line** (`N accepted, N invalid lines, N duplicates dropped`)
   before treating a batch as usable. A high invalid-line count usually means the model
   drifted from the requested format partway through a long completion — regenerate with a
   smaller batch size next time.

The committed held-out set (`data/held_out/tricky_paraphrases.jsonl`) exists to break the
circularity of testing GPT-generated pairs against a model trained on GPT-generated pairs:
it is deliberately adversarial, targeting negation, reversed cause and effect, and
substituted terms — cases where an answer is maximally similar to the mark scheme and
flatly wrong. Two caveats travel with any number computed from it. It was drafted by a
different model rather than hand-written, so it is a second opinion from another model
family, not the human-judged set Appendix A.1 Step 4 asks for; its labels have not been
reviewed by a person. And it is a stress test, not a representative sample — every case is
chosen to be hard, so its error rates are a worst case and not what production traffic
would look like.

### Cascade metric

The shipping architecture under consideration is not "classifier instead of
`compareAnswer()`" but a cascade: `compareAnswer()` runs first and an accept is final; the
classifier is only consulted when `compareAnswer()` rejects, and it can only overturn a
rejection into an acceptance, never the reverse. Because `compareAnswer()`'s accepts are
already near-perfectly safe (negative recall ~0.997 — it almost never accepts a wrong
answer), essentially all of the risk a shipped cascade would carry comes from the
classifier's overturns.

## Why a chat session and not the API

Generation is manual — a subscription ChatGPT session, not a scripted API call — because
that's what the prompter already pays for at no marginal cost. This is why ingestion
is a separate, explicit step rather than happening automatically: there is no generator to
call from Python, only pasted output to validate.

This also does not compromise Lacuna's local-first/no-cloud principle. That principle
governs what the shipped app calls at runtime; it says nothing about how a training corpus
gets assembled offline, on the prompter's own machine, before anything is frozen into a
model artefact.
