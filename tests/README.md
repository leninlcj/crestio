# Tests

Two suites: **Vitest** for unit tests, **Playwright** for end-to-end browser tests.

## Running locally

```bash
# Unit tests (fast — no DB, no network)
npm run test
npm run test:watch
npm run test:ui

# End-to-end tests (needs a running app + a test Supabase project)
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:debug   # Playwright Inspector
```

By default the e2e runner expects the dev server on `http://localhost:3000`. Override with:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e
```

In CI, the Playwright config builds and serves the production bundle automatically (`npm run build && npm start`).

## Environment variables

E2E specs that touch the database read these:

| Var                            | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `TEST_SUPABASE_URL`            | Supabase URL for a **dedicated test project**.   |
| `TEST_SUPABASE_ANON_KEY`       | Anon key for the test project.                   |
| `TEST_SUPABASE_SERVICE_ROLE`   | Service-role key for seed/cleanup.               |
| `STRIPE_TEST_SECRET_KEY`       | Stripe test-mode secret (`sk_test_...`).         |
| `ANTHROPIC_MOCK`               | Set to `1` to skip real Anthropic calls in CI.   |

If any e2e env is missing, the affected spec **skips** with a clear reason rather than failing — so CI without the secrets configured will still go green.

## Never run e2e against production

`tests/e2e/fixtures/seed.ts` has a hard guard at the top:

- Throws if `TEST_SUPABASE_URL` is missing.
- Throws if `TEST_SUPABASE_URL === NEXT_PUBLIC_SUPABASE_URL`.
- Throws if `TEST_SUPABASE_URL` contains any project ref listed in `KNOWN_PROD_REFS`.

Update `KNOWN_PROD_REFS` whenever a new prod Supabase project is provisioned. The seed prefix every row it inserts with `e2etest_<unix-ms>_` so cleanup can wipe it via a `LIKE 'e2etest_%'` match — but the prefix only saves you if you're already in the test project.

## Folder layout

```
tests/
  setup.ts                      # vitest setup: jest-dom, next/* mocks, matchMedia
  unit/
    lib/                        # pure-helper tests (recurrence, csv, fees, …)
    server/                     # server actions / API handlers (when added)
    components/                 # RTL component tests (when added)
  e2e/
    fixtures/
      seed.ts                   # idempotent seed + cleanup
      auth-helpers.ts           # signInAsSeededUser, env probe
    auth.spec.ts
    onboarding.spec.ts
    session-log.spec.ts
    csv-import.spec.ts
    invoice-pay.spec.ts
  mocks/
    supabase.ts                 # createMockSupabase() — chainable + filterable
    stripe.ts                   # createMockStripe() with PaymentIntent/Account/webhooks
    anthropic.ts                # createMockAnthropic() — deterministic polish text
```

## Adding a new test

**Unit test for a pure helper (preferred)**

1. Write the helper as a side-effect-free function in `lib/<thing>.ts`.
2. Add `tests/unit/lib/<thing>.test.ts` and import via the `@/` alias.
3. Run `npm run test:watch`.

If the logic you want to test lives inside an API route, **extract** the pure part into `lib/` first. Two examples already in the tree:

- `buildPolishPrompt` extracted from `pages/api/polish-session-notes.ts`
- `verifyStripeWebhook` extracted from `pages/api/stripe/webhook.ts`

**E2E test that touches the DB**

1. Call `seed()` at the top of the test (the helper handles auth user creation).
2. Use `signInAsSeededUser(page, email, password)` to set a Supabase session in `localStorage`.
3. Drive the UI with Playwright as usual.
4. Add `cleanup()` in `test.afterAll` so the test doesn't leave debris between runs.

Use `data-testid="..."` selectors when you can — they survive copy changes that locale or marketing tweaks would break.

## Mock conventions

- **Supabase mock** (`createMockSupabase`) is filterable: `.from(t).select(c).eq(k, v).single()` reads from an in-memory `tables` object you pass in. Inserts and updates mutate the same object, so a follow-up read sees the write.
- **Stripe mock** (`createMockStripe`) returns sensible default shapes. To test signature-verification failures, call `mock.__setConstructEventError(new Error('...'))`.
- **Anthropic mock** (`createMockAnthropic`) returns a deterministic polished string by default; override per test with `respondWith` or `echoPrompt`.

## Known gaps

- **JPY zero-decimal currency** in `calculateFees`: not yet supported. The skipped test in `tests/unit/lib/stripe-fee.test.ts` flags the gap. Un-skip when `calculateFees` grows a `currency` parameter.
- **Tutor voice samples** in `buildPolishPrompt`: the brief mentioned them, but the source doesn't yet generate sample-aware prompts. Add the sample list to `PolishPromptInput` and the prompt builder when the feature ships, and add a test for "applies tutor voice samples when present" alongside.
- **Real Stripe checkout webhook round-trip** in `invoice-pay.spec.ts`: the spec verifies the DB-side payout split arithmetic but doesn't actually fire a Stripe-signed webhook against the dev server. Add this once the test environment has a Stripe webhook tunnel (e.g., `stripe listen`) wired up.
