/**
 * Learner Profile & Analytics View
 * 
 * Displays authenticated user account details, learning statistics (session counts,
 * accuracy, gain on revision, cleared gaps), and sign-out controls.
 */

import { useMemo } from "react";
import { useAuth } from "../AuthContext";
import { useLearningData } from "../learningData";
import { formatDelta, formatPercent, learningStats } from "../stats";

function StatCard({ label, value, hint }) {
  return (
    <li className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <small className="stat-hint">{hint}</small>}
    </li>
  );
}

export default function ProfilePage() {
  const { signOut, user } = useAuth();
  const { cards, cleared, sessions, status } = useLearningData();
  const stats = useMemo(
    () => learningStats(sessions, cards, cleared),
    [cards, cleared, sessions],
  );

  return (
    <section className="profile" aria-labelledby="profile-title">
      <header className="dashboard-heading">
        <h1 id="profile-title">Profile</h1>
        <p>Your account and what your sessions add up to so far.</p>
      </header>

      <section className="profile-account" aria-labelledby="profile-account-title">
        <h2 id="profile-account-title">Account</h2>
        <dl className="profile-details">
          <div>
            <dt>Signed in as</dt>
            <dd>{user?.email || "Google account"}</dd>
          </div>
          <div>
            <dt>Sign-in method</dt>
            <dd>Google</dd>
          </div>
        </dl>
        <button className="secondary" onClick={signOut} type="button">
          Sign out
        </button>
      </section>

      <section className="profile-stats" aria-labelledby="profile-stats-title">
        <h2 id="profile-stats-title">Your learning</h2>
        {status === "loading" && (
          <p className="history-message">Adding up your sessions…</p>
        )}
        {status === "error" && (
          <p className="history-message history-message--error" role="alert">
            Your stats could not be loaded right now.
          </p>
        )}
        {status === "ready" && (
          <ul className="stat-grid">
            <StatCard label="Sessions" value={stats.sessions} />
            <StatCard
              label="Explanations given"
              value={stats.attempts}
              hint={`${stats.revisedSessions} revised at least once`}
            />
            <StatCard
              label="Claims holding up"
              value={formatPercent(stats.averageCoverage)}
              hint="Averaged across your latest attempt per source"
            />
            <StatCard
              label="Gain on revision"
              value={formatDelta(stats.averageGain)}
              hint={
                stats.averageGain === null
                  ? "Revise a session to see this"
                  : "First attempt to latest"
              }
            />
            <StatCard label="Gaps recorded" value={stats.gapsRecorded} />
            <StatCard
              label="Gaps cleared"
              value={stats.gapsCleared}
              hint={`${stats.gapsOutstanding} still waiting`}
            />
          </ul>
        )}
      </section>

      <p className="profile-note">
        Formative guidance only. These numbers describe your practice, not your
        ability, and they are never shown to anyone else.
      </p>
    </section>
  );
}
