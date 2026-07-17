import pytest

from stm_harness.selection import _bootstrap_mean_ci, compare_reports


def report(name, overall, major_ece, minor_ece=0.02, per_user=None):
    result = {
        "candidate": name,
        "dataset": {"revision": "fixture"},
        "slices": [
            {
                "dimension": "overall",
                "value": "all",
                "count": 1_000,
                "log_loss": overall[0],
                "brier_score": overall[1],
                "calibration_error": overall[2],
            },
            {
                "dimension": "lag",
                "value": "<1m",
                "count": 900,
                "log_loss": 0.4,
                "brier_score": 0.13,
                "calibration_error": major_ece,
            },
            {
                "dimension": "lag",
                "value": "1-10m",
                "count": 20,
                "log_loss": 0.4,
                "brier_score": 0.13,
                "calibration_error": minor_ece,
            },
        ],
    }
    if per_user is not None:
        result["per_user"] = per_user
    return result


def user_metrics(user_id, count, log_loss, brier_score):
    return {
        "user_id": user_id,
        "count": count,
        "positive_rate": 0.5,
        "log_loss": log_loss,
        "brier_score": brier_score,
        "calibration_error": 0.0,
        "calibration_bins": [],
    }


def test_selection_requires_both_losses_and_major_bucket_calibration():
    baseline = report("baseline", (0.5, 0.16, 0.03), 0.02)
    passing = report("passing", (0.45, 0.14, 0.03), 0.029)
    regressed = report("regressed", (0.44, 0.13, 0.04), 0.031)
    result = compare_reports(baseline, [passing, regressed])

    assert result["major_lag_buckets"] == ["<1m"]
    assert result["selected"] == "passing"
    assert result["comparisons"][0]["passes"] is True
    assert result["comparisons"][1]["passes"] is False
    assert result["comparisons"][0]["per_user"] is None


def test_per_user_comparison_missing_data_is_none():
    baseline = report("baseline", (0.5, 0.16, 0.03), 0.02)
    candidate = report("candidate", (0.45, 0.14, 0.03), 0.029)
    result = compare_reports(baseline, [candidate])

    assert result["comparisons"][0]["per_user"] is None


def test_per_user_comparison_computes_win_rate_and_equal_weighting():
    baseline = report(
        "baseline",
        (0.5, 0.16, 0.03),
        0.02,
        per_user=[
            user_metrics(1, count=100, log_loss=0.8, brier_score=0.3),
            user_metrics(2, count=100, log_loss=0.4, brier_score=0.1),
            user_metrics(3, count=100, log_loss=0.6, brier_score=0.2),
        ],
    )
    candidate = report(
        "candidate",
        (0.45, 0.14, 0.03),
        0.029,
        per_user=[
            # User 1 improves a lot, user 2 gets slightly worse, user 3 ties.
            user_metrics(1, count=100, log_loss=0.2, brier_score=0.05),
            user_metrics(2, count=100, log_loss=0.5, brier_score=0.15),
            user_metrics(3, count=100, log_loss=0.6, brier_score=0.2),
        ],
    )
    result = compare_reports(baseline, [candidate])
    per_user = result["comparisons"][0]["per_user"]

    assert per_user["user_count"] == 3
    # Improvements (baseline - candidate): user1=0.6, user2=-0.1, user3=0.0
    assert per_user["median_log_loss_improvement"] == 0.0
    assert per_user["candidate_win_proportion"] == 1 / 3
    assert per_user["equal_user_weight"]["baseline_log_loss"] == pytest.approx((0.8 + 0.4 + 0.6) / 3)
    assert per_user["equal_user_weight"]["candidate_log_loss"] == pytest.approx(
        (0.2 + 0.5 + 0.6) / 3
    )
    ci = per_user["mean_log_loss_improvement_bootstrap_ci"]
    assert ci["mean"] == pytest.approx((0.6 - 0.1 + 0.0) / 3)
    assert ci["lower"] <= ci["mean"] <= ci["upper"]


def test_per_user_comparison_only_uses_users_common_to_both_reports():
    baseline = report(
        "baseline",
        (0.5, 0.16, 0.03),
        0.02,
        per_user=[
            user_metrics(1, count=100, log_loss=0.5, brier_score=0.2),
            user_metrics(2, count=0, log_loss=None, brier_score=None),
        ],
    )
    candidate = report(
        "candidate",
        (0.45, 0.14, 0.03),
        0.029,
        per_user=[
            user_metrics(1, count=100, log_loss=0.3, brier_score=0.1),
            user_metrics(3, count=100, log_loss=0.4, brier_score=0.15),
        ],
    )
    result = compare_reports(baseline, [candidate])
    per_user = result["comparisons"][0]["per_user"]

    assert per_user["user_count"] == 1
    assert per_user["candidate_win_proportion"] == 1.0


def test_bootstrap_mean_ci_is_degenerate_for_identical_values():
    ci = _bootstrap_mean_ci([0.1, 0.1, 0.1, 0.1])
    assert ci["mean"] == pytest.approx(0.1)
    assert ci["lower"] == pytest.approx(0.1)
    assert ci["upper"] == pytest.approx(0.1)


def test_bootstrap_mean_ci_is_reproducible_and_brackets_the_mean():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    first = _bootstrap_mean_ci(values)
    second = _bootstrap_mean_ci(values)

    assert first == second
    assert first["lower"] < first["mean"] < first["upper"]
