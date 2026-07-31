import { describe, expect, it } from "vitest";
import {
  furthestStep,
  stepIsReachable,
  trimRangeSnapshot,
  validateExplanation,
  validateFocused,
  validateSource,
} from "./draft";

const LONG_SOURCE = "a".repeat(120);
const GOOD_EXPLANATION =
  "The pump moves sodium out of the cell. It uses energy from ATP to do it.";

describe("source validation", () => {
  it("asks for material rather than reporting a missing explanation", () => {
    expect(validateSource("   ")).toMatch(/paste or scan/i);
  });

  it("rejects a source too short to hold concepts", () => {
    expect(validateSource("Too short.")).toMatch(/2–3 paragraphs/);
  });

  it("rejects a source past the model's limit", () => {
    expect(validateSource("a".repeat(6001))).toMatch(/6,000-character/);
  });

  it("accepts two or three paragraphs", () => {
    expect(validateSource(LONG_SOURCE)).toBe("");
  });
});

describe("explanation validation", () => {
  it("rejects an explanation with nothing to check", () => {
    expect(validateExplanation("  ")).toMatch(/record or type/i);
  });

  it("rejects a single fragment", () => {
    expect(validateExplanation("It moves sodium.")).toMatch(/two full sentences/);
  });

  it("accepts a couple of real sentences", () => {
    expect(validateExplanation(GOOD_EXPLANATION)).toBe("");
  });
});

describe("focused validation", () => {
  /* A concept anchor is routinely shorter than the 100-character floor a full
     source has to clear, so the drill-down must not inherit that rule. */
  it("accepts a short anchor that a full source would fail", () => {
    expect(validateFocused("Sodium leaves the cell.", GOOD_EXPLANATION)).toBe("");
    expect(validateSource("Sodium leaves the cell.")).not.toBe("");
  });

  it("still requires an anchor", () => {
    expect(validateFocused("", GOOD_EXPLANATION)).toMatch(/missing/i);
  });
});

describe("confidence range snapshots", () => {
  it("rebases ranges onto the trimmed text the run actually scored", () => {
    const explanation = "   First one. Second one.";
    const trimmed = explanation.trim();
    expect(
      trimRangeSnapshot(explanation, trimmed, [{ start: 3, end: 13 }]),
    ).toEqual([{ start: 0, end: 10 }]);
  });

  it("drops ranges that fall outside the trimmed text", () => {
    const explanation = "  Only this.";
    const trimmed = explanation.trim();
    expect(
      trimRangeSnapshot(explanation, trimmed, [{ start: 0, end: 1 }, { start: 2, end: 400 }]),
    ).toEqual([]);
  });
});

describe("step reachability", () => {
  const empty = { source: "", explanation: "", hasResult: false };
  const sourced = { source: LONG_SOURCE, explanation: "", hasResult: false };
  const explained = {
    source: LONG_SOURCE,
    explanation: GOOD_EXPLANATION,
    hasResult: false,
  };
  const analyzed = { ...explained, hasResult: true };

  it("keeps an empty draft on the source step", () => {
    expect(furthestStep(empty)).toBe("source");
    expect(stepIsReachable("record", empty)).toBe(false);
    expect(stepIsReachable("results", empty)).toBe(false);
  });

  it("opens the record step once the source is real", () => {
    expect(furthestStep(sourced)).toBe("record");
    expect(stepIsReachable("record", sourced)).toBe(true);
    expect(stepIsReachable("confidence", sourced)).toBe(false);
  });

  it("allows the analyzing screen only from a finished explanation", () => {
    expect(stepIsReachable("analyzing", explained)).toBe(true);
    expect(stepIsReachable("analyzing", sourced)).toBe(false);
  });

  /* A pasted /session/results URL must not render an analysis that never ran. */
  it("refuses the results page until a run exists", () => {
    expect(stepIsReachable("results", explained)).toBe(false);
    expect(stepIsReachable("results", analyzed)).toBe(true);
  });

  it("rejects an unknown step outright", () => {
    expect(stepIsReachable("nonsense", analyzed)).toBe(false);
  });
});
