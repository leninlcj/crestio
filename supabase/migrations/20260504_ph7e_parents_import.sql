-- =============================================================================
-- ph7e — make parents.auth_user_id nullable so the CSV import can create real
-- parent records before the parent has signed up. Add parents.phone for the
-- imported phone number, and household billing_address + preferred_currency
-- so the import stops stuffing them into the notes blob.
--
-- Idempotent — every step guards with IF EXISTS / IF NOT EXISTS / IS NULLABLE
-- so it can be replayed safely.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. parents.auth_user_id: drop NOT NULL + UNIQUE, replace with partial unique
-- ---------------------------------------------------------------------------
ALTER TABLE public.parents ALTER COLUMN auth_user_id DROP NOT NULL;

-- The original `auth_user_id uuid not null unique` declaration auto-created
-- a UNIQUE constraint named parents_auth_user_id_key. Drop it (and its
-- backing index) if present so imported rows with NULL auth_user_id don't
-- collide on the all-NULLs uniqueness check.
ALTER TABLE public.parents DROP CONSTRAINT IF EXISTS parents_auth_user_id_key;
DROP INDEX IF EXISTS public.parents_auth_user_id_key;

-- Partial unique: every linked auth user still maps to exactly one parents
-- row, but unlimited imported rows with auth_user_id IS NULL are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS parents_auth_user_id_uidx
  ON public.parents(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. parents.phone — captured during CSV import; stored as E.164.
-- ---------------------------------------------------------------------------
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS phone TEXT NULL;

-- ---------------------------------------------------------------------------
-- 3. households: first-class billing_address + preferred_currency.
--    Previously the CSV import folded these into the notes blob.
-- ---------------------------------------------------------------------------
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS billing_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT NULL;

-- ---------------------------------------------------------------------------
-- 4. parents RLS
--
-- Existing policies kept as-is:
--   * parents_select_own       — auth.uid() = auth_user_id (parent portal)
--   * parents_update_own       — same gate, for self-edit
--   * parents_select_via_org   — added in ph7d, org members read their org's
--                                parents via parents.organization_id
--
-- New policies:
--   * parents_select_via_household — explicit "tutor sees parents linked to a
--     household in their org" path. Redundant with parents_select_via_org for
--     correctly-stamped rows, but defends against any orphan with NULL
--     organization_id that still has a household_parents link.
--   * parents_insert_via_org / parents_update_via_org / parents_delete_via_org
--     — membership-gated CRUD that mirrors the rest of the tenant tables.
--     The CSV import runs as service-role and bypasses RLS, so these
--     policies don't change the import path; they just keep non-service
--     callers consistent with the other tenant tables.
--
-- Imported rows have auth_user_id IS NULL, so they can NEVER satisfy
-- parents_select_own (the parent-portal sign-in lookup) — imported records
-- can't pollute the parent portal until/unless the parent signs up and
-- their auth_user_id is filled in.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "parents_select_via_household" ON public.parents;
CREATE POLICY "parents_select_via_household" ON public.parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM public.household_parents hp
        JOIN public.households h ON h.id = hp.household_id
       WHERE hp.parent_id = parents.id
         AND public.is_org_member(h.organization_id)
    )
  );

DROP POLICY IF EXISTS "parents_insert_via_org" ON public.parents;
CREATE POLICY "parents_insert_via_org" ON public.parents
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id)
    AND public.org_billing_ok(organization_id)
  );

DROP POLICY IF EXISTS "parents_update_via_org" ON public.parents;
CREATE POLICY "parents_update_via_org" ON public.parents
  FOR UPDATE USING (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id)
  );

DROP POLICY IF EXISTS "parents_delete_via_org" ON public.parents;
CREATE POLICY "parents_delete_via_org" ON public.parents
  FOR DELETE USING (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id)
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Signup trigger note (no SQL change required):
--
--   The trigger `on_auth_user_created` fires AFTER INSERT ON auth.users only
--   (see schema.sql lines 460-463). Inserting directly into public.parents
--   does NOT fire it: no auth.users row is created, no signup email is sent,
--   no organization is auto-created. This is the existing behaviour — this
--   migration changes nothing about the trigger, just documents the
--   guarantee so future readers don't assume otherwise.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verify (run after the COMMIT):
--
--   -- parents.auth_user_id is now nullable
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='parents' AND column_name='auth_user_id';
--   -- expect: YES
--
--   -- partial unique index exists with the IS NOT NULL predicate
--   SELECT indexdef FROM pg_indexes
--    WHERE schemaname='public' AND indexname='parents_auth_user_id_uidx';
--   -- expect a row containing "WHERE (auth_user_id IS NOT NULL)"
--
--   -- old unique constraint is gone
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.parents'::regclass AND conname='parents_auth_user_id_key';
--   -- expect 0 rows
--
--   -- new columns exist
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='parents' AND column_name='phone';
--   -- expect 1 row
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='households'
--      AND column_name IN ('billing_address','preferred_currency');
--   -- expect 2 rows
-- ---------------------------------------------------------------------------
