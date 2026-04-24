-- Session 13A.5 — Referral program.
-- Three tables: referral_codes (one per user), referral_conversions
-- (one row per signup using a code), account_credits (credits issued,
-- auto-applied to Stripe invoices by the webhook).

BEGIN;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_codes_code_idx ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS referral_codes_user_idx ON public.referral_codes(user_id);

CREATE TABLE IF NOT EXISTS public.referral_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  referee_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  code_used TEXT NOT NULL,
  referee_signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referee_converted_at TIMESTAMPTZ NULL,
  referrer_credit_applied_at TIMESTAMPTZ NULL,
  referee_discount_applied_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'rejected', 'expired')),
  rejection_reason TEXT NULL,
  UNIQUE(referee_user_id)
);

CREATE INDEX IF NOT EXISTS referral_conversions_referrer_idx ON public.referral_conversions(referrer_user_id);
CREATE INDEX IF NOT EXISTS referral_conversions_referee_idx ON public.referral_conversions(referee_user_id);
CREATE INDEX IF NOT EXISTS referral_conversions_status_idx ON public.referral_conversions(status);

CREATE TABLE IF NOT EXISTS public.account_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'AUD',
  source TEXT NOT NULL CHECK (source IN ('referral_bonus', 'referral_welcome', 'manual_adjustment')),
  source_reference UUID NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ NULL,
  stripe_invoice_id TEXT NULL
);

CREATE INDEX IF NOT EXISTS account_credits_user_idx ON public.account_credits(user_id);
CREATE INDEX IF NOT EXISTS account_credits_unapplied_idx
  ON public.account_credits(user_id, applied_at) WHERE applied_at IS NULL;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_credits ENABLE ROW LEVEL SECURITY;

-- Users manage their own referral code.
DROP POLICY IF EXISTS referral_codes_select_own ON public.referral_codes;
CREATE POLICY referral_codes_select_own ON public.referral_codes
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS referral_codes_insert_own ON public.referral_codes;
CREATE POLICY referral_codes_insert_own ON public.referral_codes
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Referrers see conversions they triggered (used to show stats).
DROP POLICY IF EXISTS referral_conversions_select_as_referrer ON public.referral_conversions;
CREATE POLICY referral_conversions_select_as_referrer ON public.referral_conversions
  FOR SELECT USING (referrer_user_id = auth.uid());

-- Users see their own credits.
DROP POLICY IF EXISTS account_credits_select_own ON public.account_credits;
CREATE POLICY account_credits_select_own ON public.account_credits
  FOR SELECT USING (user_id = auth.uid());

-- No INSERT/UPDATE on referral_conversions or account_credits via RLS —
-- only service role writes these (webhook, signup handler).

COMMIT;
