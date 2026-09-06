-- Trigger scenarios for supabase/migrations/20260906_agency_chunk5.sql.
-- Each block raises if the ledger does not behave as documented.
\set ON_ERROR_STOP on

create or replace function public._expect(p_label text, p_actual anyelement, p_expected anyelement)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '% : expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok  %  (%)', p_label, p_actual;
end $$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_org uuid;
  v_hh uuid;
  v_st uuid;
  v_hh2 uuid;
  v_inv uuid;
  v_block uuid;
  v_status text;
  v_total integer;
  v_applied integer;
begin
  insert into auth.users (id) values (v_user);
  insert into public.organizations (name, owner_user_id) values ('Crestio Tutoring', v_user) returning id into v_org;
  insert into public.households (organization_id, display_name) values (v_org, 'Nguyen family') returning id into v_hh;
  insert into public.students (organization_id, name, hourly_rate_cents, household_id) values (v_org, 'Amy Nguyen', 9500, v_hh) returning id into v_st;

  -- No credit: an issued invoice is untouched.
  insert into public.invoices (owner_id, organization_id, student_id, household_id, number, subtotal_cents, total_cents, status)
  values (v_user, v_org, null, v_hh, 'INV-0001', 9500, 9500, 'sent') returning id into v_inv;
  select status, total_cents, credit_applied_cents into v_status, v_total, v_applied from public.invoices where id = v_inv;
  perform public._expect('no credit: status', v_status, 'sent');
  perform public._expect('no credit: total', v_total, 9500);
  perform public._expect('no credit: applied', v_applied, 0);
  perform public._expect('no credit: balance', public.household_credit_balance(v_hh), 0);
  perform public._expect('payment token assigned', (select length(payment_token) >= 30 from public.invoices where id = v_inv), true);

  -- Prepaid block invoice: no credit consumed at issue, credit arrives when paid.
  insert into public.invoices (owner_id, organization_id, household_id, number, subtotal_cents, total_cents, status, is_prepaid_block, prepaid_face_value_cents, prepaid_hours)
  values (v_user, v_org, v_hh, 'INV-0002', 90250, 90250, 'sent', true, 95000, 10) returning id into v_block;
  perform public._expect('block issued: balance still 0', public.household_credit_balance(v_hh), 0);
  update public.invoices set status = 'paid', paid_at = now() where id = v_block;
  perform public._expect('block paid: balance is face value', public.household_credit_balance(v_hh), 95000);
  update public.invoices set status = 'paid' where id = v_block;   -- idempotent re-mark
  perform public._expect('block re-marked paid: no double credit', public.household_credit_balance(v_hh), 95000);
  perform public._expect('block: one purchase row', (select count(*)::int from public.household_credits where invoice_id = v_block and kind = 'purchase'), 1);

  -- Lesson invoice issued as 'sent' while credit covers it fully: paid from credit.
  insert into public.invoices (owner_id, organization_id, student_id, number, subtotal_cents, total_cents, status)
  values (v_user, v_org, v_st, 'INV-0003', 9500, 9500, 'sent') returning id into v_inv;
  select status, total_cents, credit_applied_cents into v_status, v_total, v_applied from public.invoices where id = v_inv;
  perform public._expect('covered: status paid', v_status, 'paid');
  perform public._expect('covered: total 0', v_total, 0);
  perform public._expect('covered: applied', v_applied, 9500);
  perform public._expect('covered: balance', public.household_credit_balance(v_hh), 85500);
  perform public._expect('covered: paid_at set', (select paid_at is not null from public.invoices where id = v_inv), true);

  -- Draft invoices leave credit alone until sent.
  insert into public.invoices (owner_id, organization_id, student_id, number, subtotal_cents, total_cents, status)
  values (v_user, v_org, v_st, 'INV-0004', 19000, 19000, 'draft') returning id into v_inv;
  perform public._expect('draft: balance untouched', public.household_credit_balance(v_hh), 85500);
  perform public._expect('draft: applied 0', (select credit_applied_cents from public.invoices where id = v_inv), 0);
  update public.invoices set status = 'sent', sent_at = now() where id = v_inv;
  select status, total_cents, credit_applied_cents into v_status, v_total, v_applied from public.invoices where id = v_inv;
  perform public._expect('draft sent: paid from credit', v_status, 'paid');
  perform public._expect('draft sent: applied', v_applied, 19000);
  perform public._expect('draft sent: balance', public.household_credit_balance(v_hh), 66500);

  -- Partial cover: credit runs out, remainder stays due.
  insert into public.household_credits (organization_id, household_id, kind, amount_cents, note)
  values (v_org, v_hh, 'adjustment', -60000, 'test: spend most of it');
  perform public._expect('adjusted balance', public.household_credit_balance(v_hh), 6500);
  insert into public.invoices (owner_id, organization_id, student_id, number, subtotal_cents, total_cents, status)
  values (v_user, v_org, v_st, 'INV-0005', 9500, 9500, 'sent') returning id into v_inv;
  select status, total_cents, credit_applied_cents into v_status, v_total, v_applied from public.invoices where id = v_inv;
  perform public._expect('partial: status stays sent', v_status, 'sent');
  perform public._expect('partial: total due', v_total, 3000);
  perform public._expect('partial: applied', v_applied, 6500);
  perform public._expect('partial: balance 0', public.household_credit_balance(v_hh), 0);

  -- Voiding the partially covered invoice returns its credit.
  update public.invoices set status = 'void', void_reason = 'test' where id = v_inv;
  perform public._expect('void: credit returned', public.household_credit_balance(v_hh), 6500);
  update public.invoices set status = 'void' where id = v_inv;
  perform public._expect('void twice: no double return', public.household_credit_balance(v_hh), 6500);

  -- Paying the remainder of a partially covered invoice does not touch the ledger.
  insert into public.invoices (owner_id, organization_id, student_id, number, subtotal_cents, total_cents, status)
  values (v_user, v_org, v_st, 'INV-0006', 9500, 9500, 'sent') returning id into v_inv;
  perform public._expect('second partial: balance 0', public.household_credit_balance(v_hh), 0);
  update public.invoices set status = 'paid', paid_at = now() where id = v_inv;
  perform public._expect('remainder paid: balance 0', public.household_credit_balance(v_hh), 0);

  -- A refunded prepaid block takes the credit back (balance can go negative).
  update public.invoices set status = 'sent', paid_at = null where id = v_block;
  perform public._expect('block refunded: reversal', public.household_credit_balance(v_hh), -95000);
  update public.invoices set status = 'sent' where id = v_block;
  perform public._expect('block refunded twice: single reversal', public.household_credit_balance(v_hh), -95000);

  -- Deleting an invoice cascades its ledger rows.
  delete from public.invoices where id = v_block;
  perform public._expect('block deleted: its rows gone', (select count(*)::int from public.household_credits where invoice_id = v_block), 0);

  -- Unrelated household: nothing leaks.
  insert into public.households (organization_id, display_name) values (v_org, 'Other family') returning id into v_hh2;
  perform public._expect('other household: balance 0', public.household_credit_balance(v_hh2), 0);

  -- Rate limiter: 3 per window, the 4th is refused.
  perform public._expect('rl 1', (public.rate_limit_hit('t:1', 3, 3600)->>'allowed')::boolean, true);
  perform public._expect('rl 2', (public.rate_limit_hit('t:1', 3, 3600)->>'allowed')::boolean, true);
  perform public._expect('rl 3', (public.rate_limit_hit('t:1', 3, 3600)->>'allowed')::boolean, true);
  perform public._expect('rl 4 refused', (public.rate_limit_hit('t:1', 3, 3600)->>'allowed')::boolean, false);
  perform public._expect('rl retry positive', (public.rate_limit_hit('t:1', 3, 3600)->>'retry_after_seconds')::int > 0, true);
  perform public._expect('rl other key ok', (public.rate_limit_hit('t:2', 3, 3600)->>'allowed')::boolean, true);

  -- Reviews table accepts a request and rejects a bad rating.
  insert into public.reviews (organization_id, household_id, token, requested_at) values (v_org, v_hh, 'tok_' || gen_random_uuid()::text, now());
  begin
    insert into public.reviews (organization_id, household_id, token, rating) values (v_org, v_hh, 'tok2_' || gen_random_uuid()::text, 7);
    raise exception 'rating 7 should have been rejected';
  exception when check_violation then
    raise notice 'ok  reviews: rating check enforced';
  end;

  -- Chunk 6: call requests. Email may be null when a phone exists; never both null.
  insert into public.enquiries (organization_id, parent_name, email, phone, year_level, preferred_contact, best_time)
  values (v_org, 'Priya Nair', null, '0400 000 000', 'Year 11', 'call', 'evening');
  perform public._expect('call request stored without email', (select count(*)::int from public.enquiries where parent_name = 'Priya Nair' and email is null), 1);
  perform public._expect('call_attempts defaults to 0', (select call_attempts from public.enquiries where parent_name = 'Priya Nair'), 0);
  begin
    insert into public.enquiries (organization_id, parent_name, email, phone, year_level) values (v_org, 'Nobody', null, null, 'Year 9');
    raise exception 'an enquiry with neither email nor phone should have been rejected';
  exception when check_violation then
    raise notice 'ok  enquiries: contact-present check enforced';
  end;
  begin
    insert into public.enquiries (organization_id, parent_name, email, year_level, preferred_contact) values (v_org, 'Bad Contact', 'x@example.com', 'Year 9', 'carrier_pigeon');
    raise exception 'preferred_contact outside email/call should have been rejected';
  exception when check_violation then
    raise notice 'ok  enquiries: preferred_contact check enforced';
  end;
  -- The old long form still works unchanged.
  insert into public.enquiries (organization_id, parent_name, email, year_level, subjects) values (v_org, 'Sam Lee', 'sam@example.com', 'Year 8', array['maths_7_10']);
  perform public._expect('long form default preferred_contact', (select preferred_contact from public.enquiries where parent_name = 'Sam Lee'), 'email');

  raise notice 'ALL SCENARIOS PASSED';
end $$;
