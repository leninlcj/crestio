-- Agency pivot, chunk 2 — tutor vetting and agreements, late cancellations, incidents.
-- Apply manually via Supabase SQL Editor (or `supabase db push` once the CLI is linked).
-- Every statement is idempotent. Safe to re-run.

begin;

-- 1) tutors — vetting records and signed agreements ------------------------
alter table public.tutors add column if not exists id_checked_at timestamptz null;
alter table public.tutors add column if not exists conduct_accepted_at timestamptz null;
alter table public.tutors add column if not exists agreement_accepted_at timestamptz null;
alter table public.tutors add column if not exists agreement_version text null;
alter table public.tutors add column if not exists insurance_expiry date null;
alter table public.tutors add column if not exists training_completed_at timestamptz null;
alter table public.tutors add column if not exists references_checked_at timestamptz null;

-- Tutors may read and update their own agreement acceptance (matched by
-- auth_user_id). Owners already have full access through existing policies.
drop policy if exists tutors_self_select on public.tutors;
create policy tutors_self_select on public.tutors
  for select to authenticated
  using (auth_user_id = auth.uid());

-- 2) sessions — late cancellations are chargeable unless waived -------------
alter table public.sessions add column if not exists late_cancellation boolean not null default false;
alter table public.sessions add column if not exists cancellation_waived boolean not null default false;
alter table public.sessions add column if not exists cancelled_at timestamptz null;
alter table public.sessions add column if not exists cancelled_by_user_id uuid null references auth.users(id) on delete set null;

-- Unbilled view: completed sessions, plus late cancellations that were not waived.
create or replace view public.unbilled_completed_sessions as
  select s.*
    from public.sessions s
   where (
           s.status = 'completed'
           or (s.status = 'cancelled' and s.late_cancellation = true and s.cancellation_waived = false)
         )
     and s.invoice_id is null
     and s.deleted_at is null
     and not exists (
       select 1 from public.invoice_sessions inv_s
        where inv_s.session_id = s.id
     );

grant select on public.unbilled_completed_sessions to authenticated;

-- 3) incidents — child-safe scheme record keeping ---------------------------
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reported_by_user_id uuid null references auth.users(id) on delete set null,
  reported_by_role text not null default 'owner'
    check (reported_by_role in ('owner','tutor','parent','student','public')),
  reporter_name text null,
  reporter_email text null,
  student_id uuid null references public.students(id) on delete set null,
  tutor_id uuid null references public.tutors(id) on delete set null,
  session_id uuid null references public.sessions(id) on delete set null,
  occurred_at timestamptz null,
  category text not null default 'other'
    check (category in ('safety','conduct','complaint','injury','property','other')),
  description text not null,
  status text not null default 'open'
    check (status in ('open','reviewing','closed')),
  outcome text null,
  closed_at timestamptz null
);

create index if not exists incidents_org_status_idx
  on public.incidents(organization_id, status, created_at desc);

drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function public.set_updated_at();

alter table public.incidents enable row level security;

drop policy if exists incidents_select_owner on public.incidents;
create policy incidents_select_owner on public.incidents
  for select to authenticated
  using (public.is_org_owner(organization_id));

drop policy if exists incidents_update_owner on public.incidents;
create policy incidents_update_owner on public.incidents
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

drop policy if exists incidents_insert_member on public.incidents;
create policy incidents_insert_member on public.incidents
  for insert to authenticated
  with check (public.is_org_member(organization_id));

-- Public (family) reports arrive through the service role; no anon policy.

commit;
