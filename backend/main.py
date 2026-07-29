import asyncio
import base64
import binascii
import hashlib
import logging
import math
import os
import re
import time
from collections import deque
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.align import align, embed_concepts
from backend.config import (
    MAX_EXPLANATION_CHARS,
    MAX_SOURCE_CHARS,
    MIN_EXPLANATION_CHARS,
    MIN_SOURCE_CHARS,
    T_HIGH,
    T_LOW,
)
from backend.extract import extract_concepts, extract_propositions
from backend.llm import (
    LLMConfigurationError,
    LLMRateLimitError,
    LLMResponseError,
    LLMTimeoutError,
    call_audio_text,
    call_vision_text,
    is_configured,
)
from backend.misconceptions import match
from backend.resolve import resolve
from backend.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    Concept,
    Coverage,
    Flag,
    NormalizeImageRequest,
    NormalizeImageResponse,
    TranscribeRequest,
    TranscribeResponse,
)
from backend.verify import verify

logger = logging.getLogger(__name__)
_concept_cache: dict[str, list[Concept]] = {}
_result_cache: dict[str, AnalyzeResponse] = {}
_prewarm_task: asyncio.Task[None] | None = None
_rate_limit_events: dict[str, deque[float]] = {}
_rate_limit_last_cleanup = 0.0
RATE_LIMIT_MAX_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 60.0
# Every endpoint that spends a model call shares one per-client budget.
RATE_LIMITED_PATHS = frozenset(
    {"/api/analyze", "/api/normalize-image", "/api/transcribe"}
)
PREWARM_SOURCE_FILES = (
    "source_sodium_pump.txt",
    "source_supply_demand.txt",
    "source_photosynthesis.txt",
)
DEMO_SOURCE_FILE = "source_sodium_pump.txt"
# Both halves of the demo: the first submission and the revision the student
# pastes in. Cold page load must hit the result cache for each.
DEMO_EXPLANATION_FILES = (
    "demo_video.txt",
    "demo_video_revised.txt",
)
MAX_IMAGE_BYTES = 8 * 1024 * 1024
_IMAGE_DATA_URL_RE = re.compile(
    r"^data:(?P<mime>image/(?:png|jpeg|webp));base64,(?P<data>[A-Za-z0-9+/]*={0,2})$"
)
# MAX_RECORDING_MS caps recordings at three minutes, which is roughly 3 MB in
# any browser's opus or aac output. 4 MB leaves headroom without letting a
# single request buffer tens of megabytes on a small instance.
MAX_AUDIO_BYTES = 4 * 1024 * 1024
# MediaRecorder emits webm/ogg opus in Chrome and Firefox, mp4/aac in Safari.
_AUDIO_FORMATS = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}
_AUDIO_DATA_URL_RE = re.compile(
    r"^data:(?P<mime>audio/[A-Za-z0-9.+-]+)(?P<codecs>;codecs=[^;,]+)?"
    r";base64,(?P<data>[A-Za-z0-9+/]*={0,2})$"
)


def _base64_envelope_bytes(raw_bytes: int) -> int:
    """Room for raw_bytes base64-encoded inside a small JSON object."""

    return (raw_bytes + 2) // 3 * 4 + 4096


# The per-endpoint decoded-size guards below only run once the whole body is
# already parsed in memory. On a small instance a multi-megabyte upload can
# restart the process before that check is reached, so refuse anything larger
# than the endpoint could ever legitimately accept before reading the body.
MAX_REQUEST_BYTES = {
    "/api/analyze": 256 * 1024,
    "/api/normalize-image": _base64_envelope_bytes(MAX_IMAGE_BYTES),
    "/api/transcribe": _base64_envelope_bytes(MAX_AUDIO_BYTES),
}
_AUDIO_PROMPT = (
    "Transcribe the spoken explanation in this audio verbatim. "
    "Preserve the speaker's own wording, including technical terms. "
    "Do not summarize, correct, translate, or add commentary. "
    "Return only the transcript. If no speech is present, return an empty string. "
    "Keep the response under 4000 characters."
)
_IMAGE_PROMPT = (
    "Extract only the readable source-material text from this image. "
    "Preserve wording, paragraph breaks, and symbols where possible. "
    "Do not describe the image, add a title, explain anything, or invent text. "
    "Return only the extracted text. If no readable text is present, return an empty string. "
    "Keep the response under 6000 characters."
)


