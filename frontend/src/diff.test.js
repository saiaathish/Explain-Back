import { describe, expect, it } from "vitest";
import { classifyTransition, diffRuns, isImprovement, normalizeClaim } from "./diff";

/* Builds a run snapshot from `[claimText, state]` pairs. The explanation is the
   claims joined by a space, so the offsets are real code-point offsets. */
function run(claims, coverage = { covered: [], partial: [], missing: [] }) {
  const flags = [];
  let cursor = 0;
  const parts = [];
  claims.forEach(([text, state], index) => {
    flags.push({
      prop_id: `p${index}`,
      state,
      start: cursor,
      end: cursor + [...text].length,
    });
    parts.push(text);
    cursor += [...text].length + 1;
  });
  const concepts = ["c1", "c2", "c3", "c4"].map((id) => ({ id, label: id }));
  return {
    explanation: parts.join(" "),
    result: { flags, concepts, coverage, follow_up: "" },
  };
}

const labels = (summary) => summary.items.map((item) => item.label);

describe("normalizeClaim", () => {
  it("ignores case, whitespace and punctuation", () => {
    expect(normalizeClaim("The  Pump   uses ATP.")).toBe("the pump uses atp");
    expect(normalizeClaim("the pump uses ATP")).toBe("the pump uses atp");
    expect(normalizeClaim("The\npump — uses, ATP!")).toBe("the pump uses atp");
  });
});

describe("classifyTransition", () => {
  it("covers every non-identity state pair", () => {
    const states = ["grey", "red", "yellow", "green"];
    for (const before of states) {
      for (const now of states) {
        expect(classifyTransition(before, now)).toEqual(
          before === now ? null : expect.any(String),
        );
      }
    }
  });

  it("reports red to grey as a resolved misconception, not a regression", () => {
    expect(classifyTransition("red", "grey")).toBe("misconception_resolved");
    expect(isImprovement("red", "grey")).toBe(true);
  });

  it("names the regressions", () => {
    expect(classifyTransition("green", "yellow")).toBe("lost_justification");
    expect(classifyTransition("green", "grey")).toBe("off_source");
    expect(classifyTransition("yellow", "red")).toBe("contradiction");
  });
});

describe("diffRuns", () => {
  it("returns null when there is no previous run", () => {
    expect(diffRuns(null, run([["a claim", "green"]]))).toBeNull();
  });

  it("summarises a pure improvement", () => {
    const summary = diffRuns(
      run([["pump uses atp", "yellow"], ["three sodium out", "red"]]),
      run([["pump uses atp", "green"], ["three sodium out", "green"]]),
    );
    expect(summary.changed).toBe(true);
    expect(labels(summary)).toEqual(["1 gap closed", "1 misconception resolved"]);
    expect([...summary.improved.keys()]).toEqual(["p0", "p1"]);
    expect(summary.improved.get("p0")).toBe("yellow");
  });

  it("summarises a pure regression and does not mark it improved", () => {
    const summary = diffRuns(
      run([["pump uses atp", "green"], ["it is electrogenic", "green"]]),
      run([["pump uses atp", "yellow"], ["it is electrogenic", "grey"]]),
    );
    expect(labels(summary)).toEqual([
      "1 claim lost its justification",
      "1 claim no longer matches the source",
    ]);
    expect(summary.improved.size).toBe(0);
  });

  it("aggregates identical labels and orders improvements first", () => {
    const summary = diffRuns(
      run([
        ["one", "yellow"],
        ["two", "yellow"],
        ["three", "green"],
      ]),
      run([
        ["one", "green"],
        ["two", "green"],
        ["three", "yellow"],
      ]),
    );
    expect(labels(summary)).toEqual([
      "2 gaps closed",
      "1 claim lost its justification",
    ]);
  });

  it("reports no change when the claims and states are identical", () => {
    const before = run([["pump uses atp", "yellow"]]);
    const summary = diffRuns(before, run([["Pump  uses ATP.", "yellow"]]));
    expect(summary.changed).toBe(false);
    expect(summary.items).toEqual([]);
  });

  /* Additions and removals are counted but never displayed: extraction splits
     and merges propositions across runs on untouched text, so those counts are
     the extractor's noise rather than the student's work. */
  it("does not display an added claim", () => {
    const summary = diffRuns(
      run([["pump uses atp", "yellow"]]),
      run([["pump uses atp", "yellow"], ["it is electrogenic", "green"]]),
    );
    expect(labels(summary)).toEqual([]);
    expect(summary.changed).toBe(false);
    expect(summary.rewritten).toBe(true);
  });

  it("does not display a removed claim", () => {
    const summary = diffRuns(
      run([["pump uses atp", "yellow"], ["it is electrogenic", "green"]]),
      run([["pump uses atp", "yellow"]]),
    );
    expect(labels(summary)).toEqual([]);
    expect(summary.rewritten).toBe(true);
  });

  it("shows nothing for a rewritten claim, but flags it as reworded", () => {
    const summary = diffRuns(
      run([["it moves three potassium out", "red"]]),
      run([["each cycle pumps three sodium ions out of the cell", "green"]]),
    );
    expect(labels(summary)).toEqual([]);
    expect(summary.rewritten).toBe(true);
  });

  it("distinguishes a true no-op from a rewrite that changed no state", () => {
    const identical = diffRuns(
      run([["pump uses atp", "yellow"]]),
      run([["Pump  uses ATP.", "yellow"]]),
    );
    expect(identical.changed).toBe(false);
    expect(identical.rewritten).toBe(false);
  });

  it("keeps transitions while dropping the additions and removals around them", () => {
    const summary = diffRuns(
      run([["one", "yellow"], ["two", "green"], ["three", "grey"]]),
      run([["one", "green"], ["two", "yellow"], ["four", "green"]]),
    );
    expect(labels(summary)).toEqual([
      "1 gap closed",
      "1 claim lost its justification",
    ]);
    expect(summary.rewritten).toBe(true);
  });

  it("carries coverage counts through as before and after", () => {
    const summary = diffRuns(
      run([["one", "yellow"]], { covered: ["c1"], partial: [], missing: [] }),
      run([["one", "green"]], {
        covered: ["c1", "c2", "c3"],
        partial: [],
        missing: [],
      }),
    );
    expect(summary.coverage).toEqual({
      before: 1,
      beforeTotal: 4,
      after: 3,
      afterTotal: 4,
    });
  });

  it("matches claims across an astral character shifting later offsets", () => {
    const before = {
      explanation: "😀 the pump uses ATP",
      result: {
        flags: [{ prop_id: "p0", state: "yellow", start: 2, end: 19 }],
        concepts: [],
        coverage: { covered: [], partial: [], missing: [] },
      },
    };
    const after = {
      explanation: "😀 The pump uses ATP",
      result: {
        flags: [{ prop_id: "q0", state: "green", start: 2, end: 19 }],
        concepts: [],
        coverage: { covered: [], partial: [], missing: [] },
      },
    };
    expect(labels(diffRuns(before, after))).toEqual(["1 gap closed"]);
  });
});
