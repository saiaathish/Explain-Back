# Production adversarial evaluation

## Environment

- Date: 2026-07-26
- Frontend: `https://explain-back.vercel.app`
- Backend: `https://explain-back.onrender.com`
- Production base SHA during the run: `84c86e9`
- Production health before testing: frontend 200; backend 200 after a
  122.29-second cold start

The API cases were run with `scripts/run_adversarial.py`. Browser checks used
the production app in the in-app browser and recorded visible alert, loading,
button, overlay, and console state. The Browser runtime did not expose a
supported screenshot command, so browser evidence is DOM and interaction
state rather than an image.

## Results against production

| Case | Result | Finding |
| --- | --- | --- |
| Single-word explanation | 400, visible alert | Passed. The app showed “Explanation too short. Write at least two full sentences.”, re-enabled the button, removed loading stages, and logged no errors. |
| Explanation identical to source | 200 in 7.23s | Stable and bounded: 9 flags (5 green, 3 yellow, 1 grey), with no invalid spans. This must not be interpreted as proof of understanding. |
| Other-language explanation | 200 in 4.20s | Conservative result: all 3 Spanish claims were grey, with no invalid spans or crash. |
| Source and explanation swapped | 200 in 11.17s | Unresolved semantic limitation. The response looked plausible (4 green, 4 yellow, 2 grey) even though the fields were reversed. Arbitrary long texts do not contain a reliable structural signal for detecting this without a new classifier. |
| Prompt injection | 200 in 3.60s | Passed. The two substantive flags were identical to the neutral baseline (1 green, 1 yellow); the instruction text did not change state assignment or become a command. |
| Emoji, curly quotes, em dash, NBSP | 200 in 4.01s | Backend spans were valid, but every rendered diagnostic shifted after the leading emoji because Python counts code points and JavaScript slices UTF-16 code units. Curly quotes, em dashes, and NBSP did not independently shift offsets. Fixed on the branch. |
| Same sentence three times | 200 in 3.95s | Passed. Three yellow flags had three distinct starts: 0, 94, and 188. |
| 50 rapid submissions | 50 responses in 0.60s | Production had no application limiter: all 50 invalid submissions returned the ordinary 400 validation response, and none returned 429. Fixed on the branch. |

No case produced a stack trace, malformed body, or infinite spinner.

## Fix verification

### Unicode offsets

`frontend/src/Overlay.jsx` now converts backend code-point offsets to
JavaScript code-unit offsets before sorting and slicing flags. The dedicated
emoji regression test passes. In the local rendered app, the three diagnostic
texts exactly matched their intended claims:

- `The pump moves “three sodium ions” out`
- `two potassium ions in`
- `ATP—through phosphorylation—changes the pump’s shape`

The leading emoji remained unhighlighted, the full overlay text was unchanged,
the submit button was enabled after analysis, and the browser console had no
warnings or errors.

### Rate limiting

The branch now limits `/api/analyze` to 20 requests per client in a rolling
60-second window without adding a dependency. A local 25-request burst
returned 20 ordinary validation responses followed by 5 JSON 429 responses.
Each 429 included:

- `{"detail": "Too many submissions. Please try again shortly."}`
- A positive `Retry-After` header
- The configured CORS origin

The local browser then displayed the exact rate-limit detail, removed the
loading stages, re-enabled the submit button, and logged no errors.

## Unresolved limitations

- A source/explanation swap can return a plausible analysis. Detecting this
  generally would require a new semantic role classifier or a product-level
  confirmation step, both outside this hardening run.
- Other-language behavior was conservative in the tested Spanish case, but
  the product does not claim or enforce a language policy.
- The in-process limiter is appropriate for the current single Render
  instance. It is not a distributed quota if the service later scales to
  multiple workers or instances.
