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
    # Deliberately no "word-order" variant here, diverging from next_plan.md
    # Appendix A.1 Step 2 ("word-order shuffles" as deterministic positives).
    # Reversing word order in a one- to two-sentence answer produces gibberish
    # (e.g. "The nucleus contains ... the cell." -> "cell. the ... nucleus
    # The"), yet both the token-overlap feature and embedding cosine
    # similarity stay high for it, so labelling it a match (label=1) actively
    # trained the classifier that scrambled word salad is a correct answer.
    # That works against the asymmetry required elsewhere (a false "match" is
    # worse than a false "no-match"). Case and punctuation noise stay, since
    # they model the trivial surface variation that answerStrictness.ts
    # already normalises.
    variants = [(answer.lower(), "case"), (re.sub(r"[\.,!?;:]+", "", answer), "punctuation")]
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
