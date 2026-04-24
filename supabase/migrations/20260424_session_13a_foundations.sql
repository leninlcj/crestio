-- Session 13A foundations: pricing tiers, support requests, user locale.
-- Storage bucket `support-attachments` is created manually in the Supabase
-- dashboard (bucket cannot be created via standard SQL). See Session 13A notes.

BEGIN;

-- -----------------------------------------------------------------------------
-- Part 4: two-tier pricing (solo / team / growth) + monthly/annual
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'solo'
    CHECK (plan_tier IN ('solo', 'team', 'growth'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual'));

CREATE INDEX IF NOT EXISTS organizations_plan_tier_idx
  ON public.organizations(plan_tier);

-- -----------------------------------------------------------------------------
-- Part 6: support_requests — in-app support widget audit log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  attachment_urls TEXT[] DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS support_requests_user_idx
  ON public.support_requests(user_id);
CREATE INDEX IF NOT EXISTS support_requests_submitted_at_idx
  ON public.support_requests(submitted_at DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_requests_select_own ON public.support_requests;
CREATE POLICY support_requests_select_own ON public.support_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS support_requests_insert_own ON public.support_requests;
CREATE POLICY support_requests_insert_own ON public.support_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
-- No UPDATE/DELETE policies — only service-role can modify.

-- -----------------------------------------------------------------------------
-- Part 9: i18n — per-user locale. Stored on profiles (auth.users is managed).
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';

COMMIT;
