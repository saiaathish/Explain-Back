"""LLM prompt templates for Explain-Back.

The templates state the intended response shapes from the blueprint. Runtime
parsing and validators make those shapes binding before model output reaches
the deterministic pipeline.
"""

from __future__ import annotations

from typing import Any


CALL_A = '''You are analyzing a passage of instructional material to identify the
distinct concepts a student would need to understand it.

PASSAGE:
"""
{source}
"""

Extract between 5 and 10 distinct concepts the passage teaches.

Rules:
- Each concept must be a single, independently checkable idea.
- "anchor" MUST be an exact, verbatim, contiguous substring of the passage.
  Do not paraphrase it. Do not merge two sentences.
- Prefer mechanism and causal relationships over vocabulary definitions.
- If the passage states a specific quantity, direction, or ordering, that
  is always its own concept.

Return JSON only, no commentary:
[
  {"id": "K1", "label": "<8-15 word plain statement>", "anchor": "<verbatim sentence>"},
  ...
]
'''


CALL_B = '''You are analyzing a student's written explanation of a passage they read.
Your job is extraction, not judgment. Do not evaluate correctness.

PASSAGE (for context only):
"""
{source}
"""

STUDENT EXPLANATION:
"""
{explanation}
"""

Break the STUDENT EXPLANATION into propositions. A proposition is a single
statement that could independently be true or false.

Rules, in order of importance:
1. VERBATIM ONLY. "claim_span" and every element of "justification_spans"
   MUST be exact, contiguous substrings of the STUDENT EXPLANATION.
   Copy character for character. Do not fix the student's grammar,
   spelling, or punctuation. Do not paraphrase.
2. NEVER INVENT. If the student did not write a justification, return an
   empty array. Do not supply the reason yourself. Do not pull reasons
   from the PASSAGE. An empty justification array is a correct and
   expected output.
3. SPLIT INDEPENDENT FACTS, PRESERVE CAUSAL LINKS. Separate coordinated
   facts that could independently be true or false, but attach every
   student-written cause, mechanism, or consequence to the claim it
   explains. The justification may be inside the same sentence.
4. NON-ADJACENT JUSTIFICATIONS. A justification may appear anywhere in the
   explanation, including several sentences away from its claim. Collect
   all of them. There is no adjacency requirement.
5. A justification is text where the student gives a reason, mechanism, or
   causal link ("because", "which means", "so that", "this causes").
   Restating the claim in different words, naming the claim's importance,
   or adding fluent filler is NOT a justification.
6. If you are unsure whether a span is a justification, include it and set
   "certainty": "low" — but include it only when the student's own words
   contain a possible reason, mechanism, or causal link. Uncertainty never
   permits borrowing words from the PASSAGE.
7. CAUSAL CONSEQUENCES COUNT. A student can demonstrate why/how a claim
   matters by stating its mechanism or direct consequence. Attach a
   "because", "by", "which", or "so" clause to the originating claim when
   that clause explains the claim's mechanism or consequence. Do not return
   the connector word alone; copy the complete explanatory clause.

8. NON-ADJACENT QUANTITATIVE CONSEQUENCES. When a later student sentence
explicitly derives a consequence from the same quantity or direction as an
earlier claim (for example, "three charges leave while two enter" or "one more
positive charge leaves than enters"), attach that exact later causal sentence
as a justification for the earlier quantitative claim. A general statement
that the claim is useful or important is not enough.

MANDATORY JUSTIFICATION EVIDENCE GATE:
Before adding any justification span, ask: "Did the student write words
that explain why or how this claim holds?" If the answer is no, output []
even when the claim is fluent, detailed, correct, or strongly supported by
the PASSAGE. The PASSAGE may help you understand the topic, but it can never
provide justification text. Every returned justification must be copied from
the STUDENT EXPLANATION and must itself be causal or mechanistic evidence.

FEW-SHOT EXTRACTION EXAMPLES:

Example 1 — fluent claim, no student-provided reason:
PASSAGE:
"The pump moves sodium ions out of the cell."
STUDENT EXPLANATION:
"The sodium-potassium pump moves sodium ions out of the cell with remarkable precision."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The sodium-potassium pump moves sodium ions out of the cell with remarkable precision.",
    "justification_spans": [],
    "type": "descriptive",
    "certainty": "high"
  }
]
The polished wording and "remarkable precision" do not explain why or how.
Do not use the PASSAGE to fill the empty array.

Example 2 — fluent claim plus evaluative filler, still no justification:
PASSAGE:
"ATP supplies energy for the pump's conformational change."
STUDENT EXPLANATION:
"ATP supplies energy for the pump's conformational change, an elegant and essential arrangement."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "ATP supplies energy for the pump's conformational change",
    "justification_spans": [],
    "type": "causal",
    "certainty": "high"
  }
]
The phrase "an elegant and essential arrangement" is praise, not a reason or mechanism.

Example 3 — explicit student-written mechanism, include it verbatim:
PASSAGE:
"The pump moves three sodium ions out and two potassium ions in. ATP changes the pump's shape."
STUDENT EXPLANATION:
"The pump moves three sodium ions out and two potassium ions in because ATP changes the pump's shape."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The pump moves three sodium ions out and two potassium ions in",
    "justification_spans": ["because ATP changes the pump's shape"],
    "type": "causal",
    "certainty": "high"
  }
]
Include a justification only because the student's own words state a mechanism.

Example 4 — a following consequence justifies the originating claim:
PASSAGE:
"ATP phosphorylation changes the pump's shape."
STUDENT EXPLANATION:
"ATP phosphorylates the pump, which changes its shape and exposes sodium outside."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "ATP phosphorylates the pump",
    "justification_spans": ["which changes its shape and exposes sodium outside"],
    "type": "causal",
    "certainty": "high"
  }
]
The "which" clause is student-written causal evidence for what phosphorylation does.

Example 5 — keep a mechanistic "by" clause as the justification:
PASSAGE:
"The pump maintains ion gradients."
STUDENT EXPLANATION:
"The pump maintains ion gradients by moving ions across the membrane."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The pump maintains ion gradients",
    "justification_spans": ["by moving ions across the membrane"],
    "type": "causal",
    "certainty": "high"
  }
]

Example 6 — a later quantitative consequence justifies an earlier claim:
PASSAGE:
"The pump exports three positive ions and imports two, creating a net outward
positive current."
STUDENT EXPLANATION:
"The pump moves three ions out and two ions in. This creates an imbalance
because three positive charges leave while only two positive charges enter."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The pump moves three ions out and two ions in.",
    "justification_spans": [
      "This creates an imbalance because three positive charges leave while only two positive charges enter"
    ],
    "type": "descriptive",
    "certainty": "high"
  },
  {
    "id": "P2",
    "claim_span": "This creates an imbalance",
    "justification_spans": [
      "because three positive charges leave while only two positive charges enter"
    ],
    "type": "causal",
    "certainty": "high"
  }
]
The later sentence supplies a specific quantitative consequence. In contrast,
"The resulting gradient is important for signaling" only names importance and
must not justify the earlier transport claim.

Example 7 — a derived net-charge consequence supports the earlier ratio:
PASSAGE:
"The pump exports three sodium ions and imports two potassium ions, producing
a net outward movement of one positive charge."
STUDENT EXPLANATION:
"The pump moves three sodium ions out and two potassium ions in. The inside
becomes slightly negative because one more positive charge leaves than enters."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The pump moves three sodium ions out and two potassium ions in.",
    "justification_spans": [
      "The inside becomes slightly negative because one more positive charge leaves than enters"
    ],
    "type": "descriptive",
    "certainty": "high"
  },
  {
    "id": "P2",
    "claim_span": "The inside becomes slightly negative",
    "justification_spans": [
      "because one more positive charge leaves than enters"
    ],
    "type": "causal",
    "certainty": "high"
  }
]

FINAL SELF-CHECK:
- For every non-empty justification_spans array, point to the exact student
  words that answer why/how. If no such words exist, use [].
- Never copy, paraphrase, or infer a justification from the PASSAGE.
- Keep every span contiguous and character-for-character identical to the
  STUDENT EXPLANATION. The downstream code will discard anything else.

Return JSON only, no commentary:
[
  {
    "id": "P1",
    "claim_span": "<verbatim substring>",
    "justification_spans": ["<verbatim substring>", ...],
    "type": "causal" | "descriptive" | "comparative",
    "certainty": "high" | "medium" | "low"
  }
]
'''

