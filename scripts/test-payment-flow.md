# Payment Link flow — manual test script

End-to-end verification of the Stripe Payment Link → magic-link onboarding
flow shipped in Session 14A.

## Prerequisites

1. **Stripe in test mode**: `STRIPE_SECRET_KEY` is set to a `sk_test_...` key
   in `.env.local`.
2. **Webhook secret**: `STRIPE_WEBHOOK_SECRET` set in `.env.local`. For local
   testing, run `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   and copy the `whsec_...` it prints.
3. **Resend**: `RESEND_API_KEY` set, and `from: hello@crestio.ai` is a verified
   sender on the Resend domain. Without this, the welcome email will log
   `RESEND_API_KEY not configured` and the rest of the flow still completes.
4. **Supabase service role**: `SUPABASE_SERVICE_ROLE_KEY` set so the webhook
   can create users + update orgs.
5. **Payment Links exist**: run `scripts/create-payment-links.ts` (see comment
   block at the top of that file) so `lib/stripe/payment-links.ts` has
   non-empty URLs in the `test` block.
6. `NEXT_PUBLIC_STRIPE_LINK_MODE=test` (or unset — defaults to test).

## Running the dev server

```bash
npm run dev
# in a second terminal:
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Walkthrough — happy path (new customer)

1. Open `http://localhost:3000/#pricing`.
2. Toggle to **Annual**, then click the small **Skip the trial — pay now →**
   link under the **Solo** card. Confirm it goes to a `https://buy.stripe.com/...`
   URL with the right plan.
3. On the Stripe-hosted Checkout:
   - Email: a unique address you can read mail at, e.g. `lenin+pl-test-1@crestio.ai`.
   - Card: `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
   - Tick the **Terms of service** checkbox if it appears.
   - Submit.
4. Stripe redirects to `http://localhost:3000/welcome?session_id=cs_test_...`.
5. **Expected on /welcome**:
   - Heading: "Welcome to Crestio."
   - Subheading: "We've sent a sign-in link to lenin+pl-test-1@crestio.ai."
   - Plan line: "Solo · billed annual"
   - **Resend the email** button is enabled.
6. **Expected webhook events** (visible in `stripe listen` output):
   - `checkout.session.completed` — handler logs:
     - `[stripe/webhook] payment_link provisioning { session, email_domain, plan, interval, customer }`
     - `[stripe/webhook] payment_link org updated { session, org, is_new_user: true }`
     - `[stripe/webhook] welcome email { success: true, id }`
   - `customer.subscription.created` — existing branch syncs sub to org.
   - `invoice.paid` and/or `invoice.payment_succeeded` — existing branch.
7. **Expected DB state** (Supabase SQL editor or psql):
   ```sql
   select id, email from auth.users where email = 'lenin+pl-test-1@crestio.ai';
   -- one row, just-created
   ```
   ```sql
   select id, name, owner_user_id, stripe_customer_id, stripe_subscription_id,
          plan_tier, billing_interval, subscription_status
   from public.organizations
   where owner_user_id = (select id from auth.users where email = 'lenin+pl-test-1@crestio.ai');
   -- name auto-derived ("lenin+pl-test-1 Tutoring"); stripe_*_id populated;
   -- plan_tier='solo'; billing_interval='annual'; subscription_status='active'
   ```
   ```sql
   select * from public.organization_members where user_id =
     (select id from auth.users where email = 'lenin+pl-test-1@crestio.ai');
   -- one row, role='owner'
   ```
   ```sql
   select stripe_event_id, event_type from public.billing_events
   where stripe_event_id in ('evt_...checkout', 'evt_...sub_created') order by processed_at desc;
   -- both events recorded once each (idempotency)
   ```
8. **Expected email**: `Welcome to Crestio — sign in to get started`
   in the inbox. Click the **Sign in to Crestio** button → lands at `/app`,
   logged in.

## Walkthrough — unpaid / declined

1. Repeat Steps 1–2 above with a different email.
2. On Stripe Checkout, use card `4000 0000 0000 0002` (generic decline).
3. Stripe stays on its hosted page with an error.
4. To exercise the unpaid state of `/welcome`, manually navigate to
   `http://localhost:3000/welcome?session_id=cs_test_<an_unpaid_session>`.
5. **Expected**: heading "Your payment didn't complete." with **Back to pricing**.

## Walkthrough — missing session_id

1. Open `http://localhost:3000/welcome` (no query string).
2. **Expected**: heading "We can't find that checkout." with **See plans**.

## Walkthrough — invalid session_id

1. Open `http://localhost:3000/welcome?session_id=cs_test_invalid`.
2. **Expected**: heading "Something went wrong." (404 from `get-checkout-session`).

## Walkthrough — already signed in

1. Sign in normally to a Crestio account.
2. In another tab, go through the Payment Link checkout with **the same email**
   (Stripe will reuse the customer if email matches a Stripe customer).
3. After payment, redirect lands on `/welcome`.
4. **Expected**: heading "You're already signed in." → auto-redirects to `/app`
   after ~1.2s.

## Walkthrough — resend rate limit

1. From the paid `/welcome` state, click **Resend the email** four times.
2. **Expected**: third send succeeds; fourth shows "Already sent recently. Try
   again in N minutes." (limit is 3 / hour / IP+session.)

## Customer Portal verification

1. After the happy path, sign in via the magic link.
2. Go to `/app/settings/billing`.
3. Click **Manage**.
4. **Expected**: redirects to a Stripe-hosted Customer Portal at
   `billing.stripe.com/...` showing the active Solo annual subscription.
5. Cancel inside the portal → returns to `/app/settings`. Confirm the org's
   `cancel_at_period_end` flips to `true` via the existing
   `customer.subscription.updated` webhook handler.

## Cleanup

```sql
delete from auth.users where email = 'lenin+pl-test-1@crestio.ai';
-- ON DELETE CASCADE wipes the org, profile, membership.
```

In Stripe test mode, cancel any test subscriptions created by the run.

## Failure modes to watch for

- `[stripe/webhook] payment_link missing plan metadata` — the Payment Link
  was created without `plan_tier`/`billing_interval` metadata. Re-run
  `scripts/create-payment-links.ts`.
- `ensureUserAndMagicLink failed { error: 'User exists but could not be located' }`
  — pagination cap (25 × 200 = 5000 users) hit. Inspect Supabase auth users
  and adjust the cap if you've outgrown it.
- `welcome email { success: false }` — Resend domain or API key issue. Check
  Resend dashboard logs.
- `/welcome` shows "Something went wrong" — usually `STRIPE_SECRET_KEY` not
  loaded by the dev server. Restart `npm run dev` after editing `.env.local`.
