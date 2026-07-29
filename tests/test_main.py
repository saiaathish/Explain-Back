from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import llm, main
from backend.auth import AuthenticatedUser
from backend.main import _validate_lengths, compute_coverage
from backend.schemas import Concept, Flag, Proposition, Verdict


@pytest.fixture(autouse=True)
def authenticated_model_routes():
    async def authenticated_user() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_id=UUID("c115b779-4e0d-4e1c-92a0-6834e3c08df1"),
            session_id=UUID("9516ba59-ab7f-4c55-b1a1-18f901eced1c"),
            is_anonymous=False,
        )

    main.app.dependency_overrides[main.require_authenticated_user] = authenticated_user
    try:
        yield
    finally:
        main.app.dependency_overrides.pop(main.require_authenticated_user, None)


@pytest.mark.parametrize(
    ("source", "explanation", "message"),
    [
        ("", "", "Paste both"),
        ("short text", "x" * 40, "Source too short"),
        ("x" * 100, "ten chars!", "Explanation too short"),
        ("x" * 20000, "y" * 40, "Source too long"),
        ("x" * 100, "y" * 20000, "Explanation too long"),
    ],
)
def test_clean_validation_errors(source: str, explanation: str, message: str) -> None:
    with pytest.raises(HTTPException, match=message):
        _validate_lengths(source, explanation)


def test_normalize_image_rejects_non_data_url() -> None:
    with TestClient(main.app) as client:
        response = client.post(
            "/api/normalize-image",
            json={"image_data_url": "https://example.com/image.png"},
        )
    assert response.status_code == 400
    assert "strict base64 data URL" in response.json()["detail"]


def test_normalize_image_rejects_unsupported_mime() -> None:
    with TestClient(main.app) as client:
        response = client.post(
            "/api/normalize-image",
            json={"image_data_url": "data:image/gif;base64,AA=="},
        )
    assert response.status_code == 400
    assert "PNG, JPEG, or WebP" in response.json()["detail"]


