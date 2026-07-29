import { describe, expect, it, vi } from "vitest";
import {
  createAnonymousAuth,
  createSupabaseClient,
  getSupabaseClient,
} from "./supabase";

function authClient(overrides = {}) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      refreshSession: vi.fn(async () => ({
        data: { session: null },
        error: null,
      })),
      signInAnonymously: vi.fn(async () => ({
        data: { session: null },
        error: null,
      })),
      ...overrides,
    },
  };
}

describe("anonymous auth adapter", () => {
  it("restores an existing browser session", async () => {
    const session = { access_token: "restored-token" };
    const client = authClient({
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
    });

    await expect(createAnonymousAuth(client).getSession()).resolves.toBe(session);
  });

  it("returns the session created by anonymous sign-in", async () => {
    const session = { access_token: "new-token" };
    const client = authClient({
      signInAnonymously: vi.fn(async () => ({
        data: { session },
        error: null,
      })),
    });

    await expect(
      createAnonymousAuth(client).signInAnonymously(),
    ).resolves.toBe(session);
  });

  it("propagates Supabase auth errors", async () => {
    const error = new Error("auth unavailable");
    const client = authClient({
      getSession: vi.fn(async () => ({ data: null, error })),
      refreshSession: vi.fn(async () => ({ data: null, error })),
      signInAnonymously: vi.fn(async () => ({ data: null, error })),
    });
    const auth = createAnonymousAuth(client);

    await expect(auth.getSession()).rejects.toBe(error);
    await expect(auth.signInAnonymously()).rejects.toBe(error);
    await expect(auth.refreshAccessToken()).rejects.toBe(error);
  });

  it("refreshes only the access token exposed to backend callers", async () => {
    const client = authClient({
      refreshSession: vi.fn(async () => ({
        data: {
          session: {
            access_token: "fresh-access-token",
            refresh_token: "browser-only-refresh-token",
          },
        },
        error: null,
      })),
    });

    await expect(
      createAnonymousAuth(client).refreshAccessToken(),
    ).resolves.toBe("fresh-access-token");
  });

  it("forwards auth changes and cleans up its subscription", () => {
    const unsubscribe = vi.fn();
    let emit;
    const client = authClient({
      onAuthStateChange: vi.fn((listener) => {
        emit = listener;
        return { data: { subscription: { unsubscribe } } };
      }),
    });
    const listener = vi.fn();

    const cleanup = createAnonymousAuth(client).subscribe(listener);
    const session = { access_token: "changed-token" };
    emit("TOKEN_REFRESHED", session);
    cleanup();

    expect(listener).toHaveBeenCalledWith(session);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("browser Supabase client configuration", () => {
  const url = "https://example.supabase.co";

  it("requires both public environment values", () => {
    expect(() =>
      createSupabaseClient({ url: "", key: "" }, vi.fn()),
    ).toThrow(/not configured/i);
  });

  it.each([
    "sb_secret_private",
    "obvious-service_role-key",
    `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`,
  ])("rejects a secret or service-role-looking browser key", (key) => {
    expect(() => createSupabaseClient({ url, key }, vi.fn())).toThrow(
      /secret or service-role/i,
    );
  });

  it("returns one lazy singleton for publishable browser configuration", () => {
    vi.stubEnv("VITE_SUPABASE_URL", url);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(getSupabaseClient()).toBe(getSupabaseClient());

    vi.unstubAllEnvs();
  });
});
