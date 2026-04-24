-- =============================================================================
-- Parent Portal — Phase 1 migration
-- Adds: notes_internal/notes_parent_facing split, parents table, parent_student_links, parent_invitations, RLS.
-- Safe to run multiple times.
-- =============================================================================

-- 1. Rename sessions.notes -> sessions.notes_internal (only if not already renamed).
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

alter table public.sessions
  add column if not exists notes_parent_facing text;

alter table public.sessions
  add column if not exists parent_notified_at timestamptz;

-- 2. parents
create table if not exists public.parents (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  name text,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists parents_auth_user_id_idx on public.parents(auth_user_id);

-- 3. parent_student_links
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

-- 4. parent_invitations
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

-- 5. RLS
alter table public.parents enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.parent_invitations enable row level security;

-- parents: the authenticated user who owns the row can read and update it.
-- No client-side INSERT/DELETE (server uses service role).
drop policy if exists "parents_select_own" on public.parents;
create policy "parents_select_own" on public.parents
  for select using (auth.uid() = auth_user_id);

drop policy if exists "parents_update_own" on public.parents;
create policy "parents_update_own" on public.parents
  for update using (auth.uid() = auth_user_id);

-- parent_student_links: parents can read their own links; tutors can CRUD their own links.
drop policy if exists "psl_select_as_parent" on public.parent_student_links;
create policy "psl_select_as_parent" on public.parent_student_links
  for select using (
    exists (
      select 1 from public.parents p
      where p.id = parent_student_links.parent_id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "psl_select_as_tutor" on public.parent_student_links;
create policy "psl_select_as_tutor" on public.parent_student_links
  for select using (tutor_user_id = auth.uid());

drop policy if exists "psl_insert_as_tutor" on public.parent_student_links;
create policy "psl_insert_as_tutor" on public.parent_student_links
  for insert with check (tutor_user_id = auth.uid());

drop policy if exists "psl_update_as_tutor" on public.parent_student_links;
create policy "psl_update_as_tutor" on public.parent_student_links
  for update using (tutor_user_id = auth.uid());

-- parent_invitations: tutor-only; parents hit this server-side via token.
drop policy if exists "invitations_select_as_tutor" on public.parent_invitations;
create policy "invitations_select_as_tutor" on public.parent_invitations
  for select using (tutor_user_id = auth.uid());

drop policy if exists "invitations_insert_as_tutor" on public.parent_invitations;
create policy "invitations_insert_as_tutor" on public.parent_invitations
  for insert with check (tutor_user_id = auth.uid());

drop policy if exists "invitations_update_as_tutor" on public.parent_invitations;
create policy "invitations_update_as_tutor" on public.parent_invitations
  for update using (tutor_user_id = auth.uid());

drop policy if exists "invitations_delete_as_tutor" on public.parent_invitations;
create policy "invitations_delete_as_tutor" on public.parent_invitations
  for delete using (tutor_user_id = auth.uid());
