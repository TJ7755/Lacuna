from stm_harness.selection import compare_reports


def report(name, overall, major_ece, minor_ece=0.02):
    return {
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


def test_selection_requires_both_losses_and_major_bucket_calibration():
    baseline = report("baseline", (0.5, 0.16, 0.03), 0.02)
    passing = report("passing", (0.45, 0.14, 0.03), 0.029)
    regressed = report("regressed", (0.44, 0.13, 0.04), 0.031)
    result = compare_reports(baseline, [passing, regressed])

    assert result["major_lag_buckets"] == ["<1m"]
    assert result["selected"] == "passing"
    assert result["comparisons"][0]["passes"] is True
    assert result["comparisons"][1]["passes"] is False
