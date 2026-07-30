import { useEffect, useMemo, useState } from "react";
import {
  attemptSummary,
  getAnalysisHistory,
  sourcePreview,
} from "./analysisHistory";

function formatDate(value) {
  if (!value) return "Saved recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function Brand() {
  return (
    <div className="header-intro">
      <h1 className="brand">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>
          Explain<span className="brand-accent">-</span>Back
        </span>
      </h1>
      <p>Your saved explanation loops.</p>
    </div>
  );
}

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

export default function HistoryView({ onBack }) {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    getAnalysisHistory()
      .listSessions()
      .then((savedSessions) => {
        if (!active) return;
        setSessions(savedSessions);
        setSelectedId(savedSessions[0]?.id || "");
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId) || null,
    [selectedId, sessions],
  );

  return (
    <div className="app-shell">
      <header>
        <Brand />
        <button className="secondary history-back" onClick={onBack} type="button">
          Back to workspace
        </button>
      </header>

      <main>
        <section className="history-view" aria-labelledby="history-title">
          <div className="history-heading">
            <div>
              <h2 id="history-title">Your past sessions</h2>
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
              Saved history could not be loaded. You can still return to the workspace.
            </p>
          )}
          {status === "ready" && sessions.length === 0 && (
            <p className="history-message">
              No saved sessions yet. Analyze a source to create the first one.
            </p>
          )}
          {status === "ready" && sessions.length > 0 && (
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
                          {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"} · {summary.coverageLabel}
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
                  <h3>{sourcePreview(selected.source_text, 260)}</h3>
                  <AttemptList attempts={selected.explanation_attempts || []} />
                </section>
              )}
            </div>
          )}
        </section>
      </main>

      <footer>
        Formative guidance only. Not a grade. This signed-in session stores source
        material and successful explanation attempts.
      </footer>
    </div>
  );
}
