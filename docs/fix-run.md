# Pre-submission fix run

Date: 2026-07-28 (second pass; supersedes the interrupted first pass)

Live production SHA: `a158827` on `main`, deployed to Vercel
(`explain-back.vercel.app`) and Render (`explain-back.onrender.com`).

## Batch outcomes

**Batch 0 — production alive.** `GET https://explain-back.onrender.com/api/health`
returned 200 in 0.25s; the Vercel frontend returned 200. The frontend completed
one analysis end to end in a browser against the Render backend. Free-tier sleep
is real: one health probe immediately after a redeploy took 61.4s, and every
subsequent probe was 0.10–0.20s.

**Batch 1 — whitespace matching.** `find_normalized` was already in
`backend/extract.py` and already used at all three span sites (concept anchors,
claim spans, justification spans), with `(-1, -1)` still discarding the span.
Added the missing acceptance fixture `samples/source_sodium_pump_wrapped.txt`
(hard-wrapped at 72 columns) and ran both sources through the pipeline:

| Source | Concepts | Flags | Anchors re-slice verbatim |
| --- | ---: | --- | --- |
| `source_sodium_pump.txt` | 6 | 5 green | yes |
| `source_sodium_pump_wrapped.txt` | 6 | 5 green | yes |

**Batch 2 — error messages and cross-subject.** No subagents were needed; both
halves were already in the tree and were verified rather than rebuilt.

All eight required error states were triggered and their messages captured from
the running app (client validation via the exported `validate`, server states
via stubbed responses through `frontend/src/api.js`):

| Condition | Message |
| --- | --- |
| Source too short | Source is too short to identify concepts. Paste 2–3 paragraphs, then try again. |
| Explanation too short | Explanation is too short to check. Write at least two full sentences, then try again. |
| Source too long | Source exceeds the 6,000-character limit. Shorten it to 2–3 paragraphs, then try again. |
| Explanation too long | Explanation exceeds the 4,000-character limit. Shorten it to a few paragraphs, then try again. |
| No concepts extracted | No teachable concepts could be pulled out of this source. Paste 2–3 paragraphs of explanatory prose rather than notes or headings, then try again. |
| No propositions extracted | The explanation could not be split into checkable claims. Rewrite it as full sentences, one idea each, then try again. |
| Backend unreachable | The analysis service could not be reached. Check your connection, then try again. |
| Request timeout | The analysis request timed out. Try again with the same text. |
| Rate limited | Too many analyses were submitted. Wait briefly, then try again. |

Two of those were not actionable before this run: the 422 and 502 responses were
surfaced verbatim, so the UI still showed the backend's "Could not identify
source concepts. Try a clearer passage." Both are now mapped in the client
(`4cf8e3b`); no backend file was touched.

Cross-subject was rerun live on the current code with the production model and
reproduced the checked-in report:

| Case | Time | Propositions | States |
| --- | ---: | ---: | --- |
| Supply/demand strong | 6.93s | 11 | 8 yellow, 3 grey |
| Supply/demand flawed | 3.44s | 6 | 2 red, 4 grey |
| Photosynthesis strong | 6.31s | 17 | 1 green, 11 yellow, 5 grey |
| Photosynthesis flawed | 4.16s | 9 | 2 red, 7 grey |

No invalid spans in any case. Verdict, unchanged from `docs/cross-subject.md`:
the pipeline transfers outside membrane transport without code changes, but it
is markedly more conservative there — strong explanations land yellow rather
than green because justification links are rarely credited, and flawed
explanations resolve mostly grey with only the sharpest contradictions reaching
red. That is a recall cost, not a false-positive problem.

**Batch 3 — sample loader and demo swap.** `samples/demo_video.txt` (reversed
stoichiometry), the `Load example` button, the Vercel-served copies under
`frontend/public/samples/`, and the demo-pair prewarm were already present.
Verified visually in a browser, local and production: one click loads both
texts, one click analyzes, and the result is 3 yellow / 1 red / 1 grey. Hovering
(or tapping) the red span shows the exact source anchor, the named
misconception "Reversed pump stoichiometry", the refutation, and a revision
hint, followed by a follow-up question.

