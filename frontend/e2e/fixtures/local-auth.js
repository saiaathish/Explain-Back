import { expect, test as base } from "@playwright/test";

const LOCAL_PUBLISHABLE_KEY = "sb_publishable_e2e_local";
const AUTH_ROOT = "/__e2e-supabase/auth/v1";
const REST_ROOT = "/__e2e-supabase/rest/v1";
const USER_ID = "3f501cb4-3783-4b55-9d75-d732f9555b5f";
const OTHER_USER_ID = "8c1d4a20-6d1f-4c53-9a0e-5b02de0f9d41";
const REFRESH_TOKEN = "e2e-refresh-token";

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    contentType: "application/json",
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function user(now, { isAnonymous = true } = {}) {
  const timestamp = new Date(now).toISOString();
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "",
    phone: "",
    app_metadata: isAnonymous
      ? { provider: "anonymous", providers: ["anonymous"] }
      : { provider: "google", providers: ["google"] },
    user_metadata: {},
    identities: isAnonymous
      ? []
      : [
          {
            id: "e2e-google-identity",
            provider: "google",
            user_id: USER_ID,
          },
        ],
    created_at: timestamp,
    updated_at: timestamp,
    is_anonymous: isAnonymous,
  };
}

function session(accessToken, refreshToken, now, options) {
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(now / 1000) + 3600,
    refresh_token: refreshToken,
    user: user(now, options),
  };
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fixtureJwt(sequence, now, issuer, isAnonymous = true) {
  const issuedAt = Math.floor(now / 1000);
  return [
    base64Url({ alg: "RS256", kid: "e2e-local-only", typ: "JWT" }),
    base64Url({
      sub: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: isAnonymous,
      iss: issuer,
      iat: issuedAt,
      exp: issuedAt + 3600,
      jti: `e2e-access-token-${sequence}`,
    }),
    Buffer.from(`e2e-signature-${sequence}`).toString("base64url"),
  ].join(".");
}

async function authorizedFixtureRequest(request) {
  return (
    (await request.headerValue("apikey")) === LOCAL_PUBLISHABLE_KEY &&
    (await request.headerValue("authorization")) ===
      `Bearer ${LOCAL_PUBLISHABLE_KEY}`
  );
}

async function authorizedIdentityLinkRequest(request, accessTokens) {
  const authorization = await request.headerValue("authorization");
  return (
    (await request.headerValue("apikey")) === LOCAL_PUBLISHABLE_KEY &&
    accessTokens.some(
      (accessToken) => authorization === `Bearer ${accessToken}`,
    )
  );
}

function tokenSubject(authorization) {
  const token = String(authorization || "").replace(/^Bearer /, "");
  const payload = token.split(".")[1];
  if (!payload) return "";
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).sub || "";
  } catch {
    return "";
  }
}

/*
 * A deliberately small PostgREST stand-in. It answers only the four requests
 * `analysisHistory.js` makes, and it models the migration's row-level security
 * by deriving the owner from the bearer token instead of trusting any column.
 */
