function groupById(concepts) {
  return new Map(concepts.map((concept) => [concept.id, concept]));
}

export default function ConceptList({ concepts, coverage, onSelectMissing }) {
  const byId = groupById(concepts);
  const groups = [
    ["covered", "Covered"],
    ["partial", "Partial"],
    ["missing", "Missing"],
  ];
  return (
    <>
      <div className="coverage-summary" aria-label="Concept coverage summary">
        {groups.map(([key, label]) => (
          <span className={`coverage-chip coverage-chip--${key}`} key={key}>
            {label} ({coverage[key]?.length || 0})
          </span>
        ))}
      </div>
      <ul className="concept-list">
        {groups.flatMap(([key]) =>
          (coverage[key] || []).map((id) => {
            const concept = byId.get(id);
            if (!concept) return null;
            const actionable = key === "missing" && typeof onSelectMissing === "function";
            return (
              <li className={`concept concept--${key}`} key={id}>
                <span className="concept-dot" aria-hidden="true" />
                {actionable ? (
                  <button
                    className="concept-action"
                    onClick={() => onSelectMissing(concept)}
                    type="button"
                  >
                    <span>{concept.label}</span>
                    <span aria-hidden="true" className="concept-action-mark">
                      Drill down
                    </span>
                  </button>
                ) : (
                  <span>{concept.label}</span>
                )}
              </li>
            );
          }),
        )}
      </ul>
    </>
  );
}
