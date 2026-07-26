from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer

from backend.config import EMBEDDING_MODEL
from backend.schemas import Concept, Proposition


@lru_cache(maxsize=1)
def _embedding_model() -> SentenceTransformer:
    return SentenceTransformer(EMBEDDING_MODEL, local_files_only=True)


def embed(texts: list[str]) -> np.ndarray:
    if not texts:
        return np.empty((0, 384), dtype=np.float32)
    return np.asarray(
        _embedding_model().encode(texts, normalize_embeddings=True),
        dtype=np.float32,
    )


def align(
    propositions: list[Proposition], concepts: list[Concept]
) -> dict[str, tuple[str, float]]:
    if not propositions or not concepts:
        return {}
    proposition_vectors = embed([item.claim_span for item in propositions])
    concept_vectors = embed(
        [f"{item.label}. {item.anchor}" for item in concepts]
    )
    similarities = proposition_vectors @ concept_vectors.T
    best = similarities.argmax(axis=1)
    return {
        proposition.id: (
            concepts[int(best[index])].id,
            float(similarities[index, best[index]]),
        )
        for index, proposition in enumerate(propositions)
    }
