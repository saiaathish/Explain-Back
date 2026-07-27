import re
from typing import Any

from backend.llm import call_json
from backend.prompts import concept_prompt, proposition_prompt
from backend.schemas import Concept, Proposition


def _type(value: Any) -> str:
    return value if value in {"causal", "descriptive", "comparative"} else "descriptive"


def _certainty(value: Any) -> str:
    return value if value in {"high", "medium", "low"} else "medium"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _flatten(haystack: str) -> tuple[str, list[int]]:
    """Collapse whitespace in haystack to single spaces, keeping a map from
    each flattened character back to its index in the original string.

    A leading space from a leading-whitespace run is dropped (we ``strip`` the
    flattened form), and interior whitespace runs become one space whose
    original index is the index of the first whitespace char in the run.
    """
    flat: list[str] = []
    idx_map: list[int] = []
    prev_space = False
    leading = True
    for i, ch in enumerate(haystack):
        if ch.isspace():
            prev_space = True
            continue
        if prev_space and flat:
            flat.append(" ")
            idx_map.append(i - 1)
        flat.append(ch)
        idx_map.append(i)
        prev_space = False
        leading = False
    return "".join(flat), idx_map


def find_normalized(haystack: str, needle: str, start: int = 0) -> tuple[int, int]:
    """Locate ``needle`` in ``haystack`` ignoring whitespace differences.

    Whitespace runs (newlines, tabs, double spaces) are treated as equivalent
    to a single space on both sides. Returns ``(start, end)`` offsets into the
    ORIGINAL ``haystack`` (so ``haystack[start:end]`` is the matched span,
    including any original whitespace), or ``(-1, -1)`` if not found.

    ``start`` is a cursor into the ORIGINAL haystack; it is mapped to the
    flattened index before searching.
    """
    n = _norm(needle)
    if not n:
        return -1, -1
    flat, idx_map = _flatten(haystack)
    if not idx_map:
        return -1, -1
    # Map an original-haystack cursor to a flattened cursor. If the cursor
    # lands on whitespace, advance to the next non-space char in the flat form.
    flat_start = 0
    if start > 0:
        # Count flat characters whose original index is < start.
        for fi, oi in enumerate(idx_map):
            if oi >= start:
                flat_start = fi
                break
        else:
            flat_start = len(idx_map)
    pos = flat.find(n, flat_start)
    if pos == -1:
        return -1, -1
    end = pos + len(n) - 1
    return idx_map[pos], idx_map[end] + 1


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
        index, end = find_normalized(explanation, claim, cursor)
        if index == -1:
            index, end = find_normalized(explanation, claim)
        if index == -1:
            continue
        # Store the raw slice of the original explanation so offsets always
        # re-slice to the stored text (whitespace tolerance is locate-only).
        claim_text = explanation[index:end]
        cursor = end

        justifications: list[str] = []
        offsets: list[tuple[int, int]] = []
        for justification in raw.get("justification_spans", []):
            if not isinstance(justification, str) or not justification.strip():
                continue
            j_start, j_end = find_normalized(explanation, justification)
            if j_start == -1:
                continue
            justifications.append(explanation[j_start:j_end])
            offsets.append((j_start, j_end))
        output.append(
            Proposition(
                id=str(raw.get("id") or f"P{len(output) + 1}"),
                claim_span=claim_text,
                claim_start=index,
                claim_end=end,
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
        start, end = find_normalized(source, anchor)
        if start == -1:
            continue
        # Store the raw slice of the original source; offsets always re-slice
        # to this text (whitespace tolerance is locate-only).
        output.append(
            Concept(
                id=str(raw.get("id") or f"K{len(output) + 1}"),
                label=label.strip(),
                anchor=source[start:end],
                anchor_start=start,
                anchor_end=end,
            )
        )
    return output


async def extract_concepts(source: str) -> list[Concept]:
    raw = await call_json(concept_prompt(source))
    if isinstance(raw, dict):
        raw = raw.get("concepts", [])
    if not isinstance(raw, list):
        return []
    return locate_concept_anchors(raw, source)


async def extract_propositions(source: str, explanation: str) -> list[Proposition]:
    raw = await call_json(proposition_prompt(source, explanation))
    if isinstance(raw, dict):
        raw = raw.get("propositions", [])
    if not isinstance(raw, list):
        return []
    return locate_spans(raw, explanation)
