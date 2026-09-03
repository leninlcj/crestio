import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { renderWeeklyDigestHTML } from '../../../lib/emails/weeklyDigest';
import { getBaseUrl } from '../../../lib/stripe';

// Vercel Cron — runs once a day (08:00 UTC). We send the digest only when it's
// 18:00-18:59 in the tutor's local timezone (column profiles.timezone or
// org timezone). Dedupe via a per-week marker on the tutor's profile so
// re-runs (or DST edges) don't double-send.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Cron not configured.' });
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Find profiles where the local-time hour is 18 right now AND it's Sunday.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name, timezone, organization_id, weekly_digest_opt_out, last_weekly_digest_sent_for_week')
    .eq('weekly_digest_opt_out', false);

  const baseUrl = getBaseUrl(req);
  const resend = resendKey ? new Resend(resendKey) : null;
  const now = Date.now();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of (profiles ?? []) as any[]) {
    if (!p.email) { skipped++; continue; }
    const tz = p.timezone || 'Australia/Sydney';
    let local: Date;
    try {
      local = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    } catch {
      local = new Date();
    }
    if (local.getDay() !== 0) { skipped++; continue; }      // not Sunday
    // Daily cron (Vercel Hobby) fires once at 08:00 UTC = 18:00 AEST / 19:00 AEDT;
    // accept a 17–19 local window so both halves of the year work.
    if (local.getHours() < 17 || local.getHours() > 19) { skipped++; continue; }

    // Week tag: ISO year-week.
    const weekTag = isoWeekTag(local);
    if (p.last_weekly_digest_sent_for_week === weekTag) { skipped++; continue; }

    try {
      const data = await assembleDigest(admin, p, baseUrl);
      const { subject, html, text } = renderWeeklyDigestHTML(data);
      if (resend) {
        await resend.emails.send({
          from: 'Crestio <hello@crestio.ai>',
          to: [p.email],
          subject,
          html,
          text,
        });
      } else {
        console.warn('[weekly-digest] RESEND_API_KEY missing; would have sent to', p.email);
      }
      // Mark sent.
      await admin
        .from('profiles')
        .update({ last_weekly_digest_sent_for_week: weekTag })
        .eq('id', p.id);
      sent++;
    } catch (err) {
      errors.push(`${p.email}: ${(err as Error).message}`);
    }
  }

  return res.status(200).json({ ok: true, sent, skipped, errors, now: new Date(now).toISOString() });
}

async function assembleDigest(admin: any, profile: any, baseUrl: string) {
  const tutorId = profile.id;
  const orgId = profile.organization_id;
  const firstName = (profile.full_name ?? '').trim().split(/\s+/)[0] || 'there';

  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  const dow = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - (dow === 0 ? 6 : dow - 1));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const { data: sessions } = await admin
    .from('sessions')
    .select('scheduled_at, duration_minutes, status, charge_rate_cents')
    .eq('tutor_user_id', tutorId)
    .gte('scheduled_at', startOfWeek.toISOString())
    .lt('scheduled_at', endOfWeek.toISOString());

  const completed = (sessions ?? []).filter((s: any) => s.status === 'completed');
  const sessions_count = completed.length;
  const totalMin = completed.reduce((acc: number, s: any) => acc + (s.duration_minutes ?? 0), 0);
  const hours = Math.round(totalMin / 60);
  const earned_cents = completed.reduce((acc: number, s: any) => {
    const rate = s.charge_rate_cents ?? 0;
    return acc + Math.round((s.duration_minutes ?? 0) / 60 * rate);
  }, 0);

  // Per-day counts Mon-Sun.
  const per_day_counts = [0, 0, 0, 0, 0, 0, 0];
  for (const s of completed as any[]) {
    const d = new Date(s.scheduled_at);
    const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
    per_day_counts[idx]++;
  }

  // Currency for the org.
  const { data: org } = await admin.from('organizations').select('currency').eq('id', orgId).maybeSingle();
  const currency = (org as any)?.currency ?? 'AUD';

  // Nudges.
  const { count: unpaid } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', tutorId)
    .eq('status', 'sent');

  const nudges: string[] = [];
  if ((unpaid ?? 0) >= 3) nudges.push(`${unpaid} unpaid invoices waiting on parents.`);

  const { data: cold } = await admin
    .from('students')
    .select('name, last_session_at')
    .eq('owner_id', tutorId)
    .order('last_session_at', { ascending: true, nullsFirst: false })
    .limit(3);
  for (const s of (cold ?? []) as any[]) {
    if (!s.last_session_at) continue;
    const days = Math.floor((Date.now() - new Date(s.last_session_at).getTime()) / 86_400_000);
    if (days >= 14) nudges.push(`${s.name} hasn't had a session in ${days} days.`);
  }

  const earned_label = formatMoney(earned_cents, currency);

  return {
    tutor_first_name: firstName,
    sessions_count,
    hours,
    earned_label,
    earned_cents,
    per_day_counts,
    nudges: nudges.slice(0, 3),
    app_url: baseUrl,
  };
}

function isoWeekTag(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}
