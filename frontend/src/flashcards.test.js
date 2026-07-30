import { describe, expect, it } from "vitest";
import {
  deriveCards,
  outstandingCards,
  promptFor,
  roundSummary,
} from "./flashcards";

function session(id, attempts) {
  return { id, source_text: `Source ${id}`, explanation_attempts: attempts };
}

const YELLOW = {
  prop_id: "gradients",
  state: "yellow",
  claim: "The gradients support membrane function.",
  anchor: "Three sodium ions leave while two potassium ions enter.",
  hint: "Say why the gradient matters.",
};

const RED = {
  prop_id: "direction",
  state: "red",
  claim: "It moves potassium out and sodium in.",
  anchor: "Sodium leaves the cell and potassium enters.",
  hint: "Reverse the ion directions.",
  misconception: "The transport direction is reversed.",
  refutation: "The pump exports sodium and imports potassium.",
};

describe("flashcard derivation", () => {
  it("makes one card per recorded gap, never from green claims", () => {
    const cards = deriveCards([
      session("s1", [
        {
          attempt_number: 1,
          explanation_text: "First try.",
          flags: [YELLOW, RED, { prop_id: "energy", state: "green", claim: "ATP." }],
        },
      ]),
    ]);

    /* Red sorts first: a contradiction is worth explaining before a thin claim. */
    expect(cards.map((card) => card.propId)).toEqual(["direction", "gradients"]);
    expect(cards.every((card) => card.state !== "green")).toBe(true);
  });

  it("keeps the original gap and reports that a later attempt closed it", () => {
    const cards = deriveCards([
      session("s1", [
        { attempt_number: 2, flags: [{ ...RED, state: "green" }] },
        { attempt_number: 1, explanation_text: "First try.", flags: [RED] },
      ]),
    ]);

    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card.attemptNumber).toBe(1);
    expect(card.claim).toBe(RED.claim);
    expect(card.misconception).toBe(RED.misconception);
    expect(card.resolvedLater).toBe(true);
  });

  it("counts a round down without recording anything", () => {
    const deck = deriveCards([
      session("s1", [{ attempt_number: 1, flags: [YELLOW, RED] }]),
    ]);

    expect(deck).toHaveLength(2);
    /* Cards carry no review state: a round is rebuilt from gaps every visit. */
    expect(deck.every((card) => !("mastered" in card))).toBe(true);
    expect(roundSummary(deck, 2)).toMatchObject({
      total: 2,
      remaining: 2,
      cleared: 0,
      complete: false,
      label: "2 cards left",
    });
    expect(roundSummary(deck, 1).label).toBe("1 card left");
    expect(roundSummary(deck, 0)).toMatchObject({
      cleared: 2,
      complete: true,
      label: "Nothing left in this round",
    });
    expect(roundSummary([], 0)).toMatchObject({
      complete: false,
      label: "No recorded gaps yet",
    });
  });

  it("drops gaps already explained and keeps ones recorded later", () => {
    const sessionA = session("a", [{ attempt_number: 1, flags: [YELLOW, RED] }]);
    const sessionB = session("b", [{ attempt_number: 1, flags: [RED] }]);
    const cards = deriveCards([sessionA, sessionB]);
    expect(cards).toHaveLength(3);

    /* Session A fully cleared: only session B is still owed. */
    const clearedA = [
      { session_id: "a", prop_id: "direction" },
      { session_id: "a", prop_id: "gradients" },
    ];
    expect(outstandingCards(cards, clearedA).map((card) => card.sessionId)).toEqual([
      "b",
    ]);

    /* A later attempt records a new gap on the cleared source. */
    const withNewGap = deriveCards([
      session("a", [
        { attempt_number: 1, flags: [YELLOW, RED] },
        {
          attempt_number: 2,
          flags: [{ ...RED, prop_id: "energy", claim: "ATP is used somehow." }],
        },
      ]),
      sessionB,
    ]);
    expect(
      outstandingCards(withNewGap, clearedA).map((card) => card.id),
    ).toEqual(["a:energy", "b:direction"]);
  });

  it("treats partial progress as progress", () => {
    const cards = deriveCards([
      session("a", [{ attempt_number: 1, flags: [YELLOW, RED] }]),
    ]);

    const outstanding = outstandingCards(cards, [
      { session_id: "a", prop_id: "direction" },
    ]);
    expect(outstanding.map((card) => card.propId)).toEqual(["gradients"]);
    expect(outstandingCards(cards, [])).toHaveLength(2);
    expect(outstandingCards(cards, undefined)).toHaveLength(2);
  });

  it("frames the prompt from the source anchor, not from the learner's claim", () => {
    expect(promptFor(YELLOW)).toBe(
      "Explain: Three sodium ions leave while two potassium ions enter.",
    );
    expect(promptFor({ anchor: "  " })).toBe(
      "Explain this part of the source again.",
    );
    expect(promptFor({ anchor: `${"a".repeat(200)}.` })).toMatch(/…$/);
  });

  it("survives attempts with missing or malformed flag arrays", () => {
    expect(
      deriveCards([
        session("s1", [{ attempt_number: 1, flags: null }]),
        session("s2", null),
      ]),
    ).toEqual([]);
    expect(roundSummary([], 0).label).toBe("No recorded gaps yet");
  });
});
