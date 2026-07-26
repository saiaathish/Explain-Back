import { useMemo, useState } from "react";

function cleanFlags(flags, textLength) {
  const sorted = [...flags]
    .filter(
      (flag) =>
        Number.isInteger(flag.start) &&
        Number.isInteger(flag.end) &&
        flag.start >= 0 &&
        flag.end > flag.start &&
        flag.end <= textLength,
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

export default function Overlay({ explanation, flags }) {
  const [active, setActive] = useState(null);
  const segments = useMemo(() => {
    const clean = cleanFlags(flags, explanation.length);
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
      {segments.map((segment) =>
        segment.flag ? (
          <span
            className={`diagnostic diagnostic--${segment.flag.state}`}
            key={segment.key}
            tabIndex={segment.flag.state === "green" ? -1 : 0}
            onMouseEnter={() => setActive(segment.key)}
            onMouseLeave={() => setActive(null)}
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
        ),
      )}
    </p>
  );
}

export { cleanFlags };
