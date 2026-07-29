from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Iterable

from .half_life_v3 import FittedHalfLifeLogisticV3, HalfLifeLogisticV3Predictor

if TYPE_CHECKING:
    import pyarrow as pa


# ROUTING_DECISION_RULE.md: v3 changes routing boundaries only, not coefficients, so the
# frozen artefact is the same shipped v2 coefficients file as `half_life_frozen`.
COEFFICIENTS_PATH = Path(__file__).resolve().parents[2] / "coefficients" / "half-life-logistic-v2.json"

_EXPECTED_FEATURES = (
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
)


def _load_frozen_coefficients() -> tuple[float, ...]:
    payload = json.loads(COEFFICIENTS_PATH.read_text())
    features = tuple(payload["features"])
    if features != _EXPECTED_FEATURES:
        raise ValueError(
            f"{COEFFICIENTS_PATH} feature order {features} does not match the predictor's "
            f"expected feature order {_EXPECTED_FEATURES}"
        )
    coefficients = tuple(payload["coefficients"])
    if len(coefficients) != len(_EXPECTED_FEATURES):
        raise ValueError(
            f"{COEFFICIENTS_PATH} has {len(coefficients)} coefficients, expected "
            f"{len(_EXPECTED_FEATURES)}"
        )
    return coefficients


class HalfLifeLogisticFrozenV3Candidate:
    """`half-life-logistic-v3-routed` with coefficients frozen from the shipped artefact.

    `fit`/`fit_batches` are no-ops: they consume no training data and always return the
    coefficients baked into `coefficients/half-life-logistic-v2.json` (v3 does not change
    coefficients, only routing boundaries). Prediction is otherwise identical to
    `half_life_v3` (v3 routed weight, fractional-day FSRS baseline). Used to evaluate the
    ROUTING_DECISION_RULE.md re-route on all three cohorts, frozen.
    """

    name = "half-life-logistic-frozen-v3"

    def fit_batches(self, training_batches: Iterable[pa.RecordBatch]) -> FittedHalfLifeLogisticV3:
        # No-op: training data is never touched, only iterated by the harness before
        # being discarded. Coefficients always come from the shipped artefact.
        del training_batches
        return FittedHalfLifeLogisticV3(_load_frozen_coefficients(), 0, name=self.name)


candidate = HalfLifeLogisticFrozenV3Candidate()

# HalfLifeLogisticV3Predictor is reused directly (not subclassed) so prediction stays
# byte-for-byte identical to half_life_v3; re-exported for readers/tests.
FrozenPredictor = HalfLifeLogisticV3Predictor
