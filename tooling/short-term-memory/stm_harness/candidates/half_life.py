from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable

from ..contract import Example, PredictionContext
from .common import (
    MAXIMUM_SHORT_TERM_SECONDS,
    ReplayGuard,
    clamp_probability,
    fit_grouped_logistic,
    linear_probability,
    short_term_weight,
)
from .fsrs6 import Fsrs6Predictor

if TYPE_CHECKING:
    import pyarrow as pa


LAG_BIN_COUNT = 64
COUNT_CAP = 8
FEATURE_COUNT = 10


class HalfLifeLogisticCandidate:
    name = "half-life-logistic-v1-lag64-count8"

    def fit_batches(self, training_batches: Iterable[pa.RecordBatch]) -> FittedHalfLifeLogistic:
        grouped: dict[tuple[int, int, int, int, bool, int], list[int]] = defaultdict(
            lambda: [0, 0]
        )
        for batch in training_batches:
            columns = {
                name: batch.column(name).to_pylist()
                for name in (
                    "elapsed_seconds",
                    "recalled",
                    "state",
                    "is_seed",
                    "is_first_predictive_review",
                    "prior_success_count",
                    "prior_failure_count",
                    "previous_recalled",
                )
            }
            for values in zip(*columns.values(), strict=True):
                (
                    elapsed,
                    recalled,
                    state,
                    is_seed,
                    first,
                    successes,
                    failures,
                    previous,
                ) = values
                if is_seed or elapsed < 0 or elapsed > MAXIMUM_SHORT_TERM_SECONDS:
                    continue
                key = (
                    _lag_bin(elapsed),
                    min(successes, COUNT_CAP),
                    min(failures, COUNT_CAP),
                    1 if previous else 0,
                    bool(first),
                    state,
                )
                grouped[key][0] += int(recalled)
                grouped[key][1] += 1
        coefficients = fit_grouped_logistic(
            (
                (_features_from_key(key), positive, count)
                for key, (positive, count) in sorted(grouped.items())
            ),
            feature_count=FEATURE_COUNT,
        )
        return FittedHalfLifeLogistic(coefficients, sum(item[1] for item in grouped.values()))


@dataclass(frozen=True, slots=True)
class FittedHalfLifeLogistic:
    coefficients: tuple[float, ...]
    training_examples: int
    name: str = "half-life-logistic-v1-lag64-count8"

    @property
    def parameters(self) -> dict[str, object]:
        return {
            "coefficients": list(self.coefficients),
            "features": [
                "intercept",
                "log_elapsed_seconds",
                "previous_success",
                "previous_failure",
                "first_predictive_review",
                "log_prior_successes",
                "log_prior_failures",
                "state_learning",
                "state_review",
                "state_relearning",
            ],
            "training_examples": self.training_examples,
            "training_lag_bins": LAG_BIN_COUNT,
            "count_cap": COUNT_CAP,
            "transition_seconds": [518_400, MAXIMUM_SHORT_TERM_SECONDS],
        }

    def new_predictor(self, user_id: int) -> HalfLifeLogisticPredictor:
        return HalfLifeLogisticPredictor(user_id, self.coefficients)


class HalfLifeLogisticPredictor(ReplayGuard):
    def __init__(self, user_id: int, coefficients: tuple[float, ...]):
        super().__init__(user_id)
        self.coefficients = coefficients
        # fractional_retrievability=True mirrors the runtime blend
        # (src/fsrs/halfLifeLogisticModel.ts), which queries its FSRS-6 component with
        # fractional elapsed days rather than flooring to whole days. See fsrs6.py.
        self.baseline = Fsrs6Predictor(user_id, fractional_retrievability=True)

    def predict(self, context: PredictionContext) -> float:
        self.begin_prediction(context)
        baseline = self.baseline.predict(context)
        features = _features(context)
        if features is None:
            return baseline
        short_term = linear_probability(self.coefficients, features)
        weight = short_term_weight(context.elapsed_seconds)
        return clamp_probability(weight * short_term + (1 - weight) * baseline)

    def observe(self, example: Example) -> None:
        self.begin_observation(example)
        self.baseline.observe(example)
        self.finish_observation(example)


