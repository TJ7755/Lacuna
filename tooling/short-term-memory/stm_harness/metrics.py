from __future__ import annotations

import math
from dataclasses import dataclass, field


PROBABILITY_BINS = 10
EPSILON = 1e-15
LAG_BUCKETS = (
    ("<1m", 0, 60),
    ("1-10m", 60, 600),
    ("10-60m", 600, 3_600),
    ("1-6h", 3_600, 21_600),
    ("6-24h", 21_600, 86_400),
    ("1-7d", 86_400, 604_801),
)


def lag_bucket(elapsed_seconds: int) -> str | None:
    for label, lower, upper in LAG_BUCKETS:
        if lower <= elapsed_seconds < upper:
            return label
    return None


@dataclass(slots=True)
class MetricAccumulator:
    count: int = 0
    positives: int = 0
    log_loss_sum: float = 0.0
    brier_sum: float = 0.0
    bin_count: list[int] = field(default_factory=lambda: [0] * PROBABILITY_BINS)
    bin_probability_sum: list[float] = field(default_factory=lambda: [0.0] * PROBABILITY_BINS)
    bin_positive_sum: list[int] = field(default_factory=lambda: [0] * PROBABILITY_BINS)

    def add(self, probability: float, recalled: bool) -> None:
        if not math.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError(f"candidate returned invalid probability: {probability!r}")
        target = int(recalled)
        clipped = min(max(probability, EPSILON), 1 - EPSILON)
        self.count += 1
        self.positives += target
        self.log_loss_sum -= target * math.log(clipped) + (1 - target) * math.log(1 - clipped)
        self.brier_sum += (probability - target) ** 2
        bin_index = min(int(probability * PROBABILITY_BINS), PROBABILITY_BINS - 1)
        self.bin_count[bin_index] += 1
        self.bin_probability_sum[bin_index] += probability
        self.bin_positive_sum[bin_index] += target

    def result(self) -> dict[str, object]:
        if self.count == 0:
            return {
                "count": 0,
                "positive_rate": None,
                "log_loss": None,
                "brier_score": None,
                "calibration_error": None,
                "calibration_bins": [],
            }
        bins: list[dict[str, object]] = []
        calibration_error = 0.0
        for index, count in enumerate(self.bin_count):
            if count == 0:
                continue
            mean_probability = self.bin_probability_sum[index] / count
            observed_rate = self.bin_positive_sum[index] / count
            calibration_error += count / self.count * abs(mean_probability - observed_rate)
            bins.append(
                {
                    "lower": index / PROBABILITY_BINS,
                    "upper": (index + 1) / PROBABILITY_BINS,
                    "count": count,
                    "mean_probability": mean_probability,
                    "observed_rate": observed_rate,
                }
            )
        return {
            "count": self.count,
            "positive_rate": self.positives / self.count,
            "log_loss": self.log_loss_sum / self.count,
            "brier_score": self.brier_sum / self.count,
            "calibration_error": calibration_error,
            "calibration_bins": bins,
        }
