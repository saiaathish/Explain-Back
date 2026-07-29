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
