// Signed tokens for Stripe Connect onboarding refresh/return URLs.
//
// Stripe redirects the browser to refresh_url / return_url; we can't rely on
// a Supabase session being available in those redirects. A short-lived signed
// token in the query string lets us look up the org without exposing the
// connect account id.

import crypto from 'crypto';

function getSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — cannot sign Connect tokens.');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signConnectLinkToken(orgId: string, ttlSeconds = 60 * 60): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${orgId}:${exp}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(sig)}`;
}

export function verifyConnectLinkToken(token: string): { orgId: string } | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let payload: string;
  try {
    payload = fromB64url(body).toString('utf8');
  } catch {
    return null;
  }
  const [orgId, expStr] = payload.split(':');
  if (!orgId || !expStr) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest();
  let provided: Buffer;
  try {
    provided = fromB64url(sig);
  } catch {
    return null;
  }
  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;
  return { orgId };
}
