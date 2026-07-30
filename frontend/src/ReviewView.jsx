import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAnalysisHistory } from "./analysisHistory";
import { deriveCards, roundSummary } from "./flashcards";
import ReviewCardStack from "./ReviewCardStack";

/*
 * A study round, not a record. The deck is rebuilt from stored gaps every time
 * this screen opens and nothing about the round is written back, so "12 left"
 * always means twelve gaps you have not just explained. Saying you have one
 * removes it from the round; saying you are shaky sends it to the back of the
 * deck to come around again. Closing the screen starts a clean round.
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

export default function ReviewView({ onBack }) {
  const [deck, setDeck] = useState([]);
  const [queue, setQueue] = useState([]);
  const [layout, setLayout] = useState("stack");
  const [status, setStatus] = useState("loading");
  const mountedRef = useRef(true);
  const frameRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    getAnalysisHistory()
      .listSessions()
      .then((sessions) => {
        if (!mountedRef.current) return;
        const cards = deriveCards(sessions);
        setDeck(cards);
        setQueue(cards);
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

  /* The exit direction has to be on the card before it leaves, so the change is
   * made in two steps: mark it, then move it on the next frame. */
  const act = useCallback((card, direction) => {
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
  }, []);

  const gotIt = useCallback((card) => act(card, "got"), [act]);
  const stillShaky = useCallback((card) => act(card, "shaky"), [act]);

  const restart = useCallback(() => setQueue(deck), [deck]);

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
              <h2 id="review-title">Review your gaps</h2>
              <p>
                Built only from claims your saved attempts left yellow, red, or
                unresolved. No new analysis runs here, and this round is not
                saved — every visit starts with the full deck.
              </p>
            </div>
          </div>

          {status === "loading" && (
            <p className="history-message">Gathering your recorded gaps…</p>
          )}
          {status === "error" && (
            <p className="history-message history-message--error" role="alert">
              Your gaps could not be loaded. You can still return to the workspace.
            </p>
          )}
          {status === "ready" && deck.length === 0 && (
            <p className="history-message">
              No gaps recorded yet. Analyze an explanation, and anything that does
              not hold up will show up here.
            </p>
          )}

          {status === "ready" && deck.length > 0 && (
            <>
              <div className="review-progress-row">
                <p className="review-progress" aria-live="polite">
                  {round.label}
                </p>
                <p className="review-progress review-progress--muted">
                  {round.cleared} of {round.total} explained this round
                </p>
              </div>

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
                  <h3>Deck clear</h3>
                  <p>
                    You explained all {deck.length}{" "}
                    {deck.length === 1 ? "gap" : "gaps"} in this round. Nothing was
                    saved, so they are all waiting whenever you want another pass.
                  </p>
                  <div className="review-actions">
                    <button className="primary" onClick={restart} type="button">
                      Study them again
                    </button>
                    <button className="secondary" onClick={onBack} type="button">
                      Back to workspace
                    </button>
                  </div>
                </div>
              )}
            </>
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
