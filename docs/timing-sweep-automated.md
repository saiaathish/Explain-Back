# Automated browser timing sweep

## Execution status

The approved 60-run sweep was **not completed**. A validation run was attempted with one run per viewport (3 requested runs) before any 20× sweep. All three viewport runs reached the production result and revise states, but failed the required initial assertion because the Biology preset's initial result contained no green diagnostic span. The revised result contained five green spans and the diff strip wording passed. The report retains the failed assertions and timing values; no failure was dropped from the record.

The JSON currently contains 7 raw records from interrupted/validation attempts rather than a valid 60-run dataset. It must not be interpreted as a production percentile baseline.

## Validation-run summary

| Viewport | Initial analysis min / median / p95 / max | Revise min / median / p95 / max | Result |
| --- | --- | --- | --- |
| Desktop Chrome (1280×800) | 0.204s / 0.307s / 0.309s / 0.309s | 3.891s / 4.126s / 4.338s / 4.361s | Failed initial green assertion; revise wording passed |
| iPhone 14 (390×844) | 0.198s | 0.101s | Failed initial green assertion; revise wording passed |
| iPad (768×1024) | 0.204s | 0.098s | Failed initial green assertion; revise wording passed |

The desktop values include two validation attempts; the mobile values include one completed record each. These values are diagnostic evidence only, not the requested 20-run statistics.

## Assertion failure

Every completed Biology run observed:

- Initial: `green=0`, `yellow=3`, `red=1`, `grey=1`.
- Revised: `green=5`, `yellow=0`, `red=0`, `grey=0`.
- Diff strip: contained the required `gap closed`/`coverage` wording.

The missing initial green span is a real failure of the requested acceptance criterion, not a test relaxation. The checked-in Biology initial explanation is intentionally flawed, and the test records that it does not satisfy the “at least one green” assertion.

## Why the full sweep stopped

The run was stopped after the validation failures rather than issuing 60 repeated model-backed requests against a known failing assertion. The 20-per-minute application limiter and the production service's external capacity make repeating a deterministic acceptance failure wasteful. No timing number from this document should be presented as a completed 60-run result.

Raw records, assertion messages, statuses, and counts are in `docs/timing-sweep-automated.json`. The Playwright test remains runnable with:

```bash
cd frontend
npx playwright test e2e/demo-path.pw.js --workers=1
```