def test_normalize_image_rejects_decoded_payload_over_8mb() -> None:
    encoded = "data:image/png;base64," + ("A" * (((main.MAX_IMAGE_BYTES + 2) + 2) // 3 * 4))
    with TestClient(main.app) as client:
        response = client.post(
            "/api/normalize-image",
            json={"image_data_url": encoded},
        )
    assert response.status_code == 413
    assert "under 8 MB" in response.json()["detail"]


def test_normalize_image_returns_extracted_text(monkeypatch) -> None:
    seen: dict[str, str] = {}

    async def extract(prompt: str, image_data_url: str, **_kwargs) -> str:
        seen["prompt"] = prompt
        seen["image"] = image_data_url
        return "The extracted source."

    monkeypatch.setattr(main, "call_vision_text", extract)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/normalize-image",
            json={"image_data_url": "data:image/jpeg;base64,AA=="},
        )
    assert response.status_code == 200
    assert response.json() == {"text": "The extracted source."}
    assert seen["image"].startswith("data:image/jpeg;base64,")
    assert len(seen["prompt"]) <= 6000


@pytest.mark.parametrize(
    ("error", "status", "message"),
    [
        (llm.LLMConfigurationError("missing"), 503, "missing"),
        (llm.LLMTimeoutError("slow"), 504, "timed out"),
        (llm.LLMResponseError("bad"), 502, "unparseable response"),
    ],
)
def test_normalize_image_maps_provider_errors(monkeypatch, error, status, message) -> None:
    async def fail(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(main, "call_vision_text", fail)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/normalize-image",
            json={"image_data_url": "data:image/png;base64,AA=="},
        )
    assert response.status_code == status
    assert message in response.json()["detail"]


def test_corrupt_model_output_is_visible_error_not_all_grey(monkeypatch) -> None:
    async def corrupt(_prompt: str, timeout: float, call: str) -> str:
        assert call == "a"
        return "not valid json"

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(llm, "_client_call", corrupt)
    monkeypatch.setattr(llm.asyncio, "sleep", no_sleep)
    main._concept_cache.clear()
    with TestClient(main.app) as client:
        response = client.post(
            "/api/analyze",
            json={"source": "A" * 120, "explanation": "B" * 50},
        )
    assert response.status_code == 502
    assert "unparseable response" in response.json()["detail"]
    assert "flags" not in response.json()


def test_prewarm_does_not_block_health_endpoint(monkeypatch) -> None:
    started = False

    async def slow_prewarm() -> None:
        nonlocal started
        started = True
        await main.asyncio.Event().wait()

    monkeypatch.setattr(main, "_prewarm", slow_prewarm)
    with TestClient(main.app) as client:
        response = client.get("/api/health")

        assert started
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_health_endpoint_accepts_head_requests() -> None:
    with TestClient(main.app) as client:
        response = client.head("/api/health")

    assert response.status_code == 200
    assert response.content == b""


def test_prewarm_loads_all_demo_sources(monkeypatch) -> None:
    seen: list[str] = []
    active = 0
    max_active = 0

    async def concepts(source: str):
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        await main.asyncio.sleep(0)
        seen.append(source)
        active -= 1
        return []

    monkeypatch.setenv("LLM_API_KEY", "configured")
    monkeypatch.setenv("LLM_MODEL", "configured")
    monkeypatch.setattr(main, "extract_concepts", concepts)
    main.asyncio.run(main._prewarm())

    samples = main.Path(main.__file__).parents[1] / "samples"
    expected = {
        (samples / filename).read_text(encoding="utf-8").strip()
        for filename in main.PREWARM_SOURCE_FILES
    }
    assert set(seen) == expected
    assert max_active == 1


def test_rate_limit_returns_clean_429(monkeypatch) -> None:
    async def no_prewarm() -> None:
        return None

    monkeypatch.setattr(main, "_prewarm", no_prewarm)
    main._rate_limit_events.clear()
    main._rate_limit_last_cleanup = 0.0
    payload = {"source": "A" * 120, "explanation": "ATP"}
    origin = main.os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",")[0]
    try:
        with TestClient(main.app) as client:
            responses = [
                client.post(
                    "/api/analyze",
                    json=payload,
                    headers={
                        "Origin": origin,
                        "X-Forwarded-For": "spoofed, real-client",
                    },
                )
                for _ in range(main.RATE_LIMIT_MAX_REQUESTS + 1)
            ]
        assert all(response.status_code == 400 for response in responses[:-1])
        assert responses[-1].status_code == 429
        assert responses[-1].json() == {
            "detail": "Too many submissions. Please try again shortly."
        }
        assert int(responses[-1].headers["retry-after"]) > 0
        assert responses[-1].headers["access-control-allow-origin"] == origin
        assert "real-client" in main._rate_limit_events
        assert "spoofed" not in main._rate_limit_events
    finally:
        main._rate_limit_events.clear()
        main._rate_limit_last_cleanup = 0.0


