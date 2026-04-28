-- Phase 7 commit 3 — depth.  Additive only.
-- Apply manually via Supabase SQL Editor.
--
-- Reconciled with real schema:
--   * organization_id (not org_id), organization_members (not org_members)
--   * students.name (not full_name), sessions.notes_internal (not notes)
--   * files.display_name (not name); no separate `notes` table — polished
--     notes live on sessions.notes_parent_facing.
--
-- Adds:
--   * tags + entity_tags — first-class taggable model (commit-1's text[]
--     columns stay for backward compat but new code uses these tables).
--   * Extends commit-1's `templates` table with name/kind/variables/is_default.
--   * pg_trgm + GIN trigram indexes for fuzzy search.

begin;

-- ============================================================================
-- 1) tags — per-organization tag dictionary
-- ============================================================================

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  usage_count integer not null default 0,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists tags_org_name_unique on public.tags(organization_id, lower(name));
create index if not exists tags_org_idx on public.tags(organization_id);

alter table public.tags enable row level security;

drop policy if exists tags_select_org on public.tags;
create policy tags_select_org on public.tags
  for select using (public.is_org_member(organization_id));

drop policy if exists tags_insert_org on public.tags;
create policy tags_insert_org on public.tags
  for insert with check (public.is_org_member(organization_id));

drop policy if exists tags_update_org on public.tags;
create policy tags_update_org on public.tags
  for update using (public.is_org_member(organization_id));

drop policy if exists tags_delete_org on public.tags;
create policy tags_delete_org on public.tags
  for delete using (public.is_org_member(organization_id));

-- ============================================================================
-- 2) entity_tags — polymorphic attach
-- ============================================================================

create table if not exists public.entity_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'student','parent','tutor','session','file','invoice','lesson_plan','household'
  )),
  entity_id uuid not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists entity_tags_unique on public.entity_tags(tag_id, entity_type, entity_id);
create index if not exists entity_tags_lookup on public.entity_tags(entity_type, entity_id);
create index if not exists entity_tags_org_idx on public.entity_tags(organization_id);

alter table public.entity_tags enable row level security;

drop policy if exists entity_tags_all_org on public.entity_tags;
create policy entity_tags_all_org on public.entity_tags
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ============================================================================
-- 3) Extend commit-1 templates table to support commit-3 spec.
--    Existing columns kept: id, organization_id, created_by_user_id, type,
--    title, body (jsonb), usage_count, last_used_at, created_at, updated_at.
--    Added: name, kind (mirrors type), variables, is_default, body_text.
-- ============================================================================

alter table public.templates
  add column if not exists name text null,
  add column if not exists kind text null,
  add column if not exists body_text text null,
  add column if not exists variables jsonb not null default '[]'::jsonb,
  add column if not exists is_default boolean not null default false;

-- Backfill kind = type, name = title where empty.
update public.templates set kind = type where kind is null;
update public.templates set name = title where name is null;

-- Constrain kind values once backfilled.
alter table public.templates
  drop constraint if exists templates_kind_check;
alter table public.templates
  add constraint templates_kind_check
  check (kind is null or kind in ('message','note','invoice','invoice_line'));

create index if not exists templates_org_kind_idx on public.templates(organization_id, kind);
create index if not exists templates_default_idx on public.templates(organization_id, kind, is_default)
  where is_default = true;

-- ============================================================================
-- 4) pg_trgm — fuzzy / substring search on entity names + content
-- ============================================================================

create extension if not exists pg_trgm;

create index if not exists students_name_trgm
  on public.students using gin (name gin_trgm_ops);

create index if not exists sessions_notes_internal_trgm
  on public.sessions using gin (notes_internal gin_trgm_ops);

create index if not exists sessions_notes_parent_trgm
  on public.sessions using gin (notes_parent_facing gin_trgm_ops);

create index if not exists files_display_name_trgm
  on public.files using gin (display_name gin_trgm_ops);

create index if not exists tutors_name_trgm
  on public.tutors using gin (name gin_trgm_ops);

create index if not exists parents_name_trgm
  on public.parents using gin (name gin_trgm_ops);

create index if not exists invoices_number_trgm
  on public.invoices using gin (number gin_trgm_ops);

create index if not exists lesson_plans_topic_trgm
  on public.lesson_plans using gin (topic gin_trgm_ops);

-- ============================================================================
-- 5) Helper: tags_with_counts — view used by /api/tags GET to return
--    usage_count efficiently.  Just a convenience; UI can also count
--    client-side from entity_tags.
-- ============================================================================

create or replace view public.tags_with_counts as
select
  t.*,
  coalesce((select count(*) from public.entity_tags et where et.tag_id = t.id), 0) as live_usage
from public.tags t;

grant select on public.tags_with_counts to authenticated;

commit;
