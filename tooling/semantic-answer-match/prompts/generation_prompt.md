# Generation prompt

Paste this into a ChatGPT conversation. Model: **GPT-5.6 Luna**, effort: **low thinking**
(see next_plan.md Appendix A.1 for why). Replace `{{SUBJECT}}` and `{{TOPIC}}` before
sending, and send one message per subject/topic pairing — don't ask for everything in one
message. Recommended batch size is 30–50 examples; asking for more in a single completion
risks repetition and quality drift towards the end.

Save the raw reply, verbatim, as a new file under `data/raw/llm_batches/`, named
`<subject>-<topic>.jsonl` (e.g. `biology-cell-structure.jsonl`). Don't edit the file by
hand first — `match-harness ingest` will report anything wrong with it, and hand-editing
defeats the point of having a validator.

---

You are generating training data for a short-answer matching classifier, not marking real
students. For UK GCSE-level {{SUBJECT}}, topic "{{TOPIC}}", produce 40 exam-style
short-answer question/answer pairs.

Output ONLY newline-delimited JSON — one compact JSON object per line, no markdown code
fences, no numbering, no commentary before or after. Each object must have exactly these
fields:

```
{"subject": "...", "topic": "...", "prompt": "...", "correct_answer": "...", "paraphrases": ["...", "..."], "wrong_answers": [{"text": "...", "reason": "..."}, ...]}
```

Field rules:

- `prompt`: a realistic short-answer exam question.
- `correct_answer`: the single canonical correct answer, one to two sentences, phrased the
  way a mark scheme would phrase it.
- `paraphrases`: 2–3 alternative phrasings of the SAME correct answer, using different
  wording or sentence structure, that a marker should also accept as correct.
- `wrong_answers`: 2–3 plausible INCORRECT answers that a real student might actually
  write, each with a short `reason` naming the specific misconception (e.g. "confuses
  mitochondria with the nucleus", "reverses cause and effect", "describes a related but
  different process"). These must be genuinely plausible near-misses a marker would need to
  think about, not random or obviously wrong statements.

Do not repeat the same question twice within the batch. Vary difficulty and phrasing.
