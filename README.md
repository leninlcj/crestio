# Crestio

**Crestio Tutoring**, a Sydney maths and physics tutoring agency, and the software it runs on. Next.js 14 (Pages Router) + Supabase, deployed to Vercel at [crestio.ai](https://crestio.ai).

- **crestio.ai** is the agency website: how it works, subjects, pricing, enquiry form (`/enquire`), tutor application (`/tutors/apply`).
- **crestio.ai/app** is the operations system the agency runs on: owner/tutor app, parent portal (`/parent`), student portal (`/student`), scheduling, session notes with AI polish, invoicing, Stripe Connect card payments.
- Public SaaS signup is closed (`/auth/signup` is a closed notice). Tutors and parents join by invitation.

Since 3 September 2026 (agency pivot, chunk 1). The plan and checklist live in `~/LENIN_OS/05_CRESTIO/00_START_HERE.md`.

## Agency pieces

| Thing | Where |
| --- | --- |
| Public facts (subjects, rate card, policies, FAQ, tutor pay bands) | `lib/agency.ts`, the single source of truth |
| Form validation | `lib/agencyForms.ts` (unit-tested in `tests/unit/lib/agency-forms.test.ts`) |
| Public forms | `POST /api/enquiries`, `POST /api/tutor-applications` (service role, IP rate-limited, honeypot) |
| Emails | `lib/emails/agency.ts`: family confirmation + owner alert, applicant confirmation + owner alert. Owner alerts go to `OWNER_ALERT_EMAIL` or the platform owner email. |
| Admin | `/app/leads` (enquiries: status pipeline, notes, assign tutor, convert to household + student) and `/app/leads/applications` (status pipeline, interview time, notes, accept → tutor invitation). Platform-owner only, via `resolveOwnerRequest`. |
| Tables | `enquiries`, `tutor_applications`, vetting columns on `tutors`: `supabase/migrations/20260903_agency_enquiries_applications.sql` |
| Redirects for old SaaS URLs | `next.config.js` |
| Legal documents (tutor agreement, code of conduct, child safe policy) | `lib/agencyLegal.ts`, versioned data; public at `/tutors/agreement`, `/child-safe`; tutors accept in-app via `components/TutorAgreementGate.tsx` → `POST /api/tutors/accept-agreement` |
| Concerns and complaints | `/report` → `POST /api/incidents` → `/app/leads/incidents` (child-safe scheme records) |
| Tutor vetting | `components/tutors/TutorVetting.tsx` on the tutor page: WWCC number/expiry/verified, ID, referees, training, insurance, ABN. `GET /api/tutors/me` links `tutors.auth_user_id` by email when the signup trigger did not. Weekly `/api/cron/wwcc-expiry` emails the owner. |
| Late cancellations | `POST /api/sessions/[id]/cancel` takes `cancelled_by` + `waive`; family cancellations inside 24h are flagged `late_cancellation` and stay billable (view `unbilled_completed_sessions`) |
| Agency org never plan-gated | `lib/agencyPlan.ts` (`effectivePlanTier`), used by Layout, SettingsTabs, team settings, `/api/tutors/invite`; `/api/billing/status` reports `billing_exempt` |
| Invoice disclosure (agency model) | `buildAgencyInvoiceNote()` in `lib/agencyInvoice.ts`: names the tutor and shows the tutor fee / service fee split from the sessions' pay rates. Printed on the PDF and the `/pay` page |
| Open Graph images | `pages/api/og.tsx` (edge runtime, `@vercel/og`, fonts in `assets/fonts/`). PNG, because social platforms do not render SVG previews |
| Legal pages layout | `components/agency/LegalArticle.tsx` (privacy, terms, cookies) |

## Design rules

Set by Lenin on 5 September 2026 and enforced by `tests/unit/site/design-rules.test.ts` and the e2e suite. The site must never look machine-made:

- No em dashes anywhere a person can read (site, app, emails, PDFs). Use a comma, colon, full stop or semicolon. An en dash (–) is only for numeric ranges and empty table cells.
- No pill-shaped buttons or tags (`.pill` is 4px radius; buttons are 8px). No purple, no gradients.
- No emoji as icons. Inline SVG only.
- No fake reviews, metrics, counters, ratings or testimonials. The reviews section stays empty until real families write real ones.
- No stock or generated photos, no cursor effects, no scroll-triggered animation.
- No marketing filler words (the test carries the list). Plain, specific sentences.
- Launch requires: custom domain (crestio.ai), favicon set (`/favicon.ico`, `/favicon.svg`, apple touch icon), privacy policy, terms, cookie policy, no "made with" badge.

## Environment variables

| Name | Where | Purpose | If missing |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Supabase project URL | Server routes return 500 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Supabase anon JWT | Auth broken |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Admin DB access for webhook, signup cleanup | Webhook cannot persist; tutor invite cannot upsert |
| `ANTHROPIC_API_KEY` | Vercel | AI features (assistant, polish, lesson plans) | Those endpoints 500 gracefully |
| `RESEND_API_KEY` | Vercel | Transactional email (invitations) | Invites still create DB row; email delivery marked failed |
| `STRIPE_SECRET_KEY` | Vercel | Checkout, billing portal | Billing endpoints 500 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Vercel | Client-side Stripe SDK (reserved; not used yet in this version) | No client-side Stripe actions |
| `STRIPE_PRICE_ID` | Vercel | Single $19/month price id | Checkout fails |
| `STRIPE_WEBHOOK_SECRET` | Vercel (added after first deploy) | Webhook signature verification | Webhook acks 200 but does not persist |
| `NEXT_PUBLIC_SITE_URL` | Vercel (optional) | Override base URL for Stripe return_url / invite links | Falls back to request host / `https://crestio.ai` |
| `OWNER_ALERT_EMAIL` | Vercel (optional) | Where new-enquiry and new-application alerts go | Falls back to the platform owner email in `lib/owner.ts` |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | Vercel (optional) | Sender identity and reply-to for all outbound email | `Crestio Tutoring <hello@crestio.ai>`; replies route to the owner |

Sanity-check which of these are loaded in the current environment:

```
curl https://crestio.ai/api/health
```

## Migration run order

All migrations run manually in Supabase SQL Editor. Order matters:

1. **Session 1**: organizations + organization_id columns + additive RLS.
2. **Session 2**: organization_members + is_org_member / is_org_owner helpers.
3. **Session 3**: tutors.auth_user_id, students.primary_tutor_id, sessions.tutor_user_id.
4. **Session 4**: membership-gated RLS replacement.
5. **Session 5**: tutor_invitations table + `handle_new_user` handles tutor-invitation tokens.
6. **Session 9**: assistant_conversations, assistant_messages, bump_conversation_timestamps trigger.
7. **Session 10**: subscription columns on organizations, billing_events table.
8. **Session 10.5**: `org_billing_ok(uuid)` helper, `cancel_at_period_end` column, billing-gated INSERT policies on students/sessions/invoices/lesson_plans.
9. Everything under `supabase/migrations/` in filename order; the latest are `20260903_agency_enquiries_applications.sql` (enquiries, tutor_applications, tutor vetting columns) and `20260904_agency_chunk2.sql` (agreement/vetting timestamps, late cancellations + view, incidents).

`supabase/schema.sql` is a consolidated reference: it does NOT reflect the production `handle_new_user` trigger (which carries the Session 5 tutor-invitation branch). See Known limitations.

## Stripe webhook setup (one-time)

1. Stripe Dashboard → Developers → Webhooks → **+ Add endpoint**.
2. URL: `https://crestio.ai/api/stripe/webhook`.
3. Events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`
4. Copy the signing secret (`whsec_...`) → set as `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.

Without the secret the endpoint returns 200 but does not persist; logs will show `STRIPE_WEBHOOK_SECRET not set`.

## Local development

```
npm install
npm run dev
```

Sign up at `http://localhost:3000/auth/signup` to bootstrap a user and org, the `handle_new_user` trigger auto-creates the organisation and the 7-day trial.

## Testing

```
npm run test       # vitest unit suite
npm run test:e2e   # playwright e2e (needs TEST_SUPABASE_* env)
npm run test:all   # both
```

Full conventions, env-var setup, and the production-database safety guard are in [tests/README.md](tests/README.md).

## Deployment

```
vercel --prod
```

**Strict rule: always use plain `vercel --prod`. Never `vercel --prebuilt`, never `--archive=tgz`.**

Why: in Session 8 the `--prebuilt --archive=tgz` path produced deployments that were tagged Production but did not swap the `crestio.ai` alias to the new deployment. This cost ~40 minutes of debugging stale edge cache before we worked out that plain `vercel --prod` was the only reliable way. It builds in Vercel's environment and auto-aliases.

**Confirm the alias**: the deploy output must contain a line like:

```
Aliased: https://crestio.ai [35s]
```

If that line is missing, the production domain has not flipped. Do not declare the deploy done.

## Production smoke tests

Run all of these after any material change before telling users to look:

1. **Health check**: `curl https://crestio.ai/api/health` returns `ok: true` and `stripe_configured: true, supabase_configured: true, anthropic_configured: true, resend_configured: true, stripe_webhook_configured: true`.
2. **New signup**: create a fresh account; dashboard loads; trial banner visible.
3. **Settings → Billing card**: owner sees "Free trial. N days left" + Subscribe. Tutor sees no Billing card.
4. **Stripe Checkout**: Subscribe → test card `4242 4242 4242 4242` → redirects back to `?billing=success`. Card flips within 2–6s to "Trialing, converts to $19/month on [date]" + Manage billing.
5. **Webhook events**: Supabase: `organizations` row has `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`. `billing_events` has the checkout + subscription.created rows.
6. **Manage billing** → opens Stripe billing portal.
7. **Cancel from portal** → webhook fires → BillingCard shows "Subscription ending, access until [date]".
8. **Tutor view**: sign in as `tme22759`; Settings has no Billing section; dashboard works.
9. **Paywall**: temporarily `UPDATE organizations SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = '...';` → new-session / new-student forms → paywall modal appears; AI endpoints return 402; dashboard (read-only) still works. Undo after.
10. **Rate limit**: manually fire >60 assistant messages / >20 lesson plans / >30 polishes in an hour → expect 429 with `retry_after_seconds`.
11. **Session expiry**: wait for auth token to expire (or `supabase.auth.signOut()` in another tab) → next API call → redirect to `/auth/signin?reason=session_expired` with a banner.
12. **Cancel flow script**: `npx tsx scripts/test-webhook-cancel-flow.ts` exercises cancel → un-cancel end-to-end. Requires `TEST_ORG_ID` env var; only runs in Stripe test mode.
13. **Error boundary**: temporarily throw in a page component → friendly fallback page renders + `[client-error]` shows in Vercel logs.

## Known limitations

This is the living backlog: every unresolved followup across sessions rolls forward here.

- **`handle_new_user` schema sync** *(flagged Session 10.5, still open)*: `supabase/schema.sql` doesn't capture the production tutor-invitation branch. I need to dump the production function and merge before anyone re-runs the schema.
- **Polish prompt duplication** *(flagged Session 10.5)*: the polish prompt lives in both `pages/api/polish-session-notes.ts` and `lib/assistantOrchestrator.ts`. Consolidate into `lib/polishCore.ts`.
- **Orphan `tool_use` rows** *(flagged Session 9)*: a client crash between persisting an assistant `tool_use` and the matching `tool_result` produces a conversation Anthropic will reject. No cleanup job yet.
- **Cross-tab assistant sync** *(flagged Session 9)*: messages persist to DB, but other open tabs don't live-update. Fetch-on-mount + focus only; no Postgres realtime subscription.
- **Single-org membership** *(flagged Session 10)*: `getMembershipForUser` returns the first org match. No multi-org per user.
- **Email changes don't sync to Stripe** *(flagged Session 10.5, by design)*: owners update billing email in the Stripe portal directly.
- **Billing gate is INSERT-only** *(flagged Session 10.5)*: a user whose trial lapsed can still edit existing rows. Matches the "reads and edits stay open" design, but flagged if you want to tighten.
- **In-memory rate limiter** *(new Session 10.6)*: `lib/rateLimit.ts` is per-Vercel-instance. Resets on cold start; not distributed. Graduate to Upstash Redis when users reliably cross the hourly caps.
- **Support email forwarding** *(new Session 10.6)*: all user-facing support links point at `leninlcj@gmail.com`. Move to `support@crestio.ai` once DNS/forwarding is set up. `TODO` comments mark the three places.
- **Mobile polish: deferred items** *(new Session 10.6)*: the payouts table got `overflow-x-auto`; assistant panel mobile got safe-area padding + 44×44 close button. Individual page audits (students/new, sessions/new long forms, invoices/[id]) were not exhaustively ticked off. Open a fresh bug if you spot layout issues.
- **Landing page: pending work** *(new Session 10.6)*: homepage still has no product screenshots. Pricing line + Support link were added, but a full rewrite with illustrations is a separate session.
- **Assets missing** *(new Session 10.6)*: `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png` / `og-image.png` exist. `favicon.png` (legacy PNG) was NOT present before and was not created, switched `_document.tsx` to use the existing `favicon.svg` and PNG-32. No new assets needed.

## Architecture highlights

- **Owner/tutor split**: `organizations` + `organization_members`; RLS helpers `is_org_member`, `is_org_owner`. Tutors see only their assigned students (`students.primary_tutor_id`) and their own sessions (`sessions.tutor_user_id`).
- **Parent portal**: separate `parents` table, `parent_student_links` linking, invitation flow via Resend.
- **Assistant**: conversation + message tables per user (strict user_id gating via RLS). Two tools: `log_session`, `polish_notes`. Claude Sonnet 4.6.
- **Billing**: $19/month AUD, 7-day trial. Stripe Checkout + Billing Portal (no in-app card entry). `org_billing_ok(uuid)` enforces paid-only INSERTs at the RLS layer.
- **Rate limiting**: per-user in-memory, 30/hr polish, 20/hr lesson plans, 60/hr assistant messages. Resets on Vercel cold start.
- **Error boundary**: top-level React boundary under `BillingProvider`. Client errors POST to `/api/log-client-error`; user sees a disclosure-based fallback with Refresh / Dashboard actions.
- **Session expiry**: 401 on any authenticated API call → redirect to `/auth/signin?reason=session_expired`; page shows a dismissible banner.
