from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable

from ..contract import Example, PredictionContext
from .common import (
    MAXIMUM_SHORT_TERM_SECONDS,
    POST_FAILURE_TRANSITION_END_SECONDS,
    POST_FAILURE_TRANSITION_START_SECONDS,
    POST_SUCCESS_TRANSITION_END_SECONDS,
    POST_SUCCESS_TRANSITION_START_SECONDS,
    ReplayGuard,
    clamp_probability,
    linear_probability,
    routed_short_term_weight,
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


class HalfLifeLogisticV2Candidate:
    """Identical fit to `half_life`; only the short-term/FSRS blend weight differs.

    v1 decays a single, outcome-independent weight from day six to day seven. v2 routes
    the handover on the previous review's outcome (phase 2, VALIDATION_PLAN.md): a later
    handover after a failure (unchanged from v1), a much earlier one after a success or on
    a first predictive review. The fit machinery is reused as-is from `half_life` so the
    two candidates cannot drift apart on the logistic coefficients themselves.
    """

    name = "half-life-logistic-v2-routed"

    def fit_batches(self, training_batches: Iterable[pa.RecordBatch]) -> FittedHalfLifeLogisticV2:
        fitted = HalfLifeLogisticCandidate().fit_batches(training_batches)
        return FittedHalfLifeLogisticV2(fitted.coefficients, fitted.training_examples)


@dataclass(frozen=True, slots=True)
class FittedHalfLifeLogisticV2:
    coefficients: tuple[float, ...]
    training_examples: int
    name: str = "half-life-logistic-v2-routed"

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
                POST_FAILURE_TRANSITION_START_SECONDS,
                POST_FAILURE_TRANSITION_END_SECONDS,
            ],
            "post_success_transition_seconds": [
                POST_SUCCESS_TRANSITION_START_SECONDS,
                POST_SUCCESS_TRANSITION_END_SECONDS,
            ],
        }

    def new_predictor(self, user_id: int) -> HalfLifeLogisticV2Predictor:
        return HalfLifeLogisticV2Predictor(user_id, self.coefficients)


class HalfLifeLogisticV2Predictor(ReplayGuard):
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
        weight = routed_short_term_weight(
            context.elapsed_seconds,
            context.previous_recalled,
            context.is_first_predictive_review,
        )
        return clamp_probability(weight * short_term + (1 - weight) * baseline)

    def observe(self, example: Example) -> None:
        self.begin_observation(example)
        self.baseline.observe(example)
        self.finish_observation(example)


candidate = HalfLifeLogisticV2Candidate()

assert FEATURE_COUNT == 10  # kept for readers cross-checking against half_life.py
