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
    assert "paraphrase" in kinds and "wrong" in kinds and "case" in kinds
    assert "word-order" not in kinds

def test_no_matched_pair_is_a_pure_word_order_permutation():
    records = __import__("match_harness.schema", fromlist=["SourceRecord"]).validate_record(RECORD, line_number=1, source_file="x")[0:1]
    for pair in expand_pairs(records):
        if pair.label != 1:
            continue
        expected_words = pair.expected.lower().split()
        typed_words = pair.typed.lower().split()
        is_reordered_permutation = (
            sorted(expected_words) == sorted(typed_words) and expected_words != typed_words
        )
        assert not is_reordered_permutation, f"matched pair is a word-order permutation: {pair}"

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
        n = len(json.loads(input))
        captured["n"] = n
        class Completed:
            stdout = json.dumps({"accuracy": 0, "negative_precision": 0, "negative_recall": 0, "predictions": [0] * n})
        return Completed()
    monkeypatch.setattr("match_harness.pipeline.subprocess.run", fake_run)

    evaluate(data, model, report, extractor=extractor(), baseline_script=Path("dummy.ts"))
    assert captured["n"] == len(expected_test_y)

def test_cascade_metrics_from_fake_baseline(tmp_path: Path, monkeypatch):
    # The cascade section reduces the whole shipping question to one number: of the pairs
    # compareAnswer() rejected that the classifier then overturns to an accept, what fraction
    # are genuinely correct (label=1)? Drive it with a fake baseline whose per-pair
    # predictions are known, so the arithmetic can be checked exactly rather than trusting bun.
    data = tmp_path / "examples.jsonl"; write_jsonl(data)
    model = tmp_path / "models" / "model.joblib"; report = tmp_path / "reports" / "report.json"
    train(data, model, extractor())

    def fake_run(cmd, input, **kwargs):
        pairs = json.loads(input)
        # Baseline "rejects" every pair (all zeros): puts the whole test split into the
        # ambiguous pool, so overturn_precision reduces to the classifier's own precision.
        class Completed:
            stdout = json.dumps({"accuracy": 0, "negative_precision": 0, "negative_recall": 0, "predictions": [0] * len(pairs)})
        return Completed()
    monkeypatch.setattr("match_harness.pipeline.subprocess.run", fake_run)

    evaluation = evaluate(data, model, report, extractor=extractor(), baseline_script=Path("dummy.ts"))
    cascade = evaluation["cascade"]
    assert cascade["pool_size"] == cascade["pool_positives"] + cascade["pool_negatives"]
    assert cascade["overturns"] >= cascade["paraphrases_rescued"]["count"]
    assert cascade["wrong_answers_admitted"]["count"] <= cascade["pool_negatives"]
    assert 0.0 <= cascade["overturn_precision"] <= 1.0
    assert set(cascade["overturn_precision_by_kind"]).issubset({"paraphrase", "wrong", "exact", "case", "punctuation"})
    assert "accuracy" in cascade["cascade_overall"]

def test_cascade_baseline_accept_removes_pair_from_pool(tmp_path: Path, monkeypatch):
    # A pool of size 0 (baseline accepts everything) must not divide by zero anywhere.
    data = tmp_path / "examples.jsonl"; write_jsonl(data)
    model = tmp_path / "models" / "model.joblib"; report = tmp_path / "reports" / "report.json"
    train(data, model, extractor())

    def fake_run(cmd, input, **kwargs):
        pairs = json.loads(input)
        class Completed:
            stdout = json.dumps({"accuracy": 1, "negative_precision": 1, "negative_recall": 1, "predictions": [1] * len(pairs)})
        return Completed()
    monkeypatch.setattr("match_harness.pipeline.subprocess.run", fake_run)

    evaluation = evaluate(data, model, report, extractor=extractor(), baseline_script=Path("dummy.ts"))
    cascade = evaluation["cascade"]
    assert cascade["pool_size"] == 0
    assert cascade["overturns"] == 0
    assert cascade["overturn_precision"] == 0.0
    assert cascade["paraphrases_rescued"] == {"count": 0, "rate": 0.0}
    assert cascade["wrong_answers_admitted"] == {"count": 0, "rate": 0.0}

def test_baseline_predictions_included_end_to_end(tmp_path: Path):
    # Regression test for the real bun script: it must emit per-pair predictions alongside
    # the aggregate metrics, or evaluate() cannot build the cascade section at all.
    if shutil.which("bun") is None:
        pytest.skip("bun not available")
    data = tmp_path / "examples.jsonl"; write_jsonl(data)
    model = tmp_path / "models" / "model.joblib"; report = tmp_path / "reports" / "report.json"
    train(data, model, extractor())
    evaluation = evaluate(data, model, report, extractor=extractor(), baseline_script=DEFAULT_BASELINE_SCRIPT, project_root=TOOL_ROOT)
    assert "cascade" in evaluation
    assert "predictions" not in evaluation["baseline"]
