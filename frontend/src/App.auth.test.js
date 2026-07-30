import { describe, expect, it, vi } from "vitest";
import {
  boundedSingleFlight,
  isOAuthReturn,
  readOAuthCallbackError,
  singleFlight,
  shouldOpenWorkspaceOnSessionRestore,
  withTimeout,
} from "./App";

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

describe("required sign-in gate", () => {
  it("opens the workspace only for a real signed-in session", () => {
    expect(
      shouldOpenWorkspaceOnSessionRestore({
        access_token: "google-session",
        user: { is_anonymous: false },
      }),
    ).toBe(true);
    /* Anonymous sign-in was removed: a guest session must never open the app. */
    expect(
      shouldOpenWorkspaceOnSessionRestore({
        access_token: "anonymous-session",
        user: { is_anonymous: true },
      }),
    ).toBe(false);
    expect(
      shouldOpenWorkspaceOnSessionRestore({
        access_token: "incomplete-session",
        user: {},
      }),
    ).toBe(false);
    expect(shouldOpenWorkspaceOnSessionRestore(null)).toBe(false);
  });

  it("recognises a provider return so the landing page is never shown again", () => {
    expect(isOAuthReturn("?code=abc", "")).toBe(true);
    expect(isOAuthReturn("", "#access_token=abc&refresh_token=def")).toBe(true);
    expect(isOAuthReturn("", "")).toBe(false);
    expect(isOAuthReturn("?next=/somewhere", "")).toBe(false);
  });
});

describe("OAuth callback verdict", () => {
  it("reads nothing from a clean return", () => {
    expect(readOAuthCallbackError("", "")).toBeNull();
    expect(readOAuthCallbackError("?code=abc", "")).toBeNull();
  });

  it("carries the provider's own reason back to the login screen", () => {
    const failure = readOAuthCallbackError(
      "?error=server_error&error_code=server_error&error_description=Google+is+unavailable",
      "",
    );

    expect(failure).toMatchObject({ code: "server_error" });
    expect(failure.message).toBe("Google is unavailable");
  });

  it("reads a verdict from the fragment and keeps other failures recoverable", () => {
    const failure = readOAuthCallbackError(
      "",
      "#error=access_denied&error_description=User+denied+access",
    );

    expect(failure.message).toBe("User denied access");
  });

  it("falls back to plain guidance when the provider sends no description", () => {
    const failure = readOAuthCallbackError("?error=access_denied", "");

    expect(failure).toMatchObject({ code: "oauth_error" });
    expect(failure.message).toContain("Try again");
  });
});
