import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAnalysisHistory } from "./analysisHistory";
import { getClearedGaps, reviewHistory } from "./clearedGaps";
import { deriveCards, outstandingCards, roundSummary } from "./flashcards";
import ReviewCardStack from "./ReviewCardStack";
import ReviewHistory from "./ReviewHistory";

/*
 * The deck is every recorded gap the learner has not already explained again.
 * Explaining one clears it for good, so a finished source stops appearing while
 * a gap recorded on it later still shows up on its own. "Still shaky" only
 * moves a card to the back of the round; it is never written down.
 *
 * Past rounds live behind the history button and are practice only: studying
 * something from there never returns it to the outstanding deck.
 */

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
      <p>Gaps you recorded, ready to explain again.</p>
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg
      aria-hidden="true"
      className="button-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export default function ReviewView({ onBack }) {
  const [allCards, setAllCards] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [cleared, setCleared] = useState([]);
  const [queue, setQueue] = useState([]);
  const [practice, setPractice] = useState(null);
  const [layout, setLayout] = useState("stack");
  const [status, setStatus] = useState("loading");
  const [saveError, setSaveError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const mountedRef = useRef(true);
  const frameRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    Promise.all([
      getAnalysisHistory().listSessions(),
      getClearedGaps().listCleared(),
    ])
      .then(([savedSessions, clearedRows]) => {
        if (!mountedRef.current) return;
        const cards = deriveCards(savedSessions);
        setSessions(savedSessions);
        setAllCards(cards);
        setCleared(clearedRows);
        setQueue(outstandingCards(cards, clearedRows));
        setStatus("ready");
      })
      .catch(() => {
        if (mountedRef.current) setStatus("error");
      });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const deck = useMemo(
    () => (practice ? practice.cards : outstandingCards(allCards, cleared)),
    [allCards, cleared, practice],
  );

  /* The exit direction has to be on the card before it leaves, so the change is
   * made in two steps: mark it, then move it on the next frame. */
  const act = useCallback(
    (card, direction) => {
      if (!card) return;
      setQueue((current) =>
        current.map((entry) =>
          entry.id === card.id ? { ...entry, exitDirection: direction } : entry,
        ),
      );
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        setQueue((current) => {
          const index = current.findIndex((entry) => entry.id === card.id);
          if (index < 0) return current;
          const remaining = current.filter((entry) => entry.id !== card.id);
          if (direction === "got") return remaining;
          return [...remaining, { ...current[index], exitDirection: undefined }];
        });
      });

      /* Practice rounds replay cards that are already cleared. */
      if (direction !== "got" || practice) return;
      setSaveError("");
      getClearedGaps()
        .clearGap({ sessionId: card.sessionId, propId: card.propId })
        .then(() => {
          if (!mountedRef.current) return;
          setCleared((current) => [
            { session_id: card.sessionId, prop_id: card.propId, created_at: new Date().toISOString() },
            ...current,
          ]);
        })
        .catch(() => {
          if (!mountedRef.current) return;
          /* The card is put back rather than silently lost. */
          setQueue((current) =>
            current.some((entry) => entry.id === card.id)
              ? current
              : [...current, { ...card, exitDirection: undefined }],
          );
          setSaveError(
            "That card could not be marked as explained, so it stayed in the deck. Check your connection and try again.",
          );
        });
    },
    [practice],
  );

  const gotIt = useCallback((card) => act(card, "got"), [act]);
  const stillShaky = useCallback((card) => act(card, "shaky"), [act]);
  const restart = useCallback(() => setQueue(deck), [deck]);

  const startPractice = useCallback((entry) => {
    setPractice(entry);
    setQueue(entry.cards);
    setHistoryOpen(false);
    setSaveError("");
  }, []);

  const leavePractice = useCallback(() => {
    setPractice(null);
    setQueue(outstandingCards(allCards, cleared));
  }, [allCards, cleared]);

  const history = useMemo(
    () => reviewHistory(sessions, cleared, allCards),
    [allCards, cleared, sessions],
  );

  const remaining = queue.length;
  const top = queue[0] || null;
  const round = useMemo(() => roundSummary(deck, remaining), [deck, remaining]);

  return (
    <div className="app-shell">
      <header>
        <Brand />
        <button className="secondary history-back" onClick={onBack} type="button">
          Back to workspace
        </button>
      </header>

      <main>
        <section className="review-view" aria-labelledby="review-title">
          <div className="history-heading">
            <div>
              <h2 id="review-title">
                {practice ? "Practising a past review" : "Review your gaps"}
              </h2>
              <p>
                {practice
                  ? "These are already explained. Working through them again is practice — they stay cleared."
                  : "Built only from claims your saved attempts left yellow, red, or unresolved. Explaining a card clears it, so it will not come back."}
              </p>
            </div>
            {practice && (
              <button className="secondary" onClick={leavePractice} type="button">
                Back to my gaps
              </button>
            )}
          </div>

          {status === "loading" && (
            <p className="history-message">Gathering your recorded gaps…</p>
          )}
          {status === "error" && (
            <p className="history-message history-message--error" role="alert">
              Your gaps could not be loaded. You can still return to the workspace.
            </p>
          )}
          {status === "ready" && allCards.length === 0 && (
            <p className="history-message">
              No gaps recorded yet. Analyze an explanation, and anything that does
              not hold up will show up here.
            </p>
          )}

          {status === "ready" && allCards.length > 0 && (
            <>
              {/* An empty deck is an outcome, not a round with no progress. */}
              {deck.length > 0 && (
                <div className="review-progress-row">
                  <p className="review-progress" aria-live="polite">
                    {round.label}
                  </p>
                  <p className="review-progress review-progress--muted">
                    {round.cleared} of {round.total} explained this round
                  </p>
                </div>
              )}

              {saveError && (
                <p className="history-message history-message--error" role="alert">
                  {saveError}
                </p>
              )}

              {remaining > 0 ? (
                <>
                  <ReviewCardStack
                    cards={queue}
                    layout={layout}
                    onGotIt={gotIt}
                    onLayoutChange={setLayout}
                    onStillShaky={stillShaky}
                  />

                  <div className="review-actions">
                    <button
                      className="primary"
                      onClick={() => gotIt(top)}
                      type="button"
                    >
                      Got it now
                    </button>
                    <button
                      className="secondary"
                      onClick={() => stillShaky(top)}
                      type="button"
                    >
                      Still shaky
                    </button>
                  </div>
                </>
              ) : (
                <div className="review-done" role="status">
                  <p className="review-done-count">0</p>
                  <h3>{practice ? "Practice complete" : "Nothing left to explain"}</h3>
                  <p>
                    {practice
                      ? `You went through all ${deck.length} again. They were already cleared, so nothing changed.`
                      : "Every gap you recorded has been explained again. New gaps will appear here as you analyze more."}
                  </p>
                  <div className="review-actions">
                    {deck.length > 0 && (
                      <button className="primary" onClick={restart} type="button">
                        Study them again
                      </button>
                    )}
                    <button
                      className="secondary"
                      onClick={practice ? leavePractice : onBack}
                      type="button"
                    >
                      {practice ? "Back to my gaps" : "Back to workspace"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {status === "ready" && historyOpen && (
            <ReviewHistory
              entries={history}
              onClose={() => setHistoryOpen(false)}
              onStudyAgain={startPractice}
            />
          )}
        </section>
      </main>

      {status === "ready" && (
        <button
          aria-expanded={historyOpen}
          className="secondary review-history-toggle"
          onClick={() => setHistoryOpen((open) => !open)}
          type="button"
        >
          <HistoryIcon />
          Past reviews
          {history.length > 0 && (
            <span className="review-history-count">{history.length}</span>
          )}
        </button>
      )}

      <footer>
        Formative guidance only. Not a grade. This signed-in session stores source
        material and successful explanation attempts.
      </footer>
    </div>
  );
}
