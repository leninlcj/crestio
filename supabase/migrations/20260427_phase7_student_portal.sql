-- Phase 7 commit 2 — student portal.  Additive only.
-- Apply manually via Supabase SQL Editor.
--
-- Tables:
--   student_users               — one row per student-portal account (auth.users link)
--   student_portal_access       — per-student enable/consent/invitation/disable state
--   student_homework_completion — student-marked homework checkboxes
--
-- Column extensions:
--   students.date_of_birth          — required for age-based consent gating
--   files.intended_student_id       — when set, file is only visible to that student
--
-- Helpers:
--   is_student_user(student_user_id) — RLS helper, returns true when caller's
--                                       auth.uid() matches the student_users row
--
-- All RLS strictly scopes students to their own data — they never see another
-- student's row, file, session, invoice, or anything money-adjacent.

begin;

-- ============================================================================
-- 1) Students get date_of_birth (required for student-portal age gating).
--    Existing rows without DOB simply can't have portal access enabled until
--    the tutor fills it in.
-- ============================================================================

alter table public.students
  add column if not exists date_of_birth date null;

-- ============================================================================
-- 2) Files get intended_student_id (nullable).  When set, file is visible
--    only to that student.  When null, file is org-wide and not student-
--    accessible.  Existing files default to null — no current file leaks.
-- ============================================================================

alter table public.files
  add column if not exists intended_student_id uuid null
    references public.students(id) on delete cascade;

create index if not exists files_intended_student_idx
  on public.files(intended_student_id)
  where intended_student_id is not null;

-- ============================================================================
-- 3) student_users — one row per student account
-- ============================================================================

create table if not exists public.student_users (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  date_of_birth date not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz null,
  disabled_at timestamptz null,
  disabled_reason text null,
  updated_at timestamptz not null default now(),
  unique (student_id)
);

create index if not exists su_email_idx on public.student_users(email);
create index if not exists su_auth_idx on public.student_users(auth_user_id);
create index if not exists su_student_idx on public.student_users(student_id);

alter table public.student_users enable row level security;

-- Helper: caller is a student account whose row matches the given student_user_id.
create or replace function public.is_student_user(p_student_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.student_users
    where id = p_student_user_id
      and auth_user_id = auth.uid()
      and disabled_at is null
  );
$$;

-- Helper: caller is a student, return their student_users.id (or null).
create or replace function public.current_student_user_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.student_users
  where auth_user_id = auth.uid()
    and disabled_at is null
  limit 1;
$$;

-- Helper: caller is a student, return their linked student_id (or null).
create or replace function public.current_student_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select student_id from public.student_users
  where auth_user_id = auth.uid()
    and disabled_at is null
  limit 1;
$$;

grant execute on function public.is_student_user(uuid) to authenticated;
grant execute on function public.current_student_user_id() to authenticated;
grant execute on function public.current_student_id() to authenticated;

-- Student reads/updates own row.  Tutor org reads.  Parent reads if linked.
drop policy if exists student_users_select_own_or_org on public.student_users;
create policy student_users_select_own_or_org on public.student_users
  for select using (
    auth_user_id = auth.uid()
    or exists (
      select 1 from public.students s
      where s.id = student_users.student_id
        and public.is_org_member(s.organization_id)
    )
    or exists (
      select 1 from public.parent_student_links psl
      join public.parents p on p.id = psl.parent_id
      where psl.student_id = student_users.student_id
        and psl.revoked_at is null
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists student_users_update_own on public.student_users;
create policy student_users_update_own on public.student_users
  for update using (auth_user_id = auth.uid());

-- Tutors and owners insert/disable.  Service role handles auth provisioning.
drop policy if exists student_users_insert_org on public.student_users;
create policy student_users_insert_org on public.student_users
  for insert with check (
    exists (
      select 1 from public.students s
      where s.id = student_users.student_id
        and public.is_org_member(s.organization_id)
    )
  );

-- ============================================================================
-- 4) student_portal_access — invitation + consent + enable state
-- ============================================================================

create table if not exists public.student_portal_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enabled boolean not null default false,
  parental_consent_required boolean not null default true,
  parental_consent_given_at timestamptz null,
  parental_consent_by_parent_id uuid null references public.parents(id) on delete set null,
  parental_consent_token text null unique,
  invitation_email text null,
  invitation_token text null unique,
  invitation_sent_at timestamptz null,
  invitation_expires_at timestamptz null,
  accepted_at timestamptz null,
  enabled_at timestamptz null,
  enabled_by uuid null references auth.users(id) on delete set null,
  disabled_at timestamptz null,
  disabled_reason text null,
  calendar_token text null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id)
);

