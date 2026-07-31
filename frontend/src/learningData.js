import { useEffect, useState } from "react";
import { getAnalysisHistory } from "./analysisHistory";
import { getClearedGaps } from "./clearedGaps";
import { deriveCards, outstandingCards } from "./flashcards";

/*
 * Saved sessions and cleared gaps are read by the sidebar badge, the dashboard,
 * the profile stats, and the review deck. One shared store means one round trip
 * on sign-in instead of four, and one refresh after an analysis is saved.
 */

const EMPTY = { sessions: [], cleared: [], cards: [], outstanding: [] };

let state = { status: "idle", ...EMPTY };
let inFlight = null;
const listeners = new Set();

function publish(next) {
  state = next;
  for (const listener of listeners) listener(state);
}

function load() {
  if (inFlight) return inFlight;
  publish({ ...state, status: state.status === "ready" ? "ready" : "loading" });
  inFlight = Promise.all([
    getAnalysisHistory().listSessions(),
    getClearedGaps().listCleared(),
  ])
    .then(([sessions, cleared]) => {
      const cards = deriveCards(sessions);
      publish({
        status: "ready",
        sessions,
        cleared,
        cards,
        outstanding: outstandingCards(cards, cleared),
      });
    })
    .catch(() => {
      publish({ ...state, status: "error" });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function refreshLearningData() {
  inFlight = null;
  return load();
}

/*
 * The review deck writes one row at a time. Refetching the whole history after
 * each card would be a round trip per swipe, so the cleared row is folded in
 * locally and the sidebar badge follows it down immediately.
 */
export function markGapCleared(sessionId, propId) {
  const already = state.cleared.some(
    (row) => row.session_id === sessionId && row.prop_id === propId,
  );
  if (already) return;
  const cleared = [
    {
      session_id: sessionId,
      prop_id: propId,
      created_at: new Date().toISOString(),
    },
    ...state.cleared,
  ];
  publish({
    ...state,
    cleared,
    outstanding: outstandingCards(state.cards, cleared),
  });
}

export function unmarkGapCleared(sessionId, propId) {
  const cleared = state.cleared.filter(
    (row) => !(row.session_id === sessionId && row.prop_id === propId),
  );
  if (cleared.length === state.cleared.length) return;
  publish({
    ...state,
    cleared,
    outstanding: outstandingCards(state.cards, cleared),
  });
}

/* Sign-out must not leave the next account looking at these rows. */
export function clearLearningData() {
  inFlight = null;
  publish({ status: "idle", ...EMPTY });
}

export function useLearningData() {
  const [snapshot, setSnapshot] = useState(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(state);
    if (state.status === "idle") load();
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return { ...snapshot, refresh: refreshLearningData };
}

export function __resetLearningDataForTests() {
  listeners.clear();
  inFlight = null;
  state = { status: "idle", ...EMPTY };
}
