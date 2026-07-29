import { describe, expect, it } from "vitest";
import {
  calibrationSummary,
  rangesOverlap,
  sentenceRanges,
} from "./confidence";

describe("sentenceRanges", () => {
  it("returns trimmed sentence offsets", () => {
    expect(sentenceRanges("  ATP works. Water splits!\n" )).toEqual([
      { id: "sentence-0", start: 2, end: 12, text: "ATP works." },
      { id: "sentence-1", start: 13, end: 26, text: "Water splits!" },
    ]);
  });
});

describe("calibrationSummary", () => {
  it("separates the four confidence/system quadrants", () => {
    const flags = [
      { prop_id: "p1", start: 0, end: 5, state: "green" },
      { prop_id: "p2", start: 6, end: 11, state: "red" },
      { prop_id: "p3", start: 12, end: 17, state: "green" },
      { prop_id: "p4", start: 18, end: 23, state: "grey" },
    ];
    const result = calibrationSummary(flags, [
      { start: 0, end: 11 },
      { start: 6, end: 11 },
    ]);
    expect(result.counts).toEqual({ solid: 1, danger: 1, better: 1, known: 1 });
    expect(result.dangerIds).toEqual(["p2"]);
  });
});

describe("rangesOverlap", () => {
  it("treats touching ranges as non-overlapping", () => {
    expect(rangesOverlap({ start: 0, end: 3 }, { start: 3, end: 6 })).toBe(false);
  });
});
