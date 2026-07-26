# Graph Report - Explain-Back  (2026-07-26)

## Corpus Check
- 39 files · ~14,535 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 227 nodes · 436 edges · 25 communities (16 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5748c9af`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- 11. Five-day schedule
- 4. The prompts (verbatim, use these)
- Explain-Back — Complete Build Blueprint
- main.py
- package.json
- 6. Alignment
- 7. State resolution
- 8. Misconception dictionary
- 9. Backend endpoint
- align.py
- LLM wrapper hardening
- calibrate/run.py
- App.jsx
- llm.py
- prompts.py
- extract.py
- test_resolve.py
- Explain-Back
- vercel.json
- AGENTS.md
- __init__.py
- embed

## God Nodes (most connected - your core abstractions)
1. `Proposition` - 23 edges
2. `Concept` - 19 edges
3. `analyze()` - 17 edges
4. `resolve()` - 14 edges
5. `LLMResponseError` - 12 edges
6. `verify()` - 12 edges
7. `call_json()` - 11 edges
8. `Verdict` - 11 edges
9. `Flag` - 10 edges
10. `locate_spans()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `embed()`  [EXTRACTED]
  calibrate/run.py → backend/align.py
- `test_alignment_embeds_student_justification_with_claim()` --indirect_call--> `align()`  [INFERRED]
  tests/test_align.py → backend/align.py
- `test_fabricated_claim_and_justification_are_discarded()` --calls--> `locate_spans()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py
- `test_concept_anchor_must_be_verbatim()` --calls--> `locate_concept_anchors()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py
- `main()` --calls--> `extract_propositions()`  [EXTRACTED]
  scripts/run_gate1.py → backend/extract.py

## Import Cycles
- None detected.

## Communities (25 total, 9 thin omitted)

### Community 0 - "11. Five-day schedule"
Cohesion: 0.12
Nodes (16): 10. Frontend, 11. Five-day schedule, 12. The 2-minute video, 13. Rubric mapping, 14. Risks, 15. Claims you can and cannot defend, Color tokens, Day 1 — Friday July 25 (today) — THE DAY THAT DECIDES IT (+8 more)

### Community 1 - "4. The prompts (verbatim, use these)"
Cohesion: 0.33
Nodes (6): 4. The prompts (verbatim, use these), 5. Span validation — build this first, Call A — source to concepts, Call B — explanation to propositions, Call C — verify, batched, schemas.py

### Community 2 - "Explain-Back — Complete Build Blueprint"
Cohesion: 0.40
Nodes (5): 0. One-paragraph statement of the thing, 1. Architecture, 2. Repo layout, 3. Data model, Explain-Back — Complete Build Blueprint

### Community 3 - "main.py"
Cohesion: 0.17
Nodes (21): analyze(), _cache_key(), compute_coverage(), lifespan(), _prewarm(), _validate_lengths(), match(), AnalyzeRequest (+13 more)

### Community 4 - "package.json"
Cohesion: 0.09
Nodes (21): dependencies, react, react-dom, vite, @vitejs/plugin-react, devDependencies, vitest, name (+13 more)

### Community 12 - "App.jsx"
Cohesion: 0.13
Nodes (11): analyze(), API_BASE, App(), STAGES, ConceptList(), groupById(), FollowUp(), ITEMS (+3 more)

### Community 13 - "llm.py"
Cohesion: 0.16
Nodes (25): call_json(), _client_call(), _configuration(), LLMConfigurationError, LLMResponseError, LLMTimeoutError, parse_json(), Any (+17 more)

### Community 14 - "prompts.py"
Cohesion: 0.22
Nodes (14): call_a_prompt(), call_b_prompt(), call_c_prompt(), concept_prompt(), _items_text(), proposition_prompt(), Any, LLM prompt contracts for Explain-Back.  The prompt templates preserve the respon (+6 more)

### Community 15 - "extract.py"
Cohesion: 0.30
Nodes (13): _certainty(), _dedupe_overlaps(), extract_concepts(), extract_propositions(), locate_concept_anchors(), locate_spans(), Any, _type() (+5 more)

### Community 16 - "test_resolve.py"
Cohesion: 0.41
Nodes (13): is_specific(), resolve(), Verdict, proposition(), test_categorical_transport_claims_are_specific(), test_hedged_contradiction_is_grey(), test_hedged_entailment_is_grey(), test_low_confidence_entailment_is_grey() (+5 more)

### Community 17 - "Explain-Back"
Cohesion: 0.25
Nodes (7): Architecture, Calibration and gates, Deployment, Explain-Back, Limitations, Local setup, Why this design

### Community 19 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, outputDirectory, $schema

### Community 24 - "embed"
Cohesion: 0.24
Nodes (7): align(), embed(), _embedding_model(), main(), ndarray, SentenceTransformer, test_alignment_embeds_student_justification_with_claim()

## Knowledge Gaps
- **62 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+57 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Proposition` connect `extract.py` to `embed`, `test_resolve.py`, `main.py`, `llm.py`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `resolve()` connect `test_resolve.py` to `main.py`, `extract.py`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `Concept` connect `llm.py` to `embed`, `main.py`, `extract.py`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _62 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `11. Five-day schedule` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12987012987012986 - nodes in this community are weakly interconnected._