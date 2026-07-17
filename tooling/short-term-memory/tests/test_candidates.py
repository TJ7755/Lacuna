from __future__ import annotations

from dataclasses import replace

import pyarrow as pa
import pytest

from stm_harness.candidates.actr import ActrCandidate
from stm_harness.candidates.common import routed_short_term_weight
from stm_harness.candidates.fsrs6 import Fsrs6Candidate
from stm_harness.candidates.half_life import HalfLifeLogisticCandidate
from stm_harness.candidates.half_life_v2 import HalfLifeLogisticV2Candidate
from stm_harness.contract import Example, PredictionContext
from stm_harness.io import EXAMPLE_SCHEMA


def example(
    source_index: int,
    elapsed_seconds: int,
    rating: int,
    *,
    card_id: int = 1,
    prior_reviews: int = 0,
    prior_successes: int = 0,
    prior_failures: int = 0,
    previous: bool | None = None,
    state: int = 1,
    user_id: int = 1,
) -> Example:
    return Example(
        context=PredictionContext(
            user_id=user_id,
            source_index=source_index,
            card_id=card_id,
            review_index=prior_reviews,
            elapsed_seconds=elapsed_seconds,
            state=state,
            is_first_predictive_review=prior_reviews == 1,
            prior_review_count=prior_reviews,
            prior_success_count=prior_successes,
            prior_failure_count=prior_failures,
            previous_recalled=previous,
        ),
        rating=rating,
        recalled=rating > 1,
        duration_ms=1_000,
        is_seed=elapsed_seconds == -1,
        split="train",
    )


def training_stream() -> list[Example]:
    return [
        example(0, -1, 3),
        example(1, 0, 1, prior_reviews=1, prior_successes=1, previous=True),
        example(
            2,
            60,
            3,
            prior_reviews=2,
            prior_successes=1,
            prior_failures=1,
            previous=False,
        ),
        example(
            3,
            3_600,
            1,
            prior_reviews=3,
            prior_successes=2,
            prior_failures=1,
            previous=True,
        ),
        example(
            4,
            86_400,
            3,
            prior_reviews=4,
            prior_successes=2,
            prior_failures=2,
            previous=False,
            state=2,
        ),
    ]


def training_batch() -> pa.RecordBatch:
    rows = []
    for item in training_stream() * 8:
        context = item.context
        rows.append(
            {
                "user_id": context.user_id,
                "source_index": context.source_index,
                "card_id": context.card_id,
                "review_index": context.review_index,
                "elapsed_seconds": context.elapsed_seconds,
                "rating": item.rating,
                "recalled": item.recalled,
                "state": context.state,
                "duration_ms": item.duration_ms,
                "is_seed": item.is_seed,
                "is_first_predictive_review": context.is_first_predictive_review,
                "prior_review_count": context.prior_review_count,
                "prior_success_count": context.prior_success_count,
                "prior_failure_count": context.prior_failure_count,
                "previous_recalled": context.previous_recalled,
                "split": item.split,
            }
        )
    return pa.Table.from_pylist(rows, schema=EXAMPLE_SCHEMA).to_batches()[0]


def test_fsrs_baseline_zero_second_and_observation_ordering():
    predictor = Fsrs6Candidate().fit([]).new_predictor(1)
    seed = training_stream()[0]
    predictor.observe(seed)
    zero_second = training_stream()[1]
    assert predictor.predict(zero_second.context) == pytest.approx(1 - 1e-9)
    predictor.observe(zero_second)
    with pytest.raises(ValueError, match="duplicated"):
        predictor.observe(zero_second)


def test_half_life_fit_is_deterministic_and_falls_back_for_corrupt_context():
    first = HalfLifeLogisticCandidate().fit_batches([training_batch()])
    second = HalfLifeLogisticCandidate().fit_batches([training_batch()])
    assert first.coefficients == second.coefficients
    predictor = first.new_predictor(1)
    predictor.observe(training_stream()[0])
    context = training_stream()[1].context
    assert 0 < predictor.predict(context) < 1
    predictor.observe(training_stream()[1])
    corrupt = replace(training_stream()[2].context, prior_failure_count=-1)
    assert 0 < predictor.predict(corrupt) < 1