**Batch 4 — latency.** The full-result SHA-256 cache, demo prewarm, parallel
A/B extraction, removal of the outer verification retry, and the 10s HTTP
timeout were already in place. Measured through the API:

| Path | Time |
| --- | ---: |
| Demo pair, warm cache hit (local) | 0.014s, then 0.001s |
| Novel explanation, cold (local) | 2.13s |
| Novel explanation, cold (production, 3 variants) | 2.19s / 2.29s / 2.24s |

Both acceptance limits hold (warm under 2s, novel under 15s).

**Batch 5 — final verification.**

- Golden regression, production role: **34/37 original (91.9%)**, **45/55
  expanded (81.8%)**, GATE 3 PASS. All four states observed. `samples/golden.json`
  was not modified. Pacing was needed (`GATE_SAMPLE_INTERVAL_SECONDS=25`); an
  unpaced run hit provider HTTP 429 on call C at case 5.
- Determinism: **5/5**. Run with `_result_cache` and `_concept_cache` cleared
  before every run, so all five were genuine cold analyses (3.26–4.22s), not
  cache replays. Identical flag signatures across all five.
- Tests: backend 63 passed; frontend 4 passed; frontend build passes.
- Production demo runs: ten consecutive demo submissions from the deployed page
  against the deployed backend, wall clock per run: 0.106, 0.100, 0.098, 0.098,
  0.113, 0.107, 0.090, 0.098, 0.101, 0.094 s — all identical output (3 yellow,
  1 red, 1 grey), red misconception named, follow-up present. Three additional
  full-UI runs (page state, Load example, analyze, tap the red flag, read the
  follow-up) took 1.00s, 1.68s, and 2.46s. One scripted UI run recorded 26.0s;
  its own `/api/analyze` resource timing for that run was 0.06s, so the number
  is browser background-tab timer throttling in the automation, not server
  latency. No console errors on any run.
- Mobile: at 390×844 on production the page has no horizontal scroll and the
  feedback card is fully readable. This needed a fix — the card was positioned
  inline, so a highlight starting mid-line pushed it off the right edge and
  clipped the anchor text. Below 720px it is now pinned to the bottom of the
  viewport (`0e2a718`), measured at left 12 / right 378 in a 390px viewport.
  A tap also opens and closes the card (`a158827`); hover alone left it
  unreachable on touch.
- PDF paste: generated a justified PDF from the sodium-pump source with
  ReportLab, extracted the text with pypdf (real extraction line breaks, no
  hand-authored wrapping), and analyzed it. 6 concepts, all six anchors
  re-slicing verbatim from the pasted text with embedded newlines inside them,
  3.29s. Batch 1's fix holds against real extraction output.

## Regression evidence

| Metric | Baseline | This run |
| --- | --- | --- |
| Original golden | 32/37 | 34/37 |
| Expanded golden | 0.80 | 0.818 |
| Determinism | 5/5 | 5/5 (caches cleared) |
| Backend tests | 63 | 63 passed |
| Frontend tests | 4 | 4 passed |

No batch dropped the golden score, so nothing was reverted.

## Not fixed, and why

- The blame-shifting 422 wording still exists in `backend/main.py`. Batch 2
  forbade backend edits, so it is masked in the client instead. The backend text
  should be rewritten in a later run.
- `find_normalized` does not repair hyphenated word breaks (`sodium-\npotassium`
  split mid-word by a PDF's line breaker). Whitespace runs are normalized;
  a hyphen plus newline inside a word is not. Such a span is discarded rather
  than mislocated, which is the safe failure, but the concept is lost.
- The ten production timings are cache hits by construction: the demo pair is
  prewarmed and the result cache is in-process. A judge who edits the example
  text takes the cold path (~2.2s measured on production), and a Render
  free-tier cold start adds up to ~60s on the first request after idle. Nothing
  in this run removes that first-hit penalty.
- The 26.0s scripted UI run was explained (background-tab throttling) rather
  than re-measured under a foregrounded browser.
- `resolve.py` was not touched, per the run rules.
