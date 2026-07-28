import pytest

from backend import llm


def _set_prod(monkeypatch, model: str = "prod-model") -> None:
    monkeypatch.setenv("LLM_API_KEY", "secret")
    monkeypatch.setenv("LLM_ROLE", "prod")
    monkeypatch.setenv("LLM_MODEL_PROD", model)
    monkeypatch.delenv("LLM_MODEL", raising=False)


def test_parse_json_strips_fence() -> None:
    assert llm.parse_json('```json\n{"ok": true}\n```') == {"ok": True}


def test_parse_json_salvages_wrapped_object() -> None:
    assert llm.parse_json('Here is JSON: {"ok": true}\nThanks.') == {"ok": True}


@pytest.mark.asyncio
async def test_call_json_fails_loudly_after_retries(monkeypatch) -> None:
    calls = 0

    async def corrupt(_prompt: str, timeout: float, call: str) -> str:
        nonlocal calls
        calls += 1
        assert call == "b"
        return "not json"

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(llm, "_client_call", corrupt)
    monkeypatch.setattr(llm.asyncio, "sleep", no_sleep)

    with pytest.raises(llm.LLMResponseError, match="after 3 attempts"):
        await llm.call_json("prompt", retries=2, call="b")
    assert calls == 3


def test_prod_role_preserves_legacy_model_fallback(monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROLE", "prod")
    monkeypatch.setenv("LLM_MODEL", "legacy-prod")
    monkeypatch.delenv("LLM_MODEL_PROD", raising=False)

    assert llm.active_model(call="a") == "legacy-prod"


def test_prod_model_setting_takes_precedence(monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROLE", "prod")
    monkeypatch.setenv("LLM_MODEL", "legacy-prod")
    monkeypatch.setenv("LLM_MODEL_PROD", "explicit-prod")

    assert llm.active_model(call="b") == "explicit-prod"


def test_ci_role_supports_per_call_model_selection(monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROLE", "ci")
    monkeypatch.setenv("LLM_MODEL_CI", "ci-default")
    monkeypatch.setenv("LLM_MODEL_CI_B", "ci-call-b")

    assert llm.active_model(call="a") == "ci-default"
    assert llm.active_model(call="b") == "ci-call-b"
    assert llm.active_model(call="c") == "ci-default"


def test_per_call_role_override_supports_isolation(monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROLE", "prod")
    monkeypatch.setenv("LLM_ROLE_B", "ci")
    monkeypatch.setenv("LLM_MODEL_PROD", "prod-model")
    monkeypatch.setenv("LLM_MODEL_CI", "ci-model")

    assert llm.active_role(call="a") == "prod"
    assert llm.active_model(call="a") == "prod-model"
    assert llm.active_role(call="b") == "ci"
    assert llm.active_model(call="b") == "ci-model"


def test_unknown_role_fails_loudly(monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROLE", "mystery")

    with pytest.raises(llm.LLMConfigurationError, match="Unknown LLM role"):
        llm.active_model()


def test_ci_role_never_falls_back_to_production(monkeypatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "secret")
    monkeypatch.setenv("LLM_ROLE", "ci")
    monkeypatch.setenv("LLM_MODEL_PROD", "prod-model")
    monkeypatch.setenv("LLM_MODEL", "legacy-prod")
    monkeypatch.delenv("LLM_MODEL_CI", raising=False)

    assert not llm.is_configured(call="a")
    with pytest.raises(llm.LLMConfigurationError, match="LLM_MODEL_CI"):
        llm.active_model(call="a")


def test_generation_defaults_are_explicit_for_every_role_and_call(
    monkeypatch,
) -> None:
    monkeypatch.setenv("LLM_MODEL_PROD", "prod-model")
    monkeypatch.setenv("LLM_MODEL_CI", "ci-model")
    for role in ("prod", "ci"):
        monkeypatch.setenv("LLM_ROLE", role)
        for call in ("a", "b", "c"):
            config = llm._generation_config(call)
            assert config.role == role
            assert config.call == call
            assert config.temperature == 0
            assert config.reasoning_effort == "minimal"
            assert config.schema_mode == (
                "json_schema" if role == "ci" else "prompt"
            )


def test_prod_request_payload_is_legacy_byte_shape(monkeypatch) -> None:
    _set_prod(monkeypatch)
    config = llm._configuration(call="c").generation

    assert llm._request_payload("prompt", config) == {
        "model": "prod-model",
        "messages": [{"role": "user", "content": "prompt"}],
        "temperature": 0,
        "reasoning_effort": "minimal",
    }


def test_ci_request_payload_uses_call_specific_json_schema(monkeypatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "secret")
    monkeypatch.setenv("LLM_ROLE", "ci")
    monkeypatch.setenv("LLM_MODEL_CI", "ci-model")
    config = llm._configuration(call="b").generation

    payload = llm._request_payload("prompt", config)

    assert payload["messages"][0]["content"].startswith("prompt")
    assert "peace treaty was signed in 1919" in payload["messages"][0]["content"]
    assert payload["response_format"]["type"] == "json_schema"
    schema = payload["response_format"]["json_schema"]
    assert schema["name"] == "explain_back_b"
    assert schema["strict"] is True
    assert schema["schema"]["type"] == "array"
    assert "claim_span" in schema["schema"]["items"]["properties"]

    call_c = llm._request_payload(
        "1. prop_id: P4\n2. prop_id: P8\n",
        llm._configuration(call="c").generation,
    )
    assert "exactly one verdict for every prop_id" in (
        call_c["messages"][0]["content"]
    )
    verdicts = call_c["response_format"]["json_schema"]["schema"][
        "properties"
    ]["verdicts"]
    assert verdicts["minItems"] == verdicts["maxItems"] == 2
    assert verdicts["items"]["properties"]["prop_id"]["enum"] == ["P4", "P8"]
    follow_up = call_c["response_format"]["json_schema"]["schema"][
        "properties"
    ]["follow_up"]
    assert follow_up["minLength"] == 1
    assert follow_up["pattern"] == r"^(How|Why) [^?]*\?$"


@pytest.mark.asyncio
async def test_successful_response_logs_configured_and_provider_model(
    monkeypatch, caplog
) -> None:
    _set_prod(monkeypatch)

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "model": "provider-model",
                "choices": [{"message": {"content": '{"ok": true}'}}],
            }

    class Client:
        def __init__(self, timeout: float) -> None:
                assert timeout == 10.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            return None

        async def post(self, *_args, **_kwargs) -> Response:
            return Response()

    monkeypatch.setattr(llm.httpx, "AsyncClient", Client)
    caplog.set_level("INFO", logger="backend.llm")

    assert await llm._client_call("prompt", call="a") == '{"ok": true}'
    assert "configured_model=prod-model" in caplog.text
    assert "response_model=provider-model" in caplog.text
