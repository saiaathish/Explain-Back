from backend.llm import call_json
from backend.prompts import verification_prompt
from backend.schemas import Concept, Proposition, Verdict


def _cap_hint(text: str) -> str:
    words = str(text).strip().split()
    return " ".join(words[:20])


async def verify(
    source: str,
    propositions: list[Proposition],
    concepts: list[Concept],
    alignment: dict[str, tuple[str, float]],
) -> tuple[dict[str, Verdict], str]:
    concepts_by_id = {concept.id: concept for concept in concepts}
    items: list[dict[str, str]] = []
    for proposition in propositions:
        concept_id, _ = alignment.get(proposition.id, ("", 0.0))
        concept = concepts_by_id.get(concept_id)
        items.append(
            {
                "prop_id": proposition.id,
                "claim": proposition.claim_span,
                "source_anchor": concept.anchor if concept else "",
            }
        )

    raw = await call_json(verification_prompt(source, items))
    if not isinstance(raw, dict):
        raw = {}
    verdicts: dict[str, Verdict] = {}
    valid_ids = {item.id for item in propositions}
    for item in raw.get("verdicts", []):
        if not isinstance(item, dict) or item.get("prop_id") not in valid_ids:
            continue
        relation = item.get("relation")
        confidence = item.get("confidence")
        if relation not in {"entails", "contradicts", "neutral"}:
            continue
        if confidence not in {"high", "medium", "low"}:
            continue
        hint = _cap_hint(item.get("revision_hint", ""))
        if not hint:
            hint = "Connect this claim more explicitly to the source."
        verdicts[item["prop_id"]] = Verdict(
            prop_id=item["prop_id"],
            relation=relation,
            confidence=confidence,
            revision_hint=hint,
        )
    follow_up = str(raw.get("follow_up", "")).strip()
    if not follow_up:
        follow_up = "What mechanism from the source would make your weakest claim more precise?"
    return verdicts, follow_up
