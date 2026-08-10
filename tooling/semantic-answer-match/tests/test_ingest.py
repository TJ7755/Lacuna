import json
from pathlib import Path

from match_harness.ingest import ingest_batches, write_merged

VALID = {
    "subject": "Biology",
    "topic": "Cell structure",
    "prompt": "What is the function of the mitochondria?",
    "correct_answer": "It produces energy (ATP) for the cell through respiration.",
    "paraphrases": ["Generates ATP for the cell via respiration."],
    "wrong_answers": [
        {"text": "It controls the cell's genetic material.", "reason": "confuses mitochondria with nucleus"}
    ],
}


def _write_jsonl(path: Path, rows: list[object]) -> None:
    path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")


def test_accepts_valid_record(tmp_path: Path) -> None:
    batch_dir = tmp_path / "batches"
    batch_dir.mkdir()
    _write_jsonl(batch_dir / "biology-cells.jsonl", [VALID])

    report = ingest_batches(batch_dir)

    assert report.summary() == "1 accepted, 0 invalid lines, 0 duplicates dropped"
    assert report.accepted[0].subject == "Biology"
    assert report.accepted[0].wrong_answers[0].reason == "confuses mitochondria with nucleus"


def test_rejects_missing_field(tmp_path: Path) -> None:
    batch_dir = tmp_path / "batches"
    batch_dir.mkdir()
    broken = {k: v for k, v in VALID.items() if k != "correct_answer"}
    _write_jsonl(batch_dir / "batch.jsonl", [broken])

    report = ingest_batches(batch_dir)

    assert report.accepted == []
    assert len(report.errors) == 1
    assert "correct_answer" in report.errors[0]


def test_rejects_malformed_json_line(tmp_path: Path) -> None:
    batch_dir = tmp_path / "batches"
    batch_dir.mkdir()
    (batch_dir / "batch.jsonl").write_text('{"subject": "Biology",\n', encoding="utf-8")

    report = ingest_batches(batch_dir)

    assert report.accepted == []
    assert len(report.errors) == 1
    assert "invalid JSON" in report.errors[0]


def test_drops_duplicate_prompts_across_batches(tmp_path: Path) -> None:
    batch_dir = tmp_path / "batches"
    batch_dir.mkdir()
    _write_jsonl(batch_dir / "a.jsonl", [VALID])
    reworded = dict(VALID, prompt="  WHAT IS THE FUNCTION OF THE   mitochondria?  ")
    _write_jsonl(batch_dir / "b.jsonl", [reworded])

    report = ingest_batches(batch_dir)

    assert len(report.accepted) == 1
    assert len(report.duplicates) == 1
    assert "a.jsonl:1" in report.duplicates[0]


def test_errors_when_no_batch_files(tmp_path: Path) -> None:
    batch_dir = tmp_path / "empty"
    batch_dir.mkdir()

    report = ingest_batches(batch_dir)

    assert report.accepted == []
    assert "no .jsonl files found" in report.errors[0]


def test_write_merged_round_trips(tmp_path: Path) -> None:
    batch_dir = tmp_path / "batches"
    batch_dir.mkdir()
    _write_jsonl(batch_dir / "batch.jsonl", [VALID])
    report = ingest_batches(batch_dir)

    output = tmp_path / "merged.jsonl"
    write_merged(report.accepted, output)

    lines = output.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    row = json.loads(lines[0])
    assert row["prompt"] == VALID["prompt"]
    assert row["wrong_answers"][0]["text"] == VALID["wrong_answers"][0]["text"]
