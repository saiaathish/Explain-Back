import { sourcePreview } from "./analysisHistory";

/*
 * Past rounds. Everything here is already cleared, so this is a practice area:
 * studying a source again never puts it back in the outstanding deck.
 */

function formatDate(value) {
  if (!value) return "Cleared recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Cleared recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function ReviewHistory({ entries, onClose, onStudyAgain }) {
  return (
    <section className="review-history" aria-labelledby="review-history-title">
      <div className="review-history-heading">
        <div>
          <h3 id="review-history-title">Past reviews</h3>
          <p>
            Gaps you have already explained again. Studying one from here is
            practice only — it stays cleared either way.
          </p>
        </div>
        <button className="secondary" onClick={onClose} type="button">
          Close
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="history-message">
          Nothing cleared yet. Explain a card in a round and it lands here.
        </p>
      ) : (
        <ul className="review-history-list">
          {entries.map((entry) => (
            <li key={entry.sessionId}>
              <div className="review-history-entry">
                <div>
                  <p className="review-history-source">
                    {sourcePreview(entry.sourceText, 120) || "Saved source"}
                  </p>
                  <p className="review-history-meta">
                    {entry.cards.length}{" "}
                    {entry.cards.length === 1 ? "gap" : "gaps"} cleared ·{" "}
                    {formatDate(entry.lastClearedAt)}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => onStudyAgain(entry)}
                  type="button"
                >
                  Study again
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
