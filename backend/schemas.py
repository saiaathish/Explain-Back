from typing import Literal

from pydantic import BaseModel, Field


Certainty = Literal["high", "medium", "low"]
Relation = Literal["entails", "contradicts", "neutral"]
State = Literal["green", "yellow", "red", "grey"]


class Concept(BaseModel):
    id: str
    label: str
    anchor: str
    anchor_start: int = -1
    anchor_end: int = -1


class Proposition(BaseModel):
    id: str
    claim_span: str
    claim_start: int = -1
    claim_end: int = -1
    justification_spans: list[str] = Field(default_factory=list)
    justification_offsets: list[tuple[int, int]] = Field(default_factory=list)
    type: Literal["causal", "descriptive", "comparative"] = "descriptive"
    certainty: Certainty = "medium"


class Verdict(BaseModel):
    prop_id: str
    relation: Relation
    confidence: Certainty
    revision_hint: str


class Flag(BaseModel):
    prop_id: str
    state: State
    start: int
    end: int
    concept_id: str | None = None
    anchor: str | None = None
    hint: str | None = None
    misconception: str | None = None
    refutation: str | None = None
    similarity: float = Field(exclude=True)


class AnalyzeRequest(BaseModel):
    source: str
    explanation: str


class Coverage(BaseModel):
    covered: list[str] = Field(default_factory=list)
    partial: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    concepts: list[Concept]
    flags: list[Flag]
    follow_up: str
    coverage: Coverage
