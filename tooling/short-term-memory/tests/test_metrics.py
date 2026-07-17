import math

import pytest

from stm_harness.metrics import MetricAccumulator, lag_bucket


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [
        (0, "<1m"),
        (59, "<1m"),
        (60, "1-10m"),
        (599, "1-10m"),
        (600, "10-60m"),
        (3_599, "10-60m"),
        (3_600, "1-6h"),
        (21_599, "1-6h"),
        (21_600, "6-24h"),
        (86_399, "6-24h"),
        (86_400, "24-36h"),
        (129_599, "24-36h"),
        (129_600, "36-48h"),
        (172_799, "36-48h"),
        (172_800, "2-3d"),
        (259_199, "2-3d"),
        (259_200, "3-4d"),
        (345_599, "3-4d"),
        (345_600, "4-5d"),
        (431_999, "4-5d"),
        (432_000, "5-6d"),
        (518_399, "5-6d"),
        (518_400, "6-7d"),
        (604_800, "6-7d"),
        (604_801, None),
    ],
)
def test_lag_bucket_boundaries(seconds, expected):
    assert lag_bucket(seconds) == expected


def test_metrics_match_known_binary_values():
    accumulator = MetricAccumulator()
    accumulator.add(0.8, True)
    accumulator.add(0.2, False)
    result = accumulator.result()

    assert result["count"] == 2
    assert result["positive_rate"] == 0.5
    assert result["log_loss"] == pytest.approx(-math.log(0.8))
    assert result["brier_score"] == pytest.approx(0.04)
    assert result["calibration_error"] == pytest.approx(0.2)


def test_empty_metrics_are_null_and_invalid_predictions_fail():
    result = MetricAccumulator().result()
    assert result["count"] == 0
    assert result["log_loss"] is None

    for probability in (-0.01, 1.01, math.nan, math.inf):
        with pytest.raises(ValueError, match="invalid probability"):
            MetricAccumulator().add(probability, True)
