from __future__ import annotations

import json
from dataclasses import replace

import pyarrow as pa
import pytest

from stm_harness.candidates.actr import ActrCandidate
from stm_harness.candidates.common import routed_short_term_weight, routed_short_term_weight_v3
from stm_harness.candidates.fsrs6 import Fsrs6Candidate, Fsrs6Predictor
from stm_harness.candidates.fsrs6_fractional import Fsrs6FractionalCandidate
from stm_harness.candidates.half_life import HalfLifeLogisticCandidate
from stm_harness.candidates.half_life_frozen import (
    COEFFICIENTS_PATH,
    HalfLifeLogisticFrozenCandidate,
)
from stm_harness.candidates.half_life_frozen_v3 import HalfLifeLogisticFrozenV3Candidate
from stm_harness.candidates.half_life_v2 import (
    FittedHalfLifeLogisticV2,
    HalfLifeLogisticV2Candidate,
)
from stm_harness.candidates.half_life_v3 import (
    FittedHalfLifeLogisticV3,
    HalfLifeLogisticV3Candidate,
)
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


def test_fsrs_baseline_fractional_retrievability_matches_runtime_blend():
    # half_life.py/half_life_v2.py's internal FSRS baseline must query retrievability
    # with fractional elapsed days, mirroring src/fsrs/halfLifeLogisticModel.ts's
    # `predict()` (fractional-day forgetting curve), not the whole-day floor the
    # standalone `fsrs6` benchmark candidate uses.
    seed = training_stream()[0]

    def predictor_at(elapsed_seconds: int, *, fractional: bool):
        predictor = Fsrs6Predictor(1, fractional_retrievability=fractional)
        predictor.observe(seed)
        context = replace(training_stream()[1].context, elapsed_seconds=elapsed_seconds)
        return predictor.predict(context)

    # 1.5 days elapsed: floor(1.5) == 1 day, so the two baselines must diverge.
    elapsed = int(1.5 * 86_400)
    assert predictor_at(elapsed, fractional=False) != pytest.approx(
        predictor_at(elapsed, fractional=True)
    )
    # At a whole-day boundary the two must agree exactly.
    whole_day = 2 * 86_400
    assert predictor_at(whole_day, fractional=False) == pytest.approx(
        predictor_at(whole_day, fractional=True)
    )


def test_fsrs6_fractional_candidate_wiring_matches_fractional_flag():
    # Covers the candidate wiring itself (not the flag, which the test above
    # already covers): `fsrs6_fractional`'s fitted predictor must behave
    # identically to Fsrs6Predictor(fractional_retrievability=True), diverging
    # from the floored `fsrs6` candidate mid-day and agreeing at whole-day
    # boundaries.
    seed = training_stream()[0]

    def predict_with(new_predictor, elapsed_seconds: int):
        predictor = new_predictor(1)
        predictor.observe(seed)
        context = replace(training_stream()[1].context, elapsed_seconds=elapsed_seconds)
        return predictor.predict(context)

    floored_fitted = Fsrs6Candidate().fit([])
    fractional_fitted = Fsrs6FractionalCandidate().fit([])
    fractional_predictor = fractional_fitted.new_predictor(1)
    assert isinstance(fractional_predictor, Fsrs6Predictor)
    assert fractional_predictor._fractional_retrievability is True

    mid_day = int(1.5 * 86_400)
    assert predict_with(floored_fitted.new_predictor, mid_day) != pytest.approx(
        predict_with(fractional_fitted.new_predictor, mid_day)
    )
    whole_day = 2 * 86_400
    assert predict_with(floored_fitted.new_predictor, whole_day) == pytest.approx(
        predict_with(fractional_fitted.new_predictor, whole_day)
    )


def test_half_life_predictors_use_fractional_fsrs_baseline():
    # Confirms the wiring: half_life/half_life_v2's `.baseline` must be constructed
    # with fractional_retrievability=True, not the harness default.
    v1 = HalfLifeLogisticCandidate().fit_batches([training_batch()])
    v2 = HalfLifeLogisticV2Candidate().fit_batches([training_batch()])
    for fitted in (v1, v2):
        predictor = fitted.new_predictor(1)
        assert predictor.baseline._fractional_retrievability is True


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


def test_half_life_frozen_matches_v2_predictions_given_same_coefficients():
    # VALIDATION_PLAN.md phase 3: the frozen candidate must predict exactly like
    # half_life_v2 when both use the same coefficients, since it reuses
    # HalfLifeLogisticV2Predictor unmodified.
    v2_fitted = HalfLifeLogisticV2Candidate().fit_batches([training_batch()])
    frozen_fitted = FittedHalfLifeLogisticV2(
        v2_fitted.coefficients, 0, name="half-life-logistic-frozen-v2"
    )

    v2_predictor = v2_fitted.new_predictor(1)
    frozen_predictor = frozen_fitted.new_predictor(1)
    v2_predictor.observe(training_stream()[0])
    frozen_predictor.observe(training_stream()[0])
    for later in training_stream()[1:]:
        assert v2_predictor.predict(later.context) == pytest.approx(
            frozen_predictor.predict(later.context)
        )
        v2_predictor.observe(later)
        frozen_predictor.observe(later)


