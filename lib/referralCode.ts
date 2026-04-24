// Referral code generation + share-link helpers.
// Format: CRESTIO-XXXXYYYY (8 chars after the prefix). Ambiguous chars removed
// so codes are easy to read, type, and dictate over the phone.

import type { SupabaseClient } from '@supabase/supabase-js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_LEN = 8;
const PREFIX = 'CRESTIO-';

function randomCode(): string {
  let out = PREFIX;
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function normaliseCode(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().toUpperCase();
}

export function isWellFormedCode(code: string): boolean {
  if (!code.startsWith(PREFIX)) return false;
  const suffix = code.slice(PREFIX.length);
  if (suffix.length !== CODE_LEN) return false;
  for (const c of suffix) if (!ALPHABET.includes(c)) return false;
  return true;
}

// Insert a new code for this user, retrying on the (extremely rare) collision.
// Uses service-role so we can check uniqueness fast without hitting RLS.
export async function ensureReferralCodeForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  // Already has one?
  const { data: existing } = await admin
    .from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomCode();
    const { error } = await admin.from('referral_codes').insert({
      user_id: userId,
      code: candidate,
    });
    if (!error) return candidate;
    // Postgres unique_violation = 23505
    if ((error as any).code !== '23505') throw error;
  }
  throw new Error('Failed to generate a unique referral code after 5 attempts.');
}

export function buildShareLink(code: string, origin?: string): string {
  const base = origin ?? 'https://crestio.ai';
  return `${base}/?ref=${encodeURIComponent(code)}`;
}
