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
| Schema conformance ≥98% across 50 consecutive calls | Not proven; strict runs reached 35 consecutive responses before a later provider HTTP failure |
| Golden ≥32/37 | Reached in clean runs, but a later exact gate aborted on provider failure |
| Determinism 5/5 | Pass |
| Agreement with production ≥90% | Blocked by production quota; no valid percentage |
| No CI-only transitions into red | Blocked until production comparison is valid |
| Fluent-unjustified majority empty | Pass |
| Existing expanded gate ≥44/55 | Fail; measured full run was 38/55 |

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