def test_half_life_frozen_loads_shipped_artefact_and_consumes_no_training_data():
    fitted = HalfLifeLogisticFrozenCandidate().fit_batches(_raising_training_batches())
    payload = json.loads(COEFFICIENTS_PATH.read_text())
    assert fitted.coefficients == tuple(payload["coefficients"])
    assert fitted.training_examples == 0
    assert fitted.name == "half-life-logistic-frozen-v2"


def test_routed_short_term_weight_v3_post_success_decays_by_one_day():
    # ROUTING_DECISION_RULE.md v3 success/first-review/no-history path: full weight
    # through 21,600 s (6 hours), 0 from 86,400 s (1 day).
    assert routed_short_term_weight_v3(21_600, previous_recalled=True) == pytest.approx(1.0)
    assert routed_short_term_weight_v3(21_601, previous_recalled=True) < 1.0
    assert routed_short_term_weight_v3(86_399, previous_recalled=True) > 0.0
    assert routed_short_term_weight_v3(86_400, previous_recalled=True) == pytest.approx(0.0)
    assert routed_short_term_weight_v3(200_000, previous_recalled=True) == pytest.approx(0.0)
    # First predictive review and no-previous-outcome route onto the same path.
    assert routed_short_term_weight_v3(
        21_600, previous_recalled=False, is_first_predictive_review=True
    ) == pytest.approx(1.0)
    assert routed_short_term_weight_v3(
        86_400, previous_recalled=False, is_first_predictive_review=True
    ) == pytest.approx(0.0)
    assert routed_short_term_weight_v3(21_600, previous_recalled=None) == pytest.approx(1.0)
    assert routed_short_term_weight_v3(86_400, previous_recalled=None) == pytest.approx(0.0)


def test_routed_short_term_weight_v3_post_failure_decays_by_five_days():
    # v3 failure path: full weight through 345,600 s (4 days), 0 from 432,000 s (5 days) —
    # the last bucket both transfer cohorts supported per ROUTING_DECISION_RULE.md.
    assert routed_short_term_weight_v3(345_600, previous_recalled=False) == pytest.approx(1.0)
    assert routed_short_term_weight_v3(345_601, previous_recalled=False) < 1.0
    assert routed_short_term_weight_v3(431_999, previous_recalled=False) > 0.0
    assert routed_short_term_weight_v3(432_000, previous_recalled=False) == pytest.approx(0.0)
    assert routed_short_term_weight_v3(1_000_000, previous_recalled=False) == pytest.approx(0.0)
    mid = routed_short_term_weight_v3(388_800, previous_recalled=False)
    assert 0.0 < mid < 1.0


def test_half_life_v3_fit_matches_v1_coefficients_and_routes_by_previous_outcome():
    v1 = HalfLifeLogisticCandidate().fit_batches([training_batch()])
    v3 = HalfLifeLogisticV3Candidate().fit_batches([training_batch()])
    assert v3.coefficients == v1.coefficients

    predictor = v3.new_predictor(1)
    predictor.observe(training_stream()[0])
    context = training_stream()[1].context
    assert 0 < predictor.predict(context) < 1
    predictor.observe(training_stream()[1])
    corrupt = replace(training_stream()[2].context, prior_failure_count=-1)
    assert 0 < predictor.predict(corrupt) < 1


def test_half_life_frozen_v3_matches_v3_predictions_given_same_coefficients():
    # frozen v3 must predict exactly like half_life_v3 when both use the same
    # coefficients, since it reuses HalfLifeLogisticV3Predictor unmodified.
    v3_fitted = HalfLifeLogisticV3Candidate().fit_batches([training_batch()])
    frozen_fitted = FittedHalfLifeLogisticV3(
        v3_fitted.coefficients, 0, name="half-life-logistic-frozen-v3"
    )

    v3_predictor = v3_fitted.new_predictor(1)
    frozen_predictor = frozen_fitted.new_predictor(1)
    v3_predictor.observe(training_stream()[0])
    frozen_predictor.observe(training_stream()[0])
    for later in training_stream()[1:]:
        assert v3_predictor.predict(later.context) == pytest.approx(
            frozen_predictor.predict(later.context)
        )
        v3_predictor.observe(later)
        frozen_predictor.observe(later)


def test_half_life_frozen_v3_loads_shipped_artefact_and_consumes_no_training_data():
    fitted = HalfLifeLogisticFrozenV3Candidate().fit_batches(_raising_training_batches())
    payload = json.loads(COEFFICIENTS_PATH.read_text())
    assert fitted.coefficients == tuple(payload["coefficients"])
    assert fitted.training_examples == 0
    assert fitted.name == "half-life-logistic-frozen-v3"


def _raising_training_batches():
    # Any iteration of the training batches (not just consumption of their contents)
    # would prove the "no training data" contract broken, since fit_batches is only
    # supposed to read the frozen coefficients file.
    def generator():
        raise AssertionError("frozen candidate must not iterate training batches")
        yield  # pragma: no cover - unreachable, keeps this a generator function

    return generator()


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
