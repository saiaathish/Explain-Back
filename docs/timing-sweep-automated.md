# Automated browser timing sweep

Generated: 2026-07-29T12:17:22.202Z

The sweep requested 1 runs per viewport (3 total). Each run used a fresh Playwright browser context and measured from submit to the requested rendered state. A 0ms inter-run delay was used to avoid bypassing the application's rolling request limit.

## Runner status

- desktop-chrome: Playwright exit 1
- iphone-14: Playwright exit 1
- ipad: Playwright exit 1

## desktop-chrome (1280x800)

### Initial analysis

- Successful timing values: 2/2
- Failed or missing timing values: 0
- Min / median / p95 / max: 0.305s / 0.307s / 0.309s / 0.309s

Runs over 15 seconds: none

### Revise step

- Successful timing values: 2/2
- Failed or missing timing values: 0
- Min / median / p95 / max: 3.891s / 4.126s / 4.338s / 4.361s

Runs over 15 seconds: none

### Run outcomes

| Run | Initial | Revise | Status | Errors |
| ---: | ---: | ---: | --- | --- |
| 1 | 0.309s | 4.361s | failed | initial green: no visible diagnostic span |
| 1 | 0.305s | 3.891s | failed | initial green: no visible diagnostic span |

## iphone-14 (390x664)

### Initial analysis

- Successful timing values: 1/1
- Failed or missing timing values: 0
- Min / median / p95 / max: 0.198s / 0.198s / 0.198s / 0.198s

Runs over 15 seconds: none

### Revise step

- Successful timing values: 1/1
- Failed or missing timing values: 0
- Min / median / p95 / max: 0.101s / 0.101s / 0.101s / 0.101s

Runs over 15 seconds: none

### Run outcomes

| Run | Initial | Revise | Status | Errors |
| ---: | ---: | ---: | --- | --- |
| 1 | 0.198s | 0.101s | failed | initial green: no visible diagnostic span |

## ipad (768x1024)

### Initial analysis

- Successful timing values: 1/1
- Failed or missing timing values: 0
- Min / median / p95 / max: 0.204s / 0.204s / 0.204s / 0.204s

Runs over 15 seconds: none

### Revise step

- Successful timing values: 1/1
- Failed or missing timing values: 0
- Min / median / p95 / max: 0.098s / 0.098s / 0.098s / 0.098s

Runs over 15 seconds: none

### Run outcomes

| Run | Initial | Revise | Status | Errors |
| ---: | ---: | ---: | --- | --- |
| 1 | 0.204s | 0.098s | failed | initial green: no visible diagnostic span |

## Assertion failures

- desktop-chrome run 1: initial green: no visible diagnostic span
- desktop-chrome run 1: initial green: no visible diagnostic span
- ipad run 1: initial green: no visible diagnostic span
- iphone-14 run 1: initial green: no visible diagnostic span

