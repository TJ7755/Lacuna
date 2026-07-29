# Offline short-term memory harness

This directory contains the Arc 3 offline dataset, candidate and evaluation tooling. It is an
independent Python project and is not imported by the browser or Electron builds. Arc 3 Task 6
selected a compact short-term model; see [`BENCHMARK.md`](BENCHMARK.md).

## Dataset and licence

The source is
[`open-spaced-repetition/anki-revlogs-10k`](https://huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k),
the current corpus used by the
[`srs-benchmark`](https://github.com/open-spaced-repetition/srs-benchmark) project. The
dataset contains 727,738,650 review events from 10,000 anonymised Anki collections and has
DOI `10.57967/hf/3435`. Acquisition is pinned to dataset revision
`75299740cff05894ef42d7ad990666691efdd2da`; the benchmark source inspected for this work was
revision `70cc4387f573ff20b13ac9c106333a335c8a4cb8`.

Only `revlogs/user_id=*/data.parquet` is required. Each partition supplies chronological
rows containing card ID, rating, learning state, response duration and elapsed seconds since
that card's preceding review. It does not contain card content or absolute timestamps. The
per-card lag is nevertheless retained at the elapsed-second resolution required by the Arc
3 model contract. The source sample includes only collections with at least 5,000 revlogs,
so it over-represents established Anki users. It has no session, plan, hint or distraction
fields; those provenance features can only enter later local adaptation once Lacuna has
collected them, not the global fit from this corpus.

The dataset uses a
[`anki-revlogs-10k` custom licence](https://huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k/blob/main/LICENSE),
not a permissive open-data licence. It permits FSRS memory research and research by
individuals or university students, forbids public redistribution of the data, and requires
Anki's permission for other contexts. Tom approved local download and benchmark compute for
this work. The project owner subsequently accepted the licence consideration for committing
the selected compact coefficient artefact for later Lacuna runtime integration. That approval
does not amend the upstream licence or permit data redistribution. Raw and constructed datasets
remain private; the local `.gitignore` excludes `data/` and `reports/`.

The Hugging Face repository is gated. Before acquisition, sign in, accept its access terms,
and authenticate with `hf auth login` or set `HF_TOKEN`.

## Setup and acquisition

From this directory:

```sh
uv sync
uv run stm-harness acquire data/source --users 1-100
```

User selection is explicit and deterministic. `--users` accepts comma-separated IDs and
inclusive ranges. A full acquisition uses `--users 1-10000` and downloads roughly the
revlog share of the 15.7 GB repository. The command writes `data/source/manifest.json` with
the resolved revision, DOI, acquisition time, file sizes and SHA-256 hashes. Destinations
must be new or empty so a smaller later run cannot silently inherit stale partitions. Use a
new run directory when changing the revision or user set.

The Task 6 benchmark uses exactly users 1–100 inclusive. This 100-user subset is a serious
generalisability limitation, not a miniature proxy for all 10,000 users. It is also biased towards
established learners because the source includes only collections with at least 5,000 revlogs.

## Chronological examples

```sh
uv run stm-harness build data/source data/examples \
  --holdout-fraction 0.2 \
  --minimum-train-examples 1 \
  --minimum-holdout-examples 1
```

The builder requires the acquisition manifest and verifies every selected source hash; it
will not glob an incomplete download and pretend that was the requested population. It makes
two bounded-batch passes per user, then writes output batches incrementally rather than
materialising the entire corpus in Python objects.

One derived Parquet partition is written per user. Source row order is the timestamp order;
`source_index` retains that order as a stable tie-breaker. The last 20 per cent of each
user's predictive events form the hold-out suffix. The boundary is global to the user, not
per card, so future learner behaviour cannot leak into training. Seed events are replayed as
context but are not scored. Cards whose first available event is not a seed, or which contain
a second seed, are excluded and counted rather than given invented history.

Each row contains the current event plus features derived strictly from earlier events:

- exact integer `elapsed_seconds`, including zero-second events;
- rating, binary recall (`rating > 1`), state and response duration;
- per-card review index and prior review, success and failure counts;
- preceding outcome;
- whether this is the first predictive review after the seed event;
- chronological `train` or `holdout` assignment.

The source contains undocumented `state=4` events. Construction excludes those individual events,
counts them and retains the rest of each affected card. This matches the upstream benchmark's
exclusion of manual/rescheduled and non-rescheduling filtered-deck events. Durations above 60,000
ms are retained but winsorised to 60,000 ms, also with explicit counts, because deleting slow
reviews would bias the outcomes. Ratings, lags and order are never rewritten.

The Parquet row retains the current outcome for fitting and post-prediction observation, but
the evaluator's `PredictionContext` does not expose rating, recall or response duration.

Zero-second follow-ups belong to `<1m`. Events beyond seven days remain in the replay so a
candidate's state stays complete, but they are excluded from the short-term aggregate and
reported separately.

## Candidate plug-in contract

The evaluator loads `module:attribute`. The attribute is either a candidate object or a
zero-argument factory. A candidate implements the protocols in `stm_harness.contract`:

1. `fit(training_events)` receives the complete training-prefix event streams, including
   unscored seed events, and returns frozen fitted coefficients.
2. `new_predictor(user_id)` returns empty state for one chronological user replay.
3. `predict(context)` receives only pre-attempt fields and returns recall probability. The
   current rating, recall label and response duration are deliberately inaccessible.
4. `observe(example)` consumes the event once.

Large trainable candidates may implement `fit_batches(training_batches)` instead of `fit`.
It receives Arrow record batches already restricted to training prefixes, avoiding a Python
object allocation for every event in the 727.7-million-row corpus. Stateful evaluation
remains sequential because event order is part of the model contract.

The harness fits on training events only, then replays every user's full sequence. It
scores only hold-out events while preserving the training prefix and unscored events as
state. This accommodates scalar half-life models and stateful multi-trace models without
putting candidate code in the harness.

The fitted candidate's `name` is the report identifier and must include the candidate
version and material configuration. Reports also bind results to the constructed-manifest
SHA-256, source revision, selected user IDs and split settings.

```sh
uv run stm-harness evaluate data/examples package.module:candidate reports/candidate.json
```

The implemented candidates are:

- `stm_harness.candidates.fsrs6:candidate`: the current FSRS-6 default short-term treatment;
- `stm_harness.candidates.half_life:candidate`: elapsed-time logistic half-life with recent outcomes;
- `stm_harness.candidates.actr:candidate`: ACT-R/Pavlik-Anderson power-law multi-trace activation.

Apply the pre-declared selection gate with:

```sh
uv run stm-harness select \
  reports/fsrs6.json reports/half-life.json reports/actr.json reports/selection.json
```

The selected frozen coefficients are in
[`coefficients/half-life-logistic-v1.json`](coefficients/half-life-logistic-v1.json). Training and
evaluation code remains offline; no Python, Arrow or neural dependency enters the browser bundle.

## Metrics and slices

Reports contain binary log loss, Brier score and ten-bin equal-width expected calibration
error. Every slice includes sample count, positive rate and the underlying calibration-bin
statistics; an empty slice has null metrics rather than a dishonest zero.

The lag buckets are half-open except that seven days is included:

- `<1m`: 0–59 seconds
- `1-10m`: 60–599 seconds
- `10-60m`: 600–3,599 seconds
- `1-6h`: 3,600–21,599 seconds
- `6-24h`: 21,600–86,399 seconds
- `1-7d`: 86,400–604,800 seconds

The report also splits results by first predictive review, preceding success/failure,
success-only/failure-only/mixed history, and lag intersections with first-review and
preceding-outcome status. Task 6 can therefore compare a candidate with FSRS-6 overall and
detect calibration regressions hidden inside a major bucket. The numerical threshold for a
"material" regression is deliberately not invented here; model selection owns that gate.

## Tests

```sh
uv run pytest
```

Tests use synthetic Parquet partitions. They do not download or redistribute upstream data.
