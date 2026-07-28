import pytest

from backend import verify
from backend.llm import LLMResponseError
from backend.schemas import Concept, Proposition


def proposition(identifier: str, claim: str) -> Proposition:
    return Proposition(
        id=identifier,
        claim_span=claim,
        justification_spans=["because the student supplied a mechanism"],
    )


def test_follow_up_normalizes_mechanism_imperative() -> None:
    assert (
        verify._follow_up("Explain how the ion ratio creates an imbalance.")
        == "Explain how the ion ratio creates an imbalance?"
    )


def test_follow_up_rejects_arbitrary_statement() -> None:
    with pytest.raises(LLMResponseError, match="invalid follow-up"):
        verify._follow_up("The model could not decide.")


def test_follow_up_accepts_one_question_with_clarifying_instruction() -> None:
    text = "How does the ion ratio create charge? Explain the relationship."
    assert verify._follow_up(text) == text


@pytest.mark.asyncio
async def test_verify_rejects_missing_verdict(monkeypatch) -> None:
    calls = 0

    async def incomplete(_prompt: str, *, call: str):
        nonlocal calls
        calls += 1
        assert call == "c"
        return {
            "verdicts": [
                {
                    "prop_id": "P1",
                    "relation": "entails",
                    "confidence": "high",
                    "revision_hint": "Connect the mechanism to the source.",
                }
            ],
            "follow_up": "How does the mechanism connect these ideas?",
        }

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(verify, "call_json", incomplete)
    monkeypatch.setattr(verify.asyncio, "sleep", no_sleep)
    propositions = [
        proposition("P1", "First claim"),
        proposition("P2", "Second claim"),
    ]
    concept = Concept(id="K1", label="Concept", anchor="Source anchor.")

    with pytest.raises(LLMResponseError, match="after 3 attempts"):
        await verify.verify(
            "Source anchor.",
            propositions,
            [concept],
            {"P1": ("K1", 0.9), "P2": ("K1", 0.9)},
        )
    assert calls == 1


@pytest.mark.asyncio
async def test_verify_checks_justification_and_follow_up_shape(monkeypatch) -> None:
    captured = ""

    async def complete(prompt: str, *, call: str):
        nonlocal captured
        assert call == "c"
        captured = prompt
        return {
            "verdicts": [
                {
                    "prop_id": "P1",
                    "relation": "entails",
                    "confidence": "high",
                    "revision_hint": "Connect the mechanism to the source.",
                }
            ],
            "follow_up": "How does the mechanism connect these ideas?",
        }

    monkeypatch.setattr(verify, "call_json", complete)
    item = proposition("P1", "First claim")
    concept = Concept(id="K1", label="Concept", anchor="Source anchor.")

    verdicts, follow_up = await verify.verify(
        "Source anchor.",
        [item],
        [concept],
        {"P1": ("K1", 0.9)},
    )

    assert item.justification_spans[0] in captured
    assert verdicts["P1"].relation == "entails"
    assert follow_up == "How does the mechanism connect these ideas?"
