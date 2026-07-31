import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CharacterCounter from "../session/CharacterCounter";
import {
  PRESETS,
  SOURCE_LIMIT,
  SOURCE_MINIMUM,
  validateSource,
} from "../session/draft";
import { useSession } from "../session/SessionProvider";
import StepShell from "./StepShell";

function ImageIcon() {
  return (
    <svg
      aria-hidden="true"
      className="button-icon"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export default function SourceStep() {
  const navigate = useNavigate();
  const {
    activePresetId,
    busy,
    error,
    imageError,
    imageLoading,
    imageNotice,
    imagePreview,
    loadPreset,
    loadingPresetId,
    selectImage,
    source,
    updateSource,
  } = useSession();
  const [stepError, setStepError] = useState("");
  const imageInputRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    sourceRef.current?.focus();
  }, []);

  function goToRecord(event) {
    event.preventDefault();
    const validationError = validateSource(source);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setStepError("");
    navigate("/session/record");
  }

  return (
    <StepShell
      current="source"
      title="Add your source material"
      intro="Paste or scan what you are studying. You will not see it again while you explain — that is the point."
      actions={
        <>
          <button
            className="secondary"
            onClick={() => navigate("/dashboard")}
            type="button"
          >
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy}
            form="source-step-form"
            type="submit"
          >
            Next: explain it back
          </button>
        </>
      }
    >
      <form id="source-step-form" onSubmit={goToRecord}>
        <div className="field field--source">
          <label htmlFor="source">Source material</label>
          <div className="source-tools">
            <button
              aria-label={imageLoading ? "Reading image…" : "Add image source"}
              className="voice-button"
              disabled={busy}
              onClick={() => imageInputRef.current?.click()}
              type="button"
            >
              <ImageIcon />
              {imageLoading ? "Reading image…" : "Add image source"}
            </button>
            <input
              ref={imageInputRef}
              className="image-input"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              disabled={busy}
              onChange={selectImage}
              type="file"
            />
          </div>
          {imagePreview && (
            <div className="image-status">
              <img src={imagePreview} alt="Selected source preview" />
              <span>
                {imageNotice
                  ? "Extracted text is ready to edit."
                  : "Preparing editable text…"}
              </span>
            </div>
          )}
          {imageError && (
            <p className="voice-error" role="alert">
              {imageError}
            </p>
          )}
          <textarea
            id="source"
            ref={sourceRef}
            className="source-textarea"
            disabled={busy}
            value={source}
            onChange={(event) => updateSource(event.target.value)}
            placeholder="Paste 2–3 paragraphs of source material…"
            maxLength={SOURCE_LIMIT + 1}
          />
          <CharacterCounter
            value={source}
            healthyMinimum={SOURCE_MINIMUM}
            maximum={SOURCE_LIMIT}
          />
          {imageNotice && (
            <p className="image-notice">
              Check the extracted text before analyzing.
            </p>
          )}
        </div>

        <div className="preset-group" aria-label="Subject presets">
          <span className="preset-label">Or try a subject</span>
          {PRESETS.map((preset) => (
            <button
              aria-label={
                loadingPresetId === preset.id
                  ? `Loading ${preset.label}…`
                  : undefined
              }
              aria-pressed={activePresetId === preset.id}
              className={`secondary preset-button${
                activePresetId === preset.id ? " is-active" : ""
              }`}
              disabled={busy}
              key={preset.id}
              onClick={() => loadPreset(preset)}
              type="button"
            >
              {loadingPresetId === preset.id ? "Loading..." : preset.label}
            </button>
          ))}
        </div>

        {(stepError || error) && (
          <p className="error" role="alert">
            {stepError || error}
          </p>
        )}
      </form>
    </StepShell>
  );
}
