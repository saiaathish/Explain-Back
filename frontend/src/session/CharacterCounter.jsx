export default function CharacterCounter({ value, maximum, healthyMinimum }) {
  const current = value.length;
  const validationLength = value.trim().length;
  const isWarning = current >= maximum * 0.9;
  const progress = Math.min(
    100,
    Math.max(0, (validationLength / healthyMinimum) * 100),
  );
  const className = [
    "character-counter",
    validationLength >= healthyMinimum ? "is-healthy" : "",
    isWarning ? "is-warning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <small
      className={className}
      style={{ "--counter-progress": `${progress}%` }}
    >
      {isWarning ? "Near limit — " : ""}
      {current} / {maximum.toLocaleString("en-US")} characters
    </small>
  );
}
