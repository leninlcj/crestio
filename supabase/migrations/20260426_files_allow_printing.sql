-- =============================================================================
-- Per-file printing/saving permission toggle.
-- Adds files.allow_printing — when true, the viewer skips Cmd+S/Cmd+P/Cmd+A
-- interception and right-click block. Default false (protected).
-- =============================================================================

BEGIN;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS allow_printing BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- Verification:
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='files' AND column_name='allow_printing';
--   -- expect: allow_printing | boolean | false | NO