function restFixture() {
  const rows = { sessions: [], explanation_attempts: [] };
  let inserts = 0;

  const ownedSessions = (userId) =>
    rows.sessions.filter((session) => session.user_id === userId);

  function embedAttempts(session, select) {
    if (!select.includes("explanation_attempts(")) return session;
    return {
      ...session,
      explanation_attempts: rows.explanation_attempts
        .filter((attempt) => attempt.session_id === session.id)
        .sort((left, right) => left.attempt_number - right.attempt_number),
    };
  }

  function selectSessions(userId, url) {
    const select = url.searchParams.get("select") || "";
    const idFilter = url.searchParams.get("id");
    let matches = ownedSessions(userId);
    if (idFilter) {
      const wanted = idFilter.replace(/^eq\./, "");
      matches = matches.filter((session) => session.id === wanted);
    }
    return matches
      .slice()
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((session) => embedAttempts(session, select));
  }

  function selectAttempts(userId, url) {
    const sessionFilter = (url.searchParams.get("session_id") || "").replace(
      /^eq\./,
      "",
    );
    const visible = new Set(ownedSessions(userId).map((session) => session.id));
    let matches = rows.explanation_attempts.filter(
      (attempt) => visible.has(attempt.session_id) &&
        (!sessionFilter || attempt.session_id === sessionFilter),
    );
    if ((url.searchParams.get("order") || "").includes("desc")) {
      matches = matches
        .slice()
        .sort((left, right) => right.attempt_number - left.attempt_number);
    }
    const limit = Number(url.searchParams.get("limit"));
    return Number.isInteger(limit) && limit > 0 ? matches.slice(0, limit) : matches;
  }

  function insertSession(userId, body) {
    inserts += 1;
    const row = {
      id: `e2e-session-${inserts}`,
      user_id: userId,
      source_text: body.source_text,
      created_at: new Date(Date.now() + inserts).toISOString(),
    };
    rows.sessions.push(row);
    return row;
  }

  function insertAttempt(userId, body) {
    /* The insert policy checks the parent session's owner, not the payload. */
    const parent = rows.sessions.find(
      (session) => session.id === body.session_id && session.user_id === userId,
    );
    if (!parent) return { error: { code: "42501", message: "row violates policy" } };
    if (
      rows.explanation_attempts.some(
        (attempt) =>
          attempt.session_id === body.session_id &&
          attempt.attempt_number === body.attempt_number,
      )
    ) {
      return {
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      };
    }

    inserts += 1;
    const row = {
      id: `e2e-attempt-${inserts}`,
      session_id: body.session_id,
      explanation_text: body.explanation_text,
      concepts: body.concepts,
      flags: body.flags,
      attempt_number: body.attempt_number,
      created_at: new Date(Date.now() + inserts).toISOString(),
    };
    rows.explanation_attempts.push(row);
    return { row };
  }

  return {
    rows,
    requests: [],
    otherUserId: OTHER_USER_ID,
    seedForeignSession({ sourceText = "Another learner's source", flags = [] } = {}) {
      const session = insertSession(OTHER_USER_ID, { source_text: sourceText });
      insertAttempt(OTHER_USER_ID, {
        session_id: session.id,
        explanation_text: "Another learner's explanation",
        concepts: [],
        flags,
        attempt_number: 1,
      });
      return session;
    },
    selectSessions,
    selectAttempts,
    insertSession,
    insertAttempt,
  };
}

