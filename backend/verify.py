import asyncio
import re
from typing import Any

from backend.llm import LLMResponseError, call_json
from backend.prompts import verification_prompt
from backend.schemas import Concept, Proposition, Verdict


def _cap_hint(text: str) -> str:
    words = str(text).strip().split()
    return " ".join(words[:20])


def _follow_up(text: str) -> str:
    question = text.strip()
    mechanism = re.search(
        r"\b(how|why|mechanism|process|causes?|leads?|results?|relationship)\b",
        question,
        re.IGNORECASE,
    )
    if "?" not in question and mechanism:
        question = question.rstrip(".!") + "?"
    if question.count("?") != 1:
        raise LLMResponseError("The model returned an invalid follow-up question.")
    return question


def _validate_response(
    raw: Any, propositions: list[Proposition]
) -> tuple[dict[str, Verdict], str]:
    if not isinstance(raw, dict):
        raise LLMResponseError("The model returned an invalid verification object.")
    raw_verdicts = raw.get("verdicts")
    if not isinstance(raw_verdicts, list):
        raise LLMResponseError("The model returned no verification verdicts.")
    verdicts: dict[str, Verdict] = {}
    valid_ids = {item.id for item in propositions}
    for item in raw_verdicts:
        if not isinstance(item, dict) or item.get("prop_id") not in valid_ids:
            raise LLMResponseError("The model returned an unknown verification item.")
        if item["prop_id"] in verdicts:
            raise LLMResponseError("The model returned duplicate verification items.")
        relation = item.get("relation")
        confidence = item.get("confidence")
        if relation not in {"entails", "contradicts", "neutral"}:
            raise LLMResponseError("The model returned an invalid relation.")
        if confidence not in {"high", "medium", "low"}:
            raise LLMResponseError("The model returned an invalid confidence.")
        raw_hint = item.get("revision_hint")
        if not isinstance(raw_hint, str) or not raw_hint.strip():
            raise LLMResponseError("The model returned no revision hint.")
        verdicts[item["prop_id"]] = Verdict(
            prop_id=item["prop_id"],
            relation=relation,
            confidence=confidence,
            revision_hint=_cap_hint(raw_hint),
        )
    if set(verdicts) != valid_ids:
        raise LLMResponseError("The model omitted verification items.")
    raw_follow_up = raw.get("follow_up")
    if not isinstance(raw_follow_up, str):
        raise LLMResponseError("The model returned no follow-up question.")
    return verdicts, _follow_up(raw_follow_up)


async def verify(
    source: str,
    propositions: list[Proposition],
    concepts: list[Concept],
    alignment: dict[str, tuple[str, float]],
) -> tuple[dict[str, Verdict], str]:
    concepts_by_id = {concept.id: concept for concept in concepts}
    items: list[dict[str, object]] = []
    for proposition in propositions:
        concept_id, _ = alignment.get(proposition.id, ("", 0.0))
        concept = concepts_by_id.get(concept_id)
        items.append(
            {
                "prop_id": proposition.id,
                "claim": proposition.claim_span,
                "justifications": proposition.justification_spans,
                "source_anchor": concept.anchor if concept else "",
            }
        )

    prompt = verification_prompt(source, items)
    last_error: LLMResponseError | None = None
    for attempt in range(3):
        try:
            return _validate_response(
                await call_json(prompt, call="c"),
                propositions,
            )
        except LLMResponseError as exc:
            last_error = exc
            if attempt == 2:
                break
            await asyncio.sleep(0.4 * (2**attempt))
    raise LLMResponseError(
        "The model returned invalid verification data after 3 attempts."
    ) from last_error
