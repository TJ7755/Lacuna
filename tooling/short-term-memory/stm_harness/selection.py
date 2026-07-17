from __future__ import annotations

import json
from pathlib import Path


MAJOR_BUCKET_MINIMUM_FRACTION = 0.05
MATERIAL_CALIBRATION_INCREASE = 0.01


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