def _cache_key(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _result_cache_key(source: str, explanation: str, focused: bool = False) -> str:
    mode = "focused" if focused else "standard"
    return hashlib.sha256(f"{mode}\x00{source}\x00{explanation}".encode("utf-8")).hexdigest()


async def _prewarm_source(sample: Path) -> None:
    source = sample.read_text(encoding="utf-8").strip()
    try:
        concepts = await extract_concepts(source)
    except LLMResponseError:
        logger.exception("Concept cache prewarm failed for %s.", sample.name)
        return
    if concepts:
        _concept_cache[_cache_key(source)] = concepts
        await asyncio.to_thread(embed_concepts, concepts)


async def _prewarm() -> None:
    if not is_configured(call="a"):
        logger.warning("Concept cache prewarm skipped: LLM credentials are not configured.")
        return
    samples = Path(__file__).parents[1] / "samples"
    for filename in PREWARM_SOURCE_FILES:
        await _prewarm_source(samples / filename)
    demo_source = (samples / DEMO_SOURCE_FILE).read_text(encoding="utf-8").strip()
    for filename in DEMO_EXPLANATION_FILES:
        demo_explanation = (samples / filename).read_text(encoding="utf-8").strip()
        try:
            await analyze(
                AnalyzeRequest(source=demo_source, explanation=demo_explanation)
            )
        except (HTTPException, LLMResponseError):
            logger.exception("Full demo result prewarm failed for %s.", filename)


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


@app.middleware("http")
async def rate_limit_model_calls(request: Request, call_next):
    global _rate_limit_last_cleanup

    if request.method != "POST" or request.url.path not in RATE_LIMITED_PATHS:
        return await call_next(request)

    max_bytes = MAX_REQUEST_BYTES.get(request.url.path)
    declared = request.headers.get("content-length", "").strip()
    if max_bytes is not None and declared.isdigit() and int(declared) > max_bytes:
        return JSONResponse(
            status_code=413,
            content={"detail": "That upload is too large for this endpoint."},
        )

    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_id = forwarded_for.rsplit(",", 1)[-1].strip()
    if not client_id:
        client_id = request.client.host if request.client else "unknown"

    now = time.monotonic()
    if now - _rate_limit_last_cleanup >= RATE_LIMIT_WINDOW_SECONDS:
        stale_cutoff = now - RATE_LIMIT_WINDOW_SECONDS
        for stored_client, stored_events in list(_rate_limit_events.items()):
            while stored_events and stored_events[0] <= stale_cutoff:
                stored_events.popleft()
            if not stored_events:
                del _rate_limit_events[stored_client]
        _rate_limit_last_cleanup = now

    events = _rate_limit_events.setdefault(client_id, deque())
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    while events and events[0] <= cutoff:
        events.popleft()

    if len(events) >= RATE_LIMIT_MAX_REQUESTS:
        retry_after = max(
            1,
            math.ceil(events[0] + RATE_LIMIT_WINDOW_SECONDS - now),
        )
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Too many submissions. Please try again shortly."
            },
            headers={"Retry-After": str(retry_after)},
        )

    events.append(now)
    return await call_next(request)


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


def _validate_lengths(source: str, explanation: str, focused: bool = False) -> None:
    if not source or not explanation:
        raise HTTPException(400, "Paste both source material and your explanation.")
    if not focused and len(source) < MIN_SOURCE_CHARS:
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


@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _retry_after_header(exc: LLMRateLimitError) -> dict[str, str] | None:
    if exc.retry_after is None:
        return None
    return {"Retry-After": str(max(1, math.ceil(exc.retry_after)))}


def _validate_image_data_url(image_data_url: str) -> str:
    if not isinstance(image_data_url, str):
        raise HTTPException(400, "Image must be a PNG, JPEG, or WebP data URL.")
    match = _IMAGE_DATA_URL_RE.fullmatch(image_data_url.strip())
    if match is None:
        raise HTTPException(
            400,
            "Image must be a strict base64 data URL using PNG, JPEG, or WebP.",
        )
    encoded = match.group("data")
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(400, "Image data URL contains invalid base64.") from exc
    if not decoded:
        raise HTTPException(400, "Image data URL is empty.")
    if len(decoded) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is too large. Keep it under 8 MB.")
    return image_data_url.strip()


