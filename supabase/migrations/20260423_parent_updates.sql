-- Session 12: parent_updates table + students.archived_at column.
-- parent_updates: portal-visible notes from tutor to parent. Immutable (no UPDATE).
-- students.archived_at: added alongside the existing archived boolean. Tools
-- set both so existing list filters (.eq('archived', false)) keep working.

BEGIN;

CREATE TABLE IF NOT EXISTS public.parent_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parent_updates_student_idx
  ON public.parent_updates(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS parent_updates_org_idx
  ON public.parent_updates(organization_id);

ALTER TABLE public.parent_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_updates_select_via_membership ON public.parent_updates;
CREATE POLICY parent_updates_select_via_membership ON public.parent_updates
  FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS parent_updates_insert_via_membership ON public.parent_updates;
CREATE POLICY parent_updates_insert_via_membership ON public.parent_updates
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    AND public.org_billing_ok(organization_id)
  );

DROP POLICY IF EXISTS parent_updates_delete_via_membership ON public.parent_updates;
CREATE POLICY parent_updates_delete_via_membership ON public.parent_updates
  FOR DELETE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS parent_updates_select_as_parent ON public.parent_updates;
CREATE POLICY parent_updates_select_as_parent ON public.parent_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = parent_updates.student_id
        AND p.auth_user_id = auth.uid()
        AND psl.revoked_at IS NULL
    )
  );

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS students_archived_at_idx
  ON public.students(archived_at);

COMMIT;
