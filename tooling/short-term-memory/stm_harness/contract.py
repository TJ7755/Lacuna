from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable, Protocol

if TYPE_CHECKING:
    import pyarrow as pa


@dataclass(frozen=True, slots=True)
class PredictionContext:
    user_id: int
    source_index: int
    card_id: int
    review_index: int
    elapsed_seconds: int
    state: int
    is_first_predictive_review: bool
    prior_review_count: int
    prior_success_count: int
    prior_failure_count: int
    previous_recalled: bool | None


@dataclass(frozen=True, slots=True)
class Example:
    context: PredictionContext
    rating: int
    recalled: bool
    duration_ms: int
    is_seed: bool
    split: str


class Predictor(Protocol):
    """Stateful, single-user predictor replayed in chronological order."""

    def predict(self, context: PredictionContext) -> float:
        """Predict before the current event is observed."""

    def observe(self, example: Example) -> None:
        """Consume the event exactly once after any prediction."""


class FittedCandidate(Protocol):
    name: str

    def new_predictor(self, user_id: int) -> Predictor:
        """Return empty state for a chronological replay of one user."""


class RowCandidate(Protocol):
    name: str

    def fit(self, training_events: Iterable[Example]) -> FittedCandidate:
        """Fit global coefficients from complete training-prefix event streams."""


class BatchCandidate(Protocol):
    name: str

    def fit_batches(
        self, training_batches: Iterable["pa.RecordBatch"]
    ) -> FittedCandidate:
        """Fit coefficients from columnar training-prefix event batches."""


type Candidate = RowCandidate | BatchCandidate