def test_routed_short_term_weight_post_failure_matches_v1_boundaries():
    # Post-failure path is unchanged from v1: full weight through 518,400 s, 0 from
    # 604,800 s, smoothstep strictly between.
    assert routed_short_term_weight(518_400, previous_recalled=False) == pytest.approx(1.0)
    assert routed_short_term_weight(518_401, previous_recalled=False) < 1.0
    assert routed_short_term_weight(604_799, previous_recalled=False) > 0.0
    assert routed_short_term_weight(604_800, previous_recalled=False) == pytest.approx(0.0)
    assert routed_short_term_weight(1_000_000, previous_recalled=False) == pytest.approx(0.0)
    mid = routed_short_term_weight(561_600, previous_recalled=False)
    assert 0.0 < mid < 1.0


def test_routed_short_term_weight_post_success_decays_by_two_days():
    # Post-success path decays much earlier: full weight through 86,400 s (1 day), 0
    # from 172,800 s (2 days).
    assert routed_short_term_weight(86_400, previous_recalled=True) == pytest.approx(1.0)
    assert routed_short_term_weight(86_401, previous_recalled=True) < 1.0
    assert routed_short_term_weight(172_799, previous_recalled=True) > 0.0
    assert routed_short_term_weight(172_800, previous_recalled=True) == pytest.approx(0.0)
    assert routed_short_term_weight(400_000, previous_recalled=True) == pytest.approx(0.0)
    # Well past the post-failure transition end, the post-success path is already zero:
    # the two paths do not converge back onto v1's single boundary.
    assert routed_short_term_weight(518_400, previous_recalled=True) == pytest.approx(0.0)


def test_routed_short_term_weight_first_predictive_review_uses_success_path():
    # A first predictive review is routed onto the success path even if the seed
    # review that set previous_recalled happened to be a failure.
    assert routed_short_term_weight(
        86_400, previous_recalled=False, is_first_predictive_review=True
    ) == pytest.approx(1.0)
    assert routed_short_term_weight(
        172_800, previous_recalled=False, is_first_predictive_review=True
    ) == pytest.approx(0.0)
    # No previous review at all (previous_recalled is None) also routes onto the
    # success path, regardless of the first-review flag.
    assert routed_short_term_weight(86_400, previous_recalled=None) == pytest.approx(1.0)
    assert routed_short_term_weight(172_800, previous_recalled=None) == pytest.approx(0.0)


def test_half_life_v2_fit_matches_v1_coefficients_and_routes_by_previous_outcome():
    v1 = HalfLifeLogisticCandidate().fit_batches([training_batch()])
    v2 = HalfLifeLogisticV2Candidate().fit_batches([training_batch()])
    assert v2.coefficients == v1.coefficients

    predictor = v2.new_predictor(1)
    predictor.observe(training_stream()[0])
    context = training_stream()[1].context
    assert 0 < predictor.predict(context) < 1
    predictor.observe(training_stream()[1])
    corrupt = replace(training_stream()[2].context, prior_failure_count=-1)
    assert 0 < predictor.predict(corrupt) < 1


def test_actr_fit_is_deterministic_and_transitions_to_fsrs_at_seven_days():
    first = ActrCandidate().fit(training_stream())
    second = ActrCandidate().fit(training_stream())
    assert first.coefficients == second.coefficients
    predictor = first.new_predictor(1)
    predictor.observe(training_stream()[0])
    context = replace(training_stream()[1].context, elapsed_seconds=604_800)
    probability = predictor.predict(context)
    baseline = predictor.baseline.probability(context)
    assert probability == pytest.approx(baseline)
    predictor.observe(replace(training_stream()[1], context=context))


def test_every_candidate_handles_zero_seconds_long_lags_corruption_and_exactly_once():
    fitted_candidates = [
        Fsrs6Candidate().fit(training_stream()),
        HalfLifeLogisticCandidate().fit_batches([training_batch()]),
        HalfLifeLogisticV2Candidate().fit_batches([training_batch()]),
        ActrCandidate().fit(training_stream()),
    ]
    for fitted in fitted_candidates:
        predictor = fitted.new_predictor(1)
        predictor.observe(training_stream()[0])
        zero_second = training_stream()[1]
        assert 0 < predictor.predict(zero_second.context) < 1
        predictor.observe(zero_second)
        with pytest.raises(ValueError, match="duplicated"):
            predictor.observe(zero_second)

        predictor = fitted.new_predictor(1)
        predictor.observe(training_stream()[0])
        long_lag = replace(training_stream()[1].context, elapsed_seconds=10_000_000)
        assert 0 < predictor.predict(long_lag) < 1

        predictor = fitted.new_predictor(1)
        predictor.observe(training_stream()[0])
        corrupt = replace(
            training_stream()[1].context,
            state=99,
            previous_recalled=None,
            prior_failure_count=-1,
        )
        assert 0 < predictor.predict(corrupt) < 1