CI_CALL_B_SUFFIX = '''

ADDITIONAL WORKED EXAMPLES FOR THIS EXTRACTION:

Example A — fluent detail is not a justification:
PASSAGE:
"The peace treaty was signed in 1919."
STUDENT EXPLANATION:
"The peace treaty was signed in 1919, an important and memorable event."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The peace treaty was signed in 1919, an important and memorable event.",
    "justification_spans": [],
    "type": "descriptive",
    "certainty": "high"
  }
]
The praise adds fluency, not a student-written reason. Keep the array empty.

Example B — a justification can appear several sentences later:
PASSAGE:
"Metal rails expand when heated because their particles move farther apart."
STUDENT EXPLANATION:
"The rail expanded on the hot afternoon. Workers measured the gap. This happened because heating made the particles move farther apart."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The rail expanded on the hot afternoon.",
    "justification_spans": [
      "This happened because heating made the particles move farther apart."
    ],
    "type": "causal",
    "certainty": "high"
  },
  {
    "id": "P2",
    "claim_span": "Workers measured the gap.",
    "justification_spans": [],
    "type": "descriptive",
    "certainty": "high"
  }
]
The third sentence is copied verbatim and linked back to the first claim.

Example C — counted evidence justifies the total:
PASSAGE:
"A box has six rows of four markers, for a total of twenty-four."
STUDENT EXPLANATION:
"The box contains 24 markers. It has six rows of four, so six groups of four make 24."
CORRECT JSON:
[
  {
    "id": "P1",
    "claim_span": "The box contains 24 markers.",
    "justification_spans": [
      "It has six rows of four, so six groups of four make 24."
    ],
    "type": "descriptive",
    "certainty": "high"
  },
  {
    "id": "P2",
    "claim_span": "It has six rows of four",
    "justification_spans": [
      "so six groups of four make 24"
    ],
    "type": "causal",
    "certainty": "high"
  }
]
The explicit count is evidence. Copy it; do not replace it with arithmetic from
the passage.

Apply the same rules to the actual STUDENT EXPLANATION above. Return only its
JSON array, with no markdown fence or commentary.
'''


