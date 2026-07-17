# Short-term model benchmark and selection

## Decision

`half-life-logistic-v1-lag64-count8` passes the Arc 3 quality gate and is selected. It has
lower overall chronological hold-out log loss and Brier score than FSRS-6, with no material
calibration regression in a major lag bucket. ACT-R also passes, but loses to the selected model
on both overall losses and is slower and stateful.

The gate was fixed before final comparison:

- a candidate must have strictly lower overall log loss and Brier score than FSRS-6;
- a major lag bucket contains at least 5% of scored hold-out events;
- an expected calibration error increase greater than 0.010 in a major bucket is material.

The major buckets were `<1m`, `1-10m`, `10-60m`, `6-24h` and `1-7d`. Neither candidate had a
material regression in any of them. (The `1-7d` bucket was later split into seven finer buckets;
see [Finer lag buckets and crossover location](#finer-lag-buckets-and-crossover-location-validation-phase-1)
below. Of the finer buckets, `24-36h`, `2-3d` and `3-4d` are major; the historical `1-7d` figures
above are retained for provenance and were not major-bucket-checked at this resolution.)

## Dataset and construction

- Dataset: `open-spaced-repetition/anki-revlogs-10k`
- Revision: `75299740cff05894ef42d7ad990666691efdd2da`
- Deterministic subset: user IDs 1–100 inclusive
- Source manifest SHA-256: `e90c4a921bc53a4867ea0bd5a4c9e6b8bffa91d4f0892d0f6d6fdac56c728174`
- Example manifest SHA-256: `4dcc7d9c0a56c88424458cf89addf50325cbdcb8a088d00ee31a69d4cafa693d`
- Source rows: 5,226,500
- Constructed rows: 5,169,502
- Training predictive events: 3,504,441
- Hold-out predictive events: 876,163
- Scored hold-out events at 0–604,800 seconds: 602,534
- Replayed but unscored hold-out events above seven days: 273,629
- Seed events: 788,898

Construction excluded 56,998 `state=4` events affecting 27,578 user/card pairs. The dataset card
documents only states 0–3; the excluded category covers manual/rescheduled and non-rescheduling
filtered-deck events that the upstream FSRS benchmark filters. The card itself was retained and the
next recorded lag was not recomputed. After state filtering, 9,928 retained events affecting 6,662
user/card pairs had durations above 60,000 ms. Those durations were winsorised to 60,000 ms; the
pre-clamp maximum was 1,000,000 ms. Outcomes and event order were retained.

The exact subset is a major generalisability limitation. It covers only 100 of 10,000 users, and
the source itself samples established users with at least 5,000 revlogs. It has no Lacuna session,
plan, hint or distraction provenance. Results must not be presented as population-wide evidence.

The dataset uses a custom licence. Raw data, constructed data and detailed JSON reports remain
private and ignored. The project owner explicitly accepted the licence consideration for committing
the compact selected coefficient artefact for later Lacuna runtime integration. That approval does
not permit redistribution of the source or derived event data.

## Aggregate results

Lower is better. Each cell is `log loss / Brier / ECE`.

| Slice | n | FSRS-6 | Half-life/logistic | ACT-R multi-trace |
|---|---:|---:|---:|---:|
| Overall | 602,534 | 2.661661 / 0.168646 / 0.135146 | 0.403582 / 0.128968 / 0.012202 | 0.435214 / 0.140129 / 0.024253 |
| `<1m` | 35,719 | 6.033819 / 0.291162 / 0.291162 | 0.499929 / 0.169794 / 0.044037 | 0.535743 / 0.184239 / 0.028704 |
| `1-10m` | 139,391 | 4.703920 / 0.226987 / 0.226987 | 0.427337 / 0.140988 / 0.031864 | 0.450312 / 0.149615 / 0.017713 |
| `10-60m` | 136,718 | 2.024307 / 0.097683 / 0.097683 | 0.256422 / 0.074579 / 0.044117 | 0.283952 / 0.082407 / 0.059577 |
| `1-6h` | 22,955 | 2.905139 / 0.140187 / 0.140187 | 0.306404 / 0.094986 / 0.022449 | 0.338323 / 0.103668 / 0.034066 |
| `6-24h` | 68,338 | 4.368267 / 0.210790 / 0.210790 | 0.448687 / 0.144180 / 0.020616 | 0.484558 / 0.157795 / 0.046093 |
| `1-7d` | 199,413 | 0.454182 / 0.143405 / 0.042184 | 0.466342 / 0.149241 / 0.025714 | 0.504602 / 0.163315 / 0.037518 |

FSRS-6 floors elapsed seconds to whole days, matching the current runtime dependency. It therefore
predicts almost certain recall inside a day. That is why its within-day log loss and calibration are
so poor; this is the baseline being replaced, not a doctored straw model.

## All required non-lag slices

| Slice | Value | n | FSRS-6 | Half-life/logistic | ACT-R multi-trace |
|---|---|---:|---:|---:|---:|
| first predictive review | first | 123,821 | 1.973766 / 0.100384 / 0.094263 | 0.251703 / 0.075328 / 0.016991 | 0.257984 / 0.076041 / 0.028619 |
| first predictive review | later | 478,713 | 2.839588 / 0.186302 / 0.145941 | 0.442866 / 0.142842 / 0.013929 | 0.481055 / 0.156706 / 0.025063 |
| previous outcome | failure | 196,359 | 6.052259 / 0.299466 / 0.296446 | 0.563417 / 0.190307 / 0.039501 | 0.601052 / 0.206059 / 0.033649 |
| previous outcome | success | 406,175 | 1.022529 / 0.105403 / 0.057168 | 0.326312 / 0.099315 / 0.011326 | 0.355042 / 0.108256 / 0.033652 |
| outcome history | failure only | 58,139 | 7.796158 / 0.380203 / 0.379077 | 0.632413 / 0.220546 / 0.006357 | 0.647168 / 0.227653 / 0.036202 |
| outcome history | mixed | 330,072 | 3.194698 / 0.209556 / 0.164597 | 0.502810 / 0.165689 / 0.021731 | 0.550217 / 0.183887 / 0.047990 |
| outcome history | success only | 214,323 | 0.447922 / 0.048254 / 0.025348 | 0.188689 / 0.047572 / 0.003615 | 0.200605 / 0.048997 / 0.037658 |

## Lag intersections

| Slice | Value | n | FSRS-6 | Half-life/logistic | ACT-R multi-trace |
|---|---|---:|---:|---:|---:|
| lag × first | `<1m` first | 4,240 | 2.018563 / 0.097406 / 0.097406 | 0.245502 / 0.075597 / 0.030523 | 0.260205 / 0.078092 / 0.056428 |
| lag × first | `<1m` later | 31,479 | 6.574645 / 0.317259 / 0.317259 | 0.534199 / 0.182481 / 0.045857 | 0.572856 / 0.198537 / 0.033084 |
| lag × first | `1-10m` first | 53,201 | 3.428623 / 0.165448 / 0.165448 | 0.367219 / 0.119481 / 0.010798 | 0.372706 / 0.120162 / 0.029361 |
| lag × first | `1-10m` later | 86,190 | 5.491100 / 0.264973 / 0.264973 | 0.464444 / 0.154263 / 0.046732 | 0.498216 / 0.167794 / 0.020874 |
| lag × first | `10-60m` first | 41,020 | 0.733549 / 0.035397 / 0.035397 | 0.118525 / 0.028016 / 0.021702 | 0.127840 / 0.028763 / 0.034432 |
| lag × first | `10-60m` later | 95,698 | 2.577578 / 0.124381 / 0.124381 | 0.315530 / 0.094538 / 0.055046 | 0.350868 / 0.105402 / 0.071286 |
| lag × first | `1-6h` first | 5,874 | 1.714591 / 0.082737 / 0.082737 | 0.209450 / 0.059028 / 0.019158 | 0.214284 / 0.059639 / 0.030367 |
| lag × first | `1-6h` later | 17,081 | 3.314558 / 0.159944 / 0.159944 | 0.339746 / 0.107351 / 0.028952 | 0.380979 / 0.118810 / 0.041874 |
| lag × first | `6-24h` first | 6,339 | 1.611701 / 0.077773 / 0.077773 | 0.207445 / 0.056084 / 0.021490 | 0.212190 / 0.057009 / 0.031755 |
| lag × first | `6-24h` later | 61,999 | 4.650108 / 0.224391 / 0.224391 | 0.473353 / 0.153188 / 0.022982 | 0.512406 / 0.168099 / 0.051504 |
| lag × first | `1-7d` first | 13,147 | 0.232034 / 0.059609 / 0.022845 | 0.242001 / 0.060751 / 0.047405 | 0.240702 / 0.060857 / 0.044350 |
| lag × first | `1-7d` later | 186,266 | 0.469862 / 0.149320 / 0.045591 | 0.482176 / 0.155487 / 0.029325 | 0.523228 / 0.170547 / 0.042762 |
| lag × previous | `<1m` failure | 28,657 | 7.424565 / 0.358272 / 0.358272 | 0.598667 / 0.206734 / 0.045872 | 0.640517 / 0.224719 / 0.025036 |
| lag × previous | `<1m` success | 7,062 | 0.390285 / 0.018833 / 0.018833 | 0.099259 / 0.019895 / 0.036588 | 0.110580 / 0.019975 / 0.043916 |
| lag × previous | `1-10m` failure | 91,101 | 6.912305 / 0.333553 / 0.333553 | 0.591270 / 0.202265 / 0.034347 | 0.620575 / 0.215137 / 0.009859 |
| lag × previous | `1-10m` success | 48,290 | 0.537715 / 0.025947 / 0.025947 | 0.118070 / 0.025387 / 0.027180 | 0.129105 / 0.026003 / 0.032863 |
| lag × previous | `10-60m` failure | 51,186 | 4.484251 / 0.216387 / 0.216387 | 0.486402 / 0.156320 / 0.074157 | 0.533955 / 0.174743 / 0.100339 |
| lag × previous | `10-60m` success | 85,532 | 0.552171 / 0.026645 / 0.026645 | 0.118792 / 0.025662 / 0.026170 | 0.134339 / 0.027150 / 0.035184 |
| lag × previous | `1-6h` failure | 8,843 | 6.214871 / 0.299898 / 0.299898 | 0.566957 / 0.192189 / 0.032170 | 0.605305 / 0.207760 / 0.040185 |
| lag × previous | `1-6h` success | 14,112 | 0.831163 / 0.040108 / 0.040108 | 0.143135 / 0.034075 / 0.023030 | 0.171024 / 0.038441 / 0.034020 |
| lag × previous | `6-24h` failure | 9,015 | 6.252610 / 0.301719 / 0.301719 | 0.571943 / 0.194077 / 0.051560 | 0.612028 / 0.210977 / 0.054316 |
| lag × previous | `6-24h` success | 59,323 | 4.081914 / 0.196973 / 0.196973 | 0.429957 / 0.136598 / 0.031201 | 0.465187 / 0.149713 / 0.048782 |
| lag × previous | `1-7d` failure | 7,557 | 0.671640 / 0.225060 / 0.146609 | 0.601308 / 0.207373 / 0.032377 | 0.652448 / 0.230118 / 0.026027 |
| lag × previous | `1-7d` success | 191,856 | 0.445616 / 0.140189 / 0.038071 | 0.461026 / 0.146951 / 0.026484 | 0.498778 / 0.160684 / 0.039176 |

Some small intersections regress despite the overall win. In particular, half-life/logistic is
worse than FSRS-6 for the `1-7d` first-review Brier score and for several success-only calibration
cells. Those are not major lag buckets under the pre-declared rule, so they do not fail the gate;
they remain explicit limitations rather than being buried in an overall average.

## Finer lag buckets and crossover location (validation phase 1)

The single `1-7d` lag bucket above was replaced in `stm_harness/metrics.py` with seven finer
buckets — `24-36h`, `36-48h`, `2-3d`, `3-4d`, `4-5d`, `5-6d`, `6-7d` — and all three candidates
were re-evaluated against the same hold-out. Sub-day buckets are unchanged and repeated here only
for context. This does not change the selected model; it locates where FSRS-6 starts to catch up,
for phase 2 (re-routing the handover boundary).

Of the seven new buckets, `24-36h`, `2-3d` and `3-4d` are major (≥5% of the 602,534 scored
hold-out events); `36-48h`, `4-5d`, `5-6d` and `6-7d` are not.

| Bucket | n | Share | Major? |
|---|---:|---:|---|
| `24-36h` | 39,583 | 6.57% | yes |
| `36-48h` | 20,363 | 3.38% | no |
| `2-3d` | 36,602 | 6.07% | yes |
| `3-4d` | 34,857 | 5.79% | yes |
| `4-5d` | 27,928 | 4.64% | no |
| `5-6d` | 21,225 | 3.52% | no |
| `6-7d` | 18,855 | 3.13% | no |

### Plain lag

Lower is better. Each cell is `log loss / Brier / ECE`.

| Slice | n | FSRS-6 | Half-life/logistic | ACT-R multi-trace |
|---|---:|---:|---:|---:|
| `<1m` | 35,719 | 6.033819 / 0.291162 / 0.291162 | 0.499929 / 0.169794 / 0.044037 | 0.535743 / 0.184239 / 0.028704 |
| `1-10m` | 139,391 | 4.703920 / 0.226987 / 0.226987 | 0.427337 / 0.140988 / 0.031864 | 0.450312 / 0.149615 / 0.017713 |
| `10-60m` | 136,718 | 2.024307 / 0.097683 / 0.097683 | 0.256422 / 0.074579 / 0.044117 | 0.283952 / 0.082407 / 0.059577 |
| `1-6h` | 22,955 | 2.905139 / 0.140187 / 0.140187 | 0.306404 / 0.094986 / 0.022449 | 0.338323 / 0.103668 / 0.034066 |
| `6-24h` | 68,338 | 4.368267 / 0.210790 / 0.210790 | 0.448687 / 0.144180 / 0.020616 | 0.484558 / 0.157795 / 0.046093 |
| `24-36h` | 39,583 | 0.533668 / 0.172797 / 0.086378 | 0.528509 / 0.173759 / 0.054542 | 0.572758 / 0.191622 / 0.088075 |
| `36-48h` | 20,363 | 0.501560 / 0.156727 / 0.085575 | 0.473812 / 0.152001 / 0.033201 | 0.506117 / 0.163963 / 0.037265 |
| `2-3d` | 36,602 | **0.478740 / 0.153315** / 0.057743 | 0.491027 / 0.159122 / 0.039123 | 0.533185 / 0.175118 / 0.047734 |
| `3-4d` | 34,857 | **0.420944 / 0.131618** / 0.021934 | 0.446958 / 0.140897 / 0.022368 | 0.482223 / 0.153134 / 0.023750 |
| `4-5d` | 27,928 | **0.396632 / 0.122580** / 0.017939 | 0.425334 / 0.132844 / 0.015389 | 0.464393 / 0.145942 / 0.016415 |
| `5-6d` | 21,225 | **0.407296 / 0.126624** / 0.025749 | 0.440629 / 0.139371 / 0.017825 | 0.481571 / 0.153471 / 0.022118 |
| `6-7d` | 18,855 | **0.387940 / 0.119608** / 0.025025 | 0.405364 / 0.126429 / 0.023499 | 0.431249 / 0.135912 / 0.033007 |

FSRS-6 first beats half-life/logistic on both log loss and Brier at `2-3d`, and stays ahead on
both metrics through `6-7d` (bold cells above). Below `24-36h`, half-life/logistic (and ACT-R)
remain ahead on both metrics, consistent with the whole-`1-7d` aggregate above being a blend of a
half-life win in the first ~2 days and an FSRS-6 win from day 2 onwards.

### Lag × previous outcome

| Slice | Value | n | FSRS-6 | Half-life/logistic | ACT-R multi-trace |
|---|---|---:|---:|---:|---:|
| lag × previous | `<1m` success | 7,062 | 0.390285 / 0.018833 / 0.018833 | 0.099259 / 0.019895 / 0.036588 | 0.110580 / 0.019975 / 0.043916 |
| lag × previous | `<1m` failure | 28,657 | 7.424565 / 0.358272 / 0.358272 | 0.598667 / 0.206734 / 0.045872 | 0.640517 / 0.224719 / 0.025036 |
| lag × previous | `1-10m` success | 48,290 | 0.537715 / 0.025947 / 0.025947 | 0.118070 / 0.025387 / 0.027180 | 0.129105 / 0.026003 / 0.032863 |
| lag × previous | `1-10m` failure | 91,101 | 6.912305 / 0.333553 / 0.333553 | 0.591270 / 0.202265 / 0.034347 | 0.620575 / 0.215137 / 0.009859 |
| lag × previous | `10-60m` success | 85,532 | 0.552171 / 0.026645 / 0.026645 | 0.118792 / 0.025662 / 0.026170 | 0.134339 / 0.027150 / 0.035184 |
| lag × previous | `10-60m` failure | 51,186 | 4.484251 / 0.216387 / 0.216387 | 0.486402 / 0.156320 / 0.074157 | 0.533955 / 0.174743 / 0.100339 |
| lag × previous | `1-6h` success | 14,112 | 0.831163 / 0.040108 / 0.040108 | 0.143135 / 0.034075 / 0.023030 | 0.171024 / 0.038441 / 0.034020 |
| lag × previous | `1-6h` failure | 8,843 | 6.214871 / 0.299898 / 0.299898 | 0.566957 / 0.192189 / 0.032170 | 0.605305 / 0.207760 / 0.040185 |
| lag × previous | `6-24h` success | 59,323 | 4.081914 / 0.196973 / 0.196973 | 0.429957 / 0.136598 / 0.031201 | 0.465187 / 0.149713 / 0.048782 |
| lag × previous | `6-24h` failure | 9,015 | 6.252610 / 0.301719 / 0.301719 | 0.571943 / 0.194077 / 0.051560 | 0.612028 / 0.210977 / 0.054316 |
| lag × previous | `24-36h` success | 37,005 | 0.528794 / 0.171368 / 0.085020 | 0.526886 / 0.172970 / 0.063131 | 0.571831 / 0.191104 / 0.092777 |
| lag × previous | `24-36h` failure | 2,578 | 0.603631 / 0.193305 / 0.105871 | 0.551811 / 0.185090 / 0.075830 | 0.586065 / 0.199059 / 0.070743 |
| lag × previous | `36-48h` success | 19,095 | 0.483830 / 0.150029 / 0.077533 | 0.463836 / 0.147632 / 0.033893 | 0.495045 / 0.158942 / 0.038303 |
| lag × previous | `36-48h` failure | 1,268 | 0.768561 / 0.257585 / 0.206686 | 0.624050 / 0.217793 / 0.052265 | 0.672850 / 0.239572 / 0.045532 |
| lag × previous | `2-3d` success | 35,026 | **0.469393 / 0.149701** / 0.053613 | 0.486004 / 0.156901 / 0.039919 | 0.527283 / 0.172390 / 0.048915 |
| lag × previous | `2-3d` failure | 1,576 | 0.686464 / 0.233626 / 0.149518 | 0.602655 / 0.208490 / 0.046067 | 0.664342 / 0.235757 / 0.039316 |
| lag × previous | `3-4d` success | 33,980 | **0.414402 / 0.129041** / 0.019148 | 0.442724 / 0.139066 / 0.022856 | 0.477103 / 0.150787 / 0.025871 |
| lag × previous | `3-4d` failure | 877 | 0.674424 / 0.231471 / 0.154933 | 0.610990 / 0.211849 / 0.057077 | 0.680590 / 0.244064 / 0.093657 |
| lag × previous | `4-5d` success | 27,474 | **0.391397 / 0.120470** / 0.019131 | 0.421310 / 0.131117 / 0.016222 | 0.460402 / 0.144144 / 0.017973 |
| lag × previous | `4-5d` failure | 454 | 0.713443 / 0.250263 / 0.146144 | 0.668858 / 0.237364 / 0.069690 | 0.705938 / 0.254763 / 0.094814 |
| lag × previous | `5-6d` success | 20,795 | **0.401912 / 0.124393** / 0.023531 | 0.435873 / 0.137304 / 0.016528 | 0.474827 / 0.150386 / 0.022840 |
| lag × previous | `5-6d` failure | 430 | **0.667680 / 0.234544** / 0.185657 | 0.670641 / 0.239300 / 0.163682 | 0.807713 / 0.302671 / 0.221523 |
| lag × previous | `6-7d` success | 18,481 | **0.381692 / 0.117151** / 0.024711 | 0.399901 / 0.124185 / 0.023065 | 0.426189 / 0.133758 / 0.031801 |
| lag × previous | `6-7d` failure | 374 | 0.696641 / 0.241039 / 0.147623 | 0.675293 / 0.237316 / 0.125535 | 0.681306 / 0.242371 / 0.128533 |

### Crossover points

- **Overall:** FSRS-6 first beats half-life/logistic on both log loss and Brier at **`2-3d`**
  (a major bucket), and holds the lead through `6-7d`.
- **After a previous success:** same as overall — FSRS-6 first wins both metrics at **`2-3d`**,
  and continues to win through `6-7d`. The success slice dominates each bucket's event count
  (35,026 of 36,602 at `2-3d`), so it is unsurprising that it tracks the overall crossover.
- **After a previous failure:** the failure slice is small at this lag range (1,576 events at
  `2-3d`, falling to 374 by `6-7d`) and the crossover is not clean. Half-life/logistic keeps a
  clear edge on both metrics from `24-36h` through `4-5d`; FSRS-6 wins both metrics at `5-6d`, but
  half-life/logistic wins both metrics again at `6-7d`. That reversal, together with the small `n`,
  reads as sampling noise rather than a genuine failure-side crossover in this range — there is no
  post-failure bucket in `24-36h`–`6-7d` where FSRS-6 reliably and consistently beats
  half-life/logistic on both metrics.

These figures feed phase 2 (re-routing the short-term/FSRS-6 handover boundary) and are not
themselves a change to the selected model or its coefficients.

## Frozen runtime contract

The selected coefficients are in `coefficients/half-life-logistic-v1.json`. Inputs are elapsed
seconds, preceding outcome, first-review state, prior success/failure counts and FSRS state. Counts
are capped at eight for model features. Missing, corrupt or out-of-range inputs fall back to FSRS-6.

The short-term probability replaces FSRS-6 through six days. From six to seven days a smoothstep
blend decays the short-term weight to zero; from seven days onwards the result is ordinary FSRS-6.
The probabilities are blended, not added, so the same evidence is not counted twice.

Personalisation is a later runtime concern. The frozen contract requires at least 500 scored local
examples before fitting only the intercept and preceding-outcome offsets. Those local terms use a
1,000-example shrinkage prior, giving local weight `n / (n + 1000)`. Below 500 examples, or if a
local fit is invalid, the global coefficients remain the explicit fallback. Full per-user
coefficient fitting is not supported by this evidence.

No neural model was needed. The selected artefact is ten scalar coefficients and adds no runtime
training, Python, Arrow or neural dependency to the browser bundle.

## Reproduction

Run from `tooling/short-term-memory`:

```sh
hf auth whoami
uv run stm-harness acquire data/source --users 1-100
.venv/bin/stm-harness build data/source data/examples \
  --holdout-fraction 0.2 \
  --minimum-train-examples 1 \
  --minimum-holdout-examples 1
.venv/bin/stm-harness evaluate data/examples \
  stm_harness.candidates.fsrs6:candidate reports/fsrs6.json --progress
.venv/bin/stm-harness evaluate data/examples \
  stm_harness.candidates.half_life:candidate reports/half-life.json --progress
.venv/bin/stm-harness evaluate data/examples \
  stm_harness.candidates.actr:candidate reports/actr.json --progress
.venv/bin/stm-harness select \
  reports/fsrs6.json reports/half-life.json reports/actr.json reports/selection.json
.venv/bin/pytest
```

The filesystem-observed acquisition window, from the first copied partition to source-manifest
completion, was 707 seconds. The successful clean example build took 46 seconds. Candidate timings
recorded by the harness were 95.298 seconds for FSRS-6, 102.523 seconds for half-life/logistic
(14.067 fit, 88.456 evaluation), and 148.235 seconds for ACT-R (68.317 fit, 79.918 evaluation).
Private detailed reports, including all ten-bin calibration cells, are `reports/fsrs6.json`,
`reports/half-life.json`, `reports/actr.json` and `reports/selection.json`.
