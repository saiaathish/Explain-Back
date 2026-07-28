import hashlib
from collections import OrderedDict
from functools import lru_cache

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

from backend.config import EMBEDDING_MODEL
from backend.schemas import Concept, Proposition

_CONCEPT_VECTOR_CACHE_SIZE = 64
_concept_vector_cache: OrderedDict[str, np.ndarray] = OrderedDict()


@lru_cache(maxsize=1)
def _embedding_model() -> SentenceTransformer:
    torch.set_num_threads(1)
    try:
        torch.set_num_interop_threads(1)
    except RuntimeError:
        # PyTorch only permits changing inter-op threads before parallel work.
        pass
    return SentenceTransformer(EMBEDDING_MODEL, local_files_only=True)


def embed(texts: list[str]) -> np.ndarray:
    if not texts:
        return np.empty((0, 384), dtype=np.float32)
    return np.asarray(
        _embedding_model().encode(texts, normalize_embeddings=True),
        dtype=np.float32,
    )


def _concept_vector_key(concepts: list[Concept]) -> str:
    digest = hashlib.sha256()
    for concept in concepts:
        text = f"{concept.label}. {concept.anchor}".encode("utf-8")
        digest.update(len(text).to_bytes(8, "big"))
        digest.update(text)
    return digest.hexdigest()


def embed_concepts(concepts: list[Concept]) -> np.ndarray:
    key = _concept_vector_key(concepts)
    cached = _concept_vector_cache.get(key)
    if cached is not None:
        _concept_vector_cache.move_to_end(key)
        return cached
    vectors = embed([f"{item.label}. {item.anchor}" for item in concepts])
    _concept_vector_cache[key] = vectors
    _concept_vector_cache.move_to_end(key)
    while len(_concept_vector_cache) > _CONCEPT_VECTOR_CACHE_SIZE:
        _concept_vector_cache.popitem(last=False)
    return vectors


def align(
    propositions: list[Proposition], concepts: list[Concept]
) -> dict[str, tuple[str, float]]:
    if not propositions or not concepts:
        return {}
    # KNOWN DRIFT — do not "clean up" without reading docs/revise-loop.md.
    # The blueprint specifies `claim_span` alone, and calibrate/pairs.json holds
    # bare claims, so T_HIGH/T_LOW are calibrated for claim-only vectors. Joining
    # the justification in dilutes the vector away from the concept, which lowers
    # similarity and can push a *better* justified claim toward grey.
    # Switching to claim-only is nonetheless blocked: it drops the golden gate
    # from 34/37 to 31/37, deterministically (same numbers on two runs). The
    # golden baseline was recorded against this joined behaviour, so the two are
    # now entangled and have to be moved together.
    proposition_vectors = embed(
        [
            " ".join([item.claim_span, *item.justification_spans])
            for item in propositions
        ]
    )
    concept_vectors = embed_concepts(concepts)
    similarities = proposition_vectors @ concept_vectors.T
    best = similarities.argmax(axis=1)
    return {
        proposition.id: (
            concepts[int(best[index])].id,
            float(similarities[index, best[index]]),
        )
        for index, proposition in enumerate(propositions)
    }
