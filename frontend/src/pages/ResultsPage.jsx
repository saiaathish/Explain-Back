import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import CalibrationMap from "../CalibrationMap";
import ConceptList from "../ConceptList";
import DiffStrip from "../DiffStrip";
import FollowUp from "../FollowUp";
import Legend from "../Legend";
import Overlay from "../Overlay";
import { EXPLANATION_LIMIT } from "../session/draft";
import { useSession } from "../session/SessionProvider";

function toDomIdFragment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-") || "concept";
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const {
    attemptNumber,
    beginRevision,
    busy,
    calibration,
    closeConcept,
    current,
    focusedCurrent,
    focusedError,
    focusedExplanation,
    focusedLoading,
    historySaveError,
    openConcept,
    resultRunId,
    selectedConcept,
    setFocusedExplanation,
    startNewSession,
    submitFocused,
    summary,
  } = useSession();
  const resultsRef = useRef(null);
  const focusedRef = useRef(null);

  useEffect(() => {
    resultsRef.current?.focus({ preventScroll: true });
  }, [resultRunId]);

  useEffect(() => {
    if (selectedConcept && !focusedCurrent) focusedRef.current?.focus();
  }, [selectedConcept, focusedCurrent]);

  if (!current) return null;

  const focusedExplanationId = selectedConcept
    ? `focused-explanation-${toDomIdFragment(selectedConcept.id)}`
    : "focused-explanation";

  function revise() {
    beginRevision();
    navigate("/session/record");
  }

  function finish() {
    startNewSession();
    navigate("/dashboard");
  }

  return (
    <section
      className="results"
      aria-label="Formative analysis"
      data-result-run={resultRunId}
      id={`analysis-result-${resultRunId}`}
      key={resultRunId}
      ref={resultsRef}
      tabIndex={-1}
    >
      <header className="results-heading">
        <div>
          <h1>What held up</h1>
          <p className="step-intro">
            Attempt {attemptNumber} · the source is back on screen now that you
            have committed to an explanation.
          </p>
        </div>
        <button className="secondary" onClick={finish} type="button">
          Back to dashboard
        </button>
      </header>

      {historySaveError && (
        <p className="history-save-error" role="alert">
          {historySaveError}
        </p>
      )}

      <section className="result-region result-region--concepts result-group result-group--concepts">
        <h2>What this section teaches</h2>
        <ConceptList
          concepts={current.result.concepts}
          coverage={current.result.coverage}
          onSelectMissing={openConcept}
        />
        {selectedConcept && (
          <section className="drill-down" aria-labelledby="drill-down-title">
            <div className="drill-down-heading">
              <div>
                <h3 id="drill-down-title">Drill into {selectedConcept.label}</h3>
                <p className="region-intro">
                  Explain only this idea, using the source anchor as your focus.
                </p>
              </div>
              <button className="text-button" onClick={closeConcept} type="button">
                Close
              </button>
            </div>
            <blockquote>{selectedConcept.anchor}</blockquote>
            <form onSubmit={submitFocused}>
              <label htmlFor={focusedExplanationId}>
                Your explanation of {selectedConcept.label}
              </label>
              <textarea
                id={focusedExplanationId}
                ref={focusedRef}
                disabled={focusedLoading || busy}
                value={focusedExplanation}
                onChange={(event) => setFocusedExplanation(event.target.value)}
                placeholder="Explain this concept in two or three sentences…"
                maxLength={EXPLANATION_LIMIT + 1}
              />
              <div className="drill-down-actions">
                <button
                  className="primary"
                  disabled={focusedLoading || busy}
                  type="submit"
                >
                  {focusedLoading ? "Checking concept…" : "Check this concept"}
                </button>
              </div>
            </form>
            {focusedError && (
              <p className="error" role="alert">
                {focusedError}
              </p>
            )}
            {focusedCurrent && (
              <div className="focused-result">
                <h4>Focused check</h4>
                <ConceptList
                  concepts={focusedCurrent.result.concepts}
                  coverage={focusedCurrent.result.coverage}
                />
                <Overlay
                  explanation={focusedCurrent.explanation}
                  flags={focusedCurrent.result.flags}
                />
                <Legend />
              </div>
            )}
          </section>
        )}
      </section>

      <section className="result-region result-region--overlay result-group result-group--overlay">
        <h2>Where you are now</h2>
        <p className="region-intro">
          Hover, focus, or tap an underline for source-anchored guidance.
        </p>
        <DiffStrip summary={summary} />
        <Overlay
          explanation={current.explanation}
          flags={current.result.flags}
          improvedIds={summary?.improved}
          dangerIds={calibration?.dangerIds}
          revealDelay={300}
          revealDuration={400}
        />
        <CalibrationMap summary={calibration} />
        <Legend />
      </section>

      <section className="result-region result-region--forward result-group result-group--forward">
        <h2>How to move forward</h2>
        <FollowUp question={current.result.follow_up} />
        <div className="results-actions">
          <button
            className="primary revise-button"
            disabled={busy}
            onClick={revise}
            type="button"
          >
            Explain it again
          </button>
          <button className="secondary" onClick={finish} type="button">
            Done for now
          </button>
        </div>
        <p className="step-note">
          A revision sends you back to the explaining screen with the source out
          of sight again.
        </p>
      </section>
    </section>
  );
}
