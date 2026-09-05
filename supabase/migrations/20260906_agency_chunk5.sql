-- Agency pivot, chunk 5: the soft run.
-- Apply manually via Supabase SQL Editor. Every statement is idempotent.
--
-- What this adds:
--   1. household_credits: a ledger of prepaid credit per family (purchases,
--      referral credits, adjustments, drawdowns, reversals). Balance is the
--      sum of the rows.
--   2. invoices: credit_applied_cents, is_prepaid_block, prepaid_face_value_cents,
--      prepaid_hours, line_items. Triggers apply a family's credit when an
--      invoice is issued (inserted as 'sent', or moved from 'draft' to 'sent'),
--      write the ledger rows, credit the ledger when a prepaid block invoice is
--      paid, and reverse on void or refund. Invoices are marked paid from four
--      places in the code, which is why this lives in the database.
--   3. households: referred_by_household_id, referral_credited_at,
--      low_credit_notified_at, preferred_language.
--   4. reviews: review requests and the reviews families write, approved by
--      the owner before anything shows on the site.
--   5. rate_limit_buckets and rate_limit_hit(): a shared rate limiter for the
--      public forms (the in-memory one resets on every Vercel instance).

begin;

-- 1) household_credits ------------------------------------------------------
create table if not exists public.household_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null
    check (kind in ('purchase','referral','adjustment','drawdown','reversal')),
  amount_cents integer not null,
  invoice_id uuid null references public.invoices(id) on delete cascade,
  note text null,
  created_by uuid null references auth.users(id) on delete set null
);

create index if not exists household_credits_household_idx
  on public.household_credits(household_id, created_at desc);
create index if not exists household_credits_invoice_idx
  on public.household_credits(invoice_id) where invoice_id is not null;

create or replace function public.household_credit_balance(p_household uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::integer
    from public.household_credits
   where household_id = p_household;
$$;
grant execute on function public.household_credit_balance(uuid) to authenticated;

alter table public.household_credits enable row level security;

-- Owners and tutors of the organisation, and the household's own parents, may read.
drop policy if exists household_credits_select on public.household_credits;
create policy household_credits_select on public.household_credits
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    or exists (
      select 1
        from public.household_parents hp
        join public.parents p on p.id = hp.parent_id
       where hp.household_id = household_credits.household_id
         and p.auth_user_id = auth.uid()
    )
  );
-- No insert, update or delete policies: rows are written by the service role
-- and by the security-definer triggers below.

-- 2) invoices: credit and prepaid block columns ------------------------------
alter table public.invoices add column if not exists credit_applied_cents integer not null default 0;
alter table public.invoices add column if not exists is_prepaid_block boolean not null default false;
alter table public.invoices add column if not exists prepaid_face_value_cents integer null;
alter table public.invoices add column if not exists prepaid_hours numeric(6,2) null;
alter table public.invoices add column if not exists line_items jsonb null;

create index if not exists invoices_prepaid_block_idx
  on public.invoices(household_id) where is_prepaid_block = true;

-- Every invoice gets a payment token at insert. The April 2026 backfill covered
-- the rows that existed then; invoices created since have none, so their
-- "Pay by card" link never appeared. Same base64url shape as the backfill.
alter table public.invoices
  alter column payment_token
  set default replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
update public.invoices
   set payment_token = replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '')
 where payment_token is null;

