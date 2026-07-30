import { getSupabaseClient } from "./supabase";

const ATTEMPT_COLUMNS =
  "id, session_id, attempt_number, explanation_text, concepts, flags, created_at";

function asPersistenceError(action, cause, sessionId) {
  const error = new Error(
    cause?.message || `Saved history could not ${action}.`,
  );
  error.name = "AnalysisHistoryError";
  error.code = cause?.code;
  if (sessionId) error.sessionId = sessionId;
  return error;
}

function analysisPayload(result) {
  return {
    concepts: Array.isArray(result?.concepts) ? result.concepts : [],
    flags: Array.isArray(result?.flags) ? result.flags : [],
  };
}

function requiredText(value, name) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required to save an analysis.`);
  return text;
}

function latestAttemptNumber(data) {
  return Number.isInteger(data?.attempt_number) ? data.attempt_number : 0;
}

export function sourcePreview(sourceText, maximum = 156) {
  const compact = String(sourceText || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maximum) return compact;
  return `${compact.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

export function attemptSummary(flags) {
  const items = Array.isArray(flags) ? flags : [];
  const solid = items.filter((flag) => flag?.state === "green").length;
  const needsAttention = items.filter((flag) =>
    ["yellow", "red"].includes(flag?.state),
  ).length;

  return {
    solid,
    needsAttention,
    total: items.length,
    coverageLabel:
      items.length > 0
        ? `${solid}/${items.length} claims hold up`
        : "No claim flags recorded",
  };
}

export function createAnalysisHistory(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("A Supabase browser client is required for saved history.");
  }

  async function createSession(sourceText) {
    const { data, error } = await client
      .from("sessions")
      .insert({ source_text: sourceText })
      .select("id, source_text, created_at")
      .single();

    if (error || !data?.id) {
      throw asPersistenceError("create a session", error);
    }

    return data;
  }

  async function nextAttemptNumber(sessionId) {
    const { data, error } = await client
      .from("explanation_attempts")
      .select("attempt_number")
      .eq("session_id", sessionId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw asPersistenceError("read the previous attempt", error, sessionId);
    }

    return latestAttemptNumber(data) + 1;
  }

  async function insertAttempt(sessionId, payload, attemptNumber) {
    const { data, error } = await client
      .from("explanation_attempts")
      .insert({
        session_id: sessionId,
        explanation_text: payload.explanationText,
        concepts: payload.concepts,
        flags: payload.flags,
        attempt_number: attemptNumber,
      })
      .select(ATTEMPT_COLUMNS)
      .single();

    if (error || !data?.id) {
      throw asPersistenceError("save this attempt", error, sessionId);
    }

    return data;
  }

  async function saveAnalysis({ sessionId, sourceText, explanationText, result }) {
    const normalizedSource = requiredText(sourceText, "Source text");
    const normalizedExplanation = requiredText(
      explanationText,
      "Explanation text",
    );
    const session = sessionId
      ? { id: sessionId, source_text: normalizedSource }
      : await createSession(normalizedSource);
    const payload = {
      explanationText: normalizedExplanation,
      ...analysisPayload(result),
    };

    try {
      let attemptNumber = await nextAttemptNumber(session.id);
      try {
        const attempt = await insertAttempt(session.id, payload, attemptNumber);
        return { session, attempt };
      } catch (error) {
        if (error?.code !== "23505") throw error;
        attemptNumber = await nextAttemptNumber(session.id);
        const attempt = await insertAttempt(session.id, payload, attemptNumber);
        return { session, attempt };
      }
    } catch (error) {
      if (error?.sessionId) throw error;
      throw asPersistenceError("save this attempt", error, session.id);
    }
  }

  async function listSessions() {
    const { data, error } = await client
      .from("sessions")
      .select(
        "id, source_text, created_at, explanation_attempts(id, explanation_text, flags, attempt_number, created_at)",
      )
      .order("created_at", { ascending: false });

    if (error) throw asPersistenceError("load past sessions", error);

    return (data || []).map((session) => ({
      ...session,
      explanation_attempts: [...(session.explanation_attempts || [])].sort(
        (left, right) => left.attempt_number - right.attempt_number,
      ),
    }));
  }

  return { listSessions, saveAnalysis };
}

export function getAnalysisHistory() {
  return createAnalysisHistory(getSupabaseClient());
}
