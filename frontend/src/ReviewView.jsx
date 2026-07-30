import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAnalysisHistory } from "./analysisHistory";
import {
  deriveCards,
  getFlashcardReviews,
  reviewProgress,
} from "./flashcards";

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

function CardBack({ card }) {
  return (
    <div className="review-back">
      <p className="review-label">What you said, attempt {card.attemptNumber}</p>
      <blockquote className="review-claim">{card.claim}</blockquote>

      {card.misconception && (
        <>
          <p className="review-label">The misconception recorded then</p>
          <p className="review-misconception">{card.misconception}</p>
          {card.refutation && <p className="review-refutation">{card.refutation}</p>}
        </>
      )}

      {card.anchor && (
        <>
          <p className="review-label">What the source said</p>
          <p className="review-anchor">{card.anchor}</p>
        </>
      )}

      {card.hint && (
        <>
          <p className="review-label">How to close it</p>
          <p className="review-hint">{card.hint}</p>
        </>
      )}

      <p className="review-status">
        {card.resolvedLater
          ? "You closed this in a later attempt."
          : "This was still open at your last attempt."}
      </p>
    </div>
  );
}

export default function ReviewView({ onBack }) {
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState("loading");
  const [markError, setMarkError] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    Promise.all([
      getAnalysisHistory().listSessions(),
      getFlashcardReviews().listReviews(),
    ])
      .then(([sessions, reviews]) => {
        if (!mountedRef.current) return;
        setCards(deriveCards(sessions, reviews));
        setStatus("ready");
      })
      .catch(() => {
        if (mountedRef.current) setStatus("error");
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const progress = useMemo(() => reviewProgress(cards), [cards]);
  const card = cards[index] || null;

  const advance = useCallback(() => {
    setRevealed(false);
    setIndex((current) => (cards.length ? (current + 1) % cards.length : 0));
  }, [cards.length]);

  const mark = useCallback(
    async (mastered) => {
      if (!card) return;
      setMarkError("");
      /* The card list updates first: a mark must be visible even if the write
       * is slow, and the write itself is append-only so a retry is harmless. */
      setCards((current) =>
        current.map((entry) =>
          entry.id === card.id
            ? { ...entry, mastered, lastReviewedAt: new Date().toISOString() }
            : entry,
        ),
      );
      advance();
      try {
        await getFlashcardReviews().markCard({
          sessionId: card.sessionId,
          propId: card.propId,
          mastered,
        });
      } catch {
        if (mountedRef.current) {
          setMarkError(
            "That mark was not saved. Your gaps are unchanged — try marking it again.",
          );
        }
      }
    },
    [advance, card],
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
        <section className="review-view" aria-labelledby="review-title">
          <div className="history-heading">
            <div>
              <h2 id="review-title">Review your gaps</h2>
              <p>
                Built only from claims your saved attempts left yellow, red, or
                unresolved. No new analysis runs here.
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
          {status === "ready" && cards.length === 0 && (
            <p className="history-message">
              No gaps recorded yet. Analyze an explanation, and anything that does
              not hold up will show up here.
            </p>
          )}

          {status === "ready" && card && (
            <>
              <p className="review-progress" aria-live="polite">
                {progress.label} · card {index + 1} of {cards.length}
              </p>
              {markError && (
                <p className="history-message history-message--error" role="alert">
                  {markError}
                </p>
              )}

              <div className={`review-card${revealed ? " is-revealed" : ""}`}>
                <button
                  aria-controls="review-card-back"
                  aria-expanded={revealed}
                  className="review-front"
                  onClick={() => setRevealed((current) => !current)}
                  type="button"
                >
                  <span className="review-label">
                    {card.state === "red"
                      ? "Contradicted the source"
                      : card.state === "yellow"
                        ? "Stated but not explained"
                        : "Not confident enough to judge"}
                  </span>
                  <span className="review-prompt">{card.prompt}</span>
                  <span className="review-reveal-hint">
                    {revealed ? "Hide what you said" : "Show what you said"}
                  </span>
                </button>

                <div hidden={!revealed} id="review-card-back">
                  <CardBack card={card} />
                </div>
              </div>

              <div className="review-actions">
                <button
                  className="primary"
                  onClick={() => mark(true)}
                  type="button"
                >
                  Got it now
                </button>
                <button
                  className="secondary"
                  onClick={() => mark(false)}
                  type="button"
                >
                  Still shaky
                </button>
                <button
                  className="secondary review-skip"
                  onClick={advance}
                  type="button"
                >
                  Skip for now
                </button>
              </div>

              {card.mastered !== null && (
                <p className="review-mark">
                  Last marked {card.mastered ? "understood" : "still shaky"}.
                </p>
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
