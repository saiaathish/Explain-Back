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

const SUBMIT_STAGES = [
  "Reading the source",
  "Comparing your words",
  "Almost there.",
];
const SUBMIT_STAGE_INTERVAL_MS = 800;
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

function CharacterCounter({ value, maximum, healthyMinimum }) {
  const current = value.length;
  const validationLength = value.trim().length;
  const isWarning = current >= maximum * 0.9;
  const progress = Math.min(
    100,
    Math.max(0, (validationLength / healthyMinimum) * 100),
  );
  const className = [
    "character-counter",
    validationLength >= healthyMinimum ? "is-healthy" : "",
    isWarning ? "is-warning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <small
      className={className}
      style={{ "--counter-progress": `${progress}%` }}
    >
      {isWarning ? "Near limit — " : ""}
      {current} / {maximum.toLocaleString("en-US")} characters
    </small>
  );
}

function toDomIdFragment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-") || "concept";
}

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
        className="explanation-textarea"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Explain the section in your own words…"
        maxLength={maxLength}
      />
      {voiceNotice && <p className="voice-notice">Check the transcript before analyzing.</p>}
      {voiceError && <p className="voice-error" role="status">{voiceError}</p>}
      <CharacterCounter value={value} healthyMinimum={40} maximum={4000} />
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
  const [resultRunId, setResultRunId] = useState(0);
  const [confidenceRanges, setConfidenceRanges] = useState([]);
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPresetId, setLoadingPresetId] = useState(null);
  const [activePresetId, setActivePresetId] = useState(null);
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
  const imageRequestRef = useRef(null);
  const [selectedConcept, setSelectedConcept] = useState(null);
  const [focusedExplanation, setFocusedExplanation] = useState("");
  const [focusedCurrent, setFocusedCurrent] = useState(null);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [focusedError, setFocusedError] = useState("");
  const mainRequestRef = useRef(null);
  const focusedRequestRef = useRef(null);
  const selectedConceptRef = useRef(selectedConcept);
  const resultRunIdRef = useRef(resultRunId);
  const presetRequestRef = useRef(null);
  const reviseRef = useRef(null);
  const focusedRef = useRef(null);
  const resultsRef = useRef(null);
  const overlaySectionRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingStartRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const transcribeRequestRef = useRef(null);
  const voiceBaseRef = useRef("");
  const mountedRef = useRef(true);
  const recordingSupported = supportsRecording();
  const presetIsLoading = loadingPresetId !== null;
  const interactionBusy =
    loading ||
    focusedLoading ||
    presetIsLoading ||
    imageLoading ||
    transcribing ||
    isRecording;
  const addImageBusy =
    loading || presetIsLoading || transcribing || isRecording;
  const focusedExplanationId = selectedConcept
    ? `focused-explanation-${toDomIdFragment(selectedConcept.id)}`
    : "focused-explanation";
  selectedConceptRef.current = selectedConcept;
  resultRunIdRef.current = resultRunId;

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
    resultsRef.current?.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    overlaySectionRef.current?.scrollIntoView?.({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const mainRequest = mainRequestRef.current;
      mainRequestRef.current = null;
      mainRequest?.controller.abort();
      window.clearInterval(mainRequest?.stageTimer);
      window.clearTimeout(mainRequest?.timeout);

      const focusedRequest = focusedRequestRef.current;
      focusedRequestRef.current = null;
      focusedRequest?.controller.abort();
      window.clearTimeout(focusedRequest?.timeout);

      const imageRequest = imageRequestRef.current;
      imageRequestRef.current = null;
      imageRequest?.controller?.abort();
      if (imageRequest?.reader?.readyState === 1) {
        imageRequest.reader.abort();
      }

      const presetRequest = presetRequestRef.current;
      presetRequestRef.current = null;
      presetRequest?.controller.abort();

      recordingStartRef.current = null;
      const transcribeRequest = transcribeRequestRef.current;
      transcribeRequestRef.current = null;
      transcribeRequest?.controller.abort();
      recorderRef.current?.cancel?.();
      recorderRef.current = null;
      window.clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  function abortMainRequest() {
    const request = mainRequestRef.current;
    if (!request) return;
    mainRequestRef.current = null;
    request.controller.abort();
    window.clearInterval(request.stageTimer);
    window.clearTimeout(request.timeout);
    if (mountedRef.current) {
      setLoading(false);
      setStage(0);
    }
  }

  function abortFocusedRequest() {
    const request = focusedRequestRef.current;
    if (!request) return;
    focusedRequestRef.current = null;
    request.controller.abort();
    window.clearTimeout(request.timeout);
    if (mountedRef.current) setFocusedLoading(false);
  }

  function abortImageRequest() {
    const request = imageRequestRef.current;
    if (!request) return;
    imageRequestRef.current = null;
    request.controller?.abort();
    if (request.reader?.readyState === 1) {
      request.reader.abort();
    }
    if (mountedRef.current) setImageLoading(false);
  }

  function abortPresetRequest() {
    const request = presetRequestRef.current;
    if (!request) return;
    presetRequestRef.current = null;
    request.controller.abort();
    if (mountedRef.current) setLoadingPresetId(null);
  }

  function abortTranscription() {
    const request = transcribeRequestRef.current;
    if (!request) return;
    transcribeRequestRef.current = null;
    request.controller.abort();
    if (mountedRef.current) setTranscribing(false);
  }

  function resetFocusedState() {
    abortFocusedRequest();
    setSelectedConcept(null);
    setFocusedExplanation("");
    setFocusedCurrent(null);
    setFocusedError("");
  }

  function resetAnalysisState() {
    abortMainRequest();
    resetFocusedState();
    setCurrent(null);
    setPrevious(null);
    setConfidenceRanges([]);
    setRevising(false);
    setError("");
  }

  function resetTransientState() {
    resetAnalysisState();
    setVoiceNotice(false);
    setVoiceError("");
    setImagePreview("");
    setImageError("");
    setImageNotice(false);
    abortImageRequest();
    abortTranscription();
    recordingStartRef.current = null;
    setIsRecording(false);

    window.clearTimeout(recordingTimeoutRef.current);
    recorderRef.current?.cancel?.();
    recorderRef.current = null;
  }

  function updateSource(value) {
    setSource(value);
    setActivePresetId(null);
  }

  function updateExplanation(value) {
    setExplanation(value);
    setActivePresetId(null);
  }

  async function normalizeSelectedImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    abortImageRequest();
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
    abortPresetRequest();
    abortMainRequest();
    resetFocusedState();
    setImagePreview("");
    const reader = new FileReader();
    const request = { reader, controller: null };
    imageRequestRef.current = request;
    setImageLoading(true);
    reader.onload = async () => {
      if (!mountedRef.current || imageRequestRef.current !== request) return;
      const dataUrl = String(reader.result || "");
      setImagePreview(dataUrl);
      const controller = new AbortController();
      request.controller = controller;
      try {
        const result = await normalizeImage(dataUrl, controller.signal);
        if (!mountedRef.current || imageRequestRef.current !== request) return;
        resetAnalysisState();
        updateSource(result.text || "");
        setImageNotice(true);
      } catch (requestError) {
        if (
          mountedRef.current &&
          imageRequestRef.current === request &&
          requestError.name !== "AbortError"
        ) {
          setImageError(requestError.message || "The image could not be read.");
        }
      } finally {
        if (mountedRef.current && imageRequestRef.current === request) {
          imageRequestRef.current = null;
          setImageLoading(false);
        }
      }
    };
    reader.onerror = () => {
      if (!mountedRef.current || imageRequestRef.current !== request) return;
      imageRequestRef.current = null;
      setImageError("The image could not be read in this browser.");
      setImageLoading(false);
    };
    reader.onabort = () => {
      if (!mountedRef.current || imageRequestRef.current !== request) return;
      imageRequestRef.current = null;
      setImageLoading(false);
    };
    try {
      reader.readAsDataURL(file);
    } catch {
      if (imageRequestRef.current === request) {
        imageRequestRef.current = null;
        setImageError("The image could not be read in this browser.");
        setImageLoading(false);
      }
    }
  }

  async function loadPreset(preset) {
    abortPresetRequest();
    abortImageRequest();
    abortMainRequest();
    resetFocusedState();
    const controller = new AbortController();
    const request = { controller, presetId: preset.id };
    presetRequestRef.current = request;
    setLoadingPresetId(preset.id);
    try {
      const [sourceResponse, explanationResponse] = await Promise.all([
        fetch(preset.source, { signal: controller.signal }),
        fetch(preset.explanation, { signal: controller.signal }),
      ]);
      if (!sourceResponse.ok || !explanationResponse.ok) {
        throw new Error("The selected subject preset could not be loaded.");
      }
      const [presetSource, presetExplanation] = await Promise.all([
        sourceResponse.text(),
        explanationResponse.text(),
      ]);
      if (!mountedRef.current || presetRequestRef.current !== request) return;
      resetTransientState();
      setSource(presetSource.trim());
      setExplanation(presetExplanation.trim());
      setActivePresetId(preset.id);
    } catch (requestError) {
      if (
        mountedRef.current &&
        presetRequestRef.current === request &&
        requestError.name !== "AbortError"
      ) {
        setError(requestError.message || "The selected preset could not be loaded.");
      }
    } finally {
      if (mountedRef.current && presetRequestRef.current === request) {
        presetRequestRef.current = null;
        setLoadingPresetId(null);
      }
    }
  }

  async function startRecording() {
    if (isRecording || transcribing || recordingStartRef.current) return;
    if (!recordingSupported) {
      setVoiceError("Recording is not supported in this browser. You can still type your explanation.");
      return;
    }

    const startRequest = {};
    recordingStartRef.current = startRequest;
    voiceBaseRef.current = explanation.trim();
    setVoiceError("");
    setVoiceNotice(false);
    setConfidenceRanges([]);
    setIsRecording(true);
    try {
      const recorder = await startRecorder();
      if (!mountedRef.current || recordingStartRef.current !== startRequest) {
        recorder.cancel?.();
        return;
      }
      recorderRef.current = recorder;
    } catch (recorderError) {
      if (!mountedRef.current || recordingStartRef.current !== startRequest) return;
      recordingStartRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
      setVoiceError(
        recorderError?.name === "NotAllowedError"
          ? "Microphone permission was denied. You can still type your explanation."
          : "The microphone could not be started. You can still type your explanation.",
      );
      return;
    }
    recordingStartRef.current = null;
    recordingTimeoutRef.current = window.setTimeout(() => {
      setVoiceError("Recording stopped after three minutes. Check the transcript before analyzing.");
      stopRecording();
    }, MAX_RECORDING_MS);
  }

  async function stopRecording() {
    window.clearTimeout(recordingTimeoutRef.current);
    recordingStartRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) {
      setIsRecording(false);
      return;
    }
    setIsRecording(false);
    abortTranscription();
    const controller = new AbortController();
    const request = { controller };
    transcribeRequestRef.current = request;
    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      const audioDataUrl = await blobToDataUrl(blob);
      if (!mountedRef.current || transcribeRequestRef.current !== request) return;
      const { text } = await transcribeAudio(audioDataUrl, controller.signal);
      if (!mountedRef.current || transcribeRequestRef.current !== request) return;
      const transcript = (text || "").trim();
      if (!transcript) {
        setVoiceError("No speech was detected in the recording. You can still type your explanation.");
        return;
      }
      updateExplanation(appendTranscript(voiceBaseRef.current, transcript));
      setVoiceNotice(true);
    } catch (transcribeError) {
      if (!mountedRef.current || transcribeRequestRef.current !== request) return;
      if (transcribeError?.name === "AbortError") return;
      setVoiceError(
        transcribeError?.message ||
          "The recording could not be turned into text. You can still type your explanation.",
      );
    } finally {
      if (mountedRef.current && transcribeRequestRef.current === request) {
        transcribeRequestRef.current = null;
        setTranscribing(false);
      }
    }
  }

  function openConcept(concept) {
    abortFocusedRequest();
    setSelectedConcept(concept);
    setFocusedExplanation("");
    setFocusedCurrent(null);
    setFocusedError("");
  }

  function closeConcept() {
    resetFocusedState();
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
    abortFocusedRequest();
    setFocusedLoading(true);
    const controller = new AbortController();
    const request = {
      conceptId: selectedConcept.id,
      controller,
      runId: resultRunId,
      timeout: null,
    };
    focusedRequestRef.current = request;
    request.timeout = window.setTimeout(
      () => controller.abort(),
      ANALYSIS_TIMEOUT_MS,
    );
    try {
      const trimmed = focusedExplanation.trim();
      const result = await analyze(selectedConcept.anchor.trim(), trimmed, controller.signal, {
        focused: true,
      });
      if (controller.signal.aborted) {
        throw new DOMException("The request was aborted.", "AbortError");
      }
      if (
        !mountedRef.current ||
        focusedRequestRef.current !== request ||
        request.conceptId !== selectedConceptRef.current?.id ||
        request.runId !== resultRunIdRef.current
      ) {
        return;
      }
      setFocusedCurrent({ result, explanation: trimmed });
    } catch (requestError) {
      if (!mountedRef.current || focusedRequestRef.current !== request) return;
      setFocusedError(
        requestError.name === "AbortError"
          ? "The focused analysis timed out. Try again with the same explanation."
          : requestError instanceof TypeError
            ? "The analysis service could not be reached. Check your connection, then try again."
            : requestError.message,
      );
    } finally {
      window.clearTimeout(request.timeout);
      if (mountedRef.current && focusedRequestRef.current === request) {
        focusedRequestRef.current = null;
        setFocusedLoading(false);
      }
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
    abortMainRequest();
    abortFocusedRequest();
    setLoading(true);
    setStage(0);
    const controller = new AbortController();
    const request = {
      controller,
      stageTimer: null,
      timeout: null,
    };
    mainRequestRef.current = request;
    request.stageTimer = window.setInterval(
      () =>
        mountedRef.current &&
        mainRequestRef.current === request &&
        setStage((currentStage) =>
          Math.min(currentStage + 1, SUBMIT_STAGES.length - 1),
        ),
      SUBMIT_STAGE_INTERVAL_MS,
    );
    request.timeout = window.setTimeout(
      () => controller.abort(),
      ANALYSIS_TIMEOUT_MS,
    );
    try {
      const trimmed = explanation.trim();
      const runRanges = trimRangeSnapshot(explanation, trimmed, confidenceRanges);
      const result = await analyze(source.trim(), trimmed, controller.signal);
      if (controller.signal.aborted) {
        throw new DOMException("The request was aborted.", "AbortError");
      }
      if (!mountedRef.current || mainRequestRef.current !== request) return;
      /* One level of history, and this is all of it. */
      resetFocusedState();
      setPrevious(current);
      setCurrent({ result, explanation: trimmed, confidenceRanges: runRanges });
      setResultRunId((runId) => runId + 1);
      setConfidenceRanges(runRanges);
      setRevising(false);
    } catch (requestError) {
      if (!mountedRef.current || mainRequestRef.current !== request) return;
      setError(
        requestError.name === "AbortError"
          ? "The analysis request timed out. Try again with the same text."
          : requestError instanceof TypeError
            ? "The analysis service could not be reached. Check your connection, then try again."
            : requestError.message,
      );
    } finally {
      window.clearInterval(request.stageTimer);
      window.clearTimeout(request.timeout);
      if (mountedRef.current && mainRequestRef.current === request) {
        mainRequestRef.current = null;
        setLoading(false);
      }
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
        <h1 className="brand">
          Explain<span className="brand-accent">-</span>Back
        </h1>
        <p>Explain it in your own words. See what holds up.</p>
      </header>

      <main>
        <form className="workspace" id="workspace-form" onSubmit={submit}>
          <div className="field field--source">
            <label htmlFor="source">Source material</label>
            <div className="source-tools">
              <button
                aria-label={imageLoading ? "Reading image…" : "Add image source"}
                className="voice-button"
                disabled={addImageBusy}
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
                disabled={addImageBusy}
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
              id="source"
              className="source-textarea"
              disabled={interactionBusy}
              value={source}
              onChange={(event) => updateSource(event.target.value)}
              placeholder="Paste 2–3 paragraphs of source material…"
              maxLength={6001}
            />
            <CharacterCounter value={source} healthyMinimum={100} maximum={6000} />
            {imageNotice && <p className="image-notice">Check the extracted text before analyzing.</p>}
          </div>

          {!revising && (
            <>
              <ExplanationField
                id="explanation"
                value={explanation}
                onChange={(value) => {
                  updateExplanation(value);
                  if (isRecording) setConfidenceRanges([]);
                }}
                disabled={interactionBusy}
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
                  disabled={interactionBusy}
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
                aria-label={
                  loadingPresetId === preset.id
                    ? `Loading ${preset.label}…`
                    : undefined
                }
                aria-pressed={activePresetId === preset.id}
                className={`secondary preset-button${
                  activePresetId === preset.id ? " is-active" : ""
                }`}
                disabled={interactionBusy}
                key={preset.id}
                onClick={() => loadPreset(preset)}
                type="button"
              >
                {loadingPresetId === preset.id ? "Loading..." : preset.label}
              </button>
            ))}
          </div>
          <button className="primary" disabled={interactionBusy} type="submit">
            {loading ? SUBMIT_STAGES[stage] : "Check my explanation"}
          </button>
        </form>

        {loading && (
          <>
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
            <p
              aria-atomic="true"
              aria-live="polite"
              className="sr-only"
              role="status"
            >
              {SUBMIT_STAGES[stage]}
            </p>
          </>
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
            data-result-run={resultRunId}
            id={`analysis-result-${resultRunId}`}
            key={resultRunId}
            ref={resultsRef}
            tabIndex={-1}
          >
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
                      disabled={focusedLoading || interactionBusy}
                      value={focusedExplanation}
                      onChange={(event) => setFocusedExplanation(event.target.value)}
                      placeholder="Explain this concept in two or three sentences…"
                      maxLength={4001}
                    />
                    <div className="drill-down-actions">
                      <button
                        className="primary"
                        disabled={focusedLoading || interactionBusy}
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
            <section
              className="result-region result-region--overlay result-group result-group--overlay"
              ref={overlaySectionRef}
            >
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
              {revising && (
                <div className="revise-panel">
                  <ExplanationField
                    id="revision-explanation"
                    value={explanation}
                    onChange={updateExplanation}
                    disabled={interactionBusy}
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
                    disabled={interactionBusy}
                  />
                  <button
                    className="primary"
                    disabled={interactionBusy}
                    type="submit"
                    form="workspace-form"
                  >
                    {loading ? SUBMIT_STAGES[stage] : "Check my revision"}
                  </button>
                </div>
              )}
            </section>
            <section className="result-region result-region--forward result-group result-group--forward">
              <h2>How to move forward</h2>
              <FollowUp question={current.result.follow_up} />
              {!revising && (
                <button
                  className="secondary revise-button"
                  disabled={interactionBusy}
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
