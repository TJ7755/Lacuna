# Semantic answer-match prototype (exploratory)

Offline harness for the Lane A prototype described in `next_plan.md` Appendix A.1: does a
small classifier over frozen sentence embeddings beat plain string comparison
(`src/utils/answerComparison.ts`) at recognising a correct paraphrase of a short,
canonical typed answer? This is not a committed feature and this directory is not imported
by the app, same convention as `tooling/short-term-memory`.

Steps 1–4 are implemented. Training downloads the frozen MiniLM model on first use; tests
inject a tiny embedder and never download model weights.

## Workflow

1. **Generate a batch.** Open a ChatGPT conversation on **GPT-5.6 Luna, low thinking
   effort**. Copy the prompt in [`prompts/generation_prompt.md`](prompts/generation_prompt.md),
   fill in a subject and topic, and send it. Save the reply verbatim as
   `data/raw/llm_batches/<subject>-<topic>.jsonl`. Repeat per subject/topic — each message
   is its own file; nothing merges them together yet.

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

Nothing downstream of `data/raw/examples.jsonl` exists yet.

## Train and evaluate

After ingesting a dataset, run from this directory:

```sh
uv sync
uv run match-harness train data/raw/examples.jsonl
uv run match-harness evaluate data/raw/examples.jsonl --held-out path/to/held-out.jsonl
```

The classifier is saved under `models/` and the JSON report under `reports/`; both are
gitignored. Evaluation uses a deterministic stratified 80/20 split and reports accuracy,
negative-class precision/recall, and the app's real lenient `compareAnswer()` baseline,
scored over the same 20% test split as the classifier so the two numbers are comparable.
The held-out file uses the same source-record JSONL schema and is evaluated separately.

### Cascade metric

The shipping architecture under consideration is not "classifier instead of
`compareAnswer()`" but a cascade: `compareAnswer()` runs first and an accept is final; the
classifier is only consulted when `compareAnswer()` rejects, and it can only overturn a
rejection into an acceptance, never the reverse. Because `compareAnswer()`'s accepts are
already near-perfectly safe (negative recall ~0.997 — it almost never accepts a wrong
answer), essentially all of the risk a shipped cascade would carry comes from the
classifier's overturns. The `"cascade"` section of the report captures exactly that:

- `pool_size` / `pool_positives` / `pool_negatives` — the ambiguous pool: test-split pairs
  `compareAnswer()` rejected, and their true label breakdown.
- `overturns` — how many pool pairs the classifier accepts (i.e. would overturn).
- `overturn_precision` — the headline number: of those overturns, the fraction that are
  genuinely correct (`label=1`). Every overturn is either a real paraphrase rescued or a
  wrong answer let through, and this is that trade's precision.
- `paraphrases_rescued` / `wrong_answers_admitted` — the same trade split by direction: of
  the pool's true positives, how many the classifier rescues; of the pool's true negatives,
  how many it wrongly admits (count and rate, each against the relevant pool subset).
- `cascade_overall` — accuracy / negative-class precision / recall of the full cascade
  (`compareAnswer()` accept OR classifier accept) over the whole test split, directly
  comparable against `"split"` (classifier alone) and `"baseline"` (`compareAnswer()`
  alone).
- `overturn_precision_by_kind` — `overturn_precision` broken down by `AnswerPair.kind`
  (`paraphrase` / `wrong` / `exact` / `case` / `punctuation`), so it's visible which kinds
  drive the rescues versus the wrongly-admitted answers.

This requires `scripts/compare_answer_baseline.ts` to emit its per-pair `predictions`
alongside its aggregate metrics (still returned under `"baseline"` in the report, with
`predictions` popped out before that section is written), so the classifier's predictions
can be partitioned by the baseline's verdict.

## Record schema

One JSON object per line:

```json
{
  "subject": "Biology",
  "topic": "Cell structure",
  "prompt": "What is the function of the mitochondria?",
  "correct_answer": "It produces energy (ATP) for the cell through respiration.",
  "paraphrases": ["Generates ATP for the cell via respiration."],
  "wrong_answers": [
    {"text": "It controls the cell's genetic material.", "reason": "confuses mitochondria with nucleus"}
  ]
}
```

`paraphrases` and `wrong_answers` are the point of using a model at all: deterministic
corruption (typos, case/punctuation noise, word-order shuffles) doesn't need one and will
be applied later in `match_harness`, not asked of the model. `wrong_answers.reason` isn't
consumed by anything yet — it's captured because it's cheap to ask for now and expensive to
reconstruct later, and it documents why a negative example was considered a plausible
near-miss rather than arbitrary noise.

## Why a chat session and not the API

Generation is manual — a subscription ChatGPT session, not a scripted API call — because
that's what the prompter already pays for at no marginal cost; see the chat discussion
recorded implicitly in `next_plan.md` Appendix A.1 for the reasoning. This is why ingestion
is a separate, explicit step rather than happening automatically: there is no generator to
call from Python, only pasted output to validate.

This also does not compromise Lacuna's local-first/no-cloud principle. That principle
governs what the shipped app calls at runtime; it says nothing about how a training corpus
gets assembled offline, on the prompter's own machine, before anything is frozen into a
model artefact.

## Tests

```sh
uv run pytest
```
