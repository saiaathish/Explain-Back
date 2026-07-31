import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyze,
  normalizeImage,
  retryAfterSeconds,
  transcribeAudio,
} from "./api";

function response(status, payload = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
  };
}

const modelRequests = [
  [
    "analysis",
    "/api/analyze",
    (signal, options) => analyze("source", "explanation", signal, options),
  ],
  [
    "transcription",
    "/api/transcribe",
    (signal, options) =>
      transcribeAudio("data:audio/webm;base64,AAAA", signal, options),
  ],
  [
    "image normalization",
    "/api/normalize-image",
    (signal, options) =>
      normalizeImage("data:image/png;base64,AAAA", signal, options),
  ],
];

describe("authenticated API requests", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(200, { text: "ok" })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the access token with analysis requests", async () => {
    await analyze("source", "explanation", undefined, {
      accessToken: "analysis-token",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/analyze$/),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer analysis-token",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("sends the access token with transcription requests", async () => {
    await transcribeAudio("data:audio/webm;base64,AAAA", undefined, {
      accessToken: "audio-token",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/transcribe$/),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer audio-token",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("sends the access token with image normalization requests", async () => {
    await normalizeImage("data:image/png;base64,AAAA", undefined, {
      accessToken: "image-token",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/normalize-image$/),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer image-token",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("does not emit an undefined bearer token", async () => {
    await analyze("source", "explanation");

    const [, request] = fetch.mock.calls[0];
    expect(request.headers).not.toHaveProperty("Authorization");
    expect(JSON.stringify(request.headers)).not.toContain("Bearer undefined");
  });

  it.each(modelRequests)(
    "refreshes and replays %s exactly once after a 401",
    async (_label, endpoint, request) => {
      const signal = new AbortController().signal;
      const refreshAccessToken = vi.fn(async () => "fresh-token");
      fetch
        .mockResolvedValueOnce(response(401, { detail: "expired" }))
        .mockResolvedValueOnce(response(200, { text: "ok" }));

      await request(signal, {
        accessToken: "stale-token",
        refreshAccessToken,
      });

      expect(refreshAccessToken).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledTimes(2);
      const [firstUrl, firstRequest] = fetch.mock.calls[0];
      const [secondUrl, secondRequest] = fetch.mock.calls[1];
      expect(firstUrl).toMatch(new RegExp(`${endpoint}$`));
      expect(secondUrl).toBe(firstUrl);
      expect(firstRequest.headers.Authorization).toBe("Bearer stale-token");
      expect(secondRequest.headers.Authorization).toBe("Bearer fresh-token");
      expect(secondRequest.body).toBe(firstRequest.body);
      expect(secondRequest.signal).toBe(signal);
      expect(secondRequest.body).not.toContain("refresh_token");
      expect(JSON.stringify(secondRequest.headers)).not.toContain(
        "browser-only-refresh-token",
      );
    },
  );

  it("does not loop when the replay also returns 401", async () => {
    const refreshAccessToken = vi.fn(async () => "fresh-token");
    fetch
      .mockResolvedValueOnce(response(401, { detail: "expired" }))
      .mockResolvedValueOnce(response(401, { detail: "still expired" }));

    await expect(
      analyze("source", "explanation", undefined, {
        accessToken: "stale-token",
        refreshAccessToken,
      }),
    ).rejects.toThrow("still expired");

    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("rate-limited analysis", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carries the server's wait and its reason back to the caller", async () => {
    globalThis.fetch.mockResolvedValue(
      response(
        429,
        { detail: "You can start one new source a minute." },
        { "retry-after": "42" },
      ),
    );

    await expect(analyze("source", "explanation")).rejects.toMatchObject({
      name: "RateLimitError",
      retryAfter: 42,
      message: "You can start one new source a minute.",
    });
  });

  it("falls back to a usable message when the server sends no detail", async () => {
    globalThis.fetch.mockResolvedValue(response(429, {}, {}));

    const failure = await analyze("source", "explanation").catch((error) => error);
    expect(failure.retryAfter).toBe(0);
    expect(failure.message).toMatch(/wait briefly/i);
  });

  it("reads only sane wait values", () => {
    expect(retryAfterSeconds("30")).toBe(30);
    expect(retryAfterSeconds(" 7 ")).toBe(7);
    expect(retryAfterSeconds(null)).toBe(0);
    expect(retryAfterSeconds("soon")).toBe(0);
    expect(retryAfterSeconds("-5")).toBe(0);
    /* A hostile or broken header must not freeze the button for an hour. */
    expect(retryAfterSeconds("99999")).toBe(300);
  });
});
