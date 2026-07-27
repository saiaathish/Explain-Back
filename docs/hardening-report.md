# Explain-Back hardening report

## Executive status

The hardening branch improves the original golden agreement from **32/37
(86.5%)** to **35/37 (94.6%)**, preserves deterministic and visible failure
boundaries, adds a larger hand-labeled fixture, checks two additional subjects,
and fixes two production-demonstrated robustness defects: Unicode overlay
offsets and missing application rate limiting.

Production remained live throughout the run:

- Frontend: `https://explain-back.vercel.app`
- Backend: `https://explain-back.onrender.com`
- Live production SHA during hardening: `84c86e9`

Rendered desktop and 390px preview verification was completed at semantic SHA
`87a78be`. The later `ee03c38` commit changed startup prewarm scheduling,
release-gate scripts, tests, reports, and generated Graphify artifacts, but not
the frontend or semantic analysis modules. Production remained on `84c86e9`
while the branch awaited exact-current-head live gates and merge.

## Golden progression

| Stage | Original 10 samples | Expanded 15 samples | Decision |
| --- | ---: | ---: | --- |
| Baseline | 32/37 (86.5%) | — | Diagnose |
| Phase B broad extraction experiment | 32/37 (86.5%) | — | Reverted |
| Phase C quantitative-justification prompt | 35/37 (94.6%) | — | Retained |
| Phase D expanded baseline | 35/37 (94.6%) | 44/55 (80.0%) | Retained as evidence |

The expanded fixture contains 55 hand-labeled propositions across 15 samples.
Its 11 misses were not relabeled to match model output. Old and expanded scores
remain separate because combining them would hide whether an original
regression occurred.

### Five original misses

| Sample | Baseline cause | Final status |
| --- | --- | --- |
| `01_fluent_unjustified.txt` | Call B split a coordinated sentence, invented a replacement subject, and the validator discarded the non-verbatim span. | Currently matching; all four expected items are yellow. |
| `02_reversed_stoich.txt` | A false charge-direction clause was retained only as justification, so it never received an independent red diagnostic. | Still failing; expected red item is missing. |
| `06_correct.txt` | A later quantitative consequence was not linked as justification, producing yellow instead of green. | Fixed; 5/5 green. |
| `09_mixed_partial.txt` | The visible claim was only `ATP matters`; the mechanism remained hidden in justification and failed the golden overlap threshold. | Still failing; expected green item is missing. |
| `10_mixed_justification.txt` | A non-adjacent charge consequence was not linked to the earlier stoichiometry claim. | Fixed; all four expected items match. |

All five original misses were deterministic across five diagnostic runs. No
miss was caused by malformed JSON or sampling variance.

## Phase decisions

### Phase A — diagnosis

Added `tests/diagnose_misses.py` and `docs/golden-analysis.md`. Raw Call B
structures and final state patterns were identical in all five repeats per
sample. The three extraction misses and two justification-recognition misses
were therefore treated separately.

### Phase B — extraction recall

Reverted in full. The broad sentence-coverage rule fixed some missed clauses
but introduced regressions in samples `03` and `08`, raised proposition count
from 38 to 48 (+26.3%), and left agreement at 32/37. This exceeded the 15%
over-extraction limit with no score gain.

### Phase C — justification detection

Retained. Two narrow examples teach Call B that a later explicit quantitative
consequence can justify an earlier ratio or direction claim while a general
importance statement cannot. Agreement rose to 35/37, proposition count rose
only 2.6%, and the unjustified sample remained yellow.

### Phase D — expanded fixture

Added five explanations for short answers, a correct claim with a wrong
mechanism, hedging plus a specific error, reverse source order, and poor grammar
with correct content. A separate Luna High label review corrected two
hand-label boundaries before the live run. See `docs/golden-analysis.md`.

### Phase E — cross-subject evidence

