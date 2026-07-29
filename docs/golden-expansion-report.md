# Golden expansion report

## Current checked-in evidence

The branch starts with the existing 15 explanation fixtures and 55 independently labeled propositions in `samples/golden.json`. The checked-in hardening evidence reports **35/37 (94.6%)** on the original sodium-pump set and **44/55 (80.0%)** on the expanded set. No existing labels were changed during this overnight task.

## Morning discrepancy gate

The expanded gate was rerun three times with the production model configuration (`GOLDEN_LLM_ROLE=prod`, `LLM_ROLE=prod`, `GATE_SAMPLE_INTERVAL_SECONDS=25`) and a 25-second pause between complete invocations. Each run reported the same result:

| Gate | Expanded score | Original score | Result |
| --- | ---: | ---: | --- |
| 1 | 45/55 (81.8%) | 34/37 (91.9%) | PASS |
| 2 | 45/55 (81.8%) | 34/37 (91.9%) | PASS |
| 3 | 45/55 (81.8%) | 34/37 (91.9%) | PASS |

The previously cited 44/55 and 45/55 values are therefore not a current provider boundary fluctuation in this three-run sample: the fresh production range is **45/55–45/55**. The 44/55 historical value remains unverified by these runs and is retained only as historical evidence. No pipeline, fixture, prompt, alignment, resolver, or configuration file was changed to obtain this result.



The requested expansion calls for ten new source passages across biology, economics, chemistry, and physics, with three explanations per source. The current executable golden gate cannot safely consume that corpus as-is: `scripts/run_golden.py` loads `samples/source_sodium_pump.txt` once and analyzes every key in `samples/golden.json` against that one source. Appending economics, chemistry, or physics explanations would therefore compare them with the wrong source and produce a misleading score. The structural fixture test also hard-codes the current 15-key count.

The existing supply/demand and photosynthesis pairs were intentionally kept outside `golden.json`. `docs/cross-subject.md` records them as exploratory structural checks, not calibrated accuracy evidence. Their outputs show why that distinction matters: strong supply/demand and photosynthesis explanations were mostly yellow or grey rather than reliably green, while flawed explanations produced some red flags but also grey uncertainty.

Per the overnight safety decision, this task did **not** modify `samples/golden.json`, `scripts/run_golden.py`, thresholds, prompts, extraction, alignment, resolution, or configuration. No model output was copied into labels, and no pipeline behavior was adjusted to improve a score. The 150+ fixture target is therefore intentionally incomplete rather than falsely reported as achieved.

## Safe next step for a future fixture expansion

A future expansion should first add a source-aware, test-only evaluation harness that pairs each explanation with its own source and keeps the existing sodium-pump gate separate. It should preserve independently reviewed labels, report per-subject and aggregate scores, retain the original 35/37 regression floor, and avoid changing production modules. Only after that harness exists should new fixtures be appended and run through the live pipeline.

## Status

- Existing fixture count: 15 explanation files / 55 labeled propositions.
- New fixtures added: 0.
- Fresh morning gate range: 45/55–45/55 (81.8%–81.8%).
- Fresh gate classification: stable 45/55; the historical 44/55 value was not reproduced.
- Existing historical evidence retained: 35/37 original and 44/55 expanded.
- Forbidden runtime files changed: none.
