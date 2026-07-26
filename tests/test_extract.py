from backend.extract import _dedupe_overlaps, locate_concept_anchors, locate_spans
from backend.schemas import Proposition


def test_fabricated_claim_and_justification_are_discarded() -> None:
    explanation = "The pump uses ATP. It changes shape because phosphate binds."
    raw = [
        {
            "id": "P1",
            "claim_span": "The pump uses ATP.",
            "justification_spans": [
                "because phosphate binds",
                "ATP releases magical energy",
            ],
            "type": "causal",
            "certainty": "high",
        },
        {
            "id": "P2",
            "claim_span": "The pump moves ions.",
            "justification_spans": [],
            "type": "descriptive",
            "certainty": "high",
        },
    ]
    props = locate_spans(raw, explanation)
    assert len(props) == 1
    assert props[0].justification_spans == ["because phosphate binds"]
    assert explanation[props[0].claim_start : props[0].claim_end] == props[0].claim_span
    for text, (start, end) in zip(
        props[0].justification_spans, props[0].justification_offsets
    ):
        assert explanation[start:end] == text


def test_concept_anchor_must_be_verbatim() -> None:
    source = "The pump moves three sodium ions out of the cell."
    concepts = locate_concept_anchors(
        [
            {"id": "K1", "label": "Sodium exits", "anchor": source},
            {
                "id": "K2",
                "label": "Potassium enters",
                "anchor": "Two potassium ions enter.",
            },
        ],
        source,
    )
    assert [concept.id for concept in concepts] == ["K1"]
    assert source[concepts[0].anchor_start : concepts[0].anchor_end] == concepts[0].anchor


def test_longer_overlapping_proposition_wins() -> None:
    props = [
        Proposition(id="P1", claim_span="abc", claim_start=0, claim_end=3),
        Proposition(id="P2", claim_span="abcdef", claim_start=0, claim_end=6),
        Proposition(id="P3", claim_span="ghi", claim_start=7, claim_end=10),
    ]
    assert [item.id for item in _dedupe_overlaps(props)] == ["P2", "P3"]
