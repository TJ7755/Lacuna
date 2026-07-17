"""Validation for LLM-generated synthetic source records.

Each record is one JSON object per line in a batch file pasted from ChatGPT
into data/raw/llm_batches/ (see prompts/generation_prompt.md for the prompt
that produces these, and README.md for the workflow). Validation happens here
rather than trusting the model's output directly, because a pasted chat
completion is not a schema-checked API response — it can drop a field,
malform JSON on a long line, or drift format partway through a long batch.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

REQUIRED_STRING_FIELDS = ("subject", "topic", "prompt", "correct_answer")


@dataclass(frozen=True)
class WrongAnswer:
    """A plausible incorrect answer, with the misconception it represents.

    The "reason" is not used by the training pipeline yet (Step 3, not built);
    it is captured now because it's cheap to ask the model for at generation
    time and expensive to reconstruct later, and it documents *why* a negative
    was considered plausible rather than arbitrary.
    """

    text: str
    reason: str


@dataclass(frozen=True)
class SourceRecord:
    subject: str
    topic: str
    prompt: str
    correct_answer: str
    paraphrases: tuple[str, ...]
    wrong_answers: tuple[WrongAnswer, ...]

    @property
    def dedupe_key(self) -> str:
        """Case/whitespace-insensitive key used to drop duplicate prompts across batches.

        Batches are generated in separate chat messages with no shared memory of
        what was already asked for, so cross-batch repeats are expected, not a bug
        to prevent at generation time.
        """
        return " ".join(self.prompt.lower().split())


def validate_record(
    raw: Any, *, line_number: int, source_file: str
) -> tuple[SourceRecord | None, list[str]]:
    """Validate one parsed JSON value against the source-record schema.

    Returns (record, errors). record is None whenever errors is non-empty.
    Errors are human-readable and self-locating (file + line), so a malformed
    pasted batch can be fixed without re-reading the whole file.
    """
    where = f"{source_file}:{line_number}"

    if not isinstance(raw, dict):
        return None, [f"{where}: expected a JSON object, got {type(raw).__name__}"]

    errors: list[str] = []
    for field in REQUIRED_STRING_FIELDS:
        value = raw.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{where}: '{field}' must be a non-empty string")

    paraphrases_raw = raw.get("paraphrases", [])
    if not isinstance(paraphrases_raw, list) or not all(
        isinstance(p, str) and p.strip() for p in paraphrases_raw
    ):
        errors.append(f"{where}: 'paraphrases' must be a list of non-empty strings")
        paraphrases_raw = []

    wrong_raw = raw.get("wrong_answers", [])
    wrong_answers: list[WrongAnswer] = []
    if not isinstance(wrong_raw, list):
        errors.append(f"{where}: 'wrong_answers' must be a list")
    else:
        for index, item in enumerate(wrong_raw):
            text = item.get("text") if isinstance(item, dict) else None
            reason = item.get("reason") if isinstance(item, dict) else None
            if (
                not isinstance(item, dict)
                or not isinstance(text, str)
                or not text.strip()
                or not isinstance(reason, str)
                or not reason.strip()
            ):
                errors.append(
                    f"{where}: wrong_answers[{index}] must be {{'text': str, 'reason': str}}"
                )
            else:
                wrong_answers.append(WrongAnswer(text=text.strip(), reason=reason.strip()))

    if errors:
        return None, errors

    record = SourceRecord(
        subject=raw["subject"].strip(),
        topic=raw["topic"].strip(),
        prompt=raw["prompt"].strip(),
        correct_answer=raw["correct_answer"].strip(),
        paraphrases=tuple(p.strip() for p in paraphrases_raw),
        wrong_answers=tuple(wrong_answers),
    )
    return record, []
