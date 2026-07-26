import pytest

from backend import llm


def test_parse_json_strips_fence() -> None:
    assert llm.parse_json('```json\n{"ok": true}\n```') == {"ok": True}


def test_parse_json_salvages_wrapped_object() -> None:
    assert llm.parse_json('Here is JSON: {"ok": true}\nThanks.') == {"ok": True}


@pytest.mark.asyncio
async def test_call_json_fails_loudly_after_retries(monkeypatch) -> None:
    calls = 0

    async def corrupt(_prompt: str, timeout: float) -> str:
        nonlocal calls
        calls += 1
        return "not json"

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(llm, "_client_call", corrupt)
    monkeypatch.setattr(llm.asyncio, "sleep", no_sleep)

    with pytest.raises(llm.LLMResponseError, match="after 3 attempts"):
        await llm.call_json("prompt", retries=2)
    assert calls == 3
