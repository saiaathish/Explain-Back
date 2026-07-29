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
- Do not start Phase 3 until that hosted matrix passes.

### Later phases — not started

- Phase 3 has no schema, RLS policies, persistence writes, or history UI.
- Phase 4 has no stored-flag review or mastery implementation.

### Fallback — verified

- `origin/main` remains
  `e140a3776d7e69078d7aa7d50de3769ada93eeac`.
- Vercel production metadata points to that exact SHA and the production site
  returns HTTP 200.
- Render production health returns HTTP 200 for both HEAD and GET.
