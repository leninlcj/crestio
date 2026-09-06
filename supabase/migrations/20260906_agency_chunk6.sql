-- Agency chunk 6 (6 September 2026): call requests.
--
-- The site's primary action is now "Request a call": a family leaves a phone
-- number and a good time, and the founder calls back. Such an enquiry may
-- have no email, so email becomes nullable with a check that at least one
-- way to reach the family exists. The owner records call attempts, and the
-- app remembers when the "we tried to call you" note went out. Group-class
-- registrations name the class they are about.
--
-- Apply in the Supabase SQL editor (or `supabase db push`). Idempotent.
-- Tested against a local PostgreSQL 16 with scripts/dev/migration-harness.

begin;

alter table public.enquiries alter column email drop not null;

alter table public.enquiries add column if not exists preferred_contact text not null default 'email';
alter table public.enquiries drop constraint if exists enquiries_preferred_contact_check;
alter table public.enquiries add constraint enquiries_preferred_contact_check
  check (preferred_contact in ('email', 'call'));

alter table public.enquiries add column if not exists best_time text null;
alter table public.enquiries add column if not exists class_key text null;
alter table public.enquiries add column if not exists call_attempts integer not null default 0;
alter table public.enquiries add column if not exists last_call_attempt_at timestamptz null;
alter table public.enquiries add column if not exists unreachable_notice_sent_at timestamptz null;

-- A lead must be reachable one way or the other.
alter table public.enquiries drop constraint if exists enquiries_contact_present_check;
alter table public.enquiries add constraint enquiries_contact_present_check
  check (email is not null or phone is not null);

create index if not exists enquiries_phone_idx on public.enquiries(phone) where phone is not null;
create index if not exists enquiries_class_key_idx on public.enquiries(class_key) where class_key is not null;

commit;
