# Bounded Jev enzyme evaluation

Offline preparation and opt-in execution for [#905](https://github.com/TJ7755/Lacuna/issues/905).
Independent reference marking and bounded live results supply the evaluation evidence. Results
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
The request's mark count must match its answer type. The exported identity binds the complete
pack, policy and implementation; changed material requires a new independent reference record.
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

After independent reference marking, provide `TYPESAFE_API_KEY`
through the environment. Never put it in command arguments, committed files or logs.

```sh
bun scripts/jev-evaluation.ts live --labels LABELS.json --allow-paid --out artifacts/jev-evaluation-live-v1
```

The default pack makes at most 24 sequential requests, no retries, 30 seconds each, with no redirects or
local cache. It uses the existing single/allocation-batch provider entry points and stops after the
first failed call. New output paths prevent accidental overwrite. Results are saved before the first
call and after each case; interruption retains an in-flight request with unknown usage. Source
changes invalidate the run. Provider error bodies and credentials are never saved. Upstream caching
is unknown; reruns are explicit, separate invocations and may incur further cost.

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
for unsupported larger allocations. A marking pilot is separate from diagnostic qualification;
mark agreement does not establish the accuracy of practice advice. Neither a model confidence nor a development-set pass establishes accuracy on
fresh answers; the versioned candidate must pass the held-out screen before any access decision.

The predeclared screening policy requires 100 cases and 20 distinct questions per answer type,
30 gap/non-gap labels per category, Wilson 95% lower bounds of 0.90 for mark agreement and category
precision/recall, confident-error upper bound 0.05, abstention upper bound 0.20 and no unavailable
cases. Policy v2 additionally requires an observed mark-abstention rate of at most 5% per
answer type. That screen is stricter than the requested overall average. These are provisional screening criteria, not
calibrated guarantees. The default 24-case feasibility pack
cannot meet the sample minima and must report undersampling. Shared-question dependence makes the
intervals descriptive, not independent population estimates. Handwriting, typed recall, extended
responses and other subjects are unsupported. Access decisions use the recorded scope and sampling evidence.

Direct-provider runs do not verify pupil-facing hosted throttling, errors, abstention or manual
fallback/overrides. Complete those workflow checks separately before accepting #905. Synthetic
`question-set-jev-unsure` and `jev-study` browser checks exercise the flows, not live accuracy.

Policy v3 records the maintainer's knowledge/application clarification above. Its statistical gates
are unchanged. Reference records from an earlier definition remain historical evidence; do not
silently relabel them or reuse inspected validation material to certify a tuned candidate.
Policy v4 accepts contextual failure to fit as failed binding, without supplying absent mechanisms.
Genuinely ambiguous literal/metaphorical readings give insufficient evidence in affected diagnostic
categories. Review reference consistency under these conventions before rebinding a packet identity.
Marking cutoffs distinguish one-mark, two-mark and unsupported larger allocations; the exported
manifest records the actual policy used. Client checks and cache identity use the same policy.