def test_pipeline_returns_anchored_non_green_flags(monkeypatch) -> None:
    source = (
        "The pump moves three sodium ions out and two potassium ions into the cell. "
        "ATP changes the pump shape so ions move against their gradients."
    )
    claims = [
        "ATP changes shape because phosphate binds.",
        "The pump moves sodium.",
        "Three potassium ions move out.",
        "Cells contain many structures.",
    ]
    explanation = " ".join(claims)
    anchor = "The pump moves three sodium ions out and two potassium ions into the cell."
    concept = Concept(
        id="K1",
        label="Pump moves three sodium out and two potassium in",
        anchor=anchor,
        anchor_start=0,
        anchor_end=len(anchor),
    )
    propositions = []
    for index, claim in enumerate(claims):
        start = explanation.index(claim)
        propositions.append(
            Proposition(
                id=f"P{index + 1}",
                claim_span=claim,
                claim_start=start,
                claim_end=start + len(claim),
                justification_spans=(
                    ["because phosphate binds"] if index == 0 else []
                ),
            )
        )

    async def concepts(_source: str):
        return [concept]

    async def props(_source: str, _explanation: str):
        return propositions

    def alignment(_props, _concepts):
        return {
            "P1": ("K1", 0.91),
            "P2": ("K1", 0.91),
            "P3": ("K1", 0.82),
            "P4": ("K1", 0.20),
        }

    async def verification(_source, _props, _concepts, _alignment):
        return (
            {
                "P1": Verdict(
                    prop_id="P1",
                    relation="entails",
                    confidence="high",
                    revision_hint="Clarify the mechanism.",
                ),
                "P2": Verdict(
                    prop_id="P2",
                    relation="entails",
                    confidence="high",
                    revision_hint="Add why this movement matters.",
                ),
                "P3": Verdict(
                    prop_id="P3",
                    relation="contradicts",
                    confidence="high",
                    revision_hint="Correct the ion direction.",
                ),
                "P4": Verdict(
                    prop_id="P4",
                    relation="neutral",
                    confidence="low",
                    revision_hint="Connect this statement to the passage.",
                ),
            },
            "How does ATP change the pump to move ions against their gradients?",
        )

    monkeypatch.setattr(main, "extract_concepts", concepts)
    monkeypatch.setattr(main, "extract_propositions", props)
    monkeypatch.setattr(main, "align", alignment)
    monkeypatch.setattr(main, "verify", verification)
    main._concept_cache.clear()
    with TestClient(main.app) as client:
        response = client.post(
            "/api/analyze",
            json={"source": source, "explanation": explanation},
        )
    assert response.status_code == 200
    payload = response.json()
    assert [flag["state"] for flag in payload["flags"]] == [
        "green",
        "yellow",
        "red",
        "grey",
    ]
    for flag in payload["flags"]:
        assert explanation[flag["start"] : flag["end"]]
        assert "similarity" not in flag
        if flag["state"] != "green":
            assert flag["anchor"] in source
            assert flag["hint"]
            assert len(flag["hint"].split()) <= 20


def test_low_similarity_claim_does_not_count_as_concept_coverage() -> None:
    concepts = [
        Concept(id="K1", label="First", anchor="First source span."),
        Concept(id="K2", label="Second", anchor="Second source span."),
    ]
    flags = [
        Flag(
            prop_id="P1",
            state="grey",
            start=0,
            end=5,
            concept_id="K1",
            similarity=0.20,
        )
    ]

    coverage = compute_coverage(concepts, flags)

    assert coverage.covered == []
    assert coverage.partial == []
    assert coverage.missing == ["K1", "K2"]


def test_transcribe_rejects_non_data_url() -> None:
    with TestClient(main.app) as client:
        response = client.post(
            "/api/transcribe",
            json={"audio_data_url": "https://example.com/clip.webm"},
        )
    assert response.status_code == 400
    assert "strict base64 data URL" in response.json()["detail"]


def test_transcribe_rejects_non_audio_mime() -> None:
    with TestClient(main.app) as client:
        response = client.post(
            "/api/transcribe",
            json={"audio_data_url": "data:image/png;base64,AA=="},
        )
    assert response.status_code == 400
    assert "strict base64 data URL" in response.json()["detail"]


def test_transcribe_rejects_unsupported_audio_format() -> None:
    with TestClient(main.app) as client:
        response = client.post(
            "/api/transcribe",
            json={"audio_data_url": "data:audio/flac;base64,AA=="},
        )
    assert response.status_code == 400
    assert "Unsupported audio format" in response.json()["detail"]


