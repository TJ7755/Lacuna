"""Training and evaluation for the semantic answer-match prototype."""
from __future__ import annotations
import json, subprocess
from pathlib import Path
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from .pairs import AnswerPair, expand_pairs
from .features import FeatureExtractor
from .schema import validate_record

def load_records(path: Path):
    records = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        record, errors = validate_record(json.loads(line), line_number=line_number, source_file=path.name)
        if errors: raise ValueError("; ".join(errors))
        records.append(record)
    return records

def train(data_path: Path, model_path: Path, extractor=None) -> dict:
    pairs = expand_pairs(load_records(data_path)); extractor = extractor or FeatureExtractor()
    X, y = extractor.transform(pairs), [pair.label for pair in pairs]
    model = LogisticRegression(max_iter=1000, random_state=0).fit(X, y)
    model_path.parent.mkdir(parents=True, exist_ok=True); joblib.dump(model, model_path)
    return {"pairs": len(pairs), "model": str(model_path)}

def _metrics(y, prediction):
    return {"accuracy": accuracy_score(y, prediction), "negative_precision": precision_score(y, prediction, pos_label=0, zero_division=0), "negative_recall": recall_score(y, prediction, pos_label=0, zero_division=0)}

def evaluate(data_path: Path, model_path: Path, report_path: Path, extractor=None, held_out: Path | None = None, baseline_script: Path | None = None, project_root: Path | None = None) -> dict:
    pairs = expand_pairs(load_records(data_path)); extractor = extractor or FeatureExtractor(); X = extractor.transform(pairs); y = [p.label for p in pairs]
    train_x, test_x, train_y, test_y = train_test_split(X, y, test_size=.2, random_state=0, stratify=y)
    model = joblib.load(model_path); model.fit(train_x, train_y)
    result = {"split": _metrics(test_y, model.predict(test_x))}
    if baseline_script:
        payload = json.dumps([p.__dict__ for p in pairs])
        completed = subprocess.run(["bun", str(baseline_script)], input=payload, text=True, capture_output=True, check=True, cwd=project_root)
        result["baseline"] = json.loads(completed.stdout)
    if held_out:
        held_pairs = expand_pairs(load_records(held_out)); result["held_out"] = _metrics([p.label for p in held_pairs], model.predict(extractor.transform(held_pairs)))
    report_path.parent.mkdir(parents=True, exist_ok=True); report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result
