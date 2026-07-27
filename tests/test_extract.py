from backend.extract import (
    _dedupe_overlaps,
    find_normalized,
    locate_concept_anchors,
    locate_spans,
)
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


def test_find_normalized_offsets_into_original() -> None:
    haystack = "alpha  beta\n\tgamma delta"
    needle = "beta gamma"  # single spaces; haystack has double space + newline + tab
    start, end = find_normalized(haystack, needle)
    assert (start, end) == (7, 18)  # "beta\n\tgamma" in the original
    assert haystack[start:end] == "beta\n\tgamma"
    assert _norm(haystack[start:end]) == "beta gamma"


def test_find_normalized_respects_cursor() -> None:
    haystack = "x foo y foo z"
    first = find_normalized(haystack, "foo", 0)
    second = find_normalized(haystack, "foo", first[1])
    assert first == (2, 5)
    assert second == (8, 11)


def test_find_normalized_missing_returns_minus_one() -> None:
    assert find_normalized("abc def ghi", "xyz") == (-1, -1)
    assert find_normalized("abc def ghi", "") == (-1, -1)


def test_concept_anchor_resolves_across_hard_wraps() -> None:
    # Source wrapped at ~72 chars with a newline mid-sentence, a tab, and a
    # double space — exactly what a PDF paste produces.
    source = (
        "The pump moves sodium ions out of the cell and potassium ions in,\n"
        "using ATP  to\texport calcium and protons."
    )
    # Model returned the anchor with single spaces in place of the wrap/tab.
    anchor = "the cell and potassium ions in, using ATP to export calcium"
    concepts = locate_concept_anchors(
        [{"id": "K1", "label": "Ion exchange", "anchor": anchor}],
        source,
    )
    assert len(concepts) == 1
    concept = concepts[0]
    # Offsets index the original wrapped source; the stored anchor IS the raw
    # slice, so re-slicing reproduces it verbatim (newlines/tabs included).
    assert source[concept.anchor_start : concept.anchor_end] == concept.anchor
    assert "\n" in concept.anchor
    assert "\t" in concept.anchor


def test_claim_span_resolves_across_wraps_and_stored_raw() -> None:
    explanation = (
        "The pump transports glucose and amino\nacids and the export of"
        " calcium and protons."
    )
    raw = [
        {
            "id": "P1",
            "claim_span": "glucose and amino acids and the export of calcium",
            "justification_spans": [],
            "type": "causal",
            "certainty": "high",
        }
    ]
    props = locate_spans(raw, explanation)
    assert len(props) == 1
    prop = props[0]
    assert explanation[prop.claim_start : prop.claim_end] == prop.claim_span
    # The newline sits inside the matched range: stored text keeps it.
    assert "\n" in prop.claim_span


def test_justification_span_resolves_across_wraps() -> None:
    explanation = "ABC. The pump is driven by ATP\nhydrolysis and a phosphate shift."
    raw = [
        {
            "id": "P1",
            "claim_span": "ABC.",
            "justification_spans": ["ATP hydrolysis and a phosphate shift"],
            "type": "causal",
            "certainty": "high",
        }
    ]
    props = locate_spans(raw, explanation)
    assert len(props) == 1
    prop = props[0]
    assert len(prop.justification_spans) == 1
    j_text = prop.justification_spans[0]
    j_start, j_end = prop.justification_offsets[0]
    assert explanation[j_start:j_end] == j_text
    assert "\n" in j_text


def test_locate_still_discards_truly_absent_spans() -> None:
    explanation = "The pump uses ATP to move ions."
    raw = [
        {
            "id": "P1",
            "claim_span": "The pump synthesizes ATP from glucose.",
            "justification_spans": [],
            "type": "causal",
            "certainty": "high",
        }
    ]
    assert locate_spans(raw, explanation) == []


def _norm(s: str) -> str:
    import re

    return re.sub(r"\s+", " ", s).strip()
