-- =============================================================================
-- Migration: AI-polished session notes
-- Adds notes_polish_log for rate limiting and sessions.notes_polished_by_ai
-- flag for internal analytics. Safe to run multiple times.
-- =============================================================================

create table if not exists public.notes_polish_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notes_polish_log_user_idx on public.notes_polish_log(user_id);
create index if not exists notes_polish_log_created_idx on public.notes_polish_log(created_at);

alter table public.notes_polish_log enable row level security;

drop policy if exists "notes_polish_log_select_own" on public.notes_polish_log;
create policy "notes_polish_log_select_own" on public.notes_polish_log
  for select using (auth.uid() = user_id);

drop policy if exists "notes_polish_log_insert_own" on public.notes_polish_log;
create policy "notes_polish_log_insert_own" on public.notes_polish_log
  for insert with check (auth.uid() = user_id);

alter table public.sessions
  add column if not exists notes_polished_by_ai boolean not null default false;