create index if not exists spa_org_idx on public.student_portal_access(organization_id);
create index if not exists spa_student_idx on public.student_portal_access(student_id);
create index if not exists spa_invitation_token_idx on public.student_portal_access(invitation_token);
create index if not exists spa_consent_token_idx on public.student_portal_access(parental_consent_token);

alter table public.student_portal_access enable row level security;

-- Tutor org reads + writes.
drop policy if exists spa_select_org on public.student_portal_access;
create policy spa_select_org on public.student_portal_access
  for select using (
    public.is_org_member(organization_id)
    or exists (
      select 1 from public.parent_student_links psl
      join public.parents p on p.id = psl.parent_id
      where psl.student_id = student_portal_access.student_id
        and psl.revoked_at is null
        and p.auth_user_id = auth.uid()
    )
    or student_id = public.current_student_id()
  );

drop policy if exists spa_insert_org on public.student_portal_access;
create policy spa_insert_org on public.student_portal_access
  for insert with check (public.is_org_member(organization_id));

drop policy if exists spa_update_org on public.student_portal_access;
create policy spa_update_org on public.student_portal_access
  for update using (public.is_org_member(organization_id));

drop policy if exists spa_delete_org on public.student_portal_access;
create policy spa_delete_org on public.student_portal_access
  for delete using (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.organization_members
      where organization_id = student_portal_access.organization_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- ============================================================================
-- 5) student_homework_completion — student-marked checkboxes
-- ============================================================================

create table if not exists public.student_homework_completion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_user_id uuid not null references public.student_users(id) on delete cascade,
  homework_index integer not null default 0,
  completed_at timestamptz not null default now(),
  parent_visible boolean not null default true,
  unique (session_id, student_user_id, homework_index)
);

create index if not exists shc_session_idx on public.student_homework_completion(session_id);
create index if not exists shc_student_idx on public.student_homework_completion(student_user_id);
create index if not exists shc_org_idx on public.student_homework_completion(organization_id);

alter table public.student_homework_completion enable row level security;

-- Student inserts/deletes own rows.  Tutors + linked parents read.
drop policy if exists shc_insert_self on public.student_homework_completion;
create policy shc_insert_self on public.student_homework_completion
  for insert with check (public.is_student_user(student_user_id));

drop policy if exists shc_delete_self on public.student_homework_completion;
create policy shc_delete_self on public.student_homework_completion
  for delete using (public.is_student_user(student_user_id));

drop policy if exists shc_select_scoped on public.student_homework_completion;
create policy shc_select_scoped on public.student_homework_completion
  for select using (
    public.is_student_user(student_user_id)
    or public.is_org_member(organization_id)
    or exists (
      select 1 from public.student_users su
      join public.parent_student_links psl on psl.student_id = su.student_id
      join public.parents p on p.id = psl.parent_id
      where su.id = student_homework_completion.student_user_id
        and psl.revoked_at is null
        and p.auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6) Extend RLS so a student account can read its own scoped data.  Existing
--    policies remain — these are additive permit-rules.
-- ============================================================================

-- Sessions: a student can read sessions for their own student_id.
drop policy if exists sessions_select_self_student on public.sessions;
create policy sessions_select_self_student on public.sessions
  for select using (
    student_id = public.current_student_id()
    and deleted_at is null
  );

-- Students: a student can read their own student row (limited columns enforced
-- in queries — there's no view-restriction primitive in pg RLS, so we rely on
-- column allowlists in the API layer).
drop policy if exists students_select_self_student on public.students;
create policy students_select_self_student on public.students
  for select using (id = public.current_student_id());

-- Files: a student can read files where intended_student_id = their student_id.
drop policy if exists files_select_self_student on public.files;
create policy files_select_self_student on public.files
  for select using (
    intended_student_id = public.current_student_id()
    and deleted_at is null
    and archived_at is null
  );

-- Audit log inserts from a student.  Reads are still owner/self only.
drop policy if exists audit_log_insert_student on public.audit_log;
create policy audit_log_insert_student on public.audit_log
  for insert with check (
    actor_user_id = auth.uid()
    and exists (
      select 1 from public.student_users
      where auth_user_id = auth.uid()
        and id::text = (audit_log.payload->>'student_user_id')
    )
  );

commit;
