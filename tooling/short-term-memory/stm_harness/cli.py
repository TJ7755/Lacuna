from __future__ import annotations

import argparse
from pathlib import Path

from .acquire import DATASET_REVISION, acquire_revlogs
from .evaluate import evaluate_candidate, load_candidate, write_report
from .examples import build_examples
from .selection import compare_reports, read_report, write_selection


def main() -> None:
    parser = argparse.ArgumentParser(description="Lacuna offline short-term memory harness")
    subparsers = parser.add_subparsers(dest="command", required=True)

    acquire = subparsers.add_parser("acquire", help="download pinned revlog partitions")
    acquire.add_argument("destination", type=Path)
    acquire.add_argument("--users", required=True, help="comma-separated IDs and inclusive ranges")
    acquire.add_argument("--revision", default=DATASET_REVISION)
    acquire.add_argument("--token", help="Hugging Face token; HF_TOKEN is also supported")

    build = subparsers.add_parser("build", help="construct chronological examples")
    build.add_argument("source", type=Path)
    build.add_argument("destination", type=Path)
    build.add_argument("--holdout-fraction", type=float, default=0.2)
    build.add_argument("--minimum-train-examples", type=int, default=1)
    build.add_argument("--minimum-holdout-examples", type=int, default=1)

    evaluate = subparsers.add_parser("evaluate", help="evaluate a candidate plug-in")
    evaluate.add_argument("examples", type=Path)
    evaluate.add_argument("candidate", help="Python module:attribute")
    evaluate.add_argument("report", type=Path)
    evaluate.add_argument("--progress", action="store_true")

    select = subparsers.add_parser("select", help="apply the pre-declared quality gate")
    select.add_argument("baseline", type=Path)
    select.add_argument("candidates", type=Path, nargs="+")
    select.add_argument("report", type=Path)

    args = parser.parse_args()
    if args.command == "acquire":
        acquire_revlogs(args.destination, _parse_user_ids(args.users), revision=args.revision, token=args.token)
    elif args.command == "build":
        build_examples(
            args.source,
            args.destination,
            holdout_fraction=args.holdout_fraction,
            minimum_train_examples=args.minimum_train_examples,
            minimum_holdout_examples=args.minimum_holdout_examples,
        )
    elif args.command == "evaluate":
        progress = (
            lambda phase, current, total: print(
                f"{phase} {current}/{total} ({current / total:.0%})", flush=True
            )
            if args.progress
            else None
        )
        write_report(
            evaluate_candidate(load_candidate(args.candidate), args.examples, progress),
            args.report,
        )
    else:
        write_selection(
            compare_reports(
                read_report(args.baseline),
                [read_report(path) for path in args.candidates],
            ),
            args.report,
        )


def _parse_user_ids(value: str) -> list[int]:
    user_ids: set[int] = set()
    for part in value.split(","):
        bounds = part.strip().split("-", maxsplit=1)
        if len(bounds) == 1:
            user_ids.add(int(bounds[0]))
        else:
            start, end = map(int, bounds)
            if end < start:
                raise ValueError(f"invalid user range: {part}")
            user_ids.update(range(start, end + 1))
    return sorted(user_ids)
