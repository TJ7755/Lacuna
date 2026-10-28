# Bounded Jev enzyme evaluation

This is the offline preparation and execution protocol for [#905](https://github.com/TJ7755/Lacuna/issues/905).
Human content approval, independent labels and live results are **pending**. Keep the issue open.
No result authorises wider hosted access. No production prompts, thresholds or authority change here.

The first pack contains four original 4BI1 enzyme explanation questions, each with six evaluation-written
answers: strong, partial, wrong, blank, off-topic and ambiguous. These are authoring strata, not marks
or diagnostic truth. Mixed-gap opportunities are included; only human labels establish whether gaps
coexist, and the report may still find none. There are 12 one-mark short answers and 12 two-mark answers. No learner records,
private practice pool, exam-board question text or model-generated labels were used as evidence.
Human reviewers must approve the scientific validity, level descriptors and syllabus fit before running.
The questions are unreviewed original material, not an Edexcel endorsement.

Do not import these questions, answers or labels into #907 practice, prompt examples or taxonomy tuning.
Question IDs group dependent cases; case IDs conceal authoring strata from reviewers. Give reviewers
only `blind.json`, `human-record-template.json` and this protocol, not `pack.ts` or provider results.
Reviewers who have inspected authoring strata or results must disclose that and be replaced for blind review.
Any later change informed by these cases needs a separately reviewed change and fresh held-out material.

## Prepare the human packet

Use the exact repository-pinned Bun revision. Commands default to offline operation:

```sh
bun scripts/jev-evaluation.ts export --out artifacts/jev-evaluation-human-v1
```

The new directory contains a blind question/rubric/answer sheet, an unsigned JSON label template,
the frozen protocol and a manifest. Exports refuse existing directories. Case ordering and identity
are deterministic. The identity hashes the pack, predeclared decision policy, provider/prompt code,
diagnostic policy, taxonomy definitions, runtime pin and dependency lockfile. Protocol or harness edits
invalidate earlier labels; export again after all edits. Preserve the manifest with the signed records.

Two independently authorised human science reviewers complete separate templates, without consulting
each other or a model. Set `source` to `human`, `independent` and `contentApproved` to `true` only when
those statements are true. Enter an authorised `reviewerId` and ISO UTC `completedAt`. Every case needs
an integer mark within its rubric, all three diagnostic outcomes and a non-empty evidence rationale.
Never infer a cause merely from a lost mark. Evaluate each dimension independently; mixed gaps are valid:

- Knowledge: `gap` requires explicit incorrect or missing scientific knowledge; `no-gap` requires
  demonstrated relevant knowledge; unexplained omissions give `insufficient-evidence`.
- Application: `gap` requires demonstrated knowledge applied incorrectly to this setting; `no-gap`
  requires correct contextual application; otherwise use `insufficient-evidence`.
- Causal-link: `gap` requires relevant facts or mechanism without the required cause-to-consequence
  connection; `no-gap` requires that connection; incorrect knowledge or unexplained omissions do not
  establish this gap. Blank answers give `insufficient-evidence` in every category.

Preserve both original reviews. A third independently authorised human adjudicator resolves every
case where any mark or category differs, recording the complete final label and a reason addressing
the disagreement. The adjudication payload has the same envelope fields but contains exactly the
disputed cases. Do not silently replace either review or turn disagreement into model consensus.

## Authorise and sign human records

The maintainer approves reviewer identities, independence from authoring/provider output, roles and
Ed25519 public keys through a recorded human approval. Keep private keys outside the repository.
Create an authority JSON document with `authorisationReference` pointing to that approval and
`reviewers` entries containing `id`, PEM `publicKey`, `role` (`reviewer` or `adjudicator`),
`human: true` and `independentOfAuthoringAndProvider: true`. Distinct identities and keys are required.
Obtain this document's SHA256 through the independent approval channel. Passing a hash computed from
an unreviewed local document does not authorise its contents. Cryptography proves key possession,
not humanity: the maintainer is responsible for checking the people and approval reference.

Each human signs their completed payload's **exact UTF-8 file bytes**, including any final newline,
with Ed25519 (for example, `openssl pkeyutl -sign -rawin -inkey PRIVATE_KEY -in RECORD.json -out SIGNATURE`).
Construct a labels JSON bundle with `reviews` containing two objects with `payload` (the exact file
contents encoded as a JSON string) and `signature` (base64 signature bytes). Add `adjudication` in the
same signed format when there are disagreements. Templates contain nulls and cannot pass validation.
No signing key, credentials or completed human labels are supplied by this pack. Automated fixtures
use disposable synthetic test keys and labels; they are never independent human accuracy evidence.

```sh
bun scripts/jev-evaluation.ts validate --labels LABELS.json --authority AUTHORITY.json --trust-sha256 APPROVED_HASH
```

This checks signatures, roles, source attestations, complete case coverage, mark bounds, category
labels, case identity and complete adjudication. Rejected or incomplete labels cause no network calls.

## Live operation, after human approval only

Use an explicitly approved TypeSafe account and paid-call budget. Supply `TYPESAFE_API_KEY` through
the environment using the existing credential procedure; never put it in files, command arguments or logs.

```sh
bun scripts/jev-evaluation.ts live --labels LABELS.json --authority AUTHORITY.json --trust-sha256 APPROVED_HASH --allow-paid --out artifacts/jev-evaluation-live-v1
```

There are at most 24 sequential requests, one case each, no retries, a 30-second deadline per request
and no redirects. The first timeout, provider/HTTP error or invalid response stops further requests.
No local cache is used; requests set `cache: no-store`; upstream cache behaviour remains unknown.
Rerunning requires a new output directory and a new explicit invocation. The runner saves before the
first call and after each result, retaining unrun cases. A killed process leaves the current request
marked `in-flight` with unresolved usage. Source changes
during a run invalidate it. Versions and hashes identify dirty-source runs independently of Git HEAD.

Reports preserve signed reviews, disagreements, adjudication, original provider decisions and
per-case failures. They report counts, mark agreement among non-abstained marks, overmarks,
undermarks, errors exceeding one mark, abstention, unavailable cases, mixed human gaps, full-mark
answers and precision/recall for each outcome in every category. Recall includes unavailable cases
as missed predictions. Blank/off-topic/ambiguous strata are shown separately, not pooled away.
Diagnostic `insufficient-evidence` is also reported as abstention, including correct abstentions.

The predeclared candidate criteria in `pack.ts` require at least 100 cases and 20 distinct questions
per answer type, with at least 30 gap and 30 non-gap labels per category. Wilson 95% lower bounds must
reach 0.90 for mark agreement and each outcome's category precision/recall; confident mark-error
upper bound must be at most 0.05, abstention upper bound at most 0.20, with no unavailable cases.
These are feasibility screening criteria, not calibrated safety guarantees. This pack cannot meet
the sample requirements. Shared-question dependence means intervals are descriptive, not independent
population estimates. Even a passing expanded subset requires independent review before access changes.
Handwriting, typed recall, extended responses and other subjects are unsupported here.

Actual known input/output tokens, unknown-usage requests, timeout counts, HTTP status and local
round-trip latency (p50/p95/max) are recorded. Error bodies and credentials are never persisted.
Currency cost is null: pricing is unconfigured and #909 owns a reviewed cost model. Counts do not
establish savings or a complete bill; failed requests may be billable with unknown usage.

Direct-provider runs do not exercise hosted rate limiting, pupil error states or manual fallback.
Before accepting #905, run the complete pupil flow for abstention, rate limits, errors and manual
mark overrides; preserve original receipts and confirm overrides do not become diagnostic evidence.
The existing `question-set-jev-unsure` and `jev-study` browser checks cover relevant synthetic flows,
not live accuracy. Record unsupported platforms and unavailable checks honestly. Review failures
individually and propose remediation separately; never tune the threshold simply to reduce abstention.
