import numpy as np

from backend import align
from backend.schemas import Concept, Proposition


def test_alignment_embeds_student_justification_with_claim(monkeypatch) -> None:
    embedded: list[list[str]] = []

    def fake_embed(texts: list[str]) -> np.ndarray:
        embedded.append(texts)
        return np.ones((len(texts), 384), dtype=np.float32)

    monkeypatch.setattr(align, "embed", fake_embed)
    proposition = Proposition(
        id="P1",
        claim_span="The transport needs ATP",
        justification_spans=["because ions move against their gradients"],
    )
    concept = Concept(
        id="K1",
        label="ATP powers active transport",
        anchor="ATP supplies energy for transport against concentration gradients.",
    )

    result = align.align([proposition], [concept])

    assert embedded[0] == [
        "The transport needs ATP because ions move against their gradients"
    ]
    assert result["P1"][0] == "K1"
