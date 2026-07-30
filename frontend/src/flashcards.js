import { getSupabaseClient } from "./supabase";

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
export function deriveCards(sessions, reviews = []) {
  const latestReview = new Map();
  [...reviews]
    .sort((left, right) =>
      String(left.created_at || "").localeCompare(String(right.created_at || "")),
    )
    .forEach((review) => {
      latestReview.set(`${review.session_id}:${review.prop_id}`, review);
    });

  const cards = [];
  (sessions || []).forEach((session) => {
    const attempts = attemptsInOrder(session);
    firstGapFor(attempts).forEach(({ flag, attempt }, key) => {
      const latestState = latestStateFor(attempts, key);
      const review = latestReview.get(`${session.id}:${key}`) || null;
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
        mastered: review ? Boolean(review.mastered) : null,
        lastReviewedAt: review?.created_at || null,
      });
    });
  });

  /* Unreviewed gaps first, then shaky ones, then what they already know. */
  const rank = (card) => (card.mastered === null ? 0 : card.mastered ? 2 : 1);
  return cards.sort(
    (left, right) => rank(left) - rank(right) || left.id.localeCompare(right.id),
  );
}

export function reviewProgress(cards) {
  const total = cards.length;
  const mastered = cards.filter((card) => card.mastered === true).length;
  const shaky = cards.filter((card) => card.mastered === false).length;
  return {
    total,
    mastered,
    shaky,
    unreviewed: total - mastered - shaky,
    label:
      total === 0
        ? "No recorded gaps yet"
        : `${mastered} of ${total} marked as understood`,
  };
}

export function createFlashcardReviews(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("A Supabase browser client is required for review marks.");
  }

  async function listReviews() {
    const { data, error } = await client
      .from("flag_reviews")
      .select("session_id, prop_id, mastered, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      const failure = new Error(error.message || "Review marks could not load.");
      failure.name = "FlashcardReviewError";
      failure.code = error.code;
      throw failure;
    }

    return data || [];
  }

  async function markCard({ sessionId, propId, mastered }) {
    const { data, error } = await client
      .from("flag_reviews")
      .insert({ session_id: sessionId, prop_id: propId, mastered })
      .select("session_id, prop_id, mastered, created_at")
      .single();

    if (error || !data) {
      const failure = new Error(error?.message || "That mark could not be saved.");
      failure.name = "FlashcardReviewError";
      failure.code = error?.code;
      throw failure;
    }

    return data;
  }

  return { listReviews, markCard };
}

export function getFlashcardReviews() {
  return createFlashcardReviews(getSupabaseClient());
}
