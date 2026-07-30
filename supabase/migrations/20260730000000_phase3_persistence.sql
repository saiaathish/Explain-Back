-- Explain-Back Phase 3: source sessions and successful explanation attempts.
-- This project deliberately uses the browser's authenticated Supabase session;
-- never use a service-role key for these user-owned records.

begin;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_text text not null,
  created_at timestamptz not null default now()
);

create table public.explanation_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  explanation_text text not null,
  concepts jsonb not null,
  flags jsonb not null,
  attempt_number integer not null check (attempt_number >= 1),
  created_at timestamptz not null default now(),
  unique (session_id, attempt_number)
);

create index sessions_user_created_at_idx
  on public.sessions (user_id, created_at desc);

create index explanation_attempts_session_attempt_number_idx
  on public.explanation_attempts (session_id, attempt_number desc);

revoke all on table public.sessions from anon, authenticated;
revoke all on table public.explanation_attempts from anon, authenticated;
grant select, insert on table public.sessions to authenticated;
grant select, insert on table public.explanation_attempts to authenticated;

alter table public.sessions enable row level security;
alter table public.explanation_attempts enable row level security;

create policy "sessions_select_own"
  on public.sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "sessions_insert_own"
  on public.sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "attempts_select_own_session"
  on public.explanation_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = explanation_attempts.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

create policy "attempts_insert_own_session"
  on public.explanation_attempts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sessions
      where sessions.id = explanation_attempts.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

commit;
