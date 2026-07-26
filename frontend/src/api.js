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
    throw new Error(payload.detail || "Analysis failed. Please try again.");
  }
  return payload;
}
