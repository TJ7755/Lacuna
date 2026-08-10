from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable

from ..contract import Example, PredictionContext
from .common import (
    POST_FAILURE_TRANSITION_END_SECONDS_V3,
    POST_FAILURE_TRANSITION_START_SECONDS_V3,
    POST_SUCCESS_TRANSITION_END_SECONDS_V3,
    POST_SUCCESS_TRANSITION_START_SECONDS_V3,
    ReplayGuard,
    clamp_probability,
    linear_probability,
    routed_short_term_weight_v3,
)
from .fsrs6 import Fsrs6Predictor
from .half_life import (
    COUNT_CAP,
    FEATURE_COUNT,
    LAG_BIN_COUNT,
    HalfLifeLogisticCandidate,
    _features,
)

if TYPE_CHECKING:
    import pyarrow as pa


class HalfLifeLogisticV3Candidate:
    """Identical fit to `half_life`/`half_life_v2`; only the routing boundaries differ.

    v3 is the predeclared, conservative re-route from ROUTING_DECISION_RULE.md, applied
    after the 201-300 transfer result: the success/first-review/no-previous-outcome path
    moves fully onto FSRS-6 much sooner than v2, and the failure path is retained only
    through the last bucket both transfer cohorts (101-200, 201-300) supported. The fit
    machinery is reused as-is from `half_life` so the logistic coefficients cannot drift
    apart from v1/v2.
    """

    name = "half-life-logistic-v3-routed"

    def fit_batches(self, training_batches: Iterable[pa.RecordBatch]) -> FittedHalfLifeLogisticV3:
        fitted = HalfLifeLogisticCandidate().fit_batches(training_batches)
        return FittedHalfLifeLogisticV3(fitted.coefficients, fitted.training_examples)


@dataclass(frozen=True, slots=True)
class FittedHalfLifeLogisticV3:
    coefficients: tuple[float, ...]
    training_examples: int
    name: str = "half-life-logistic-v3-routed"

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
            "post_failure_transition_seconds": [
                POST_FAILURE_TRANSITION_START_SECONDS_V3,
                POST_FAILURE_TRANSITION_END_SECONDS_V3,
            ],
            "post_success_transition_seconds": [
                POST_SUCCESS_TRANSITION_START_SECONDS_V3,
                POST_SUCCESS_TRANSITION_END_SECONDS_V3,
            ],
        }

    def new_predictor(self, user_id: int) -> HalfLifeLogisticV3Predictor:
        return HalfLifeLogisticV3Predictor(user_id, self.coefficients)


class HalfLifeLogisticV3Predictor(ReplayGuard):
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
        weight = routed_short_term_weight_v3(
            context.elapsed_seconds,
            context.previous_recalled,
            context.is_first_predictive_review,
        )
        return clamp_probability(weight * short_term + (1 - weight) * baseline)

    def observe(self, example: Example) -> None:
        self.begin_observation(example)
        self.baseline.observe(example)
        self.finish_observation(example)


candidate = HalfLifeLogisticV3Candidate()

assert FEATURE_COUNT == 10  # kept for readers cross-checking against half_life.py
