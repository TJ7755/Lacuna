from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

from ..contract import Example, PredictionContext
from .common import ReplayGuard, clamp_probability


FSRS6_DEFAULT_WEIGHTS = (
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    0.001,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    0.1542,
)
SECONDS_PER_DAY = 86_400
MINIMUM_STABILITY = 0.001
MAXIMUM_STABILITY = 36_500.0


@dataclass(slots=True)
class MemoryState:
    difficulty: float
    stability: float


class Fsrs6Predictor(ReplayGuard):
    def __init__(self, user_id: int):
        super().__init__(user_id)
        self.cards: dict[int, MemoryState] = {}

    def probability(self, context: PredictionContext) -> float:
        memory = self.cards.get(context.card_id)
        if memory is None or context.elapsed_seconds < 0:
            return 0.5
        elapsed_days = context.elapsed_seconds // SECONDS_PER_DAY
        return clamp_probability(_forgetting_curve(elapsed_days, memory.stability))

    def predict(self, context: PredictionContext) -> float:
        self.begin_prediction(context)
        return self.probability(context)

    def observe(self, example: Example) -> None:
        self.begin_observation(example)
        context = example.context
        if example.rating not in {1, 2, 3, 4}:
            self.finish_observation(example)
            return
        memory = self.cards.get(context.card_id)
        if example.is_seed or memory is None:
            self.cards[context.card_id] = MemoryState(
                difficulty=_initial_difficulty(example.rating),
                stability=max(FSRS6_DEFAULT_WEIGHTS[example.rating - 1], 0.1),
            )
        elif context.elapsed_seconds >= 0:
            self.cards[context.card_id] = _next_state(
                memory,
                context.elapsed_seconds // SECONDS_PER_DAY,
                example.rating,
            )
        self.finish_observation(example)


@dataclass(frozen=True, slots=True)
class FittedFsrs6:
    name: str = "fsrs-6-default-short-term-v1"
    parameters: dict[str, object] | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "parameters",
            {
                "weights": list(FSRS6_DEFAULT_WEIGHTS),
                "elapsed_days": "floor(elapsed_seconds / 86400)",
                "enable_short_term": True,
            },
        )

    def new_predictor(self, user_id: int) -> Fsrs6Predictor:
        return Fsrs6Predictor(user_id)


class Fsrs6Candidate:
    name = "fsrs-6-default-short-term-v1"

    def fit(self, training_events: Iterable[Example]) -> FittedFsrs6:
        del training_events
        return FittedFsrs6()


candidate = Fsrs6Candidate()


def _initial_difficulty(rating: int) -> float:
    weights = FSRS6_DEFAULT_WEIGHTS
    return _clamp(weights[4] - math.exp((rating - 1) * weights[5]) + 1, 1, 10)


def _next_state(memory: MemoryState, elapsed_days: int, rating: int) -> MemoryState:
    weights = FSRS6_DEFAULT_WEIGHTS
    difficulty = memory.difficulty
    stability = memory.stability
    retrievability = _forgetting_curve(elapsed_days, stability)
    if elapsed_days == 0:
        increase = stability ** (-weights[19]) * math.exp(
            weights[17] * (rating - 3 + weights[18])
        )
        if rating >= 2:
            increase = max(increase, 1)
        next_stability = _clamp(
            stability * increase, MINIMUM_STABILITY, MAXIMUM_STABILITY
        )
    elif rating == 1:
        after_failure = _clamp(
            weights[11]
            * difficulty ** (-weights[12])
            * ((stability + 1) ** weights[13] - 1)
            * math.exp((1 - retrievability) * weights[14]),
            MINIMUM_STABILITY,
            MAXIMUM_STABILITY,
        )
        short_term_ceiling = stability / math.exp(weights[17] * weights[18])
        next_stability = min(short_term_ceiling, after_failure)
    else:
        grade_multiplier = weights[15] if rating == 2 else weights[16] if rating == 4 else 1
        next_stability = _clamp(
            stability
            * (
                1
                + math.exp(weights[8])
                * (11 - difficulty)
                * stability ** (-weights[9])
                * (math.exp((1 - retrievability) * weights[10]) - 1)
                * grade_multiplier
            ),
            MINIMUM_STABILITY,
            MAXIMUM_STABILITY,
        )
    delta = -weights[6] * (rating - 3)
    damped = delta * (10 - difficulty) / 9
    initial_easy = _initial_difficulty(4)
    next_difficulty = _clamp(
        weights[7] * initial_easy + (1 - weights[7]) * (difficulty + damped),
        1,
        10,
    )
    return MemoryState(next_difficulty, next_stability)


def _forgetting_curve(elapsed_days: int, stability: float) -> float:
    decay = -FSRS6_DEFAULT_WEIGHTS[20]
    factor = 0.9 ** (1 / decay) - 1
    return (1 + factor * max(elapsed_days, 0) / stability) ** decay


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(max(value, lower), upper)
