# Explain-Back — Complete Build Blueprint

**Deadline:** July 30, 2026, 11:59 PM (no extensions)
**Build window:** July 25–30 (5 days)
**Submission:** GitHub repo + 2-minute demo video

---

## 0. One-paragraph statement of the thing

Every AI study tool explains concepts *to* the student. Explain-Back inverts it: the student explains, and the system diagnoses. Paste 2–3 paragraphs of source material, type an explanation in your own words, and get back a four-state color map over your own writing — green (source-consistent and supported), yellow (stated but never justified), red (contradicts the source), grey (system isn't sure). Every non-green flag carries a source anchor (the exact sentence from the source that triggered it) and a concrete revision hint. Ends with one follow-up question targeting only the gaps. Formative only. No scores. No storage.

Grounding: self-explanation is an established learning activity. The product's
specific contribution is source-grounded formative analysis of a learner's
free-text explanation.

---

## 1. Architecture

```
┌──────────────┐
│   Browser    │  React SPA, single page, no router
│  (all state) │
└──────┬───────┘
       │ POST /api/analyze  { source, explanation }
       ▼
┌──────────────────────────────────────────────────┐
│  FastAPI backend  (single process, no DB)        │
│                                                  │
│  1. concepts()     LLM call A  [cached by hash]  │
│  2. propositions() LLM call B                    │
│  3. align()        local embeddings, cosine      │
│  4. verify()       LLM call C  [batched]         │
│  5. resolve()      pure Python, no model         │
│  6. followup()     folded into call C            │
└──────────────────────────────────────────────────┘
```

Two LLM round trips per analysis after the source is cached (B, then C). Call A only fires the first time a given source is seen. Target end-to-end: under 8 seconds warm.

**Why no vector store:** you are comparing ~12 propositions against ~8 concepts. That is a 12×8 matrix. `numpy` does it in microseconds. A vector DB here is resume-driven development and a technical judge will read it as over-engineering.

**Why no database:** privacy is a scoring line. "We don't store student text" is only true if you don't build storage. All state lives in React.

---

## 2. Repo layout

```
explain-back/
├── README.md
├── .env.example
├── requirements.txt
├── backend/
│   ├── main.py                 # FastAPI app, one endpoint
│   ├── llm.py                  # LLM client wrapper + JSON repair
│   ├── prompts.py              # all three prompts, verbatim
│   ├── extract.py              # calls A and B, span validation
│   ├── align.py                # embeddings + cosine + thresholds
│   ├── verify.py               # call C, NLI + hints + follow-up
│   ├── resolve.py              # state machine, specificity gate
│   ├── misconceptions.py       # hand-built dictionary
│   ├── schemas.py              # pydantic models
│   └── config.py               # thresholds, model names
├── calibrate/
│   ├── pairs.json              # 20 hand-labeled claim/concept pairs
│   └── run.py                  # prints distribution, suggests cuts
├── samples/
│   ├── source_sodium_pump.txt
│   ├── explanations/           # 10 deliberately flawed samples
│   └── golden.json             # expected states, your regression test
└── frontend/
    ├── index.html
    ├── src/
    │   ├── App.jsx
    │   ├── Overlay.jsx         # the color rendering, the hard part
    │   ├── Legend.jsx
    │   ├── ConceptList.jsx
    │   ├── FollowUp.jsx
    │   └── api.js
    └── package.json
```

---

## 3. Data model

```python
# schemas.py
from pydantic import BaseModel
from typing import Literal, Optional

class Concept(BaseModel):
    id: str                    # "K1"
    label: str                 # "Pump moves 3 Na+ out, 2 K+ in"
    anchor: str                # verbatim sentence from source
    anchor_start: int          # char offset into source
    anchor_end: int

class Proposition(BaseModel):
    id: str                    # "P1"
    claim_span: str            # verbatim substring of explanation
    claim_start: int = -1      # filled by span validator
    claim_end: int = -1
    justification_spans: list[str] = []
    justification_offsets: list[tuple[int, int]] = []
    type: Literal["causal", "descriptive", "comparative"]
    certainty: Literal["high", "medium", "low"]

class Verdict(BaseModel):
    prop_id: str
    relation: Literal["entails", "contradicts", "neutral"]
    confidence: Literal["high", "medium", "low"]
    revision_hint: str          # <= 20 words, imperative

class Flag(BaseModel):
    prop_id: str
    state: Literal["green", "yellow", "red", "grey"]
    start: int
    end: int
    concept_id: Optional[str]
    anchor: Optional[str]       # source sentence, verbatim
    hint: Optional[str]
    misconception: Optional[str]      # name, red only
    refutation: Optional[str]         # one sentence, red only
    similarity: float

class AnalyzeResponse(BaseModel):
    concepts: list[Concept]
    flags: list[Flag]
    follow_up: str
    coverage: dict              # {"covered": [...], "partial": [...], "missing": [...]}
```

---

## 4. The prompts (verbatim, use these)

### Call A — source to concepts

```
You are analyzing a passage of instructional material to identify the
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
```

### Call B — explanation to propositions

This is the make-or-break call.

```
You are analyzing a student's written explanation of a passage they read.
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
3. SPLIT AGGRESSIVELY. If two statements could be true or false
   independently, they are two propositions, even inside one sentence.
4. NON-ADJACENT JUSTIFICATIONS. A justification may appear anywhere in the
   explanation, including several sentences away from its claim. Collect
   all of them. There is no adjacency requirement.
5. A justification is text where the student gives a reason, mechanism, or
   causal link ("because", "which means", "so that", "this causes").
   Restating the claim in different words is NOT a justification.
6. If you are unsure whether a span is a justification, include it and set
   "certainty": "low".

Return JSON only, no commentary:
[
  {
    "id": "P1",
    "claim_span": "<verbatim substring>",
    "justification_spans": ["<verbatim substring>", ...],
    "type": "causal" | "descriptive" | "comparative",
    "certainty": "high" | "medium" | "low"
  },
  ...
]
```

**Rule 2 is the whole ballgame.** The default LLM failure here is helpfulness — it sees a bare claim and fills in the reason from the source, which makes every yellow turn green and destroys the product. State it three ways in one rule and then enforce it in code anyway.

### Call C — verify, batched

```
You are checking student statements against a source passage. This is
formative feedback for a student's own revision. It is not grading.

SOURCE PASSAGE:
"""
{source}
"""

For each numbered item below, you are given a student statement and the
sentence from the source it most closely relates to.

{items}

For each item decide:
- "entails": the source supports the student statement
- "contradicts": the source states something incompatible with it
- "neutral": the source neither supports nor contradicts it

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
```

---

## 5. Span validation — build this first

Forty lines. It is the spine of the project. It kills hallucinated justifications and it produces the character offsets the UI needs to render colors. Same code, both jobs.

```python
# extract.py
def locate_spans(props: list[dict], explanation: str) -> list[Proposition]:
    """Discard any span that is not a verbatim substring. Attach offsets."""
    out = []
    cursor = 0                       # forward-only, prevents mis-matching
                                     # repeated phrases to the wrong instance
    for p in props:
        claim = p.get("claim_span", "")
        idx = explanation.find(claim, cursor)
        if idx == -1:
            idx = explanation.find(claim)     # retry from start
        if idx == -1 or not claim.strip():
            continue                          # hallucinated claim, drop it
        cursor = idx + len(claim)

        js, jo = [], []
        for j in p.get("justification_spans", []):
            k = explanation.find(j)
            if k != -1 and j.strip():
                js.append(j)
                jo.append((k, k + len(j)))
            # silently dropped otherwise — this is the anti-hallucination gate

        out.append(Proposition(
            id=p.get("id", f"P{len(out)+1}"),
            claim_span=claim,
            claim_start=idx,
            claim_end=idx + len(claim),
            justification_spans=js,
            justification_offsets=jo,
            type=p.get("type", "descriptive"),
            certainty=p.get("certainty", "medium"),
        ))
    return _dedupe_overlaps(out)
```

`_dedupe_overlaps` — if two propositions overlap in character range, keep the longer one. Overlapping spans break the overlay renderer.

Do the same for concept anchors against the source. Any concept whose anchor isn't verbatim gets dropped, because a fabricated anchor is worse than a missing one — it's the exact failure the source-anchor feature exists to prevent.

---

## 6. Alignment

```python
# align.py
from sentence_transformers import SentenceTransformer
import numpy as np

_model = SentenceTransformer("BAAI/bge-small-en-v1.5")   # 33M, CPU-fast

def embed(texts: list[str]) -> np.ndarray:
    v = _model.encode(texts, normalize_embeddings=True)
    return v

def align(props, concepts):
    if not props or not concepts:
        return {}
    P = embed([p.claim_span for p in props])
    K = embed([c.label + ". " + c.anchor for c in concepts])
    S = P @ K.T                                  # normalized, so dot = cosine
    best = S.argmax(axis=1)
    return {
        props[i].id: (concepts[best[i]].id, float(S[i, best[i]]))
        for i in range(len(props))
    }
```

Embedding the concept as `label + anchor` rather than label alone gives the encoder more lexical surface to match against, which matters because student phrasing rarely matches a terse label.

### Thresholds — calibrate, do not copy

**Do not use 0.80 / 0.60.** Cosine values are not comparable across encoders. `bge-small` compresses most pairs into roughly 0.6–0.95, so 0.60 is essentially "unrelated" on this model, not "partial." Any number you take from a paper trained on a different encoder is noise.

```python
# calibrate/run.py
import json, numpy as np
from backend.align import embed

pairs = json.load(open("calibrate/pairs.json"))
# each: {"claim": "...", "concept": "...", "label": "clear|partial|off"}

sims = {"clear": [], "partial": [], "off": []}
for p in pairs:
    a, b = embed([p["claim"], p["concept"]])
    sims[p["label"]].append(float(a @ b))

for k, v in sims.items():
    v = sorted(v)
    print(f"{k:8s} n={len(v):2d} min={v[0]:.3f} med={v[len(v)//2]:.3f} max={v[-1]:.3f}")

hi = np.percentile(sims["clear"], 10)          # 10th pct of clear matches
lo = np.percentile(sims["partial"], 25)
print(f"\nSuggested: T_HIGH={hi:.3f}  T_LOW={lo:.3f}")
```

Write 20 pairs. Seven clear, seven partial, six off. Run it. Put the two numbers in `config.py`. Thirty minutes of work.

When a judge asks where the thresholds came from: *"I hand-labeled a dev set and calibrated against the distribution."* That beats a citation, because it's what you actually did and it's what a competent person would do.

---

## 7. State resolution

Pure Python. No model call. This is the part you can fully defend because it's deterministic.

```python
# resolve.py
import re

SPECIFIC = re.compile(
    r"\b(\d+|one|two|three|four|five|always|never|only|all|none|"
    r"in|out|into|out of|inward|outward|increase[sd]?|decrease[sd]?|"
    r"higher|lower|before|after|first|then|greater|less)\b", re.I)

HEDGE = re.compile(
    r"\b(usually|often|generally|tends? to|might|may|sometimes|"
    r"probably|kind of|sort of|I think|maybe)\b", re.I)

def is_specific(text: str) -> bool:
    return bool(SPECIFIC.search(text)) and not HEDGE.search(text)

def resolve(prop, verdict, sim, T_HIGH, T_LOW) -> str:
    # RED: contradiction, high confidence, AND lexically specific.
    # The specificity gate is the false-positive brake.
    if (verdict.relation == "contradicts"
            and verdict.confidence == "high"
            and is_specific(prop.claim_span)
            and sim >= T_LOW):
        return "red"

    # A contradiction we do not fully trust is NOT a green light and
    # NOT an accusation. It is a "check this yourself".
    if verdict.relation == "contradicts":
        return "grey"

    if sim < T_LOW:
        return "grey"          # student said something off-topic

    if verdict.relation == "entails" and sim >= T_HIGH:
        return "green" if prop.justification_spans else "yellow"

    if verdict.relation == "neutral" or sim < T_HIGH:
        return "yellow" if prop.justification_spans else "grey"

    return "grey"
```

**The claim you make on camera:** at realistic misconception prevalence, a strong reasoning model detecting hidden misconceptions produces false alarms at roughly eight to one against true positives. A confident-by-default detector is therefore wrong far more often than it's right. So the system is built to shut up when it isn't sure. That is what grey is.

That sentence is the most defensible thing in the whole pitch. No other team in a 685-person field will have it.

---

## 8. Misconception dictionary

Hand-built. One topic. Ten entries maximum. Ten minutes of work and it upgrades red from "this is wrong" to "this is *the* mass–weight conflation, and here is why it persists."

```python
# misconceptions.py
MISCONCEPTIONS = [
    {
        "name": "Reversed pump stoichiometry",
        "patterns": [r"3\s*(K|potassium)", r"2\s*(Na|sodium)",
                     r"potassium\s+out", r"sodium\s+in(?!to the cell)"],
        "refutation": "The pump exports 3 Na+ and imports 2 K+. The "
                      "direction is what makes the cell interior negative; "
                      "reversing it inverts the resting potential.",
    },
    {
        "name": "Passive transport conflation",
        "patterns": [r"diffus", r"down the gradient", r"passive"],
        "refutation": "This pump moves ions AGAINST their gradients, which "
                      "is why it consumes ATP. Diffusion needs no energy "
                      "and cannot build a gradient.",
    },
    {
        "name": "ATP as generic fuel",
        "patterns": [r"ATP (gives|provides) energy", r"uses energy"],
        "refutation": "ATP does not just supply energy in the abstract. "
                      "Phosphorylation of the pump changes its shape, and "
                      "that shape change is what moves the ions.",
    },
    # ... 5-7 more, sourced from the AAAS / BSCS item bank
]

def match(claim: str):
    import re
    for m in MISCONCEPTIONS:
        if any(re.search(p, claim, re.I) for p in m["patterns"]):
            return m["name"], m["refutation"]
    return None, None
```

Only runs on red flags. If nothing matches, red still renders — it just shows the generic revision hint instead of a named misconception.

Source the entries from the AAAS Project 2061 / BSCS item bank (free, web-accessible, items are explicitly built around documented misconceptions). Do not try to build a general misconception system. One topic, done properly, demos better than five topics done shallowly.

---

## 9. Backend endpoint

```python
# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import hashlib

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

_concept_cache: dict[str, list] = {}    # in-memory only, dies with process

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    src, exp = req.source.strip(), req.explanation.strip()
    if len(src) < 100:
        raise HTTPException(400, "Source too short. Paste 2-3 paragraphs.")
    if len(exp) < 40:
        raise HTTPException(400, "Explanation too short.")
    if len(src) > 6000 or len(exp) > 4000:
        raise HTTPException(400, "Too long. Keep it to a few paragraphs.")

    key = hashlib.sha256(src.encode()).hexdigest()
    if key not in _concept_cache:
        _concept_cache[key] = await extract_concepts(src)
    concepts = _concept_cache[key]

    props = await extract_propositions(src, exp)          # call B
    if not props:
        raise HTTPException(422, "Could not parse that explanation. "
                                 "Try writing in full sentences.")

    alignment = align(props, concepts)
    verdicts, follow_up = await verify(src, props, concepts, alignment)  # call C

    flags = []
    for p in props:
        cid, sim = alignment.get(p.id, (None, 0.0))
        v = verdicts.get(p.id)
        state = resolve(p, v, sim, T_HIGH, T_LOW) if v else "grey"
        name, refut = match(p.claim_span) if state == "red" else (None, None)
        c = next((c for c in concepts if c.id == cid), None)
        flags.append(Flag(
            prop_id=p.id, state=state,
            start=p.claim_start, end=p.claim_end,
            concept_id=cid,
            anchor=c.anchor if c and state != "green" else None,
            hint=v.revision_hint if v and state != "green" else None,
            misconception=name, refutation=refut, similarity=sim,
        ))

    return AnalyzeResponse(
        concepts=concepts, flags=flags, follow_up=follow_up,
        coverage=compute_coverage(concepts, flags),
    )
```

`compute_coverage` buckets each concept into covered / partial / missing based on the best flag pointing at it. The missing bucket is quietly one of your best features — it surfaces what the student never mentioned at all, which no correctness-checker can do.

### LLM wrapper hardening

```python
# llm.py
import json, re, asyncio

async def call_json(prompt: str, retries: int = 2):
    for attempt in range(retries + 1):
        raw = await _client_call(prompt)
        txt = re.sub(r"^```(?:json)?|```$", "", raw.strip(),
                     flags=re.M).strip()
        try:
            return json.loads(txt)
        except json.JSONDecodeError:
            m = re.search(r"[\[{].*[\]}]", txt, re.S)     # salvage
            if m:
                try:
                    return json.loads(m.group(0))
                except json.JSONDecodeError:
                    pass
            if attempt == retries:
                raise
            await asyncio.sleep(0.4 * (attempt + 1))
```

Never let a stray backtick take down your demo at 11pm on the 29th.

---

## 10. Frontend

### The overlay renderer — the only genuinely tricky UI

You have plain text plus a list of `[start, end, state]` ranges. You need spans. The trap is overlapping and unsorted ranges.

```jsx
// Overlay.jsx
export function Overlay({ text, flags, onHover }) {
  const sorted = [...flags].sort((a, b) => a.start - b.start);
  const parts = [];
  let pos = 0;

  for (const f of sorted) {
    if (f.start < pos) continue;                 // overlap, skip
    if (f.start > pos) {
      parts.push(<span key={`t${pos}`}>{text.slice(pos, f.start)}</span>);
    }
    parts.push(
      <mark
        key={f.prop_id}
        className={`hl hl-${f.state}`}
        onMouseEnter={() => onHover(f)}
        onFocus={() => onHover(f)}
        tabIndex={0}
      >
        {text.slice(f.start, f.end)}
      </mark>
    );
    pos = f.end;
  }
  if (pos < text.length) parts.push(<span key="tail">{text.slice(pos)}</span>);
  return <div className="explanation-body">{parts}</div>;
}
```

### Color tokens

```css
.hl-green  { background:#d8f3dc; border-bottom:2px solid #2d6a4f; }
.hl-yellow { background:#fff3bf; border-bottom:2px solid #b08900; }
.hl-red    { background:#ffd6d6; border-bottom:2px solid #c1121f; }
.hl-grey   { background:#e9ecef; border-bottom:2px dashed #6c757d; }
```

Grey gets a **dashed** underline. Colorblind judges, muted audio, small phone screen — the dash carries "uncertain" without relying on hue.

### Three labeled regions

```
┌────────────────────────────────────────────────────────┐
│  WHAT THIS SECTION TEACHES                             │
│  8 concept chips: ✓ covered  ◐ partial  ○ not mentioned│
├────────────────────────────────────────────────────────┤
│  WHERE YOU ARE NOW                                     │
│  [color overlay over the student's own text]           │
│  [legend, always visible]                              │
│  ── on hover ──────────────────────────────────────┐   │
│  │ Source says: "<verbatim anchor sentence>"       │   │
│  │ Misconception: Reversed pump stoichiometry      │   │
│  │ Why: <one-sentence refutation>                  │   │
│  │ Try: <revision hint>                            │   │
│  └─────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────┤
│  HOW TO MOVE FORWARD                                   │
│  <one follow-up question>                              │
└────────────────────────────────────────────────────────┘
```

Those three headers are the three formative-assessment questions — where you're going, where you are, how to move forward. Zero build cost, and it converts the interface from "a tool" into "an instrument built on a named pedagogical framework." Say the framework name once in the video.

Footer, always visible: **Formative guidance only. Not a grade. Nothing you type is stored.**

### What NOT to build

- No login, no accounts, no history
- No concept graph visualization (D3/react-flow eats a full day and communicates nothing the chip list doesn't)
- No reflection text box (dead air in a 2-minute video, nobody types in it)
- No teacher dashboard
- No dark mode
- No multi-source support
- No voice input

If on Day 3 you catch yourself thinking "the graph view would look so good" — reread this list.

---

## 11. Five-day schedule

### Day 1 — Friday July 25 (today) — THE DAY THAT DECIDES IT
Milestone: call B returns clean, verbatim-validated JSON on your ugliest sample.

- [ ] Repo, venv, FastAPI hello-world, `.env`
- [ ] Write `samples/source_sodium_pump.txt` (3 paragraphs, real textbook density)
- [ ] Write **10 deliberately flawed explanations**. This is not optional. Vary the failure: one fluent-but-unjustified, one with reversed stoichiometry, one that conflates active/passive, one hedged throughout, one off-topic tangent, one genuinely correct (regression control), four mixed.
- [ ] Call A + anchor verbatim validation
- [ ] Call B + `locate_spans` + `_dedupe_overlaps`
- [ ] Run all 10 samples. Eyeball every extraction.
- [ ] `calibrate/pairs.json` (20 pairs), run `calibrate/run.py`, lock T_HIGH/T_LOW

**Go/no-go, tonight:** if call B is inventing justifications on your messiest sample after prompt iteration, everything downstream is decoration. Tighten rule 2, add two few-shot examples showing an empty `justification_spans` array as the correct answer, and test again before you sleep.

### Day 2 — Saturday
Milestone: end-to-end, colors on screen, ugly but working.

- [ ] Call C, batched
- [ ] `resolve()` + specificity gate
- [ ] Wire `/api/analyze` fully
- [ ] **Frontend scaffold before noon.** Non-negotiable. If you start the UI on Day 3 you will be styling at 3am.
- [ ] `Overlay.jsx`, colors, legend
- [ ] `samples/golden.json` — expected state per proposition for all 10 samples. Your regression test. Run it after every prompt change from here on.

### Day 3 — Sunday
Milestone: demo-quality.

- [ ] Misconception dictionary (8–10 entries from AAAS/BSCS)
- [ ] Hover card: source anchor + misconception + refutation + hint
- [ ] Concept chips with coverage state
- [ ] Follow-up question rendering
- [ ] Loading state that shows *stages* ("reading source → extracting claims → checking"), not a spinner. Perceived latency.
- [ ] Error states. Empty input, LLM timeout, unparseable JSON.
- [ ] Deploy. Vercel front, Render/Fly back.

### Day 4 — Monday — the day most teams skip
Milestone: three strangers use it without you talking.

- [ ] Hand it to three people who aren't you. Say nothing. Watch.
- [ ] Fix only what confused them. **Fix confusion, not features.**
- [ ] Run all 10 samples on the deployed URL, not localhost
- [ ] Time it. Anything over 10s warm, cut call C's max tokens.
- [ ] README: what it does, the source-grounded rationale for grey, setup, and explicit limitations
- [ ] Pre-warm the concept cache for your demo source so the video never waits

This day is your actual edge. In a 685-submission field, most projects that work at all will work *roughly*. First place versus fourth is whether the demo is smooth. A judge on submission #40 at 11pm has zero patience for a spinner.

### Day 5 — Tuesday
- [ ] Record twice. Keep the second.
- [ ] Submit by afternoon. Not 11:58pm.

---

## 12. The 2-minute video

Timing is load-bearing. The product must be on screen by ~0:15.

**0:00–0:15 — the hook, no intro**
Cold open on a fluent AP Bio explanation of the sodium-potassium pump. It reads well. Confident. Then the colors hit and half of it is yellow.

> "This explanation sounds right. Several claims are accurate, but the student
> has not supplied the supporting mechanism."

**Do not say your name. Do not say "today I'll be showing you."**

**0:15–1:10 — one full walkthrough**
Input → colors → hover a red flag, revealing the source anchor and the named misconception → the follow-up question.

> "Most AI study tools explain *to* the student. Explain-Back flips the
> direction: the student explains, and the app checks those statements against
> the supplied source."

**1:10–1:45 — pipeline and the grey state**
Simple animation: source → concepts, explanation → claims, alignment, verification.

> "Model judgments are uncertain, so we built a fourth state. Grey means the
> system cannot support a confident source-based judgment instead of presenting
> a guess as a contradiction."

That is your differentiator sentence. Land it clearly.

**1:45–2:00 — limits**

> "Automated analysis of self-explanations is new and not validated for high-stakes use. So this is formative only. No scores, nothing stored, teacher stays in control."

**Production notes:**
- Voiceover **plus** 1–2 word on-screen labels. Judges mute videos.
- Legible with sound off: "Green = supported and justified," "Yellow = supported, not justified," "Red = contradicts source," "Grey = uncertain"
- 1080p, screen recording, no webcam
- Hard cut at 1:58. Over 2:00 will not be viewed.

---

## 13. Rubric mapping

| Criterion | The specific thing that earns it |
|---|---|
| Educational Impact (25) | Source-grounded formative feedback on free-text explanations. Three distinct regions separate source coverage, statement-level diagnostics, and a follow-up prompt. |
| Creative Use of AI/ML (25) | Four-stage pipeline, not a wrapper. Structured extraction with verbatim constraint, embedding alignment, calibrated thresholds, NLI with a deterministic specificity gate. Every flag anchored to source text. |
| Technical Execution (25) | No training, no dataset, no hand-authored expert graph. Accepts arbitrary pasted source material, while cross-subject diagnostic quality remains uncalibrated. Cached source concepts, typed boundaries, and bounded visible failures. |
| Pitch & Demo (25) | Product on screen at 0:15. One before/after contrast. Grey-state rationale and limitations stated plainly. |

---

## 14. Risks

| Risk | Probability | Mitigation |
|---|---|---|
| Call B invents justifications | **High** | Rule 2 stated three ways, few-shot with empty-array example, verbatim filter in code. The code filter is the real defense. |
| Overlapping spans break overlay | Medium | `_dedupe_overlaps` before render, skip-if-`start < pos` in renderer |
| Thresholds mis-tuned | Medium | 20-pair calibration Day 1, golden regression file Day 2 |
| Latency over 10s | Medium | Cache concepts, batch call C, cap max tokens, staged loading UI |
| Red false positives | Medium | Specificity gate + hedge detector. Failure mode routes to grey, which is safe. |
| Scope creep | **High** | Section 10's "what NOT to build" list. Reread it Day 3. |
| Demo stalls on camera | Low | Pre-warm cache, record twice, have a local fallback recording |

---

## 15. Claims you can and cannot defend

**Can:**
- Self-explanation as a learning activity has published research support; that evidence does not validate this product
- Almost no shipped tool analyzes free-text self-explanations against a user-supplied source
- LLMs approach human reliability on *clear, short* explanations in constrained domains
- Misconception detectors produce heavy false-positive rates at realistic prevalence
- Revision-focused feedback is rated more useful by teachers than generic strategy tips

**Cannot — do not say these:**
- That Explain-Back itself is validated. It isn't. Nothing like it has been.
- That published work supplied the cosine thresholds. They were calibrated locally.
- Interpretability branding that implies attribution over model internals. Source citations are not internal-model attribution.
- Any unlabeled performance percentage for the system.

The honest version is stronger than the inflated version, and in front of twelve judges at least one of whom knows the field, it is also the only version that survives contact.
