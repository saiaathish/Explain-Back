# Overclaim and silent-failure audit

## Method

A Luna High agent reviewed README copy, learner-facing UI, comments, and silent
failure paths as a skeptical learning-sciences judge. The review was
report-only. This document records the findings accepted, rejected, or left as
explicit limitations.

## Applied

1. **State labels describe evidence, not cognition.**
   Cognition-implying labels were replaced with `supported and justified` and
   `supported, not justified`. A source-relative model verdict cannot establish
   what a learner understands or memorized.

2. **Storage wording is scoped to this application.**
   The footer now says Explain-Back does not persist submissions. The README
   also states that inputs are sent to the configured model provider and that
   provider policy governs its handling. This replaces the absolute
   `Nothing you type is stored` claim.

3. **The README no longer promises a semantically verified weakest point.**
   The follow-up is described as generated from analyzed gaps. The current
   validator enforces response shape, not whether the selected gap is truly the
   weakest.

4. **The uncited numerical learning-science claim was removed from product
   documentation.** The README now says self-explanation is studied and
   immediately distinguishes that literature from validation of Explain-Back.

5. **Logical model stages are distinguished from outbound attempts.**
   The architecture section now says there are normally two or three logical
   stages and that malformed responses can make each stage attempt up to three
   calls.

6. **Comments distinguish prompts from enforcement.**
   `prompts.py` calls its strings templates and identifies parsers and
   validators as the binding layer. `llm.py` identifies itself specifically as
   the sole backend network boundary to the configured model provider.

7. **Cross-subject limits are explicit.**
   The README records that supply/demand and photosynthesis executed
   structurally but remained uncalibrated, with correct claims frequently
   yellow/grey and errors frequently grey.

## Already compliant

- The README states that Explain-Back itself has not been validated as a
  learning intervention.
- The golden set is described as hand-labeled development agreement, not a
  general performance metric.
- Embedding thresholds are described as locally calibrated.
- No product text claims attribution over model internals.
- Exact source anchors are described as evidence used by a flag, not model
  attribution.

## Rejected or deferred

### Make every partially discarded model response visible

`locate_spans` intentionally enforces verbatim-or-discard. If one proposition
contains an invented span while others are valid, the invalid item is dropped
and the valid items continue. This can make a missed diagnostic
indistinguishable from approval.

The finding is valid, but it was not changed in this run. Making partial loss
visible requires either a new response warning, a new learner-facing surface,
or retrying the whole extraction when any item is discarded. Those options
change the API contract or the pipeline's availability behavior and require a
separate design and golden calibration. The current invariant—fabricated text
never reaches a color—remains safer than retaining invalid spans.

### Add semantic validation for the follow-up question

The wording overclaim was fixed. A new semantic judge for whether the question
targets the objectively weakest gap would add another model call or a new
heuristic and is outside this hardening run.

## Follow-up applied

### Align the historical blueprint

`explain-back-blueprint.md` remains the supplied design source, but stale pitch
copy now follows the same evidence boundaries as the shipped UI and README.
Unsupported numerical learning claims, cognition labels, universal-subject
performance language, and internal-interpretability branding were removed or
rewritten. The blueprint now states that cross-subject quality is uncalibrated
and that thresholds were calibrated locally.
