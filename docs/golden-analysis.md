# Golden miss analysis

## Baseline and method

The live baseline on 2026-07-26 was **32/37 (86.5%)** on the original
10-sample golden set. The full unit suite passed (38 tests), determinism was
5/5, and the warm analysis runs stayed below eight seconds.

`tests/diagnose_misses.py` ran each of the five failing samples five times
through the real analysis pipeline. It intercepted the raw Call B JSON before
`locate_spans`, then recorded the located propositions and final states. The
five runs for every sample produced one unique raw Call B structure and one
unique state pattern. All five misses are therefore deterministic prompt or
validation-shape problems, not sampling variance.

## Class 1: propositions that receive no matching diagnostic

### `01_fluent_unjustified.txt`

Expected:

> It uses ATP and changes shape during the transport cycle.

Observed in all 5 runs:

- Call B split the sentence into `It uses ATP` and
  `It changes shape during the transport cycle.`
- `It uses ATP` was verbatim and survived.
- `It changes shape during the transport cycle.` was not verbatim: the student
  wrote `and changes shape during the transport cycle.` Call B invented the
  subject `It`, so `locate_spans` correctly discarded that proposition.
- The surviving short proposition covers less than half of the hand-labeled
  span, so the golden matcher reports the expected item as missing.

Classification: **verbatim-copy failure after over-splitting a coordinated
sentence**. The scientific content is partly diagnosed, but the mechanism
clause is silently lost at the validator boundary.

### `02_reversed_stoich.txt`

Expected:

> more positive potassium charge enters than sodium charge leaves

Observed in all 5 runs:

- Call B returned the claim
  `This transport helps establish the membrane potential`.
- It attached
  `because more positive potassium charge enters than sodium charge leaves`
  only as that claim's justification.
- It never emitted the independently falsifiable charge-direction statement as
  its own proposition.
- `locate_spans` preserved the justification exactly; nothing was discarded.

Classification: **under-segmentation**. A factual mechanism clause is treated
only as evidence for its parent claim, so its contradiction never receives its
own red diagnostic.

### `09_mixed_partial.txt`

Expected:

> ATP matters because phosphorylation changes the protein's shape.

Observed in all 5 runs:

- Call B returned `ATP matters` as the claim.
- It copied
  `because phosphorylation changes the protein's shape` exactly as a
  justification.
- Both spans survived `locate_spans`.
- The diagnostic underline covers only the generic 11-character head claim,
  not the mechanism-heavy sentence represented by the golden item. It therefore
  fails the golden match threshold and leaves the mechanism itself without an
  independently visible state.

Classification: **mechanism hidden inside a generic head claim**. This is not a
substring-validation failure; the proposition boundary is too narrow.

## Class 2: valid justification is never selected

### `06_correct.txt`

Expected green claim:

> The pump exports three sodium ions and imports two potassium ions per cycle.

Observed in all 5 runs:

- The claim was extracted verbatim.
- Raw Call B returned an empty `justification_spans` array.
- The located proposition also had no justification, so no span was discarded.
- The following student sentence explains the electrical consequence using
  `three positive charges leave while only two positive charges enter`, but
  Call B did not attach that non-adjacent consequence to the stoichiometry
  claim.
- The deterministic resolver therefore returned yellow.

Classification: **justification-recognition failure in Call B**, specifically a
missed non-adjacent causal consequence.

### `10_mixed_justification.txt`

Expected green claim:

> The pump moves three sodium ions out and two potassium ions in.

Observed in all 5 runs:

- The claim was extracted verbatim.
- Raw and located justification arrays were both empty.
- The later student clause
  `because one more positive charge leaves than enters` explains a consequence
  of the stated 3:2 movement, but Call B did not connect it back to the first
  claim.
- The deterministic resolver therefore returned yellow.

Classification: **justification-recognition failure in Call B**, again a missed
non-adjacent causal consequence.

## Fix implications

The evidence supports three narrow prompt changes:

1. Require a final sentence-coverage check and forbid inventing a replacement
   subject when splitting a coordinated sentence.
2. Add an example where an independently checkable mechanism clause is emitted
   as its own proposition even when it also justifies another claim, plus an
   example where a generic head and its core mechanism remain one diagnostic
   proposition.
3. Add a non-adjacent consequence example so Call B connects later
   student-written causal evidence to an earlier quantitative claim.

Raising sampling randomness would not address these failures. Raising Call B's
reasoning budget can be tested separately, but the current evidence points
first to deterministic prompt coverage and boundary rules.

## Phase B experiment: reverted

The first extraction-recall prompt experiment added a sentence/clause coverage
self-check and two targeted examples. It was reverted in full after the gate:

- Golden agreement remained **32/37 (86.5%)**, so it did not improve the
  baseline.
- The original `01` and `09` misses were corrected, and `02` gained a visible
  diagnostic, but that diagnostic was grey rather than the expected red.
- New misses appeared in `03_passive_conflation.txt` and
  `08_mixed_wrong_direction.txt`.
- Total propositions increased from **38 to 48 (+26.3%)**, exceeding the
  maximum allowed 15% growth and visibly over-splitting several samples.

The broad "every checkable clause" instruction was therefore too aggressive.
No part of that prompt change was retained.

## Phase C result: retained

A narrower prompt change taught Call B to recognize a later, explicitly
quantitative consequence as justification for an earlier ratio or direction
claim. Two examples distinguish this evidence from a general statement that a
result is merely important.

Gate C passed:

- Golden agreement improved from **32/37 (86.5%)** to
  **35/37 (94.6%)**.
- `06_correct.txt` changed from 4/5 green to 5/5 green.
- `10_mixed_justification.txt` changed from 3/4 matching to 4/4 matching.
- `01_fluent_unjustified.txt` remained 4/4 yellow, preserving the core
  justified-versus-restated distinction.
- Total propositions increased from 38 to 39 (+2.6%).
- Unit tests remained 38/38, determinism remained 5/5, and warm analysis
  remained below eight seconds.

The two remaining original misses are the deterministic extraction boundaries
in `02_reversed_stoich.txt` and `09_mixed_partial.txt`.

## Phase D expanded baseline

Five hand-labeled explanations were added for the required new cases: a
two-sentence explanation, a correct claim with an incorrect mechanism, heavy
hedging plus a specific error, reverse source order, and poor grammar with
correct content. A separate Luna High review corrected two labels before the
live run: sample `13` was split into two independently hedged spans, and sample
`14`'s potassium-binding order was labeled yellow while its complete causal
sentence remained the expected span.

The live 15-sample run produced:

- Original 10-sample agreement: **35/37 (94.6%)**.
- Expanded 15-sample agreement: **44/55 (80.0%)**.
- Original regressions: none relative to the retained Phase C result.
- Remaining original misses: `02_reversed_stoich.txt` and
  `09_mixed_partial.txt`.

The 11 expanded-set misses are preserved as new regression evidence. They are
not grounds to relabel `samples/golden.json` or broaden the prompt without a
separate, general defect analysis. In particular, the reverse-order and
poor-grammar cases expose proposition-boundary and state-assignment limits that
the original sodium-pump set did not measure.
