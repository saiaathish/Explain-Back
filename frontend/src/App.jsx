import { useEffect, useMemo, useRef, useState } from "react";
import { analyze, normalizeImage, transcribeAudio } from "./api";
import CalibrationMap from "./CalibrationMap";
import ConceptList from "./ConceptList";
import ConfidencePass from "./ConfidencePass";
import DiffStrip from "./DiffStrip";
import { calibrationSummary, sentenceRanges } from "./confidence";
import { diffRuns } from "./diff";
import FollowUp from "./FollowUp";
import Legend from "./Legend";
import Overlay from "./Overlay";
import {
  appendTranscript,
  blobToDataUrl,
  startRecorder,
  supportsRecording,
} from "./voice";

const STAGES = ["Reading source", "Extracting claims", "Checking against source"];
const ANALYSIS_TIMEOUT_MS = 90_000;
const MAX_RECORDING_MS = 180_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const PRESETS = [
  {
    id: "biology",
    label: "Biology",
    source: "/samples/source_sodium_pump.txt",
    explanation: "/samples/demo_video.txt",
  },
  {
    id: "economics",
    label: "Economics",
    source: "/samples/source_supply_demand.txt",
    explanation: "/samples/supply_demand_flawed.txt",
  },
  {
    id: "photosynthesis",
    label: "Photosynthesis",
    source: "/samples/source_photosynthesis.txt",
    explanation: "/samples/photosynthesis_flawed.txt",
  },
];

function Footer() {
  return (
    <footer>
      Formative guidance only. Not a grade. Explain-Back does not persist
      submissions.
    </footer>
  );
}

