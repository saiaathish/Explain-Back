# Pre-submission fix run

Date: 2026-07-28

## Batch outcomes

- Batch 0: Render `https://explain-back.onrender.com/api/health` returned HTTP 200 in 0.354s. Vercel production is configured to use the Render backend by deployment evidence. End-to-end browser verification remains pending.
- Batch 1: Already present before this run. `find_normalized` handles line breaks, tabs, and repeated whitespace; focused and full tests pass.
- Batch 2: Cross-subject fixtures and report already present. Four-case live rerun was not completed because the provider rate limit was reached during the golden run.
- Batch 3: Added `Load example`, reversed-stoichiometry `samples/demo_video.txt`, and Vercel-served public sample assets. Frontend build passes.
- Batch 4: Added full-result SHA-256 cache, demo-pair prewarm, parallel concept/proposition extraction, removed outer verification retry fan-out, and lowered the HTTP timeout to 10s after the cold path exceeded 15s. Warm determinism repeats returned in 0.000s in the CI run.
- Batch 5: Backend suite and frontend build pass. Production golden verification was interrupted by provider HTTP 429; ten fresh-browser timings, mobile, PDF-paste, and deploy verification remain pending. Current production frontend returns HTTP 200, but `/samples/demo_video.txt` returns 404 because these local changes are not deployed.

## Regression evidence

- Backend tests: 63 passed.
- Frontend build: passed.
- Determinism: 5/5 passed using the CI role.
- Golden baseline: historical baseline is 32/37 original and 0.80 expanded. Current production run reached provider HTTP 429 before completion; no passing score is claimed.
- Live production SHA: Vercel evidence identifies `f51c69b`; current Render deployment SHA is not exposed by the public health endpoint.

## Remaining work

Retry production golden and cross-subject runs after provider quota recovery. Then perform the required fresh-profile ten-run browser, mobile-width, PDF-paste, and deployment checks. Do not publish a completion claim until those checks pass.
