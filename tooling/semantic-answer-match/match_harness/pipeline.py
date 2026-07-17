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

# Root of this tool (tooling/semantic-answer-match), derived from this file's own location
# so the default baseline script/cwd resolve correctly regardless of the caller's cwd.
TOOL_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASELINE_SCRIPT = TOOL_ROOT / "scripts" / "compare_answer_baseline.ts"

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

def _rate(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0

def _cascade(test_pairs: list[AnswerPair], test_y: list[int], baseline_predictions: list[int], classifier_predictions) -> dict:
    # The shipping architecture is a cascade: compareAnswer() runs first and an accept is
    # final; the classifier is only ever consulted on a compareAnswer() rejection, and can
    # only overturn a reject into an accept, never the reverse. So the entire risk profile of
    # shipping the classifier reduces to one question: of the pairs it overturns, what
    # fraction are genuinely correct? (next_plan.md Appendix A.1 Step 4.)
    classifier_predictions = list(classifier_predictions)
    pool = [i for i, prediction in enumerate(baseline_predictions) if prediction == 0]
    pool_positives = [i for i in pool if test_y[i] == 1]
    pool_negatives = [i for i in pool if test_y[i] == 0]
    overturns = [i for i in pool if classifier_predictions[i] == 1]
    overturns_correct = [i for i in overturns if test_y[i] == 1]
    rescued = [i for i in pool_positives if classifier_predictions[i] == 1]
    admitted = [i for i in pool_negatives if classifier_predictions[i] == 1]
    cascade_predictions = [max(baseline_predictions[i], classifier_predictions[i]) for i in range(len(test_pairs))]
    by_kind: dict[str, dict] = {}
    for kind in sorted({pair.kind for i, pair in enumerate(test_pairs) if i in pool}):
        kind_overturns = [i for i in overturns if test_pairs[i].kind == kind]
        kind_correct = [i for i in kind_overturns if test_y[i] == 1]
        by_kind[kind] = {"overturns": len(kind_overturns), "overturn_precision": _rate(len(kind_correct), len(kind_overturns))}
    return {
        "pool_size": len(pool),
        "pool_positives": len(pool_positives),
        "pool_negatives": len(pool_negatives),
        "overturns": len(overturns),
        "overturn_precision": _rate(len(overturns_correct), len(overturns)),
        "paraphrases_rescued": {"count": len(rescued), "rate": _rate(len(rescued), len(pool_positives))},
        "wrong_answers_admitted": {"count": len(admitted), "rate": _rate(len(admitted), len(pool_negatives))},
        "cascade_overall": _metrics(test_y, cascade_predictions),
        "overturn_precision_by_kind": by_kind,
    }

def evaluate(data_path: Path, model_path: Path, report_path: Path, extractor=None, held_out: Path | None = None, baseline_script: Path | None = None, project_root: Path | None = None) -> dict:
    pairs = expand_pairs(load_records(data_path)); extractor = extractor or FeatureExtractor(); X = extractor.transform(pairs); y = [p.label for p in pairs]
    train_x, test_x, train_y, test_y, train_pairs, test_pairs = train_test_split(X, y, pairs, test_size=.2, random_state=0, stratify=y)
    model = joblib.load(model_path); model.fit(train_x, train_y)
    classifier_predictions = model.predict(test_x)
    result = {"split": _metrics(test_y, classifier_predictions)}
    if baseline_script:
        # Score the baseline over exactly the same test-split pairs as the classifier so the
        # two numbers are directly comparable (next_plan.md Appendix A.1 Step 4).
        payload = json.dumps([p.__dict__ for p in test_pairs])
        completed = subprocess.run(["bun", str(baseline_script)], input=payload, text=True, capture_output=True, check=True, cwd=project_root or TOOL_ROOT)
        baseline_result = json.loads(completed.stdout)
        baseline_predictions = baseline_result.pop("predictions")
        result["baseline"] = baseline_result
        result["cascade"] = _cascade(test_pairs, test_y, baseline_predictions, classifier_predictions)
    if held_out:
        held_pairs = expand_pairs(load_records(held_out)); result["held_out"] = _metrics([p.label for p in held_pairs], model.predict(extractor.transform(held_pairs)))
    report_path.parent.mkdir(parents=True, exist_ok=True); report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result
