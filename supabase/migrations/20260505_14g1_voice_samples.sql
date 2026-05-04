-- 14G-1 — Personalised polish: voice learning storage.
-- Apply manually via Supabase SQL Editor.
--
-- Purpose: capture (AI output, tutor edit) pairs as plain text so we can
-- distil a per-tutor voice profile that conditions future polish prompts.
--
-- This is additive and runs alongside the existing session_polish_edits
-- table (which stores the same idea as JSONB plus an edit-distance
-- integer). session_polish_edits is the cheap "did the tutor change a
-- little or a lot?" signal; tutor_voice_samples is the LLM-friendly text
-- corpus we feed back into the polish prompt.

-- 1) tutor_voice_samples
create table if not exists public.tutor_voice_samples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tutor_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid null references public.sessions(id) on delete set null,
  before_text text not null,
  after_text text not null,
  diff_summary text null,
  accepted boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists tutor_voice_samples_tutor_recent_idx
  on public.tutor_voice_samples(organization_id, tutor_user_id, created_at desc);

create index if not exists tutor_voice_samples_tutor_idx
  on public.tutor_voice_samples(tutor_user_id);

alter table public.tutor_voice_samples enable row level security;

-- Tutors read only their own samples within their org.
drop policy if exists tutor_voice_samples_select_own on public.tutor_voice_samples;
create policy tutor_voice_samples_select_own on public.tutor_voice_samples
  for select using (
    tutor_user_id = auth.uid()
    and organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Tutors insert only rows for themselves in their org.
drop policy if exists tutor_voice_samples_insert_own on public.tutor_voice_samples;
create policy tutor_voice_samples_insert_own on public.tutor_voice_samples
  for insert with check (
    tutor_user_id = auth.uid()
    and organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Tutors delete only their own rows (used by /app/settings/voice "reset").
drop policy if exists tutor_voice_samples_delete_own on public.tutor_voice_samples;
create policy tutor_voice_samples_delete_own on public.tutor_voice_samples
  for delete using (
    tutor_user_id = auth.uid()
    and organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- 2) profiles voice columns
alter table public.profiles
  add column if not exists voice_profile_summary text null,
  add column if not exists voice_profile_updated_at timestamptz null,
  add column if not exists voice_profile_sample_count integer not null default 0;

-- 3) Snapshot the AI-polished text on each polish call so we can later
-- compare it to whatever the tutor actually sends to the parent. Without
-- this, sessions.notes_parent_facing has already been overwritten by inline
-- edits and we'd have no reliable BEFORE for diff_summary extraction.
alter table public.notes_polish_log
  add column if not exists polished_text text null;
