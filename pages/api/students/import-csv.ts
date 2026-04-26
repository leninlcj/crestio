import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { isOrgBillingOk } from '../../../lib/billing';

// Per-plan caps. Caps the row count we accept in one request so the endpoint
// stays predictable. Solo gets 50 because anything bigger is almost certainly
// a different (Team) use case.
const PLAN_CAPS: Record<string, { perImport: number }> = {
  solo: { perImport: 50 },
  team: { perImport: 500 },
  growth: { perImport: 500 },
};
const ABSOLUTE_ROW_HARD_CAP = 2000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RowInput = {
  name?: string;
  subject?: string;
  year?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
  hourly_rate?: string | number | null;
  notes?: string | null;
};

type RowFailure = { row: number; reason: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });
  if (membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the organisation owner can bulk-import students.' });
  }

  const billing = await isOrgBillingOk(userClient, membership.organization_id);
  if (!billing.ok) return res.status(402).json({ error: 'subscription_required', reason: billing.reason });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Look up plan tier so we can apply the right per-plan cap.
  const { data: org } = await admin
    .from('organizations').select('plan_tier').eq('id', membership.organization_id).maybeSingle();
  const planTier = (org?.plan_tier ?? 'solo') as string;
  const cap = PLAN_CAPS[planTier]?.perImport ?? 50;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.rows) ? (body.rows as RowInput[]) : null;
  if (!rows) return res.status(400).json({ error: 'Body must include rows: array.' });
  if (rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
  if (rows.length > ABSOLUTE_ROW_HARD_CAP) {
    return res.status(413).json({ error: `Too many rows (${rows.length}); the absolute limit is ${ABSOLUTE_ROW_HARD_CAP}.` });
  }
  if (rows.length > cap) {
    return res.status(413).json({
      error: `Your ${planTier} plan can import up to ${cap} students at once. This file has ${rows.length}. Split it or upgrade.`,
      cap,
      plan: planTier,
    });
  }

  // Pull existing students for duplicate detection.
  const { data: existingRows } = await admin
    .from('students')
    .select('name, parent_email')
    .eq('organization_id', membership.organization_id);
  const existingKeys = new Set<string>(
    ((existingRows ?? []) as Array<{ name: string; parent_email: string | null }>).map(
      (r) => duplicateKey(r.name, r.parent_email)
    ),
  );

  // Validate and stage. In-file duplicates also rejected.
  const seenInFile = new Set<string>();
  const failures: RowFailure[] = [];
  const staged: Array<{
    row: number;
    name: string;
    subject: string;
    year_level: string | null;
    parent_name: string | null;
    parent_email: string | null;
    parent_phone: string | null;
    hourly_rate_cents: number | null;
    notes: string | null;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? {};
    const rowNum = i + 1;
    const name = (r.name ?? '').toString().trim();
    const subject = (r.subject ?? '').toString().trim();
    if (!name) { failures.push({ row: rowNum, reason: 'Name is required.' }); continue; }
    if (!subject) { failures.push({ row: rowNum, reason: 'Subject is required.' }); continue; }

    const parentEmail = (r.parent_email ?? '').toString().trim().toLowerCase();
    if (parentEmail && !EMAIL_RE.test(parentEmail)) {
      failures.push({ row: rowNum, reason: `Invalid parent email: "${parentEmail}".` });
      continue;
    }

    const dupKey = duplicateKey(name, parentEmail || null);
    if (seenInFile.has(dupKey)) {
      failures.push({ row: rowNum, reason: `Duplicate within file (same name + parent email).` });
      continue;
    }
    if (existingKeys.has(dupKey)) {
      failures.push({ row: rowNum, reason: `Already exists in your account.` });
      continue;
    }
    seenInFile.add(dupKey);

    let rateCents: number | null = null;
    if (r.hourly_rate != null && r.hourly_rate !== '') {
      const n = Number(r.hourly_rate);
      if (!Number.isFinite(n) || n < 0 || n > 1000) {
        failures.push({ row: rowNum, reason: `Invalid hourly rate: "${r.hourly_rate}".` });
        continue;
      }
      rateCents = Math.round(n * 100);
    }

    staged.push({
      row: rowNum,
      name,
      subject,
      year_level: textOrNull(r.year),
      parent_name: textOrNull(r.parent_name),
      parent_email: parentEmail || null,
      parent_phone: textOrNull(r.parent_phone),
      hourly_rate_cents: rateCents,
      notes: textOrNull(r.notes),
    });
  }

  if (staged.length === 0) {
    return res.status(400).json({ error: 'No valid rows to import.', failed: failures, imported: 0 });
  }

  const insertRows = staged.map((s) => ({
    owner_id: userId,
    organization_id: membership.organization_id,
    name: s.name,
    year_level: s.year_level,
    subjects: [s.subject],
    parent_name: s.parent_name,
    parent_email: s.parent_email,
    parent_phone: s.parent_phone,
    hourly_rate_cents: s.hourly_rate_cents,
    notes: s.notes,
  }));

  const { data: inserted, error: insertErr } = await admin
    .from('students').insert(insertRows).select('id, name');

  if (insertErr) {
    console.error('[import-csv] insert failed', insertErr);
    return res.status(500).json({ error: insertErr.message });
  }

  return res.status(200).json({
    imported: inserted?.length ?? 0,
    failed: failures,
    student_ids: (inserted ?? []).map((r: any) => r.id),
  });
}

function textOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function duplicateKey(name: string, parentEmail: string | null): string {
  return `${name.trim().toLowerCase()}|${(parentEmail ?? '').toLowerCase()}`;
}
