# Demo-path operations

## Render sleep and prewarm

The Render dashboard confirms that the backend uses a **Free** instance and
states:

> Your free instance will spin down with inactivity, which can delay requests
> by 50 seconds or more.

An actual cold `GET /api/health` on 2026-07-26 took **122.29 seconds** before
returning 200. The Vercel frontend remained available and returned 200 in
0.17 seconds.

The branch starts concept-cache prewarming in the background, one source at a
time, for all checked-in demo sources:

- `source_sodium_pump.txt`
- `source_supply_demand.txt`
- `source_photosynthesis.txt`

Health remains non-blocking while those calls run.

Sequential warming matters because the embedding model is shared. A final
normal-environment test run exposed a native crash when all three
`SentenceTransformer` encodes ran concurrently during TestClient shutdown.
Serializing the three background warms eliminated the crash; the full backend
suite passed 42/42 in the normal environment, and a
regression assertion now caps prewarm concurrency at one.

### Judging-window workaround

Wake the backend several minutes before the demo:

```bash
curl --fail --show-error --max-time 180 \
  https://explain-back.onrender.com/api/health
```

Wait for `{"status":"ok"}`, then allow roughly five seconds for asynchronous
concept prewarming and submit one demo explanation. During a short judging
window, an operator can keep the free instance awake with a health request at
an interval shorter than Render's inactivity timeout, for example every ten
minutes:

```bash
while true; do
  curl --fail --silent --show-error \
    https://explain-back.onrender.com/api/health
  sleep 600
done
```

This is an operational workaround, not an uptime guarantee. A paid
always-on Render instance is the reliable way to remove free-tier sleep.

## Production demo timings

After waking the existing production service, the full path was run ten times
in independently opened in-app browser tabs using
`samples/source_sodium_pump.txt` and
`samples/explanations/06_correct.txt`.

| Run | Page load | Analysis | Total | Result |
| ---: | ---: | ---: | ---: | --- |
| 1 | 0.510s | 4.604s | 5.246s | 5 diagnostics |
| 2 | 0.132s | 4.508s | 4.682s | 5 diagnostics |
| 3 | 0.133s | 4.528s | 4.707s | 5 diagnostics |
| 4 | 0.121s | 4.643s | 4.804s | 5 diagnostics |
| 5 | 0.132s | 4.435s | 4.604s | 5 diagnostics |
| 6 | 0.172s | 4.762s | 4.971s | 5 diagnostics |
| 7 | 0.129s | 4.443s | 4.609s | 5 diagnostics |
| 8 | 0.142s | 4.725s | 4.916s | 5 diagnostics |
| 9 | 0.259s | 4.479s | 4.794s | 5 diagnostics |
| 10 | 0.148s | 4.628s | 4.840s | 5 diagnostics |

Total time ranged from **4.604s to 5.246s**, averaging **4.817s**. Every run
returned the same five diagnostics, no alert, and no browser warning/error.
No run exceeded the 10-second demo gate.

## Mobile verification

Static CSS has a 720px breakpoint that collapses the workspace and result grid
to one column, stacks progress stages, removes cross-column borders, and
left-aligns feedback cards.

The Vercel preview for hardening commit `87a78be` was rendered in the selected
in-app browser with Chrome DevTools device metrics set to **390 × 844 CSS
pixels**. The measured document width and scroll width were both 390px, no
element crossed the viewport boundary, and all three result regions rendered as
354px-wide stacked sections. Diagnostic text rendered at 14px with a 28px line
height. The colored underlines were readable, keyboard focus opened a visible
273px-wide source-anchor/revision tooltip, and the tooltip remained within the
viewport.

No mobile layout change was necessary.

## Branch preview smoke

The protected Vercel preview initially rendered but submission failed because
Render's `FRONTEND_ORIGIN` allowed only the production frontend. Browser network
evidence showed the correct request to
`https://explain-back.onrender.com/api/analyze`, followed by
`PreflightMissingAllowOriginHeader`.

Render's comma-separated origin allowlist was expanded to retain
`https://explain-back.vercel.app` and add both the immutable hardening preview
origin and its stable branch alias. Render rebuilt the existing production
`main` SHA `84c86e9`; the previous live instance remained available during the
build. After deployment:

- `GET /api/health` returned 200.
- The preview-origin preflight returned 200 with the exact
  `Access-Control-Allow-Origin` value and `POST, GET` methods.
- The checked-in correct demo completed in **4.335 seconds**, returned HTTP 200,
  rendered concept coverage, inline diagnostics, and a follow-up question, and
  showed no alert.
