import { describe, expect, it, vi } from "vitest";
import {
  createFlashcardReviews,
  deriveCards,
  promptFor,
  reviewProgress,
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

  it("applies only the latest mark for a card and orders unreviewed gaps first", () => {
    const sessions = [session("s1", [{ attempt_number: 1, flags: [YELLOW, RED] }])];
    const cards = deriveCards(sessions, [
      {
        session_id: "s1",
        prop_id: "direction",
        mastered: false,
        created_at: "2026-07-30T00:00:00Z",
      },
      {
        session_id: "s1",
        prop_id: "direction",
        mastered: true,
        created_at: "2026-07-30T01:00:00Z",
      },
    ]);

    expect(cards.map((card) => [card.propId, card.mastered])).toEqual([
      ["gradients", null],
      ["direction", true],
    ]);
    expect(reviewProgress(cards)).toMatchObject({
      total: 2,
      mastered: 1,
      shaky: 0,
      unreviewed: 1,
      label: "1 of 2 marked as understood",
    });
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
    expect(reviewProgress([]).label).toBe("No recorded gaps yet");
  });
});

describe("review marks", () => {
  it("inserts a mark without naming an owner and reads marks oldest first", async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: {
              session_id: "s1",
              prop_id: "direction",
              mastered: true,
              created_at: "2026-07-30T02:00:00Z",
            },
            error: null,
          }),
        ),
      })),
    }));
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const client = {
      from: vi.fn(() => ({ insert, select: vi.fn(() => ({ order })) })),
    };
    const reviews = createFlashcardReviews(client);

    const saved = await reviews.markCard({
      sessionId: "s1",
      propId: "direction",
      mastered: true,
    });
    expect(insert).toHaveBeenCalledWith({
      session_id: "s1",
      prop_id: "direction",
      mastered: true,
    });
    expect(saved.mastered).toBe(true);

    await reviews.listReviews();
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("refuses a client that cannot query", () => {
    expect(() => createFlashcardReviews(null)).toThrow(/browser client is required/);
  });
});
