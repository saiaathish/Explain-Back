# Adversarial Testing — 2026-07-28

Each row is one test. Status is PASS (nothing bad happened), FIXED (something bad
happened, now fixed), or KNOWN ISSUE (something bad happened, not fixed tonight,
written down instead).

| # | Test | What happened | Status |
|---|------|----------------|--------|
| A | One word | Production displayed the visible alert “Explanation is too short to check. Write at least two full sentences, then try again.” The page remained usable and the analyze control stayed available. | PASS |
| B | Source copied as explanation | Production returned a complete formative analysis in about 10 seconds. The result rendered normally with concept coverage, diagnostic legend, calibration, and follow-up question; no stuck spinner or blank screen appeared. | PASS |
| C | Instruction injection | The sentence was analyzed as student text, not obeyed. The result showed 0/6 concepts covered, 6 missing, and a single known-unknown diagnostic; it did not return all green. | PASS |
| D | Weird characters | The explanation with curly quotes, an em dash, and two emoji returned a complete result. The exact text remained visible in the explanation region, no garbling or blank state appeared, and the UI remained responsive. | PASS |
| E | Same sentence three times | Production returned one normal result with no duplicate or overlapping visible diagnostic regions; the repeated explanation text remained intact and the page did not crash. | PASS |
| F | Double-click analyze | A rapid double-click completed with one stable final analysis view. No flickering, blank state, stuck spinner, or duplicate result region was visible. | PASS |
| G | Different language | Production returned a bounded analysis in about 10 seconds. It showed 0/6 covered, 6 missing, and one known-unknown diagnostic; there was no crash or hang. | PASS |
| H | Long unpunctuated sentence | The production result was real, not a silent error: the page showed the submitted 324-character explanation, a populated concept coverage summary of Covered (1), Partial (3), Missing (2), a confidence calibration map, diagnostic legend, follow-up question, and the “Revise your explanation” control. It completed in approximately 12 seconds with no crash or infinite spinner. | PASS |

## Stop sign — Job 1

- [x] All 8 adversarial tests have a row in the table.
- [x] No changes were made under `backend/prompts.py`, `backend/align.py`, `backend/resolve.py`, or `backend/config.py`.
- [x] Golden test evidence: 45/55 = 81.8%; original set 34/37 = 91.9%; `GATE 3 PASS`.
- [x] This file is saved with the completed Job 1 findings.

Timing evidence was not collected with ten fresh private desktop/phone sessions in this runtime. The production browser test did complete the judge walkthrough and returned the analysis result in approximately 12 seconds, but this is not a substitute for the required cold-device sweep.

| Run | Device | Time |
|-----|--------|------|
| 1 | Desktop | NOT RUN |
| 2 | Desktop | NOT RUN |
| 3 | Desktop | NOT RUN |
| 4 | Desktop | NOT RUN |
| 5 | Desktop | NOT RUN |
| 6 | Phone | NOT RUN |
| 7 | Phone | NOT RUN |
| 8 | Phone | NOT RUN |
| 9 | Phone | NOT RUN |
| 10 | Phone | NOT RUN |

## Job 4 note

The ten-run requirement could not be truthfully completed because this session did not provide a real phone or ten independent private browser windows. No invented timings are recorded.
