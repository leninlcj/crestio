# 14F — Stripe Connect parent payments

## Goal

Parents pay invoices directly with their card. Funds land in the tutor's bank
account in ~2 business days. Crestio takes a 1% application fee on top of
Stripe's processing fee. Parents do not need a Crestio account — they can pay
via a public, unguessable invoice link.

## Architecture

- **Stripe Connect Express**, ONE connected account per organization. The org
  owner completes Stripe's KYC. The internal tutor-payout system (org pays its
  own tutors) is unrelated and unchanged.
- **Direct charges** — the PaymentIntent is created on the connected account
  and the platform extracts an `application_fee_amount`. Tutor is the merchant
  of record on the customer's statement.
- **Public payment page** at `/pay/[token]` — no auth required. The token is
  a random `crypto.randomBytes(24).toString('base64url')` written to
  `invoices.payment_token`.
- **Multi-invoice payment** — parents can select multiple unpaid invoices for
  one tutor and pay them in a single charge:
  - On the public page, "sibling" invoices for the same household/student are
    surfaced as checkboxes.
  - In the parent portal at `/parent/pay`, every unpaid invoice is shown as a
    cart, grouped by tutor; a parent can never combine invoices across orgs.
- **Two webhook endpoints** —
  - `/api/stripe/webhook` (existing) — platform subscription events. Unchanged.
  - `/api/stripe/connect-webhook` (new) — Connect events scoped to connected
    accounts, with a separate `STRIPE_CONNECT_WEBHOOK_SECRET`.

## Fee math

```
applicationFee = max(50, ceil(amount * 0.01))     // 1% with $0.50 floor (in cents)
```

Stripe's processing fee (e.g. 2.9% + 30¢ for AU domestic cards) is collected
by Stripe from the connected account's balance independently and is **not**
part of `application_fee_amount`. The connected account's net per charge is
roughly:

```
net_to_org = amount - application_fee - stripe_processing_fee
```

The webhook records all three (`platform_fee_amount`, `stripe_fee_amount`,
`net_amount_to_org`) per invoice, splitting the totals proportionally when a
single charge covers multiple invoices.

## Schema (migration `20260427_14f.sql`)

- `organizations` — Connect account id, capability flags, requirements, country.
- `invoices` — `payment_token`, `stripe_payment_intent_id`,
  `payment_method_brand/last4`, `platform_fee_amount`, `stripe_fee_amount`,
  `net_amount_to_org`. Backfills `payment_token` for every existing row.
- `parents` — `stripe_customer_id` + `stripe_customer_org_id` (Customer lives
  on the connected account, NOT the platform; saved cards are scoped to one
  tutor's org).
- `charges` (new) — one row per PaymentIntent. RLS lets org members read; all
  writes go through the service role (webhook + payment routes).

## Payment flow

1. Parent opens `/pay/<token>` (the link is on the invoice email, the org's
   invoice page, or the parent portal).
2. The page calls `GET /api/pay/<token>` which returns org name, invoice
   details, and any sibling unpaid invoices for the same household/student.
3. Parent (optionally) provides email + name, ticks "save card", and clicks
   Continue. The page calls `POST /api/pay/<token>/intent` which creates a
   PaymentIntent on the connected account with `application_fee_amount` set.
4. Stripe.js loads with `stripeAccount` set to the connected account id; the
   PaymentElement mounts and lets the parent enter card details (Apple Pay /
   Google Pay are auto-included by `automatic_payment_methods`).
5. `stripe.confirmPayment` redirects to `/pay/<token>/success` on the front
   end. The webhook (`payment_intent.succeeded` on the Connect endpoint) is
   the source of truth — it updates the invoice rows, upserts the `charges`
   row, and emails a receipt.

### Idempotency

- PaymentIntent creation uses an idempotency key derived from
  `(orgId, sorted invoiceIds, total, parentEmail, savePaymentMethod)`. Repeat
  POSTs for the same cart return the same PI.
- `charges.stripe_payment_intent_id` has a unique constraint; webhook handlers
  upsert into it, so re-deliveries are safe.
- Refund creation uses `refund_<chargeId>_<amount|full>` as idempotency key.

## Refund flow

1. Org owner opens an invoice marked **paid** and clicks **Refund**.
2. The UI lets them refund full or a partial amount with a free-text reason.
3. `POST /api/invoices/[id]/refund` calls `stripe.refunds.create` on the
   connected account with `reverse_transfer: true` and
   `refund_application_fee: true` (Crestio's 1% is reversed).
4. The `charge.refunded` Connect webhook updates `charges.refunded_amount` /
   `status`, flips the invoice back to `sent`, and emails the parent a refund
   confirmation.

Stripe's processing fee is **not** refunded — that's a Stripe policy, not
something we can reverse.

## Webhook events handled (`/api/stripe/connect-webhook`)

| Event | Effect |
| --- | --- |
| `account.updated` | Mirror capabilities + requirements onto `organizations`. Sets `stripe_connect_status` to one of `pending` / `restricted` / `active` / `disabled`. |
| `payment_intent.succeeded` | Mark all linked invoices paid, persist fee breakdown, upsert `charges`, send parent receipt email. |
| `payment_intent.payment_failed` | Upsert `charges` with `failure_code` / `failure_message`, email the tutor (real failures only — 3DS-pending doesn't fire this). |
| `charge.refunded` | Update `charges.refunded_amount` + status, flip the invoice back to `sent`, email the parent. |
| `payout.paid` / `payout.failed` | Logged. No DB write. |

All handlers are idempotent via the `charges.stripe_payment_intent_id` unique
constraint and the `billing_events.stripe_event_id` audit log.

## Test cards

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0027 6000 3184` | 3DS challenge required |
| `4000 0000 0000 9995` | Insufficient funds (declines) |
| `4000 0000 0000 0002` | Generic decline |

Use any future expiry, any CVC, any postcode.

## Local development

- The Connect Webhook is a separate endpoint. To test locally, run two `stripe
  listen` processes:
  ```
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  stripe listen --forward-connect-to localhost:3000/api/stripe/connect-webhook
  ```
- Set `STRIPE_CONNECT_WEBHOOK_SECRET` to the second listener's `whsec_…` value.
- The platform secret stays in `STRIPE_WEBHOOK_SECRET`.

## Note on `stripe_connect_account_id`

Direct charges require the client to know the connected account id (it's
passed to `loadStripe(pk, { stripeAccount })`). We only return it from the
PaymentIntent creation endpoint — never as a generic select on
`organizations`. Treat it as routing information, not a credential.

## Deferred (not in 14F)

- Subscriptions for recurring sessions
- Disputes / chargebacks UI (status is logged but not exposed)
- Stripe Tax
- ACH / BSB direct debit
- Per-tutor Connect accounts on Team plans
- Custom statement descriptors
