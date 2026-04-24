BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  billing_email TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS households_org_idx ON public.households(organization_id);

CREATE TABLE IF NOT EXISTS public.household_parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, parent_id)
);
CREATE INDEX IF NOT EXISTS household_parents_household_idx ON public.household_parents(household_id);
CREATE INDEX IF NOT EXISTS household_parents_parent_idx ON public.household_parents(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS household_parents_single_primary_idx
  ON public.household_parents(household_id) WHERE is_primary = TRUE;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS students_household_idx ON public.students(household_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoices_household_idx ON public.invoices(household_id);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS households_select_via_membership ON public.households;
CREATE POLICY households_select_via_membership ON public.households
  FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS households_insert_via_membership ON public.households;
CREATE POLICY households_insert_via_membership ON public.households
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    AND public.org_billing_ok(organization_id)
  );

DROP POLICY IF EXISTS households_update_via_membership ON public.households;
CREATE POLICY households_update_via_membership ON public.households
  FOR UPDATE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS households_delete_via_membership ON public.households;
CREATE POLICY households_delete_via_membership ON public.households
  FOR DELETE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS households_select_as_parent ON public.households;
CREATE POLICY households_select_as_parent ON public.households
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.household_parents hp
      JOIN public.parents p ON p.id = hp.parent_id
      WHERE hp.household_id = households.id
        AND p.auth_user_id = auth.uid()
    )
  );

ALTER TABLE public.household_parents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_parents_select_via_household ON public.household_parents;
CREATE POLICY household_parents_select_via_household ON public.household_parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_parents.household_id
        AND (
          public.is_org_member(h.organization_id)
          OR EXISTS (
            SELECT 1 FROM public.parents p
            WHERE p.id = household_parents.parent_id
              AND p.auth_user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS household_parents_write_via_household ON public.household_parents;
CREATE POLICY household_parents_write_via_household ON public.household_parents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_parents.household_id
        AND public.is_org_member(h.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_parents.household_id
        AND public.is_org_member(h.organization_id)
        AND public.org_billing_ok(h.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Helper function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_siblings_of_parent(p_parent_id UUID)
RETURNS TABLE(parent_id UUID)
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT hp2.parent_id
  FROM public.household_parents hp1
  JOIN public.household_parents hp2 ON hp2.household_id = hp1.household_id
  WHERE hp1.parent_id = p_parent_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Data migration: one household per (parent, org) pair with active links
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  new_household_id UUID;
  household_name TEXT;
  fallback_name TEXT;
  parts INT;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      p.id AS parent_id,
      s.organization_id,
      p.name AS parent_name
    FROM public.parents p
    JOIN public.parent_student_links psl ON psl.parent_id = p.id
    JOIN public.students s ON s.id = psl.student_id
    WHERE psl.revoked_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.household_parents hp
        JOIN public.households h ON h.id = hp.household_id
        WHERE hp.parent_id = p.id
          AND h.organization_id = s.organization_id
      )
  LOOP
    fallback_name := COALESCE(NULLIF(TRIM(rec.parent_name), ''), 'Household');
    IF rec.parent_name IS NULL OR TRIM(rec.parent_name) = '' THEN
      household_name := 'Household';
    ELSE
      parts := array_length(string_to_array(TRIM(rec.parent_name), ' '), 1);
      IF parts IS NULL OR parts <= 1 THEN
        household_name := fallback_name;
      ELSE
        household_name := TRIM(SPLIT_PART(TRIM(rec.parent_name), ' ', parts)) || ' family';
      END IF;
    END IF;

    INSERT INTO public.households (organization_id, display_name, created_at, updated_at)
    VALUES (rec.organization_id, household_name, NOW(), NOW())
    RETURNING id INTO new_household_id;

    INSERT INTO public.household_parents (household_id, parent_id, is_primary, added_at)
    VALUES (new_household_id, rec.parent_id, TRUE, NOW());

    UPDATE public.students s
    SET household_id = new_household_id
    WHERE s.organization_id = rec.organization_id
      AND s.household_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.parent_student_links psl
        WHERE psl.parent_id = rec.parent_id
          AND psl.student_id = s.id
          AND psl.revoked_at IS NULL
      );
  END LOOP;
END $$;

COMMIT;
