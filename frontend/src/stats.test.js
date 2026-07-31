import { describe, expect, it } from "vitest";
import { formatDelta, formatPercent, learningStats } from "./stats";

function flags(green, other) {
  return [
    ...Array.from({ length: green }, (_, index) => ({
      prop_id: `g${index}`,
      state: "green",
    })),
    ...Array.from({ length: other }, (_, index) => ({
      prop_id: `r${index}`,
      state: "red",
    })),
  ];
}

const REVISED_SESSION = {
  id: "one",
  source_text: "Source one",
  explanation_attempts: [
    { id: "a1", attempt_number: 1, flags: flags(1, 3) },
    { id: "a2", attempt_number: 2, flags: flags(3, 1) },
  ],
};

const SINGLE_SESSION = {
  id: "two",
  source_text: "Source two",
  explanation_attempts: [{ id: "b1", attempt_number: 1, flags: flags(2, 2) }],
};

describe("learningStats", () => {
  it("reports zeroes rather than NaN for an account with no history", () => {
    const stats = learningStats([], [], []);
    expect(stats).toMatchObject({
      sessions: 0,
      attempts: 0,
      gapsOutstanding: 0,
      averageCoverage: null,
      averageGain: null,
    });
  });

  it("counts sessions and attempts separately", () => {
    const stats = learningStats([REVISED_SESSION, SINGLE_SESSION], [], []);
    expect(stats.sessions).toBe(2);
    expect(stats.attempts).toBe(3);
    expect(stats.revisedSessions).toBe(1);
  });

  /* Coverage is scored on the latest attempt per source, so a learner who
     revised well is not still averaged against their first draft. */
  it("averages coverage across the latest attempt of each source", () => {
    const stats = learningStats([REVISED_SESSION, SINGLE_SESSION], [], []);
    expect(stats.averageCoverage).toBeCloseTo((0.75 + 0.5) / 2);
  });

  it("measures gain only on sessions that were actually revised", () => {
    const stats = learningStats([REVISED_SESSION, SINGLE_SESSION], [], []);
    expect(stats.averageGain).toBeCloseTo(0.75 - 0.25);
  });

  it("leaves gain unknown when nothing has been revised", () => {
    expect(learningStats([SINGLE_SESSION], [], []).averageGain).toBeNull();
  });

  it("never reports negative outstanding gaps", () => {
    const cards = [{ id: "c1" }];
    const cleared = [{ session_id: "one" }, { session_id: "two" }];
    expect(learningStats([], cards, cleared).gapsOutstanding).toBe(0);
  });
});

describe("stat formatting", () => {
  it("renders an em dash for an unknown ratio", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatDelta(undefined)).toBe("—");
  });

  it("signs a positive gain and leaves a loss as-is", () => {
    expect(formatDelta(0.5)).toBe("+50 pts");
    expect(formatDelta(-0.2)).toBe("-20 pts");
  });

  it("rounds a coverage ratio to whole percent", () => {
    expect(formatPercent(0.666)).toBe("67%");
  });
});