Added three-paragraph supply/demand and photosynthesis sources, plus strong and
flawed explanations for each. They are not in `golden.json`.

The pipeline executed structurally with valid spans and no malformed output,
but degraded outside the calibration domain:

- Supply/demand strong: 7 yellow, 4 grey, 0 green.
- Supply/demand flawed: 2 red, 4 grey.
- Photosynthesis strong: 1 green, 10 yellow, 6 grey.
- Photosynthesis flawed: 2 red, 7 grey.

The README now says cross-subject quality is uncalibrated rather than claiming
any-subject performance. See `docs/cross-subject.md`.

### Phase F — production adversarial checks

Production returned bounded JSON or a clear client error for every case. Prompt
injection did not alter the two substantive states, foreign-language input was
all grey, and a repeated sentence produced three distinct spans.

Two real defects were found and fixed on the branch:

1. A leading emoji shifted all rendered diagnostics because Python offsets
   count Unicode code points while JavaScript slices UTF-16 code units.
   `Overlay.jsx` now converts offsets before slicing and has a regression test.
2. Production had no application limiter; 50 rapid invalid submissions all
   returned 400. The branch now allows 20 analysis submissions per client in a
   rolling minute, then returns JSON 429 with `Retry-After` and CORS headers.
   The browser displays the detail, removes loading state, and re-enables the
   button.

See `docs/adversarial.md`.

### Phase G — overclaim audit

Applied the Luna High findings that were supported by the architecture:

- State labels now describe source support and justification rather than
  learner understanding or memorization.
- The footer scopes storage to Explain-Back persistence and the README
  acknowledges provider handling.
- The uncited numerical learning-science statistic was removed from product
  documentation.
- The follow-up is described as generated from analyzed gaps, not proven to be
  the objectively weakest point.
- README model-stage wording now distinguishes logical stages from retries.
- Prompt and egress comments identify validators and the backend provider
  boundary precisely.
- The historical blueprint now uses the same evidence boundaries as the product:
  no cognition labels, unsupported numerical learning claims, universal-subject
  performance claim, or internal-interpretability branding.

Partial span loss remains an explicit unresolved issue. Fabricated spans are
still discarded before color assignment, but exposing a partial drop requires a
new response warning or extraction-level retry contract. See
`docs/overclaim-audit.md`.

### Phase H — demo reliability

Render confirms the backend is a Free instance that sleeps after inactivity.
The measured cold health request took 122.29 seconds. The branch prewarms
concepts for all three demo sources sequentially in a background task, and
`docs/demo-operations.md` documents a pre-demo wake and judging-window ping.

A final normal-environment backend run exposed a native crash when the original
background task launched three shared-model `SentenceTransformer` encodes
concurrently during TestClient shutdown. Serializing the source warms removed
the crash. The full suite then passed 42/42 repeatedly, including without
thread-limiting environment overrides, and the prewarm regression test asserts
maximum concurrency remains one.

Ten fresh-tab production runs after wake all succeeded:

- Total range: 4.604–5.246 seconds
- Average total: 4.817 seconds
- Every run: five diagnostics, no alert, no console warning/error
- Runs over 10 seconds: zero

The protected branch preview initially failed its analysis request because
Render allowed only the production Vercel origin. Network evidence isolated the
failure to `PreflightMissingAllowOriginHeader`; the frontend had correctly baked
`https://explain-back.onrender.com` into the bundle. Render's comma-separated
origin allowlist now retains production and also permits the immutable
hardening preview plus its stable branch alias. The configuration rebuild kept
the existing live instance available, then passed health and explicit preflight
checks.

The checked-in correct demo then completed through the rendered preview in
4.335 seconds with HTTP 200, coverage, inline diagnostics, and a follow-up
question, with no alert.

