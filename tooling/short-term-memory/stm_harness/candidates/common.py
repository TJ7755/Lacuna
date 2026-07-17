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


# Outcome-conditional handover (phase 2, VALIDATION_PLAN.md). Phase 1's lag x
# previous-outcome crossover analysis found the logistic model stays competitive with
# FSRS-6 for longer after a failure than after a success, so the two paths get different
# transition windows rather than sharing v1's single six-day boundary.
POST_FAILURE_TRANSITION_START_SECONDS = TRANSITION_START_SECONDS
POST_FAILURE_TRANSITION_END_SECONDS = MAXIMUM_SHORT_TERM_SECONDS
POST_SUCCESS_TRANSITION_START_SECONDS = 86_400  # 1 day
POST_SUCCESS_TRANSITION_END_SECONDS = 172_800  # 2 days


def _smoothstep_weight(elapsed_seconds: int, start: int, end: int) -> float:
    if elapsed_seconds <= start:
        return 1.0
    if elapsed_seconds >= end:
        return 0.0
    position = (elapsed_seconds - start) / (end - start)
    smoothstep = position * position * (3 - 2 * position)
    return 1 - smoothstep


def _routed_short_term_weight(
    elapsed_seconds: int,
    previous_recalled: bool | None,
    is_first_predictive_review: bool,
    *,
    post_failure_start: int,
    post_failure_end: int,
    post_success_start: int,
    post_success_end: int,
) -> float:
    """Shared smoothstep machinery behind the outcome-conditional routing versions.

    First predictive reviews (`is_first_predictive_review`) are routed onto the success
    path unconditionally, even though `previous_recalled` technically carries the seed
    review's outcome: phase 1's first-review data showed FSRS-6 already competitive at
    1-7 days for these reviews specifically, matching the success crossover rather than
    the slower-decaying failure one, so the seed outcome is not treated as a genuine
    "previous review" for routing purposes. `previous_recalled is None` (no prior review
    at all) is likewise routed onto the success path, for the same reason.
    """
    if previous_recalled is False and not is_first_predictive_review:
        return _smoothstep_weight(elapsed_seconds, post_failure_start, post_failure_end)
    return _smoothstep_weight(elapsed_seconds, post_success_start, post_success_end)


def routed_short_term_weight(
    elapsed_seconds: int,
    previous_recalled: bool | None,
    is_first_predictive_review: bool = False,
) -> float:
    """Outcome-conditional short-term weight (v2, shipped contract).

    After a previous failure, keep v1's behaviour: full weight through 518,400 s (6 days),
    then a smoothstep decay to 0 at 604,800 s (7 days). After a previous success, decay
    starts and finishes much earlier: full weight through 86,400 s (1 day), then a
    smoothstep decay to 0 at 172,800 s (2 days).
    """
    return _routed_short_term_weight(
        elapsed_seconds,
        previous_recalled,
        is_first_predictive_review,
        post_failure_start=POST_FAILURE_TRANSITION_START_SECONDS,
        post_failure_end=POST_FAILURE_TRANSITION_END_SECONDS,
        post_success_start=POST_SUCCESS_TRANSITION_START_SECONDS,
        post_success_end=POST_SUCCESS_TRANSITION_END_SECONDS,
    )


# v3 routing (ROUTING_DECISION_RULE.md, applied 2026-07-17): the predeclared, conservative
# re-route triggered by the 201-300 transfer result. Success/first-review/no-previous-outcome
# path moves fully onto FSRS-6 much sooner than v2 (full weight through 21,600 s / 6 hours,
# zero by 86,400 s / 1 day). The failure path keeps the logistic model competitive for far
# longer than the success path but far less long than v2's fitting-cohort boundary (full
# weight through 345,600 s / 4 days, zero by 432,000 s / 5 days) — the last bucket at or
# above 24-36h where the routed model won both metrics on both transfer cohorts. Coefficients
# are unchanged from v1/v2; only these boundaries differ.
POST_FAILURE_TRANSITION_START_SECONDS_V3 = 345_600
POST_FAILURE_TRANSITION_END_SECONDS_V3 = 432_000
POST_SUCCESS_TRANSITION_START_SECONDS_V3 = 21_600
POST_SUCCESS_TRANSITION_END_SECONDS_V3 = 86_400


def routed_short_term_weight_v3(
    elapsed_seconds: int,
    previous_recalled: bool | None,
    is_first_predictive_review: bool = False,
) -> float:
    """Outcome-conditional short-term weight (v3, ROUTING_DECISION_RULE.md)."""
    return _routed_short_term_weight(
        elapsed_seconds,
        previous_recalled,
        is_first_predictive_review,
        post_failure_start=POST_FAILURE_TRANSITION_START_SECONDS_V3,
        post_failure_end=POST_FAILURE_TRANSITION_END_SECONDS_V3,
        post_success_start=POST_SUCCESS_TRANSITION_START_SECONDS_V3,
        post_success_end=POST_SUCCESS_TRANSITION_END_SECONDS_V3,
    )


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
