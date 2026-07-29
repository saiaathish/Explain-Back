import { useId, useMemo, useState } from "react";
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

function FeedbackCard({ flag, tooltipId, hidden = false }) {
  return (
    <span className="feedback-card" id={tooltipId} role="tooltip" hidden={hidden}>
      <span className="feedback-source">
        <span className="feedback-source-label">Source:</span> <q>{flag.anchor}</q>
      </span>
      {flag.misconception && (
        <strong className="feedback-misconception">{flag.misconception}</strong>
      )}
      {flag.refutation && <span className="feedback-refutation">{flag.refutation}</span>}
      <span className="feedback-hint">
        <strong>Try:</strong> {flag.hint}
      </span>
    </span>
  );
}

/* Where an improved claim is animated from. The settle animation ends on the new
   state's tint and then clears, so nothing persists past the flash. */
const TINTS = {
  green: "var(--wash-understood)",
  yellow: "#fff3bf",
  red: "#ffe3e3",
  grey: "#eceef1",
};

function boundedRevealDelay(
  baseDelay,
  staggerWindow,
  diagnosticOrdinal,
  diagnosticCount,
) {
  const start = Number.isFinite(baseDelay) ? Math.max(0, baseDelay) : 0;
  const window = Number.isFinite(staggerWindow) ? Math.max(0, staggerWindow) : 0;
  if (diagnosticCount <= 1) return start;

  const ordinal = Math.min(
    diagnosticCount - 1,
    Math.max(0, diagnosticOrdinal),
  );
  return start + (ordinal * window) / (diagnosticCount - 1);
}

function toDomIdFragment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-") || "proposition";
}

export default function Overlay({
  explanation,
  flags,
  improvedIds,
  dangerIds = [],
  revealDelay = 0,
  revealDuration = 0,
}) {
  const overlayId = useId();
  const [active, setActive] = useState(null);
  const segments = useMemo(() => {
    const clean = cleanFlags(flags, explanation);
    const output = [];
    let cursor = 0;
    clean.forEach((flag, diagnosticOrdinal) => {
      if (cursor < flag.start) {
        output.push({
          key: `plain-${cursor}`,
          text: explanation.slice(cursor, flag.start),
        });
      }
      output.push({
        key: `${flag.prop_id}-${diagnosticOrdinal}`,
        text: explanation.slice(flag.start, flag.end),
        flag,
        diagnosticOrdinal,
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
  const diagnosticCount = segments.reduce(
    (count, segment) => count + (segment.flag ? 1 : 0),
    0,
  );

  return (
    <p className="overlay" aria-label="Your explanation with diagnostic highlights">
      {segments.map((segment) => {
        if (!segment.flag) {
          return <span key={segment.key}>{segment.text}</span>;
        }

        const improvedFrom = segment.flag && improvedIds?.get?.(segment.flag.prop_id);
        const diagnosticDelay = boundedRevealDelay(
          revealDelay,
          revealDuration,
          segment.diagnosticOrdinal,
          diagnosticCount,
        );
        const tooltipId = `${overlayId}-feedback-${segment.diagnosticOrdinal}-${toDomIdFragment(
          segment.flag.prop_id,
        )}`;
        return (
          <span
            className={`diagnostic diagnostic--${segment.flag.state}${
              dangerIds.includes(segment.flag.prop_id) ? " diagnostic--danger" : ""
            }${
              improvedFrom ? " hl-improved" : ""
            }`}
            key={segment.key}
            style={
              improvedFrom
                ? {
                    "--diagnostic-delay": `${diagnosticDelay}ms`,
                    "--hl-from": TINTS[improvedFrom],
                    "--hl-to": TINTS[segment.flag.state],
                  }
                : { "--diagnostic-delay": `${diagnosticDelay}ms` }
            }
            tabIndex={segment.flag.state === "green" ? -1 : 0}
            role={segment.flag.state === "green" ? undefined : "button"}
            aria-describedby={active === segment.key ? tooltipId : undefined}
            aria-expanded={segment.flag.state === "green" ? undefined : active === segment.key}
            aria-controls={segment.flag.state === "green" ? undefined : tooltipId}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setActive(segment.key);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setActive(null);
            }}
            onPointerUp={(event) => {
              if (event.pointerType !== "mouse") {
                setActive((current) => (current === segment.key ? null : segment.key));
              }
            }}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) {
                setActive(segment.key);
              }
            }}
            onBlur={() => setActive(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setActive(null);
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActive((current) => (current === segment.key ? null : segment.key));
              }
            }}
          >
            {segment.text}
            {segment.flag.state !== "green" && (
              <FeedbackCard
                flag={segment.flag}
                tooltipId={tooltipId}
                hidden={active !== segment.key}
              />
            )}
          </span>
        );
      })}
    </p>
  );
}

export { boundedRevealDelay, cleanFlags, codePointOffsetToCodeUnit };
