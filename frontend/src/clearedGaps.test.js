import { describe, expect, it, vi } from "vitest";
import { createClearedGaps, gapKey, reviewHistory } from "./clearedGaps";

function clientWith(insertResult) {
  const insert = vi.fn(async () => insertResult);
  const order = vi.fn(async () => ({ data: [], error: null }));
  return {
    insert,
    order,
    client: { from: vi.fn(() => ({ insert, select: vi.fn(() => ({ order })) })) },
  };
}

describe("cleared gaps", () => {
  it("records a cleared gap without naming an owner", async () => {
    const { client, insert } = clientWith({ error: null });

    await expect(
      createClearedGaps(client).clearGap({ sessionId: "a", propId: "direction" }),
    ).resolves.toEqual({ sessionId: "a", propId: "direction" });
    expect(insert).toHaveBeenCalledWith({ session_id: "a", prop_id: "direction" });
  });

  it("treats clearing the same gap twice as success", async () => {
    const { client } = clientWith({ error: { code: "23505", message: "duplicate" } });

    await expect(
      createClearedGaps(client).clearGap({ sessionId: "a", propId: "direction" }),
    ).resolves.toMatchObject({ propId: "direction" });
  });

  it("surfaces a real failure so the card can go back in the deck", async () => {
    const { client } = clientWith({ error: { code: "42501", message: "denied" } });

    await expect(
      createClearedGaps(client).clearGap({ sessionId: "a", propId: "direction" }),
    ).rejects.toMatchObject({ name: "ClearedGapsError", code: "42501" });
  });

  it("reads cleared gaps newest first", async () => {
    const { client, order } = clientWith({ error: null });

    await createClearedGaps(client).listCleared();
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("refuses a client that cannot query", () => {
    expect(() => createClearedGaps(null)).toThrow(/browser client is required/);
  });

  it("groups past rounds by source, newest first", () => {
    const cards = [
      { id: gapKey("a", "one"), sessionId: "a", propId: "one" },
      { id: gapKey("a", "two"), sessionId: "a", propId: "two" },
      { id: gapKey("b", "one"), sessionId: "b", propId: "one" },
      { id: gapKey("c", "one"), sessionId: "c", propId: "one" },
    ];
    const cleared = [
      { session_id: "a", prop_id: "one", created_at: "2026-07-30T01:00:00Z" },
      { session_id: "a", prop_id: "two", created_at: "2026-07-30T03:00:00Z" },
      { session_id: "b", prop_id: "one", created_at: "2026-07-30T02:00:00Z" },
    ];
    const sessions = [
      { id: "a", source_text: "Membranes" },
      { id: "b", source_text: "Supply and demand" },
      { id: "c", source_text: "Never studied" },
    ];

    const history = reviewHistory(sessions, cleared, cards);
    expect(history.map((entry) => entry.sessionId)).toEqual(["a", "b"]);
    expect(history[0]).toMatchObject({
      sourceText: "Membranes",
      lastClearedAt: "2026-07-30T03:00:00Z",
    });
    expect(history[0].cards).toHaveLength(2);
    expect(reviewHistory([], [], [])).toEqual([]);
  });
});
