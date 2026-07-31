import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { analyze, normalizeImage, transcribeAudio } from "../api";
import { useAuth } from "../AuthContext";
import { getAnalysisHistory } from "../analysisHistory";
import { calibrationSummary } from "../confidence";
import { diffRuns } from "../diff";
import {
  appendTranscript,
  blobToDataUrl,
  startRecorder,
  supportsRecording,
} from "../voice";
import { trimRangeSnapshot, validateExplanation, validateFocused } from "./draft";

export const SUBMIT_STAGES = [
  "Reading the source",
  "Comparing your words",
  "Almost there.",
];
const SUBMIT_STAGE_INTERVAL_MS = 800;
const ANALYSIS_TIMEOUT_MS = 90_000;
const MAX_RECORDING_MS = 180_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const SessionContext = createContext(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider.");
  }
  return value;
}

/*
 * One draft, one analysis, shared by every step of the wizard. The provider
 * outlives the individual step screens on purpose: an in-flight analysis has to
 * survive the navigation from the confidence step to the analyzing screen, and
 * a draft has to survive the learner stepping back and forward again.
 */
export function SessionProvider({ children }) {
  const { accessToken, refreshAccessToken } = useAuth();

  const [source, setSource] = useState("");
  const [explanation, setExplanation] = useState("");
  const [confidenceRanges, setConfidenceRanges] = useState([]);

  /* A run snapshot is `{ result, explanation, confidenceRanges }`: flags carry
     offsets, not claim text, so the diff needs the exact text each run scored. */
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [resultRunId, setResultRunId] = useState(0);
  const [attemptNumber, setAttemptNumber] = useState(0);

  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [error, setError] = useState("");
  const [stage, setStage] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [savedSession, setSavedSession] = useState(null);
  const [historySaveError, setHistorySaveError] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  const [imagePreview, setImagePreview] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageNotice, setImageNotice] = useState(false);

  const [loadingPresetId, setLoadingPresetId] = useState(null);
  const [activePresetId, setActivePresetId] = useState(null);

  const [selectedConcept, setSelectedConcept] = useState(null);
  const [focusedExplanation, setFocusedExplanation] = useState("");
  const [focusedCurrent, setFocusedCurrent] = useState(null);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [focusedError, setFocusedError] = useState("");

  const mainRequestRef = useRef(null);
  const focusedRequestRef = useRef(null);
  const imageRequestRef = useRef(null);
  const presetRequestRef = useRef(null);
  const transcribeRequestRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingStartRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const voiceBaseRef = useRef("");
  const selectedConceptRef = useRef(selectedConcept);
  const resultRunIdRef = useRef(resultRunId);
  const mountedRef = useRef(true);

  selectedConceptRef.current = selectedConcept;
  resultRunIdRef.current = resultRunId;

  const recordingSupported = supportsRecording();
  const loading = analysisStatus === "running";
  const presetIsLoading = loadingPresetId !== null;
  const busy =
    loading || focusedLoading || presetIsLoading || imageLoading || transcribing;

  const summary = useMemo(() => diffRuns(previous, current), [previous, current]);
  const calibration = useMemo(
    () =>
      current
        ? calibrationSummary(current.result.flags || [], current.confidenceRanges)
        : null,
    [current],
  );

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
      if (imageRequest?.reader?.readyState === 1) imageRequest.reader.abort();

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

  /* Seconds until the analysis budget frees up, counted down from the 429's
     Retry-After so nobody submits into a wall they cannot see. */
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function abortMainRequest() {
    const request = mainRequestRef.current;
    if (!request) return;
    mainRequestRef.current = null;
    request.controller.abort();
    window.clearInterval(request.stageTimer);
    window.clearTimeout(request.timeout);
    if (mountedRef.current) {
      setAnalysisStatus("idle");
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
    if (request.reader?.readyState === 1) request.reader.abort();
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

  const closeConcept = useCallback(() => {
    abortFocusedRequest();
    setSelectedConcept(null);
    setFocusedExplanation("");
    setFocusedCurrent(null);
    setFocusedError("");
  }, []);

  function stopVoice() {
    window.clearTimeout(recordingTimeoutRef.current);
    recordingStartRef.current = null;
    recorderRef.current?.cancel?.();
    recorderRef.current = null;
    abortTranscription();
    setIsRecording(false);
  }

  const updateSource = useCallback((value) => {
    setSource(value);
    setActivePresetId(null);
  }, []);

  const updateExplanation = useCallback((value) => {
    setExplanation(value);
    setActivePresetId(null);
  }, []);

  /*
   * Stepping back to the source discards the explanation. Seeing the material
   * again after you have already committed words to it is the exact bias this
   * flow exists to remove, so the words go rather than the honesty.
   */
  const discardExplanation = useCallback(() => {
    stopVoice();
    abortMainRequest();
    setExplanation("");
    setConfidenceRanges([]);
    setVoiceNotice(false);
    setVoiceError("");
    setError("");
  }, []);

  /* A fresh session: nothing from the last one is allowed to leak forward. */
  const startNewSession = useCallback(() => {
    stopVoice();
    abortMainRequest();
    abortImageRequest();
    abortPresetRequest();
    closeConcept();
    setSource("");
    setExplanation("");
    setConfidenceRanges([]);
    setCurrent(null);
    setPrevious(null);
    setAttemptNumber(0);
    setAnalysisStatus("idle");
    setError("");
    setHistorySaveError("");
    setSavedSession(null);
    setImagePreview("");
    setImageError("");
    setImageNotice(false);
    setVoiceNotice(false);
    setVoiceError("");
    setActivePresetId(null);
  }, [closeConcept]);

  /*
   * A revision keeps the source and the previous run — that is what the diff
   * strip compares against — but returns the learner to the record step with
   * the source out of sight again.
   */
  const beginRevision = useCallback(() => {
    closeConcept();
    setConfidenceRanges([]);
    setAnalysisStatus("idle");
    setError("");
    setHistorySaveError("");
    setVoiceNotice(false);
    setVoiceError("");
  }, [closeConcept]);

  async function selectImage(event) {
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
        const result = await normalizeImage(dataUrl, controller.signal, {
          accessToken,
          refreshAccessToken,
        });
        if (!mountedRef.current || imageRequestRef.current !== request) return;
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
    const controller = new AbortController();
    const request = { controller, presetId: preset.id };
    presetRequestRef.current = request;
    setLoadingPresetId(preset.id);
    setError("");
    try {
      const response = await fetch(preset.source, { signal: controller.signal });
      if (!response.ok) {
        throw new Error("The selected subject preset could not be loaded.");
      }
      const presetSource = await response.text();
      if (!mountedRef.current || presetRequestRef.current !== request) return;
      setImagePreview("");
      setImageNotice(false);
      setImageError("");
      setSource(presetSource.trim());
      setActivePresetId(preset.id);
    } catch (requestError) {
      if (
        mountedRef.current &&
        presetRequestRef.current === request &&
        requestError.name !== "AbortError"
      ) {
        setError(
          requestError.message || "The selected preset could not be loaded.",
        );
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
      setVoiceError(
        "Recording is not supported in this browser. You can still type your explanation.",
      );
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
      if (!mountedRef.current || recordingStartRef.current !== startRequest) {
        return;
      }
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
      setVoiceError(
        "Recording stopped after three minutes. Check the transcript before analyzing.",
      );
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
      const { text } = await transcribeAudio(audioDataUrl, controller.signal, {
        accessToken,
        refreshAccessToken,
      });
      if (!mountedRef.current || transcribeRequestRef.current !== request) return;
      const transcript = (text || "").trim();
      if (!transcript) {
        setVoiceError(
          "No speech was detected in the recording. You can still type your explanation.",
        );
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

  /*
   * Called by the analyzing screen on mount. It has to be safe to call twice —
   * StrictMode mounts effects twice in development, and a second analysis would
   * spend a second slice of the learner's budget for the same words.
   */
  const runAnalysis = useCallback(async () => {
    if (mainRequestRef.current) return mainRequestRef.current.promise;
    const validationError = validateExplanation(explanation);
    if (validationError) {
      setError(validationError);
      setAnalysisStatus("error");
      return null;
    }

    setError("");
    setHistorySaveError("");
    abortFocusedRequest();
    setAnalysisStatus("running");
    setStage(0);
    const controller = new AbortController();
    const request = { controller, stageTimer: null, timeout: null, promise: null };
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

    request.promise = (async () => {
      try {
        const trimmed = explanation.trim();
        const runRanges = trimRangeSnapshot(
          explanation,
          trimmed,
          confidenceRanges,
        );
        const sourceText = source.trim();
        const result = await analyze(sourceText, trimmed, controller.signal, {
          accessToken,
          refreshAccessToken,
        });
        if (controller.signal.aborted) {
          throw new DOMException("The request was aborted.", "AbortError");
        }
        if (!mountedRef.current || mainRequestRef.current !== request) return null;
        /* One level of history, and this is all of it. */
        closeConcept();
        setPrevious(current);
        setCurrent({ result, explanation: trimmed, confidenceRanges: runRanges });
        setResultRunId((runId) => runId + 1);
        setAttemptNumber((count) => count + 1);
        setConfidenceRanges(runRanges);
        setAnalysisStatus("done");
        try {
          const saved = await getAnalysisHistory().saveAnalysis({
            sessionId:
              savedSession?.sourceText === sourceText
                ? savedSession.id
                : undefined,
            sourceText,
            explanationText: trimmed,
            result,
          });
          if (mountedRef.current) {
            setSavedSession({ id: saved.session.id, sourceText });
          }
        } catch (saveError) {
          if (mountedRef.current) {
            if (saveError?.sessionId) {
              setSavedSession({ id: saveError.sessionId, sourceText });
            }
            setHistorySaveError(
              "Your analysis is ready, but it could not be saved to history. Try revising once more after checking your connection.",
            );
          }
        }
        return "done";
      } catch (requestError) {
        if (!mountedRef.current || mainRequestRef.current !== request) return null;
        if (requestError.name === "RateLimitError" && requestError.retryAfter) {
          setCooldown(requestError.retryAfter);
        }
        setError(
          requestError.name === "AbortError"
            ? "The analysis request timed out. Try again with the same text."
            : requestError instanceof TypeError
              ? "The analysis service could not be reached. Check your connection, then try again."
              : requestError.message,
        );
        setAnalysisStatus("error");
        return "error";
      } finally {
        window.clearInterval(request.stageTimer);
        window.clearTimeout(request.timeout);
        if (mainRequestRef.current === request) mainRequestRef.current = null;
      }
    })();

    return request.promise;
  }, [
    accessToken,
    closeConcept,
    confidenceRanges,
    current,
    explanation,
    refreshAccessToken,
    savedSession,
    source,
  ]);

  const openConcept = useCallback((concept) => {
    abortFocusedRequest();
    setSelectedConcept(concept);
    setFocusedExplanation("");
    setFocusedCurrent(null);
    setFocusedError("");
  }, []);

  async function submitFocused(event) {
    event.preventDefault();
    if (!selectedConcept) return;
    const validationError = validateFocused(
      selectedConcept.anchor,
      focusedExplanation,
    );
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
      const result = await analyze(
        selectedConcept.anchor.trim(),
        trimmed,
        controller.signal,
        { accessToken, focused: true, refreshAccessToken },
      );
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

  const value = {
    /* draft */
    source,
    explanation,
    confidenceRanges,
    updateSource,
    updateExplanation,
    setConfidenceRanges,
    discardExplanation,
    startNewSession,
    beginRevision,
    attemptNumber,
    /* analysis */
    analysisStatus,
    current,
    previous,
    resultRunId,
    summary,
    calibration,
    runAnalysis,
    loading,
    stage,
    error,
    setError,
    cooldown,
    historySaveError,
    busy,
    /* voice */
    isRecording,
    transcribing,
    voiceNotice,
    voiceError,
    recordingSupported,
    startRecording,
    stopRecording,
    /* image */
    imagePreview,
    imageLoading,
    imageError,
    imageNotice,
    selectImage,
    /* presets */
    loadingPresetId,
    activePresetId,
    loadPreset,
    /* drill-down */
    selectedConcept,
    focusedExplanation,
    setFocusedExplanation,
    focusedCurrent,
    focusedLoading,
    focusedError,
    openConcept,
    closeConcept,
    submitFocused,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
