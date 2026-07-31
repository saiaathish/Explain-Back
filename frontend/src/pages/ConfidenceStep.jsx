/**
 * Session Step 3 — Sentence Confidence Pass
 * 
 * Allows learners to self-assess their confidence per explanation statement
 * before submitting for AI analysis.
 */

import { useNavigate } from "react-router-dom";
import ConfidencePass from "../ConfidencePass";
import { useSession } from "../session/SessionProvider";
import StepShell from "./StepShell";

export default function ConfidenceStep() {
  const navigate = useNavigate();
  const {
    attemptNumber,
    busy,
    confidenceRanges,
    cooldown,
    explanation,
    setConfidenceRanges,
  } = useSession();

  return (
    <StepShell
      attempt={attemptNumber}
      current="confidence"
      title="Which statements are you confident about?"
      intro="Tap the sentences you would bet on. Anything you mark confidently that does not hold up is the most useful thing this app can show you."
      actions={
        <>
          <button
            className="secondary"
            onClick={() => navigate("/session/record")}
            type="button"
          >
            Back to explanation
          </button>
          <button
            className="primary"
            disabled={busy || cooldown > 0}
            onClick={() => navigate("/session/analyzing")}
            type="button"
          >
            {cooldown > 0 ? `Try again in ${cooldown}s` : "Check my explanation"}
          </button>
        </>
      }
    >
      <ConfidencePass
        explanation={explanation}
        selectedRanges={confidenceRanges}
        onChange={setConfidenceRanges}
        disabled={busy}
      />
      <p className="step-note">
        Marking nothing is fine. It just means the calibration map has less to
        say this round.
      </p>
    </StepShell>
  );
}
