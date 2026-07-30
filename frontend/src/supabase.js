import { createClient } from "@supabase/supabase-js";

let supabaseClient;

function jwtRole(key) {
  const payload = key.split(".")[1];
  if (!payload || typeof globalThis.atob !== "function") return "";
  try {
    const normalized = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(globalThis.atob(normalized)).role || "";
  } catch {
    return "";
  }
}

function validateBrowserConfig(url, key) {
  if (!url || !key) {
    throw new Error(
      "Anonymous access is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const normalizedKey = key.toLowerCase();
  if (
    normalizedKey.startsWith("sb_secret_") ||
    normalizedKey.includes("service_role") ||
    normalizedKey.includes("service-role") ||
    jwtRole(key) === "service_role"
  ) {
    throw new Error(
      "Refusing to initialize browser auth with a Supabase secret or service-role key.",
    );
  }
}

export function createSupabaseClient(
  {
    url = import.meta.env.VITE_SUPABASE_URL,
    key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  } = {},
  factory = createClient,
) {
  const trimmedUrl = url?.trim();
  const trimmedKey = key?.trim();
  validateBrowserConfig(trimmedUrl, trimmedKey);
  return factory(trimmedUrl, trimmedKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient();
  }
  return supabaseClient;
}

export function safeOAuthRedirectTo() {
  const location = globalThis.location;
  const rawOrigin = location?.origin?.trim();
  if (!rawOrigin) {
    throw new Error("Google sign-in requires a browser origin.");
  }

  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error("Google sign-in requires a valid browser origin.");
  }
  if (!["http:", "https:"].includes(origin.protocol)) {
    throw new Error("Google sign-in requires an HTTP or HTTPS browser origin.");
  }

  const redirectTo = new URL("/", `${origin.origin}/`);
  if (redirectTo.origin !== origin.origin) {
    throw new Error("Google sign-in redirect must stay on this site.");
  }
  redirectTo.search = "";
  redirectTo.hash = "";
  return redirectTo.toString();
}

export function createAnonymousAuth(client) {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data?.session || null;
    },

    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(session);
      });
      return () => data?.subscription?.unsubscribe();
    },

    async signInAnonymously() {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      return data?.session || null;
    },

    /* Used when the Google identity already belongs to another user: linking is
     * impossible, but signing in reaches the account that owns it. */
    async signInWithGoogle() {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: safeOAuthRedirectTo(),
        },
      });
      if (error) throw error;
      if (!data?.url) {
        throw new Error("Google sign-in did not return a redirect.");
      }
      return data.url;
    },

    async linkGoogleIdentity() {
      const { data, error } = await client.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: safeOAuthRedirectTo(),
        },
      });
      if (error) throw error;
      if (!data?.url) {
        throw new Error("Google identity linking did not return a redirect.");
      }
      return data.url;
    },

    async refreshAccessToken() {
      const { data, error } = await client.auth.refreshSession();
      if (error) throw error;
      return data?.session?.access_token || "";
    },
  };
}

function productionAuth() {
  return createAnonymousAuth(getSupabaseClient());
}

export const anonymousAuth = {
  getSession: () => productionAuth().getSession(),
  subscribe: (listener) => productionAuth().subscribe(listener),
  signInAnonymously: () => productionAuth().signInAnonymously(),
  linkGoogleIdentity: () => productionAuth().linkGoogleIdentity(),
  signInWithGoogle: () => productionAuth().signInWithGoogle(),
  refreshAccessToken: () => productionAuth().refreshAccessToken(),
};
