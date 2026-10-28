# Bounded Jev enzyme evaluation

Offline preparation and opt-in execution for [#905](https://github.com/TJ7755/Lacuna/issues/905).
Human content review, independent labels and live results are pending. Keep the issue open.
No result automatically widens hosted access; production prompts and thresholds are unchanged.

The pack contains four original 4BI1 temperature/pH explanation questions and six evaluation-written
answers per question: strong, partial, wrong, blank, off-topic and ambiguous. These are authoring
strata, not marks or diagnostic truth. There are 12 one-mark and 12 two-mark cases. Scope follows
[Pearson 4BI1 Issue 3](https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Biology/2017/specification-and-sample-assessments/international-gcse-biology-2017-specification1.pdf),
printed page 14, points 2.10, 2.11 and 2.13. The author checked that scope; independent human reviewers
must approve the science, rubrics and fit before live use. This is not exam-board endorsement.

No learner records, private practice questions or purported human labels are supplied. Keep this
material out of #907 practice, prompt examples and taxonomy tuning. A change informed by these cases
needs separately reviewed remediation and fresh held-out material.

## Prepare and label

Use the repository-pinned Bun revision. Export is offline and refuses an existing output directory:

```sh
bun scripts/jev-evaluation.ts export --out artifacts/jev-evaluation-human-v1
```

The packet contains `blind.json`, `human-record-template.json`, this protocol and a manifest. Its
identity hashes the cases, declared policy, provider/diagnostic code, taxonomy, runner and runtime
pins. Export again after changes; earlier labels cannot be reused with a changed identity.

Give two independent human science reviewers only the packet, without authoring strata, another
review or provider results. Each completes a separate template and records their `reviewerId`,
`approvalReference` to the maintainer's actual reviewer approval, ISO UTC `completedAt`, and truthful
`source: human`, `independent: true`, `contentApproved: true` attestations. All cases need a mark,
three diagnostic outcomes and a non-empty rationale. The operator verifies the people, independence
and approval reference; schema checks do not establish that a person exists. Keep completed review
records and results private. Synthetic test fixtures are never human accuracy evidence.

Assess knowledge, application and causal-link independently; several gaps may coexist. A lost mark
alone does not establish a cause:

- Knowledge: explicit incorrect knowledge is a gap; demonstrated relevant knowledge is no-gap;
  unexplained omission is insufficient evidence.
- Application: demonstrated knowledge used incorrectly in this setting is a gap; correctly applied
  knowledge is no-gap; otherwise use insufficient evidence.
- Causal-link: relevant facts without the required causal connection can establish a gap. Incorrect
  knowledge, blanks and unexplained omissions cannot. Blank answers are insufficient in all categories.

Combine the two original records in `{"reviews": [REVIEW_ONE, REVIEW_TWO]}`. A separate independent
human adjudicates every case with any mark/category disagreement, using the same record fields and
exactly those disputed cases; add that record as `adjudication`. Retain both original reviews.
Templates contain nulls and cannot pass validation. No signing keys or authority registry are needed.

```sh
bun scripts/jev-evaluation.ts validate --labels LABELS.json
```

Validation rejects absent/incomplete/non-human records, stale identity, duplicate/unknown cases,
invalid marks/categories, missing approval references and unresolved disagreements before any call.

## Live operation

After genuine human approval, use an approved TypeSafe account/budget and provide `TYPESAFE_API_KEY`
through the environment. Never put it in command arguments, committed files or logs.

```sh
bun scripts/jev-evaluation.ts live --labels LABELS.json --allow-paid --out artifacts/jev-evaluation-live-v1
```

The runner makes at most 24 sequential requests, no retries, 30 seconds each, with no redirects or
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

The predeclared screening policy requires 100 cases and 20 distinct questions per answer type,
30 gap/non-gap labels per category, Wilson 95% lower bounds of 0.90 for mark agreement and category
precision/recall, confident-error upper bound 0.05, abstention upper bound 0.20 and no unavailable
cases. These are provisional screening criteria, not calibrated guarantees. This feasibility pack
cannot meet the sample minima and must report undersampling. Shared-question dependence makes the
intervals descriptive, not independent population estimates. Handwriting, typed recall, extended
responses and other subjects are unsupported. No report authorises an access change.

Direct-provider runs do not verify pupil-facing hosted throttling, errors, abstention or manual
fallback/overrides. Complete those workflow checks separately before accepting #905. Synthetic
`question-set-jev-unsure` and `jev-study` browser checks exercise the flows, not live accuracy.
