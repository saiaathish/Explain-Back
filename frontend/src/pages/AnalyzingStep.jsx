/**
 * Session Step 4 — Analysis Loading & Progress Screen
 * 
 * Drives the background evaluation pipeline and displays staged progress steps
 * before navigating to formative evaluation results.
 */

import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { refreshLearningData } from "../learningData";
import { SUBMIT_STAGES, useSession } from "../session/SessionProvider";

/*
 * The analysis is kicked off exactly once per visit. `startedRef` is what makes
 * that true under StrictMode's double-invoked effects — a second call here
 * would spend another slice of the learner's analysis budget on the same words.
 */
export default function AnalyzingStep() {
  const navigate = useNavigate();
  const { analysisStatus, cooldown, error, runAnalysis, stage } = useSession();
  const startedRef = useRef(false);
  const activeRef = useRef(true);
  const runRef = useRef(runAnalysis);
  runRef.current = runAnalysis;

  /* Retrying reruns the request against the draft still held in memory. A page
   * reload would throw that draft away and bounce the learner to step one. */
  const start = useCallback(() => {
    Promise.resolve(runRef.current()).then((outcome) => {
      if (!activeRef.current || outcome !== "done") return;
      refreshLearningData();
      navigate("/session/results", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    activeRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;
      start();
    }
    return () => {
      activeRef.current = false;
    };
  }, [start]);

  if (analysisStatus === "error") {
    return (
      <section className="step-shell analyzing-shell" aria-labelledby="analyzing-title">
        <header className="step-heading">
          <h1 id="analyzing-title">That did not go through</h1>
        </header>
        <p className="error" role="alert">
          {error || "Analysis could not be completed. Check the text and try again."}
        </p>
        <div className="step-actions">
          <button
            className="secondary"
            onClick={() => navigate("/session/confidence")}
            type="button"
          >
            Back to my explanation
          </button>
          <button
            className="primary"
            disabled={cooldown > 0}
            onClick={start}
            type="button"
          >
            {cooldown > 0 ? `Try again in ${cooldown}s` : "Try again"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="step-shell analyzing-shell" aria-labelledby="analyzing-title">
      <header className="step-heading">
        <h1 id="analyzing-title">Checking your explanation</h1>
        <p className="step-intro">
          Reading what you said against what the source actually claims.
        </p>
      </header>

      <ol className="stages">
        {SUBMIT_STAGES.map((label, index) => (
          <li
            className={index < stage ? "done" : index === stage ? "active" : ""}
            key={label}
          >
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {SUBMIT_STAGES[stage]}
      </p>
    </section>
  );
}
