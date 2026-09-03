-- Agency pivot, chunk 1 — enquiries, tutor applications, tutor vetting columns.
-- Apply manually via Supabase SQL Editor (or `supabase db push` once the CLI is linked).
--
-- Purpose: crestio.ai becomes the Crestio Tutoring agency website. Two public
-- forms write here through the service role only (no INSERT policies): a
-- family enquiry and a tutor application. The org owner reads and updates
-- them from /app/leads. Converting an enquiry creates a household + student
-- through the existing tables; accepting an application creates a
-- tutor_invitations row through the existing flow.
--
-- Every statement is idempotent. Safe to re-run.

begin;

-- 1) enquiries -------------------------------------------------------------
create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new','contacted','trial_booked','matched','lost','spam')),
  who text not null default 'my_child'
    check (who in ('my_child','me','someone_else')),
  parent_name text not null,
  email text not null,
  phone text null,
  student_first_name text null,
  year_level text not null,
  subjects text[] not null default '{}',
  mode text not null default 'either'
    check (mode in ('online','in_home','either')),
  suburb text null,
  need text null,
  message text null,
  source text null,
  page_path text null,
  ip_hash text null,
  owner_notes text null,
  assigned_tutor_id uuid null references public.tutors(id) on delete set null,
  household_id uuid null references public.households(id) on delete set null,
  student_id uuid null references public.students(id) on delete set null,
  contacted_at timestamptz null,
  converted_at timestamptz null
);

create index if not exists enquiries_org_status_idx
  on public.enquiries(organization_id, status, created_at desc);
create index if not exists enquiries_email_idx
  on public.enquiries(lower(email));

drop trigger if exists enquiries_set_updated_at on public.enquiries;
create trigger enquiries_set_updated_at
  before update on public.enquiries
  for each row execute function public.set_updated_at();

alter table public.enquiries enable row level security;

drop policy if exists enquiries_select_owner on public.enquiries;
create policy enquiries_select_owner on public.enquiries
  for select to authenticated
  using (public.is_org_owner(organization_id));

drop policy if exists enquiries_update_owner on public.enquiries;
create policy enquiries_update_owner on public.enquiries
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

-- No insert/delete policies on purpose: the public form inserts via the
-- service role; deletion is a status change ('spam' / 'lost').

-- 2) tutor_applications ----------------------------------------------------
create table if not exists public.tutor_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new','screening','interview','test','offer','accepted','rejected','withdrawn')),
  full_name text not null,
  email text not null,
  phone text not null,
  suburb text not null,
  subjects text[] not null default '{}',
  qualifications text not null,
  wwcc_status text not null default 'not_yet'
    check (wwcc_status in ('current','applying','not_yet')),
  wwcc_number text null,
  abn text null,
  mode text not null default 'both'
    check (mode in ('online','in_home','both')),
  availability text null,
  has_transport boolean null,
  experience text null,
  cv_url text null,
  message text null,
  source text null,
  page_path text null,
  ip_hash text null,
  owner_notes text null,
  interview_at timestamptz null,
  decided_at timestamptz null,
  tutor_invitation_id uuid null references public.tutor_invitations(id) on delete set null,
  tutor_id uuid null references public.tutors(id) on delete set null
);

create index if not exists tutor_applications_org_status_idx
  on public.tutor_applications(organization_id, status, created_at desc);
create index if not exists tutor_applications_email_idx
  on public.tutor_applications(lower(email));

drop trigger if exists tutor_applications_set_updated_at on public.tutor_applications;
create trigger tutor_applications_set_updated_at
  before update on public.tutor_applications
  for each row execute function public.set_updated_at();

alter table public.tutor_applications enable row level security;

drop policy if exists tutor_applications_select_owner on public.tutor_applications;
create policy tutor_applications_select_owner on public.tutor_applications
  for select to authenticated
  using (public.is_org_owner(organization_id));

drop policy if exists tutor_applications_update_owner on public.tutor_applications;
create policy tutor_applications_update_owner on public.tutor_applications
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

-- 3) tutors — vetting and matching columns --------------------------------
alter table public.tutors add column if not exists wwcc_number text null;
alter table public.tutors add column if not exists wwcc_expiry date null;
alter table public.tutors add column if not exists wwcc_verified_at timestamptz null;
alter table public.tutors add column if not exists wwcc_verified_by uuid null references auth.users(id) on delete set null;
alter table public.tutors add column if not exists abn text null;
alter table public.tutors add column if not exists suburb text null;
alter table public.tutors add column if not exists mode text null;
alter table public.tutors add column if not exists levels text[] not null default '{}';
alter table public.tutors add column if not exists bio text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tutors_mode_check'
  ) then
    alter table public.tutors
      add constraint tutors_mode_check check (mode is null or mode in ('online','in_home','both'));
  end if;
end $$;

commit;
