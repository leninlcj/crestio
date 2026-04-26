-- 14F: Stripe Connect parent payments.
--
-- Direct charges on a per-organization Connect Express account. Parents pay
-- via a public unauth page at /pay/[token] (single-purpose signed token) or
-- via the parent portal (magic-link auth). Crestio takes 1% application fee
-- on top of Stripe's per-transaction fee. Tutor is merchant of record; payouts
-- land on the org's bank within ~2 days.
--
-- Existing internal tutor-payout system (org pays its own tutors) is unrelated
-- and unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- organizations: Connect account linkage + capability state
-- =============================================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_connect_status text NOT NULL DEFAULT 'pending'
    CHECK (stripe_connect_status IN ('pending','restricted','active','disabled')),
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stripe_connect_country text NOT NULL DEFAULT 'AU',
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at timestamptz;

CREATE INDEX IF NOT EXISTS organizations_stripe_connect_status_idx
  ON public.organizations(stripe_connect_status)
  WHERE stripe_connect_account_id IS NOT NULL;

-- =============================================================================
-- invoices: payment token + Stripe linkage + fee accounting
-- =============================================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_method_brand text,
  ADD COLUMN IF NOT EXISTS payment_method_last4 text,
  ADD COLUMN IF NOT EXISTS platform_fee_amount integer,
  ADD COLUMN IF NOT EXISTS stripe_fee_amount integer,
  ADD COLUMN IF NOT EXISTS net_amount_to_org integer;

-- paid_at already exists on invoices (see schema.sql).

CREATE INDEX IF NOT EXISTS invoices_payment_token_idx
  ON public.invoices(payment_token)
  WHERE payment_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_stripe_pi_idx
  ON public.invoices(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Backfill payment_token for every invoice that doesn't have one. base64url:
-- replace base64's `+/=` with `-_` and strip padding.
UPDATE public.invoices
SET payment_token = replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '')
WHERE payment_token IS NULL;

-- =============================================================================
-- parents: Stripe Customer reference (lives on the connected account, NOT the
-- platform — saved cards are scoped to a specific tutor's org).
-- =============================================================================
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- A parent who pays multiple orgs would have multiple customer ids; we only
-- track the most-recent one here. Multi-org saved cards are deferred.
CREATE INDEX IF NOT EXISTS parents_stripe_customer_idx
  ON public.parents(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- =============================================================================
-- charges: one row per PaymentIntent, ledger of money in/out
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.charges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_ids uuid[] NOT NULL,
  parent_id uuid REFERENCES public.parents(id) ON DELETE SET NULL,
  stripe_payment_intent_id text UNIQUE NOT NULL,
  stripe_charge_id text,
  amount_total integer NOT NULL,
  amount_application_fee integer NOT NULL,
  amount_stripe_fee integer,
  amount_net integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'requires_payment_method','requires_confirmation','requires_action',
    'processing','succeeded','canceled','failed','refunded','partially_refunded'
  )),
  payment_method_brand text,
  payment_method_last4 text,
  failure_code text,
  failure_message text,
  refunded_amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS charges_org_created_idx
  ON public.charges(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS charges_parent_idx
  ON public.charges(parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS charges_status_idx
  ON public.charges(status);

DROP TRIGGER IF EXISTS charges_set_updated_at ON public.charges;
CREATE TRIGGER charges_set_updated_at
  BEFORE UPDATE ON public.charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: org members can read their org's charges. All writes go through the
-- service role (webhooks + payment routes).
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS charges_select_org_members ON public.charges;
CREATE POLICY charges_select_org_members ON public.charges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = charges.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- No INSERT / UPDATE / DELETE policies — service role bypasses RLS, every
-- other client is locked out.
