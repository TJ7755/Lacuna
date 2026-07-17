import json
from pathlib import Path

import numpy as np

from match_harness.features import FeatureExtractor, normalised_edit_similarity, token_overlap
from match_harness.pairs import expand_pairs
from match_harness.pipeline import evaluate, train

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
