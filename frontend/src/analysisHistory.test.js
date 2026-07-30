import { describe, expect, it, vi } from "vitest";
import {
  attemptSummary,
  createAnalysisHistory,
  sourcePreview,
} from "./analysisHistory";

function successfulSingle(data) {
  return {
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({ data, error: null })),
    })),
  };
}

function latestAttempt(data, error = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
  };
  return query;
}

function historyClient({ previousAttempt = null, sessions = [] } = {}) {
  const sessionInsert = vi.fn(() =>
    successfulSingle({
      id: "session-1",
      source_text: "Source text",
      created_at: "2026-07-30T00:00:00Z",
    }),
  );
  const attemptInsert = vi.fn(() =>
    successfulSingle({
      id: "attempt-1",
      session_id: "session-1",
      attempt_number: (previousAttempt?.attempt_number || 0) + 1,
      explanation_text: "Explanation text",
      concepts: [],
      flags: [],
      created_at: "2026-07-30T00:01:00Z",
    }),
  );
  const sessionList = {
    select: vi.fn(() => sessionList),
    order: vi.fn(() => Promise.resolve({ data: sessions, error: null })),
  };
  const from = vi.fn((table) => {
    if (table === "sessions") {
      return {
        insert: sessionInsert,
        select: sessionList.select,
        order: sessionList.order,
      };
    }
    return {
      select: vi.fn(() => latestAttempt(previousAttempt)),
      insert: attemptInsert,
    };
  });
  return { client: { from }, sessionInsert, attemptInsert };
}

describe("analysis history persistence", () => {
  it("creates an owner-scoped session and its first attempt without sending a user id", async () => {
    const { client, sessionInsert, attemptInsert } = historyClient();
    const saved = await createAnalysisHistory(client).saveAnalysis({
      sourceText: "Source text",
      explanationText: "Explanation text",
      result: { concepts: [{ id: "c1" }], flags: [{ state: "green" }] },
    });

    expect(sessionInsert).toHaveBeenCalledWith({ source_text: "Source text" });
    expect(attemptInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "session-1",
        attempt_number: 1,
        concepts: [{ id: "c1" }],
        flags: [{ state: "green" }],
      }),
    );
    expect(saved.session.id).toBe("session-1");
    expect(saved.attempt.attempt_number).toBe(1);
  });

  it("reuses a session and increments an existing revision number", async () => {
    const { client, sessionInsert, attemptInsert } = historyClient({
      previousAttempt: { attempt_number: 2 },
    });
    const saved = await createAnalysisHistory(client).saveAnalysis({
      sessionId: "session-1",
      sourceText: "Source text",
      explanationText: "Revision text",
      result: { concepts: [], flags: [] },
    });

    expect(sessionInsert).not.toHaveBeenCalled();
    expect(attemptInsert).toHaveBeenCalledWith(
      expect.objectContaining({ attempt_number: 3 }),
    );
    expect(saved.attempt.attempt_number).toBe(3);
  });

  it("keeps attempts sorted for the selected session history", async () => {
    const { client } = historyClient({
      sessions: [
        {
          id: "session-1",
          source_text: "Source text",
          explanation_attempts: [
            { id: "attempt-2", attempt_number: 2 },
            { id: "attempt-1", attempt_number: 1 },
          ],
        },
      ],
    });

    const sessions = await createAnalysisHistory(client).listSessions();
    expect(sessions[0].explanation_attempts.map((attempt) => attempt.id)).toEqual([
      "attempt-1",
      "attempt-2",
    ]);
  });
});

describe("history display helpers", () => {
  it("makes compact source previews and derives a small coverage indicator", () => {
    expect(sourcePreview(" One\n  compact source ")).toBe("One compact source");
    expect(sourcePreview("a".repeat(20), 10)).toBe("aaaaaaaaa…");
    expect(
      attemptSummary([
        { state: "green" },
        { state: "yellow" },
        { state: "red" },
      ]),
    ).toEqual({
      solid: 1,
      needsAttention: 2,
      total: 3,
      coverageLabel: "1/3 claims hold up",
    });
  });
});
