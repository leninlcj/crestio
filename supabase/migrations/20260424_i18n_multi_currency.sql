BEGIN;

-- Organization-level currency + country (used to bill the tutor's clients and
-- to seed the user's locale on signup). Defaults AUD so existing orgs keep
-- working unchanged. CHECK whitelist spans the 22 currencies our country-
-- mapping produces (includes TWD and ARS which the initial spec missed).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'AUD'
    CHECK (currency IN (
      'AUD', 'USD', 'EUR', 'GBP', 'INR', 'CNY', 'BRL', 'MXN',
      'IDR', 'BDT', 'PKR', 'SAR', 'AED', 'JPY', 'CAD', 'NZD',
      'ZAR', 'CHF', 'SGD', 'HKD', 'TWD', 'ARS'
    )),
  ADD COLUMN IF NOT EXISTS country_code TEXT NULL;

-- Parents have their own locale preference — may differ from the tutor's.
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';

-- Invoices capture currency at issue time — historical reporting stays
-- correct if the org later switches currency.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'AUD';

COMMIT;
