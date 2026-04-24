BEGIN;

-- Add homework and next-focus fields to sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS homework_description TEXT NULL,
  ADD COLUMN IF NOT EXISTS homework_due_date DATE NULL,
  ADD COLUMN IF NOT EXISTS homework_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS homework_completed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_session_focus TEXT NULL;

CREATE INDEX IF NOT EXISTS sessions_homework_due_idx
  ON public.sessions(homework_due_date)
  WHERE homework_description IS NOT NULL AND homework_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_student_scheduled_at_idx
  ON public.sessions(student_id, scheduled_at DESC)
  WHERE status = 'completed';

-- Parents can UPDATE sessions for their linked students so they can toggle
-- homework_completed_at via the /api/parent/homework/toggle endpoint.
-- The API layer restricts which columns the parent-auth client actually touches.
DROP POLICY IF EXISTS sessions_parent_complete_homework ON public.sessions;
CREATE POLICY sessions_parent_complete_homework ON public.sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = sessions.student_id
        AND p.auth_user_id = auth.uid()
        AND psl.revoked_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = sessions.student_id
        AND p.auth_user_id = auth.uid()
        AND psl.revoked_at IS NULL
    )
  );

COMMIT;
