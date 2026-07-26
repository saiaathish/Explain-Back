# Graph Report - Explain-Back  (2026-07-25)

## Corpus Check
- 36 files · ~13,144 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 203 nodes · 358 edges · 25 communities (16 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eca0e2d6`
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
1. `Proposition` - 18 edges
2. `analyze()` - 15 edges
3. `Concept` - 13 edges
4. `call_json()` - 11 edges
5. `resolve()` - 11 edges
6. `Verdict` - 10 edges
7. `locate_spans()` - 9 edges
8. `extract_propositions()` - 9 edges
9. `verify()` - 9 edges
10. `extract_concepts()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `embed()`  [EXTRACTED]
  calibrate/run.py → backend/align.py
- `test_fabricated_claim_and_justification_are_discarded()` --calls--> `locate_spans()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py
- `test_concept_anchor_must_be_verbatim()` --calls--> `locate_concept_anchors()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py
- `main()` --calls--> `extract_propositions()`  [EXTRACTED]
  scripts/run_gate1.py → backend/extract.py
- `test_parse_json_salvages_wrapped_object()` --calls--> `parse_json()`  [EXTRACTED]
  tests/test_llm.py → backend/llm.py

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
Cohesion: 0.18
Nodes (20): align(), extract_concepts(), analyze(), _cache_key(), compute_coverage(), lifespan(), _prewarm(), _validate_lengths() (+12 more)

### Community 4 - "package.json"
Cohesion: 0.09
Nodes (21): dependencies, react, react-dom, vite, @vitejs/plugin-react, devDependencies, vitest, name (+13 more)

### Community 12 - "App.jsx"
Cohesion: 0.13
Nodes (11): analyze(), API_BASE, App(), STAGES, ConceptList(), groupById(), FollowUp(), ITEMS (+3 more)

### Community 13 - "llm.py"
Cohesion: 0.22
Nodes (15): call_json(), _client_call(), _configuration(), LLMConfigurationError, LLMResponseError, LLMTimeoutError, parse_json(), Any (+7 more)

### Community 14 - "prompts.py"
Cohesion: 0.22
Nodes (14): call_a_prompt(), call_b_prompt(), call_c_prompt(), concept_prompt(), _items_text(), proposition_prompt(), Any, LLM prompt contracts for Explain-Back.  The prompt templates preserve the respon (+6 more)

### Community 15 - "extract.py"
Cohesion: 0.32
Nodes (12): _certainty(), _dedupe_overlaps(), extract_propositions(), locate_concept_anchors(), locate_spans(), Any, _type(), Proposition (+4 more)

### Community 16 - "test_resolve.py"
Cohesion: 0.53
Nodes (9): is_specific(), resolve(), Verdict, proposition(), test_hedged_contradiction_is_grey(), test_specific_high_confidence_contradiction_is_red(), test_supported_justified_is_green(), test_supported_unjustified_is_yellow() (+1 more)

### Community 17 - "Explain-Back"
Cohesion: 0.25
Nodes (7): Architecture, Calibration and gates, Deployment, Explain-Back, Limitations, Local setup, Why this design

### Community 19 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, framework, outputDirectory, $schema

### Community 24 - "embed"
Cohesion: 0.40
Nodes (5): embed(), _embedding_model(), main(), ndarray, SentenceTransformer

## Knowledge Gaps
- **61 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+56 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Proposition` connect `extract.py` to `test_resolve.py`, `main.py`, `llm.py`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `call_json()` connect `llm.py` to `main.py`, `extract.py`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `resolve()` connect `test_resolve.py` to `main.py`, `extract.py`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _61 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `11. Five-day schedule` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12987012987012986 - nodes in this community are weakly interconnected._