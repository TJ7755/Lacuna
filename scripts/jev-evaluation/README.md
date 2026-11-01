# Bounded Jev evaluation

Manual capped live evaluation for [#905](https://github.com/TJ7755/Lacuna/issues/905).
Independent reference marking and future bounded live results supply the evaluation evidence. Results
record agreement against those references, source versions, uncertainty, usage and latency.
The default pack contains four original 4BI1 temperature/pH explanation questions and six evaluation-written
answers per question: strong, partial, wrong, blank, off-topic and ambiguous. These are authoring
strata, not marks or diagnostic truth. There are 12 one-mark and 12 two-mark cases. Scope follows
[Pearson 4BI1 Issue 3](https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Biology/2017/specification-and-sample-assessments/international-gcse-biology-2017-specification1.pdf),
printed page 14, points 2.10, 2.11 and 2.13. An independent reviewer checks the science and rubrics
against those points before live use.

Questions and answers are original evaluation material. Keep them separate from #907 practice,
prompt examples and taxonomy tuning. Record separately reviewed remediation and fresh held-out
material when a change is informed by these cases.

## Prepare and label

Use the repository-pinned Bun revision. Export is offline and refuses an existing output directory:

```sh
bun scripts/jev-evaluation.ts export --out artifacts/jev-evaluation-reference-v1
```

For fresh held-out material, pass `--cases CASES.json` to **every** export, validate and live
command. This extends the same runner and metrics; it does not replace the acceptance policy.
The JSON array uses the existing `EvaluationCase` shape in `pack.ts`: unique `id`, `questionId`,
`answerType`, `stratum` and a validated allocation `request`. Packs are bounded to 1,000 cases.
The request's mark count must match its answer type: one mark is short-answer and larger
allocations are multi-mark. The acceptance policy now admits original extended answers up to
nine marks. This extends evaluation coverage only: it does not lower provider
confidence thresholds or qualify extended answers for pupil-facing diagnosis. The exported identity
binds the complete pack, policy and implementation; changed material requires a new independent reference record.
Each pack allows at most one request per case, sequentially, stopping at the first failure.

Keep development and held-out packs separate. Material inspected while changing prompts or
confidence thresholds is development evidence. Freeze the candidate before inspecting held-out
answers or results; a failed inspected pack cannot certify a later revision. Enough cases without
enough distinct questions or category outcomes still reports undersampling. Repeated contexts do
not establish independent population or transfer evidence.

The packet contains `blind.json`, `reference-record-template.json`, this protocol and a manifest. Its
identity hashes the cases, declared policy, provider/diagnostic code, taxonomy, runner and runtime
pins. Export again after changes; earlier labels cannot be reused with a changed identity.

Give the blind packet to an independent reference marker. Each record names its `reviewerId`,
`reviewReference` to the review evidence, `source` (`agent` or `human`), ISO UTC `completedAt`, and
`independent: true` and `contentApproved: true` attestations. All cases need a mark, three diagnostic
outcomes and a rationale. Agent records identify the model and review run. The report preserves
these records with the results so the basis of the measured agreement is explicit.

Assess knowledge, application and causal-link independently; several gaps may coexist. A lost mark
alone does not establish a cause:

- Knowledge: an explicit relevant false scientific claim is a gap, including a false conclusion
  about the case, even when another fact is correct. Demonstrated relevant knowledge without such
  a contradiction is no-gap; unexplained omission is insufficient evidence.
- Application: demonstrated knowledge used incorrectly in this setting is a gap; correctly applied
  knowledge is no-gap; otherwise use insufficient evidence. An application gap needs evidence
  separate from the false scientific claim already establishing a knowledge gap.
- Causal-link: relevant facts without the required causal connection can establish a gap. Incorrect
  knowledge, blanks and unexplained omissions cannot. Blank answers are insufficient in all categories.

Store the reference record in `{"reviews": [REFERENCE_REVIEW]}`. A second independent review can
be included. If the reviews disagree on a mark or category, retain both records and add a separate
independent `adjudication` record containing exactly the disputed cases. The exported template has
empty fields for the reviewer to complete.

```sh
bun scripts/jev-evaluation.ts validate --labels LABELS.json
```

Validation rejects absent/incomplete records, stale identity, duplicate/unknown cases,
invalid marks/categories, missing provenance and unresolved disagreements before any call.

## Live operation

Run manually with `live --pack PACK --labels LABELS.json --allow-paid --cap-usd 0.01 --out NEW_DIRECTORY`.
The workflow accepts the chosen pack, reference file, USD cap and optional tighter request count.
Configure the repository Actions secret `TYPESAFE_API_KEY`; never commit a key. No scheduled or
pull-request event runs paid evaluation.

Policy v6 pins exact model IDs jev-1.14.0 and jev-1.13.0 at $42 per billion input tokens,
with free output, reviewed against https://docs.typesafe.ai/models on 1 November 2026.
The models.md web fetch failed; the current model page agrees with the historical evidence.
Without the long-context header the provider enforces 64,000 input tokens per request.
The actual fetch boundary rejects that header case-insensitively and rejects unknown models.
This is a provider context bound, not a claim that bytes equal tokens. Each request reserves
$0.002688. The request budget is floor(cap / worst request cost), further limited by pack and
request count. Reservations are never recycled. The ledger records projected spend, reported
actual spend and conservative accounted spend; absent or invalid usage retains the full reservation.
A provider pricing or context-contract change requires review before running again.
Calls remain sequential with no retries, redirects or local cache, stopping at the first failure.
Results are saved before and after each request, including the reservation before transport.

Reports preserve reviews, disagreement/adjudication, provider decisions and per-case failures. They
show mark agreement/overmarks/undermarks among decided marks, errors over one mark, abstention,
unavailable cases, mixed gaps and per-category/outcome precision/recall. Recall includes unavailable
cases as missed predictions. Blank/off-topic/ambiguous strata stay separate. Counts, model/source
versions, actual known tokens, unknown-usage requests, latency and timeouts are retained. Currency
cost is unconfigured; #909 owns reviewed pricing. Failed calls may still be billable.

Multi-mark allocation now asks for an explicit mark-level Choice rather than rounding an expected
Score. The selected level must be a highest-probability authored option; its effective confidence is
the lower of the provider confidence and that option's probability. Marking and diagnostic cutoffs
remain separate. The marking policy uses 0.55 for one- and two-mark allocations and retains 0.85
for three- to nine-mark evaluation allocations. A marking pilot is separate from diagnostic qualification;
mark agreement does not establish the accuracy of practice advice. Neither a model confidence nor a development-set pass establishes accuracy on
fresh answers; the versioned candidate must pass the held-out screen before any access decision.

The predeclared screening policy requires 100 cases and 20 distinct questions per answer type,
30 gap/non-gap labels per category, Wilson 95% lower bounds of 0.90 for mark agreement and category
precision/recall, confident-error upper bound 0.05, abstention upper bound 0.20 and no unavailable
cases. Policy v2 additionally requires an observed mark-abstention rate of at most 5% per
answer type. That screen is stricter than the requested overall average. These are provisional screening criteria, not
calibrated guarantees. The default 24-case feasibility pack
cannot meet the sample minima and must report undersampling. Shared-question dependence makes the
intervals descriptive, not independent population estimates. Handwriting and typed recall remain unsupported. Extended responses and other subjects may be
evaluated for mark agreement; this does not qualify their diagnosis. Access decisions use the
recorded scope and sampling evidence. Reports never gate releases or access.

Direct-provider runs do not verify pupil-facing hosted throttling, errors, abstention or manual
fallback/overrides. Complete those workflow checks separately before accepting #905. Synthetic
`question-set-jev-unsure` and `jev-study` browser checks exercise the flows, not live accuracy.

Policy v3 records the maintainer's knowledge/application clarification above. Its statistical gates
are unchanged. Reference records from an earlier definition remain historical evidence; do not
silently relabel them or reuse inspected validation material to certify a tuned candidate.
Policy v4 accepts contextual failure to fit as failed binding, without supplying absent mechanisms.
Genuinely ambiguous literal/metaphorical readings give insufficient evidence in affected diagnostic
categories. Review reference consistency under these conventions before rebinding a packet identity.
Marking cutoffs distinguish one-mark, two-mark and three- to nine-mark evaluation allocations; the exported
manifest records the actual policy used. Client checks and cache identity use the same policy.

## Named packs and scope

Use `--pack NAME` consistently for export, validation and live execution. The legacy enzyme pack
remains the default. `secondary-development` and `secondary-held-out` each contain 24 original
cases across Chemistry (4CH1), Physics (0972), History (0977) and Religious Studies (8062),
with 1-, 3-, 6- and 8-mark allocations and all six authoring strata. They are marking-only packs;
independent content review and reference marks remain pending. Named development and held-out material is original evaluation writing;
specification references contain codes and titles only. Every new pack needs independent content
review and reference marking before live use. Authored answer strata are sampling labels, never
reference marks. Non-science material measures marking only: the science diagnosis taxonomy has
not been extended to other subjects. Diagnostic agreement must not be inferred from those cases.

Subject, mark-band and stratum breakdowns report counts and Wilson 95% uncertainty. Small cells
remain visible and undersampled. These intervals are descriptive because answers sharing a
question are dependent. Do not select a candidate by held-out results or reuse an inspected pack
as fresh held-out evidence. A changed pack or candidate requires a new bound reference identity.

## Manual GitHub Actions operation

The **Manual Jev evaluation** workflow has only `workflow_dispatch`; no schedule, push or pull
request event can launch paid calls. Select the reviewed candidate ref, supply its pack name,
a repository-relative independent reference JSON path at that ref, and an integer maximum paid
request count. The workflow validates references offline and then reaches the expected policy-v5
refusal. It cannot currently produce live results or incur evaluation API spend. No API secret
needs configuring while execution is disabled; this change creates or sets no secrets.

`--max-requests` limits attempts in the retained execution implementation, not currency spend.
The manual workflow stays disabled for paid execution until reliable monetary bounds exist.
Its summary identifies the refusal when no results exist; optional artefact retention is ready
for a future enabled run. Execution and reference errors fail the manual job. Offline export,
reference validation and fixture tests need no API secret and may run in ordinary CI.
No live evaluation was run to author these packs or this workflow.
