"""Expand source records into deterministic labelled answer pairs."""
from __future__ import annotations

from dataclasses import dataclass
import re
from .schema import SourceRecord

@dataclass(frozen=True)
class AnswerPair:
    expected: str
    typed: str
    label: int
    kind: str

def _noise(answer: str) -> list[tuple[str, str]]:
    words = answer.split()
    variants = [(answer.lower(), "case"), (re.sub(r"[\.,!?;:]+", "", answer), "punctuation")]
    if len(words) > 1:
        variants.append((" ".join(reversed(words)), "word-order"))
    return [(text, kind) for text, kind in variants if text != answer]

def expand_pairs(records: list[SourceRecord]) -> list[AnswerPair]:
    pairs: list[AnswerPair] = []
    for record in records:
        expected = record.correct_answer
        pairs.append(AnswerPair(expected, expected, 1, "exact"))
        pairs.extend(AnswerPair(expected, text, 1, "paraphrase") for text in record.paraphrases)
        pairs.extend(AnswerPair(expected, text, 0, "wrong") for text in (w.text for w in record.wrong_answers))
        pairs.extend(AnswerPair(expected, text, 1, kind) for text, kind in _noise(expected))
    return pairs
