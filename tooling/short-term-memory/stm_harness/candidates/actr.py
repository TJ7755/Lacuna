from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable

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


DECAY = 0.5
FAILURE_TRACE_STRENGTH = 0.25
ACTIVATION_MINIMUM = -20.0
ACTIVATION_MAXIMUM = 8.0
ACTIVATION_BIN_COUNT = 112
REVIEW_COUNT_CAP = 64
FEATURE_COUNT = 7


@dataclass(slots=True)
class TraceState:
    time_seconds: int = 0
    traces: list[tuple[int, float]] = field(default_factory=list)


class ActrCandidate:
    name = "actr-multitrace-v1-d0.5"

    def fit(self, training_events: Iterable[Example]) -> FittedActr:
        grouped: dict[tuple[int, int, int, int], list[int]] = defaultdict(lambda: [0, 0])
        cards: dict[int, TraceState] = {}
        current_user: int | None = None
        for example in training_events:
            context = example.context
            if context.user_id != current_user:
                current_user = context.user_id
                cards.clear()
            card = cards.setdefault(context.card_id, TraceState())
            if example.is_seed:
                _add_trace(card, example.recalled)
                continue
            target_time = card.time_seconds + max(context.elapsed_seconds, 0)
            if context.elapsed_seconds <= MAXIMUM_SHORT_TERM_SECONDS and card.traces:
                activation = _activation(card.traces, target_time)
                key = (
                    _activation_bin(activation),
                    1 if context.previous_recalled else 0,
                    min(context.prior_review_count, REVIEW_COUNT_CAP),
                    context.state,
                )
                grouped[key][0] += int(example.recalled)
                grouped[key][1] += 1
            card.time_seconds = target_time
            _add_trace(card, example.recalled)
        coefficients = fit_grouped_logistic(
            (
                (_features_from_key(key), positive, count)
                for key, (positive, count) in sorted(grouped.items())
            ),
            feature_count=FEATURE_COUNT,
        )
        return FittedActr(coefficients, sum(item[1] for item in grouped.values()))


@dataclass(frozen=True, slots=True)
class FittedActr:
    coefficients: tuple[float, ...]
    training_examples: int
    name: str = "actr-multitrace-v1-d0.5"

    @property
    def parameters(self) -> dict[str, object]:
        return {
            "coefficients": list(self.coefficients),
            "features": [
                "intercept",
                "multitrace_activation",
                "previous_success",
                "previous_failure",
                "log_review_count",
                "state_review",
                "state_relearning",
            ],
            "decay": DECAY,
            "failure_trace_strength": FAILURE_TRACE_STRENGTH,
            "training_examples": self.training_examples,
            "activation_bins": ACTIVATION_BIN_COUNT,
            "transition_seconds": [518_400, MAXIMUM_SHORT_TERM_SECONDS],
        }

    def new_predictor(self, user_id: int) -> ActrPredictor:
        return ActrPredictor(user_id, self.coefficients)


class ActrPredictor(ReplayGuard):
    def __init__(self, user_id: int, coefficients: tuple[float, ...]):
        super().__init__(user_id)
        self.coefficients = coefficients
        self.baseline = Fsrs6Predictor(user_id)
        self.cards: dict[int, TraceState] = {}

    def predict(self, context: PredictionContext) -> float:
        self.begin_prediction(context)
        baseline = self.baseline.predict(context)
        card = self.cards.get(context.card_id)
        if (
            card is None
            or not card.traces
            or context.elapsed_seconds < 0
            or context.previous_recalled is None
            or context.state not in {0, 1, 2, 3}
        ):
            return baseline
        target_time = card.time_seconds + context.elapsed_seconds
        features = _feature_values(
            _activation(card.traces, target_time),
            context.previous_recalled,
            min(context.prior_review_count, REVIEW_COUNT_CAP),
            context.state,
        )
        short_term = linear_probability(self.coefficients, features)
        weight = short_term_weight(context.elapsed_seconds)
        return clamp_probability(weight * short_term + (1 - weight) * baseline)

    def observe(self, example: Example) -> None:
        self.begin_observation(example)
        self.baseline.observe(example)
        context = example.context
        card = self.cards.setdefault(context.card_id, TraceState())
        if not example.is_seed and context.elapsed_seconds >= 0:
            card.time_seconds += context.elapsed_seconds
        _add_trace(card, example.recalled)
        self.finish_observation(example)


candidate = ActrCandidate()


def _add_trace(card: TraceState, recalled: bool) -> None:
    strength = 1.0 if recalled else FAILURE_TRACE_STRENGTH
    card.traces.append((card.time_seconds, strength))


def _activation(traces: list[tuple[int, float]], target_time: int) -> float:
    evidence = sum(
        strength * max(target_time - trace_time, 1) ** (-DECAY)
        for trace_time, strength in traces
    )
    return math.log(max(evidence, 1e-12))


def _activation_bin(activation: float) -> int:
    bounded = min(max(activation, ACTIVATION_MINIMUM), ACTIVATION_MAXIMUM)
    scaled = (bounded - ACTIVATION_MINIMUM) / (ACTIVATION_MAXIMUM - ACTIVATION_MINIMUM)
    return min(int(scaled * ACTIVATION_BIN_COUNT), ACTIVATION_BIN_COUNT - 1)


def _features_from_key(key: tuple[int, int, int, int]) -> tuple[float, ...]:
    activation_bin, previous, review_count, state = key
    width = (ACTIVATION_MAXIMUM - ACTIVATION_MINIMUM) / ACTIVATION_BIN_COUNT
    activation = ACTIVATION_MINIMUM + (activation_bin + 0.5) * width
    return _feature_values(activation, bool(previous), review_count, state)


def _feature_values(
    activation: float,
    previous: bool,
    review_count: int,
    state: int,
) -> tuple[float, ...]:
    bounded_activation = min(max(activation, ACTIVATION_MINIMUM), ACTIVATION_MAXIMUM)
    return (
        1.0,
        bounded_activation / 10,
        float(previous),
        float(not previous),
        math.log1p(review_count) / math.log1p(REVIEW_COUNT_CAP),
        float(state == 2),
        float(state == 3),
    )
