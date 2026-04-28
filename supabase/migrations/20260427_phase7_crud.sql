-- Phase 7 — frictionless CRUD foundation. Additive only. No breaking changes.
-- Apply manually via Supabase SQL Editor.
--
-- Adds:
--   * Soft-archive columns (archived_at, archived_by, archive_reason) on entities
--     that benefit from a hide-but-keep model (students, parents, tutors,
--     session_templates, files, lesson_plans).  households + message_threads
--     already have archived_at; we add archived_by + archive_reason for parity.
--   * Soft-delete columns (deleted_at, deleted_by) on entities that benefit
--     from a 30-day-restore-then-purge model (sessions, invoices, lesson_plans,
--     files (already has deleted_at — add deleted_by), messages (already has
--     deleted_at — add deleted_by)).
--   * audit_log table — every mutation goes here (action + payload).
--   * pinned_items table — per-user pins across entity types.
--   * tags column (text[]) on students, sessions, files, lesson_plans (used
--     by commit 3 but landed in this migration so we don't have to ship two).
--   * templates table (commit 3) — note/message/invoice line item snippets.
--
-- All RLS scoped to org membership unless otherwise noted.

begin;

-- ============================================================================
-- 1) Soft archive columns (hide-but-keep model — restorable forever via Trash)
-- ============================================================================

alter table public.students
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists snoozed_until timestamptz null;

create index if not exists students_archived_at_idx on public.students(archived_at);
create index if not exists students_tags_gin on public.students using gin(tags);

-- households already has archived_at — add the metadata columns for parity.
alter table public.households
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null;

alter table public.parents
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null;

create index if not exists parents_archived_at_idx on public.parents(archived_at);

alter table public.tutors
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null;

create index if not exists tutors_archived_at_idx on public.tutors(archived_at);

alter table public.session_templates
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null;

create index if not exists session_templates_archived_at_idx on public.session_templates(archived_at);

-- message_threads already has archived_at.
alter table public.message_threads
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null;

-- ============================================================================
-- 2) Soft delete columns (30-day-purge model — auto-purged via cron)
-- ============================================================================

alter table public.sessions
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists snoozed_until timestamptz null;

create index if not exists sessions_deleted_at_idx on public.sessions(deleted_at);
create index if not exists sessions_tags_gin on public.sessions using gin(tags);

alter table public.invoices
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null,
  add column if not exists void_reason text null,
  add column if not exists voided_by uuid null references auth.users(id) on delete set null,
  add column if not exists voided_at timestamptz null,
  add column if not exists snoozed_until timestamptz null;

create index if not exists invoices_deleted_at_idx on public.invoices(deleted_at);
create index if not exists invoices_voided_at_idx on public.invoices(voided_at);

alter table public.lesson_plans
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists folder text null;

create index if not exists lesson_plans_deleted_at_idx on public.lesson_plans(deleted_at);
create index if not exists lesson_plans_archived_at_idx on public.lesson_plans(archived_at);
create index if not exists lesson_plans_tags_gin on public.lesson_plans using gin(tags);

-- files already has deleted_at — add metadata columns + archive support + tags.
alter table public.files
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id) on delete set null,
  add column if not exists archive_reason text null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists folder text null;

create index if not exists files_archived_at_idx on public.files(archived_at);
create index if not exists files_tags_gin on public.files using gin(tags);

-- messages already has deleted_at — add deleted_by for audit purposes.
alter table public.messages
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null;

