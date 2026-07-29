# Graph Report - Explain-Back  (2026-07-29)

## Corpus Check
- 81 files · ~61,378 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 673 nodes · 1185 edges · 48 communities (38 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c27807f8`
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
- The Revise Loop — build and acceptance report
- test_resolve.py
- Explain-Back
- vercel.json
- AGENTS.md
- __init__.py
- test_golden_fixture.py
- embed
- extract.py
- Overclaim and silent-failure audit
- Production adversarial evaluation
- Cross-subject evaluation
- Demo-path operations
- run_adversarial.py
- Dual-model CI outcome
- Gemma baseline
- prompts.py
- diagnose_misses.py
- Pre-submission fix run
- Implementation plan — Explain-Back visual pass
- App.jsx
- Accessibility audit
- accessibility-audit.pw.js
- demo-path.pw.js
- Golden expansion report
- Adversarial Testing — 2026-07-28
- Design decisions
- postmortem.md

## God Nodes (most connected - your core abstractions)
1. `Proposition` - 27 edges
2. `analyze()` - 25 edges
3. `Concept` - 23 edges
4. `LLMResponseError` - 20 edges
5. `active_model()` - 20 edges
6. `is_configured()` - 16 edges
7. `run()` - 16 edges
8. `locate_spans()` - 15 edges
9. `call_json()` - 15 edges
10. `Flag` - 15 edges

## Surprising Connections (you probably didn't know these)
- `test_alignment_embeds_student_justification_with_claim()` --indirect_call--> `align()`  [INFERRED]
  tests/test_align.py → backend/align.py
- `test_concept_vectors_are_cached_by_digest()` --indirect_call--> `align()`  [INFERRED]
  tests/test_align.py → backend/align.py
- `test_find_normalized_missing_returns_minus_one()` --calls--> `find_normalized()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py
- `test_find_normalized_respects_cursor()` --calls--> `find_normalized()`  [EXTRACTED]
  tests/test_extract.py → backend/extract.py
- `run()` --calls--> `locate_spans()`  [EXTRACTED]
  tests/diagnose_misses.py → backend/extract.py

## Import Cycles
- None detected.

## Communities (48 total, 10 thin omitted)

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
Cohesion: 0.12
Nodes (37): align(), _concept_vector_key(), embed(), embed_concepts(), _embedding_model(), is_specific(), resolve(), Concept (+29 more)

### Community 4 - "package.json"
Cohesion: 0.08
Nodes (25): @axe-core/playwright, dependencies, react, react-dom, vite, @vitejs/plugin-react, devDependencies, @axe-core/playwright (+17 more)

### Community 12 - "App.jsx"
Cohesion: 0.15
Nodes (16): claimEntries(), classifyTransition(), coverageOf(), diffRuns(), isImprovement(), LABELS, normalizeClaim(), ORDER (+8 more)

### Community 13 - "llm.py"
Cohesion: 0.07
Nodes (64): _audio_client_call(), _audio_configuration(), _audio_generation_config(), _audio_request_payload(), _backoff_seconds(), call_audio_text(), call_json(), call_vision_text() (+56 more)

### Community 14 - "prompts.py"
Cohesion: 0.10
Nodes (19): Architectural invariants, Executive status, Explain-Back hardening report, Files intentionally not changed, Final gate hardening, Five original misses, Golden progression, Phase A — diagnosis (+11 more)

### Community 15 - "The Revise Loop — build and acceptance report"
Cohesion: 0.14
Nodes (13): Acceptance tests, Additions and removals are no longer displayed, Correctness of the diff, Demo fixture output, Demo path, Found and not fixed, Functional, Invariants (+5 more)

### Community 16 - "test_resolve.py"
Cohesion: 0.10
Nodes (15): analysisResponse(), anchoredConcept(), durationsAreZero(), expectNoMotion(), fillSubmission(), flagsFor(), FOCUSED_EXPLANATION, INITIAL_EXPLANATION (+7 more)

### Community 17 - "Explain-Back"
Cohesion: 0.18
Nodes (9): For judges — see everything in 90 seconds, Architecture, Calibration and gates, Deployment, Explain-Back, Feature scope and the recorded demo, Limitations, Local setup (+1 more)

### Community 19 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, outputDirectory, $schema

### Community 22 - "test_golden_fixture.py"
Cohesion: 0.14
Nodes (13): `01_fluent_unjustified.txt`, `02_reversed_stoich.txt`, `06_correct.txt`, `09_mixed_partial.txt`, `10_mixed_justification.txt`, Baseline and method, Class 1: propositions that receive no matching diagnostic, Class 2: valid justification is never selected (+5 more)

### Community 24 - "embed"
Cohesion: 0.07
Nodes (32): _validate_lengths(), _agreement(), best_flag(), characterize(), _determinism(), main(), _model_header(), overlap() (+24 more)

### Community 25 - "extract.py"
Cohesion: 0.10
Nodes (36): _certainty(), _dedupe_overlaps(), find_normalized(), _flatten(), locate_concept_anchors(), locate_spans(), _norm(), Any (+28 more)

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
Cohesion: 0.15
Nodes (12): Architecture, Current evidence, Decision, Dual-model CI outcome, Final comparison and release disposition, Measurements and retained tuning, Passing evidence, Product-owner release authorization — 2026-07-27 (+4 more)

### Community 33 - "Gemma baseline"
Cohesion: 0.22
Nodes (8): Baseline conclusion, Final paced release characterization, Gemma baseline, Isolation status, Proposition counts, Scope, Structured output, Untuned results

### Community 34 - "prompts.py"
Cohesion: 0.12
Nodes (14): E2E_DIR, formatSeconds(), FRONTEND_DIR, paceMs, percentile(), projects, records, REPO_ROOT (+6 more)

### Community 35 - "diagnose_misses.py"
Cohesion: 0.07
Nodes (66): extract_concepts(), extract_propositions(), active_model(), active_role(), is_configured(), Return the model selected by the centralized role/call registry., analyze(), _base64_envelope_bytes() (+58 more)

### Community 36 - "Pre-submission fix run"
Cohesion: 0.40
Nodes (4): Batch outcomes, Not fixed, and why, Pre-submission fix run, Regression evidence

### Community 37 - "Implementation plan — Explain-Back visual pass"
Cohesion: 0.14
Nodes (13): Automated browser timing sweep, desktop-chrome (1280x800), Execution note, Failures, Initial analysis, Initial analysis, Initial analysis, ipad (768x1024) (+5 more)

### Community 38 - "App.jsx"
Cohesion: 0.07
Nodes (30): analyze(), API_BASE, normalizeImage(), transcribeAudio(), App(), IMAGE_TYPES, PRESETS, SUBMIT_STAGES (+22 more)

### Community 39 - "Accessibility audit"
Cohesion: 0.18
Nodes (9): activeElement(), E2E_DIR, FRONTEND_DIR, keyboardWalkthrough(), readReport(), REPO_ROOT, REPORT_PATH, REVISED_EXPLANATION (+1 more)

### Community 40 - "accessibility-audit.pw.js"
Cohesion: 0.22
Nodes (8): E2E_DIR, FRONTEND_DIR, paceMs, readRecords(), REPO_ROOT, RESULTS_PATH, REVISED_EXPLANATION, writeRecord()

### Community 41 - "demo-path.pw.js"
Cohesion: 0.22
Nodes (8): Accessibility audit, Executive result, Fixed critical finding — diagnostic disclosure semantics, Keyboard-only walkthrough, Remaining moderate finding — missing level-one heading, Remaining serious finding — contrast, Screen reader, Status

### Community 42 - "Golden expansion report"
Cohesion: 0.33
Nodes (5): Current checked-in evidence, Golden expansion report, Morning discrepancy gate, Safe next step for a future fixture expansion, Status

### Community 43 - "Adversarial Testing — 2026-07-28"
Cohesion: 0.50
Nodes (3): Adversarial Testing — 2026-07-28, Job 4 note, Stop sign — Job 1

### Community 44 - "Design decisions"
Cohesion: 0.50
Nodes (3): Design decisions, Why there is a fourth grey state, Why these similarity thresholds

## Knowledge Gaps
- **199 isolated node(s):** `_GenerationDefaults`, `E2E_DIR`, `FRONTEND_DIR`, `REPO_ROOT`, `REPORT_PATH` (+194 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Proposition` connect `main.py` to `embed`, `extract.py`, `diagnose_misses.py`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `resolve()` connect `main.py` to `diagnose_misses.py`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `active_model()` connect `diagnose_misses.py` to `embed`, `llm.py`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `_GenerationDefaults`, `E2E_DIR`, `FRONTEND_DIR` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `11. Five-day schedule` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.11690821256038647 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._