/*
 * A flashcard is a repackaging of data the learner already produced. Every field
 * below comes from a stored flag: its claim, its source anchor, its hint, and
 * the misconception named when the resolver went red. Nothing here calls a model.
 */

const NOT_GREEN = ["yellow", "red", "grey"];

function flagKey(flag, index) {
  return String(flag?.prop_id || flag?.id || `flag-${index + 1}`);
}

function sentenceOf(text, maximum = 120) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const firstSentence = compact.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || compact;
  const chosen = firstSentence.length >= 12 ? firstSentence : compact;
  if (chosen.length <= maximum) return chosen;
  return `${chosen.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

export function promptFor(flag) {
  const topic = sentenceOf(flag?.anchor);
  return topic ? `Explain: ${topic}` : "Explain this part of the source again.";
}

function attemptsInOrder(session) {
  return [...(session?.explanation_attempts || [])].sort(
    (left, right) => (left.attempt_number || 0) - (right.attempt_number || 0),
  );
}

function firstGapFor(attempts) {
  const gaps = new Map();
  attempts.forEach((attempt) => {
    (Array.isArray(attempt.flags) ? attempt.flags : []).forEach((flag, index) => {
      const key = flagKey(flag, index);
      if (!gaps.has(key) && NOT_GREEN.includes(flag?.state)) {
        gaps.set(key, { flag, attempt });
      }
    });
  });
  return gaps;
}

function latestStateFor(attempts, key) {
  let state = null;
  attempts.forEach((attempt) => {
    (Array.isArray(attempt.flags) ? attempt.flags : []).forEach((flag, index) => {
      if (flagKey(flag, index) === key) state = flag?.state || state;
    });
  });
  return state;
}

/* One card per gap per session, keyed so a later attempt updates the same card. */
export function deriveCards(sessions) {
  const cards = [];
  (sessions || []).forEach((session) => {
    const attempts = attemptsInOrder(session);
    firstGapFor(attempts).forEach(({ flag, attempt }, key) => {
      const latestState = latestStateFor(attempts, key);
      cards.push({
        id: `${session.id}:${key}`,
        sessionId: session.id,
        propId: key,
        prompt: promptFor(flag),
        anchor: String(flag.anchor || ""),
        claim: String(flag.claim || attempt.explanation_text || ""),
        hint: String(flag.hint || ""),
        misconception: flag.state === "red" ? flag.misconception || "" : "",
        refutation: flag.state === "red" ? flag.refutation || "" : "",
        state: flag.state,
        attemptNumber: attempt.attempt_number || 1,
        resolvedLater: latestState === "green",
      });
    });
  });

  /* Red gaps first: a contradiction is worth explaining before a thin claim. */
  const rank = (card) => (card.state === "red" ? 0 : card.state === "yellow" ? 1 : 2);
  return cards.sort(
    (left, right) => rank(left) - rank(right) || left.id.localeCompare(right.id),
  );
}

/*
 * The round itself is deliberately not persisted. Marks used to be written to a
 * `flag_reviews` table, which meant a gap tapped once stayed "understood"
 * forever and the count stopped reflecting what the learner could actually
 * explain. A round now starts from the recorded gaps every time.
 */
export function roundSummary(deck, remaining) {
  const total = deck.length;
  const cleared = Math.max(0, total - remaining);
  return {
    total,
    remaining,
    cleared,
    complete: total > 0 && remaining === 0,
    label:
      total === 0
        ? "No recorded gaps yet"
        : remaining === 0
          ? "Nothing left in this round"
          : `${remaining} ${remaining === 1 ? "card" : "cards"} left`,
  };
}
