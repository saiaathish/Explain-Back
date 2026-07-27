"""Sole backend network boundary to the configured model provider."""

import asyncio
import copy
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any

from dotenv import load_dotenv
import httpx

from backend.prompts import CI_CALL_B_SUFFIX, CI_CALL_C_SUFFIX

load_dotenv()
logger = logging.getLogger(__name__)

_CALLS = {"a", "b", "c", "generic"}
_ROLES = {"prod", "ci"}


@dataclass(frozen=True)
class GenerationConfig:
    role: str
    call: str
    model: str
    temperature: float
    reasoning_effort: str
    schema_mode: str


@dataclass(frozen=True)
class ProviderConfig:
    api_key: str
    base_url: str
    generation: GenerationConfig


@dataclass(frozen=True)
class _GenerationDefaults:
    temperature: float
    reasoning_effort: str
    schema_mode: str


# Keep configuration explicit per role and per semantic call. Values intentionally
# match while Gemma is characterized without prompt or decoding changes.
_GENERATION_DEFAULTS = {
    role: {
        call: _GenerationDefaults(
            temperature=0,
            reasoning_effort="minimal",
            schema_mode=(
                "json_schema"
                if role == "ci" and call in {"a", "b", "c"}
                else "prompt"
            ),
        )
        for call in _CALLS
    }
    for role in _ROLES
}

_STRING = {"type": "string"}
_JSON_SCHEMAS: dict[str, dict[str, Any]] = {
    "a": {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "id": _STRING,
                "label": _STRING,
                "anchor": _STRING,
            },
            "required": ["id", "label", "anchor"],
            "additionalProperties": False,
        },
    },
    "b": {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "id": _STRING,
                "claim_span": _STRING,
                "justification_spans": {
                    "type": "array",
                    "items": _STRING,
                },
                "type": {
                    "type": "string",
                    "enum": ["causal", "descriptive", "comparative"],
                },
                "certainty": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                },
            },
            "required": [
                "id",
                "claim_span",
                "justification_spans",
                "type",
                "certainty",
            ],
            "additionalProperties": False,
        },
    },
    "c": {
        "type": "object",
        "properties": {
            "verdicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "prop_id": _STRING,
                        "relation": {
                            "type": "string",
                            "enum": ["entails", "contradicts", "neutral"],
                        },
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                        },
                        "revision_hint": _STRING,
                    },
                    "required": [
                        "prop_id",
                        "relation",
                        "confidence",
                        "revision_hint",
                    ],
                    "additionalProperties": False,
                },
            },
            "follow_up": _STRING,
        },
        "required": ["verdicts", "follow_up"],
        "additionalProperties": False,
    },
}


class LLMConfigurationError(RuntimeError):
    pass


class LLMResponseError(RuntimeError):
    pass


class LLMTimeoutError(LLMResponseError):
    pass


def _normalize_call(call: str) -> str:
    normalized = call.strip().lower()
    if normalized not in _CALLS:
        raise LLMConfigurationError(f"Unknown LLM call label: {call!r}.")
    return normalized


def _generation_config(call: str = "generic") -> GenerationConfig:
    call = _normalize_call(call)
    role = os.getenv(f"LLM_ROLE_{call.upper()}", "").strip().lower()
    if not role:
        role = os.getenv("LLM_ROLE", "prod").strip().lower()
    if role not in _ROLES:
        raise LLMConfigurationError(
            f"Unknown LLM role: {role!r}. Expected one of {sorted(_ROLES)}."
        )

    if role == "prod":
        model = os.getenv("LLM_MODEL_PROD", "").strip()
        if not model:
            model = os.getenv("LLM_MODEL", "").strip()
    else:
        model = os.getenv(f"LLM_MODEL_CI_{call.upper()}", "").strip()
        if not model:
            model = os.getenv("LLM_MODEL_CI", "").strip()
    if not model:
        setting = (
            "LLM_MODEL_PROD (or legacy LLM_MODEL)"
            if role == "prod"
            else "LLM_MODEL_CI"
        )
        raise LLMConfigurationError(
            f"LLM role {role!r} is not configured. Set {setting}."
        )

    defaults = _GENERATION_DEFAULTS[role][call]
    return GenerationConfig(
        role=role,
        call=call,
        model=model,
        temperature=defaults.temperature,
        reasoning_effort=defaults.reasoning_effort,
        schema_mode=defaults.schema_mode,
    )


