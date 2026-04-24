-- Session 13E — Parent ↔ tutor messaging. One thread per
-- (student, parent, tutor) triple. Messages log sender_type so parent rows
-- and tutor rows render differently; urgency only allowed when sender_type
-- is 'tutor' (enforced server-side).

BEGIN;

CREATE TABLE IF NOT EXISTS public.message_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  tutor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NULL,
  last_message_preview TEXT NULL,
  tutor_last_read_at TIMESTAMPTZ NULL,
  parent_last_read_at TIMESTAMPTZ NULL,
  tutor_last_email_at TIMESTAMPTZ NULL,
  parent_last_email_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  UNIQUE(student_id, parent_id, tutor_user_id)
);

CREATE INDEX IF NOT EXISTS message_threads_org_idx
  ON public.message_threads(organization_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS message_threads_tutor_idx
  ON public.message_threads(tutor_user_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS message_threads_parent_idx
  ON public.message_threads(parent_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS message_threads_student_idx
  ON public.message_threads(student_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('tutor', 'parent')),
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (LENGTH(body) BETWEEN 1 AND 5000),
  urgency TEXT NULL CHECK (urgency IN ('urgent', 'normal', 'info')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS messages_thread_idx
  ON public.messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx
  ON public.messages(sender_user_id, created_at DESC);

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_threads_select_as_tutor ON public.message_threads;
CREATE POLICY message_threads_select_as_tutor ON public.message_threads
  FOR SELECT USING (
    tutor_user_id = auth.uid()
    OR public.is_org_owner(organization_id)
  );

DROP POLICY IF EXISTS message_threads_select_as_parent ON public.message_threads;
CREATE POLICY message_threads_select_as_parent ON public.message_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = message_threads.parent_id
        AND p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS message_threads_update_read ON public.message_threads;
CREATE POLICY message_threads_update_read ON public.message_threads
  FOR UPDATE USING (
    tutor_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = message_threads.parent_id
        AND p.auth_user_id = auth.uid()
    )
  );
-- No INSERT / DELETE — server only.

DROP POLICY IF EXISTS messages_select_via_thread ON public.messages;
CREATE POLICY messages_select_via_thread ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.message_threads mt
      WHERE mt.id = messages.thread_id
        AND (
          mt.tutor_user_id = auth.uid()
          OR public.is_org_owner(mt.organization_id)
          OR EXISTS (
            SELECT 1 FROM public.parents p
            WHERE p.id = mt.parent_id
              AND p.auth_user_id = auth.uid()
          )
        )
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS messages_update_own_recent ON public.messages;
CREATE POLICY messages_update_own_recent ON public.messages
  FOR UPDATE USING (
    sender_user_id = auth.uid()
    AND created_at > NOW() - INTERVAL '5 minutes'
  );

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_messages_email BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_messages_urgent_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS notify_messages_email BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_messages_urgent_only BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
