/* eslint-disable no-console */
/**
 * create-payment-links.ts
 *
 * Idempotently creates a Stripe Payment Link for each (plan × interval) pair
 * that we sell to self-serve prospects (Solo + Team, monthly + annual).
 *
 * Idempotency: each link carries metadata.crestio_lookup_key. The script
 * lists existing payment_links and reuses any that already match. If a price
 * change makes an existing link stale, deactivate it manually in the
 * dashboard and re-run.
 *
 * Mode (test vs live) is auto-detected from STRIPE_SECRET_KEY's prefix.
 *
 * After completion, the script rewrites lib/stripe/payment-links.ts between
 * the BEGIN/END payment-links sentinels with the resulting URLs.
 *
 * ===========================================================================
 *  EXACT COMMAND TO RUN
 *  -----------------------------------------------------------------------
 *  Test mode:
 *    STRIPE_SECRET_KEY=sk_test_... \
 *    STRIPE_PRICE_SOLO_MONTHLY=price_... \
 *    STRIPE_PRICE_SOLO_ANNUAL=price_... \
 *    STRIPE_PRICE_TEAM_MONTHLY=price_... \
 *    STRIPE_PRICE_TEAM_ANNUAL=price_... \
 *    npx tsx scripts/create-payment-links.ts
 *
 *  Live mode: same command, but with sk_live_... and the live price IDs.
 *
 *  Optional:
 *    STRIPE_AUTOMATIC_TAX=true     # enables Stripe Tax on each link
 *                                  # (requires Tax to be configured on the account)
 *
 *  Pre-flight on the Stripe account (Dashboard → Settings → Public details):
 *    - Set Terms of Service URL  → https://crestio.ai/terms
 *    - Set Privacy Policy URL    → https://crestio.ai/privacy
 *    Both are required because each link sets consent_collection.terms_of_service='required'.
 * ===========================================================================
 */

import Stripe from 'stripe';
import { promises as fs } from 'fs';
import path from 'path';

type Mode = 'test' | 'live';
type Tier = 'solo' | 'team';
type Interval = 'monthly' | 'annual';

const TIERS: Tier[] = ['solo', 'team'];
const INTERVALS: Interval[] = ['monthly', 'annual'];
const SUCCESS_URL = 'https://crestio.ai/welcome?session_id={CHECKOUT_SESSION_ID}';

const PRICE_ENV: Record<Tier, Record<Interval, string>> = {
  solo: { monthly: 'STRIPE_PRICE_SOLO_MONTHLY', annual: 'STRIPE_PRICE_SOLO_ANNUAL' },
  team: { monthly: 'STRIPE_PRICE_TEAM_MONTHLY', annual: 'STRIPE_PRICE_TEAM_ANNUAL' },
};

function detectMode(secretKey: string): Mode {
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  throw new Error('STRIPE_SECRET_KEY must start with sk_test_ or sk_live_');
}

function lookupKey(tier: Tier, interval: Interval, mode: Mode): string {
  return `crestio_pl_${tier}_${interval}_${mode}`;
}

async function findExistingLink(
  stripe: Stripe,
  key: string,
): Promise<Stripe.PaymentLink | null> {
  // Up to 100 active links per page. Project will never approach this.
  for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
    if (link.metadata?.crestio_lookup_key === key) return link;
  }
  return null;
}

async function createOrReuseLink(
  stripe: Stripe,
  args: { tier: Tier; interval: Interval; mode: Mode; priceId: string; autoTax: boolean },
): Promise<{ url: string; id: string; reused: boolean }> {
  const { tier, interval, mode, priceId, autoTax } = args;
  const key = lookupKey(tier, interval, mode);

  const existing = await findExistingLink(stripe, key);
  if (existing) {
    return { url: existing.url, id: existing.id, reused: true };
  }

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    automatic_tax: { enabled: autoTax },
    metadata: {
      plan_id: tier,
      plan_tier: tier,
      billing_interval: interval,
      source: 'payment_link',
      crestio_lookup_key: key,
    },
    subscription_data: {
      metadata: {
        plan_id: tier,
        plan_tier: tier,
        billing_interval: interval,
        source: 'payment_link',
      },
    },
    consent_collection: {
      terms_of_service: 'required',
      promotions: 'auto',
    },
    after_completion: {
      type: 'redirect',
      redirect: { url: SUCCESS_URL },
    },
  });

  return { url: link.url, id: link.id, reused: false };
}

