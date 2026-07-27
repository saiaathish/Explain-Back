# Dual-model CI outcome

## Decision

Explain-Back now has a centralized production/CI model registry, but Gemma is
not accepted as the authoritative full-golden replacement yet.

Selected fallback outcome:

> Keep the split infrastructure. Use Gemma for smoke, schema, determinism, and
> prompt-iteration evidence. Keep the authoritative full golden on the
> production role, paced or scheduled rather than run on every change.

Gemma is not deployed to production. `LLM_ROLE=prod` remains the Render setting,
and `/api/analyze` has no role or model parameter.

## Architecture

- `backend/llm.py` remains the sole provider egress.
- Model resolution occurs once, by semantic role and call label.
- Production uses `LLM_MODEL_PROD`, with legacy `LLM_MODEL` fallback.
- CI uses `LLM_MODEL_CI`, with optional A/B/C overrides for experiments.
- A, B, and C callers pass only their semantic call labels.
- Every successful response logs configured and provider-returned model names.
- Failed HTTP responses log status, role, call, and model without prompt or
  response content.
- Each role/call pair has explicit temperature, reasoning, and schema settings.
- The production request body remains the legacy four-field shape; tests assert
  exact equality and absence of `response_format`.
- CI comparison configurations run in fresh subprocesses so the global concept
  cache cannot leak Call A output between roles.

## Measurements and retained tuning

| Step | Original | Expanded | Decision |
| --- | ---: | ---: | --- |
| Untuned Gemma | 30/37 | 38/55 | Baseline |
| Native JSON Schema | 31/37 | 40/55 in measured run | Keep |
| Temperature zero | Already zero | Already zero | No change |
| Three cross-domain B examples | 32/37 | Not independently accepted | Keep |
| C completeness/hedging example | Fixed 2/2 targeted pipeline failures | Semantic score still low | Keep |
| Dynamic C ID/count schema | 3/3 targeted hedged sample | Later full run hit provider HTTP failure | Keep as constrained decoding |
| CI C follow-up schema (`How`/`Why`, one `?`) | `14_reverse_order.txt` failed 3/3 before the constraint | First constrained attempt completed with 6/6 flags | Keep |
| Split B into B1/B2 | Not attempted | — | Avoided; 32/37 floor was reached |

The B examples cover:

1. a fluent claim with an empty justification array;
2. a justification several sentences after its claim;
3. counted evidence that justifies a total.

They use history, thermal expansion, and arithmetic rather than membrane
transport. They are appended only for the CI role, so production prompt bytes
remain unchanged.

## Current evidence

### Passing evidence

- Original golden floor reached: 32/37 in a clean ten-sample run.
- Determinism: 5/5 exact `(start, end, state)` signatures.
- Native structured output: 30/30 direct, parseable, schema-valid A/B/C
  responses in the ten-analysis schema run.
- Another complete-fixture run produced 35/35 strict schema-valid provider
  responses.
- Fluent-unjustified sample: 4/4 extracted propositions had empty justification
  arrays in the 32/37 run.
- Targeted C retest: `14_reverse_order.txt` and
  `15_poor_grammar_correct.txt` both completed on first-attempt contract-valid
  responses.
- Unit/invariant suite: 55 passed.

### Unmet acceptance criteria

| Criterion | Status |
| --- | --- |
| Schema/reliability ≥98% across 50 consecutive calls | Fail: 48/50 end-to-end because two provider HTTP 503s required retry; all 51 successful responses were direct, schema-valid, and contract-valid |
| Golden ≥32/37 | Fail in the paced full-fixture release run: 29/37 |
| Determinism 5/5 | Pass |
| Agreement with production ≥90% | Blocked by production quota; no valid percentage |
| No CI-only transitions into red | Blocked until production comparison is valid |
| Fluent-unjustified majority empty | Pass |
| Existing expanded gate ≥44/55 | Fail; paced full-fixture release run was 37/55 before the targeted C repair |

Because production agreement and the expanded gate are not satisfied, the
32/37 result is not enough to make Gemma an authoritative proxy.

## Quota effect

A normal 15-sample golden requires about 31 successful provider requests with a
warm concept cache: one A, fifteen B, and fifteen C, plus any retries.

Before the split, every hardening iteration spent those requests on the
production model. With the selected fallback:

- a ten-sample Gemma smoke/golden comparison used 21 CI-model responses;
- the production model spends zero requests on per-change Gemma smoke checks;
- the authoritative production golden still costs about 31 requests and should
  run on a paced daily/release schedule.

This is partial quota relief, not the full relief that a validated Gemma proxy
would provide.

## Production status

- Production branch/SHA remains `main` at `84c86e9`.
- Render backend health returned HTTP 200 on 2026-07-27.
- No branch build was deployed or merged as part of this subgoal.
- The production golden and byte-level response equivalence remain unproven on
  the current branch because the production provider quota blocked live calls.
  The exact outbound production request shape is covered by regression tests.

## Release completion run — 2026-07-27

The first live matrix was invalidated by two independent provider limits:

- production `gemini-3.1-flash-lite` returned HTTP 429 for the
  `GenerateRequestsPerDayPerProjectPerModel-FreeTier` quota (500 requests);
- an unpaced Gemma replay also produced transient HTTP 429 responses.

`tests/model_compare.py` now accepts `--pace-seconds`. Pacing is confined to
the live evaluation harness and does not change production requests or
runtime latency.

With a 10-second post-response interval, Gemma produced:

- original golden: 29/37;
- expanded golden: 37/55;
- Call B: 15/15 direct JSON, schema-valid, and contract-valid;
- zero HTTP 429 responses;
- one Call C pipeline failure on `14_reverse_order.txt`.

That Call C failure was not an ID problem: all six expected IDs were returned
exactly once on all three attempts. The model returned an empty `follow_up`.
The retained CI-only JSON Schema constraint requires a non-empty question
beginning with `How` or `Why` and ending in exactly one `?`. The targeted
fixture then completed on its first attempt with six flags.

The fresh-cache reliability run exercised 17 complete analyses (53 provider
attempts). Two Call A attempts returned HTTP 503, so the first 50 attempts were
48/50 end-to-end successful (96%), below the 98% release threshold. Retries
recovered every analysis; all 51 successful responses were direct JSON,
schema-valid, and contract-valid.

**Final role decision:** safe fallback. Gemma remains a smoke, schema, and
prompt-iteration model. It is not an authoritative production proxy and is
not eligible for production deployment. Production remains
`gemini-3.1-flash-lite`.

## Next acceptance run

After production quota resets:

1. run the comparison harness with `--confirm-live-matrix` to execute
   production, all-CI, A-only, B-only, and C-only configurations in fresh
   subprocesses;
2. produce the offset-matched state confusion matrix;
3. require ≥90% agreement and zero CI-only red transitions;
4. run 50 consecutive CI provider calls with paced intervals;
5. run the unchanged production golden once;
6. keep Gemma smoke-only unless every criterion passes.
