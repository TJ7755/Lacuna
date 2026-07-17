from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Iterable

from .half_life_v2 import FittedHalfLifeLogisticV2, HalfLifeLogisticV2Predictor

if TYPE_CHECKING:
    import pyarrow as pa


# VALIDATION_PLAN.md phase 3: test whether v2's frozen coefficients transfer to users
# whose data never touched the fit, instead of always refitting on whatever cohort is
# passed in. Path resolved relative to this module, not the CWD, so the candidate works
# from any invocation directory.
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


class HalfLifeLogisticFrozenCandidate:
    """`half-life-logistic-v2-routed` with coefficients frozen from the shipped artefact.

    `fit`/`fit_batches` are no-ops: they consume no training data and always return the
    coefficients baked into `coefficients/half-life-logistic-v2.json`. Prediction is
    otherwise identical to `half_life_v2` (routed weight, fractional-day FSRS baseline).
    Used to test cohort transfer (VALIDATION_PLAN.md phase 3): does the fit on users
    1-100 hold up on users whose data never touched it, without any refitting.
    """

    name = "half-life-logistic-frozen-v2"

    def fit_batches(self, training_batches: Iterable[pa.RecordBatch]) -> FittedHalfLifeLogisticV2:
        # No-op: training data is never touched, only iterated by the harness before
        # being discarded. Coefficients always come from the shipped artefact.
        del training_batches
        return FittedHalfLifeLogisticV2(_load_frozen_coefficients(), 0, name=self.name)


candidate = HalfLifeLogisticFrozenCandidate()

# HalfLifeLogisticV2Predictor is reused directly (not subclassed) so prediction stays
# byte-for-byte identical to half_life_v2; re-exported for readers/tests.
FrozenPredictor = HalfLifeLogisticV2Predictor
