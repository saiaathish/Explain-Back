import { useEffect, useMemo, useRef, useState } from "react";
import { analyze } from "./api";
import ConceptList from "./ConceptList";
import DiffStrip from "./DiffStrip";
import { diffRuns } from "./diff";
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
    return "Source or explanation is missing. Paste both texts, then try again.";
  }
  if (source.trim().length < 100) {
    return "Source is too short to identify concepts. Paste 2–3 paragraphs, then try again.";
  }
  if (explanation.trim().length < 40) {
    return "Explanation is too short to check. Write at least two full sentences, then try again.";
  }
  if (source.length > 6000) {
    return "Source exceeds the 6,000-character limit. Shorten it to 2–3 paragraphs, then try again.";
  }
  if (explanation.length > 4000) {
    return "Explanation exceeds the 4,000-character limit. Shorten it to a few paragraphs, then try again.";
  }
  return "";
}

export default function App() {
  const [source, setSource] = useState("");
  const [explanation, setExplanation] = useState("");
  /* A run snapshot is `{ result, explanation }`: flags carry offsets, not claim
     text, so the diff needs the exact text each run was scored against. */
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const abortRef = useRef(null);
  const reviseRef = useRef(null);

  const summary = useMemo(() => diffRuns(previous, current), [previous, current]);

  useEffect(() => {
    if (!revising) return;
    const field = reviseRef.current;
    if (!field) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    field.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [revising]);

  async function loadExample() {
    const [demoSource, demoExplanation] = await Promise.all([
      fetch("/samples/source_sodium_pump.txt").then((response) => response.text()),
      fetch("/samples/demo_video.txt").then((response) => response.text()),
    ]);
    setSource(demoSource.trim());
    setExplanation(demoExplanation.trim());
    setError("");
    setCurrent(null);
    setPrevious(null);
    setRevising(false);
  }

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
      const trimmed = explanation.trim();
      const result = await analyze(source.trim(), trimmed, controller.signal);
      /* One level of history, and this is all of it. */
      setPrevious(current);
      setCurrent({ result, explanation: trimmed });
      setRevising(false);
    } catch (requestError) {
      setError(
        requestError.name === "AbortError"
          ? "The analysis request timed out. Try again with the same text."
          : requestError instanceof TypeError
            ? "The analysis service could not be reached. Check your connection, then try again."
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
        <form className="workspace" id="workspace-form" onSubmit={submit}>
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
          {/* While revising, the field moves below the overlay so the student can
              see the yellow they are fixing. */}
          {!revising && (
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
          )}
          <button className="secondary" disabled={loading} onClick={loadExample} type="button">
            Load example
          </button>
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

        {current && (
          <section className="results" aria-label="Formative analysis">
            <section className="result-region">
              <h2>What this section teaches</h2>
              <ConceptList
                concepts={current.result.concepts}
                coverage={current.result.coverage}
              />
            </section>
            <section className="result-region result-region--overlay">
              <h2>Where you are now</h2>
              <p className="region-intro">
                Hover or focus an underline for source-anchored guidance.
              </p>
              <DiffStrip summary={summary} />
              <Overlay
                explanation={current.explanation}
                flags={current.result.flags}
                improvedIds={summary?.improved}
              />
              <Legend />
              {revising && (
                <div className="revise-panel">
                  <label>
                    <span>Revise your explanation</span>
                    <textarea
                      ref={reviseRef}
                      value={explanation}
                      onChange={(event) => setExplanation(event.target.value)}
                      maxLength={4001}
                    />
                    <small>{explanation.length} / 4,000 characters</small>
                  </label>
                  <button className="primary" disabled={loading} type="submit" form="workspace-form">
                    {loading ? STAGES[stage] : "Check my revision"}
                  </button>
                </div>
              )}
            </section>
            <section className="result-region">
              <h2>How to move forward</h2>
              <FollowUp question={current.result.follow_up} />
              {!revising && (
                <button
                  className="secondary revise-button"
                  disabled={loading}
                  onClick={() => setRevising(true)}
                  type="button"
                >
                  Revise your explanation
                </button>
              )}
            </section>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

export { validate };
