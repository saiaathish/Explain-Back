-- Explain-Back: review rounds are no longer recorded.
--
-- Marking a gap "understood" used to write a `flag_reviews` row, which made the
-- mark permanent: a gap tapped once stayed cleared forever, so the count on the
-- review screen stopped describing what the learner could actually explain. A
-- round is now rebuilt from the recorded gaps every visit and nothing about it
-- is stored, so the table has no remaining purpose.
--
-- `if exists` keeps this safe in both directions: projects that applied the
-- Phase 4 migration drop the table, and fresh projects never create it.

begin;

drop table if exists public.flag_reviews;

notify pgrst, 'reload schema';

commit;
