import re

from backend.schemas import Proposition, Verdict

SPECIFIC = re.compile(
    r"\b(\d+|one|two|three|four|five|always|never|only|all|none|"
    r"into|out of|inward|outward|increase[sd]?|decrease[sd]?|"
    r"higher|lower|before|after|first|then|greater|less|"
    r"inside|outside|imports?|exports?|passive|active|diffus\w*|"
    r"without|requires?|necessary)\b",
    re.IGNORECASE,
)
HEDGE = re.compile(
    r"\b(usually|often|generally|tends? to|might|may|sometimes|"
    r"probably|kind of|sort of|i think|maybe)\b",
    re.IGNORECASE,
)


def is_specific(text: str) -> bool:
    return bool(SPECIFIC.search(text)) and not bool(HEDGE.search(text))


def resolve(
    proposition: Proposition,
    verdict: Verdict,
    similarity: float,
    high_threshold: float,
    low_threshold: float,
) -> str:
    if HEDGE.search(proposition.claim_span) or verdict.confidence == "low":
        return "grey"
    if (
        verdict.relation == "contradicts"
        and verdict.confidence == "high"
        and is_specific(proposition.claim_span)
        and similarity >= low_threshold
    ):
        return "red"
    if verdict.relation == "contradicts":
        return "grey"
    if similarity < low_threshold:
        return "grey"
    if verdict.relation == "entails":
        if (
            proposition.justification_spans
            and verdict.confidence == "high"
            and similarity >= high_threshold
        ):
            return "green"
        return "yellow"
    if verdict.relation == "neutral" or similarity < high_threshold:
        return "yellow" if proposition.justification_spans else "grey"
    return "grey"
