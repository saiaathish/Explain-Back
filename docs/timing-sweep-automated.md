# Automated browser timing sweep

Generated: 2026-07-29T14:25:54.434Z

Requested 20 runs per viewport (60 total), one fresh Playwright context per run, with 12000ms pacing before every run. The sweep produced exactly 60 unique `(project, run)` records; 59 passed and desktop run 6 timed out after 180 seconds. Percentiles below use available completed values and retain the timeout as an explicit failure.

## Execution note

This is a real production sweep, not a synthetic timing fixture. The Biology acceptance requires yellow and red on the intentionally flawed initial explanation; all completed runs satisfied that assertion and the revised path loaded `frontend/public/samples/demo_video_revised.txt`. Desktop run 6 timed out before emitting timing values; it is preserved as an explicit failed record rather than silently replaced.

## Runner status

- desktop-chrome: 1
- iphone-14: 0
- ipad: 0

## desktop-chrome (1280x800)

### Initial analysis

- Values: 19/20
- Failed/missing: 1
- Min / median / p95 / max: 0.830s / 0.990s / 2.989s / 7.719s
- Runs over 15 seconds: none

### Revise step

- Values: 19/20
- Failed/missing: 1
- Min / median / p95 / max: 0.197s / 0.309s / 3.022s / 21.822s
- Runs over 15 seconds: run 1 (21.822s)

| Run | Initial | Revise | Status | Errors |
| ---: | ---: | ---: | --- | --- |
| 1 | 7.719s | 21.822s | passed | — |
| 2 | 1.383s | 0.265s | passed | — |
| 3 | 1.852s | 0.843s | passed | — |
| 4 | 2.464s | 0.926s | passed | — |
| 5 | 2.347s | 0.389s | passed | — |
| 6 | n/a | n/a | timedOut | — |
| 7 | 0.847s | 0.225s | passed | — |
| 8 | 1.575s | 0.273s | passed | — |
| 9 | 0.990s | 0.312s | passed | — |
| 10 | 2.057s | 0.433s | passed | — |
| 11 | 0.938s | 0.197s | passed | — |
| 12 | 0.984s | 0.235s | passed | — |
| 13 | 2.357s | 0.933s | passed | — |
| 14 | 0.887s | 0.258s | passed | — |
| 15 | 0.905s | 0.329s | passed | — |
| 16 | 0.873s | 0.309s | passed | — |
| 17 | 1.026s | 0.227s | passed | — |
| 18 | 0.876s | 0.227s | passed | — |
| 19 | 0.830s | 0.220s | passed | — |
| 20 | 0.831s | 0.832s | passed | — |

## iphone-14 (390x844)

### Initial analysis

- Values: 20/20
- Failed/missing: 0
- Min / median / p95 / max: 0.814s / 0.839s / 2.161s / 7.931s
- Runs over 15 seconds: none

### Revise step

- Values: 20/20
- Failed/missing: 0
- Min / median / p95 / max: 0.211s / 0.220s / 0.866s / 1.345s
- Runs over 15 seconds: none

| Run | Initial | Revise | Status | Errors |
| ---: | ---: | ---: | --- | --- |
| 1 | 0.819s | 0.218s | passed | — |
| 2 | 0.826s | 0.226s | passed | — |
| 3 | 1.333s | 0.211s | passed | — |
| 4 | 0.835s | 0.220s | passed | — |
| 5 | 0.830s | 0.219s | passed | — |
| 6 | 0.821s | 0.214s | passed | — |
| 7 | 0.850s | 0.220s | passed | — |
| 8 | 7.931s | 0.835s | passed | — |
| 9 | 1.333s | 0.216s | passed | — |
| 10 | 0.820s | 0.225s | passed | — |
| 11 | 1.335s | 0.322s | passed | — |
| 12 | 0.814s | 0.227s | passed | — |
| 13 | 0.838s | 0.219s | passed | — |
| 14 | 0.829s | 0.225s | passed | — |
| 15 | 1.335s | 0.317s | passed | — |
| 16 | 0.837s | 0.219s | passed | — |
| 17 | 1.857s | 1.345s | passed | — |
| 18 | 1.327s | 0.213s | passed | — |
| 19 | 1.850s | 0.841s | passed | — |
| 20 | 0.839s | 0.215s | passed | — |

## ipad (768x1024)

### Initial analysis

- Values: 20/20
- Failed/missing: 0
- Min / median / p95 / max: 0.816s / 0.830s / 2.481s / 4.896s
- Runs over 15 seconds: none

### Revise step

- Values: 20/20
- Failed/missing: 0
- Min / median / p95 / max: 0.215s / 0.234s / 1.867s / 2.357s
- Runs over 15 seconds: none

| Run | Initial | Revise | Status | Errors |
| ---: | ---: | ---: | --- | --- |
| 1 | 0.839s | 0.224s | passed | — |
| 2 | 0.840s | 0.225s | passed | — |
| 3 | 1.346s | 0.222s | passed | — |
| 4 | 0.828s | 0.219s | passed | — |
| 5 | 0.829s | 0.337s | passed | — |
| 6 | 2.350s | 2.357s | passed | — |
| 7 | 0.818s | 0.244s | passed | — |
| 8 | 0.816s | 0.223s | passed | — |
| 9 | 0.827s | 0.223s | passed | — |
| 10 | 0.819s | 0.215s | passed | — |
| 11 | 0.830s | 0.221s | passed | — |
| 12 | 0.820s | 0.222s | passed | — |
| 13 | 1.334s | 0.323s | passed | — |
| 14 | 2.354s | 1.841s | passed | — |
| 15 | 1.331s | 0.833s | passed | — |
| 16 | 4.896s | 0.334s | passed | — |
| 17 | 2.352s | 0.839s | passed | — |
| 18 | 0.821s | 0.837s | passed | — |
| 19 | 0.823s | 0.839s | passed | — |
| 20 | 0.827s | 0.223s | passed | — |

## Failures

- desktop-chrome run 6: timedOut
