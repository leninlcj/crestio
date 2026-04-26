-- 14E: activation + retention foundation
--
-- Adds:
--   * notes_template + generated_through_date on session_templates (existing
--     table from 13B already has the rest of the recurrence fields)
--   * is_sample on students / sessions / invoices
--   * has_sample_data + sample_data_dismissed_at + is_admin on profiles
--   * ai_call_logs (per-call cost + escalation telemetry)
--
-- parent_notified_at is already on sessions (parent portal migration).

BEGIN;

-- -----------------------------------------------------------------------------
-- A) session_templates extensions
-- -----------------------------------------------------------------------------
ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS notes_template TEXT;

-- generated_through_date tracks the date the cron has materialised sessions
-- up to. Cron only inserts past this watermark, so re-runs are cheap.
ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS generated_through_date DATE;

-- -----------------------------------------------------------------------------
-- B) Sample-data columns. is_sample is distinct from is_test_record (the
-- owner test-account feature) — sample data is the trial seed, deleted in
-- one click when the user is ready.
-- -----------------------------------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS students_is_sample_idx ON public.students(organization_id, is_sample);
CREATE INDEX IF NOT EXISTS sessions_is_sample_idx ON public.sessions(organization_id, is_sample);
CREATE INDEX IF NOT EXISTS invoices_is_sample_idx ON public.invoices(organization_id, is_sample);

-- -----------------------------------------------------------------------------
-- C) Profile flags for sample data + admin gating.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_sample_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sample_data_dismissed_at TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Bootstrap: seed admin flag for the platform owner so /admin/ai-costs is
-- reachable on first deploy. Email lookup deliberately tolerates missing rows.
UPDATE public.profiles
   SET is_admin = TRUE
 WHERE id IN (SELECT id FROM auth.users WHERE lower(email) = 'leninlcj@gmail.com');

-- -----------------------------------------------------------------------------
-- D) ai_call_logs — per-call cost + escalation telemetry. Inserted by the
-- service role only; users read their own rows (admins read all via the
-- admin endpoint that uses the service role).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd NUMERIC(10, 6),
  escalated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_call_logs_user_idx
  ON public.ai_call_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_logs_task_idx
  ON public.ai_call_logs(task_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_logs_org_idx
  ON public.ai_call_logs(organization_id, created_at DESC);

ALTER TABLE public.ai_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_call_logs_select_own ON public.ai_call_logs;
CREATE POLICY ai_call_logs_select_own ON public.ai_call_logs
  FOR SELECT USING (user_id = auth.uid());

-- No INSERT policy: only service-role bypasses RLS to record calls.

COMMIT;
