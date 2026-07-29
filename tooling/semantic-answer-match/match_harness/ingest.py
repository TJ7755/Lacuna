"""Merge and validate pasted ChatGPT batch files into one clean dataset.

Reads every *.jsonl file in a batch directory, validates each line against
match_harness.schema, drops duplicate prompts across batches (keeping the
first occurrence), and writes one newline-delimited JSON file of accepted
records. See README.md for the end-to-end workflow this is one step of.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from .schema import SourceRecord, validate_record


class IngestReport:
    def __init__(self) -> None:
        self.accepted: list[SourceRecord] = []
        self.errors: list[str] = []
        self.duplicates: list[str] = []

    def summary(self) -> str:
        return (
            f"{len(self.accepted)} accepted, {len(self.errors)} invalid lines, "
            f"{len(self.duplicates)} duplicates dropped"
        )


def ingest_batches(batch_dir: Path) -> IngestReport:
    report = IngestReport()
    seen: dict[str, str] = {}  # dedupe_key -> "file:line" of the first occurrence

    batch_files = sorted(batch_dir.glob("*.jsonl"))
    if not batch_files:
        report.errors.append(f"no .jsonl files found in {batch_dir}")
        return report

    for batch_file in batch_files:
        lines = batch_file.read_text(encoding="utf-8").splitlines()
        for line_number, raw_line in enumerate(lines, start=1):
            stripped = raw_line.strip()
            if not stripped:
                continue

            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError as exc:
                report.errors.append(f"{batch_file.name}:{line_number}: invalid JSON ({exc})")
                continue

            record, errors = validate_record(
                parsed, line_number=line_number, source_file=batch_file.name
            )
            if errors:
                report.errors.extend(errors)
                continue

            assert record is not None
            where = f"{batch_file.name}:{line_number}"
            key = record.dedupe_key
            if key in seen:
                report.duplicates.append(f"{where}: duplicate of {seen[key]} ('{record.prompt}')")
                continue

            seen[key] = where
            report.accepted.append(record)

    return report


def write_merged(records: list[SourceRecord], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as handle:
        for record in records:
            row = asdict(record)
            row["wrong_answers"] = [asdict(wrong) for wrong in record.wrong_answers]
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