-- The household an invoice bills: its own household_id, else the student's.
create or replace function public.invoice_household(p_household uuid, p_student uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(p_household, (select household_id from public.students where id = p_student));
$$;

-- BEFORE INSERT / UPDATE: when an invoice is issued (status 'sent'), draw the
-- family's credit down against it. Prepaid block invoices never consume credit.
create or replace function public.invoices_apply_credit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_household uuid;
  v_balance integer;
  v_apply integer;
  v_issuing boolean;
begin
  if new.is_prepaid_block then return new; end if;
  if tg_op = 'INSERT' then
    v_issuing := new.status = 'sent';
  else
    v_issuing := old.status = 'draft' and new.status = 'sent';
  end if;
  if not v_issuing then return new; end if;
  if coalesce(new.total_cents, 0) <= 0 then return new; end if;

  v_household := public.invoice_household(new.household_id, new.student_id);
  if v_household is null then return new; end if;

  v_balance := public.household_credit_balance(v_household);
  if v_balance <= 0 then return new; end if;

  v_apply := least(v_balance, new.total_cents);
  new.credit_applied_cents := coalesce(new.credit_applied_cents, 0) + v_apply;
  new.total_cents := new.total_cents - v_apply;
  if new.sent_at is null then new.sent_at := now(); end if;
  if new.total_cents = 0 then
    new.status := 'paid';
    new.paid_at := now();
  end if;
  return new;
end
$$;

-- AFTER INSERT / UPDATE: write the ledger rows the row state implies.
create or replace function public.invoices_credit_ledger()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_household uuid;
  v_old_applied integer := 0;
  v_face integer;
  v_has_purchase boolean;
  v_has_reversal boolean;
begin
  v_household := public.invoice_household(new.household_id, new.student_id);
  if tg_op = 'UPDATE' then v_old_applied := coalesce(old.credit_applied_cents, 0); end if;

  -- Credit drawn down against this invoice.
  if coalesce(new.credit_applied_cents, 0) > v_old_applied and v_household is not null then
    insert into public.household_credits (organization_id, household_id, kind, amount_cents, invoice_id, note)
    values (new.organization_id, v_household, 'drawdown', -(new.credit_applied_cents - v_old_applied), new.id,
            'Applied to invoice ' || coalesce(new.number, ''));
  end if;

  -- A prepaid block that has just been paid: credit the face value once.
  if new.is_prepaid_block and new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid')
     and v_household is not null then
    select exists (select 1 from public.household_credits where invoice_id = new.id and kind = 'purchase') into v_has_purchase;
    if not v_has_purchase then
      v_face := coalesce(new.prepaid_face_value_cents, new.subtotal_cents, new.total_cents, 0);
      if v_face > 0 then
        insert into public.household_credits (organization_id, household_id, kind, amount_cents, invoice_id, note)
        values (new.organization_id, v_household, 'purchase', v_face, new.id,
                'Prepaid block, invoice ' || coalesce(new.number, ''));
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- A paid prepaid block refunded (status leaves 'paid'): take the credit back.
    if new.is_prepaid_block and old.status = 'paid' and new.status is distinct from 'paid' and v_household is not null then
      select exists (select 1 from public.household_credits where invoice_id = new.id and kind = 'purchase') into v_has_purchase;
      select exists (select 1 from public.household_credits where invoice_id = new.id and kind = 'reversal') into v_has_reversal;
      if v_has_purchase and not v_has_reversal then
        v_face := coalesce(new.prepaid_face_value_cents, new.subtotal_cents, new.total_cents, 0);
        insert into public.household_credits (organization_id, household_id, kind, amount_cents, invoice_id, note)
        values (new.organization_id, v_household, 'reversal', -v_face, new.id,
                'Prepaid block refunded, invoice ' || coalesce(new.number, ''));
      end if;
    end if;

    -- A voided invoice gives its credit back.
    if new.status = 'void' and old.status is distinct from 'void'
       and coalesce(new.credit_applied_cents, 0) > 0 and v_household is not null then
      select exists (select 1 from public.household_credits where invoice_id = new.id and kind = 'reversal') into v_has_reversal;
      if not v_has_reversal then
        insert into public.household_credits (organization_id, household_id, kind, amount_cents, invoice_id, note)
        values (new.organization_id, v_household, 'reversal', new.credit_applied_cents, new.id,
                'Invoice ' || coalesce(new.number, '') || ' voided');
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists invoices_apply_credit_before on public.invoices;
create trigger invoices_apply_credit_before
  before insert or update of status on public.invoices
  for each row execute function public.invoices_apply_credit();

drop trigger if exists invoices_credit_ledger_after on public.invoices;
create trigger invoices_credit_ledger_after
  after insert or update of status, credit_applied_cents on public.invoices
  for each row execute function public.invoices_credit_ledger();

-- 3) households: referrals, low-credit notices, language -------------------
alter table public.households add column if not exists referred_by_household_id uuid null references public.households(id) on delete set null;
alter table public.households add column if not exists referral_credited_at timestamptz null;
alter table public.households add column if not exists low_credit_notified_at timestamptz null;
alter table public.households add column if not exists preferred_language text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'households_preferred_language_check') then
    alter table public.households
      add constraint households_preferred_language_check
      check (preferred_language is null or preferred_language in ('en','es'));
  end if;
end $$;

create index if not exists households_referred_by_idx
  on public.households(referred_by_household_id) where referred_by_household_id is not null;

-- 4) reviews ------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  student_id uuid null references public.students(id) on delete set null,
  tutor_id uuid null references public.tutors(id) on delete set null,
  parent_email text null,
  token text not null unique,
  language text not null default 'en' check (language in ('en','es')),
  source text not null default 'auto' check (source in ('auto','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  requested_at timestamptz null,
  reminded_at timestamptz null,
  submitted_at timestamptz null,
  rating smallint null check (rating between 1 and 5),
  body text null,
  reviewer_name text null,
  reviewer_suburb text null,
  consent_public boolean not null default false,
  status text not null default 'requested'
    check (status in ('requested','submitted','approved','hidden','declined')),
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  google_clicked_at timestamptz null
);

create index if not exists reviews_org_status_idx
  on public.reviews(organization_id, status, created_at desc);
create index if not exists reviews_household_idx
  on public.reviews(household_id, created_at desc);

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

drop policy if exists reviews_select_owner on public.reviews;
create policy reviews_select_owner on public.reviews
  for select to authenticated
  using (public.is_org_owner(organization_id));

drop policy if exists reviews_update_owner on public.reviews;
create policy reviews_update_owner on public.reviews
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));
-- Families write through /review/[token] via the service role; no anon policy.

-- 5) shared rate limiter ------------------------------------------------------
create table if not exists public.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_buckets enable row level security;
-- No policies: only the service role, through rate_limit_hit(), touches it.

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_reset timestamptz;
  v_count integer;
begin
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'rate_limit_hit: window must be positive';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_reset := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.rate_limit_buckets (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update
    set count = public.rate_limit_buckets.count + 1
  returning count into v_count;

  -- Keep the table small: drop this key's windows that ended more than two windows ago.
  delete from public.rate_limit_buckets
   where key = p_key
     and window_start < now() - make_interval(secs => p_window_seconds * 2);

  if v_count > p_limit then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_reset - now())))::integer)
    );
  end if;
  return jsonb_build_object('allowed', true, 'remaining', p_limit - v_count, 'reset_at', v_reset);
end
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
revoke all on function public.rate_limit_hit(text, integer, integer) from anon;
revoke all on function public.rate_limit_hit(text, integer, integer) from authenticated;

commit;
