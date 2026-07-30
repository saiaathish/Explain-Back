# Platform expansion release contract

## Hard fallback

- Branch: `feat/platform`, created from remote `main` at
  `e140a3776d7e69078d7aa7d50de3769ada93eeac`.
- Production `main` remains untouched during the staged build.
- Deadline: **July 30, 2026 at 4:45pm CDT (21:45 UTC)**.
- At the deadline, abandon any incomplete phase. Deploy and record against the
  last phase whose full stop-point checklist passed.
- Never cut RLS isolation proof, the golden regression, or a deployable fallback.

## Phase 0 decision: judge path

The 90-second judge path does not include an account form. The landing page has
one **Try it** action. Phase 1 enters the existing private, in-memory workspace
directly. Phase 2 replaces that action with Supabase anonymous sign-in, then
enters the same workspace. Email or OAuth identity linking remains optional and
outside the required walkthrough.

Anonymous Supabase users are authenticated users with a stable user ID for that
browser. Clearing browser storage, signing out, or changing devices loses access
unless the identity has been linked. The UI must say this plainly.

## Intentional privacy-contract change

The original build prohibited accounts and persistence. Phase 2 and Phase 3
supersede that product boundary deliberately; this is not an incidental SDK
change. Before either phase can pass:

- replace the no-auth/no-persistence invariant with positive security invariants;
- disclose exactly which source text and explanation attempts are stored;
- never expose a service-role or secret key to the browser;
- verify every supplied bearer token server-side and fail closed;
- enable and test ownership RLS before writing any user data.

## Independent stop points

1. Landing page: one-click entry, 390px coverage, existing product unchanged.
2. Auth: anonymous judge path, optional identity linking, malformed/expired
   bearer rejection, no persistence required.
3. Persistence: owned sessions and attempts, cross-user denial, refresh survival,
   minimal history.
4. Review: cards derived only from stored non-green flags; no new LLM calls.

## Current gate evidence — July 29, 2026

### Phase 1 — passed

- Checkpoint: `27df743b90e449ebcd19b727b248c16dc76d5d41`.
- The one-click landing path, actual diagnostic overlay, 390px layout,
  accessibility, and editorial-versus-utility typography split are covered by
  `frontend/e2e/landing.pw.js`.
- On the exact Phase 2 preview, five cache-disabled 390px navigations rendered
  the landing heading with first contentful paint between 112ms and 588ms.
  Desktop and mobile Axe scans had zero violations and no horizontal overflow.

### Phase 2 — code complete, hosted gate not passed

- Checkpoint: `3a8d80d8d741cd5fb39217c2b8f2d7e24efe2753`.
- Local evidence: 159 backend tests, 68 frontend tests, and 14 Playwright tests
  passed. These cover strict JWT/JWKS validation, malformed and expired token
  rejection, anonymous-session restoration and refresh, canonical Google
  identity-link initiation, rapid double-click single-flight behavior, and
  malicious redirect input. `AuthStateProvider` owns the lifecycle and exposes
  it to the wrapped application through `AuthContext`.
- The production-model golden gate passed at 34/37 original agreement and
  45/55 expanded agreement, with all four diagnostic states represented.
- Vercel deployment `dpl_94ZzLSykY2781JWbJtgEiLHsDzfJ` is READY from the exact
  checkpoint SHA. It intentionally fails closed because no Explain-Back
  Supabase project or preview credentials exist.
- The gate still requires a real Supabase project and a non-production backend
  deployed from the same checkpoint SHA. Configure matching public Supabase
  values, exact frontend/backend origins, Google, anonymous sign-ins, and
  Manual Linking; then verify anonymous entry, UID-preserving Google linking,
  callback cleanup, bearer requests, CORS, and reload behavior.
- Phase 3 code was written while this hosted matrix was still blocked on account
  provisioning, which departs from the original "verify Phase 2 first" order.
  The gate itself is not relaxed: Phase 2 and Phase 3 both remain unpassed until
  a real Supabase project and a same-SHA backend exist, and the demoable
  fallback is still Phase 1.

### Phase 3 — code complete, hosted gate not passed

- Schema: `supabase/migrations/20260730000000_phase3_persistence.sql` creates
  `sessions` and `explanation_attempts` only, grants the `authenticated` role
  only `select` and `insert`, and enables owner-scoped row-level security. There
  is no update path, no delete path, and no service-role usage. Ownership comes
  from `auth.uid()`, never from a browser-supplied column;
  `tests/test_invariants.py` now asserts each of those properties.
- Writes: the browser saves an attempt after a successful analysis using its own
  authenticated session. A revision on the same source reuses the session and
  increments `attempt_number`; a duplicate number is retried once. A failed save
  never blocks or alters an analysis — it surfaces one notice.
- Local evidence at this checkpoint: 160 backend tests, 73 frontend tests, and
  17 Playwright tests passed, plus a clean production build. Two new browser
  tests (`frontend/e2e/history.local.js`) drive a real Chromium against a
  PostgREST stand-in that derives the row owner from the bearer token:
  analysis then revision produce one session with two ordered attempts, saved
  history survives a reload, another identity's seeded session is absent from
  the list, and a direct `id=eq.<foreign>` read returns no rows.
- The saved-history screen scans clean: zero Axe violations at desktop and no
  horizontal overflow at 390px, with the editorial serif holding for source and
  attempt prose while compact metadata stays in the utility sans.
