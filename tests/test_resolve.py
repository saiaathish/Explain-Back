import pytest

from backend.resolve import is_specific, resolve
from backend.schemas import Proposition, Verdict


def proposition(text: str, justified: bool = False) -> Proposition:
    return Proposition(
        id="P1",
        claim_span=text,
        justification_spans=["because evidence"] if justified else [],
    )


def verdict(relation: str, confidence: str = "high") -> Verdict:
    return Verdict(
        prop_id="P1",
        relation=relation,
        confidence=confidence,
        revision_hint="Clarify the mechanism.",
    )


def test_specific_high_confidence_contradiction_is_red() -> None:
    assert resolve(
        proposition("Three potassium ions move out."),
        verdict("contradicts"),
        0.75,
        0.80,
        0.60,
    ) == "red"


def test_hedged_contradiction_is_grey() -> None:
    claim = "The pump usually moves three potassium ions out."
    assert not is_specific(claim)
    assert resolve(
        proposition(claim), verdict("contradicts"), 0.75, 0.80, 0.60
    ) == "grey"


def test_hedged_entailment_is_grey() -> None:
    claim = "The pump might move sodium outward."
    assert resolve(
        proposition(claim), verdict("entails"), 0.90, 0.80, 0.60
    ) == "grey"


def test_low_confidence_entailment_is_grey() -> None:
    assert resolve(
        proposition("The pump uses ATP.", justified=True),
        verdict("entails", confidence="low"),
        0.90,
        0.80,
        0.60,
    ) == "grey"


@pytest.mark.parametrize(
    "claim",
    [
        "The process is passive.",
        "The ions diffuse through the pump.",
        "The ions move without cellular energy.",
        "ATP is not necessary.",
    ],
)
def test_categorical_transport_claims_are_specific(claim: str) -> None:
    assert is_specific(claim)


def test_supported_unjustified_is_yellow() -> None:
    assert resolve(
        proposition("Three sodium ions move out."),
        verdict("entails"),
        0.90,
        0.80,
        0.60,
    ) == "yellow"


def test_supported_unjustified_below_high_cut_is_still_yellow() -> None:
    assert resolve(
        proposition("The pump uses ATP."),
        verdict("entails"),
        0.75,
        0.80,
        0.60,
    ) == "yellow"


def test_supported_justified_is_green() -> None:
    assert resolve(
        proposition("Three sodium ions move out.", justified=True),
        verdict("entails"),
        0.90,
        0.80,
        0.60,
    ) == "green"
