from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .io import EXAMPLE_SCHEMA, ensure_fresh_directory, sha256_file


SOURCE_COLUMNS = {"card_id", "rating", "state", "duration", "elapsed_seconds"}


def build_examples(
    source_root: Path,
    destination: Path,
    *,
    holdout_fraction: float = 0.2,
    minimum_train_examples: int = 1,
    minimum_holdout_examples: int = 1,
) -> dict[str, object]:
    if not 0 < holdout_fraction < 1:
        raise ValueError("holdout_fraction must be between zero and one")
    if minimum_train_examples < 1 or minimum_holdout_examples < 1:
        raise ValueError("minimum example counts must be positive")
    ensure_fresh_directory(destination)
    summary: dict[str, object] = {
        "schema_version": 1,
        "source_manifest": _read_source_manifest(source_root),
        "holdout_fraction": holdout_fraction,
        "minimum_train_examples": minimum_train_examples,
        "minimum_holdout_examples": minimum_holdout_examples,
        "users": [],
    }
    for source_path in _source_partition_paths(source_root):
        user_id = int(source_path.parent.name.removeprefix("user_id="))
        target = destination / f"user_id={user_id}" / "data.parquet"
        stats = _build_user_partition(
            source_path,
            target,
            user_id,
            holdout_fraction=holdout_fraction,
            minimum_train_examples=minimum_train_examples,
            minimum_holdout_examples=minimum_holdout_examples,
        )
        stats["path"] = str(target.relative_to(destination))
        stats["sha256"] = sha256_file(target)
        summary["users"].append(stats)

    destination.mkdir(parents=True, exist_ok=True)
    (destination / "manifest.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return summary


def construct_user_examples(
    user_id: int,
    source_rows: list[dict[str, object]],
    *,
    holdout_fraction: float,
    minimum_train_examples: int,
    minimum_holdout_examples: int,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    invalid_cards = _invalid_card_ids(source_rows)
    valid_rows = [
        (source_index, row)
        for source_index, row in enumerate(source_rows)
        if int(row["card_id"]) not in invalid_cards
    ]
    predictive_indices = [
        index for index, (_, row) in enumerate(valid_rows) if int(row["elapsed_seconds"]) >= 0
    ]
    holdout_count = max(minimum_holdout_examples, math.ceil(len(predictive_indices) * holdout_fraction))
    maximum_holdout = max(0, len(predictive_indices) - minimum_train_examples)
    holdout_count = min(holdout_count, maximum_holdout)
    boundary = predictive_indices[-holdout_count] if holdout_count else len(valid_rows)

    histories: dict[int, dict[str, object]] = defaultdict(
        lambda: {"reviews": 0, "successes": 0, "failures": 0, "previous": None}
    )
    result: list[dict[str, object]] = []
    for filtered_index, (source_index, row) in enumerate(valid_rows):
        card_id = int(row["card_id"])
        elapsed_seconds = int(row["elapsed_seconds"])
        rating = int(row["rating"])
        state = int(row["state"])
        duration = int(row["duration"])
        if rating not in {1, 2, 3, 4} or state not in {0, 1, 2, 3} or not 0 <= duration <= 60_000:
            raise ValueError(f"invalid source value for user {user_id} at row {source_index}")
        history = histories[card_id]
        is_seed = elapsed_seconds == -1
        recalled = rating > 1
        result.append(
            {
                "user_id": user_id,
                "source_index": source_index,
                "card_id": card_id,
                "review_index": int(history["reviews"]),
                "elapsed_seconds": elapsed_seconds,
                "rating": rating,
                "recalled": recalled,
                "state": state,
                "duration_ms": duration,
                "is_seed": is_seed,
                "is_first_predictive_review": not is_seed and int(history["reviews"]) == 1,
                "prior_review_count": int(history["reviews"]),
                "prior_success_count": int(history["successes"]),
                "prior_failure_count": int(history["failures"]),
                "previous_recalled": history["previous"],
                "split": "holdout" if filtered_index >= boundary else "train",
            }
        )
        history["reviews"] = int(history["reviews"]) + 1
        history["successes"] = int(history["successes"]) + int(recalled)
        history["failures"] = int(history["failures"]) + int(not recalled)
        history["previous"] = recalled

    return result, {
        "user_id": user_id,
        "source_rows": len(source_rows),
        "written_rows": len(result),
        "excluded_cards": len(invalid_cards),
        "train_predictive_examples": len(predictive_indices) - holdout_count,
        "holdout_predictive_examples": holdout_count,
    }


def _build_user_partition(
    source: Path,
    destination: Path,
    user_id: int,
    *,
    holdout_fraction: float,
    minimum_train_examples: int,
    minimum_holdout_examples: int,
) -> dict[str, object]:
    parquet = pq.ParquetFile(source)
    missing = SOURCE_COLUMNS - set(parquet.schema_arrow.names)
    if missing:
        raise ValueError(f"{source} is missing columns: {sorted(missing)}")

    invalid_cards, predictive_by_card, source_rows = _scan_source(parquet, user_id)
    predictive_count = sum(
        count for card_id, count in predictive_by_card.items() if card_id not in invalid_cards
    )
    holdout_count = max(minimum_holdout_examples, math.ceil(predictive_count * holdout_fraction))
    holdout_count = min(holdout_count, max(0, predictive_count - minimum_train_examples))
    train_count = predictive_count - holdout_count

    histories: dict[int, dict[str, object]] = defaultdict(
        lambda: {"reviews": 0, "successes": 0, "failures": 0, "previous": None}
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    writer = pq.ParquetWriter(destination, EXAMPLE_SCHEMA, compression="zstd")
    buffer: list[dict[str, object]] = []
    predictive_seen = 0
    holdout_started = False
    written_rows = 0
    try:
        for source_index, row in enumerate(_iter_source_rows(parquet)):
            card_id = int(row["card_id"])
            if card_id in invalid_cards:
                continue
            is_seed = int(row["elapsed_seconds"]) == -1
            if not is_seed and predictive_seen >= train_count:
                holdout_started = True
            split = "holdout" if holdout_started else "train"
            history = histories[card_id]
            buffer.append(_example_row(user_id, source_index, row, history, split))
            _observe_history(history, int(row["rating"]) > 1)
            written_rows += 1
            if not is_seed:
                predictive_seen += 1
            if len(buffer) == 65_536:
                writer.write_table(pa.Table.from_pylist(buffer, schema=EXAMPLE_SCHEMA))
                buffer.clear()
        if buffer:
            writer.write_table(pa.Table.from_pylist(buffer, schema=EXAMPLE_SCHEMA))
    finally:
        writer.close()

    return {
        "user_id": user_id,
        "source_rows": source_rows,
        "written_rows": written_rows,
        "excluded_cards": len(invalid_cards),
        "train_predictive_examples": train_count,
        "holdout_predictive_examples": holdout_count,
    }


def _scan_source(
    parquet: pq.ParquetFile, user_id: int
) -> tuple[set[int], dict[int, int], int]:
    seen: set[int] = set()
    invalid: set[int] = set()
    predictive_by_card: dict[int, int] = defaultdict(int)
    source_rows = 0
    for source_index, row in enumerate(_iter_source_rows(parquet)):
        source_rows += 1
        card_id = int(row["card_id"])
        elapsed = int(row["elapsed_seconds"])
        _validate_source_values(user_id, source_index, row)
        if card_id not in seen:
            seen.add(card_id)
            if elapsed != -1:
                invalid.add(card_id)
        elif elapsed < 0:
            invalid.add(card_id)
        else:
            predictive_by_card[card_id] += 1
    return invalid, predictive_by_card, source_rows


def _iter_source_rows(parquet: pq.ParquetFile):
    for batch in parquet.iter_batches(batch_size=65_536, columns=sorted(SOURCE_COLUMNS)):
        yield from batch.to_pylist()


def _example_row(
    user_id: int,
    source_index: int,
    row: dict[str, object],
    history: dict[str, object],
    split: str,
) -> dict[str, object]:
    elapsed_seconds = int(row["elapsed_seconds"])
    rating = int(row["rating"])
    is_seed = elapsed_seconds == -1
    return {
        "user_id": user_id,
        "source_index": source_index,
        "card_id": int(row["card_id"]),
        "review_index": int(history["reviews"]),
        "elapsed_seconds": elapsed_seconds,
        "rating": rating,
        "recalled": rating > 1,
        "state": int(row["state"]),
        "duration_ms": int(row["duration"]),
        "is_seed": is_seed,
        "is_first_predictive_review": not is_seed and int(history["reviews"]) == 1,
        "prior_review_count": int(history["reviews"]),
        "prior_success_count": int(history["successes"]),
        "prior_failure_count": int(history["failures"]),
        "previous_recalled": history["previous"],
        "split": split,
    }


def _observe_history(history: dict[str, object], recalled: bool) -> None:
    history["reviews"] = int(history["reviews"]) + 1
    history["successes"] = int(history["successes"]) + int(recalled)
    history["failures"] = int(history["failures"]) + int(not recalled)
    history["previous"] = recalled


def _validate_source_values(
    user_id: int, source_index: int, row: dict[str, object]
) -> None:
    rating = int(row["rating"])
    state = int(row["state"])
    duration = int(row["duration"])
    if rating not in {1, 2, 3, 4} or state not in {0, 1, 2, 3} or not 0 <= duration <= 60_000:
        raise ValueError(f"invalid source value for user {user_id} at row {source_index}")


def _invalid_card_ids(rows: list[dict[str, object]]) -> set[int]:
    seen: set[int] = set()
    invalid: set[int] = set()
    for row in rows:
        card_id = int(row["card_id"])
        elapsed = int(row["elapsed_seconds"])
        if card_id not in seen:
            seen.add(card_id)
            if elapsed != -1:
                invalid.add(card_id)
        elif elapsed < 0:
            invalid.add(card_id)
    return invalid


def _read_source_manifest(source_root: Path) -> dict[str, object] | None:
    path = source_root / "manifest.json"
    if not path.exists():
        return None
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return manifest


def _source_partition_paths(source_root: Path) -> list[Path]:
    manifest = _read_source_manifest(source_root)
    if manifest is None:
        raise FileNotFoundError(f"source manifest is required: {source_root / 'manifest.json'}")
    files = manifest.get("files")
    if not isinstance(files, list):
        raise ValueError("source manifest must contain a files list")
    paths: list[Path] = []
    for entry in files:
        relative = Path(str(entry["path"]))
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or len(relative.parts) != 3
            or relative.parts[0] != "revlogs"
            or not relative.parts[1].startswith("user_id=")
            or relative.name != "data.parquet"
        ):
            raise ValueError(f"invalid source manifest path: {relative}")
        path = source_root / relative
        if not path.is_file():
            raise FileNotFoundError(f"source manifest partition is missing: {path}")
        expected_hash = entry.get("sha256")
        if not expected_hash:
            raise ValueError(f"source manifest has no hash for: {relative}")
        if sha256_file(path) != expected_hash:
            raise ValueError(f"source partition hash does not match manifest: {path}")
        paths.append(path)
    return paths
