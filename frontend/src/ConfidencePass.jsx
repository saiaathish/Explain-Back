import { sentenceRanges } from "./confidence";

export default function ConfidencePass({
  explanation,
  selectedRanges = [],
  onChange,
  disabled = false,
}) {
  const ranges = sentenceRanges(explanation);
  if (!ranges.length) return null;

  function toggle(range) {
    const selected = selectedRanges.some(
      (current) => current.start === range.start && current.end === range.end,
    );
    onChange(
      selected
        ? selectedRanges.filter(
            (current) => current.start !== range.start || current.end !== range.end,
          )
        : [...selectedRanges, { start: range.start, end: range.end }],
    );
  }

  return (
    <fieldset className="confidence-pass" disabled={disabled}>
      <legend>Confidence check</legend>
      <p>Tap the sentences you feel sure about before you check your explanation.</p>
      <div className="confidence-sentences">
        {ranges.map((range) => {
          const selected = selectedRanges.some(
            (current) => current.start === range.start && current.end === range.end,
          );
          return (
            <button
              className={`confidence-sentence${selected ? " is-selected" : ""}`}
              disabled={disabled}
              key={range.id}
              onClick={() => toggle(range)}
              type="button"
              aria-pressed={selected}
            >
              {range.text}
            </button>
          );
        })}
      </div>
      <small>
        {selectedRanges.length} sentence{selectedRanges.length === 1 ? "" : "s"} marked confident
      </small>
    </fieldset>
  );
}
