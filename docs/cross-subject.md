# Cross-subject evaluation

## Scope and method

This check asks whether the source-relative pipeline behaves coherently outside
the sodium-potassium pump domain. It is not part of the golden calibration set
and does not support an accuracy claim.

Evidence was collected on 2026-07-26 from branch `codex/hardening-run`, based
on `84c86e9`, using:

- Model: `gemini-3.1-flash-lite`
- Provider interface:
  `https://generativelanguage.googleapis.com/v1beta/openai`
- Embedding model: `BAAI/bge-small-en-v1.5`
- Thresholds: `T_HIGH=0.732`, `T_LOW=0.680`
- Runner: `PYTHONPATH=. .venv/bin/python scripts/run_cross_subject.py`

The checked-in corpus contains two three-paragraph source passages:

- `samples/source_supply_demand.txt`
- `samples/source_photosynthesis.txt`

Each source has one strong and one deliberately flawed explanation. None of
these files appears in `samples/golden.json`.

## Results

| Case | Source cache | Time | Concepts | Propositions | State counts | Span validity |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Supply/demand strong | cold | 7.21s | 8 | 11 | 7 yellow, 4 grey | all valid |
| Supply/demand flawed | warm | 3.24s | 8 | 6 | 2 red, 4 grey | all valid |
| Photosynthesis strong | cold | 6.64s | 6 | 17 | 1 green, 10 yellow, 6 grey | all valid |
| Photosynthesis flawed | warm | 4.03s | 6 | 9 | 2 red, 7 grey | all valid |

Dedicated cold-process repeats of the photosynthesis cases took 7.86 seconds
for the strong explanation and 6.16 seconds for the flawed explanation. Their
state counts were unchanged.

### Concept extraction

Concept extraction was structurally successful for both subjects. It returned
eight supply/demand concepts covering demand, supply, equilibrium, price
ceilings, shortages, taxes, quantity changes, and elasticity. It returned six
photosynthesis concepts covering light-dependent reactions, water and oxygen,
ATP/NADPH, the overall equation, carbon fixation, and the Calvin cycle.

No source-anchor or malformed-output error surfaced. The concept sets were
broad enough to give every photosynthesis concept at least partial coverage.
The supply/demand runs left some concepts missing because no final flag aligned
strongly enough to them, not because the analysis failed to return.

### Alignment and state assignment

The pipeline distinguished some flawed claims, but performance degraded
noticeably relative to the membrane-transport calibration:

- The completely correct supply/demand explanation produced no green flags.
  Seven claims were yellow and four were grey.
- The correct photosynthesis explanation produced one green flag, with the
  other sixteen claims split between yellow and grey.
- Each flawed explanation produced two red flags, but most other explicit
  errors remained grey.
- Every returned span was within bounds and mapped back to the submitted
  explanation. No fabrication passed the verbatim validator.

This pattern points to calibration and justification-recognition limits rather
than a broken cross-domain execution path. The generic concept and
verification prompts transfer, but the embedding thresholds and resolver
specificity heuristics were calibrated on membrane transport. The
misconception dictionary is also intentionally sodium-pump-specific, so red
flags in these subjects do not receive domain-specific misconception
refutations.

## Conclusion

Explain-Back can structurally analyze these two additional subjects: it
extracts concepts, returns verbatim diagnostic spans, aligns them, assigns all
four possible states where warranted, and stays within the local warm-analysis
gate. That is narrower than proving it works accurately on any subject.

The evidence does not justify an any-subject quality claim. Outside the
calibrated membrane-transport domain, correct explanations were substantially
under-promoted to green and many incorrect claims remained grey. Cross-subject
results should therefore be described as uncalibrated and model-assisted, with
the checked-in cases serving as exploratory evidence rather than a regression
score.
