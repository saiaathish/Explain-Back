/**
 * Learner Dashboard View
 * 
 * Primary home screen providing single-click session initiation, recent session activity cards,
 * and review gap callout nudges.
 */

import { useNavigate } from "react-router-dom";
import { attemptSummary, sourcePreview } from "../analysisHistory";
import { useLearningData } from "../learningData";
import { useSession } from "../session/SessionProvider";
import { formatDate } from "../stats";
import { NewSessionIcon } from "../layout/Icons";

const RECENT_LIMIT = 5;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { startNewSession } = useSession();
  const { outstanding, sessions, status } = useLearningData();
  const recent = sessions.slice(0, RECENT_LIMIT);

  function beginSession() {
    startNewSession();
    navigate("/session/source");
  }

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <header className="dashboard-heading">
        <h1 id="dashboard-title">Explain something back</h1>
        <p>
          Read it, put it away, say it in your own words. What you can say
          without looking is what you actually know.
        </p>
        <button className="primary dashboard-start" onClick={beginSession} type="button">
          <NewSessionIcon />
          Start a new session
        </button>
      </header>

      {outstanding.length > 0 && (
        <button
          className="dashboard-nudge"
          onClick={() => navigate("/review")}
          type="button"
        >
          <span className="dashboard-nudge-count">{outstanding.length}</span>
          <span>
            <strong>
              {outstanding.length === 1 ? "gap is" : "gaps are"} waiting to be
              explained again
            </strong>
            <small>Open the review deck</small>
          </span>
        </button>
      )}

      <section className="dashboard-recent" aria-labelledby="dashboard-recent-title">
        <div className="dashboard-recent-heading">
          <h2 id="dashboard-recent-title">Recent sessions</h2>
          {sessions.length > RECENT_LIMIT && (
            <button
              className="text-button"
              onClick={() => navigate("/history")}
              type="button"
            >
              See all {sessions.length}
            </button>
          )}
        </div>

        {status === "loading" && (
          <p className="history-message">Loading saved sessions…</p>
        )}
        {status === "error" && (
          <p className="history-message history-message--error" role="alert">
            Saved sessions could not be loaded. You can still start a new one.
          </p>
        )}
        {status === "ready" && recent.length === 0 && (
          <p className="history-message">
            No sessions yet. Your first one will show up here.
          </p>
        )}

        {recent.length > 0 && (
          <ul className="session-cards">
            {recent.map((session) => {
              const attempts = session.explanation_attempts || [];
              const latest = attempts[attempts.length - 1];
              const summary = attemptSummary(latest?.flags);
              return (
                <li key={session.id}>
                  <button onClick={() => navigate("/history")} type="button">
                    <span className="session-card-source">
                      {sourcePreview(session.source_text, 120)}
                    </span>
                    <span className="session-card-meta">
                      {attempts.length}{" "}
                      {attempts.length === 1 ? "attempt" : "attempts"} ·{" "}
                      {summary.coverageLabel}
                    </span>
                    <span className="session-card-date">
                      {formatDate(session.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
