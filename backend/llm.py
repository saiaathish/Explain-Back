"""Only outbound network boundary in Explain-Back."""

import asyncio
import json
import os
import re
from typing import Any

from dotenv import load_dotenv
import httpx

load_dotenv()


class LLMConfigurationError(RuntimeError):
    pass


class LLMResponseError(RuntimeError):
    pass


class LLMTimeoutError(LLMResponseError):
    pass


def _configuration() -> tuple[str, str, str]:
    api_key = os.getenv("LLM_API_KEY", "").strip()
    model = os.getenv("LLM_MODEL", "").strip()
    base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    if not api_key or not model:
        raise LLMConfigurationError(
            "LLM is not configured. Set LLM_API_KEY and LLM_MODEL."
        )
    return api_key, model, base_url


async def _client_call(prompt: str, timeout: float = 20.0) -> str:
    api_key, model, base_url = _configuration()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                },
                headers={"Authorization": f"Bearer {api_key}"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.TimeoutException as exc:
        raise LLMTimeoutError("The model timed out.") from exc
    except httpx.HTTPError as exc:
        raise LLMResponseError("The model request failed.") from exc
    except json.JSONDecodeError as exc:
        raise LLMResponseError("The model returned an invalid API response.") from exc
    try:
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMResponseError("The model response contained no content.") from exc


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


async def call_json(prompt: str, retries: int = 2, timeout: float = 20.0) -> Any:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return parse_json(await _client_call(prompt, timeout=timeout))
        except (LLMResponseError, LLMTimeoutError) as exc:
            last_error = exc
            if attempt == retries:
                break
            await asyncio.sleep(0.4 * (2**attempt))
    raise LLMResponseError(
        f"Could not parse model output after {retries + 1} attempts."
    ) from last_error
