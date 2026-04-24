-- Follow-up to 20260424_households.sql.
-- Extends the parent-side invoice RLS to also surface invoices attached to
-- households the parent belongs to (batch invoices that arrive with 13I).
-- Safe to run any time after 20260424_households.sql.
BEGIN;

DROP POLICY IF EXISTS invoices_select_as_parent ON public.invoices;
CREATE POLICY invoices_select_as_parent ON public.invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = invoices.student_id
        AND p.auth_user_id = auth.uid()
        AND psl.revoked_at IS NULL
    )
    OR (
      invoices.household_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.household_parents hp
        JOIN public.parents p ON p.id = hp.parent_id
        WHERE hp.household_id = invoices.household_id
          AND p.auth_user_id = auth.uid()
      )
    )
  );

COMMIT;
