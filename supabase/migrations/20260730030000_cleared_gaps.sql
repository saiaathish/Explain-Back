-- Explain-Back: gaps the learner has explained again.
--
-- One row per gap cleared in a review round. The review deck is every recorded
-- gap minus these, so clearing a card removes it from future rounds while a
-- gap recorded later on the same source still appears. Partial progress
-- survives leaving mid-round because each card is recorded on its own.
--
-- Append-only like the rest: there is no update or delete path, and the unique
-- key makes clearing the same gap twice harmless.

begin;

create table public.cleared_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  prop_id text not null check (length(prop_id) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (user_id, session_id, prop_id)
);

create index cleared_gaps_user_created_at_idx
  on public.cleared_gaps (user_id, created_at desc);

revoke all on table public.cleared_gaps from anon, authenticated;
grant select, insert on table public.cleared_gaps to authenticated;

alter table public.cleared_gaps enable row level security;

create policy "cleared_gaps_select_own"
  on public.cleared_gaps
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- The owner column defaults to auth.uid(); the session must also be the
-- learner's own, so a valid session id from elsewhere cannot be marked.
create policy "cleared_gaps_insert_own"
  on public.cleared_gaps
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.sessions
      where sessions.id = cleared_gaps.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

commit;
