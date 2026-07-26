import asyncio
import hashlib
import logging
import os
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.align import align
from backend.config import (
    MAX_EXPLANATION_CHARS,
    MAX_SOURCE_CHARS,
    MIN_EXPLANATION_CHARS,
    MIN_SOURCE_CHARS,
    T_HIGH,
    T_LOW,
)
from backend.extract import extract_concepts, extract_propositions
from backend.llm import LLMConfigurationError, LLMResponseError, LLMTimeoutError
from backend.misconceptions import match
from backend.resolve import resolve
from backend.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    Concept,
    Coverage,
    Flag,
)
from backend.verify import verify

logger = logging.getLogger(__name__)
_concept_cache: dict[str, list[Concept]] = {}
_prewarm_task: asyncio.Task[None] | None = None


def _cache_key(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


async def _prewarm() -> None:
    if not os.getenv("LLM_API_KEY") or not os.getenv("LLM_MODEL"):
        logger.warning("Concept cache prewarm skipped: LLM credentials are not configured.")
        return
    sample = Path(__file__).parents[1] / "samples" / "source_sodium_pump.txt"
    source = sample.read_text(encoding="utf-8").strip()
    try:
        concepts = await extract_concepts(source)
    except LLMResponseError:
        logger.exception("Concept cache prewarm failed.")
        return
    if concepts:
        _concept_cache[_cache_key(source)] = concepts


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _prewarm_task
    _prewarm_task = asyncio.create_task(_prewarm())
    try:
        yield
    finally:
        if _prewarm_task and not _prewarm_task.done():
            _prewarm_task.cancel()
            with suppress(asyncio.CancelledError):
                await _prewarm_task
        _prewarm_task = None


app = FastAPI(title="Explain-Back", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",")
        if origin.strip()
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


def _validate_lengths(source: str, explanation: str) -> None:
    if not source or not explanation:
        raise HTTPException(400, "Paste both source material and your explanation.")
    if len(source) < MIN_SOURCE_CHARS:
        raise HTTPException(400, "Source too short. Paste 2–3 paragraphs.")
    if len(explanation) < MIN_EXPLANATION_CHARS:
        raise HTTPException(400, "Explanation too short. Write at least two full sentences.")
    if len(source) > MAX_SOURCE_CHARS:
        raise HTTPException(400, "Source too long. Keep it to 2–3 paragraphs.")
    if len(explanation) > MAX_EXPLANATION_CHARS:
        raise HTTPException(400, "Explanation too long. Keep it to a few paragraphs.")


def compute_coverage(concepts: list[Concept], flags: list[Flag]) -> Coverage:
    state_rank = {"green": 3, "yellow": 2, "red": 2, "grey": 1}
    best: dict[str, int] = {}
    for flag in flags:
        if flag.concept_id and flag.similarity >= T_LOW:
            best[flag.concept_id] = max(
                best.get(flag.concept_id, 0), state_rank[flag.state]
            )
    return Coverage(
        covered=[concept.id for concept in concepts if best.get(concept.id) == 3],
        partial=[
            concept.id
            for concept in concepts
            if best.get(concept.id, 0) in {1, 2}
        ],
        missing=[concept.id for concept in concepts if concept.id not in best],
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request_body: AnalyzeRequest) -> AnalyzeResponse:
    started_at = time.perf_counter()
    source = request_body.source.strip()
    explanation = request_body.explanation.strip()
    _validate_lengths(source, explanation)
    try:
        key = _cache_key(source)
        concepts = _concept_cache.get(key)
        concept_cache_hit = concepts is not None
        concepts_started_at = time.perf_counter()
        if concepts is None:
            concepts = await extract_concepts(source)
            if concepts:
                _concept_cache[key] = concepts
        concepts_ms = (time.perf_counter() - concepts_started_at) * 1000
        if not concepts:
            raise HTTPException(
                422, "Could not identify source concepts. Try a clearer passage."
            )
        propositions_started_at = time.perf_counter()
        propositions = await extract_propositions(source, explanation)
        propositions_ms = (time.perf_counter() - propositions_started_at) * 1000
        if not propositions:
            raise HTTPException(
                422, "Could not parse the explanation. Try writing in full sentences."
            )
        alignment_started_at = time.perf_counter()
        alignment = align(propositions, concepts)
        alignment_ms = (time.perf_counter() - alignment_started_at) * 1000
        verification_started_at = time.perf_counter()
        verdicts, follow_up = await verify(
            source, propositions, concepts, alignment
        )
        verification_ms = (time.perf_counter() - verification_started_at) * 1000
        logger.warning(
            "analysis_timing cache_hit=%s concepts_ms=%.1f "
            "propositions_ms=%.1f alignment_ms=%.1f verification_ms=%.1f "
            "total_ms=%.1f concepts=%d propositions=%d",
            concept_cache_hit,
            concepts_ms,
            propositions_ms,
            alignment_ms,
            verification_ms,
            (time.perf_counter() - started_at) * 1000,
            len(concepts),
            len(propositions),
        )
    except LLMTimeoutError as exc:
        raise HTTPException(504, "The model timed out. Please try again.") from exc
    except LLMConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except LLMResponseError as exc:
        raise HTTPException(
            502, "The model returned an unparseable response. Please try again."
        ) from exc

    concepts_by_id = {concept.id: concept for concept in concepts}
    flags: list[Flag] = []
    for proposition in propositions:
        concept_id, similarity = alignment.get(proposition.id, (None, 0.0))
        verdict = verdicts.get(proposition.id)
        if verdict is None:
            state = "grey"
            hint = "Connect this claim more explicitly to the source."
        else:
            state = resolve(proposition, verdict, similarity, T_HIGH, T_LOW)
            hint = verdict.revision_hint
        misconception, refutation = (
            match(proposition.claim_span) if state == "red" else (None, None)
        )
        concept = concepts_by_id.get(concept_id)
        flags.append(
            Flag(
                prop_id=proposition.id,
                state=state,
                start=proposition.claim_start,
                end=proposition.claim_end,
                concept_id=concept_id,
                anchor=concept.anchor if concept and state != "green" else None,
                hint=hint if state != "green" else None,
                misconception=misconception,
                refutation=refutation,
                similarity=similarity,
            )
        )
    return AnalyzeResponse(
        concepts=concepts,
        flags=flags,
        follow_up=follow_up,
        coverage=compute_coverage(concepts, flags),
    )
