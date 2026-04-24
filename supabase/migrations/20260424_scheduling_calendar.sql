-- Session 13B — scheduling, recurring session templates, ICS feeds,
-- propose/confirm change flow, parent-side invoice reads.

BEGIN;

-- -----------------------------------------------------------------------------
-- Session templates (recurring sessions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  tutor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  recurrence_rule TEXT NOT NULL CHECK (recurrence_rule IN ('weekly', 'fortnightly', 'monthly')),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time_local TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS session_templates_org_idx ON public.session_templates(organization_id);
CREATE INDEX IF NOT EXISTS session_templates_student_idx ON public.session_templates(student_id);
CREATE INDEX IF NOT EXISTS session_templates_tutor_idx ON public.session_templates(tutor_user_id);

ALTER TABLE public.session_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_templates_select_via_membership ON public.session_templates;
CREATE POLICY session_templates_select_via_membership ON public.session_templates
  FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS session_templates_insert_via_membership ON public.session_templates;
CREATE POLICY session_templates_insert_via_membership ON public.session_templates
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    AND public.org_billing_ok(organization_id)
  );

DROP POLICY IF EXISTS session_templates_update_via_membership ON public.session_templates;
CREATE POLICY session_templates_update_via_membership ON public.session_templates
  FOR UPDATE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS session_templates_delete_via_membership ON public.session_templates;
CREATE POLICY session_templates_delete_via_membership ON public.session_templates
  FOR DELETE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS session_templates_select_as_parent ON public.session_templates;
CREATE POLICY session_templates_select_as_parent ON public.session_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = session_templates.student_id
        AND p.auth_user_id = auth.uid()
        AND psl.revoked_at IS NULL
    )
  );

-- -----------------------------------------------------------------------------
-- Extend sessions table (propose/confirm fields + template link)
-- -----------------------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_template_id UUID REFERENCES public.session_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_change_by TEXT CHECK (proposed_change_by IN ('tutor', 'parent')),
  ADD COLUMN IF NOT EXISTS proposed_new_start_time TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS proposed_new_duration_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS proposed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS change_message TEXT NULL;

CREATE INDEX IF NOT EXISTS sessions_template_idx ON public.sessions(session_template_id);
CREATE INDEX IF NOT EXISTS sessions_status_pending_idx
  ON public.sessions(organization_id, status)
  WHERE status = 'pending_change';

-- Expand sessions.status CHECK to include rescheduled + pending_change.
DO $$
DECLARE c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sessions DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled', 'pending_change'));

-- -----------------------------------------------------------------------------
-- Session change log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_change_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  changed_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'created',
    'proposed_reschedule', 'confirmed_reschedule', 'rejected_reschedule',
    'proposed_cancel', 'confirmed_cancel', 'rejected_cancel'
  )),
  old_start_time TIMESTAMPTZ NULL,
  new_start_time TIMESTAMPTZ NULL,
  message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_change_log_session_idx
  ON public.session_change_log(session_id, created_at DESC);

ALTER TABLE public.session_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_change_log_select_via_session ON public.session_change_log;
CREATE POLICY session_change_log_select_via_session ON public.session_change_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_change_log.session_id
        AND public.is_org_member(s.organization_id)
    )
  );

DROP POLICY IF EXISTS session_change_log_select_as_parent ON public.session_change_log;
CREATE POLICY session_change_log_select_as_parent ON public.session_change_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.parent_student_links psl ON psl.student_id = s.student_id
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE s.id = session_change_log.session_id
        AND p.auth_user_id = auth.uid()
        AND psl.revoked_at IS NULL
    )
  );

-- -----------------------------------------------------------------------------
-- Calendar access tokens (ICS feed bearer tokens)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  audience TEXT NOT NULL CHECK (audience IN ('tutor', 'parent', 'parent_student')),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  last_accessed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS calendar_access_tokens_token_idx ON public.calendar_access_tokens(token);
CREATE INDEX IF NOT EXISTS calendar_access_tokens_user_idx ON public.calendar_access_tokens(user_id);

ALTER TABLE public.calendar_access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_tokens_select_own ON public.calendar_access_tokens;
CREATE POLICY calendar_tokens_select_own ON public.calendar_access_tokens
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_tokens_insert_own ON public.calendar_access_tokens;
CREATE POLICY calendar_tokens_insert_own ON public.calendar_access_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_tokens_update_own ON public.calendar_access_tokens;
CREATE POLICY calendar_tokens_update_own ON public.calendar_access_tokens
  FOR UPDATE USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Parents can read invoices for linked students
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS invoices_select_as_parent ON public.invoices;
CREATE POLICY invoices_select_as_parent ON public.invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = invoices.student_id
        AND p.auth_user_id = auth.uid()
        AND psl.revoked_at IS NULL
    )
  );

COMMIT;
