const ITEMS = [
  ["green", "Green = supported and justified"],
  ["yellow", "Yellow = supported, not justified"],
  ["red", "Red = contradicts source"],
  ["grey", "Grey = uncertain"],
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
