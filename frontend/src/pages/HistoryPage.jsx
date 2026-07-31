import { useEffect, useMemo, useState } from "react";
import { attemptSummary, sourcePreview } from "../analysisHistory";
import { useLearningData } from "../learningData";
import { formatDate } from "../stats";

function AttemptList({ attempts }) {
  if (!attempts.length) {
    return <p className="history-empty-attempts">No saved attempts yet.</p>;
  }

  return (
    <ol className="history-attempts">
      {attempts.map((attempt) => {
        const summary = attemptSummary(attempt.flags);
        return (
          <li key={attempt.id}>
            <div className="history-attempt-heading">
              <strong>Attempt {attempt.attempt_number}</strong>
              <span>{formatDate(attempt.created_at)}</span>
            </div>
            <p>{attempt.explanation_text}</p>
            <small>
              {summary.coverageLabel} · {summary.needsAttention} to revisit
            </small>
          </li>
        );
      })}
    </ol>
  );
}

export default function HistoryPage() {
  const { sessions, status } = useLearningData();
  const [selectedId, setSelectedId] = useState("");

  /* Selecting the newest session is a default, not a lock: it only applies
     while nothing valid is already selected. */
  useEffect(() => {
    setSelectedId((current) =>
      current && sessions.some((session) => session.id === current)
        ? current
        : sessions[0]?.id || "",
    );
  }, [sessions]);

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId) || null,
    [selectedId, sessions],
  );

  return (
    <section className="history-view" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <h1 id="history-title">Your past sessions</h1>
          <p>
            Sources and successful explanation attempts saved to this signed-in
            session.
          </p>
        </div>
      </div>

      {status === "loading" && (
        <p className="history-message">Loading saved sessions…</p>
      )}
      {status === "error" && (
        <p className="history-message history-message--error" role="alert">
          Saved history could not be loaded. You can still start a new session.
        </p>
      )}
      {status === "ready" && sessions.length === 0 && (
        <p className="history-message">
          No saved sessions yet. Analyze a source to create the first one.
        </p>
      )}
      {sessions.length > 0 && (
        <div className="history-layout">
          <ul className="history-sessions">
            {sessions.map((session) => {
              const attempts = session.explanation_attempts || [];
              const latest = attempts[attempts.length - 1];
              const summary = attemptSummary(latest?.flags);
              const selectedSession = session.id === selectedId;
              return (
                <li key={session.id}>
                  <button
                    aria-controls={`history-session-${session.id}`}
                    aria-expanded={selectedSession}
                    className={selectedSession ? "is-selected" : ""}
                    onClick={() => setSelectedId(session.id)}
                    type="button"
                  >
                    <span className="history-session-source">
                      {sourcePreview(session.source_text)}
                    </span>
                    <span className="history-session-meta">
                      {attempts.length}{" "}
                      {attempts.length === 1 ? "attempt" : "attempts"} ·{" "}
                      {summary.coverageLabel}
                    </span>
                    <span className="history-session-date">
                      {formatDate(session.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <section
              className="history-detail"
              id={`history-session-${selected.id}`}
              aria-live="polite"
            >
              <p className="history-detail-label">Source</p>
              <h2>{sourcePreview(selected.source_text, 260)}</h2>
              <AttemptList attempts={selected.explanation_attempts || []} />
            </section>
          )}
        </div>
      )}
    </section>
  );
}
