BEGIN;

-- Make student_id nullable — household invoices attach to a household, not a
-- single student. Line items (invoice_sessions) carry the per-student info.
ALTER TABLE public.invoices
  ALTER COLUMN student_id DROP NOT NULL;

-- Join table: which sessions belong to which invoice + a snapshot of the rate
-- and amount at time of invoicing. This means later rate edits never retro-
-- alter historic bills.
CREATE TABLE IF NOT EXISTS public.invoice_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  hourly_rate_cents INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  line_item_description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invoice_id, session_id),
  UNIQUE(session_id)
);

CREATE INDEX IF NOT EXISTS invoice_sessions_invoice_idx
  ON public.invoice_sessions(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_sessions_student_idx
  ON public.invoice_sessions(student_id);

ALTER TABLE public.invoice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_sessions_select_via_invoice ON public.invoice_sessions;
CREATE POLICY invoice_sessions_select_via_invoice ON public.invoice_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_sessions.invoice_id
        AND (
          public.is_org_member(i.organization_id)
          OR EXISTS (
            SELECT 1
            FROM public.household_parents hp
            JOIN public.parents p ON p.id = hp.parent_id
            WHERE hp.household_id = i.household_id
              AND p.auth_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.parent_student_links psl
            JOIN public.parents p ON p.id = psl.parent_id
            WHERE psl.student_id = invoice_sessions.student_id
              AND p.auth_user_id = auth.uid()
              AND psl.revoked_at IS NULL
          )
        )
    )
  );

-- Invoice period + batch flag
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS billing_period_start DATE NULL,
  ADD COLUMN IF NOT EXISTS billing_period_end DATE NULL,
  ADD COLUMN IF NOT EXISTS is_batch_generated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS invoices_household_period_idx
  ON public.invoices(household_id, billing_period_end DESC)
  WHERE status != 'void';

COMMIT;
