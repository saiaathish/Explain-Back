const ITEMS = [
  ["green", "Understood"],
  ["yellow", "Stated, not explained"],
  ["red", "Contradicts the source"],
  ["grey", "Not sure"],
];

export default function Legend() {
  return (
    <ul className="legend" aria-label="Diagnostic legend">
      {ITEMS.map(([state, text]) => (
        <li key={state}>
          <span className={`legend-line legend-line--${state}`} />
          {text}
        </li>
      ))}
    </ul>
  );
}
