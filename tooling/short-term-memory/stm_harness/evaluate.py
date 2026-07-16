from __future__ import annotations

import importlib
import json
from collections import defaultdict
from pathlib import Path
from typing import cast

from .contract import Candidate, Example
from .io import (
    iter_examples_from_paths,
    iter_partition_examples,
    iter_partition_paths,
    iter_training_batches,
    sha256_file,
)
from .metrics import LAG_BUCKETS, MetricAccumulator, lag_bucket


def load_candidate(reference: str) -> Candidate:
    module_name, separator, attribute_name = reference.partition(":")
    if not separator:
        raise ValueError("candidate reference must use module:attribute syntax")
    candidate = getattr(importlib.import_module(module_name), attribute_name)
    if callable(candidate) and not (
        hasattr(candidate, "fit") or hasattr(candidate, "fit_batches")
    ):
        candidate = candidate()
    if not (hasattr(candidate, "fit") or hasattr(candidate, "fit_batches")) or not hasattr(
        candidate, "name"
    ):
        raise TypeError("candidate must implement the Candidate contract")
    return cast(Candidate, candidate)


def evaluate_candidate(candidate: Candidate, examples_root: Path) -> dict[str, object]:
    paths = list(iter_partition_paths(examples_root))
    if hasattr(candidate, "fit_batches"):
        fitted = candidate.fit_batches(iter_training_batches(paths))
    else:
        fitted = candidate.fit(iter_examples_from_paths(paths, split="train"))
    accumulators: dict[tuple[str, str], MetricAccumulator] = defaultdict(MetricAccumulator)
    for key in _empty_slice_keys():
        accumulators[key]
    excluded = {"seed_events": 0, "training_events": 0, "lag_over_7d": 0}

    for path in paths:
        user_id = int(path.parent.name.removeprefix("user_id="))
        predictor = fitted.new_predictor(user_id)
        for example in iter_partition_examples(path):
            if example.is_seed:
                excluded["seed_events"] += 1
                predictor.observe(example)
                continue
            if example.split != "holdout":
                excluded["training_events"] += 1
                predictor.observe(example)
                continue
            bucket = lag_bucket(example.context.elapsed_seconds)
            if bucket is None:
                excluded["lag_over_7d"] += 1
            else:
                probability = predictor.predict(example.context)
                for dimension, value in _slice_keys(example, bucket):
                    accumulators[(dimension, value)].add(probability, example.recalled)
            predictor.observe(example)

    slices = [
        {"dimension": dimension, "value": value, **accumulator.result()}
        for (dimension, value), accumulator in sorted(accumulators.items())
    ]
    return {
        "candidate": fitted.name,
        "protocol": {
            "holdout": "per-user chronological suffix",
            "lag_range_seconds": [0, 604_800],
            "calibration_error": "10-bin equal-width expected calibration error",
        },
        "dataset": _dataset_metadata(examples_root),
        "excluded": excluded,
        "slices": slices,
    }


def write_report(report: dict[str, object], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _slice_keys(example: Example, bucket: str) -> list[tuple[str, str]]:
    context = example.context
    first = "first" if context.is_first_predictive_review else "later"
    if context.previous_recalled is None:
        raise ValueError("predictive example has no preceding outcome")
    previous = "success" if context.previous_recalled else "failure"
    if context.prior_success_count and context.prior_failure_count:
        history = "mixed"
    elif context.prior_failure_count:
        history = "failure_only"
    else:
        history = "success_only"
    return [
        ("overall", "all"),
        ("lag", bucket),
        ("first_predictive_review", first),
        ("previous_outcome", previous),
        ("outcome_history", history),
        ("lag_x_first_predictive_review", f"{bucket}|{first}"),
        ("lag_x_previous_outcome", f"{bucket}|{previous}"),
    ]


def _empty_slice_keys() -> list[tuple[str, str]]:
    buckets = [label for label, _, _ in LAG_BUCKETS]
    keys = [("overall", "all")]
    keys.extend(("lag", bucket) for bucket in buckets)
    keys.extend(("first_predictive_review", value) for value in ("first", "later"))
    keys.extend(("previous_outcome", value) for value in ("success", "failure"))
    keys.extend(("outcome_history", value) for value in ("success_only", "failure_only", "mixed"))
    keys.extend(
        ("lag_x_first_predictive_review", f"{bucket}|{value}")
        for bucket in buckets
        for value in ("first", "later")
    )
    keys.extend(
        ("lag_x_previous_outcome", f"{bucket}|{value}")
        for bucket in buckets
        for value in ("success", "failure")
    )
    return keys


def _dataset_metadata(examples_root: Path) -> dict[str, object] | None:
    path = examples_root / "manifest.json"
    if not path.exists():
        return None
    manifest = json.loads(path.read_text(encoding="utf-8"))
    source = manifest.get("source_manifest") or {}
    users = manifest.get("users") or []
    return {
        "examples_manifest_sha256": sha256_file(path),
        "schema_version": manifest.get("schema_version"),
        "dataset": source.get("dataset"),
        "revision": source.get("revision"),
        "holdout_fraction": manifest.get("holdout_fraction"),
        "minimum_train_examples": manifest.get("minimum_train_examples"),
        "minimum_holdout_examples": manifest.get("minimum_holdout_examples"),
        "user_count": len(users),
        "user_ids": [user.get("user_id") for user in users],
    }
