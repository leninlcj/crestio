import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { isOrgBillingOk } from '../../../lib/billing';
import { EMAIL_RE, parseSubjects, trimOrNull } from '../../../lib/csvImport';

// Server-side commit handler for the Students CSV import. Pre-mapped rows
// arrive from the client (already projected onto canonical field keys) so
// this endpoint focuses on validation, dedupe, household linking, and a
// batched insert. Designed to run against messy real-world tutor sheets:
// every row is independent, partial success is fine, and per-row reasons
// are returned for the downloadable error report.

const PLAN_CAPS: Record<string, { perImport: number }> = {
  solo: { perImport: 50 },
  team: { perImport: 500 },
  growth: { perImport: 500 },
};
const ABSOLUTE_ROW_HARD_CAP = 5000;
const BATCH_SIZE = 100;

type StudentRowInput = {
  name?: string;
  household_name?: string | null;
  subjects?: string | null;
  year_level?: string | null;
  pay_rate_dollars?: string | number | null;
  notes?: string | null;
};

type RowOutcome = { row: number; reason: string; status: 'failed' | 'skipped' };

type StagedRow = {
  row: number;
  name: string;
  household_name: string | null;
  subjects: string[];
  year_level: string | null;
  hourly_rate_cents: number | null;
  notes: string | null;
};

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

  const { data: org } = await admin
    .from('organizations').select('plan_tier').eq('id', membership.organization_id).maybeSingle();
  const planTier = (org?.plan_tier ?? 'solo') as string;
  const perImportCap = PLAN_CAPS[planTier]?.perImport ?? 50;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.rows) ? (body.rows as StudentRowInput[]) : null;
  if (!rows) return res.status(400).json({ error: 'Body must include rows: array.' });
  if (rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
  if (rows.length > ABSOLUTE_ROW_HARD_CAP) {
    return res.status(413).json({ error: `Too many rows (${rows.length}); the absolute limit is ${ABSOLUTE_ROW_HARD_CAP}.` });
  }
  if (rows.length > perImportCap) {
    return res.status(413).json({
      error: `Your ${planTier} plan can import up to ${perImportCap} students at once. This file has ${rows.length}. Split it or upgrade.`,
      cap: perImportCap,
      plan: planTier,
    });
  }

  // Pre-load existing household names + students for this org so dedupe is
  // a single round-trip rather than per-row queries.
  const orgId = membership.organization_id;

  const { data: existingHouseholds } = await admin
    .from('households')
    .select('id, display_name')
    .eq('organization_id', orgId)
    .is('archived_at', null);
  const householdIdByName = new Map<string, string>();
  for (const h of (existingHouseholds ?? []) as Array<{ id: string; display_name: string }>) {
    householdIdByName.set(h.display_name.trim().toLowerCase(), h.id);
  }

  const { data: existingStudents } = await admin
    .from('students')
    .select('id, name, household_id')
    .eq('organization_id', orgId);
  const existingStudentKeys = new Set<string>(
    ((existingStudents ?? []) as Array<{ name: string; household_id: string | null }>).map(
      (r) => studentDedupeKey(r.name, r.household_id),
    ),
  );

  // ---------------------------------------------------------------------------
  // Validate + stage
  // ---------------------------------------------------------------------------
  const seenInFile = new Set<string>();
  const outcomes: RowOutcome[] = [];
  const staged: StagedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? {};
    const rowNum = i + 1;
    const name = (r.name ?? '').toString().trim();
    if (!name) { outcomes.push({ row: rowNum, reason: 'Name is required.', status: 'failed' }); continue; }

    const householdName = trimOrNull(r.household_name);
    const subjects = parseSubjects((r.subjects ?? '').toString());
    const yearLevel = trimOrNull(r.year_level);
    const notes = trimOrNull(r.notes);

    let rateCents: number | null = null;
    if (r.pay_rate_dollars != null && r.pay_rate_dollars !== '') {
      const cleaned = String(r.pay_rate_dollars).replace(/[^0-9.\-]/g, '');
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        outcomes.push({ row: rowNum, reason: `Invalid pay rate: "${r.pay_rate_dollars}".`, status: 'failed' });
        continue;
      }
      rateCents = Math.round(n * 100);
    }

    // In-file duplicate check uses the household NAME because the household
    // hasn't been created yet at this point.
    const fileKey = `${name.toLowerCase()}|${(householdName ?? '').toLowerCase()}`;
    if (seenInFile.has(fileKey)) {
      outcomes.push({ row: rowNum, reason: 'Duplicate within file (same name + household).', status: 'skipped' });
      continue;
    }
    seenInFile.add(fileKey);

    staged.push({
      row: rowNum,
      name,
      household_name: householdName,
      subjects,
      year_level: yearLevel,
      hourly_rate_cents: rateCents,
      notes,
    });
  }

  if (staged.length === 0) {
    return res.status(200).json({ imported: 0, skipped: outcomes.length, outcomes });
  }

  // ---------------------------------------------------------------------------
  // Resolve household names: reuse existing rows, create new ones for unknown
  // names. Done up-front (not per-batch) so each unique household_name gets
  // exactly one new row no matter how many students reference it.
  // ---------------------------------------------------------------------------
  const newHouseholdNames = new Set<string>();
  for (const s of staged) {
    if (!s.household_name) continue;
    if (!householdIdByName.has(s.household_name.toLowerCase())) {
      newHouseholdNames.add(s.household_name);
    }
  }

  if (newHouseholdNames.size > 0) {
    const newHouseholdRows = Array.from(newHouseholdNames).map((display_name) => ({
      organization_id: orgId,
      display_name,
    }));
    const { data: created, error: hErr } = await admin
      .from('households')
      .insert(newHouseholdRows)
      .select('id, display_name');
    if (hErr) {
      console.error('[import/students] household create failed', hErr);
      return res.status(500).json({ error: hErr.message });
    }
    for (const h of (created ?? []) as Array<{ id: string; display_name: string }>) {
      householdIdByName.set(h.display_name.trim().toLowerCase(), h.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Build insert rows + final dedupe against DB (now that household_id is known).
  // ---------------------------------------------------------------------------
  const insertRows: Array<{
    owner_id: string;
    organization_id: string;
    name: string;
    year_level: string | null;
    subjects: string[];
    hourly_rate_cents: number | null;
    notes: string | null;
    household_id: string | null;
    sourceRow: number;
  }> = [];

  for (const s of staged) {
    const householdId = s.household_name
      ? householdIdByName.get(s.household_name.toLowerCase()) ?? null
      : null;
    const dbKey = studentDedupeKey(s.name, householdId);
    if (existingStudentKeys.has(dbKey)) {
      outcomes.push({ row: s.row, reason: 'Already exists in your account.', status: 'skipped' });
      continue;
    }
    existingStudentKeys.add(dbKey);
    insertRows.push({
      owner_id: userId,
      organization_id: orgId,
      name: s.name,
      year_level: s.year_level,
      subjects: s.subjects,
      hourly_rate_cents: s.hourly_rate_cents,
      notes: s.notes,
      household_id: householdId,
      sourceRow: s.row,
    });
  }

  // ---------------------------------------------------------------------------
  // Insert in batches of 100. A failing batch drops to per-row inserts so one
  // bad row doesn't sink the whole batch.
  // ---------------------------------------------------------------------------
  let importedCount = 0;
  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const slice = insertRows.slice(i, i + BATCH_SIZE);
    const payload = slice.map(({ sourceRow: _src, ...rest }) => rest);
    const { data: inserted, error: insertErr } = await admin
      .from('students')
      .insert(payload)
      .select('id');
    if (!insertErr) {
      importedCount += inserted?.length ?? 0;
      continue;
    }
    console.warn('[import/students] batch failed, falling back to per-row', insertErr.message);
    importedCount += await fallbackPerRowInsert(admin, slice, outcomes);
  }

  return res.status(200).json({
    imported: importedCount,
    skipped: outcomes.length,
    outcomes,
  });
}

async function fallbackPerRowInsert(
  admin: SupabaseClient,
  slice: Array<{
    owner_id: string;
    organization_id: string;
    name: string;
    year_level: string | null;
    subjects: string[];
    hourly_rate_cents: number | null;
    notes: string | null;
    household_id: string | null;
    sourceRow: number;
  }>,
  outcomes: RowOutcome[],
): Promise<number> {
  let imported = 0;
  for (const row of slice) {
    const { sourceRow, ...payload } = row;
    const { error } = await admin.from('students').insert(payload).select('id').single();
    if (error) {
      outcomes.push({
        row: sourceRow,
        reason: `Database error: ${error.message}`,
        status: 'failed',
      });
    } else {
      imported++;
    }
  }
  return imported;
}

function studentDedupeKey(name: string, householdId: string | null): string {
  return `${name.trim().toLowerCase()}|${householdId ?? 'no-household'}`;
}

// Validate parent email format (used here only for early failure if the
// optional shape ever changes — unused by current students CSV but kept
// alongside the email regex for symmetry).
export function _isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}
