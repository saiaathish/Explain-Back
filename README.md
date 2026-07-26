# Explain-Back

Explain-Back inverts the usual AI study tool. Instead of explaining material
to a student, it asks the student to explain a short source passage and then
maps formative guidance over the student's own words:

- Green: supported by the source and justified
- Yellow: supported by the source but not justified
- Red: contradicts the supplied source
- Grey: the system is not confident

Every non-green flag includes an exact contiguous span from the supplied source and
a short revision hint. The response ends with one follow-up question generated
from the analyzed gaps. There are no learner-facing scores or accounts.
Explain-Back does not persist submissions; inputs are sent to the configured
model provider under that provider's data-handling policy.

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

The browser holds input and results in React state. A FastAPI process performs
two or three logical model stages around deterministic validation. Each stage
can retry malformed output for up to three total attempts:

1. Extract source concepts; cache them by source hash in process memory.
2. Extract propositions from the student's exact text.
3. Validate every returned span against the original string.
4. Align propositions and concepts using `BAAI/bge-small-en-v1.5`.
5. Verify all propositions in one batched model call.
6. Resolve green/yellow/red/grey in deterministic Python.

`backend/llm.py` is the only backend boundary to the configured model provider.
Malformed or incomplete model output raises visibly; unparseable output is
retried for three total attempts and never becomes an empty result that could
masquerade as an all-grey analysis.

## Local setup

Requires Python 3.11 and Node.js 20+.

```bash
cp .env.example .env
# Set LLM_API_KEY, LLM_MODEL, and the provider's OpenAI-compatible
# LLM_BASE_URL in .env.

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
VITE_API_URL=http://localhost:8000 npm run dev
```

Open `http://localhost:5173`.

## Calibration and gates

```bash
PYTHONPATH=. .venv/bin/python calibrate/run.py
PYTHONPATH=. .venv/bin/python scripts/run_gate1.py
PYTHONPATH=. .venv/bin/python scripts/run_golden.py
PYTHONPATH=. .venv/bin/python scripts/run_determinism.py
.venv/bin/python -m pytest -q
cd frontend && npm test && npm run build
```

Gate 1 and the golden regression require live `LLM_API_KEY` and `LLM_MODEL`
values. They exit as blocked rather than replacing live evidence with fixtures.

## Deployment

`render.yaml` and `Dockerfile` define the FastAPI service. The Docker build
bakes the embedding model into the image so `align.py` makes no runtime
download. Set `LLM_API_KEY`, `LLM_MODEL`, and the deployed Vercel origin as
`FRONTEND_ORIGIN` in Render. Also set `LLM_BASE_URL` to the configured
provider's OpenAI-compatible base URL.

`vercel.json` builds `frontend/`. Set `VITE_API_URL` to the deployed Render
service before building the Vercel deployment.

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
- Inputs are sent to the configured LLM provider for analysis. Explain-Back
  does not persist them, but provider handling is governed by that provider's
  policy.
