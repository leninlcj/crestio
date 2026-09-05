-- Agency pivot, chunk 3: enquiry follow-up bookkeeping.
-- Apply manually via Supabase SQL Editor. Every statement is idempotent.
--
-- The daily cron /api/cron/enquiry-followups emails a family twice at most
-- when an enquiry goes quiet (day 3 and day 10) and nudges the owner when a
-- new enquiry has waited more than 24 hours. These columns record what was
-- sent so nothing is sent twice.

begin;

alter table public.enquiries
  add column if not exists followup_1_sent_at timestamptz null,
  add column if not exists followup_2_sent_at timestamptz null,
  add column if not exists owner_nudged_at   timestamptz null;

create index if not exists enquiries_followup_idx
  on public.enquiries(status, created_at)
  where household_id is null;

commit;
