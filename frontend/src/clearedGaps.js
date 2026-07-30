import { getSupabaseClient } from "./supabase";

/*
 * Which gaps the learner has already explained again. The review deck is every
 * recorded gap minus these rows, so a cleared card never comes back on its own
 * and a gap recorded later on the same source still does. Only clearing is
 * stored: "still shaky" is a move inside a round, not a fact worth keeping.
 */

const DUPLICATE_KEY = "23505";

export function gapKey(sessionId, propId) {
  return `${sessionId}:${propId}`;
}

function asClearedGapsError(action, cause) {
  const error = new Error(cause?.message || `Cleared gaps could not ${action}.`);
  error.name = "ClearedGapsError";
  error.code = cause?.code;
  return error;
}

export function createClearedGaps(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("A Supabase browser client is required for cleared gaps.");
  }

  async function listCleared() {
    const { data, error } = await client
      .from("cleared_gaps")
      .select("session_id, prop_id, created_at")
      .order("created_at", { ascending: false });

    if (error) throw asClearedGapsError("load", error);
    return data || [];
  }

  async function clearGap({ sessionId, propId }) {
    const { error } = await client
      .from("cleared_gaps")
      .insert({ session_id: sessionId, prop_id: propId });

    /* Clearing the same gap twice is the same outcome, not a failure. */
    if (error && error.code !== DUPLICATE_KEY) {
      throw asClearedGapsError("be saved", error);
    }
    return { sessionId, propId };
  }

  return { listCleared, clearGap };
}

export function getClearedGaps() {
  return createClearedGaps(getSupabaseClient());
}

/*
 * Past rounds, newest first: one entry per source that has cleared gaps, with
 * the cards themselves so they can be studied again without reopening them.
 */
export function reviewHistory(sessions, cleared, allCards) {
  const clearedAt = new Map(
    (cleared || []).map((row) => [
      gapKey(row.session_id, row.prop_id),
      row.created_at,
    ]),
  );
  const bySession = new Map();

  (allCards || []).forEach((card) => {
    const when = clearedAt.get(card.id);
    if (!when) return;
    const entry = bySession.get(card.sessionId) || {
      sessionId: card.sessionId,
      sourceText: "",
      cards: [],
      lastClearedAt: "",
    };
    entry.cards.push(card);
    if (when > entry.lastClearedAt) entry.lastClearedAt = when;
    bySession.set(card.sessionId, entry);
  });

  (sessions || []).forEach((session) => {
    const entry = bySession.get(session.id);
    if (entry) entry.sourceText = session.source_text || "";
  });

  return [...bySession.values()].sort((left, right) =>
    right.lastClearedAt.localeCompare(left.lastClearedAt),
  );
}