export const test = base.extend({
  localAuthFixture: [false, { option: true }],

  authApi: [
    async ({ page, baseURL, localAuthFixture }, use) => {
      const state = {
        enabled: localAuthFixture,
        signupRequests: [],
        refreshRequests: [],
        identityLinkRequests: [],
        accessTokens: [],
      };

      if (!localAuthFixture) {
        await use(state);
        return;
      }

      if (!baseURL) {
        throw new Error("The local auth fixture requires a Playwright baseURL.");
      }

      const allowedOrigin = new URL(baseURL).origin;
      const issueAccessToken = (isAnonymous = true) => {
        const token = fixtureJwt(
          state.accessTokens.length + 1,
          Date.now(),
          `${allowedOrigin}${AUTH_ROOT}`,
          isAnonymous,
        );
        state.accessTokens.push(token);
        return token;
      };
      state.createLinkedSession = () =>
        session(issueAccessToken(false), REFRESH_TOKEN, Date.now(), {
          isAnonymous: false,
        });

      await page.route(`**${AUTH_ROOT}/**`, async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.origin !== allowedOrigin) {
          await route.fulfill(
            jsonResponse(403, {
              error: "local_auth_fixture_origin_rejected",
            }),
          );
          return;
        }

        if (
          request.method() === "GET" &&
          url.pathname === `${AUTH_ROOT}/user/identities/authorize`
        ) {
          if (
            !(await authorizedIdentityLinkRequest(
              request,
              state.accessTokens,
            ))
          ) {
            await route.fulfill(
              jsonResponse(401, {
                error: "local_auth_fixture_access_token_rejected",
              }),
            );
            return;
          }

          state.identityLinkRequests.push({
            headers: request.headers(),
            searchParams: Object.fromEntries(url.searchParams),
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
          await route.fulfill(
            jsonResponse(200, {
              url: `${allowedOrigin}/__e2e-google-provider`,
            }),
          );
          return;
        }

        if (!(await authorizedFixtureRequest(request))) {
          await route.fulfill(
            jsonResponse(401, {
              error: "local_auth_fixture_credentials_rejected",
            }),
          );
          return;
        }

        if (
          request.method() === "POST" &&
          url.pathname === `${AUTH_ROOT}/signup` &&
          !url.search
        ) {
          const body = request.postDataJSON();
          state.signupRequests.push({ body, headers: request.headers() });
          await route.fulfill(
            jsonResponse(
              200,
              session(issueAccessToken(), REFRESH_TOKEN, Date.now()),
            ),
          );
          return;
        }

        if (
          request.method() === "POST" &&
          url.pathname === `${AUTH_ROOT}/token` &&
          url.searchParams.get("grant_type") === "refresh_token" &&
          [...url.searchParams.keys()].every(
            (key) => key === "grant_type",
          )
        ) {
          const body = request.postDataJSON();
          state.refreshRequests.push({ body, headers: request.headers() });
          if (body?.refresh_token !== REFRESH_TOKEN) {
            await route.fulfill(
              jsonResponse(400, {
                error: "invalid_grant",
                error_description: "Refresh token is invalid.",
              }),
            );
            return;
          }
          await route.fulfill(
            jsonResponse(
              200,
              session(issueAccessToken(), REFRESH_TOKEN, Date.now()),
            ),
          );
          return;
        }

        await route.fulfill(
          jsonResponse(
            request.method() === "POST" ? 404 : 405,
            {
              error: "local_auth_fixture_route_rejected",
            },
            { allow: "POST" },
          ),
        );
      });

      await use(state);
    },
    { auto: true },
  ],

  restApi: [
    async ({ page, baseURL, localAuthFixture, authApi }, use) => {
      const state = restFixture();

      if (!localAuthFixture) {
        await use(state);
        return;
      }

      const allowedOrigin = new URL(baseURL).origin;

      await page.route(`**${REST_ROOT}/**`, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const table = url.pathname.slice(`${REST_ROOT}/`.length);
        const authorization = await request.headerValue("authorization");
        const wantsObject = (
          (await request.headerValue("accept")) || ""
        ).includes("application/vnd.pgrst.object+json");

        if (url.origin !== allowedOrigin) {
          await route.fulfill(
            jsonResponse(403, { code: "PGRST301", message: "origin rejected" }),
          );
          return;
        }

        const subject = tokenSubject(authorization);
        const authorized =
          (await request.headerValue("apikey")) === LOCAL_PUBLISHABLE_KEY &&
          authApi.accessTokens.some(
            (accessToken) => authorization === `Bearer ${accessToken}`,
          ) &&
          subject === USER_ID;

        if (!authorized) {
          await route.fulfill(
            jsonResponse(401, {
              code: "PGRST301",
              message: "JWT verification failed",
            }),
          );
          return;
        }

        state.requests.push({
          method: request.method(),
          table,
          searchParams: Object.fromEntries(url.searchParams),
        });

        if (!["sessions", "explanation_attempts"].includes(table)) {
          await route.fulfill(
            jsonResponse(404, { code: "PGRST205", message: "unknown table" }),
          );
          return;
        }

        if (request.method() === "GET") {
          const matches =
            table === "sessions"
              ? state.selectSessions(subject, url)
              : state.selectAttempts(subject, url);
          if (wantsObject) {
            await route.fulfill(
              matches.length === 1
                ? jsonResponse(200, matches[0])
                : jsonResponse(406, {
                    code: "PGRST116",
                    details: `Results contain ${matches.length} rows`,
                    hint: null,
                    message: "JSON object requested, multiple (or no) rows returned",
                  }),
            );
            return;
          }
          await route.fulfill(jsonResponse(200, matches));
          return;
        }

        if (request.method() !== "POST") {
          await route.fulfill(
            jsonResponse(405, { code: "PGRST102", message: "method rejected" }),
          );
          return;
        }

        const body = request.postDataJSON();
        if (body?.user_id) {
          await route.fulfill(
            jsonResponse(403, {
              code: "42501",
              message: "the browser must not choose a row owner",
            }),
          );
          return;
        }

        if (table === "sessions") {
          const row = state.insertSession(subject, body);
          await route.fulfill(jsonResponse(201, wantsObject ? row : [row]));
          return;
        }

        const { row, error } = state.insertAttempt(subject, body);
        await route.fulfill(
          error
            ? jsonResponse(error.code === "23505" ? 409 : 403, {
                code: error.code,
                details: null,
                hint: null,
                message: error.message,
              })
            : jsonResponse(201, wantsObject ? row : [row]),
        );
      });

      await use(state);
    },
    { auto: true },
  ],
});

export { expect };
