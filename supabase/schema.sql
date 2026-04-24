-- =============================================================================
-- Crestio — Supabase schema
-- Run this in the Supabase SQL editor. It is idempotent (safe to re-run).
-- =============================================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- =============================================================================
-- profiles — one row per authenticated user; holds business info
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  owner_name text,
  email text,
  phone text,
  default_rate_cents integer default 8000, -- $80/hour by default
  currency text default 'AUD',
  onboarded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================================
-- students
-- =============================================================================
create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  year_level text,
  school text,
  subjects text[] default '{}',
  parent_name text,
  parent_email text,
  parent_phone text,
  hourly_rate_cents integer,
  notes text,
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists students_owner_idx on public.students(owner_id);
create index if not exists students_archived_idx on public.students(archived);

-- =============================================================================
-- tutors — employees working for the business owner
-- =============================================================================
create table if not exists public.tutors (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  subjects text[] default '{}',
  pay_rate_cents integer,
  notes text,
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tutors_owner_idx on public.tutors(owner_id);

-- =============================================================================
-- sessions — each tutoring session
-- =============================================================================
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  tutor_id uuid references public.tutors(id) on delete set null,
  subject text,
  topic text,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60,
  charge_rate_cents integer, -- rate charged to parent for this session
  pay_rate_cents integer,    -- rate paid to tutor (null if owner tutored)
  status text not null default 'scheduled', -- scheduled | completed | cancelled | no_show
  homework text,
  notes text,
  invoice_id uuid,
  paid boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists sessions_owner_idx on public.sessions(owner_id);
create index if not exists sessions_student_idx on public.sessions(student_id);
create index if not exists sessions_tutor_idx on public.sessions(tutor_id);
create index if not exists sessions_scheduled_idx on public.sessions(scheduled_at);
create index if not exists sessions_status_idx on public.sessions(status);
create index if not exists sessions_invoice_idx on public.sessions(invoice_id);

-- =============================================================================
-- invoices
-- =============================================================================
create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  number text not null, -- human-friendly invoice number e.g. INV-0001
  issued_on date not null default current_date,
  due_on date,
  subtotal_cents integer not null default 0,
  total_cents integer not null default 0,
  status text not null default 'draft', -- draft | sent | paid | overdue | void
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists invoices_owner_idx on public.invoices(owner_id);
create index if not exists invoices_student_idx on public.invoices(student_id);
create index if not exists invoices_status_idx on public.invoices(status);

-- link sessions → invoices
alter table public.sessions
  drop constraint if exists sessions_invoice_id_fkey;
alter table public.sessions
  add constraint sessions_invoice_id_fkey
  foreign key (invoice_id) references public.invoices(id) on delete set null;

-- =============================================================================
-- lesson_plans — AI-generated or manually written
-- =============================================================================
create table if not exists public.lesson_plans (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  subject text not null,
  topic text not null,
  year_level text,
  duration_minutes integer default 60,
  content text not null, -- markdown-formatted plan
  generated_by_ai boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lesson_plans_owner_idx on public.lesson_plans(owner_id);
create index if not exists lesson_plans_student_idx on public.lesson_plans(student_id);

-- =============================================================================
-- notes_polish_log — one row per successful AI-polish call, for rate limiting
-- =============================================================================
create table if not exists public.notes_polish_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notes_polish_log_user_idx on public.notes_polish_log(user_id);
create index if not exists notes_polish_log_created_idx on public.notes_polish_log(created_at);

-- Internal flag: set true when a tutor accepts the AI-polished version
alter table public.sessions
  add column if not exists notes_polished_by_ai boolean not null default false;

-- =============================================================================
-- Parent portal — notes split, parent identity, parent-student links, invitations
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions' and column_name = 'notes'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions' and column_name = 'notes_internal'
  ) then
    alter table public.sessions rename column notes to notes_internal;
  end if;
end$$;

alter table public.sessions add column if not exists notes_parent_facing text;
alter table public.sessions add column if not exists parent_notified_at timestamptz;

create table if not exists public.parents (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  name text,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists parents_auth_user_id_idx on public.parents(auth_user_id);

create table if not exists public.parent_student_links (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  tutor_user_id uuid not null references auth.users(id) on delete cascade,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);
create index if not exists psl_parent_idx on public.parent_student_links(parent_id);
create index if not exists psl_student_idx on public.parent_student_links(student_id);
create index if not exists psl_tutor_idx on public.parent_student_links(tutor_user_id);

create table if not exists public.parent_invitations (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique,
  email text not null,
  student_id uuid not null references public.students(id) on delete cascade,
  tutor_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index if not exists invitations_token_idx on public.parent_invitations(token);
create index if not exists invitations_tutor_idx on public.parent_invitations(tutor_user_id);
create index if not exists invitations_student_idx on public.parent_invitations(student_id);

-- =============================================================================
-- Owner/tutor split — organizations
-- Every tutor-owned row carries an organization_id. Session 2 will add
-- organization_members for role-based access; for now owner_user_id on
-- organizations is the single authoritative owner.
-- =============================================================================

create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists organizations_owner_user_id_idx on public.organizations(owner_user_id);

-- Add organization_id to every tutor-owned table (nullable until backfill below).
alter table public.profiles             add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.students             add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.tutors               add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.sessions             add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.invoices             add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.lesson_plans         add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.notes_polish_log     add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.parent_invitations   add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.parent_student_links add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- One organization per existing tutor. Name preference:
--   business_name → owner_name → email local-part. Suffixed with " Tutoring".
insert into public.organizations (id, name, owner_user_id, created_at)
select
  uuid_generate_v4(),
  coalesce(
    nullif(trim(p.business_name), ''),
    coalesce(nullif(trim(p.owner_name), ''), split_part(coalesce(au.email, 'Tutor'), '@', 1)) || ' Tutoring'
  ),
  p.id,
  coalesce(p.created_at, now())
from public.profiles p
left join auth.users au on au.id = p.id
where not exists (select 1 from public.organizations o where o.owner_user_id = p.id);

-- Backfill organization_id on every tutor-owned row by joining the owning user.
update public.profiles             set organization_id = o.id from public.organizations o where profiles.id                         = o.owner_user_id and profiles.organization_id             is null;
update public.students             set organization_id = o.id from public.organizations o where students.owner_id                   = o.owner_user_id and students.organization_id             is null;
update public.tutors               set organization_id = o.id from public.organizations o where tutors.owner_id                     = o.owner_user_id and tutors.organization_id               is null;
update public.sessions             set organization_id = o.id from public.organizations o where sessions.owner_id                   = o.owner_user_id and sessions.organization_id             is null;
update public.invoices             set organization_id = o.id from public.organizations o where invoices.owner_id                   = o.owner_user_id and invoices.organization_id             is null;
update public.lesson_plans         set organization_id = o.id from public.organizations o where lesson_plans.owner_id               = o.owner_user_id and lesson_plans.organization_id         is null;
update public.notes_polish_log     set organization_id = o.id from public.organizations o where notes_polish_log.user_id            = o.owner_user_id and notes_polish_log.organization_id     is null;
update public.parent_invitations   set organization_id = o.id from public.organizations o where parent_invitations.tutor_user_id   = o.owner_user_id and parent_invitations.organization_id   is null;
update public.parent_student_links set organization_id = o.id from public.organizations o where parent_student_links.tutor_user_id = o.owner_user_id and parent_student_links.organization_id is null;

-- After backfill, enforce NOT NULL. Each table gated on having no remaining
-- nulls so a partially-populated DB won't fail the whole schema run.
do $$
begin
  if not exists (select 1 from public.students             where organization_id is null) then alter table public.students             alter column organization_id set not null; end if;
  if not exists (select 1 from public.tutors               where organization_id is null) then alter table public.tutors               alter column organization_id set not null; end if;
  if not exists (select 1 from public.sessions             where organization_id is null) then alter table public.sessions             alter column organization_id set not null; end if;
  if not exists (select 1 from public.invoices             where organization_id is null) then alter table public.invoices             alter column organization_id set not null; end if;
  if not exists (select 1 from public.lesson_plans         where organization_id is null) then alter table public.lesson_plans         alter column organization_id set not null; end if;
  if not exists (select 1 from public.notes_polish_log     where organization_id is null) then alter table public.notes_polish_log     alter column organization_id set not null; end if;
  if not exists (select 1 from public.parent_invitations   where organization_id is null) then alter table public.parent_invitations   alter column organization_id set not null; end if;
  if not exists (select 1 from public.parent_student_links where organization_id is null) then alter table public.parent_student_links alter column organization_id set not null; end if;
  if not exists (select 1 from public.profiles             where organization_id is null) then alter table public.profiles             alter column organization_id set not null; end if;
end$$;

create index if not exists profiles_organization_id_idx             on public.profiles(organization_id);
create index if not exists students_organization_id_idx             on public.students(organization_id);
create index if not exists tutors_organization_id_idx               on public.tutors(organization_id);
create index if not exists sessions_organization_id_idx             on public.sessions(organization_id);
create index if not exists invoices_organization_id_idx             on public.invoices(organization_id);
create index if not exists lesson_plans_organization_id_idx         on public.lesson_plans(organization_id);
create index if not exists notes_polish_log_organization_id_idx     on public.notes_polish_log(organization_id);
create index if not exists parent_invitations_organization_id_idx   on public.parent_invitations(organization_id);
create index if not exists parent_student_links_organization_id_idx on public.parent_student_links(organization_id);

-- =============================================================================
-- Owner/tutor split — organization_members + role helpers
-- Membership rows drive role-based access (future session). Current tenant RLS
-- still relies on owner_id / organization_id; the helpers below exist so
-- future policies can swap to is_org_member(org_id) / is_org_owner(org_id)
-- without changing call sites. Not referenced anywhere in RLS today.
-- =============================================================================

create table if not exists public.organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','tutor')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_organization_id_idx on public.organization_members(organization_id);
create index if not exists organization_members_user_id_idx         on public.organization_members(user_id);

-- One 'owner' membership per existing organization (idempotent).
insert into public.organization_members (organization_id, user_id, role)
select o.id, o.owner_user_id, 'owner'
from public.organizations o
on conflict (organization_id, user_id) do nothing;

-- Role helpers. SECURITY DEFINER so they can read organization_members past
-- any future RLS tightening. STABLE because the answer doesn't change within
-- a statement. search_path pinned to public to avoid resolution surprises.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid)  to authenticated;

-- =============================================================================
-- Owner/tutor split — tutor identity (Session 3)
-- Links tutor records to auth users, lets students pin a primary tutor, and
-- captures which tutor user actually delivered a session. All new columns
-- stay nullable on purpose (unlinked tutor records, owner-only students,
-- pre-existing sessions are backfilled to the org owner).
-- =============================================================================

alter table public.tutors   add column if not exists auth_user_id     uuid references auth.users(id)    on delete set null;
alter table public.students add column if not exists primary_tutor_id uuid references public.tutors(id) on delete set null;
alter table public.sessions add column if not exists tutor_user_id    uuid references auth.users(id)    on delete set null;

-- A given auth user can be linked to at most one tutor record per organization.
create unique index if not exists tutors_auth_user_per_org_uidx
  on public.tutors (organization_id, auth_user_id)
  where auth_user_id is not null;

create index if not exists tutors_auth_user_idx        on public.tutors(auth_user_id);
create index if not exists students_primary_tutor_idx  on public.students(primary_tutor_id);
create index if not exists sessions_tutor_user_idx     on public.sessions(tutor_user_id);

-- Backfill: every existing session is attributed to the org's owner.
-- Idempotent: the IS NULL guard makes re-runs no-op.
update public.sessions s
set tutor_user_id = o.owner_user_id
from public.organizations o
where s.organization_id = o.id and s.tutor_user_id is null;

-- =============================================================================
-- updated_at trigger function
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

drop trigger if exists tutors_set_updated_at on public.tutors;
create trigger tutors_set_updated_at
  before update on public.tutors
  for each row execute function public.set_updated_at();

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists lesson_plans_set_updated_at on public.lesson_plans;
create trigger lesson_plans_set_updated_at
  before update on public.lesson_plans
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Auto-create profile + organization + owner membership on new auth user
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_org_id uuid;
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.organizations (name, owner_user_id)
  values (split_part(coalesce(new.email, 'Tutor'), '@', 1) || ' Tutoring', new.id)
  on conflict (owner_user_id) do nothing
  returning id into new_org_id;

  if new_org_id is null then
    select id into new_org_id from public.organizations where owner_user_id = new.id;
  end if;

  update public.profiles set organization_id = new_org_id where id = new.id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner')
  on conflict (organization_id, user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security — membership-gated tenant access (post-Session 4)
-- Tenant tables (students/tutors/sessions/invoices/lesson_plans,
-- notes_polish_log, parent_invitations, parent_student_links) are gated by
-- public.is_org_member(organization_id). profiles and parents use direct
-- auth.uid() checks. Parents reach their own links via psl_select_as_parent.
-- =============================================================================
alter table public.profiles             enable row level security;
alter table public.students             enable row level security;
alter table public.tutors               enable row level security;
alter table public.sessions             enable row level security;
alter table public.invoices             enable row level security;
alter table public.lesson_plans         enable row level security;
alter table public.notes_polish_log     enable row level security;
alter table public.parents              enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.parent_invitations   enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;

-- profiles: self only
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- organizations: owner has full CRUD; any member can read.
drop policy if exists "organizations_select_as_owner" on public.organizations;
create policy "organizations_select_as_owner" on public.organizations
  for select using (auth.uid() = owner_user_id);

drop policy if exists "organizations_select_as_member" on public.organizations;
create policy "organizations_select_as_member" on public.organizations
  for select using (public.is_org_member(id));

drop policy if exists "organizations_insert_as_owner" on public.organizations;
create policy "organizations_insert_as_owner" on public.organizations
  for insert with check (auth.uid() = owner_user_id);

drop policy if exists "organizations_update_as_owner" on public.organizations;
create policy "organizations_update_as_owner" on public.organizations
  for update using (auth.uid() = owner_user_id);

drop policy if exists "organizations_delete_as_owner" on public.organizations;
create policy "organizations_delete_as_owner" on public.organizations
  for delete using (auth.uid() = owner_user_id);

-- organization_members: users read their own rows; writes go through the signup
-- trigger or the service role.
drop policy if exists "organization_members_select_self" on public.organization_members;
create policy "organization_members_select_self" on public.organization_members
  for select using (auth.uid() = user_id);

-- parents: self read / update.
drop policy if exists "parents_select_own" on public.parents;
create policy "parents_select_own" on public.parents
  for select using (auth.uid() = auth_user_id);

drop policy if exists "parents_update_own" on public.parents;
create policy "parents_update_own" on public.parents
  for update using (auth.uid() = auth_user_id);

-- Tenant tables: membership-gated CRUD via is_org_member(organization_id).
do $$
declare t text;
begin
  for t in select unnest(array['students','tutors','sessions','invoices','lesson_plans']) loop
    execute format('drop policy if exists "%1$s_select_via_membership" on public.%1$s', t);
    execute format('create policy "%1$s_select_via_membership" on public.%1$s for select using (public.is_org_member(organization_id))', t);

    execute format('drop policy if exists "%1$s_insert_via_membership" on public.%1$s', t);
    execute format('create policy "%1$s_insert_via_membership" on public.%1$s for insert with check (public.is_org_member(organization_id))', t);

    execute format('drop policy if exists "%1$s_update_via_membership" on public.%1$s', t);
    execute format('create policy "%1$s_update_via_membership" on public.%1$s for update using (public.is_org_member(organization_id))', t);

    execute format('drop policy if exists "%1$s_delete_via_membership" on public.%1$s', t);
    execute format('create policy "%1$s_delete_via_membership" on public.%1$s for delete using (public.is_org_member(organization_id))', t);
  end loop;
end$$;

-- notes_polish_log: membership-gated select + insert (log rows aren't updated or deleted).
drop policy if exists "notes_polish_log_select_via_membership" on public.notes_polish_log;
create policy "notes_polish_log_select_via_membership" on public.notes_polish_log
  for select using (public.is_org_member(organization_id));

drop policy if exists "notes_polish_log_insert_via_membership" on public.notes_polish_log;
create policy "notes_polish_log_insert_via_membership" on public.notes_polish_log
  for insert with check (public.is_org_member(organization_id));

-- parent_invitations: membership-gated CRUD.
drop policy if exists "parent_invitations_select_via_membership" on public.parent_invitations;
create policy "parent_invitations_select_via_membership" on public.parent_invitations
  for select using (public.is_org_member(organization_id));

drop policy if exists "parent_invitations_insert_via_membership" on public.parent_invitations;
create policy "parent_invitations_insert_via_membership" on public.parent_invitations
  for insert with check (public.is_org_member(organization_id));

drop policy if exists "parent_invitations_update_via_membership" on public.parent_invitations;
create policy "parent_invitations_update_via_membership" on public.parent_invitations
  for update using (public.is_org_member(organization_id));

drop policy if exists "parent_invitations_delete_via_membership" on public.parent_invitations;
create policy "parent_invitations_delete_via_membership" on public.parent_invitations
  for delete using (public.is_org_member(organization_id));

-- parent_student_links: parents read their own links; org members SELECT/INSERT/UPDATE
-- (no DELETE — revoke is done via UPDATE revoked_at).
drop policy if exists "psl_select_as_parent" on public.parent_student_links;
create policy "psl_select_as_parent" on public.parent_student_links
  for select using (
    exists (
      select 1 from public.parents p
      where p.id = parent_student_links.parent_id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "psl_select_via_membership" on public.parent_student_links;
create policy "psl_select_via_membership" on public.parent_student_links
  for select using (public.is_org_member(organization_id));

drop policy if exists "psl_insert_via_membership" on public.parent_student_links;
create policy "psl_insert_via_membership" on public.parent_student_links
  for insert with check (public.is_org_member(organization_id));

drop policy if exists "psl_update_via_membership" on public.parent_student_links;
create policy "psl_update_via_membership" on public.parent_student_links
  for update using (public.is_org_member(organization_id));

-- =============================================================================
-- Session 5: tutor invitations
-- =============================================================================
create table if not exists public.tutor_invitations (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token text not null unique,
  role text not null default 'tutor' check (role in ('tutor')),
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);
create index if not exists tutor_invitations_org_idx on public.tutor_invitations(organization_id);
create index if not exists tutor_invitations_email_idx on public.tutor_invitations(email);
alter table public.tutor_invitations enable row level security;

drop policy if exists "tutor_invitations_select_via_membership" on public.tutor_invitations;
create policy "tutor_invitations_select_via_membership" on public.tutor_invitations
  for select using (public.is_org_member(organization_id));

drop policy if exists "tutor_invitations_insert_as_owner" on public.tutor_invitations;
create policy "tutor_invitations_insert_as_owner" on public.tutor_invitations
  for insert with check (public.is_org_owner(organization_id));

drop policy if exists "tutor_invitations_update_as_owner" on public.tutor_invitations;
create policy "tutor_invitations_update_as_owner" on public.tutor_invitations
  for update using (public.is_org_owner(organization_id));

-- NOTE: the production handle_new_user also handles tutor invitations via
-- raw_user_meta_data.tutor_invitation_token. That branch is NOT captured in
-- the definition above — see the Known issues section of README.md.

-- =============================================================================
-- Session 9: assistant conversations + messages
-- =============================================================================
create table if not exists public.assistant_conversations (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'General',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool_use', 'tool_result')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_conversations_user_idx on public.assistant_conversations(user_id, last_message_at desc);
create index if not exists assistant_conversations_org_idx on public.assistant_conversations(organization_id);
create index if not exists assistant_messages_conversation_idx on public.assistant_messages(conversation_id, created_at asc);
create index if not exists assistant_messages_user_idx on public.assistant_messages(user_id);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages      enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['assistant_conversations','assistant_messages']) loop
    execute format('drop policy if exists %1$s_select_via_membership on public.%1$s', t);
    execute format('create policy %1$s_select_via_membership on public.%1$s for select using (public.is_org_member(organization_id) and user_id = auth.uid())', t);

    execute format('drop policy if exists %1$s_insert_via_membership on public.%1$s', t);
    execute format('create policy %1$s_insert_via_membership on public.%1$s for insert with check (public.is_org_member(organization_id) and user_id = auth.uid())', t);

    execute format('drop policy if exists %1$s_update_via_membership on public.%1$s', t);
    execute format('create policy %1$s_update_via_membership on public.%1$s for update using (public.is_org_member(organization_id) and user_id = auth.uid())', t);

    execute format('drop policy if exists %1$s_delete_via_membership on public.%1$s', t);
    execute format('create policy %1$s_delete_via_membership on public.%1$s for delete using (public.is_org_member(organization_id) and user_id = auth.uid())', t);
  end loop;
end $$;

create or replace function public.bump_conversation_timestamps()
returns trigger as $$
begin
  update public.assistant_conversations
    set updated_at = now(), last_message_at = now()
    where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists assistant_messages_bump_parent on public.assistant_messages;
create trigger assistant_messages_bump_parent
  after insert on public.assistant_messages
  for each row execute function public.bump_conversation_timestamps();

-- =============================================================================
-- Session 10: Stripe subscription state + billing_events audit log
-- =============================================================================
alter table public.organizations
  add column if not exists stripe_customer_id text unique;

alter table public.organizations
  add column if not exists stripe_subscription_id text unique;

alter table public.organizations
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in (
      'trialing','active','past_due','canceled',
      'incomplete','incomplete_expired','unpaid','paused'
    ));

alter table public.organizations
  add column if not exists trial_ends_at timestamptz default (now() + interval '7 days');

alter table public.organizations
  add column if not exists current_period_end timestamptz;

alter table public.organizations
  add column if not exists subscription_updated_at timestamptz;

create index if not exists organizations_subscription_status_idx on public.organizations(subscription_status);
create index if not exists organizations_stripe_customer_idx on public.organizations(stripe_customer_id);

create table if not exists public.billing_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete set null,
  stripe_event_id text unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);
create index if not exists billing_events_org_idx on public.billing_events(organization_id);
create index if not exists billing_events_type_idx on public.billing_events(event_type);

alter table public.billing_events enable row level security;
drop policy if exists billing_events_select_as_owner on public.billing_events;
create policy billing_events_select_as_owner on public.billing_events
  for select using (public.is_org_owner(organization_id));

-- =============================================================================
-- Session 10.5: billing-aware RLS (db-level paywall) + cancel_at_period_end
-- =============================================================================
alter table public.organizations
  add column if not exists cancel_at_period_end boolean default false;

create or replace function public.org_billing_ok(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select
       case
         when subscription_status = 'active' then true
         when subscription_status = 'trialing' and trial_ends_at > now() then true
         else false
       end
     from public.organizations where id = org_id),
    false
  );
$$;

grant execute on function public.org_billing_ok(uuid) to authenticated;

-- Tighten INSERT policies on the four tables that accumulate paid data.
drop policy if exists "students_insert_via_membership" on public.students;
create policy "students_insert_via_membership" on public.students
  for insert with check (public.is_org_member(organization_id) and public.org_billing_ok(organization_id));

drop policy if exists "sessions_insert_via_membership" on public.sessions;
create policy "sessions_insert_via_membership" on public.sessions
  for insert with check (public.is_org_member(organization_id) and public.org_billing_ok(organization_id));

drop policy if exists "invoices_insert_via_membership" on public.invoices;
create policy "invoices_insert_via_membership" on public.invoices
  for insert with check (public.is_org_member(organization_id) and public.org_billing_ok(organization_id));

drop policy if exists "lesson_plans_insert_via_membership" on public.lesson_plans;
create policy "lesson_plans_insert_via_membership" on public.lesson_plans
  for insert with check (public.is_org_member(organization_id) and public.org_billing_ok(organization_id));

-- SELECT/UPDATE/DELETE policies on these four tables are unchanged — reads,
-- edits, and deletes of existing data stay open when billing lapses. Only
-- INSERT of new rows is gated.
