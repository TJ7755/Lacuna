from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from ..contract import Example
from .fsrs6 import FSRS6_DEFAULT_WEIGHTS, Fsrs6Predictor


class Fsrs6FractionalCandidate:
    """Standalone FSRS-6 reference benchmarked with fractional-day retrievability.

    `fsrs6.py`'s `Fsrs6Candidate` intentionally floors elapsed time to whole days
    when querying retrievability, mirroring the runtime's current FSRS-6-only
    fallback. But the blended candidates (half_life.py/_v2/_v3 and their frozen
    variants) construct their internal FSRS baseline with
    `fractional_retrievability=True`, matching src/fsrs/halfLifeLogisticModel.ts's
    `predict()`. Comparing a fractional-day blend against a floored-day reference
    introduces a train/serve-style discrepancy in the benchmark itself (see
    VALIDATION_PLAN.md phase 2 item 4). This candidate exposes the fractional-day
    FSRS-6 baseline as its own reference so the blend can be evaluated against the
    reference it can actually beat.
    """

    name = "fsrs-6-fractional-days"

    def fit(self, training_events: Iterable[Example]) -> "FittedFsrs6Fractional":
        del training_events
        return FittedFsrs6Fractional()


@dataclass(frozen=True, slots=True)
class FittedFsrs6Fractional:
    name: str = "fsrs-6-fractional-days"
    parameters: dict[str, object] | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "parameters",
            {
                "weights": list(FSRS6_DEFAULT_WEIGHTS),
                "elapsed_days": "elapsed_seconds / 86400 (fractional, matches runtime blend)",
                "enable_short_term": True,
            },
        )

    def new_predictor(self, user_id: int) -> Fsrs6Predictor:
        return Fsrs6Predictor(user_id, fractional_retrievability=True)


candidate = Fsrs6FractionalCandidate()
