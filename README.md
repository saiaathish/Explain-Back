# Explain-Back

**Judging this project? See [JUDGES.md](JUDGES.md) for a 90-second walkthrough.**

Explain-Back inverts the usual AI study tool. Instead of explaining material
to a student, it asks the student to explain a short source passage and then
maps formative guidance over the student's own words:

- Green: supported by the source and justified
- Yellow: supported by the source but not justified
- Red: contradicts the supplied source
- Grey: the system is not confident

Every non-green flag includes an exact contiguous span from the supplied source and
a short revision hint. The response ends with one follow-up question generated
from the analyzed gaps. There are no learner-facing scores or account forms.
Supabase Auth creates a browser-local anonymous identity so the API can verify
each request. Explain-Back stores exactly two things for that identity: the
source text you submit and each successful explanation attempt with its concepts
and flags. What you mark during a review round is never stored. Nothing else is
written, every row is readable only by its owner, and
those inputs are also sent to the configured model provider under that provider's
data-handling policy. Clearing browser data, signing out, or changing devices
can lose the anonymous identity and therefore access to its saved history.

## Why this design

Self-explanation prompting is a studied learning activity. Explain-Back uses it
as its interaction model: the student produces the explanation before seeing
feedback. This project has not established that Explain-Back itself improves
learning.

Grey is an intentional state, not a missing result. Misconception detection at
realistic prevalence can create costly false positives, and model confidence is
not proof. Specificity, model confidence, semantic similarity, and exact source
anchoring must all support a red flag; otherwise the resolver backs off.

## Architecture

The browser holds live input and results in React state. Two Supabase tables
hold saved work: `sessions` and `explanation_attempts`. Both are append-only to
the browser, which writes them with its own authenticated session, so row-level
security — not backend code — is what enforces ownership. A failed write never
blocks an analysis, it only shows a notice. Review cards are derived from stored
flags, so reviewing makes no model call, and a review round is held in memory
only: nothing about what you marked is written down. A FastAPI process verifies the bearer token, then performs two or three
logical model stages around deterministic validation. Each stage can retry
malformed output for up to three total attempts:

1. Extract source concepts; cache them by source hash in process memory.
2. Extract propositions from the student's exact text.
3. Validate every returned span against the original string.
4. Align propositions and concepts using `BAAI/bge-small-en-v1.5`.
5. Verify all propositions in one batched model call.
6. Resolve green/yellow/red/grey in deterministic Python.

Optional voice input records audio locally with `MediaRecorder` and posts it to
`/api/transcribe`, which transcribes it through `llm.py` like every other model
call. No browser speech-recognition service is used, so recordings reach the
same provider as the rest of the pipeline and no other. Image sources follow the
same shape through `/api/normalize-image`. Both endpoints share the per-client
rate-limit budget with `/api/analyze`.

`backend/llm.py` is the only backend boundary to the configured model provider.
Malformed or incomplete model output raises visibly; unparseable output is
retried for three total attempts and never becomes an empty result that could
masquerade as an all-grey analysis.

## Local setup

Requires Python 3.11 and Node.js 20+.

```bash
cp .env.example .env
# Set SUPABASE_URL to the public project URL. Do not use a service-role,
# sb_secret_, JWT-secret, or private key in backend or frontend config.
# Set LLM_API_KEY, LLM_MODEL_PROD, LLM_MODEL_CI, and the provider's
# OpenAI-compatible LLM_BASE_URL in .env. LLM_MODEL is a legacy prod fallback.

uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt

# Download the embedding model once; runtime loads it locally only.
.venv/bin/python -c \
  "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"

.venv/bin/uvicorn backend.main:app --reload
```

In another terminal:

```bash
cd frontend
npm ci
VITE_API_URL=http://localhost:8000 \
VITE_SUPABASE_URL=https://your-project.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key \
npm run dev
```

Open `http://localhost:5173`.

### Supabase Auth configuration

Explain-Back starts each new browser with `signInAnonymously()`. An anonymous
user can then choose **Continue with Google** in the workspace, which calls
`linkIdentity()` instead of creating a second user. Configure the Supabase
project before testing either flow:

1. In **Authentication → Providers**, enable **Allow anonymous sign-ins**.
2. Enable the **Google** provider and enter its client ID and client secret.
3. In the authentication settings, enable **Manual Linking**. Supabase
   currently labels manual identity linking as beta.
4. Set the production site URL to `https://explain-back.vercel.app/` and add
   these redirect URLs:
   - `http://localhost:5173/`
   - `https://explain-back.vercel.app/`
   - `https://explain-back-*-sai-aathish-karthiks-projects.vercel.app/`

The final entry is intentionally limited to this Vercel project and team; do
not use a broad `https://*.vercel.app/**` allowlist. In Google Cloud Console,
set the OAuth client's authorized redirect URI to
`${SUPABASE_URL}/auth/v1/callback`, where `SUPABASE_URL` is the public URL of
the Supabase project. The browser callback itself returns to the exact origin
root, with query strings and fragments discarded.

### Saved history schema

Apply both migrations in `supabase/migrations/` in filename order. The first
creates `sessions` and `explanation_attempts`, granting only `select` and
`insert` to the `authenticated` role with owner-scoped row-level security. The
second drops the retired `flag_reviews` table. There is no update or delete path
and no service-role access, so saved history is append-only. Verify after
applying that a second identity cannot read the first identity's rows.

Local and deployed frontends also need `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`; the backend needs the matching
`SUPABASE_URL`. This repository does not supply a Supabase project or
credentials, so hosted authentication is not established by the code or these
instructions alone.

## Calibration and gates

