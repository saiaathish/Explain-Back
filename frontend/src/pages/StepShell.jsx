const STEPS = [
  { id: "source", label: "Source" },
  { id: "record", label: "Explain" },
  { id: "confidence", label: "Confidence" },
];

/*
 * The step rail is deliberately not clickable. Jumping back to the source from
 * here would put the material back in front of a learner mid-explanation, which
 * is the whole thing this flow exists to prevent — the source step's own Back
 * button is the one way back, and it discards the explanation.
 */
export default function StepShell({
  current,
  title,
  intro,
  children,
  actions,
  attempt = 0,
}) {
  const activeIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <section className="step-shell" aria-labelledby="step-title">
      <ol className="step-rail" aria-label="Session progress">
        {STEPS.map((step, index) => (
          <li
            aria-current={index === activeIndex ? "step" : undefined}
            className={
              index < activeIndex
                ? "is-done"
                : index === activeIndex
                  ? "is-active"
                  : ""
            }
            key={step.id}
          >
            <span className="step-rail-dot">{index + 1}</span>
            <span className="step-rail-label">{step.label}</span>
          </li>
        ))}
      </ol>

      <header className="step-heading">
        <h1 id="step-title">{title}</h1>
        {intro && <p className="step-intro">{intro}</p>}
        {attempt > 0 && (
          <p className="step-attempt">Revision — attempt {attempt + 1}</p>
        )}
      </header>

      <div className="step-body">{children}</div>

      {actions && <div className="step-actions">{actions}</div>}
    </section>
  );
}

export { STEPS };
