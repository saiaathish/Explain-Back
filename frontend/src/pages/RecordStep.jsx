/**
 * Session Step 2 — Explanation Recording & Recall Input
 * 
 * Learners explain the concept from memory via speech or text.
 * Source material is strictly hidden on this screen to prevent visual recall bias.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExplanationField from "../session/ExplanationField";
import { validateExplanation } from "../session/draft";
import { useSession } from "../session/SessionProvider";
import StepShell from "./StepShell";

/*
 * The source is not on this screen and there is no way to reveal it. Going back
 * for another look is allowed, but it costs the explanation — see confirmBack.
 */
export default function RecordStep() {
  const navigate = useNavigate();
  const {
    attemptNumber,
    busy,
    discardExplanation,
    explanation,
    isRecording,
    recordingSupported,
    startRecording,
    stopRecording,
    transcribing,
    updateExplanation,
    voiceError,
    voiceNotice,
  } = useSession();
  const [stepError, setStepError] = useState("");
  const [confirmingBack, setConfirmingBack] = useState(false);
  const explanationRef = useRef(null);

  useEffect(() => {
    explanationRef.current?.focus();
  }, []);

  function goToConfidence(event) {
    event.preventDefault();
    if (isRecording) {
      setStepError("Stop the recording before moving on.");
      return;
    }
    const validationError = validateExplanation(explanation);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setStepError("");
    navigate("/session/confidence");
  }

  function requestBack() {
    if (!explanation.trim()) {
      navigate("/session/source");
      return;
    }
    setConfirmingBack(true);
  }

  function confirmBack() {
    discardExplanation();
    setConfirmingBack(false);
    navigate("/session/source");
  }

  return (
    <StepShell
      attempt={attemptNumber}
      current="record"
      title="Explain it back"
      intro="From memory, in your own words. The source is put away on purpose — what you can say without it is the only thing worth measuring."
      actions={
        <>
          <button className="secondary" onClick={requestBack} type="button">
            Back to source
          </button>
          <button
            className="primary"
            disabled={busy || isRecording}
            form="record-step-form"
            type="submit"
          >
            Next: mark your confidence
          </button>
        </>
      }
    >
      <form id="record-step-form" onSubmit={goToConfidence}>
        <ExplanationField
          id="explanation"
          textareaRef={explanationRef}
          value={explanation}
          onChange={updateExplanation}
          disabled={busy && !isRecording}
          isRecording={isRecording}
          transcribing={transcribing}
          voiceSupported={recordingSupported}
          voiceError={voiceError}
          voiceNotice={voiceNotice}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
        />
        {!explanation.trim() && (
          <p className="empty-hint">
            Say it out loud with the record button, or type it. Either way, do
            not go looking things up first.
          </p>
        )}
        {stepError && (
          <p className="error" role="alert">
            {stepError}
          </p>
        )}
      </form>

      {confirmingBack && (
        <div className="confirm-panel" role="alertdialog" aria-labelledby="confirm-back-title">
          <h2 id="confirm-back-title">Go back and read the source again?</h2>
          <p>
            Your explanation will be cleared. Reading the material and then
            keeping what you already wrote would not be a real recall attempt.
          </p>
          <div className="confirm-actions">
            <button className="primary" onClick={confirmBack} type="button">
              Clear it and go back
            </button>
            <button
              className="secondary"
              onClick={() => setConfirmingBack(false)}
              type="button"
            >
              Keep explaining
            </button>
          </div>
        </div>
      )}
    </StepShell>
  );
}