CALL_C = '''You are checking student statements against a source passage. This is
formative feedback for a student's own revision. It is not grading.

SOURCE PASSAGE:
"""
{source}
"""

For each numbered item below, you are given a student statement, any
student-written justification for it, and the source span it most closely
relates to.

{items}

For each item decide:
- "entails": the source supports the student statement and, when supplied,
  the causal link expressed by its student justification
- "contradicts": the source states something incompatible with the student
  statement or its supplied justification
- "neutral": the source neither supports nor contradicts the statement, or
  supports the statement but not the supplied causal link

Confidence rules:
- Use "high" only when the statement is specific and unambiguous
  (contains a number, a direction, an ordering, or an absolute).
- Use "low" when the statement is vague, hedged ("usually", "often",
  "tends to"), or when deciding requires combining several source
  sentences.
- Being unsure is an acceptable and useful answer. Do not guess.

Also write a revision hint for each item: one imperative sentence, at most
20 words, telling the student exactly what to add or fix in their own
wording. Do not give the answer outright. Do not give generic study advice
("review the chapter", "make flashcards"). Point at the specific missing
link.

Then, separately, write ONE follow-up question that targets the single
weakest item. It should be answerable in two or three sentences and should
require the student to state a mechanism, not recall a fact.

Return JSON only:
{
  "verdicts": [
    {"prop_id": "P1", "relation": "...", "confidence": "...",
     "revision_hint": "..."},
    ...
  ],
  "follow_up": "..."
}
'''