candidate = HalfLifeLogisticCandidate()


def _lag_bin(elapsed_seconds: int) -> int:
    scaled = math.log1p(elapsed_seconds) / math.log1p(MAXIMUM_SHORT_TERM_SECONDS)
    return min(int(scaled * LAG_BIN_COUNT), LAG_BIN_COUNT - 1)


def _features(context: PredictionContext) -> tuple[float, ...] | None:
    if (
        context.elapsed_seconds < 0
        or context.previous_recalled is None
        or context.state not in {0, 1, 2, 3}
        or context.prior_success_count < 0
        or context.prior_failure_count < 0
        or context.prior_success_count + context.prior_failure_count
        != context.prior_review_count
    ):
        return None
    return _feature_values(
        math.log1p(min(context.elapsed_seconds, MAXIMUM_SHORT_TERM_SECONDS))
        / math.log1p(MAXIMUM_SHORT_TERM_SECONDS),
        min(context.prior_success_count, COUNT_CAP),
        min(context.prior_failure_count, COUNT_CAP),
        context.previous_recalled,
        context.is_first_predictive_review,
        context.state,
    )


def _features_from_key(key: tuple[int, int, int, int, bool, int]) -> tuple[float, ...]:
    # Train/serve mismatch (VALIDATION_PLAN.md phase 2, item 4; frozen for v1, documented
    # rather than changed): `fit_batches` groups training examples into `LAG_BIN_COUNT`
    # log-scale lag bins (`_lag_bin`) and fits against each bin's *centre*
    # (`(lag + 0.5) / LAG_BIN_COUNT`, computed here), not the exact log-scaled lag of the
    # examples inside it. `_features` below, used at serving time, scales the *exact*
    # elapsed-seconds value instead - there is no equivalent binning step at inference.
    #
    # This is acceptable, not a bug to fix in place: bin-centre fitting is a form of
    # histogram regression that trades a small amount of within-bin resolution for
    # aggregation stability (each bin pools many examples into one grouped logistic
    # observation; see `fit_batches`'s `grouped` dict). With 64 log-scale bins across a
    # 0-604,800 s range, bin width is sub-second near lag zero and widens geometrically;
    # the worst-case bin-centre-to-exact-lag error is bounded by half a bin's width in
    # log-space, i.e. well under the log-lag feature's overall dynamic range. Because the
    # log transform compresses long lags, the absolute-second error this introduces is
    # largest for the longest lags, which is also where the FSRS baseline already
    # dominates the blend (`short_term_weight` / `routed_short_term_weight`), so the
    # approximation's impact on predicted probability is muted exactly where it is
    # largest.
    #
    # It would be straightforward to refit against exact per-example lag instead of the
    # bin centre (drop the `_lag_bin` grouping key's rounding, or accumulate a running
    # mean lag per bin and fit against that) - but doing so would change the fitted
    # coefficients, and v1's coefficients are frozen (`coefficients/half-life-logistic-v1.json`
    # is a versioned, checksum-validated artefact the TS runtime loads verbatim). Any
    # exact-lag refit belongs in a new versioned artefact (`-v3` or later) with its own
    # evaluation, not a silent change to what v1's frozen coefficients mean.
    lag, successes, failures, previous, first, state = key
    return _feature_values(
        (lag + 0.5) / LAG_BIN_COUNT,
        successes,
        failures,
        bool(previous),
        first,
        state,
    )


def _feature_values(
    scaled_lag: float,
    successes: int,
    failures: int,
    previous: bool,
    first: bool,
    state: int,
) -> tuple[float, ...]:
    return (
        1.0,
        scaled_lag,
        float(previous),
        float(not previous),
        float(first),
        math.log1p(successes) / math.log1p(COUNT_CAP),
        math.log1p(failures) / math.log1p(COUNT_CAP),
        float(state == 1),
        float(state == 2),
        float(state == 3),
    )
