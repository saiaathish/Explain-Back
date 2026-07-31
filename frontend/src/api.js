const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function requestHeaders(accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken?.trim()) {
    headers.Authorization = `Bearer ${accessToken.trim()}`;
  }
  return headers;
}

async function modelRequest(path, body, signal, options) {
  const url = `${API_BASE}${path}`;
  const request = {
    method: "POST",
    headers: requestHeaders(options.accessToken),
    body: JSON.stringify(body),
    signal,
  };
  const response = await fetch(url, request);
  if (
    response.status !== 401 ||
    typeof options.refreshAccessToken !== "function"
  ) {
    return response;
  }

  const refreshedAccessToken = await options.refreshAccessToken();
  if (
    typeof refreshedAccessToken !== "string" ||
    !refreshedAccessToken.trim()
  ) {
    throw new Error(
      "Your anonymous session could not be refreshed. Return to the landing page and try again.",
    );
  }

  return fetch(url, {
    ...request,
    headers: requestHeaders(refreshedAccessToken),
  });
}

export function retryAfterSeconds(header) {
  const seconds = Number.parseInt(String(header ?? "").trim(), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  /* A minute is the longest window this app applies; ignore anything wilder. */
  return Math.min(seconds, 300);
}

function rateLimitError(message, header) {
  const error = new Error(message);
  error.name = "RateLimitError";
  error.retryAfter = retryAfterSeconds(header);
  return error;
}

export async function analyze(source, explanation, signal, options = {}) {
  const body = { source, explanation };
  if (options.focused) body.focused = true;
  const response = await modelRequest(
    "/api/analyze",
    body,
    signal,
    options,
  );
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) {
    if (response.status === 429) {
      /* The server knows when the budget frees up; the UI counts it down. */
      throw rateLimitError(
        payload.detail ||
          "Too many analyses were submitted. Wait briefly, then try again.",
        response.headers.get("retry-after"),
      );
    }
    if (response.status === 503) {
      throw new Error("The analysis service is not configured or available. Try again shortly.");
    }
    if (response.status === 504) {
      throw new Error("The analysis service took too long to respond. Try again with the same text.");
    }
    if (response.status === 502) {
      throw new Error("The analysis came back incomplete and was discarded rather than shown. Submit the same text again.");
    }
    if (response.status === 422) {
      throw new Error(
        /concept/i.test(payload.detail || "")
          ? "No teachable concepts could be pulled out of this source. Paste 2–3 paragraphs of explanatory prose rather than notes or headings, then try again."
          : "The explanation could not be split into checkable claims. Rewrite it as full sentences, one idea each, then try again.",
      );
    }
    throw new Error(payload.detail || "Analysis could not be completed. Check the text and try again.");
  }
  return payload;
}

export async function transcribeAudio(audioDataUrl, signal, options = {}) {
  const response = await modelRequest(
    "/api/transcribe",
    { audio_data_url: audioDataUrl },
    signal,
    options,
  );
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    throw new Error("The transcription service returned an unreadable response.");
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many requests were submitted. Wait briefly, then try again.");
    }
    throw new Error(
      payload.detail || "The recording could not be turned into text. You can still type your explanation.",
    );
  }
  return payload;
}

export async function normalizeImage(imageDataUrl, signal, options = {}) {
  const response = await modelRequest(
    "/api/normalize-image",
    { image_data_url: imageDataUrl },
    signal,
    options,
  );
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    throw new Error("The image service returned an unreadable response.");
  }
  if (!response.ok) {
    throw new Error(
      payload.detail || "The image could not be converted into editable source text.",
    );
  }
  return payload;
}
