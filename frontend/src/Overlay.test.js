import { describe, expect, it } from "vitest";
import { cleanFlags } from "./Overlay";

describe("cleanFlags", () => {
  it("keeps adjacent spans", () => {
    expect(
      cleanFlags(
        [
          { start: 0, end: 3 },
          { start: 3, end: 6 },
        ],
        6,
      ),
    ).toHaveLength(2);
  });

  it("keeps the earlier longer nested span after sorting", () => {
    expect(
      cleanFlags(
        [
          { start: 2, end: 4 },
          { start: 0, end: 6 },
        ],
        6,
      ),
    ).toEqual([{ start: 0, end: 6 }]);
  });

  it("accepts a span containing a newline", () => {
    const text = "one\ntwo";
    const flags = cleanFlags([{ start: 0, end: text.length }], text.length);
    expect(text.slice(flags[0].start, flags[0].end)).toBe(text);
  });
});