function validate(source, explanation, focused = false) {
  if (!source.trim() || !explanation.trim()) {
    return "Source or explanation is missing. Paste both texts, then try again.";
  }
  if (!focused && source.trim().length < 100) {
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

function trimRangeSnapshot(explanation, trimmed, ranges) {
  const leading = explanation.search(/\S|$/);
  return ranges
    .map((range) => ({
      start: range.start - leading,
      end: range.end - leading,
    }))
    .filter(
      (range) =>
        range.start >= 0 &&
        range.end > range.start &&
        range.end <= trimmed.length,
    );
}

function ExplanationField({
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
  maxLength = 4001,
  className = "",
}) {
  return (
    <div className={`field field--explanation ${className}`.trim()}>
      <div className="field-heading">
        <label htmlFor={id}>Your explanation</label>
        {voiceSupported ? (
          <button
            className={`voice-button${isRecording ? " is-recording" : ""}`}
            disabled={disabled || transcribing}
            onClick={isRecording ? onStopRecording : onStartRecording}
            type="button"
          >
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
        className="explanation-textarea"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Explain the section in your own words…"
        maxLength={maxLength}
      />
      {voiceNotice && <p className="voice-notice">Check the transcript before analyzing.</p>}
      {voiceError && <p className="voice-error" role="status">{voiceError}</p>}
      <small>{value.length} / 4,000 characters</small>
    </div>
  );
}

export default function App() {
  const [source, setSource] = useState("");
  const [explanation, setExplanation] = useState("");
  /* A run snapshot is `{ result, explanation, confidenceRanges }`: flags carry
     offsets, not claim text, so the diff needs the exact text each run scored. */
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [confidenceRanges, setConfidenceRanges] = useState([]);
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [presetLoading, setPresetLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageNotice, setImageNotice] = useState(false);
  const imageInputRef = useRef(null);
  const imageAbortRef = useRef(null);
  const [selectedConcept, setSelectedConcept] = useState(null);
  const [focusedExplanation, setFocusedExplanation] = useState("");
  const [focusedCurrent, setFocusedCurrent] = useState(null);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [focusedError, setFocusedError] = useState("");
  const abortRef = useRef(null);
  const focusedAbortRef = useRef(null);
  const reviseRef = useRef(null);
  const focusedRef = useRef(null);
  const resultsRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const transcribeAbortRef = useRef(null);
  const voiceBaseRef = useRef("");
  const recordingSupported = supportsRecording();

  const summary = useMemo(() => diffRuns(previous, current), [previous, current]);
  const calibration = useMemo(
    () =>
      current
        ? calibrationSummary(current.result.flags || [], current.confidenceRanges)
        : null,
    [current],
  );

  useEffect(() => {
    if (!current) return;
    resultsRef.current?.focus();
  }, [current]);

  useEffect(() => {
    if (selectedConcept && !focusedCurrent) {
      focusedRef.current?.focus();
    }
  }, [selectedConcept, focusedCurrent]);

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

  useEffect(
    () => () => {
      abortRef.current?.abort();
      focusedAbortRef.current?.abort();
      imageAbortRef.current?.abort();
      transcribeAbortRef.current?.abort();
      recorderRef.current?.cancel?.();
      window.clearTimeout(recordingTimeoutRef.current);
    },
    [],
  );

  function resetTransientState() {
    setCurrent(null);
    setPrevious(null);
    setConfidenceRanges([]);
    setRevising(false);
    setError("");
    setSelectedConcept(null);
    setFocusedExplanation("");
    setFocusedCurrent(null);
    setFocusedError("");
    setVoiceNotice(false);
    setVoiceError("");
    setImagePreview("");
    setImageError("");
    setImageNotice(false);
    imageAbortRef.current?.abort();
    transcribeAbortRef.current?.abort();
    setIsRecording(false);
    setTranscribing(false);

    window.clearTimeout(recordingTimeoutRef.current);
    recorderRef.current?.cancel?.();
    recorderRef.current = null;
  }

  async function normalizeSelectedImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    setImageNotice(false);
    if (!IMAGE_TYPES.has(file.type)) {
      setImageError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image is too large. Keep it under 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      setImagePreview(dataUrl);
      setImageLoading(true);
      const controller = new AbortController();
      imageAbortRef.current = controller;
      try {
        const result = await normalizeImage(dataUrl, controller.signal);
        setCurrent(null);
        setPrevious(null);
        setConfidenceRanges([]);
        setRevising(false);
        setSelectedConcept(null);
        setFocusedCurrent(null);
        setError("");
        setSource(result.text || "");
        setImageNotice(true);
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setImageError(requestError.message || "The image could not be read.");
        }
      } finally {
        setImageLoading(false);
        imageAbortRef.current = null;
      }
    };
    reader.onerror = () => setImageError("The image could not be read in this browser.");
    reader.readAsDataURL(file);
  }

  async function loadPreset(preset) {
    setPresetLoading(true);
    try {
      const [sourceResponse, explanationResponse] = await Promise.all([
        fetch(preset.source),
        fetch(preset.explanation),
      ]);
      if (!sourceResponse.ok || !explanationResponse.ok) {
        throw new Error("The selected subject preset could not be loaded.");
      }
      const [presetSource, presetExplanation] = await Promise.all([
        sourceResponse.text(),
        explanationResponse.text(),
      ]);
      resetTransientState();
      setSource(presetSource.trim());
      setExplanation(presetExplanation.trim());
    } catch (requestError) {
      setError(requestError.message || "The selected preset could not be loaded.");
    } finally {
      setPresetLoading(false);
    }
  }

  async function startRecording() {
    if (isRecording || transcribing) return;
    if (!recordingSupported) {
      setVoiceError("Recording is not supported in this browser. You can still type your explanation.");
      return;
    }

    voiceBaseRef.current = explanation.trim();
    setVoiceError("");
    setVoiceNotice(false);
    setConfidenceRanges([]);
    try {
      recorderRef.current = await startRecorder();
    } catch (recorderError) {
      recorderRef.current = null;
      setVoiceError(
        recorderError?.name === "NotAllowedError"
          ? "Microphone permission was denied. You can still type your explanation."
          : "The microphone could not be started. You can still type your explanation.",
      );
      return;
    }
    setIsRecording(true);
    recordingTimeoutRef.current = window.setTimeout(() => {
      setVoiceError("Recording stopped after three minutes. Check the transcript before analyzing.");
      stopRecording();
    }, MAX_RECORDING_MS);
  }

  async function stopRecording() {
    window.clearTimeout(recordingTimeoutRef.current);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) {
      setIsRecording(false);
      return;
    }
    setIsRecording(false);
    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      const audioDataUrl = await blobToDataUrl(blob);
      transcribeAbortRef.current?.abort();
      const controller = new AbortController();
      transcribeAbortRef.current = controller;
      const { text } = await transcribeAudio(audioDataUrl, controller.signal);
      const transcript = (text || "").trim();
      if (!transcript) {
        setVoiceError("No speech was detected in the recording. You can still type your explanation.");
        return;
      }
      setExplanation(appendTranscript(voiceBaseRef.current, transcript));
      setVoiceNotice(true);
    } catch (transcribeError) {
      if (transcribeError?.name === "AbortError") return;
      setVoiceError(
        transcribeError?.message ||
          "The recording could not be turned into text. You can still type your explanation.",
      );
    } finally {
      transcribeAbortRef.current = null;
      setTranscribing(false);
    }
  }

  function openConcept(concept) {
    setSelectedConcept(concept);
    setFocusedExplanation("");
    setFocusedCurrent(null);
    setFocusedError("");
  }

  function closeConcept() {
    focusedAbortRef.current?.abort();
    setSelectedConcept(null);
    setFocusedExplanation("");
    setFocusedCurrent(null);
    setFocusedError("");
  }

  async function submitFocused(event) {
    event.preventDefault();
    if (!selectedConcept) return;
    const validationError = validate(selectedConcept.anchor, focusedExplanation, true);
    if (validationError) {
      setFocusedError(validationError);
      return;
    }
    setFocusedError("");
    setFocusedLoading(true);
    const controller = new AbortController();
    focusedAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
    try {
      const trimmed = focusedExplanation.trim();
      const result = await analyze(selectedConcept.anchor.trim(), trimmed, controller.signal, {
        focused: true,
      });
      setFocusedCurrent({ result, explanation: trimmed });
    } catch (requestError) {
      setFocusedError(
        requestError.name === "AbortError"
          ? "The focused analysis timed out. Try again with the same explanation."
          : requestError instanceof TypeError
            ? "The analysis service could not be reached. Check your connection, then try again."
            : requestError.message,
      );
    } finally {
      window.clearTimeout(timeout);
      setFocusedLoading(false);
    }
  }

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
      () => setStage((currentStage) => Math.min(currentStage + 1, STAGES.length - 1)),
      1800,
    );
    const timeout = window.setTimeout(
      () => controller.abort(),
      ANALYSIS_TIMEOUT_MS,
    );
    try {
      const trimmed = explanation.trim();
      const runRanges = trimRangeSnapshot(explanation, trimmed, confidenceRanges);
      const result = await analyze(source.trim(), trimmed, controller.signal);
      /* One level of history, and this is all of it. */
      setPrevious(current);
      setCurrent({ result, explanation: trimmed, confidenceRanges: runRanges });
      setConfidenceRanges(runRanges);
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

  function beginRevision() {
    setRevising(true);
    setConfidenceRanges([]);
    setVoiceNotice(false);
    setVoiceError("");
  }

  return (
    <div className="app-shell">
      <header>
        <span className="brand">Explain-Back</span>
        <p>Explain it in your own words. See what holds up.</p>
      </header>

      <main>
        <form className="workspace" id="workspace-form" onSubmit={submit}>
          <label className="field field--source">
            <span>Source material</span>
            <div className="source-tools">
              <button
                className="voice-button"
                disabled={loading || presetLoading || imageLoading}
                onClick={() => imageInputRef.current?.click()}
                type="button"
              >
                {imageLoading ? "Reading image…" : "Add image source"}
              </button>
              <input
                ref={imageInputRef}
                className="image-input"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                onChange={normalizeSelectedImage}
                type="file"
              />
            </div>
            {imagePreview && (
              <div className="image-status">
                <img src={imagePreview} alt="Selected source preview" />
                <span>{imageNotice ? "Extracted text is ready to edit." : "Preparing editable text…"}</span>
              </div>
            )}
            {imageError && <p className="voice-error" role="alert">{imageError}</p>}
            <textarea
              className="source-textarea"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Paste 2–3 paragraphs of source material…"
              maxLength={6001}
            />
            <small>{source.length} / 6,000 characters</small>
            {imageNotice && <p className="image-notice">Check the extracted text before analyzing.</p>}
          </label>

          {!revising && (
            <>
              <ExplanationField
                id="explanation"
                value={explanation}
                onChange={(value) => {
                  setExplanation(value);
                  if (isRecording) setConfidenceRanges([]);
                }}
                disabled={loading || presetLoading}
                isRecording={isRecording}
                transcribing={transcribing}
                voiceSupported={recordingSupported}
                voiceError={voiceError}
                voiceNotice={voiceNotice}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
              />
              {(!current && !revising) && (
                <ConfidencePass
                  explanation={explanation}
                  selectedRanges={confidenceRanges}
                  onChange={setConfidenceRanges}
                />
              )}
            </>
          )}
          {!current && !source.trim() && !explanation.trim() && (
            <p className="empty-hint">
              Paste something you're studying, then explain it back without looking.
            </p>
          )}
          <div className="preset-group" aria-label="Subject presets">
            <span className="preset-label">Try a subject</span>
            {PRESETS.map((preset) => (
              <button
                className="secondary preset-button"
                disabled={loading || presetLoading}
                key={preset.id}
                onClick={() => loadPreset(preset)}
                type="button"
              >
                {presetLoading ? "Loading…" : preset.label}
              </button>
            ))}
          </div>
          <button className="primary" disabled={loading || presetLoading} type="submit">
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
          <section
            className="results"
            aria-label="Formative analysis"
            ref={resultsRef}
            tabIndex={-1}
          >
            <section className="result-region">
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
                    <textarea
                      ref={focusedRef}
                      value={focusedExplanation}
                      onChange={(event) => setFocusedExplanation(event.target.value)}
                      placeholder="Explain this concept in two or three sentences…"
                      maxLength={4001}
                    />
                    <div className="drill-down-actions">
                      <button className="primary" disabled={focusedLoading} type="submit">
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
            <section className="result-region result-region--overlay">
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
              />
              <CalibrationMap summary={calibration} />
              <Legend />
              {revising && (
                <div className="revise-panel">
                  <ExplanationField
                    id="revision-explanation"
                    value={explanation}
                    onChange={setExplanation}
                    disabled={loading}
                    isRecording={isRecording}
                    transcribing={transcribing}
                    voiceSupported={recordingSupported}
                    voiceError={voiceError}
                    voiceNotice={voiceNotice}
                    onStartRecording={startRecording}
                    onStopRecording={stopRecording}
                    className="revise-editor"
                  />
                  <ConfidencePass
                    explanation={explanation}
                    selectedRanges={confidenceRanges}
                    onChange={setConfidenceRanges}
                  />
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
                  onClick={beginRevision}
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

export { PRESETS, trimRangeSnapshot, validate };
