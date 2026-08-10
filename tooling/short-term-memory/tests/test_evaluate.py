import json
import shutil
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from stm_harness.evaluate import evaluate_candidate
from stm_harness.examples import build_examples
from stm_harness.io import sha256_file


SOURCE_SCHEMA = pa.schema(
    [
        ("card_id", pa.int64()),
        ("rating", pa.int8()),
        ("state", pa.int8()),
        ("duration", pa.int32()),
        ("elapsed_seconds", pa.int64()),
    ]
)


class ConstantPredictor:
    def __init__(self):
        self.observed = 0

    def predict(self, context):
        assert self.observed > 0
        assert not hasattr(context, "recalled")
        assert not hasattr(context, "rating")
        assert not hasattr(context, "duration_ms")
        return 0.75

    def observe(self, example):
        self.observed += 1


class FittedConstant:
    name = "constant-test"

    def new_predictor(self, user_id):
        return ConstantPredictor()


class ConstantCandidate:
    name = "constant-test"

    def __init__(self):
        self.training_count = None

    def fit(self, training_examples):
        examples = list(training_examples)
        assert all(example.split == "train" for example in examples)
        assert any(example.is_seed for example in examples)
        self.training_count = len(examples)
        return FittedConstant()


class BatchConstantCandidate:
    name = "constant-batch-test"

    def __init__(self):
        self.training_count = None

    def fit_batches(self, training_batches):
        batches = list(training_batches)
        assert all(set(batch.column("split").to_pylist()) == {"train"} for batch in batches)
        assert any(True in batch.column("is_seed").to_pylist() for batch in batches)
        self.training_count = sum(batch.num_rows for batch in batches)
        return FittedConstant()


def test_parquet_to_chronological_evaluation_report(tmp_path: Path):
    source = tmp_path / "source"
    partition = source / "revlogs" / "user_id=1" / "data.parquet"
    partition.parent.mkdir(parents=True)
    rows = [
        {"card_id": 1, "rating": 3, "state": 0, "duration": 500, "elapsed_seconds": -1},
        {"card_id": 2, "rating": 1, "state": 0, "duration": 600, "elapsed_seconds": -1},
        {"card_id": 1, "rating": 1, "state": 1, "duration": 700, "elapsed_seconds": 30},
        {"card_id": 2, "rating": 3, "state": 1, "duration": 800, "elapsed_seconds": 60},
        {"card_id": 1, "rating": 4, "state": 1, "duration": 900, "elapsed_seconds": 600},
        {"card_id": 2, "rating": 1, "state": 1, "duration": 1_000, "elapsed_seconds": 604_801},
    ]
    pq.write_table(pa.Table.from_pylist(rows, schema=SOURCE_SCHEMA), partition)
    (source / "manifest.json").write_text(
        json.dumps(
            {
                "dataset": "synthetic-test",
                "revision": "fixture-1",
                "files": [
                    {
                        "path": "revlogs/user_id=1/data.parquet",
                        "sha256": sha256_file(partition),
                    }
                ],
            }
        )
    )

    examples = tmp_path / "examples"
    build_examples(source, examples, holdout_fraction=0.5)
    with pytest.raises(FileExistsError, match="new or empty"):
        build_examples(source, examples, holdout_fraction=0.5)

    stale = examples / "user_id=2" / "data.parquet"
    stale.parent.mkdir()
    shutil.copyfile(examples / "user_id=1" / "data.parquet", stale)
    candidate = ConstantCandidate()
    report = evaluate_candidate(candidate, examples)

    assert candidate.training_count == 4
    assert report["excluded"]["lag_over_7d"] == 1
    overall = next(item for item in report["slices"] if item["dimension"] == "overall")
    assert overall["count"] == 1
    assert overall["positive_rate"] == 1.0
    empty_lag = next(
        item for item in report["slices"] if item["dimension"] == "lag" and item["value"] == "<1m"
    )
    assert empty_lag["count"] == 0
    assert empty_lag["brier_score"] is None

    assert report["per_user"] == [
        {
            "user_id": 1,
            "count": 1,
            "positive_rate": 1.0,
            "log_loss": overall["log_loss"],
            "brier_score": overall["brier_score"],
            "calibration_error": overall["calibration_error"],
            "calibration_bins": overall["calibration_bins"],
        }
    ]

    batch_candidate = BatchConstantCandidate()
    evaluate_candidate(batch_candidate, examples)
    assert batch_candidate.training_count == 4

    with (examples / "user_id=1" / "data.parquet").open("ab") as handle:
        handle.write(b"corrupt")
    with pytest.raises(ValueError, match="hash does not match"):
        evaluate_candidate(ConstantCandidate(), examples)