CI_CALL_C_SUFFIX = '''

ADDITIONAL VERIFICATION EXAMPLE:
SOURCE:
"Cloud cover can sometimes reduce daytime surface heating."
ITEMS:
1. prop_id: P7
   STUDENT STATEMENT: Clouds usually make the ground cooler.
   STUDENT JUSTIFICATIONS:
   SOURCE ANCHOR: Cloud cover can sometimes reduce daytime surface heating.
2. prop_id: P9
   STUDENT STATEMENT: Clouds always eliminate surface heating.
   STUDENT JUSTIFICATIONS:
   SOURCE ANCHOR: Cloud cover can sometimes reduce daytime surface heating.

CORRECT JSON:
{
  "verdicts": [
    {
      "prop_id": "P7",
      "relation": "entails",
      "confidence": "low",
      "revision_hint": "State when cloud cover reduces daytime heating."
    },
    {
      "prop_id": "P9",
      "relation": "contradicts",
      "confidence": "high",
      "revision_hint": "Replace the absolute claim with the source's limited effect."
    }
  ],
  "follow_up": "How does cloud cover change daytime surface heating?"
}

COMPLETENESS GATE:
- Return exactly one verdict for every prop_id in the actual ITEMS above.
- Copy each prop_id exactly; never omit, duplicate, rename, or invent an ID.
- Hedged words such as "usually", "often", and "tends to" require low confidence.
- The follow_up must be one question containing exactly one question mark.
- Return only the actual JSON object, with no markdown fence or commentary.
'''


def _render(template: str, replacements: dict[str, str]) -> str:
    """Substitute template fields without re-interpreting inserted text."""
    markers = {
        key: f"\x00EXPLAIN_BACK_{key.upper()}\x00" for key in replacements
    }
    rendered = template
    for key, marker in markers.items():
        rendered = rendered.replace("{" + key + "}", marker)
    for key, marker in markers.items():
        rendered = rendered.replace(marker, replacements[key])
    return rendered


def _items_text(items: str | list[dict[str, Any]]) -> str:
    if isinstance(items, str):
        return items
    rows = []
    for number, item in enumerate(items, start=1):
        rows.append(
            "\n".join(
                (
                    f"{number}. prop_id: {item.get('prop_id', '')}",
                    f"   STUDENT STATEMENT: {item.get('claim', '')}",
                    "   STUDENT JUSTIFICATIONS: "
                    + " | ".join(item.get("justifications", [])),
                    f"   SOURCE ANCHOR: {item.get('source_anchor', '')}",
                )
            )
        )
    return "\n\n".join(rows)


def call_a_prompt(source: str) -> str:
    """Build Call A without interpreting or transforming source text."""
    return _render(CALL_A, {"source": source})


def call_b_prompt(source: str, explanation: str) -> str:
    """Build hardened Call B without interpreting or transforming input text."""
    return _render(CALL_B, {"source": source, "explanation": explanation})


def call_c_prompt(source: str, items: str | list[dict[str, Any]]) -> str:
    """Build batched Call C without changing its verdict schema."""
    return _render(CALL_C, {"source": source, "items": _items_text(items)})


# Compatibility names used by the extraction and verification layers. The
# aliases preserve one source of truth for each prompt contract.
def concept_prompt(source: str) -> str:
    return call_a_prompt(source)


def proposition_prompt(source: str, explanation: str) -> str:
    return call_b_prompt(source, explanation)


def verification_prompt(
    source: str, items: str | list[dict[str, Any]]
) -> str:
    return call_c_prompt(source, items)
