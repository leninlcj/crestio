-- Phase 6 — additive migration. No breaking changes.
-- Apply manually via Supabase SQL Editor (no CLI).
--
-- Tables:
--   referral_codes        — one code per organization, generated lazily
--   referral_signups      — referral_code → signed-up org (later → paying)
--   session_polish_edits  — pre/post diffs for AI calibration (collected, not exposed yet)
--   parent_satisfaction   — thumb up/down per polished session note
--   term_reports          — generated PDF per (org, student, term)
--
-- Column extensions:
--   parents.{first_login_seen_at, stripe_default_payment_method_id, autopay_enabled}
--   profiles.{tour_completed_at, last_seen_changelog_at, power_user_mode}
--   organizations.{about, brand_color, session_buffer_minutes}
--
-- All RLS: scoped to org membership unless noted.

-- 1) Referral codes (one row per organization)
create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  used_count integer not null default 0,
  last_used_at timestamptz null,
  constraint referral_codes_code_format check (code = upper(code) and length(code) between 4 and 16)
);

create index if not exists referral_codes_org_idx on public.referral_codes(organization_id);
create index if not exists referral_codes_code_idx on public.referral_codes(code);

alter table public.referral_codes enable row level security;

drop policy if exists referral_codes_select_own_org on public.referral_codes;
create policy referral_codes_select_own_org on public.referral_codes
  for select using (
    organization_id in (
      select organization_id from public.memberships where user_id = auth.uid()
    )
  );

drop policy if exists referral_codes_insert_own_org on public.referral_codes;
create policy referral_codes_insert_own_org on public.referral_codes
  for insert with check (
    organization_id in (
      select organization_id from public.memberships where user_id = auth.uid() and role = 'owner'
    )
  );

-- 2) Referral signups (event log)
create table if not exists public.referral_signups (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  signed_up_org_id uuid not null references public.organizations(id) on delete cascade,
  signed_up_at timestamptz not null default now(),
  became_paying_at timestamptz null
);

create index if not exists referral_signups_code_idx on public.referral_signups(referral_code_id);
create index if not exists referral_signups_org_idx on public.referral_signups(signed_up_org_id);

alter table public.referral_signups enable row level security;

drop policy if exists referral_signups_select_referrer on public.referral_signups;
create policy referral_signups_select_referrer on public.referral_signups
  for select using (
    referral_code_id in (
      select id from public.referral_codes
      where organization_id in (
        select organization_id from public.memberships where user_id = auth.uid()
      )
    )
  );

-- 3) Session polish edits (collected for 14G personalization)
create table if not exists public.session_polish_edits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  tutor_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  raw_polish jsonb not null,
  edited_polish jsonb not null,
  edit_distance integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists session_polish_edits_session_idx on public.session_polish_edits(session_id);
create index if not exists session_polish_edits_tutor_idx on public.session_polish_edits(tutor_id);
create index if not exists session_polish_edits_org_idx on public.session_polish_edits(organization_id);

alter table public.session_polish_edits enable row level security;

drop policy if exists session_polish_edits_select_own_org on public.session_polish_edits;
create policy session_polish_edits_select_own_org on public.session_polish_edits
  for select using (
    organization_id in (
      select organization_id from public.memberships where user_id = auth.uid()
    )
  );

drop policy if exists session_polish_edits_insert_own on public.session_polish_edits;
create policy session_polish_edits_insert_own on public.session_polish_edits
  for insert with check (
    tutor_id = auth.uid()
    and organization_id in (
      select organization_id from public.memberships where user_id = auth.uid()
    )
  );

-- 4) Parent satisfaction (thumb up/down per polished note)
create table if not exists public.parent_satisfaction (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rating smallint not null,
  submitted_at timestamptz not null default now(),
  constraint parent_satisfaction_rating_range check (rating in (-1, 1)),
  constraint parent_satisfaction_unique unique (session_id, parent_id)
);

create index if not exists parent_satisfaction_session_idx on public.parent_satisfaction(session_id);
create index if not exists parent_satisfaction_org_idx on public.parent_satisfaction(organization_id);

alter table public.parent_satisfaction enable row level security;

drop policy if exists parent_satisfaction_select_own_org on public.parent_satisfaction;
create policy parent_satisfaction_select_own_org on public.parent_satisfaction
  for select using (
    organization_id in (
      select organization_id from public.memberships where user_id = auth.uid()
    )
    or parent_id in (
      select id from public.parents where auth_user_id = auth.uid()
    )
  );

drop policy if exists parent_satisfaction_insert_own on public.parent_satisfaction;
create policy parent_satisfaction_insert_own on public.parent_satisfaction
  for insert with check (
    parent_id in (select id from public.parents where auth_user_id = auth.uid())
  );

-- 5) Term reports (generated PDFs)
create table if not exists public.term_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  term_start date not null,
  term_end date not null,
  pdf_path text not null,
  generated_at timestamptz not null default now()
);

create index if not exists term_reports_student_idx on public.term_reports(student_id);
create index if not exists term_reports_org_idx on public.term_reports(organization_id);

alter table public.term_reports enable row level security;

drop policy if exists term_reports_select_own_org on public.term_reports;
create policy term_reports_select_own_org on public.term_reports
  for select using (
    organization_id in (
      select organization_id from public.memberships where user_id = auth.uid()
    )
    or student_id in (
      select s.id from public.students s
      join public.parents p on p.id = s.parent_id
      where p.auth_user_id = auth.uid()
    )
  );

drop policy if exists term_reports_insert_own_org on public.term_reports;
create policy term_reports_insert_own_org on public.term_reports
  for insert with check (
    organization_id in (
      select organization_id from public.memberships where user_id = auth.uid()
    )
  );

-- 6) Column extensions

alter table public.parents
  add column if not exists first_login_seen_at timestamptz null,
  add column if not exists stripe_default_payment_method_id text null,
  add column if not exists autopay_enabled boolean not null default false;

alter table public.profiles
  add column if not exists tour_completed_at timestamptz null,
  add column if not exists last_seen_changelog_at timestamptz null,
  add column if not exists power_user_mode boolean not null default false;

alter table public.organizations
  add column if not exists about text null,
  add column if not exists brand_color text null,
  add column if not exists session_buffer_minutes integer not null default 15;

-- Constraint: brand_color must be a hex value or null
alter table public.organizations
  drop constraint if exists organizations_brand_color_format;
alter table public.organizations
  add constraint organizations_brand_color_format
  check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');

-- Constraint: about no longer than 500 chars
alter table public.organizations
  drop constraint if exists organizations_about_length;
alter table public.organizations
  add constraint organizations_about_length
  check (about is null or length(about) <= 500);

-- Constraint: session_buffer_minutes 0-120
alter table public.organizations
  drop constraint if exists organizations_session_buffer_range;
alter table public.organizations
  add constraint organizations_session_buffer_range
  check (session_buffer_minutes between 0 and 120);
