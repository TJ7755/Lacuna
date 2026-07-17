"""Feature extraction, with the embedding model kept behind an injectable boundary."""
from __future__ import annotations
import re
import numpy as np
from .pairs import AnswerPair

def _edit_distance(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i, left in enumerate(a, 1):
        next_row = [i]
        for j, right in enumerate(b, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j - 1] + (left != right)))
        row = next_row
    return row[-1]

def normalised_edit_similarity(a: str, b: str) -> float:
    return 1.0 - _edit_distance(a.lower(), b.lower()) / max(len(a), len(b), 1)

def token_overlap(a: str, b: str) -> float:
    left, right = set(re.findall(r"\w+", a.lower())), set(re.findall(r"\w+", b.lower()))
    return len(left & right) / max(len(right), 1)

class FeatureExtractor:
    def __init__(self, embedder=None):
        if embedder is None:
            from sentence_transformers import SentenceTransformer
            embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")
        self.embedder = embedder

    def transform(self, pairs: list[AnswerPair]) -> np.ndarray:
        texts = [value for pair in pairs for value in (pair.typed, pair.expected)]
        embeddings = np.asarray(self.embedder.encode(texts, convert_to_numpy=True, show_progress_bar=False))
        rows = []
        for index, pair in enumerate(pairs):
            typed, expected = embeddings[index * 2], embeddings[index * 2 + 1]
            cosine = float(np.dot(typed, expected) / max(np.linalg.norm(typed) * np.linalg.norm(expected), 1e-12))
            rows.append([cosine, normalised_edit_similarity(pair.typed, pair.expected), token_overlap(pair.typed, pair.expected)])
        return np.asarray(rows, dtype=float)
