"""Command-line entry point: `uv run match-harness <command>`. See README.md."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .ingest import ingest_batches, write_merged
from .pipeline import DEFAULT_BASELINE_SCRIPT, TOOL_ROOT, evaluate, train


def _cmd_ingest(args: argparse.Namespace) -> int:
    report = ingest_batches(Path(args.batch_dir))

    for error in report.errors:
        print(f"ERROR: {error}", file=sys.stderr)
    for duplicate in report.duplicates:
        print(f"DUPLICATE: {duplicate}", file=sys.stderr)
    print(report.summary())

    if not report.accepted:
        print("nothing to write", file=sys.stderr)
        return 1

    write_merged(report.accepted, Path(args.output))
    print(f"wrote {len(report.accepted)} records to {args.output}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="match-harness")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_parser = subparsers.add_parser(
        "ingest", help="validate and merge pasted ChatGPT batch files into one clean dataset"
    )
    ingest_parser.add_argument("batch_dir", help="directory containing *.jsonl batch files")
    ingest_parser.add_argument("output", help="path to write the merged, validated dataset")
    ingest_parser.set_defaults(func=_cmd_ingest)

    train_parser = subparsers.add_parser("train", help="train the frozen-embedding classifier")
    train_parser.add_argument("data", help="merged examples JSONL")
    train_parser.add_argument("--model", default="models/answer-match.joblib")
    train_parser.set_defaults(func=lambda args: _cmd_train(args))

    evaluate_parser = subparsers.add_parser("evaluate", help="evaluate the classifier and string baseline")
    evaluate_parser.add_argument("data", help="merged examples JSONL")
    evaluate_parser.add_argument("--model", default="models/answer-match.joblib")
    evaluate_parser.add_argument("--report", default="reports/evaluation.json")
    evaluate_parser.add_argument("--held-out")
    evaluate_parser.add_argument("--baseline-script", default=str(DEFAULT_BASELINE_SCRIPT))
    evaluate_parser.add_argument("--project-root", default=str(TOOL_ROOT))
    evaluate_parser.set_defaults(func=lambda args: _cmd_evaluate(args))

    args = parser.parse_args()
    return args.func(args)


def _cmd_train(args: argparse.Namespace) -> int:
    result = train(Path(args.data), Path(args.model))
    print(json.dumps(result))
    return 0


def _cmd_evaluate(args: argparse.Namespace) -> int:
    result = evaluate(Path(args.data), Path(args.model), Path(args.report), held_out=Path(args.held_out) if args.held_out else None, baseline_script=Path(args.baseline_script), project_root=Path(args.project_root))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