@app.post("/api/normalize-image", response_model=NormalizeImageResponse)
async def normalize_image(
    request_body: NormalizeImageRequest,
) -> NormalizeImageResponse:
    image_data_url = _validate_image_data_url(request_body.image_data_url)
    try:
        text = await call_vision_text(
            _IMAGE_PROMPT,
            image_data_url,
            max_chars=MAX_SOURCE_CHARS,
        )
    except LLMTimeoutError as exc:
        raise HTTPException(504, "The vision model timed out. Please try again.") from exc
    except LLMRateLimitError as exc:
        raise HTTPException(
            429,
            "The model provider is rate limiting this app. Please try again shortly.",
            headers=_retry_after_header(exc),
        ) from exc
    except LLMConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except LLMResponseError as exc:
        raise HTTPException(
            502,
            "The vision model returned an unparseable response. Please try again.",
        ) from exc
    return NormalizeImageResponse(text=text)


def _validate_audio_data_url(audio_data_url: str) -> tuple[str, str]:
    """Return (base64 payload, provider format) for a strict audio data URL."""

    if not isinstance(audio_data_url, str):
        raise HTTPException(400, "Audio must be a recorded audio data URL.")
    match = _AUDIO_DATA_URL_RE.fullmatch(audio_data_url.strip())
    if match is None:
        raise HTTPException(
            400, "Audio must be a strict base64 data URL with an audio MIME type."
        )
    audio_format = _AUDIO_FORMATS.get(match.group("mime").lower())
    if audio_format is None:
        raise HTTPException(
            400, "Unsupported audio format. Record WebM, Ogg, MP4, MP3, or WAV."
        )
    encoded = match.group("data")
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(400, "Audio data URL contains invalid base64.") from exc
    if not decoded:
        raise HTTPException(400, "Audio data URL is empty.")
    if len(decoded) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Recording is too large. Keep it under 4 MB.")
    return encoded, audio_format


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe(request_body: TranscribeRequest) -> TranscribeResponse:
    audio_base64, audio_format = _validate_audio_data_url(request_body.audio_data_url)
    try:
        text = await call_audio_text(
            _AUDIO_PROMPT,
            audio_base64,
            audio_format,
            max_chars=MAX_EXPLANATION_CHARS,
        )
    except LLMTimeoutError as exc:
        raise HTTPException(504, "Transcription timed out. Please try again.") from exc
    except LLMRateLimitError as exc:
        raise HTTPException(
            429,
            "The model provider is rate limiting this app. Please try again shortly.",
            headers=_retry_after_header(exc),
        ) from exc
    except LLMConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except LLMResponseError as exc:
        raise HTTPException(
            502, "Transcription returned an unparseable response. Please try again."
        ) from exc
    return TranscribeResponse(text=text)


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request_body: AnalyzeRequest) -> AnalyzeResponse:
    started_at = time.perf_counter()
    source = request_body.source.strip()
    explanation = request_body.explanation.strip()
    _validate_lengths(source, explanation, request_body.focused)
    result_key = _result_cache_key(source, explanation, request_body.focused)
    cached_result = _result_cache.get(result_key)
    if cached_result is not None:
        return cached_result
    try:
        key = _cache_key(source)
        concepts = _concept_cache.get(key)
        concept_cache_hit = concepts is not None
        concepts_started_at = time.perf_counter()
        propositions_started_at = time.perf_counter()
        if request_body.focused:
            concepts = [
                Concept(
                    id="K1",
                    label="Focused concept",
                    anchor=source,
                    anchor_start=0,
                    anchor_end=len(source),
                )
            ]
            propositions = await extract_propositions(source, explanation)
            concept_cache_hit = False
        elif concepts is None:
            concepts, propositions = await asyncio.gather(
                extract_concepts(source),
                extract_propositions(source, explanation),
            )
            if concepts:
                _concept_cache[key] = concepts
        else:
            propositions = await extract_propositions(source, explanation)
        concepts_ms = (time.perf_counter() - concepts_started_at) * 1000
        if not concepts:
            raise HTTPException(
                422, "Could not identify source concepts. Try a clearer passage."
            )
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
    except LLMRateLimitError as exc:
        raise HTTPException(
            429,
            "The model provider is rate limiting this app. Please try again shortly.",
            headers=_retry_after_header(exc),
        ) from exc
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
    response = AnalyzeResponse(
        concepts=concepts,
        flags=flags,
        follow_up=follow_up,
        coverage=compute_coverage(concepts, flags),
    )
    _result_cache[result_key] = response
    return response
