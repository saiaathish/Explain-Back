import { describe, expect, it, vi } from "vitest";
import {
  appendTranscript,
  blobToDataUrl,
  preferredMimeType,
  startRecorder,
  stopStream,
  supportsRecording,
} from "./voice";

function recorderTarget({ isTypeSupported, state = "recording" } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const instances = [];
  class MediaRecorder {
    static isTypeSupported = isTypeSupported;
    constructor(givenStream, options) {
      this.stream = givenStream;
      this.mimeType = options?.mimeType || "audio/webm";
      this.state = state;
      instances.push(this);
    }
    start() {
      this.started = true;
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: { size: 3 } });
      this.onstop?.();
    }
  }
  return {
    track,
    instances,
    target: {
      MediaRecorder,
      navigator: { mediaDevices: { getUserMedia: vi.fn(async () => stream) } },
      Blob: class {
        constructor(parts, options) {
          this.parts = parts;
          this.type = options?.type;
        }
      },
    },
  };
}

describe("recording adapter", () => {
  it("does not use any browser speech-recognition service", () => {
    const source = String(startRecorder) + String(supportsRecording);
    expect(source).not.toMatch(/SpeechRecognition/i);
  });

  it("detects MediaRecorder support", () => {
    expect(supportsRecording({})).toBe(false);
    const { target } = recorderTarget({ isTypeSupported: () => true });
    expect(supportsRecording(target)).toBe(true);
  });

  it("picks the first supported mime type and tolerates its absence", () => {
    const { target } = recorderTarget({
      isTypeSupported: (type) => type === "audio/ogg;codecs=opus",
    });
    expect(preferredMimeType(target)).toBe("audio/ogg;codecs=opus");
    const { target: safari } = recorderTarget({ isTypeSupported: undefined });
    expect(preferredMimeType(safari)).toBe("");
    expect(preferredMimeType({})).toBe("");
  });

  it("records, then releases the microphone track on stop", async () => {
    const { target, track, instances } = recorderTarget({
      isTypeSupported: () => true,
    });
    const session = await startRecorder(target);
    expect(instances[0].started).toBe(true);
    const blob = await session.stop();
    expect(blob.parts).toHaveLength(1);
    expect(track.stop).toHaveBeenCalled();
  });

  it("releases the microphone when cancelled", async () => {
    const { target, track } = recorderTarget({ isTypeSupported: () => true });
    const session = await startRecorder(target);
    session.cancel();
    expect(track.stop).toHaveBeenCalled();
  });

  it("rejects when recording is unsupported", async () => {
    await expect(startRecorder({})).rejects.toThrow(/not supported/i);
  });

  it("stopStream tolerates a missing stream", () => {
    expect(() => stopStream(null)).not.toThrow();
  });

  it("reads a blob into a data URL", async () => {
    const target = {
      FileReader: class {
        readAsDataURL() {
          this.result = "data:audio/webm;base64,AAAA";
          this.onload();
        }
      },
    };
    await expect(blobToDataUrl({}, target)).resolves.toBe(
      "data:audio/webm;base64,AAAA",
    );
  });

  it("appends a transcript below existing text", () => {
    expect(appendTranscript("ATP works", "because it binds")).toBe(
      "ATP works\n\nbecause it binds",
    );
    expect(appendTranscript("", "first pass")).toBe("first pass");
    expect(appendTranscript("kept", "   ")).toBe("kept");
  });
});
