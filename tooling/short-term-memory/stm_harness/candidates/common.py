from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

from ..contract import Example, PredictionContext


MAXIMUM_SHORT_TERM_SECONDS = 604_800
TRANSITION_START_SECONDS = 518_400
PROBABILITY_EPSILON = 1e-9


def clamp_probability(value: float) -> float:
    if not math.isfinite(value):
        return 0.5
    return min(max(value, PROBABILITY_EPSILON), 1 - PROBABILITY_EPSILON)


def sigmoid(value: float) -> float:
    if value >= 0:
        inverse = math.exp(-min(value, 40.0))
        return 1 / (1 + inverse)
    exponent = math.exp(max(value, -40.0))
    return exponent / (1 + exponent)


def linear_probability(coefficients: Sequence[float], features: Sequence[float]) -> float:
    score = sum(
        coefficient * feature
        for coefficient, feature in zip(coefficients, features)
    )
    return sigmoid(score)


def short_term_weight(elapsed_seconds: int) -> float:
    if elapsed_seconds <= TRANSITION_START_SECONDS:
        return 1.0
    if elapsed_seconds >= MAXIMUM_SHORT_TERM_SECONDS:
        return 0.0
    position = (elapsed_seconds - TRANSITION_START_SECONDS) / (
        MAXIMUM_SHORT_TERM_SECONDS - TRANSITION_START_SECONDS
    )
    smoothstep = position * position * (3 - 2 * position)
    return 1 - smoothstep


class ReplayGuard:
    def __init__(self, user_id: int):
        self.user_id = user_id
        self._last_observed_source_index = -1
        self._pending_source_index: int | None = None

    def begin_prediction(self, context: PredictionContext) -> None:
        if context.user_id != self.user_id:
            raise ValueError("prediction user does not match predictor")
        if context.source_index <= self._last_observed_source_index:
            raise ValueError("prediction is not in chronological order")
        if self._pending_source_index is not None:
            raise ValueError("previous prediction has not been observed")
        self._pending_source_index = context.source_index

    def begin_observation(self, example: Example) -> None:
        context = example.context
        if context.user_id != self.user_id:
            raise ValueError("observation user does not match predictor")
        if context.source_index <= self._last_observed_source_index:
            raise ValueError("observation is duplicated or out of order")
        if self._pending_source_index not in {None, context.source_index}:
            raise ValueError("observation does not match pending prediction")

    def finish_observation(self, example: Example) -> None:
        self._last_observed_source_index = example.context.source_index
        self._pending_source_index = None


def fit_grouped_logistic(
    groups: Iterable[tuple[Sequence[float], int, int]],
    *,
    feature_count: int,
    l2_penalty: float = 1e-3,
    iterations: int = 12,
) -> tuple[float, ...]:
    materialised = list(groups)
    total = sum(count for _, _, count in materialised)
    positives = sum(positive for _, positive, _ in materialised)
    if not total or not 0 < positives < total:
        raise ValueError("logistic fit requires both outcomes")
    coefficients = [0.0] * feature_count
    coefficients[0] = math.log(positives / (total - positives))

    for _ in range(iterations):
        gradient = [0.0] * feature_count
        hessian = [[0.0] * feature_count for _ in range(feature_count)]
        for features, positive, count in materialised:
            probability = linear_probability(coefficients, features)
            residual = (probability * count - positive) / total
            curvature = probability * (1 - probability) * count / total
            for row in range(feature_count):
                gradient[row] += residual * features[row]
                for column in range(row + 1):
                    hessian[row][column] += curvature * features[row] * features[column]
        for row in range(feature_count):
            for column in range(row):
                hessian[column][row] = hessian[row][column]
            if row:
                gradient[row] += l2_penalty * coefficients[row]
                hessian[row][row] += l2_penalty
            hessian[row][row] += 1e-9
        step = _solve_linear_system(hessian, gradient)
        maximum_step = max(abs(value) for value in step)
        scale = min(1.0, 2.0 / maximum_step) if maximum_step else 1.0
        coefficients = [
            coefficient - scale * delta
            for coefficient, delta in zip(coefficients, step)
        ]
        if max(abs(scale * value) for value in step) < 1e-7:
            break
    return tuple(round(value, 12) for value in coefficients)


def _solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    size = len(vector)
    augmented = [row[:] + [value] for row, value in zip(matrix, vector)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError("singular logistic Hessian")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            multiplier = augmented[row][column]
            if multiplier == 0:
                continue
            augmented[row] = [
                value - multiplier * pivot_value
                for value, pivot_value in zip(augmented[row], augmented[column])
            ]
    return [augmented[row][-1] for row in range(size)]
