import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  cached = new Stripe(key, {
    apiVersion: '2024-06-20' as any,
    appInfo: { name: 'Crestio', version: '1.0.0' },
  });
  return cached;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID;
}

export function getBaseUrl(req?: { headers: { host?: string } }): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const host = req?.headers?.host;
  if (host) {
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }
  return 'https://crestio.ai';
}