def active_model(call: str = "generic") -> str:
    """Return the model selected by the centralized role/call registry."""

    return _generation_config(call).model


def active_role(call: str = "generic") -> str:
    return _generation_config(call).role


def is_configured(call: str = "generic") -> bool:
    if not os.getenv("LLM_API_KEY", "").strip():
        return False
    try:
        _generation_config(call)
    except LLMConfigurationError:
        return False
    return True


def _configuration(call: str = "generic") -> ProviderConfig:
    api_key = os.getenv("LLM_API_KEY", "").strip()
    base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    generation = _generation_config(call)
    if not api_key:
        raise LLMConfigurationError("LLM is not configured. Set LLM_API_KEY.")
    return ProviderConfig(
        api_key=api_key,
        base_url=base_url,
        generation=generation,
    )


def _request_payload(prompt: str, config: GenerationConfig) -> dict[str, Any]:
    schema_prompt = prompt
    if config.role == "ci" and config.call == "b":
        prompt += CI_CALL_B_SUFFIX
    if config.role == "ci" and config.call == "c":
        prompt += CI_CALL_C_SUFFIX
    payload: dict[str, Any] = {
        "model": config.model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": config.temperature,
        "reasoning_effort": config.reasoning_effort,
    }
    if config.schema_mode == "json_schema":
        schema = copy.deepcopy(_JSON_SCHEMAS[config.call])
        if config.call == "c":
            prop_ids = re.findall(
                r"^\s*\d+\.\s+prop_id:\s*(\S+)\s*$",
                schema_prompt,
                flags=re.MULTILINE,
            )
            if prop_ids:
                verdicts = schema["properties"]["verdicts"]
                verdicts["minItems"] = len(prop_ids)
                verdicts["maxItems"] = len(prop_ids)
            verdicts["items"]["properties"]["prop_id"] = {
                "type": "string",
                "enum": prop_ids,
            }
            schema["properties"]["follow_up"] = {
                "type": "string",
                "minLength": 1,
                "pattern": r"^(How|Why) [^?]*\?$",
            }
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": f"explain_back_{config.call}",
                "strict": True,
                "schema": schema,
            },
        }
    return payload


async def _client_call(
    prompt: str,
    timeout: float = 20.0,
    call: str = "generic",
) -> str:
    config = _configuration(call)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{config.base_url}/chat/completions",
                json=_request_payload(prompt, config.generation),
                headers={"Authorization": f"Bearer {config.api_key}"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.TimeoutException as exc:
        raise LLMTimeoutError("The model timed out.") from exc
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "llm_request_failed role=%s call=%s model=%s status=%s",
            config.generation.role,
            config.generation.call,
            config.generation.model,
            exc.response.status_code,
        )
        raise LLMResponseError("The model request failed.") from exc
    except httpx.HTTPError as exc:
        logger.warning(
            "llm_request_failed role=%s call=%s model=%s status=transport",
            config.generation.role,
            config.generation.call,
            config.generation.model,
        )
        raise LLMResponseError("The model request failed.") from exc
    except json.JSONDecodeError as exc:
        raise LLMResponseError("The model returned an invalid API response.") from exc
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMResponseError("The model response contained no content.") from exc
    logger.info(
        "llm_response role=%s call=%s configured_model=%s response_model=%s",
        config.generation.role,
        config.generation.call,
        config.generation.model,
        payload.get("model") or config.generation.model,
    )
    return content


def parse_json(raw: str) -> Any:
    text = raw.strip()
    text = re.sub(r"\A```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\Z", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    candidates = []
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        end = text.rfind(closer)
        if start != -1 and end > start:
            candidates.append((start, text[start : end + 1]))
    for _, candidate in sorted(candidates):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise LLMResponseError("The model returned unparseable JSON.")


async def call_json(
    prompt: str,
    retries: int = 2,
    timeout: float = 20.0,
    call: str = "generic",
) -> Any:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return parse_json(
                await _client_call(prompt, timeout=timeout, call=call)
            )
        except (LLMResponseError, LLMTimeoutError) as exc:
            last_error = exc
            if attempt == retries:
                break
            await asyncio.sleep(0.4 * (2**attempt))
    raise LLMResponseError(
        f"Could not parse model output after {retries + 1} attempts."
    ) from last_error
