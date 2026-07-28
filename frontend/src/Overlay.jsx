import { useMemo, useState } from "react";
import { codePointOffsetToCodeUnit } from "./offsets";

function cleanFlags(flags, text) {
  const sorted = [...flags]
    .map((flag) => ({
      ...flag,
      start: codePointOffsetToCodeUnit(text, flag.start),
      end: codePointOffsetToCodeUnit(text, flag.end),
    }))
    .filter(
      (flag) =>
        Number.isInteger(flag.start) &&
        Number.isInteger(flag.end) &&
        flag.start >= 0 &&
        flag.end > flag.start &&
        flag.end <= text.length,
    )
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const clean = [];
  for (const flag of sorted) {
    const previous = clean.at(-1);
    if (previous && flag.start < previous.end) continue;
    clean.push(flag);
  }
  return clean;
}

function FeedbackCard({ flag }) {
  return (
    <span className="feedback-card" role="tooltip">
      <strong>Exact source anchor</strong>
      <q>{flag.anchor}</q>
      {flag.misconception && (
        <>
          <strong>Misconception</strong>
          <span>{flag.misconception}</span>
        </>
      )}
      {flag.refutation && (
        <>
          <strong>Why this doesn’t hold</strong>
          <span>{flag.refutation}</span>
        </>
      )}
      <strong>Revision hint</strong>
      <span>{flag.hint}</span>
    </span>
  );
}

/* Where an improved claim is animated from. The settle animation ends on the new
   state's tint and then clears, so nothing persists past the flash. */
const TINTS = {
  green: "#d8f3dc",
  yellow: "#fff3bf",
  red: "#ffe3e3",
  grey: "#eceef1",
};

export default function Overlay({ explanation, flags, improvedIds }) {
  const [active, setActive] = useState(null);
  const segments = useMemo(() => {
    const clean = cleanFlags(flags, explanation);
    const output = [];
    let cursor = 0;
    clean.forEach((flag) => {
      if (cursor < flag.start) {
        output.push({
          key: `plain-${cursor}`,
          text: explanation.slice(cursor, flag.start),
        });
      }
      output.push({
        key: flag.prop_id,
        text: explanation.slice(flag.start, flag.end),
        flag,
      });
      cursor = flag.end;
    });
    if (cursor < explanation.length) {
      output.push({
        key: `plain-${cursor}`,
        text: explanation.slice(cursor),
      });
    }
    return output;
  }, [explanation, flags]);

  return (
    <p className="overlay" aria-label="Your explanation with diagnostic highlights">
      {segments.map((segment) => {
        const improvedFrom = segment.flag && improvedIds?.get?.(segment.flag.prop_id);
        return segment.flag ? (
          <span
            className={`diagnostic diagnostic--${segment.flag.state}${
              improvedFrom ? " hl-improved" : ""
            }`}
            key={segment.key}
            style={
              improvedFrom
                ? {
                    "--hl-from": TINTS[improvedFrom],
                    "--hl-to": TINTS[segment.flag.state],
                  }
                : undefined
            }
            tabIndex={segment.flag.state === "green" ? -1 : 0}
            onMouseEnter={() => setActive(segment.key)}
            onMouseLeave={() => setActive(null)}
            /* Touch devices have no hover; a tap must open and close the card. */
            onClick={() =>
              setActive((current) => (current === segment.key ? null : segment.key))
            }
            onFocus={() => setActive(segment.key)}
            onBlur={() => setActive(null)}
          >
            {segment.text}
            {segment.flag.state !== "green" && active === segment.key && (
              <FeedbackCard flag={segment.flag} />
            )}
          </span>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        );
      })}
    </p>
  );
}

export { cleanFlags, codePointOffsetToCodeUnit };
