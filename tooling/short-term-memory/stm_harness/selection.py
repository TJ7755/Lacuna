from __future__ import annotations

import json
import random
import statistics
from pathlib import Path


MAJOR_BUCKET_MINIMUM_FRACTION = 0.05
MATERIAL_CALIBRATION_INCREASE = 0.01

# Fixed seed so bootstrap confidence intervals are reproducible across runs.
BOOTSTRAP_SEED = 20260717
BOOTSTRAP_RESAMPLES = 10_000


def read_report(path: Path) -> dict[str, object]:
    report = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(report, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return report


def compare_reports(
    baseline: dict[str, object], candidates: list[dict[str, object]]
) -> dict[str, object]:
    baseline_slices = _slice_index(baseline)
    baseline_overall = baseline_slices[("overall", "all")]
    overall_count = int(baseline_overall["count"])
    major_lags = sorted(
        value
        for (dimension, value), metrics in baseline_slices.items()
        if dimension == "lag"
        and int(metrics["count"]) >= overall_count * MAJOR_BUCKET_MINIMUM_FRACTION
    )
    comparisons = []
    for candidate in candidates:
        if candidate.get("dataset") != baseline.get("dataset"):
            raise ValueError("candidate and baseline reports use different datasets")
        candidate_slices = _slice_index(candidate)
        overall = candidate_slices[("overall", "all")]
        regressions = []
        for lag in major_lags:
            baseline_ece = baseline_slices[("lag", lag)]["calibration_error"]
            candidate_ece = candidate_slices[("lag", lag)]["calibration_error"]
            if baseline_ece is None or candidate_ece is None:
                continue
            increase = float(candidate_ece) - float(baseline_ece)
            if increase > MATERIAL_CALIBRATION_INCREASE:
                regressions.append({"lag": lag, "calibration_error_increase": increase})
        beats_log_loss = float(overall["log_loss"]) < float(baseline_overall["log_loss"])
        beats_brier = float(overall["brier_score"]) < float(baseline_overall["brier_score"])
        comparisons.append(
            {
                "candidate": candidate["candidate"],
                "passes": beats_log_loss and beats_brier and not regressions,
                "beats_overall_log_loss": beats_log_loss,
                "beats_overall_brier": beats_brier,
                "material_calibration_regressions": regressions,
                "overall": overall,
                "overall_delta": _metric_deltas(overall, baseline_overall),
                "per_user": _per_user_comparison(baseline, candidate),
                "slice_deltas": [
                    {
                        "dimension": dimension,
                        "value": value,
                        "candidate": metrics,
                        "baseline": baseline_slices[(dimension, value)],
                        "delta": _metric_deltas(
                            metrics, baseline_slices[(dimension, value)]
                        ),
                    }
                    for (dimension, value), metrics in sorted(candidate_slices.items())
                ],
            }
        )
    passing = [comparison for comparison in comparisons if comparison["passes"]]
    selected = min(
        passing,
        key=lambda item: (
            item["overall"]["log_loss"],
            item["overall"]["brier_score"],
            item["candidate"],
        ),
        default=None,
    )
    return {
        "rule": {
            "overall": "strictly lower log loss and Brier score than FSRS-6",
            "major_lag_bucket": (
                f"at least {MAJOR_BUCKET_MINIMUM_FRACTION:.0%} of scored hold-out events"
            ),
            "material_calibration_regression": (
                f"expected calibration error increase greater than "
                f"{MATERIAL_CALIBRATION_INCREASE:.3f}"
            ),
            "defined_before_final_comparison": True,
        },
        "baseline": baseline["candidate"],
        "major_lag_buckets": major_lags,
        "comparisons": comparisons,
        "selected": None if selected is None else selected["candidate"],
        "gate_passed": selected is not None,
    }


def write_selection(report: dict[str, object], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _slice_index(report: dict[str, object]) -> dict[tuple[str, str], dict[str, object]]:
    return {
        (str(item["dimension"]), str(item["value"])): item
        for item in report["slices"]
    }


def _per_user_index(report: dict[str, object]) -> dict[int, dict[str, object]] | None:
    per_user = report.get("per_user")
    if per_user is None:
        return None
    return {
        int(item["user_id"]): item
        for item in per_user
        if item.get("count") not in (None, 0)
    }


def _per_user_comparison(
    baseline: dict[str, object], candidate: dict[str, object]
) -> dict[str, object] | None:
    baseline_users = _per_user_index(baseline)
    candidate_users = _per_user_index(candidate)
    if baseline_users is None or candidate_users is None:
        return None
    common_user_ids = sorted(set(baseline_users) & set(candidate_users))
    if not common_user_ids:
        return None

    baseline_log_loss = [float(baseline_users[uid]["log_loss"]) for uid in common_user_ids]
    candidate_log_loss = [float(candidate_users[uid]["log_loss"]) for uid in common_user_ids]
    baseline_brier = [float(baseline_users[uid]["brier_score"]) for uid in common_user_ids]
    candidate_brier = [float(candidate_users[uid]["brier_score"]) for uid in common_user_ids]

    # Positive improvement means the candidate has lower (better) log loss than the baseline.
    improvements = [b - c for b, c in zip(baseline_log_loss, candidate_log_loss)]

    return {
        "user_count": len(common_user_ids),
        "median_log_loss_improvement": statistics.median(improvements),
        "candidate_win_proportion": sum(1 for value in improvements if value > 0)
        / len(improvements),
        "equal_user_weight": {
            "baseline_log_loss": statistics.fmean(baseline_log_loss),
            "candidate_log_loss": statistics.fmean(candidate_log_loss),
            "baseline_brier_score": statistics.fmean(baseline_brier),
            "candidate_brier_score": statistics.fmean(candidate_brier),
        },
        "mean_log_loss_improvement_bootstrap_ci": _bootstrap_mean_ci(improvements),
    }


def _bootstrap_mean_ci(
    values: list[float],
    resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, object]:
    """User-cluster bootstrap 95% CI for the mean of `values`.

    Resamples users (not events) with replacement, using a fixed seed so the interval is
    reproducible across runs. `values` must already be one value per user (e.g. a per-user
    log-loss difference), since events within a user are correlated.
    """
    rng = random.Random(seed)
    count = len(values)
    means = []
    for _ in range(resamples):
        sample = [values[rng.randrange(count)] for _ in range(count)]
        means.append(statistics.fmean(sample))
    means.sort()
    lower_index = int(0.025 * resamples)
    upper_index = min(int(0.975 * resamples), resamples - 1)
    return {
        "mean": statistics.fmean(values),
        "lower": means[lower_index],
        "upper": means[upper_index],
        "resamples": resamples,
        "seed": seed,
    }


def _metric_deltas(
    candidate: dict[str, object], baseline: dict[str, object]
) -> dict[str, float | None]:
    result: dict[str, float | None] = {}
    for metric in ("log_loss", "brier_score", "calibration_error"):
        candidate_value = candidate[metric]
        baseline_value = baseline[metric]
        result[metric] = (
            None
            if candidate_value is None or baseline_value is None
            else float(candidate_value) - float(baseline_value)
        )
    return result