- The analysis pipeline is untouched: the diff against production `main` still
  changes no file under `backend/` except `auth.py` and `main.py`.
### Phase 3 — hosted database gate passed on July 29, 2026

Project `mkdshmetakgizbseqpkt` ("Explain-Back", organization "Sai") was created
and configured by the repository owner. Verified directly against it:

- Schema matches the migration exactly — two tables, the expected columns,
  `user_id default auth.uid()` with a cascade to `auth.users`, unique
  `(session_id, attempt_number)`, `attempt_number >= 1`, RLS enabled, and the
  four owner-scoped policies. Re-running the migration was refused as already
  applied and rolled back without changing anything.
- Grants to `authenticated` are exactly `select` and `insert`. `anon` has none.
- Auth configuration: anonymous sign-ins on, Google on, manual linking on, site
  URL and three exact redirect URLs, no broad `*.vercel.app` allowlist.
- Two real anonymous identities were created against the hosted project. All
  thirteen checks behaved correctly: owner insert `201` with the server-assigned
  owner; duplicate attempt number `409` `23505`; forging another `user_id` `403`
  `42501`; owner list returns its own session with the embedded attempt; the
  second identity's list, direct `id=eq.` read, and attempt read all return `[]`;
  writing into the owner's session `403`; owner update and delete `403` for lack
  of grant; the publishable key with no user session `401`; a malformed bearer
  `401`.
- The PR-14 backend already verifies tokens from this project: no token and a
  malformed token are `401`, while a real anonymous token reaches request
  validation (`422`). Its CORS allowlist admits only the exact
  `explain-back-9f4h76quw-…` preview origin and rejects production and
  `evil.example` with `400`.
- Residue left in the project by this proof, not removable without a service-role
  key: two anonymous users, one session row, one attempt row.

### Phase 2 — browser half proven against the real project

`frontend/playwright.supabase.config.js` and `frontend/e2e/auth.supabase.js`
drive a real Chromium against project `mkdshmetakgizbseqpkt` with the analysis
service stubbed, because a preview backend admits only its own Vercel origin.
Both tests pass:

- No auth request is made until **Try it** is clicked; that click produces
  exactly one `/signup`, and the stored session is anonymous with the access
  token's `sub` equal to the user id.
- A completed analysis writes one session owned by that user and one attempt; a
  revision adds attempt 2 to the same session; no save error appears.
- After a reload the same user id is restored with no second `/signup`, and
  **Past sessions** lists the loop with both attempts read back from the hosted
  database.
- Identity linking issues exactly one authorization request with
  `provider=google`, `redirect_to` equal to the app's own origin, and no
  attacker-supplied `next`.

Two findings from probing the hosted auth surface:

- Supabase does **not** validate `redirect_to` when authorization begins — it
  accepted `https://evil.example/` there. Enforcement happens at the callback,
  which without valid state redirects to the configured site URL instead. The
  app's real defense is `safeOAuthRedirectTo()` pinning the destination to its
  own origin with query and fragment stripped, which both this suite and the
  local suite assert.
- The Google client id is `1066507771736-…apps.googleusercontent.com`, and its
  authorized redirect URI must remain the project's `/auth/v1/callback`.

### Hosted preview — verified from the deployed origin

Vercel deployment `GW4ZNTwwu12ayW6mDWkyJQWaZrmk` is READY from exactly
`b0d5595`, served at
`https://explain-back-git-feat-platform-sai-aathish-karthiks-projects.vercel.app`
and `https://explain-back-nbof7sf1a-…`. Its preview environment variables were
already configured, and the built bundle inlines the correct values: Supabase
`mkdshmetakgizbseqpkt`, the publishable key, and the PR-14 backend. The bundle
contains no `sb_secret_` value; the only `service_role` occurrences are the
refusal strings in `supabase.js`.

Confirmed in a real browser against that origin:

- One **Try it** click created a live anonymous Supabase session issued by
  `mkdshmetakgizbseqpkt`, with the token subject equal to the user id, and opened
  the workspace.
- Cross-origin bearer requests to the same-SHA PR-14 backend succeed from this
  origin with no CORS failure: a valid token reaches validation (`422`), while a
  malformed token and a missing token are both `401`. The backend's allowlist
  already contained this branch alias, so no Render change was needed — and the
  exact-SHA origin `…-nbof7sf1a-…` is correctly refused with `400`.
- A session and attempt written from this origin were then read back by the
  running app: after a reload, the restored anonymous session's **Past sessions**
  screen listed the saved loop with its attempt and coverage indicator.
- Zero console errors, and at 390px the history screen has no horizontal
  overflow (`scrollWidth` equals `innerWidth`).

Remaining before Phase 2 can be called passed: the scripted matrix in
`frontend/e2e/auth.hosted.js` has not been run against this deployment, because
it needs the project's automation bypass secret and reading that secret is the
owner's to do. Until that suite passes, the demoable fallback remains Phase 1.
The Google identity link was deliberately not completed — that requires signing
in to a Google account, which is also the owner's to do.

### Phase 4 — not started

- Phase 4 has no stored-flag review or mastery implementation.

### Fallback — verified

- `origin/main` remains
  `e140a3776d7e69078d7aa7d50de3769ada93eeac`.
- Vercel production metadata points to that exact SHA and the production site
  returns HTTP 200.
- Render production health returns HTTP 200 for both HEAD and GET.