```bash
PYTHONPATH=. .venv/bin/python calibrate/run.py
PYTHONPATH=. .venv/bin/python scripts/run_gate1.py
PYTHONPATH=. .venv/bin/python scripts/run_golden.py
PYTHONPATH=. .venv/bin/python scripts/run_determinism.py
.venv/bin/python -m pytest -q
cd frontend && npm test && npm run build
```

The authoritative golden defaults to `prod`; determinism and prompt-iteration
harnesses default to `ci`. Set `GOLDEN_LLM_ROLE=ci` only for comparative
evidence, or `DETERMINISM_LLM_ROLE=prod` for production evidence. Live gates
require `LLM_API_KEY` plus the selected role's model and exit blocked rather
than replacing live evidence with fixtures.

## Deployment

`render.yaml` and `Dockerfile` define the FastAPI service. The Docker build
bakes the embedding model into the image so `align.py` makes no runtime
download. Keep `LLM_ROLE=prod` in Render and set `LLM_API_KEY`,
`LLM_MODEL_PROD` (or legacy `LLM_MODEL`), `FRONTEND_ORIGIN`, and the provider's
OpenAI-compatible `LLM_BASE_URL`. Phase 2 deployments also require the public
`SUPABASE_URL`; do not provide a service-role or secret key. `LLM_MODEL_CI` is
evaluation-only and must not be selected in production.

`vercel.json` builds `frontend/`. Set `VITE_API_URL` to the deployed Render
service before building the Vercel deployment. Also set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the same Supabase
project configured above.

Verify Phase 2 against a backend deployed from the same checkpoint SHA, not
the production fallback backend. Set that backend's `FRONTEND_ORIGIN` to the
exact Vercel preview origin, then point the preview's `VITE_API_URL` to it.
This keeps `main` and `https://explain-back.onrender.com` unchanged while the
authenticated bearer-token and CORS paths are exercised end to end.

### Hosted Phase 2 verification

Run hosted authentication acceptance only against isolated preview URLs:

```bash
cd frontend
E2E_BASE_URL=https://your-frontend-preview.vercel.app \
E2E_API_URL=https://your-backend-preview.onrender.com \
E2E_VERCEL_BYPASS_SECRET=your-preview-bypass-secret \
E2E_CONFIRM_NON_PRODUCTION=YES \
npm run test:e2e:hosted
```

`E2E_VERCEL_BYPASS_SECRET` is optional when the preview is public. The
configuration fails closed when either URL is absent, uses HTTP, falls outside
the project-scoped Vercel or PR-scoped Render hostname patterns, resolves both
tiers to the same origin, or lacks the explicit non-production confirmation.
The automated run proves anonymous session creation/restoration, exact preview
CORS, malformed-token rejection, real JWT acceptance, and one-time 401
refresh/replay. It disables traces, screenshots, and video for this
credential-bearing flow and attaches token-free JSON evidence to Playwright's
temporary output directory.

The Google identity-link gate requires a human OAuth step and must run headed:

```bash
E2E_BASE_URL=https://your-frontend-preview.vercel.app \
E2E_API_URL=https://your-backend-preview.onrender.com \
E2E_VERCEL_BYPASS_SECRET=your-preview-bypass-secret \
E2E_CONFIRM_NON_PRODUCTION=YES \
E2E_GOOGLE_LINK=1 \
npm run test:e2e:hosted -- --headed --grep "Google links"
```

That gate records only a hash of the user ID and asserts the anonymous UID is
preserved, `is_anonymous` becomes false, a Google identity exists, the
malicious `next` input is ignored, callback query/hash data is removed, and
the linked session survives reload.

## Feature scope and the recorded demo

The recorded walkthrough covers three features, in this order: the core overlay,
confidence calibration, and the revise loop. That is the whole argument — here
is what you don't know, here is where you were confident and wrong, here is it
improving. The remaining features are documented rather than demonstrated,
because a two-minute feature tour buries the argument:

- Concept drill-down: explain a single missing concept against its source anchor.
- Subject presets: biology, economics, and photosynthesis starting points.
- Image source: photograph a passage and edit the extracted text.
- Voice input: record an explanation instead of typing it.

## Limitations

- Explain-Back itself has not been validated as a learning intervention.
- The hand-labeled calibration set is a development set, not a held-out test
  set, and it does not support a general accuracy claim.
- The cosine thresholds are specific to the configured embedding model and
  this membrane-transport calibration set; no paper supplies these cuts.
- Exploratory supply/demand and photosynthesis checks completed structurally,
  but correct explanations were mostly yellow or grey and many errors remained
  grey. Performance outside membrane transport is not calibrated or validated.
- Source verification is model-assisted and can still miss errors or produce
  false alarms. Grey exists to expose uncertainty, not erase it.
- Exact source anchors show what text informed a flag; they are not model
  attribution or an explanation of model internals.
- The misconception dictionary is intentionally limited to membrane transport.
- The revise loop matches claims across runs on their text, so some real
  improvements cannot be reported as transitions. A verdict is only high
  confidence when the claim itself is specific (a number, a direction, an
  ordering, an absolute), but adding that specificity changes the claim's
  wording, and changed wording no longer matches the previous run. For a vague
  claim those two requirements are mutually exclusive: it can be revised into a
  confident one, but the diff will show that as a new claim rather than as a gap
  closed. Extraction also splits and merges propositions across runs on
  untouched text, which is why additions and removals are counted but never
  displayed.
- Transcription and image extraction are model-assisted and can misread terms.
  Both surface editable text and ask for review before analysis rather than
  feeding the pipeline silently.
- Inputs are sent to the configured LLM provider for analysis, and provider
  handling is governed by that provider's policy. Voice recordings and images go
  to that same provider and no other; neither is stored by Explain-Back, which
  saves only submitted source text and successful explanation attempts.
