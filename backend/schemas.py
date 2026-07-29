from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


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
    focused: bool = False


class NormalizeImageRequest(BaseModel):
    """Request containing an image data URL kept entirely in memory."""

    model_config = ConfigDict(populate_by_name=True)

    image_data_url: str = Field(
        validation_alias=AliasChoices("image_data_url", "image", "data_url")
    )


class NormalizeImageResponse(BaseModel):
    """Editable text extracted from the submitted image."""

    text: str


class TranscribeRequest(BaseModel):
    """Request containing recorded audio kept entirely in memory."""

    model_config = ConfigDict(populate_by_name=True)

    audio_data_url: str = Field(
        validation_alias=AliasChoices("audio_data_url", "audio", "data_url")
    )


class TranscribeResponse(BaseModel):
    """Editable transcript extracted from the submitted audio."""

    text: str


class Coverage(BaseModel):
    covered: list[str] = Field(default_factory=list)
    partial: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    concepts: list[Concept]
    flags: list[Flag]
    follow_up: str
    coverage: Coverage
