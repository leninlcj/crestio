BEGIN;

-- ---------------------------------------------------------------------------
-- Test-account + owner-exemption flags
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS test_account_owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS billing_exemption_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_test_accounts_in_lists BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS profiles_test_owner_idx
  ON public.profiles(test_account_owner_user_id)
  WHERE is_test_account = TRUE;

ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS test_account_owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_test_record BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS test_account_owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_test_organization BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS test_account_owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Audit log for test-account logins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_account_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_account_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL,
  ip_address TEXT NULL
);

CREATE INDEX IF NOT EXISTS test_account_sessions_owner_idx
  ON public.test_account_sessions(owner_user_id, started_at DESC);

ALTER TABLE public.test_account_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_account_sessions_select_own ON public.test_account_sessions;
CREATE POLICY test_account_sessions_select_own ON public.test_account_sessions
  FOR SELECT USING (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- org_billing_ok: add owner-exemption branch above existing logic.
-- Active + trialing checks are preserved exactly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_billing_ok(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p.email = 'leninlcj@gmail.com'
             AND COALESCE(p.billing_exemption_active, TRUE) = TRUE
          THEN TRUE
        WHEN o.subscription_status = 'active' THEN TRUE
        WHEN o.subscription_status = 'trialing' AND o.trial_ends_at > NOW() THEN TRUE
        ELSE FALSE
      END
      FROM public.organizations o
      LEFT JOIN public.profiles p ON p.id = o.owner_user_id
      WHERE o.id = org_id
    ),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.org_billing_ok(uuid) TO authenticated;

COMMIT;
