-- =============================================================================
-- ph7d — foundation fixes
-- 1.1  Re-add session_templates.notes_template + generated_through_date (the
--      14E migration didn't apply in prod; idempotent so safe to replay).
-- 1.2  parents.organization_id with backfill via household_parents and
--      parent_student_links + an org-scoped RLS policy.
-- 1.6  unbilled_completed_sessions view used by both Home and Batch invoice.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1.1  session_templates columns (notes_template, generated_through_date)
-- -----------------------------------------------------------------------------
ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS notes_template TEXT;

ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS generated_through_date DATE;

-- -----------------------------------------------------------------------------
-- 1.2  parents.organization_id
-- The parents table has historically been org-less — every parent has an
-- auth_user_id and is linked to students through parent_student_links and to
-- households through household_parents. Several call sites (entitySchema,
-- trash) assume an organization_id column, so backfill it now.
-- -----------------------------------------------------------------------------
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill: prefer the household route (current truth), fall back to the
-- legacy parent_student_links route. The first match wins; we only set rows
-- that don't already have an org.
UPDATE public.parents p
   SET organization_id = sub.org_id
  FROM (
    SELECT DISTINCT ON (p.id) p.id AS parent_id, h.organization_id AS org_id
      FROM public.parents p
      JOIN public.household_parents hp ON hp.parent_id = p.id
      JOIN public.households h ON h.id = hp.household_id
     WHERE p.organization_id IS NULL
     ORDER BY p.id, hp.added_at ASC
  ) sub
 WHERE p.id = sub.parent_id;

UPDATE public.parents p
   SET organization_id = sub.org_id
  FROM (
    SELECT DISTINCT ON (p.id) p.id AS parent_id, s.organization_id AS org_id
      FROM public.parents p
      JOIN public.parent_student_links psl ON psl.parent_id = p.id
      JOIN public.students s ON s.id = psl.student_id
     WHERE p.organization_id IS NULL
       AND psl.revoked_at IS NULL
     ORDER BY p.id, psl.created_at ASC
  ) sub
 WHERE p.id = sub.parent_id;

CREATE INDEX IF NOT EXISTS parents_organization_id_idx
  ON public.parents(organization_id);

-- Add an org-scoped read policy so org members can see every parent in
-- their org (the page that fixes 1.7 needs this).
DROP POLICY IF EXISTS "parents_select_via_org" ON public.parents;
CREATE POLICY "parents_select_via_org" ON public.parents
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id)
  );

-- -----------------------------------------------------------------------------
-- 1.2 (cont)  Trash uses entitySchema's archived_at + archive_reason fields
-- on every entity. parents was missing them.
-- -----------------------------------------------------------------------------
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS parents_archived_at_idx
  ON public.parents(archived_at);

-- -----------------------------------------------------------------------------
-- 1.6  unbilled_completed_sessions view
-- One source of truth for "sessions ready to invoice". Both Home dashboard
-- and Batch invoice select from this view; period filtering is layered on top.
-- A session is unbilled when:
--   * status = 'completed'
--   * deleted_at IS NULL
--   * not attached via the legacy sessions.invoice_id link
--   * not attached via the batch invoice_sessions join table
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.unbilled_completed_sessions AS
  SELECT s.*
    FROM public.sessions s
   WHERE s.status = 'completed'
     AND s.invoice_id IS NULL
     AND s.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_sessions inv_s
        WHERE inv_s.session_id = s.id
     );

GRANT SELECT ON public.unbilled_completed_sessions TO authenticated;

COMMIT;

-- =============================================================================
-- Verify (run after the COMMIT):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='session_templates'
--      AND column_name IN ('notes_template','generated_through_date');
--   -- expect 2 rows
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='parents'
--      AND column_name IN ('organization_id','archived_at','archived_by','archive_reason');
--   -- expect 4 rows
--
--   SELECT COUNT(*) FROM public.parents WHERE organization_id IS NULL;
--   -- expect 0 in healthy orgs (any leftover means an orphan parent record)
--
--   SELECT COUNT(*) FROM public.unbilled_completed_sessions;
--   -- expect a number; should match Home tile count for 60-day lookback
-- =============================================================================
