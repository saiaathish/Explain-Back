# Graph Report - Explain-Back  (2026-07-30)

## Corpus Check
- 137 files · ~88,424 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1027 nodes · 2022 edges · 70 communities (59 shown, 11 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 45 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5deb2846`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- 11. Five-day schedule
- 4. The prompts (verbatim, use these)
- Explain-Back — Complete Build Blueprint
- Proposition
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
- enterExplanation
- analyze
- playwright.local.config.js
- supabase.js
- analyze
- auth.hosted.js
- Platform expansion release contract
- diagnose_misses.py
- useSession
- playwright.hosted.config.js
- SessionProvider.jsx
- accessibility-audit.pw.js
- demo-path.pw.js
- auth.hosted.js
- auth.supabase.js
- confidence.js
- useAuth
- ReviewCardStack.jsx
- history.local.js
- rate-limit.local.js
- playwright.supabase.config.js
- playwright.hosted.config.js

## God Nodes (most connected - your core abstractions)
1. `Proposition` - 28 edges
2. `analyze()` - 27 edges
3. `Concept` - 25 edges
4. `LLMResponseError` - 21 edges
5. `active_model()` - 20 edges
6. `_AccountAnalysisState` - 17 edges
7. `Flag` - 17 edges
8. `AnalyzeRequest` - 17 edges
9. `useSession()` - 17 edges
10. `is_configured()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `TestAccountAnalysisBudget` --uses--> `AuthenticatedUser`  [INFERRED]
  tests/test_main.py → backend/auth.py
- `test_clean_validation_errors()` --calls--> `_validate_lengths()`  [EXTRACTED]
  tests/test_main.py → backend/main.py
- `TestAccountAnalysisBudget` --uses--> `Concept`  [INFERRED]
  tests/test_main.py → backend/schemas.py
- `TestAccountAnalysisBudget` --uses--> `Proposition`  [INFERRED]
  tests/test_main.py → backend/schemas.py
- `TestAccountAnalysisBudget` --uses--> `Verdict`  [INFERRED]
  tests/test_main.py → backend/schemas.py

## Import Cycles
- None detected.

## Communities (70 total, 11 thin omitted)

### Community 0 - "11. Five-day schedule"
Cohesion: 0.12
Nodes (16): 10. Frontend, 11. Five-day schedule, 12. The 2-minute video, 13. Rubric mapping, 14. Risks, 15. Claims you can and cannot defend, Color tokens, Day 1 — Friday July 25 (today) — THE DAY THAT DECIDES IT (+8 more)

### Community 1 - "4. The prompts (verbatim, use these)"
Cohesion: 0.33
Nodes (6): 4. The prompts (verbatim, use these), 5. Span validation — build this first, Call A — source to concepts, Call B — explanation to propositions, Call C — verify, batched, schemas.py

### Community 2 - "Explain-Back — Complete Build Blueprint"
Cohesion: 0.40
Nodes (5): 0. One-paragraph statement of the thing, 1. Architecture, 2. Repo layout, 3. Data model, Explain-Back — Complete Build Blueprint

### Community 3 - "Proposition"
Cohesion: 0.15
Nodes (24): align(), _concept_vector_key(), embed(), embed_concepts(), _embedding_model(), Concept, Proposition, _cap_hint() (+16 more)

### Community 4 - "package.json"
Cohesion: 0.06
Nodes (33): @axe-core/playwright, framer-motion, dependencies, framer-motion, react, react-dom, react-router-dom, @supabase/supabase-js (+25 more)

### Community 12 - "App.jsx"
Cohesion: 0.07
Nodes (28): CalibrationMap(), CELLS, ConceptList(), groupById(), claimEntries(), classifyTransition(), coverageOf(), diffRuns() (+20 more)

### Community 13 - "llm.py"
Cohesion: 0.06
Nodes (72): active_model(), _audio_client_call(), _audio_configuration(), _audio_generation_config(), _audio_request_payload(), _backoff_seconds(), call_audio_text(), call_json() (+64 more)

### Community 14 - "prompts.py"
Cohesion: 0.10
Nodes (19): Architectural invariants, Executive status, Explain-Back hardening report, Files intentionally not changed, Final gate hardening, Five original misses, Golden progression, Phase A — diagnosis (+11 more)

### Community 15 - "The Revise Loop — build and acceptance report"
Cohesion: 0.14
Nodes (13): Acceptance tests, Additions and removals are no longer displayed, Correctness of the diff, Demo fixture output, Demo path, Found and not fixed, Functional, Invariants (+5 more)

### Community 16 - "test_resolve.py"
Cohesion: 0.15
Nodes (10): analysisResponse(), anchoredConcept(), flagsFor(), FOCUSED_EXPLANATION, INITIAL_EXPLANATION, installControlledAnalysis(), installImmediateAnalysis(), PRESET_FIXTURES (+2 more)

### Community 17 - "Explain-Back"
Cohesion: 0.13
Nodes (13): For judges — see everything in 90 seconds, Hosted authentication requirement, Architecture, Calibration and gates, Deployment, Explain-Back, Feature scope and the recorded demo, Hosted Phase 2 verification (+5 more)

### Community 19 - "vercel.json"
Cohesion: 0.29
Nodes (6): buildCommand, framework, installCommand, outputDirectory, rewrites, $schema

### Community 22 - "test_golden_fixture.py"
Cohesion: 0.14
Nodes (13): `01_fluent_unjustified.txt`, `02_reversed_stoich.txt`, `06_correct.txt`, `09_mixed_partial.txt`, `10_mixed_justification.txt`, Baseline and method, Class 1: propositions that receive no matching diagnostic, Class 2: valid justification is never selected (+5 more)

### Community 24 - "embed"
Cohesion: 0.06
Nodes (33): _agreement(), best_flag(), characterize(), _determinism(), main(), _model_header(), overlap(), parse_args() (+25 more)

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
Cohesion: 0.11
Nodes (35): AuthenticatedUser, _AccountAnalysisState, analyze_route(), _base64_envelope_bytes(), enforce_account_analysis_budget(), enforce_model_call_rate_limit(), lifespan(), normalize_image() (+27 more)

### Community 36 - "Pre-submission fix run"
Cohesion: 0.40
Nodes (4): Batch outcomes, Not fixed, and why, Pre-submission fix run, Regression evidence

### Community 37 - "Implementation plan — Explain-Back visual pass"
Cohesion: 0.14
Nodes (13): Automated browser timing sweep, desktop-chrome (1280x800), Execution note, Failures, Initial analysis, Initial analysis, Initial analysis, ipad (768x1024) (+5 more)

### Community 38 - "App.jsx"
Cohesion: 0.36
Nodes (7): appendTranscript(), blobToDataUrl(), CANDIDATE_MIME_TYPES, preferredMimeType(), startRecorder(), stopStream(), supportsRecording()

### Community 39 - "Accessibility audit"
Cohesion: 0.15
Nodes (12): activeElement(), E2E_DIR, FRONTEND_DIR, keyboardWalkthrough(), mockAnalysis(), readReport(), REPO_ROOT, REPORT_PATH (+4 more)

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

### Community 46 - "enterExplanation"
Cohesion: 0.28
Nodes (11): analyzeOnce(), enterExplanation(), enterSource(), reviseWith(), startSession(), submitForAnalysis(), fillSubmission(), submitImmediately() (+3 more)

### Community 48 - "analyze"
Cohesion: 0.06
Nodes (54): attemptSummary(), createAnalysisHistory(), getAnalysisHistory(), sourcePreview(), historyClient(), latestAttempt(), successfulSingle(), createClearedGaps() (+46 more)

### Community 49 - "playwright.local.config.js"
Cohesion: 0.10
Nodes (53): _AuthConfigurationError, _AuthSettings, _bearer_token(), _get_signing_key(), _InvalidAuthenticationToken, _jwks_client(), _JWKSRefreshState, _JWKSUnavailable (+45 more)

### Community 50 - "supabase.js"
Cohesion: 0.07
Nodes (27): A bug this caught before it shipped, Analysis rate limiting, Cost of this decision, stated plainly, Current gate evidence — July 29, 2026, Fallback — verified, Hard fallback, Hosted preview — verified from the deployed origin, Independent stop points (+19 more)

### Community 51 - "analyze"
Cohesion: 0.25
Nodes (18): extract_propositions(), active_role(), is_configured(), analyze(), compute_coverage(), _prewarm(), _result_cache_key(), AnalyzeRequest (+10 more)

### Community 52 - "auth.hosted.js"
Cohesion: 0.19
Nodes (11): App(), AuthStateProvider(), boundedSingleFlight(), isOAuthReturn(), readOAuthCallbackError(), shouldOpenWorkspaceOnSessionRestore(), singleFlight(), withTimeout() (+3 more)

### Community 53 - "Platform expansion release contract"
Cohesion: 0.18
Nodes (14): AppLayout(), readCollapsed(), CloseIcon(), DashboardIcon(), MenuIcon(), NewSessionIcon(), PanelIcon(), ProfileIcon() (+6 more)

### Community 54 - "diagnose_misses.py"
Cohesion: 0.20
Nodes (16): extract_concepts(), _cache_key(), _prewarm_source(), Path, best_flag(), best_proposition(), overlap(), parse_args() (+8 more)

### Community 55 - "useSession"
Cohesion: 0.18
Nodes (10): AnalyzingStep(), RecordStep(), SourceStep(), STEPS, StepShell(), CharacterCounter(), PRESETS, ExplanationField() (+2 more)

### Community 56 - "playwright.hosted.config.js"
Cohesion: 0.41
Nodes (13): is_specific(), resolve(), Verdict, proposition(), test_categorical_transport_claims_are_specific(), test_hedged_contradiction_is_grey(), test_hedged_entailment_is_grey(), test_low_confidence_entailment_is_grey() (+5 more)

### Community 57 - "SessionProvider.jsx"
Cohesion: 0.30
Nodes (12): StepGuard(), furthestStep(), STEP_ORDER, stepIsReachable(), LONG_SOURCE, trimRangeSnapshot(), validateExplanation(), validateFocused() (+4 more)

### Community 58 - "accessibility-audit.pw.js"
Cohesion: 0.23
Nodes (5): base64Url(), fixtureJwt(), session(), test, user()

### Community 59 - "demo-path.pw.js"
Cohesion: 0.32
Nodes (9): analyze(), API_BASE, modelRequest(), normalizeImage(), rateLimitError(), requestHeaders(), retryAfterSeconds(), modelRequests (+1 more)

### Community 60 - "auth.hosted.js"
Cohesion: 0.24
Nodes (7): enterAnonymousWorkspace(), EXPLANATION, readStoredAuth(), SOURCE, VALIDATION_ONLY_BODY, waitForLinkedAuth(), waitForStoredAuth()

### Community 61 - "auth.supabase.js"
Cohesion: 0.20
Nodes (5): analysisResponse(), PUBLISHABLE_KEY, SOURCE, stubAnalysis(), SUPABASE_URL

### Community 62 - "confidence.js"
Cohesion: 0.35
Nodes (7): calibrationSummary(), isConfident(), rangesOverlap(), sentenceRanges(), trimSentence(), ConfidencePass(), ConfidenceStep()

### Community 63 - "useAuth"
Cohesion: 0.36
Nodes (7): EntryRoute(), RequireAuth(), useAuthSettling(), AuthContext, AuthProvider(), AuthConsumer(), useAuth()

### Community 64 - "ReviewCardStack.jsx"
Cohesion: 0.43
Nodes (6): CardFace(), GridIcon(), ReviewCardStack(), SPRING, StackIcon(), stateLabel()

### Community 65 - "history.local.js"
Cohesion: 0.47
Nodes (5): signIn(), analysisResponse(), enterWorkspace(), installAnalysis(), SOURCE

### Community 66 - "rate-limit.local.js"
Cohesion: 0.50
Nodes (3): analysisResponse(), installAnalysis(), SOURCE

### Community 67 - "playwright.supabase.config.js"
Cohesion: 0.40
Nodes (3): port, publishableKey, supabaseUrl

## Knowledge Gaps
- **254 isolated node(s):** `_GenerationDefaults`, `E2E_DIR`, `FRONTEND_DIR`, `REPO_ROOT`, `REPORT_PATH` (+249 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `session()` connect `accessibility-audit.pw.js` to `analyze`, `auth.hosted.js`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `AuthStateProvider()` connect `auth.hosted.js` to `accessibility-audit.pw.js`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `deriveCards()` connect `analyze` to `accessibility-audit.pw.js`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Concept` (e.g. with `_AccountAnalysisState` and `TestAccountAnalysisBudget`) actually correct?**
  _`Concept` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `_GenerationDefaults`, `E2E_DIR`, `FRONTEND_DIR` to the rest of the system?**
  _254 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `11. Five-day schedule` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._