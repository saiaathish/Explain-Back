import { codePointOffsetToCodeUnit } from "./offsets";

/* Pure comparison of two analysis runs. No React, no DOM — the matching logic is
   the only place real bugs can live, so it stays directly unit-testable. */

export const RANK = { grey: 0, red: 1, yellow: 2, green: 3 };

/* Proposition ids are regenerated every run, so claims are matched on their
   normalised text instead: case, spacing and punctuation all ignored. */
export function normalizeClaim(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const LABELS = {
  gap_closed: ["gap closed", "gaps closed"],
  misconception_resolved: ["misconception resolved", "misconceptions resolved"],
  on_topic: ["claim now on topic", "claims now on topic"],
  lost_justification: [
    "claim lost its justification",
    "claims lost their justification",
  ],
  off_source: [
    "claim no longer matches the source",
    "claims no longer match the source",
  ],
  contradiction: [
    "new contradiction introduced",
    "new contradictions introduced",
  ],
};

/* The full labels wrap to five lines at 390px, so narrow screens get a terser
   set. Same items, same counts — nothing is dropped to make room. */
const SHORT_LABELS = {
  gap_closed: ["gap closed", "gaps closed"],
  misconception_resolved: ["misconception fixed", "misconceptions fixed"],
  on_topic: ["now on topic", "now on topic"],
  lost_justification: ["lost justification", "lost justification"],
  off_source: ["not matched to source", "not matched to source"],
  contradiction: ["contradiction added", "contradictions added"],
};

/* Improvements read first, then the regressions. Regressions are reported
   plainly but never lead.

   `added` and `removed` are computed but deliberately not shown. Extraction is
   not stable across runs — the same untouched sentence can be split into two
   propositions on one run and merged into one on the next — so those two counts
   are dominated by the extractor's own noise rather than by anything the student
   did. Reporting them tells the reader about our instability, not their work. */
const ORDER = [
  "gap_closed",
  "misconception_resolved",
  "on_topic",
  "lost_justification",
  "off_source",
  "contradiction",
];

/* Every non-identity state pair maps to exactly one label. `red -> anything` is
   checked before the rank comparison: leaving a confident contradiction is a
   real gain even when the replacement is only uncertain. */
export function classifyTransition(before, now) {
  if (before === now) return null;
  if (before === "red") return "misconception_resolved";
  if (now === "red") return "contradiction";
  if (now === "green") return "gap_closed";
  if (before === "grey" && now === "yellow") return "on_topic";
  if (before === "green" && now === "yellow") return "lost_justification";
  if (now === "grey") return "off_source";
  return null;
}

export function isImprovement(before, now) {
  if (before === now) return false;
  if (before === "red") return true;
  return (RANK[now] ?? 0) > (RANK[before] ?? 0);
}

function claimEntries(run) {
  const explanation = run?.explanation ?? "";
  return (run?.result?.flags ?? [])
    .map((flag) => {
      const start = codePointOffsetToCodeUnit(explanation, flag.start);
      const end = codePointOffsetToCodeUnit(explanation, flag.end);
      const usable =
        Number.isInteger(start) && Number.isInteger(end) && end > start;
      return {
        propId: flag.prop_id,
        state: flag.state,
        key: usable ? normalizeClaim(explanation.slice(start, end)) : "",
      };
    })
    .filter((entry) => entry.key !== "");
}

function coverageOf(run) {
  const covered = run?.result?.coverage?.covered?.length ?? 0;
  const total = run?.result?.concepts?.length ?? 0;
  return { covered, total };
}

/* Takes two run snapshots — `{ result, explanation }` — and returns a summary.
   Returns null when there is nothing to compare, i.e. on the first run. */
export function diffRuns(previous, current) {
  if (!previous?.result || !current?.result) return null;

  const previousEntries = claimEntries(previous);
  const pending = new Map();
  for (const entry of previousEntries) {
    const bucket = pending.get(entry.key);
    if (bucket) bucket.push(entry);
    else pending.set(entry.key, [entry]);
  }

  const counts = new Map();
  const bump = (key, amount = 1) =>
    counts.set(key, (counts.get(key) ?? 0) + amount);

  /* prop id -> state it held last run, for the settle animation. */
  const improved = new Map();
  let unmatchedPrevious = previousEntries.length;

  for (const entry of claimEntries(current)) {
    const bucket = pending.get(entry.key);
    const match = bucket?.length ? bucket.shift() : null;
    if (!match) {
      bump("added");
      continue;
    }
    unmatchedPrevious -= 1;
    const kind = classifyTransition(match.state, entry.state);
    if (!kind) continue;
    bump(kind);
    if (isImprovement(match.state, entry.state)) {
      improved.set(entry.propId, match.state);
    }
  }

  /* A rewritten claim lands here as one removal plus one addition. That is the
     accepted failure mode — fuzzy matching would cost a model call. */
  if (unmatchedPrevious > 0) bump("removed", unmatchedPrevious);

  const items = ORDER.filter((key) => counts.get(key)).map((key) => {
    const count = counts.get(key);
    const pick = (table) => `${count} ${table[key][count === 1 ? 0 : 1]}`;
    return { key, count, label: pick(LABELS), shortLabel: pick(SHORT_LABELS) };
  });

  const before = coverageOf(previous);
  const after = coverageOf(current);

  /* Tracked so the strip can tell "you rewrote claims but nothing changed
     state" apart from "you changed nothing at all". The counts stay off screen;
     only the distinction between those two messages uses them. */
  const rewrites = (counts.get("added") ?? 0) + (counts.get("removed") ?? 0);

  return {
    items,
    improved,
    changed: items.length > 0,
    rewritten: rewrites > 0,
    coverage: {
      before: before.covered,
      beforeTotal: before.total,
      after: after.covered,
      afterTotal: after.total,
    },
  };
}
