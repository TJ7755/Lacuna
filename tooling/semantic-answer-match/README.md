# Semantic answer-match prototype (exploratory)

Research question: can semantic matching recognise correct paraphrases of short,
canonical typed answers more accurately than plain string comparison?

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
