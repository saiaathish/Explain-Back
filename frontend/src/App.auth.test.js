import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  boundedSingleFlight,
  IdentityUpgrade,
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

describe("anonymous identity upgrade", () => {
  it("opens the workspace after a linked Google session restores", () => {
    expect(
      shouldOpenWorkspaceOnSessionRestore({
        access_token: "linked-session",
        user: { is_anonymous: false },
      }),
    ).toBe(true);
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
    expect(
      shouldOpenWorkspaceOnSessionRestore({
        access_token: "missing-user-session",
      }),
    ).toBe(false);
    expect(shouldOpenWorkspaceOnSessionRestore(null)).toBe(false);
  });

  it("is hidden after the session is no longer anonymous", () => {
    const markup = renderToStaticMarkup(
      createElement(IdentityUpgrade, {
        isAnonymous: false,
        busy: false,
        error: "",
        onLinkGoogleIdentity: vi.fn(),
      }),
    );

    expect(markup).toBe("");
  });

  it("offers a secondary Google link action only for anonymous sessions", () => {
    const markup = renderToStaticMarkup(
      createElement(IdentityUpgrade, {
        isAnonymous: true,
        busy: false,
        error: "",
        onLinkGoogleIdentity: vi.fn(),
      }),
    );

    expect(markup).toContain('class="secondary identity-link-button"');
    expect(markup).toContain(
      "Continue with Google to keep this session across devices",
    );
    expect(markup).not.toContain("scope");
  });

  it("announces identity-link timeout state accessibly", () => {
    const errorMarkup = renderToStaticMarkup(
      createElement(IdentityUpgrade, {
        isAnonymous: true,
        busy: false,
        error: "Google identity linking timed out.",
        onLinkGoogleIdentity: vi.fn(),
      }),
    );
    const busyMarkup = renderToStaticMarkup(
      createElement(IdentityUpgrade, {
        isAnonymous: true,
        busy: true,
        error: "",
        onLinkGoogleIdentity: vi.fn(),
      }),
    );

    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain("Google identity linking timed out");
    expect(busyMarkup).toContain('aria-busy="true"');
    expect(busyMarkup).toContain("Taking you to Google…");
    expect(busyMarkup).toContain("disabled");
  });
});
