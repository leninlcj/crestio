-- =============================================================================
-- Session 14B — Files
-- Tutor uploads (PDF/images on Solo, also Office on Team — Office conversion
-- itself is deferred to 14B-b). Students/parents view only via signed URLs.
--
-- Storage bucket `files` is created manually in the Supabase dashboard
-- (buckets cannot be created via standard SQL). See instructions at the
-- bottom of this file. All read/write goes through the server using the
-- service role key, so no policies on storage.objects are required.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Per-org storage usage counter (maintained by trigger on public.files)
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS organizations_storage_used_idx
  ON public.organizations(storage_used_bytes);

-- -----------------------------------------------------------------------------
-- files
-- DEVIATION from spec: uploaded_by_user_id uses ON DELETE SET NULL (not
-- RESTRICT) so org-owned files survive uploader account deletion. This
-- matches Task 10's hygiene rule.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.files (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  student_id          UUID REFERENCES public.students(id) ON DELETE CASCADE,
  session_id          UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  storage_path        TEXT NOT NULL,
  original_filename   TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  file_size_bytes     BIGINT NOT NULL CHECK (file_size_bytes >= 0),
  is_org_library      BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('uploading','processing','ready','failed')),
  converted_pdf_path  TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ NULL,
  -- Org library files cannot be linked to a student; student files cannot be
  -- in the org library. Stops accidental dual-tagging by API bugs.
  CONSTRAINT files_library_or_student
    CHECK ((is_org_library = TRUE AND student_id IS NULL)
        OR (is_org_library = FALSE))
);

CREATE INDEX IF NOT EXISTS files_org_student_active_idx
  ON public.files(organization_id, student_id, deleted_at);
CREATE INDEX IF NOT EXISTS files_org_library_idx
  ON public.files(organization_id, is_org_library);
CREATE INDEX IF NOT EXISTS files_session_idx
  ON public.files(session_id);
CREATE INDEX IF NOT EXISTS files_uploaded_by_idx
  ON public.files(uploaded_by_user_id);

DROP TRIGGER IF EXISTS files_set_updated_at ON public.files;
CREATE TRIGGER files_set_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- file_views — one row per signed-URL issue, written server-side
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.file_views (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id         UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  viewer_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_role     TEXT NOT NULL CHECK (viewer_role IN ('student','parent','tutor','owner')),
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      INET NULL,
  user_agent      TEXT NULL
);

CREATE INDEX IF NOT EXISTS file_views_file_at_idx
  ON public.file_views(file_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS file_views_viewer_at_idx
  ON public.file_views(viewer_user_id, viewed_at DESC);

-- -----------------------------------------------------------------------------
-- storage_used_bytes trigger
-- INSERT bumps up; soft-delete (UPDATE deleted_at NULL → NOT NULL) bumps down;
-- restore (UPDATE deleted_at NOT NULL → NULL) bumps up; hard-DELETE bumps
-- down only if the row was still active (avoids double-subtract after a soft
-- delete already accounted for it).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.files_storage_used_bump()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.organizations
      SET storage_used_bytes = storage_used_bytes + NEW.file_size_bytes
      WHERE id = NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.organizations
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - OLD.file_size_bytes)
        WHERE id = OLD.organization_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.organizations
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - OLD.file_size_bytes)
        WHERE id = OLD.organization_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.organizations
        SET storage_used_bytes = storage_used_bytes + NEW.file_size_bytes
        WHERE id = NEW.organization_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS files_storage_used_trigger ON public.files;
CREATE TRIGGER files_storage_used_trigger
  AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.files_storage_used_bump();

-- -----------------------------------------------------------------------------
-- Helper: parent → student linkage (used in files RLS policy)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_parent_of_student(target_student UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_student_links psl
    JOIN public.parents p ON p.id = psl.parent_id
    WHERE psl.student_id = target_student
      AND psl.revoked_at IS NULL
      AND p.auth_user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_parent_of_student(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- Org member access mirrors the existing tenant pattern (students/sessions/…).
-- Parents see only their linked students' files; never the org library.
-- Plan-tier and per-tutor-vs-assigned-student gating happens in the API.
-- -----------------------------------------------------------------------------
ALTER TABLE public.files      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS files_select_via_org ON public.files;
CREATE POLICY files_select_via_org ON public.files
  FOR SELECT USING (
    deleted_at IS NULL
    AND public.is_org_member(organization_id)
  );

DROP POLICY IF EXISTS files_select_via_parent ON public.files;
CREATE POLICY files_select_via_parent ON public.files
  FOR SELECT USING (
    deleted_at IS NULL
    AND is_org_library = FALSE
    AND student_id IS NOT NULL
    AND public.is_parent_of_student(student_id)
  );

DROP POLICY IF EXISTS files_insert_via_org ON public.files;
CREATE POLICY files_insert_via_org ON public.files
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    AND public.org_billing_ok(organization_id)
  );

DROP POLICY IF EXISTS files_update_via_org ON public.files;
CREATE POLICY files_update_via_org ON public.files
  FOR UPDATE USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS files_delete_via_org ON public.files;
CREATE POLICY files_delete_via_org ON public.files
  FOR DELETE USING (public.is_org_member(organization_id));

-- file_views: any authenticated user can record their own view; only the
-- file's uploader or the org owner can read view history.
DROP POLICY IF EXISTS file_views_insert_self ON public.file_views;
CREATE POLICY file_views_insert_self ON public.file_views
  FOR INSERT WITH CHECK (viewer_user_id = auth.uid());

DROP POLICY IF EXISTS file_views_select_uploader_or_owner ON public.file_views;
CREATE POLICY file_views_select_uploader_or_owner ON public.file_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.files f
      WHERE f.id = file_views.file_id
        AND (
          f.uploaded_by_user_id = auth.uid()
          OR public.is_org_owner(f.organization_id)
        )
    )
  );

COMMIT;

-- =============================================================================
-- Verification (run after the COMMIT above):
--   SELECT COUNT(*) FROM public.files;        -- expect 0
--   SELECT COUNT(*) FROM public.file_views;   -- expect 0
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('files','file_views') AND relnamespace = 'public'::regnamespace;
--   -- expect both rows with relrowsecurity = t
--
-- Then create the Storage bucket in Supabase Dashboard:
--   Name:                files
--   Public bucket:       OFF (private)
--   File size limit:     52428800    (50 MB — Supabase Free plan global cap;
--                                     also matches Team per-file cap)
--   Allowed MIME types:  (leave empty — server validates per plan tier)
--   No additional RLS policies on storage.objects required (server uses
--   the service role key for all reads/writes).
--
-- Per-tier per-file caps (enforced server-side in /api/files/upload):
--   Solo:  25 MB  (26214400 bytes)
--   Team:  50 MB  (52428800 bytes — same as bucket-level cap)
-- =============================================================================
