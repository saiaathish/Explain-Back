-- Explain-Back Phase 4: review marks for gaps the learner already recorded.
-- A flashcard is derived from stored flags, so nothing here stores card content.
-- Reviews are append-only for the same reason attempts are: the analysis history
-- must stay immutable, and the latest row for a card is its current mark.

begin;

create table public.flag_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  prop_id text not null check (length(prop_id) between 1 and 200),
  mastered boolean not null,
  created_at timestamptz not null default now()
);

create index flag_reviews_user_card_created_at_idx
  on public.flag_reviews (user_id, session_id, prop_id, created_at desc);

revoke all on table public.flag_reviews from anon, authenticated;
grant select, insert on table public.flag_reviews to authenticated;

alter table public.flag_reviews enable row level security;

create policy "flag_reviews_select_own"
  on public.flag_reviews
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- The owner column defaults to auth.uid(); the session must also be the
-- reviewer's own, so a valid session id from elsewhere cannot be marked.
create policy "flag_reviews_insert_own"
  on public.flag_reviews
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.sessions
      where sessions.id = flag_reviews.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

commit;