-- ============================================================================
-- 3) audit_log — single append-only log of every mutation
-- ============================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text null check (actor_role in ('owner', 'tutor', 'parent', 'student', 'system')),
  action text not null,
  entity_type text null,
  entity_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_org_created_idx on public.audit_log(organization_id, created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log(actor_user_id, created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index if not exists audit_log_action_idx on public.audit_log(action);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_owner_or_self on public.audit_log;
create policy audit_log_select_owner_or_self on public.audit_log
  for select using (
    -- Owners read every row in their org.
    exists (
      select 1 from public.organization_members
      where organization_id = audit_log.organization_id
        and user_id = auth.uid()
        and role = 'owner'
    )
    -- Tutors read only their own actions.
    or actor_user_id = auth.uid()
  );

drop policy if exists audit_log_insert_self on public.audit_log;
create policy audit_log_insert_self on public.audit_log
  for insert with check (
    -- Anyone in the org can write a row for themselves.
    exists (
      select 1 from public.organization_members
      where organization_id = audit_log.organization_id
        and user_id = auth.uid()
    )
    and (actor_user_id = auth.uid() or actor_user_id is null)
  );

-- ============================================================================
-- 4) pinned_items — per-user pins (Sarah's pins are not Marcus's pins)
-- ============================================================================

create table if not exists public.pinned_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'student', 'household', 'parent', 'tutor', 'session', 'invoice',
    'file', 'lesson_plan', 'session_template', 'message_thread'
  )),
  entity_id uuid not null,
  pin_order integer not null default 0,
  pinned_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index if not exists pinned_items_user_idx on public.pinned_items(user_id, entity_type);
create index if not exists pinned_items_org_idx on public.pinned_items(organization_id);

alter table public.pinned_items enable row level security;

drop policy if exists pinned_items_select_own on public.pinned_items;
create policy pinned_items_select_own on public.pinned_items
  for select using (user_id = auth.uid());

drop policy if exists pinned_items_insert_own on public.pinned_items;
create policy pinned_items_insert_own on public.pinned_items
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organization_members
      where organization_id = pinned_items.organization_id
        and user_id = auth.uid()
    )
  );

drop policy if exists pinned_items_update_own on public.pinned_items;
create policy pinned_items_update_own on public.pinned_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pinned_items_delete_own on public.pinned_items;
create policy pinned_items_delete_own on public.pinned_items
  for delete using (user_id = auth.uid());

-- ============================================================================
-- 5) templates — note / message / invoice line item snippets
-- ============================================================================

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('note', 'message', 'invoice_line')),
  title text not null,
  body jsonb not null default '{}'::jsonb,
  usage_count integer not null default 0,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_org_type_idx on public.templates(organization_id, type);
create index if not exists templates_usage_idx on public.templates(organization_id, type, usage_count desc);

alter table public.templates enable row level security;

drop policy if exists templates_select_org on public.templates;
create policy templates_select_org on public.templates
  for select using (
    exists (
      select 1 from public.organization_members
      where organization_id = templates.organization_id
        and user_id = auth.uid()
    )
  );

drop policy if exists templates_insert_org on public.templates;
create policy templates_insert_org on public.templates
  for insert with check (
    created_by_user_id = auth.uid()
    and exists (
      select 1 from public.organization_members
      where organization_id = templates.organization_id
        and user_id = auth.uid()
    )
  );

drop policy if exists templates_update_org on public.templates;
create policy templates_update_org on public.templates
  for update using (
    exists (
      select 1 from public.organization_members
      where organization_id = templates.organization_id
        and user_id = auth.uid()
    )
  );

drop policy if exists templates_delete_org on public.templates;
create policy templates_delete_org on public.templates
  for delete using (
    exists (
      select 1 from public.organization_members
      where organization_id = templates.organization_id
        and user_id = auth.uid()
        and role = 'owner'
    )
    or created_by_user_id = auth.uid()
  );

-- ============================================================================
-- 6) Composite indexes that help the "default views hide archived/deleted"
--    pattern. Only add indexes on commonly filtered columns.
-- ============================================================================

create index if not exists students_org_active_idx
  on public.students(organization_id)
  where archived_at is null;

create index if not exists sessions_org_active_idx
  on public.sessions(organization_id, scheduled_at desc)
  where deleted_at is null;

create index if not exists invoices_org_active_idx
  on public.invoices(organization_id, issued_on desc)
  where deleted_at is null;

create index if not exists lesson_plans_org_active_idx
  on public.lesson_plans(organization_id)
  where deleted_at is null and archived_at is null;

create index if not exists files_org_active_idx
  on public.files(organization_id)
  where deleted_at is null and archived_at is null;

commit;