def test_transcribe_rejects_payload_over_the_decoded_limit() -> None:
    encoded = "data:audio/webm;base64," + (
        "A" * (((main.MAX_AUDIO_BYTES + 2) + 2) // 3 * 4)
    )
    with TestClient(main.app) as client:
        response = client.post("/api/transcribe", json={"audio_data_url": encoded})
    assert response.status_code == 413
    assert "under 4 MB" in response.json()["detail"]


def test_transcribe_strips_codecs_and_passes_provider_format(monkeypatch) -> None:
    seen: dict[str, str] = {}

    async def transcribe_audio(prompt: str, data: str, fmt: str, **_kwargs) -> str:
        seen["prompt"] = prompt
        seen["data"] = data
        seen["format"] = fmt
        return "The pump moves three sodium ions out."

    monkeypatch.setattr(main, "call_audio_text", transcribe_audio)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/transcribe",
            json={"audio_data_url": "data:audio/webm;codecs=opus;base64,AA=="},
        )
    assert response.status_code == 200
    assert response.json() == {"text": "The pump moves three sodium ions out."}
    # The provider takes bare base64 and a format name, never the data URL prefix.
    assert seen["data"] == "AA=="
    assert seen["format"] == "webm"


@pytest.mark.parametrize(
    ("error", "status", "message"),
    [
        (llm.LLMConfigurationError("missing"), 503, "missing"),
        (llm.LLMTimeoutError("slow"), 504, "timed out"),
        (llm.LLMResponseError("bad"), 502, "unparseable response"),
        (llm.LLMRateLimitError("throttled"), 429, "rate limiting"),
    ],
)
def test_transcribe_maps_provider_errors(monkeypatch, error, status, message) -> None:
    async def fail(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(main, "call_audio_text", fail)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/transcribe",
            json={"audio_data_url": "data:audio/webm;base64,AA=="},
        )
    assert response.status_code == status
    assert message in response.json()["detail"]


def test_provider_throttling_is_429_not_502(monkeypatch) -> None:
    """A rate limit must never be reported as unparseable model output."""

    async def throttled(*_args, **_kwargs):
        raise llm.LLMRateLimitError("throttled", retry_after=7.2)

    monkeypatch.setattr(main, "call_vision_text", throttled)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/normalize-image",
            json={"image_data_url": "data:image/png;base64,AA=="},
        )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "8"
    assert "unparseable" not in response.json()["detail"]


def test_model_backed_endpoints_are_rate_limited() -> None:
    assert main.RATE_LIMITED_PATHS == {
        "/api/analyze",
        "/api/normalize-image",
        "/api/transcribe",
    }


def test_oversized_body_is_refused_before_parsing() -> None:
    """A 12 MB guard that runs after body parsing is too late on a small instance."""

    oversize = main.MAX_REQUEST_BYTES["/api/transcribe"] + 1024
    body = b'{"audio_data_url":"' + b"A" * oversize + b'"}'
    with TestClient(main.app) as client:
        response = client.post(
            "/api/transcribe",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 413
    assert "too large" in response.json()["detail"]


def test_request_size_caps_leave_room_for_the_decoded_limit() -> None:
    assert main.MAX_REQUEST_BYTES["/api/transcribe"] > main.MAX_AUDIO_BYTES
    assert main.MAX_REQUEST_BYTES["/api/normalize-image"] > main.MAX_IMAGE_BYTES
    # A legitimate max-size recording must still fit through the pre-parse gate.
    encoded = (main.MAX_AUDIO_BYTES + 2) // 3 * 4
    assert main.MAX_REQUEST_BYTES["/api/transcribe"] >= encoded


def test_normal_sized_upload_still_passes_the_gate(monkeypatch) -> None:
    async def transcribe_audio(*_args, **_kwargs) -> str:
        return "ok"

    monkeypatch.setattr(main, "call_audio_text", transcribe_audio)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/transcribe",
            json={"audio_data_url": "data:audio/webm;base64," + "A" * 40000},
        )
    assert response.status_code == 200
