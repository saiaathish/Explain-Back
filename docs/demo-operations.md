# Demo-path operations

## Render sleep and prewarm

The Render dashboard confirms that the backend uses a **Free** instance and
states:

> Your free instance will spin down with inactivity, which can delay requests
> by 50 seconds or more.

An actual cold `GET /api/health` on 2026-07-26 took **122.29 seconds** before
returning 200. The Vercel frontend remained available and returned 200 in
0.17 seconds.

The branch starts concept-cache prewarming asynchronously for all checked-in
demo sources:

- `source_sodium_pump.txt`
- `source_supply_demand.txt`
- `source_photosynthesis.txt`

Health remains non-blocking while those calls run.

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
left-aligns feedback cards. A rendered 390px verification remains unproven:
the in-app browser exposes a fixed 1280px viewport and no resize command,
desktop control is prohibited from accessing the Codex window, and Browser
security policy rejected a 390px iframe harness. The policy explicitly
prohibited retrying through an alternate browser surface.

No mobile visual change was made without rendered evidence.
