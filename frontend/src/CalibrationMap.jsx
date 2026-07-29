const CELLS = [
  ["solid", "Felt sure + understood", "Solid ground"],
  ["danger", "Felt sure + system gap", "Danger zone"],
  ["better", "Felt unsure + understood", "Better than you thought"],
  ["known", "Felt unsure + system gap", "Known unknown"],
];

export default function CalibrationMap({ summary }) {
  if (!summary) return null;
  return (
    <section className="calibration" aria-labelledby="calibration-title">
      <h2 id="calibration-title">Confidence calibration</h2>
      <p className="region-intro">Where your confidence and your explanation disagree.</p>
      <div className="calibration-map" aria-label="Confidence calibration map">
        {CELLS.map(([key, label, title]) => (
          <div className={`calibration-cell calibration-cell--${key}`} key={key}>
            <strong>{summary.counts[key]}</strong>
            <span>{title}</span>
            <small>{label}</small>
          </div>
        ))}
      </div>
      {summary.counts.danger > 0 && (
        <p className="calibration-note">
          The marked danger-zone claims are worth revisiting first: confidence was high, but the source check found a gap.
        </p>
      )}
    </section>
  );
}
