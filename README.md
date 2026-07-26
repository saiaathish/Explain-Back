# Explain-Back

Explain-Back inverts the usual AI study tool. Instead of explaining material
to a student, it asks the student to explain a short source passage and then
maps formative guidance over the student's own words:

- Green: understood and justified
- Yellow: stated but not justified
- Red: contradicts the supplied source
- Grey: the system is not confident

Every non-green flag includes an exact sentence from the supplied source and
a short revision hint. The response ends with one follow-up question aimed at
the weakest point. There are no scores, accounts, or stored submissions.

## Why this design

Self-explanation prompting has reported meta-analytic support around
`g ≈ 0.55` across roughly 64 studies. Explain-Back uses that learning activity
as its interaction model: the student produces the explanation before seeing
feedback.

Grey is an intentional state, not a missing result. Misconception detection at
realistic prevalence can create costly false positives, and model confidence is
not proof. Specificity, model confidence, semantic similarity, and exact source
anchoring must all support a red flag; otherwise the resolver backs off.

## Architecture

The browser holds input and results in React state. A FastAPI process performs
three constrained model calls around deterministic validation:

1. Extract source concepts; cache them by source hash in process memory.
2. Extract propositions from the student's exact text.
3. Validate every returned span against the original string.
4. Align propositions and concepts using `BAAI/bge-small-en-v1.5`.
5. Verify all propositions in one batched model call.
6. Resolve green/yellow/red/grey in deterministic Python.

`backend/llm.py` is the only runtime network boundary. Malformed model output
raises after three total attempts; it never becomes an empty result that could
masquerade as an all-grey analysis.

## Local setup

Requires Python 3.11 and Node.js 20+.

```bash
cp .env.example .env
# Set LLM_API_KEY and LLM_MODEL in .env.

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
.venv/bin/python -m pytest -q
cd frontend && npm test && npm run build
```

Gate 1 and the golden regression require live `LLM_API_KEY` and `LLM_MODEL`
values. They exit as blocked rather than replacing live evidence with fixtures.

## Deployment

`render.yaml` and `Dockerfile` define the FastAPI service. The Docker build
bakes the embedding model into the image so `align.py` makes no runtime
download. Set `LLM_API_KEY`, `LLM_MODEL`, and the deployed Vercel origin as
`FRONTEND_ORIGIN` in Render.

`vercel.json` builds `frontend/`. Set `VITE_API_URL` to the deployed Render
service before building the Vercel deployment.

## Limitations

- Explain-Back itself has not been validated as a learning intervention.
- The hand-labeled calibration set is a development set, not a held-out test
  set, and it does not support a general accuracy claim.
- The cosine thresholds are specific to the configured embedding model and
  this membrane-transport calibration set; no paper supplies these cuts.
- Source verification is model-assisted and can still miss errors or produce
  false alarms. Grey exists to expose uncertainty, not erase it.
- Exact source anchors show what text informed a flag; they are not model
  attribution or an explanation of model internals.
- The misconception dictionary is intentionally limited to membrane transport.
- Inputs are sent to the configured LLM provider for analysis. Explain-Back
  does not persist them, but provider handling is governed by that provider's
  policy.
