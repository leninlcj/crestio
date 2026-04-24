import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const supabase_configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripe_configured = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID;
  const stripe_webhook_configured = !!process.env.STRIPE_WEBHOOK_SECRET;
  const anthropic_configured = !!process.env.ANTHROPIC_API_KEY;
  const resend_configured = !!process.env.RESEND_API_KEY;

  return res.status(200).json({
    ok: true,
    vercel_env: process.env.VERCEL_ENV ?? 'unknown',
    supabase_configured,
    stripe_configured,
    stripe_webhook_configured,
    anthropic_configured,
    resend_configured,
    time: new Date().toISOString(),
  });
}
