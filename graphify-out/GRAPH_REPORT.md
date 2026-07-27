# Graph Report - Explain-Back  (2026-07-27)

## Corpus Check
- 53 files · ~29,903 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 390 nodes · 746 edges · 35 communities (26 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `420c63c8`
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
- test_golden_fixture.py
- embed
- diagnose_misses.py
- Overclaim and silent-failure audit
- Production adversarial evaluation
- Cross-subject evaluation
- Demo-path operations
- run_adversarial.py
- Dual-model CI outcome
- Gemma baseline
- verify.py

## God Nodes (most connected - your core abstractions)
1. `Proposition` - 27 edges
2. `Concept` - 22 edges
3. `analyze()` - 21 edges
4. `active_model()` - 20 edges
5. `is_configured()` - 16 edges
6. `run()` - 16 edges
7. `Flag` - 15 edges
8. `active_role()` - 14 edges
9. `resolve()` - 14 edges
10. `AnalyzeRequest` - 14 edges

## Surprising Connections (you probably didn't know these)
- `test_call_json_fails_loudly_after_retries()` --calls--> `call_json()`  [EXTRACTED]
  tests/test_llm.py → backend/llm.py
- `test_alignment_embeds_student_justification_with_claim()` --indirect_call--> `align()`  [INFERRED]
  tests/test_align.py → backend/align.py
- `test_concept_vectors_are_cached_by_digest()` --indirect_call--> `align()`  [INFERRED]
  tests/test_align.py → backend/align.py
- `test_fabricated_claim_and_justification_are_discarded()` --calls--> `locate_spans()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py
- `test_concept_anchor_must_be_verbatim()` --calls--> `locate_concept_anchors()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py

## Import Cycles
- None detected.

## Communities (35 total, 9 thin omitted)

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
Cohesion: 0.11
Nodes (31): align(), _concept_vector_key(), embed(), embed_concepts(), _embedding_model(), _cache_key(), compute_coverage(), lifespan() (+23 more)

### Community 4 - "package.json"
Cohesion: 0.09
Nodes (21): dependencies, react, react-dom, vite, @vitejs/plugin-react, devDependencies, vitest, name (+13 more)

### Community 12 - "App.jsx"
Cohesion: 0.13
Nodes (12): analyze(), API_BASE, App(), STAGES, ConceptList(), groupById(), FollowUp(), ITEMS (+4 more)

### Community 13 - "llm.py"
Cohesion: 0.11
Nodes (41): active_model(), active_role(), _configuration(), _generation_config(), GenerationConfig, _GenerationDefaults, is_configured(), LLMConfigurationError (+33 more)

### Community 14 - "prompts.py"
Cohesion: 0.10
Nodes (19): Architectural invariants, Executive status, Explain-Back hardening report, Files intentionally not changed, Final gate hardening, Five original misses, Golden progression, Phase A — diagnosis (+11 more)

### Community 15 - "extract.py"
Cohesion: 0.18
Nodes (23): _certainty(), _dedupe_overlaps(), extract_concepts(), extract_propositions(), locate_concept_anchors(), locate_spans(), Any, _type() (+15 more)

### Community 16 - "test_resolve.py"
Cohesion: 0.41
Nodes (13): is_specific(), resolve(), Verdict, proposition(), test_categorical_transport_claims_are_specific(), test_hedged_contradiction_is_grey(), test_hedged_entailment_is_grey(), test_low_confidence_entailment_is_grey() (+5 more)

### Community 17 - "Explain-Back"
Cohesion: 0.25
Nodes (7): Architecture, Calibration and gates, Deployment, Explain-Back, Limitations, Local setup, Why this design

### Community 19 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, outputDirectory, $schema

### Community 22 - "test_golden_fixture.py"
Cohesion: 0.14
Nodes (13): `01_fluent_unjustified.txt`, `02_reversed_stoich.txt`, `06_correct.txt`, `09_mixed_partial.txt`, `10_mixed_justification.txt`, Baseline and method, Class 1: propositions that receive no matching diagnostic, Class 2: valid justification is never selected (+5 more)

### Community 24 - "embed"
Cohesion: 0.19
Nodes (19): _agreement(), best_flag(), characterize(), _determinism(), main(), overlap(), parse_args(), Any (+11 more)

### Community 25 - "diagnose_misses.py"
Cohesion: 0.22
Nodes (14): call_a_prompt(), call_b_prompt(), call_c_prompt(), concept_prompt(), _items_text(), proposition_prompt(), Any, LLM prompt templates for Explain-Back.  The templates state the intended respons (+6 more)

### Community 26 - "Overclaim and silent-failure audit"
Cohesion: 0.20
Nodes (9): Add semantic validation for the follow-up question, Align the historical blueprint, Already compliant, Applied, Follow-up applied, Make every partially discarded model response visible, Method, Overclaim and silent-failure audit (+1 more)

### Community 27 - "Production adversarial evaluation"
Cohesion: 0.25
Nodes (7): Environment, Fix verification, Production adversarial evaluation, Rate limiting, Results against production, Unicode offsets, Unresolved limitations

### Community 28 - "Cross-subject evaluation"
Cohesion: 0.29
Nodes (6): Alignment and state assignment, Concept extraction, Conclusion, Cross-subject evaluation, Results, Scope and method

### Community 29 - "Demo-path operations"
Cohesion: 0.29
Nodes (6): Branch preview smoke, Demo-path operations, Judging-window workaround, Mobile verification, Production demo timings, Render sleep and prewarm

### Community 30 - "run_adversarial.py"
Cohesion: 0.83
Nodes (3): _js_slice(), main(), _read()

### Community 32 - "Dual-model CI outcome"
Cohesion: 0.17
Nodes (11): Architecture, Current evidence, Decision, Dual-model CI outcome, Final comparison and release disposition, Measurements and retained tuning, Passing evidence, Production status (+3 more)

### Community 33 - "Gemma baseline"
Cohesion: 0.22
Nodes (8): Baseline conclusion, Final paced release characterization, Gemma baseline, Isolation status, Proposition counts, Scope, Structured output, Untuned results

### Community 34 - "verify.py"
Cohesion: 0.25
Nodes (14): _client_call(), LLMResponseError, LLMTimeoutError, _cap_hint(), _follow_up(), Any, _validate_response(), verify() (+6 more)

## Knowledge Gaps
- **123 isolated node(s):** `_GenerationDefaults`, `name`, `private`, `version`, `type` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Proposition` connect `main.py` to `test_resolve.py`, `embed`, `verify.py`, `extract.py`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `active_model()` connect `llm.py` to `extract.py`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `resolve()` connect `test_resolve.py` to `main.py`, `llm.py`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `_GenerationDefaults`, `name`, `private` to the rest of the system?**
  _123 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `11. Five-day schedule` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.11184939091915837 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._