For mobile verification, the same selected in-app browser used supported Chrome
DevTools device metrics at **390 × 844 CSS pixels**. The rendered page had a
390px scroll width, no horizontal overflow, 354px stacked result regions,
readable 14px/28px diagnostic text, and a keyboard-focusable 273px-wide
source-anchor/revision tooltip contained within the viewport. No mobile layout
change was necessary.

### Final gate hardening

The independent Luna High release audit found that the executable gate scripts
were weaker than the written merge contract even though earlier manual runs had
produced acceptable evidence. The scripts now enforce the contract directly:

- Original golden agreement cannot fall below 32/37.
- Expanded agreement cannot fall below 80%.
- Determinism runs the same analysis five times and requires all five exact
  `(start, end, state)` signatures to match.
- Every warm determinism run must finish below eight seconds.

Offline regression tests pin these constants and prove state or span drift
changes the determinism signature.

## Architectural invariants

- `backend/llm.py` remains the sole backend model-provider egress.
- Model-generated claim and source spans remain verbatim-or-discard.
- `backend/resolve.py` contains no model or network call.
- Malformed model output raises a visible 502 after bounded retries; it never
  becomes an empty all-grey analysis.
- Browser input/results remain in React state; the application does not persist
  submissions.

## Verification status

| Gate | Evidence | Status |
| --- | --- | --- |
| Backend tests and invariants | 42 passed in normal environment, including gate and prewarm regressions | Pass |
| Frontend tests | 4 passed | Pass |
| Frontend production build | Vite build completed | Pass |
| Python compilation | `compileall` completed | Pass |
| Original golden | Final paced run 35/37 (94.6%) | Pass |
| Expanded golden | Final paced run 44/55 (80.0%) | Pass |
| Determinism | Final run 5/5 state agreement (100%) | Pass |
| Warm analysis | Determinism run 3.072s; reverse-order repeat 2.824s; production average 4.817s | Pass |
| Desktop browser demo | 10/10 production; branch preview HTTP 200 in 4.335s with no alert | Pass |
| 390px rendered browser demo | 390 × 844, no horizontal overflow, readable diagnostics and focus tooltip | Pass |

A fresh post-mobile golden invocation was attempted, but the provider returned
HTTP 429 and the wrapper correctly surfaced a visible 502 instead of degrading
to grey. The last complete paced scores remain 35/37 original and 44/55
expanded at `87a78be`; changes after that evidence are limited to sequential
startup prewarming, its regression assertion, reports, and generated Graphify
artifacts. No extraction, verification, resolution, schema, prompt, threshold,
or golden-fixture file changed after the complete run.

## Post-run model experiment — reverted

Google's live model inventory confirmed the requested identifier as
`gemma-4-31b-it`, and an OpenAI-compatible smoke request returned valid JSON.
The full original 10-sample golden portion then scored **30/37 (81.1%)**,
below the required 32/37 floor. Warm analyses took 11.837–25.190 seconds,
also exceeding the eight-second contract. The expanded portion was stopped
after the original-set regression was already proven. The local model setting
was reverted to `gemini-3.1-flash-lite`; Render was not changed.

## Unresolved issues

- `02_reversed_stoich.txt` and `09_mixed_partial.txt` remain original golden
  misses.
- The expanded set exposes 11 additional proposition-boundary/state misses.
- A valid-length source/explanation swap can return a plausible-looking
  analysis; robust role detection would be a new semantic feature.
- Partial verbatim-validator drops are not surfaced to the learner.
- The rate limiter is per process, not distributed across future multi-instance
  deployments.
- Render Free sleep remains operationally mitigated, not eliminated.
- One expanded-golden reverse-order run logged an isolated 8.059s warm latency;
  the immediate same-case repeat was 2.824s and the deterministic warm run was
  3.072s.

## Files intentionally not changed

- `samples/golden.json` labels were not changed to chase model output. It was
  extended only with manually reviewed Phase D cases.
- `backend/resolve.py` remains model-free.
- No dependency, endpoint, account system, storage layer, or learner-facing
  feature was added.
