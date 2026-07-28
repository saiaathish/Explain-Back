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
    throw new Error(payload.detail || "Analysis could not be completed. Check the text and try again.");
  }
  return payload;
}
