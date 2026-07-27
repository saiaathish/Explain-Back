import { describe, expect, it } from "vitest";
import { cleanFlags, codePointOffsetToCodeUnit } from "./Overlay";

describe("cleanFlags", () => {
  it("keeps adjacent spans", () => {
    expect(
      cleanFlags(
        [
          { start: 0, end: 3 },
          { start: 3, end: 6 },
        ],
        "abcdef",
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
        "abcdef",
      ),
    ).toEqual([{ start: 0, end: 6 }]);
  });

  it("accepts a span containing a newline", () => {
    const text = "one\ntwo";
    const flags = cleanFlags([{ start: 0, end: text.length }], text);
    expect(text.slice(flags[0].start, flags[0].end)).toBe(text);
  });

  it("converts Python code-point offsets after emoji to JavaScript offsets", () => {
    const text = "😀 Pump uses ATP.";
    const flags = cleanFlags([{ start: 2, end: 6 }], text);

    expect(codePointOffsetToCodeUnit(text, 2)).toBe(3);
    expect(text.slice(flags[0].start, flags[0].end)).toBe("Pump");
  });
});
