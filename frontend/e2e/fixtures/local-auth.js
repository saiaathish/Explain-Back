import { expect, test as base } from "@playwright/test";

const LOCAL_PUBLISHABLE_KEY = "sb_publishable_e2e_local";
const AUTH_ROOT = "/__e2e-supabase/auth/v1";
const USER_ID = "3f501cb4-3783-4b55-9d75-d732f9555b5f";
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
});

export { expect };
