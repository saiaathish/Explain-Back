import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/*
 * A study stack, not a list. Cards you still owe sit on top of each other; the
 * top one is draggable. "Got it now" removes a card for good, "Still shaky"
 * sends it to the back so it comes around again. The deck is session-only, so
 * the count is honest every time: nothing here is written down.
 *
 * Adapted from the supplied morphing-card-stack reference. The stack and grid
 * layouts, drag-to-advance, and spring transitions are the same ideas; the
 * styling is this project's own.
 */

const SWIPE_DISTANCE = 90;
const SWIPE_VELOCITY = 500;
const SPRING = { type: "spring", stiffness: 320, damping: 30 };
const VISIBLE_IN_STACK = 3;

function StackIcon() {
  return (
    <svg aria-hidden="true" className="button-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden="true" className="button-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect height="7" rx="1" width="7" x="3" y="3" />
      <rect height="7" rx="1" width="7" x="14" y="3" />
      <rect height="7" rx="1" width="7" x="3" y="14" />
      <rect height="7" rx="1" width="7" x="14" y="14" />
    </svg>
  );
}

function stateLabel(state) {
  if (state === "red") return "Contradicted the source";
  if (state === "yellow") return "Stated but not explained";
  return "Not confident enough to judge";
}

function CardFace({ card, revealed, onToggle, interactive }) {
  return (
    <>
      <button
        aria-controls={`review-card-back-${card.id}`}
        aria-expanded={revealed}
        className="review-front"
        disabled={!interactive}
        onClick={onToggle}
        type="button"
      >
        <span className={`review-label review-label--${card.state}`}>
          {stateLabel(card.state)}
        </span>
        <span className="review-prompt">{card.prompt}</span>
        <span className="review-reveal-hint">
          {revealed ? "Hide what you said" : "Show what you said"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {revealed && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="review-back-wrap"
            exit={{ height: 0, opacity: 0 }}
            id={`review-card-back-${card.id}`}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="review-back">
              <p className="review-label">
                What you said, attempt {card.attemptNumber}
              </p>
              <blockquote className="review-claim">{card.claim}</blockquote>

              {card.misconception && (
                <>
                  <p className="review-label">The misconception recorded then</p>
                  <p className="review-misconception">{card.misconception}</p>
                  {card.refutation && (
                    <p className="review-refutation">{card.refutation}</p>
                  )}
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function ReviewCardStack({
  cards,
  layout,
  onLayoutChange,
  onGotIt,
  onStillShaky,
}) {
  const [revealedId, setRevealedId] = useState("");
  const [dragging, setDragging] = useState(false);

  const top = cards[0] || null;
  const visible = layout === "stack" ? cards.slice(0, VISIBLE_IN_STACK) : cards;

  function handleDragEnd(_event, info) {
    setDragging(false);
    const { offset, velocity } = info;
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) {
      onGotIt(top);
    } else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) {
      onStillShaky(top);
    }
  }

  return (
    <div className="review-stage">
      <div className="review-layout-toggle" role="group" aria-label="Card layout">
        {[
          { id: "stack", label: "Stack", Icon: StackIcon },
          { id: "grid", label: "Grid", Icon: GridIcon },
        ].map(({ id, label, Icon }) => (
          <button
            aria-pressed={layout === id}
            className={`review-layout-button${layout === id ? " is-selected" : ""}`}
            key={id}
            onClick={() => onLayoutChange(id)}
            type="button"
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>

      <motion.div className={`review-deck review-deck--${layout}`} layout>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((card, index) => {
              const isTop = layout === "stack" && index === 0;
              const revealed = revealedId === card.id;

              return (
                <motion.article
                  animate={{
                    opacity: 1,
                    /* Small scale steps, real vertical steps: the shrink must
                       not eat the peek the offset just created. */
                    scale: layout === "stack" ? 1 - index * 0.03 : 1,
                    y: layout === "stack" ? index * 34 : 0,
                    zIndex: cards.length - index,
                  }}
                  className={`review-card${isTop ? " is-top" : ""}${
                    revealed ? " is-revealed" : ""
                  }`}
                  drag={isTop && !revealed ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.55}
                  exit={{
                    opacity: 0,
                    scale: 0.9,
                    x: card.exitDirection === "shaky" ? 260 : -260,
                    transition: { duration: 0.28 },
                  }}
                  initial={{ opacity: 0, scale: 0.92, y: 28 }}
                  key={card.id}
                  onDragEnd={handleDragEnd}
                  onDragStart={() => setDragging(true)}
                  transition={SPRING}
                  whileDrag={{ scale: 1.02, cursor: "grabbing" }}
                >
                  <CardFace
                    card={card}
                    interactive={!dragging && (layout === "grid" || isTop)}
                    onToggle={() => setRevealedId(revealed ? "" : card.id)}
                    revealed={revealed}
                  />
                  {isTop && cards.length > 1 && (
                    <p className="review-swipe-hint" aria-hidden="true">
                      Drag left if you have it, right to see it again
                    </p>
                  )}
                </motion.article>
              );
            })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
