from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

from .contract import Example, PredictionContext


EXAMPLE_SCHEMA = pa.schema(
    [
        ("user_id", pa.int32()),
        ("source_index", pa.int64()),
        ("card_id", pa.int64()),
        ("review_index", pa.int32()),
        ("elapsed_seconds", pa.int64()),
        ("rating", pa.int8()),
        ("recalled", pa.bool_()),
        ("state", pa.int8()),
        ("duration_ms", pa.int32()),
        ("is_seed", pa.bool_()),
        ("is_first_predictive_review", pa.bool_()),
        ("prior_review_count", pa.int32()),
        ("prior_success_count", pa.int32()),
        ("prior_failure_count", pa.int32()),
        ("previous_recalled", pa.bool_()),
        ("split", pa.string()),
    ]
)


def example_from_mapping(row: dict[str, object]) -> Example:
    return Example(
        context=PredictionContext(
            user_id=int(row["user_id"]),
            source_index=int(row["source_index"]),
            card_id=int(row["card_id"]),
            review_index=int(row["review_index"]),
            elapsed_seconds=int(row["elapsed_seconds"]),
            state=int(row["state"]),
            is_first_predictive_review=bool(row["is_first_predictive_review"]),
            prior_review_count=int(row["prior_review_count"]),
            prior_success_count=int(row["prior_success_count"]),
            prior_failure_count=int(row["prior_failure_count"]),
            previous_recalled=(
                row["previous_recalled"]
                if row["previous_recalled"] is None
                else bool(row["previous_recalled"])
            ),
        ),
        rating=int(row["rating"]),
        recalled=bool(row["recalled"]),
        duration_ms=int(row["duration_ms"]),
        is_seed=bool(row["is_seed"]),
        split=str(row["split"]),
    )


def iter_partition_paths(root: Path) -> Iterator[Path]:
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"example manifest is required: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    users = manifest.get("users", [])
    for user in users:
        relative = Path(str(user["path"]))
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or len(relative.parts) != 2
            or not relative.parts[0].startswith("user_id=")
            or relative.name != "data.parquet"
        ):
            raise ValueError(f"invalid example manifest path: {relative}")
        path = root / relative
        if not path.is_file():
            raise FileNotFoundError(f"manifest partition is missing: {path}")
        expected_hash = user.get("sha256")
        if not expected_hash:
            raise ValueError(f"example manifest has no hash for: {relative}")
        if sha256_file(path) != expected_hash:
            raise ValueError(f"example partition hash does not match manifest: {path}")
        yield path


def iter_examples(root: Path, *, split: str | None = None) -> Iterator[Example]:
    yield from iter_examples_from_paths(iter_partition_paths(root), split=split)


def iter_examples_from_paths(
    paths: Iterable[Path], *, split: str | None = None
) -> Iterator[Example]:
    for path in paths:
        for example in iter_partition_examples(path):
            if split is None or example.split == split:
                yield example


def iter_training_batches(paths: Iterable[Path]) -> Iterator[pa.RecordBatch]:
    for path in paths:
        for batch in pq.ParquetFile(path).iter_batches(batch_size=65_536):
            filtered = batch.filter(pc.equal(batch.column("split"), "train"))
            if filtered.num_rows:
                yield filtered


def iter_partition_examples(path: Path) -> Iterator[Example]:
    for batch in pq.ParquetFile(path).iter_batches(batch_size=65_536):
        for row in batch.to_pylist():
            yield example_from_mapping(row)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_fresh_directory(path: Path) -> None:
    if path.exists() and any(path.iterdir()):
        raise FileExistsError(f"destination must be new or empty: {path}")