async function rewriteConfig(
  results: Record<Mode, Record<Tier, Record<Interval, string>>>,
  mode: Mode,
): Promise<void> {
  const filePath = path.resolve(process.cwd(), 'lib/stripe/payment-links.ts');
  const original = await fs.readFile(filePath, 'utf8');

  const beginRe = /\/\/ --- BEGIN payment-links \(auto-generated; do not hand-edit\) ---/;
  const endRe = /\/\/ --- END payment-links ---/;
  const beginMatch = beginRe.exec(original);
  const endMatch = endRe.exec(original);
  if (!beginMatch || !endMatch || endMatch.index < beginMatch.index) {
    throw new Error('payment-links.ts sentinel block not found — script cannot rewrite safely.');
  }

  // Read the current other-mode values out of the file so we don't clobber
  // them when the script runs in only one mode.
  const otherMode: Mode = mode === 'test' ? 'live' : 'test';
  const otherBlockMatch = new RegExp(
    `${otherMode}:\\s*\\{[^}]*solo:\\s*\\{\\s*monthly:\\s*'([^']*)',\\s*annual:\\s*'([^']*)'\\s*\\},[^}]*team:\\s*\\{\\s*monthly:\\s*'([^']*)',\\s*annual:\\s*'([^']*)'\\s*\\},?\\s*\\}`,
    'm',
  ).exec(original);
  const otherSoloMonthly = otherBlockMatch?.[1] ?? '';
  const otherSoloAnnual = otherBlockMatch?.[2] ?? '';
  const otherTeamMonthly = otherBlockMatch?.[3] ?? '';
  const otherTeamAnnual = otherBlockMatch?.[4] ?? '';

  const filled = (m: Mode) => results[m] ?? {
    solo: { monthly: '', annual: '' },
    team: { monthly: '', annual: '' },
  };

  const testBlock = mode === 'test' ? filled('test') : {
    solo: { monthly: otherSoloMonthly, annual: otherSoloAnnual },
    team: { monthly: otherTeamMonthly, annual: otherTeamAnnual },
  };
  const liveBlock = mode === 'live' ? filled('live') : {
    solo: { monthly: otherSoloMonthly, annual: otherSoloAnnual },
    team: { monthly: otherTeamMonthly, annual: otherTeamAnnual },
  };

  const replacement =
    `// --- BEGIN payment-links (auto-generated; do not hand-edit) ---
const PAYMENT_LINKS_RAW: Record<StripeMode, ModeConfig> = {
  test: {
    solo: { monthly: '${testBlock.solo.monthly}', annual: '${testBlock.solo.annual}' },
    team: { monthly: '${testBlock.team.monthly}', annual: '${testBlock.team.annual}' },
  },
  live: {
    solo: { monthly: '${liveBlock.solo.monthly}', annual: '${liveBlock.solo.annual}' },
    team: { monthly: '${liveBlock.team.monthly}', annual: '${liveBlock.team.annual}' },
  },
};
// --- END payment-links ---`;

  const updated =
    original.slice(0, beginMatch.index) +
    replacement +
    original.slice(endMatch.index + endMatch[0].length);

  await fs.writeFile(filePath, updated, 'utf8');
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY not set. See the comment block at the top of this script.');
    process.exit(1);
  }

  const mode = detectMode(secretKey);
  const autoTax = process.env.STRIPE_AUTOMATIC_TAX === 'true';

  console.log(`mode=${mode} automatic_tax=${autoTax}`);

  const stripe = new Stripe(secretKey, {
    apiVersion: '2024-06-20' as any,
    appInfo: { name: 'Crestio create-payment-links', version: '1.0.0' },
  });

  const results: Record<Mode, Record<Tier, Record<Interval, string>>> = {
    test: { solo: { monthly: '', annual: '' }, team: { monthly: '', annual: '' } },
    live: { solo: { monthly: '', annual: '' }, team: { monthly: '', annual: '' } },
  };

  for (const tier of TIERS) {
    for (const interval of INTERVALS) {
      const envVar = PRICE_ENV[tier][interval];
      const priceId = process.env[envVar];
      if (!priceId) {
        console.error(`  ${tier}/${interval}: ${envVar} not set — skipping.`);
        continue;
      }
      try {
        const { url, id, reused } = await createOrReuseLink(stripe, {
          tier, interval, mode, priceId, autoTax,
        });
        results[mode][tier][interval] = url;
        console.log(`  ${tier}/${interval}: ${reused ? 'reused' : 'created'} ${id} → ${url}`);
      } catch (e: any) {
        console.error(`  ${tier}/${interval}: failed —`, e?.message ?? e);
      }
    }
  }

  await rewriteConfig(results, mode);
  console.log(`\nWrote URLs to lib/stripe/payment-links.ts (mode=${mode}).`);
  console.log('Review the diff and commit.');
}

main().catch((e) => { console.error(e); process.exit(1); });
