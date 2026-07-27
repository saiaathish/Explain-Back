import { useEffect, useRef, useState } from "react";
import { analyze } from "./api";
import ConceptList from "./ConceptList";
import FollowUp from "./FollowUp";
import Legend from "./Legend";
import Overlay from "./Overlay";

const STAGES = ["Reading source", "Extracting claims", "Checking against source"];
const ANALYSIS_TIMEOUT_MS = 90_000;

function Footer() {
  return (
    <footer>
      Formative guidance only. Not a grade. Explain-Back does not persist
      submissions.
    </footer>
  );
}

function validate(source, explanation) {
  if (!source.trim() || !explanation.trim()) {
    return "Paste both source material and your explanation.";
  }
  if (source.trim().length < 100) {
    return "Source too short. Paste 2–3 paragraphs.";
  }
  if (explanation.trim().length < 40) {
    return "Explanation too short. Write at least two full sentences.";
  }
  if (source.length > 6000) {
    return "Source too long. Keep it to 2–3 paragraphs.";
  }
  if (explanation.length > 4000) {
    return "Explanation too long. Keep it to a few paragraphs.";
  }
  return "";
}

export default function App() {
  const [source, setSource] = useState("");
  const [explanation, setExplanation] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const abortRef = useRef(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  async function submit(event) {
    event.preventDefault();
    const validationError = validate(source, explanation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setResult(null);
    setLoading(true);
    setStage(0);
    const controller = new AbortController();
    abortRef.current = controller;
    const stageTimer = window.setInterval(
      () => setStage((current) => Math.min(current + 1, STAGES.length - 1)),
      1800,
    );
    const timeout = window.setTimeout(
      () => controller.abort(),
      ANALYSIS_TIMEOUT_MS,
    );
    try {
      setResult(await analyze(source.trim(), explanation.trim(), controller.signal));
    } catch (requestError) {
      setError(
        requestError.name === "AbortError"
          ? "The model timed out. Please try again."
          : requestError.message,
      );
    } finally {
      window.clearInterval(stageTimer);
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header>
        <span className="brand">Explain-Back</span>
        <p>Explain it in your own words. See what holds up.</p>
      </header>

      <main>
        <form className="workspace" onSubmit={submit}>
          <label>
            <span>Source material</span>
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Paste 2–3 paragraphs of source material…"
              maxLength={6001}
            />
            <small>{source.length} / 6,000 characters</small>
          </label>
          <label>
            <span>Your explanation</span>
            <textarea
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="Explain the section in your own words…"
              maxLength={4001}
            />
            <small>{explanation.length} / 4,000 characters</small>
          </label>
          <button className="primary" disabled={loading} type="submit">
            {loading ? STAGES[stage] : "Check my explanation"}
          </button>
        </form>

        {loading && (
          <ol className="stages" aria-live="polite">
            {STAGES.map((label, index) => (
              <li
                className={index < stage ? "done" : index === stage ? "active" : ""}
                key={label}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {result && (
          <section className="results" aria-label="Formative analysis">
            <section className="result-region">
              <h2>What this section teaches</h2>
              <ConceptList concepts={result.concepts} coverage={result.coverage} />
            </section>
            <section className="result-region result-region--overlay">
              <h2>Where you are now</h2>
              <p className="region-intro">
                Hover or focus an underline for source-anchored guidance.
              </p>
              <Overlay explanation={explanation.trim()} flags={result.flags} />
              <Legend />
            </section>
            <section className="result-region">
              <h2>How to move forward</h2>
              <FollowUp question={result.follow_up} />
            </section>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

export { validate };
