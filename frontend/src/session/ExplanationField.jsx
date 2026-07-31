import CharacterCounter from "./CharacterCounter";
import { EXPLANATION_LIMIT, EXPLANATION_MINIMUM } from "./draft";

function MicrophoneIcon() {
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
      <rect height="12" rx="3" width="6" x="9" y="2" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </svg>
  );
}

export default function ExplanationField({
  id,
  value,
  onChange,
  disabled,
  isRecording,
  transcribing,
  voiceSupported,
  voiceError,
  voiceNotice,
  onStartRecording,
  onStopRecording,
  label = "Your explanation",
  textareaRef,
  className = "",
}) {
  return (
    <div className={`field field--explanation ${className}`.trim()}>
      <div className="field-heading">
        <label htmlFor={id}>{label}</label>
        {voiceSupported ? (
          <button
            className={`voice-button${isRecording ? " is-recording" : ""}`}
            disabled={transcribing || (disabled && !isRecording)}
            onClick={isRecording ? onStopRecording : onStartRecording}
            type="button"
          >
            <MicrophoneIcon />
            <span aria-hidden="true" className="voice-indicator" />
            {transcribing
              ? "Transcribing…"
              : isRecording
                ? "Stop recording"
                : "Record explanation"}
          </button>
        ) : null}
      </div>
      <textarea
        id={id}
        ref={textareaRef}
        className="explanation-textarea"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Explain the section in your own words…"
        maxLength={EXPLANATION_LIMIT + 1}
      />
      {voiceNotice && (
        <p className="voice-notice">Check the transcript before analyzing.</p>
      )}
      {voiceError && (
        <p className="voice-error" role="status">
          {voiceError}
        </p>
      )}
      <CharacterCounter
        value={value}
        healthyMinimum={EXPLANATION_MINIMUM}
        maximum={EXPLANATION_LIMIT}
      />
    </div>
  );
}

export { MicrophoneIcon };
