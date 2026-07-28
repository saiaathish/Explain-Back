const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export async function analyze(source, explanation, signal) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, explanation }),
    signal,
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many analyses were submitted. Wait briefly, then try again.");
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
