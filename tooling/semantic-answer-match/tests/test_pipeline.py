import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from match_harness.features import FeatureExtractor, normalised_edit_similarity, token_overlap
from match_harness.pairs import expand_pairs
from match_harness.pipeline import DEFAULT_BASELINE_SCRIPT, TOOL_ROOT, evaluate, train

RECORD = {
    "subject": "Science", "topic": "Cells", "prompt": "What makes energy?",
    "correct_answer": "Mitochondria make energy.",
    "paraphrases": ["The mitochondria produce energy."],
    "wrong_answers": [
        {"text": "The nucleus stores DNA.", "reason": "confuses organelles"},
        {"text": "The cell wall absorbs sunlight.", "reason": "confuses functions"},
    ],
}

class TinyEmbedder:
    def encode(self, texts, **kwargs):
        return np.asarray([[len(text), text.lower().count("energy"), text.lower().count("nucleus")] for text in texts], dtype=float)

def extractor():
    return FeatureExtractor(TinyEmbedder())

def write_jsonl(path: Path):
    path.write_text(json.dumps(RECORD) + "\n", encoding="utf-8")

def test_expands_model_and_deterministic_pairs():
    pairs = expand_pairs(__import__("match_harness.schema", fromlist=["SourceRecord"]).validate_record(RECORD, line_number=1, source_file="x")[0:1])
    kinds = [pair.kind for pair in pairs]
    assert "paraphrase" in kinds and "wrong" in kinds and "word-order" in kinds

def test_features_are_deterministic_and_injectable():
    assert normalised_edit_similarity("Tokyo", "tokyo") == 1
    assert token_overlap("red blue", "blue green") == 0.5
    assert extractor().transform(expand_pairs([])).shape == (0,)

def test_train_and_evaluate_without_model_download(tmp_path: Path):
    data = tmp_path / "examples.jsonl"; write_jsonl(data)
    model = tmp_path / "models" / "model.joblib"; report = tmp_path / "reports" / "report.json"
    result = train(data, model, extractor())
    assert result["pairs"] >= 4 and model.exists()
    evaluation = evaluate(data, model, report, extractor=extractor())
    assert "accuracy" in evaluation["split"] and report.exists()

def test_baseline_subprocess_runs_end_to_end(tmp_path: Path):
    # Regression test for the "bun compare_answer_baseline.ts" path resolving relative to
    # project_root: previously the default project_root ("../..") put cwd at the outer Lacuna
    # repo root, one level too far up from where the default baseline_script actually lives
    # (tooling/semantic-answer-match/scripts/), so bun exited 1 with "Module not found" and
    # evaluate() raised CalledProcessError. Exercises the real subprocess rather than mocking
    # it, so it would have caught that. Skips cleanly if bun isn't installed.
    if shutil.which("bun") is None:
        pytest.skip("bun not available")
    data = tmp_path / "examples.jsonl"; write_jsonl(data)
    model = tmp_path / "models" / "model.joblib"; report = tmp_path / "reports" / "report.json"
    train(data, model, extractor())
    evaluation = evaluate(data, model, report, extractor=extractor(), baseline_script=DEFAULT_BASELINE_SCRIPT, project_root=TOOL_ROOT)
    assert "accuracy" in evaluation["baseline"]

def test_baseline_scored_on_same_pairs_as_classifier_split(tmp_path: Path, monkeypatch):
    # The classifier is scored on the 20% test split; the baseline must be scored on exactly
    # the same pairs, or the two numbers aren't comparable (next_plan.md Appendix A.1 Step 4).
    from sklearn.model_selection import train_test_split
    from match_harness.pipeline import load_records

    data = tmp_path / "examples.jsonl"; write_jsonl(data)
    model = tmp_path / "models" / "model.joblib"; report = tmp_path / "reports" / "report.json"
    train(data, model, extractor())

    all_pairs = expand_pairs(load_records(data))
    X, y = extractor().transform(all_pairs), [p.label for p in all_pairs]
    _, _, _, expected_test_y = train_test_split(X, y, test_size=.2, random_state=0, stratify=y)

    captured = {}
    def fake_run(cmd, input, **kwargs):
        captured["n"] = len(json.loads(input))
        class Completed:
            stdout = json.dumps({"accuracy": 0, "negative_precision": 0, "negative_recall": 0})
        return Completed()
    monkeypatch.setattr("match_harness.pipeline.subprocess.run", fake_run)

    evaluate(data, model, report, extractor=extractor(), baseline_script=Path("dummy.ts"))
    assert captured["n"] == len(expected_test_y)
