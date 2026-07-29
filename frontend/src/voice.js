// Audio is captured locally and transcribed through the backend's single model
// boundary. No browser speech-recognition service is used, so recordings never
// reach a third party the rest of the pipeline does not already use.

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export function supportsRecording(target = globalThis) {
  return Boolean(
    target?.MediaRecorder && target?.navigator?.mediaDevices?.getUserMedia,
  );
}

export function preferredMimeType(target = globalThis) {
  const Recorder = target?.MediaRecorder;
  if (!Recorder) return "";
  // Safari exposes MediaRecorder without isTypeSupported; let it pick its default.
  if (typeof Recorder.isTypeSupported !== "function") return "";
  return CANDIDATE_MIME_TYPES.find((type) => Recorder.isTypeSupported(type)) || "";
}

export function blobToDataUrl(blob, target = globalThis) {
  return new Promise((resolve, reject) => {
    const reader = new target.FileReader();
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

export function stopStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    track.stop?.();
  }
}

export async function startRecorder(target = globalThis) {
  if (!supportsRecording(target)) {
    throw new Error("Recording is not supported in this browser.");
  }
  const stream = await target.navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = preferredMimeType(target);
  const recorder = new target.MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event?.data?.size) chunks.push(event.data);
  };

  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      stopStream(stream);
      resolve(new target.Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    };
    recorder.onerror = () => {
      stopStream(stream);
      reject(new Error("The microphone stopped unexpectedly."));
    };
  });

  recorder.start();
  return {
    stop() {
      if (recorder.state !== "inactive") recorder.stop();
      return stopped;
    },
    cancel() {
      if (recorder.state !== "inactive") recorder.stop();
      stopStream(stream);
    },
  };
}

export function appendTranscript(base, transcript) {
  const trimmedBase = (base || "").trim();
  const trimmedTranscript = (transcript || "").trim();
  if (!trimmedTranscript) return trimmedBase;
  return trimmedBase ? `${trimmedBase}\n\n${trimmedTranscript}` : trimmedTranscript;
}
