from typing import Any

from backend.llm import call_json
from backend.prompts import concept_prompt, proposition_prompt
from backend.schemas import Concept, Proposition


def _type(value: Any) -> str:
    return value if value in {"causal", "descriptive", "comparative"} else "descriptive"


def _certainty(value: Any) -> str:
    return value if value in {"high", "medium", "low"} else "medium"


def _dedupe_overlaps(props: list[Proposition]) -> list[Proposition]:
    ordered = sorted(
        props,
        key=lambda item: (
            -(item.claim_end - item.claim_start),
            item.claim_start,
            item.claim_end,
        ),
    )
    kept: list[Proposition] = []
    for candidate in ordered:
        if any(
            candidate.claim_start < existing.claim_end
            and existing.claim_start < candidate.claim_end
            for existing in kept
        ):
            continue
        kept.append(candidate)
    return sorted(kept, key=lambda item: (item.claim_start, item.claim_end))


def locate_spans(raw_props: list[dict[str, Any]], explanation: str) -> list[Proposition]:
    output: list[Proposition] = []
    cursor = 0
    for raw in raw_props:
        claim = raw.get("claim_span", "")
        if not isinstance(claim, str) or not claim.strip():
            continue
        index = explanation.find(claim, cursor)
        if index == -1:
            index = explanation.find(claim)
        if index == -1:
            continue
        cursor = index + len(claim)

        justifications: list[str] = []
        offsets: list[tuple[int, int]] = []
        for justification in raw.get("justification_spans", []):
            if not isinstance(justification, str) or not justification.strip():
                continue
            justification_index = explanation.find(justification)
            if justification_index == -1:
                continue
            justifications.append(justification)
            offsets.append(
                (justification_index, justification_index + len(justification))
            )
        output.append(
            Proposition(
                id=str(raw.get("id") or f"P{len(output) + 1}"),
                claim_span=claim,
                claim_start=index,
                claim_end=index + len(claim),
                justification_spans=justifications,
                justification_offsets=offsets,
                type=_type(raw.get("type")),
                certainty=_certainty(raw.get("certainty")),
            )
        )
    return _dedupe_overlaps(output)


def locate_concept_anchors(
    raw_concepts: list[dict[str, Any]], source: str
) -> list[Concept]:
    output: list[Concept] = []
    for raw in raw_concepts:
        anchor = raw.get("anchor", "")
        label = raw.get("label", "")
        if not isinstance(anchor, str) or not anchor.strip():
            continue
        if not isinstance(label, str) or not label.strip():
            continue
        start = source.find(anchor)
        if start == -1:
            continue
        output.append(
            Concept(
                id=str(raw.get("id") or f"K{len(output) + 1}"),
                label=label.strip(),
                anchor=anchor,
                anchor_start=start,
                anchor_end=start + len(anchor),
            )
        )
    return output


async def extract_concepts(source: str) -> list[Concept]:
    raw = await call_json(concept_prompt(source), call="a")
    if isinstance(raw, dict):
        raw = raw.get("concepts", [])
    if not isinstance(raw, list):
        return []
    return locate_concept_anchors(raw, source)


async def extract_propositions(source: str, explanation: str) -> list[Proposition]:
    raw = await call_json(proposition_prompt(source, explanation), call="b")
    if isinstance(raw, dict):
        raw = raw.get("propositions", [])
    if not isinstance(raw, list):
        return []
    return locate_spans(raw, explanation)
