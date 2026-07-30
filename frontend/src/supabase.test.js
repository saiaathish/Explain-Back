import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserAuth,
  createSupabaseClient,
  getSupabaseClient,
  safeOAuthRedirectTo,
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
      signInWithOAuth: vi.fn(async () => ({
        data: { url: "https://accounts.google.test/signin" },
        error: null,
      })),
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser auth adapter", () => {
  it("restores an existing browser session", async () => {
    const session = { access_token: "restored-token" };
    const client = authClient({
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
    });

    await expect(createBrowserAuth(client).getSession()).resolves.toBe(session);
  });



  it("signs in with Google using an origin-pinned redirect", async () => {
    const client = authClient();
    vi.stubGlobal("location", {
      origin: "https://explain-back.example",
      pathname: "/learn",
      search: "?next=https://evil.example",
    });
    const auth = createBrowserAuth(client);

    await expect(auth.signInWithGoogle()).resolves.toBe(
      "https://accounts.google.test/signin",
    );
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://explain-back.example/" },
    });
  });

  it("rejects a Google sign-in response that cannot start a redirect", async () => {
    const client = authClient({
      signInWithOAuth: vi.fn(async () => ({ data: { url: null }, error: null })),
    });
    vi.stubGlobal("location", {
      origin: "https://explain-back.example",
      pathname: "/",
    });

    await expect(
      createBrowserAuth(client).signInWithGoogle(),
    ).rejects.toThrow(/did not return/i);
  });


  it("propagates Supabase auth errors", async () => {
    const error = new Error("auth unavailable");
    const client = authClient({
      getSession: vi.fn(async () => ({ data: null, error })),
      refreshSession: vi.fn(async () => ({ data: null, error })),
      signInWithOAuth: vi.fn(async () => ({ data: null, error })),
    });
    vi.stubGlobal("location", {
      origin: "https://explain-back.example",
      pathname: "/",
    });
    const auth = createBrowserAuth(client);

    await expect(auth.getSession()).rejects.toBe(error);
    await expect(auth.signInWithGoogle()).rejects.toBe(error);
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
      createBrowserAuth(client).refreshAccessToken(),
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

    const cleanup = createBrowserAuth(client).subscribe(listener);
    const session = { access_token: "changed-token" };
    emit("TOKEN_REFRESHED", session);
    cleanup();

    expect(listener).toHaveBeenCalledWith(session);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("Google OAuth redirect safety", () => {
  it("canonicalizes every callback to the same-origin root", () => {
    vi.stubGlobal("location", {
      origin: "https://explain-back.example",
      pathname: "/lesson",
      search: "?token=do-not-forward",
      hash: "#private",
    });

    expect(safeOAuthRedirectTo()).toBe("https://explain-back.example/");
  });

  it.each([
    { origin: "", pathname: "/" },
    { origin: "file://local", pathname: "/" },
  ])("rejects unsafe browser origin data", (location) => {
    vi.stubGlobal("location", location);
    expect(() => safeOAuthRedirectTo()).toThrow(/browser origin/i);
  });
});

describe("browser Supabase client configuration", () => {
  const url = "https://example.supabase.co";

  it("requires both public environment values", () => {
    expect(() =>
      createSupabaseClient({ url: "", key: "" }, vi.fn()),
    ).toThrow(/not configured/i);
  });

  it("configures persistent PKCE callback handling explicitly", () => {
    const factory = vi.fn(() => ({ configured: true }));

    expect(
      createSupabaseClient(
        { url, key: "sb_publishable_test" },
        factory,
      ),
    ).toEqual({ configured: true });
    expect(factory).toHaveBeenCalledWith(url, "sb_publishable_test", {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
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
