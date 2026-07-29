import { describe, expect, it, vi } from "vitest";
import { boundedSingleFlight, singleFlight, withTimeout } from "./App";

describe("auth lifecycle helpers", () => {
  it("bounds a stalled auth operation with a retryable timeout error", async () => {
    vi.useFakeTimers();
    const result = withTimeout(
      new Promise(() => {}),
      25,
      "Anonymous sign-in timed out. Try again.",
    );
    const expectation = expect(result).rejects.toMatchObject({
      name: "AuthTimeoutError",
      message: "Anonymous sign-in timed out. Try again.",
    });

    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    vi.useRealTimers();
  });

  it("shares one in-flight auth request and clears it on settlement", async () => {
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const task = vi.fn(() => pending);
    const ref = { current: null };
    const owner = {};

    const first = singleFlight(ref, owner, task);
    const second = singleFlight(ref, owner, task);
    expect(second).toBe(first);
    await Promise.resolve();
    expect(task).toHaveBeenCalledOnce();

    resolve("session");
    await expect(first).resolves.toBe("session");
    expect(ref.current).toBeNull();
  });

  it("does not let an older request clear a newer owner's guard", async () => {
    let resolveFirst;
    let resolveSecond;
    const firstPending = new Promise((done) => {
      resolveFirst = done;
    });
    const secondPending = new Promise((done) => {
      resolveSecond = done;
    });
    const ref = { current: null };
    const firstOwner = {};
    const secondOwner = {};

    const first = singleFlight(ref, firstOwner, () => firstPending);
    const second = singleFlight(ref, secondOwner, () => secondPending);
    resolveFirst("old");
    await first;
    expect(ref.current?.owner).toBe(secondOwner);

    resolveSecond("new");
    await second;
    expect(ref.current).toBeNull();
  });

  it.each(["anonymous sign-in", "session refresh"])(
    "keeps one raw %s request shared across timeout and retry",
    async () => {
      vi.useFakeTimers();
      let resolveRaw;
      const rawRequest = new Promise((done) => {
        resolveRaw = done;
      });
      const sdkRequest = vi.fn(() => rawRequest);
      const ref = { current: null };
      const owner = {};
      const timeoutMessage = "Auth operation timed out.";

      const first = boundedSingleFlight(
        ref,
        owner,
        sdkRequest,
        25,
        timeoutMessage,
      );
      const firstExpectation = expect(first).rejects.toThrow(timeoutMessage);
      await vi.advanceTimersByTimeAsync(25);
      await firstExpectation;

      const retry = boundedSingleFlight(
        ref,
        owner,
        sdkRequest,
        25,
        timeoutMessage,
      );
      await Promise.resolve();
      expect(sdkRequest).toHaveBeenCalledOnce();

      resolveRaw("fresh-session");
      await expect(retry).resolves.toBe("fresh-session");
      expect(ref.current).toBeNull();

      await expect(
        boundedSingleFlight(ref, owner, sdkRequest, 25, timeoutMessage),
      ).resolves.toBe("fresh-session");
      expect(sdkRequest).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    },
  );
});
