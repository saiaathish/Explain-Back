import { attemptSummary } from "./analysisHistory";

/*
 * Everything on the profile is derived from rows the app already stores. No new
 * tables, no new endpoint — if a number here cannot be recomputed from saved
 * sessions and cleared gaps, it does not belong on the page.
 */

function coverageRatio(flags) {
  const summary = attemptSummary(flags);
  if (!summary.total) return null;
  return summary.solid / summary.total;
}

export function learningStats(sessions = [], cards = [], cleared = []) {
  const attempts = sessions.flatMap(
    (session) => session.explanation_attempts || [],
  );
  const revised = sessions.filter(
    (session) => (session.explanation_attempts || []).length > 1,
  ).length;

  /* One row per source, scored on its most recent attempt. */
  const latestRatios = sessions
    .map((session) => {
      const list = session.explanation_attempts || [];
      return coverageRatio(list[list.length - 1]?.flags);
    })
    .filter((ratio) => ratio !== null);

  const averageCoverage = latestRatios.length
    ? latestRatios.reduce((total, ratio) => total + ratio, 0) /
      latestRatios.length
    : null;

  /* Only sessions the learner actually revised can show movement. */
  const deltas = sessions
    .map((session) => {
      const list = session.explanation_attempts || [];
      if (list.length < 2) return null;
      const first = coverageRatio(list[0]?.flags);
      const last = coverageRatio(list[list.length - 1]?.flags);
      if (first === null || last === null) return null;
      return last - first;
    })
    .filter((delta) => delta !== null);

  const averageGain = deltas.length
    ? deltas.reduce((total, delta) => total + delta, 0) / deltas.length
    : null;

  return {
    sessions: sessions.length,
    attempts: attempts.length,
    revisedSessions: revised,
    gapsRecorded: cards.length,
    gapsCleared: cleared.length,
    gapsOutstanding: Math.max(0, cards.length - cleared.length),
    averageCoverage,
    averageGain,
  };
}

export function formatPercent(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export function formatDelta(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  const points = Math.round(ratio * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
}

export function formatDate(value) {
  if (!value) return "Saved recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
