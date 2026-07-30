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

Still required, and the only remaining hosted blocker: a Vercel preview built
from this checkpoint with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
set, with the PR-14 backend's `FRONTEND_ORIGIN` pointed at that exact new preview
origin. Until then the browser half of Phase 2 — anonymous entry, UID-preserving
Google linking, callback cleanup, and reload survival — is unproven in hosting,
and the demoable fallback remains Phase 1.

### Phase 4 — not started

- Phase 4 has no stored-flag review or mastery implementation.

### Fallback — verified

- `origin/main` remains
  `e140a3776d7e69078d7aa7d50de3769ada93eeac`.
- Vercel production metadata points to that exact SHA and the production site
  returns HTTP 200.
- Render production health returns HTTP 200 for both HEAD and GET.
