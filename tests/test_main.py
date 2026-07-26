import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import llm, main
from backend.main import _validate_lengths, compute_coverage
from backend.schemas import Concept, Flag, Proposition, Verdict


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


def test_corrupt_model_output_is_visible_error_not_all_grey(monkeypatch) -> None:
    async def corrupt(_prompt: str, timeout: float) -> str:
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
