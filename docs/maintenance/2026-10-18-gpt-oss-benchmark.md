# GPT-OSS benchmark, 18 October 2026

Status: blocked before generation. No GPT-OSS quality results have been measured.

The live Gateway catalogue lists nonzero input and output prices for both GPT-OSS models. The
user's requirement permits genuinely free inference, so free credits do not authorise those routes.
Groq account access was unavailable and the user chose to proceed without Groq. No paid request,
account provisioning or local model installation was attempted.

## Reproducible benchmark

[The harness](../../scripts/ai-benchmark.ts) fixes the provider to Groq and the models to
`openai/gpt-oss-120b` and `openai/gpt-oss-20b`. It requires `GROQ_API_KEY` and an explicit
`GROQ_FREE_PLAN_CONFIRMED=true` from the operator. Confirm that the key's organisation remains on
the Free plan before running; a model name or API key alone does not establish billing status.
There are no paid fallbacks or configurable endpoints.

```sh
bun scripts/ai-benchmark.ts --dry-run
bun --env-file=.env.groq.local scripts/ai-benchmark.ts --repetitions 2
bun run test scripts/ai-benchmark.test.ts
```

Keep the environment file local and ignored. Do not place credentials in chat, command arguments
or benchmark output. Results are written under ignored `artifacts/ai-benchmark/` with owner-only
file permissions. The harness records model, fixture, repetition, prompt/fixture fingerprint,
responses, tool arguments, token usage, finish reasons, request latency and errors. It saves after
each case. Requests are sequential, separated by at least 30 seconds per model, use no automatic
retries and stop testing a model following authentication, permission or rate-limit failures.

The four source-grounded synthetic cases cover factual errors amongst correct cards, duplicate
and ambiguous questions, missing evidence, and a course audit requiring both pages of local card
reads. Two cases are labelled calibration and two holdout; these labels separate the fixtures for
future prompt changes, rather than claiming statistical independence. Two repetitions produce
16 case results. The tool case may require several inference calls, each with the same 768-token
output ceiling and nine-step maximum as hosted chat. No student data or adversarial tests are used.

The harness reuses Lacuna's instruction bundle and real read-tool input schemas. Its synthetic
read adapter does not exercise the database, approval UI or deployed transport. Mechanical scores
check complete card coverage, gold verdicts, exact supporting quotations, required correction
terms, valid arguments and complete pagination. Full answers remain available for human review;
a matching keyword does not prove a useful correction. Any invalid or forbidden tool attempt fails
that case. This small benchmark cannot establish broad subject accuracy or twelve-user capacity.

## Evidence and limits

Offline validation passed: four scorer/tool-adapter tests, the dry-run fixture inventory, focused
TypeScript checking and ESLint. The tests reject missing cards, false positives, unsupported evidence, repeated
IDs, wrong courses, invented cursors, invalid arguments and writes. No quality percentages,
latency figures or token-capacity estimates are reported because neither GPT-OSS model ran.

Gateway pricing was checked at the [live model catalogue](https://ai-gateway.vercel.sh/v1/models).
Groq's [Free-plan limits](https://console.groq.com/docs/rate-limits) remain provider limits rather
than an application guarantee. OpenAI explicitly distinguishes
[basic compatibility checks from model accuracy](https://developers.openai.com/cookbook/articles/gpt-oss/verifying-implementations#quick-verification-of-tool-calling-and-api-shapes).
The earlier successful Gateway tool calls are smoke tests, not GPT-OSS benchmark evidence.
