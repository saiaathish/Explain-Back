/*
 * Pure rules for a session draft. Kept apart from the provider so the wizard
 * steps and their tests can reason about a draft without mounting React.
 */

export const SOURCE_LIMIT = 6000;
export const EXPLANATION_LIMIT = 4000;
export const SOURCE_MINIMUM = 100;
export const EXPLANATION_MINIMUM = 40;

/* A preset seeds the source only. The learner still has to explain it back —
 * shipping a written explanation with it would skip the whole point. */
export const PRESETS = [
  {
    id: "biology",
    label: "Biology",
    source: "/samples/source_sodium_pump.txt",
  },
  {
    id: "economics",
    label: "Economics",
    source: "/samples/source_supply_demand.txt",
  },
  {
    id: "photosynthesis",
    label: "Photosynthesis",
    source: "/samples/source_photosynthesis.txt",
  },
];

export function validateSource(source) {
  const trimmed = source.trim();
  if (!trimmed) {
    return "Paste or scan the material you want to explain back.";
  }
  if (trimmed.length < SOURCE_MINIMUM) {
    return "Source is too short to identify concepts. Paste 2–3 paragraphs, then try again.";
  }
  if (source.length > SOURCE_LIMIT) {
    return "Source exceeds the 6,000-character limit. Shorten it to 2–3 paragraphs, then try again.";
  }
  return "";
}

export function validateExplanation(explanation) {
  const trimmed = explanation.trim();
  if (!trimmed) {
    return "Record or type your explanation before moving on.";
  }
  if (trimmed.length < EXPLANATION_MINIMUM) {
    return "Explanation is too short to check. Write at least two full sentences, then try again.";
  }
  if (explanation.length > EXPLANATION_LIMIT) {
    return "Explanation exceeds the 4,000-character limit. Shorten it to a few paragraphs, then try again.";
  }
  return "";
}

/*
 * A focused drill-down is checked against a single source anchor, which is
 * routinely shorter than the 100-character floor a full source has to clear.
 */
export function validateFocused(anchor, explanation) {
  if (!anchor.trim()) {
    return "Source or explanation is missing. Paste both texts, then try again.";
  }
  return validateExplanation(explanation);
}

export function trimRangeSnapshot(explanation, trimmed, ranges) {
  const leading = explanation.search(/\S|$/);
  return ranges
    .map((range) => ({
      start: range.start - leading,
      end: range.end - leading,
    }))
    .filter(
      (range) =>
        range.start >= 0 &&
        range.end > range.start &&
        range.end <= trimmed.length,
    );
}

/*
 * Which step a draft is actually entitled to be on. Deep links and the browser
 * back button both land here, so a half-filled draft cannot open the results.
 */
export function furthestStep({ source, explanation, hasResult }) {
  if (hasResult) return "results";
  if (validateSource(source || "")) return "source";
  if (validateExplanation(explanation || "")) return "record";
  return "confidence";
}

const STEP_ORDER = ["source", "record", "confidence", "analyzing", "results"];

export function stepIsReachable(step, draft) {
  const furthest = furthestStep(draft);
  const wanted = STEP_ORDER.indexOf(step);
  const allowed = STEP_ORDER.indexOf(furthest);
  if (wanted < 0) return false;
  /* Analyzing sits one past the last step the draft can prove on its own. */
  return wanted <= (furthest === "confidence" ? allowed + 1 : allowed);
}

export { STEP_ORDER };
