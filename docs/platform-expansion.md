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

### Scripted hosted matrix — passed on July 29, 2026

`frontend/e2e/auth.hosted.js` was run against this deployment with the owner's
automation bypass secret. Three tests passed and the Google leg was skipped:

- Real anonymous entry with no email or password field anywhere on the path;
  preflight from the deployed origin `200` with that exact origin echoed back;
  `https://evil.example` refused `400` with no allow-origin header; a malformed
  bearer `401`; a real bearer reaching request validation; and the same anonymous
  user id restored after a reload.
- One backend `401` produces exactly one refresh and one replay, with a changed
  bearer and a byte-identical body.
- Phase 3 on the deployed origin: an analysis and its revision are saved without
  a save error, and after a reload the restored session's **Past sessions**
  screen lists one session with both attempts read back from the project. The
  analysis response is fulfilled locally so the gate never depends on a model
  call; every write and read is the real app against the real project.

The first attempt at this matrix failed on a 15-second preflight timeout. The
cause was Render free-tier cold start — a first health request measured 34
seconds — not a CORS or auth fault. Warm the PR-14 service before running.

Not proven, and deliberately left to the owner: completing a Google sign-in.
The link request itself is verified as canonical, but the round trip needs a real
Google account, so `E2E_GOOGLE_LINK=1` and a headed run remain the owner's step.
Phase 2 and Phase 3 are therefore passed for the guest path, which is the judge
path, with optional identity linking unverified end to end.

### Phase 4 — review of recorded gaps

A flashcard is a repackaging of stored data. `frontend/src/flashcards.js` derives
one card per not-green flag per session, entirely from rows already written in
Phase 3: the prompt is framed from the flag's source anchor, and the back is the
learner's own claim, the misconception and refutation when the resolver went red,
the source anchor, and the revision hint. No model call exists in this path, and
`e2e/review.local.js` asserts that no `/api/` request is made while reviewing.

- A gap keeps the attempt that first recorded it. If a later attempt turned the
  same flag green, the card says so rather than disappearing, which is what makes
  the revision loop legible.
- Marks are stored in `supabase/migrations/20260730010000_phase4_flag_reviews.sql`
  as one append-only `flag_reviews` table: owner from `auth.uid()`, `select` and
  `insert` only, no update or delete path, and an insert policy that also requires
  the reviewed session to belong to the reviewer. The latest row for a card is its
  current mark. No spaced-repetition scheduling was built.
- Ordering puts unreviewed gaps first, then shaky ones, then what the learner has
  already marked understood.
- A mark is applied to the visible list before its write resolves; a failed write
  says so and leaves the recorded gaps unchanged, because the write is
  append-only and safe to retry.

Deviation from the plan, stated plainly: the plan said to reuse "the marginal-note
flip animation you already built." No flip animation exists in this codebase —
the diagnostic disclosure is a reveal, not a flip. The card reuses the existing
disclosure conventions instead of inventing a new motion family.

#### Phase 4 verification

- 7 new unit tests cover derivation, the resolved-later case, latest-mark-wins
  ordering, anchor-framed prompts, malformed flag arrays, and the append-only
  write shape.
- 2 new browser tests cover the full loop: cards from stored gaps, reveal, both
  marks written, marks reflected after a reload, ordering, and a revision that
  closes a gap reporting as resolved.
- Zero Axe violations on the card face down and revealed, and no horizontal
  overflow at 390px.
- Live RLS proof against the real project, 11 checks: owner insert `201` with the
  server-assigned owner; a second append allowed; owner reads its own marks;
  another identity reads `[]` and is refused `403` when marking the owner's
  session; forging `user_id` `403`; update and delete `403` for lack of grant;
  an empty `prop_id` refused by check constraint `23514`; the publishable key with
  no user session `401`.

### Resolved flake

"focus rings and reduced motion disable every representative motion family" in
`e2e/interactivity.pw.js` failed three times in ten full local runs and passed in
isolation every time. The trace shows it was never a motion or focus-ring
problem: the failing assertion was `toBeFocused()` on the submit button, because
entering the workspace moves focus to the source field asynchronously. Under
full-suite load that handoff landed *after* the test focused the submit button
and stole focus back.

The fix waits for the app's own focus handoff before the test takes focus. No
assertion was relaxed. Six consecutive full-suite runs then passed 17/17.

### Phase 4 — not started

- Phase 4 has no stored-flag review or mastery implementation.

### Fallback — verified

- `origin/main` remains
  `e140a3776d7e69078d7aa7d50de3769ada93eeac`.
- Vercel production metadata points to that exact SHA and the production site
  returns HTTP 200.
- Render production health returns HTTP 200 for both HEAD and GET.

## Required sign-in — supersedes the Phase 0 guest decision

The owner decided that everyone signs in before using Explain-Back. That
reverses the Phase 0 judge-path decision recorded above, so the earlier text
stands as history rather than as the current contract.

- Flow: landing → login → Google → workspace. Returning from the provider must
  never pass through the landing page again. `e2e/login.local.js` installs a
  mutation observer before the redirect and asserts the landing shell is not
  painted once between Google and the workspace.
- Anonymous sign-in is gone, not hidden. `signInAnonymously` and `linkIdentity`
  were removed from the auth adapter, along with the identity-upgrade UI and the
  whole class of "identity is already linked" failures that came with linking.
- The app no longer strips the returned `?code=`. An earlier version cleaned the
  URL on mount and stranded the learner on the login screen, because the
  Supabase client needs that code to exchange for a session. Only a failed
  return is cleaned now.
- Sign-out is available in the workspace header and returns to the landing page
  with the workspace unreachable.

### Cost of this decision, stated plainly

The original plan called guest mode "the only auth flow that survives real
judging conditions" and listed real auth as the first thing to cut. Requiring an
account adds a Google consent screen to the 90-second walkthrough and makes the
demo depend on the provider being reachable. `JUDGES.md` now says so. This is a
product decision the owner made deliberately; it is recorded here so the
trade-off is not rediscovered later as a bug.

### Verification

- 81 frontend unit tests, 20 browser tests, 160 backend tests, clean build.
- `e2e/login.local.js` covers the ordered flow, the workspace being unreachable
  while signed out, session restore without a landing page, a refused sign-in
  explaining itself, and sign-out presenting the user's own token.
- Zero Axe violations on the landing page and the login screen, and both fit a
  390px viewport with a 44px minimum touch target.
