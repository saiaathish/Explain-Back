const ITEMS = [
  ["green", "Green = understood"],
  ["yellow", "Yellow = memorized"],
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
