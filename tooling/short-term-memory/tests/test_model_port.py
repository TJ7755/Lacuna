import json
from pathlib import Path

import pytest

from stm_harness.candidates.fsrs6 import MemoryState
from stm_harness.candidates.half_life_frozen_v3 import candidate
from stm_harness.contract import PredictionContext


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "model-port-v3.json").read_text())


def test_frozen_python_candidate_matches_shipped_model_and_shared_predictions():
    shipped = json.loads((ROOT / "coefficients" / "half-life-logistic-v3.json").read_text())
    fitted = candidate.fit_batches([])
    assert FIXTURE["model"] == shipped["candidate"]
    assert fitted.coefficients == tuple(shipped["coefficients"])
    assert FIXTURE["decay"] == -0.1542

    for case in FIXTURE["cases"]:
        history = case["history"]
        predictor = fitted.new_predictor(1)
        predictor.baseline.cards[1] = MemoryState(
            difficulty=5, stability=case["stability_days"]
        )
        context = PredictionContext(
            user_id=1,
            source_index=1,
            card_id=1,
            review_index=len(history),
            elapsed_seconds=case["elapsed_seconds"],
            state=case["state"],
            is_first_predictive_review=len(history) == 1,
            prior_review_count=len(history),
            prior_success_count=sum(history),
            prior_failure_count=len(history) - sum(history),
            previous_recalled=history[0],
        )
        assert predictor.predict(context) == pytest.approx(
            case["probability"], abs=1e-12
        ), case["name"]
