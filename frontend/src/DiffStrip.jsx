/* Both label lengths are rendered and CSS picks one. A matchMedia listener was
   tried first and dropped: the `change` event is not reliably delivered on every
   viewport change, which left the strip showing mobile copy on a desktop-width
   window. `display: none` also keeps the hidden variant out of the a11y tree. */
function Label({ item }) {
  return (
    <>
      <span className="label-full">{item.label}</span>
      <span className="label-short">{item.shortLabel}</span>
    </>
  );
}

export default function DiffStrip({ summary }) {
  if (!summary) return null;

  const { coverage } = summary;
  const coverageLabel = `coverage ${coverage.before}/${coverage.beforeTotal} → ${coverage.after}/${coverage.afterTotal}`;

  const cells = summary.changed
    ? summary.items.map((item) => (
        <Label item={item} key={item.key} />
      ))
    : [
        <span key="none">
          {summary.rewritten
            ? "Your revision reworded claims — none of them changed state."
            : "No changes detected — your revision kept the same claims."}
        </span>,
      ];
  cells.push(<span key="coverage">{coverageLabel}</span>);

  return (
    <p
      className="diff-strip"
      role="status"
      aria-label="What changed since your last version"
    >
      {cells.flatMap((cell, index) =>
        /* Separators are their own flex items: whitespace at the edge of a flex
           item collapses, so " · " inside the label span loses its space. */
        index === 0
          ? [cell]
          : [
              <span aria-hidden="true" className="diff-sep" key={`sep-${index}`}>
                ·
              </span>,
              cell,
            ],
      )}
    </p>
  );
}
