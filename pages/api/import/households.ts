import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { isOrgBillingOk } from '../../../lib/billing';
import { EMAIL_RE, normalisePhone, trimOrNull } from '../../../lib/csvImport';

// Households + parents CSV import. The schema only allows creating parent
// records that are tied to an auth.users row (parents.auth_user_id is NOT
// NULL with FK to auth.users), and the founder explicitly told us NOT to
// touch the signup flow. We therefore create the *household* and stash the
// parent contact info on it: billing_email holds the parent's email, and
// the rest (name, phone, billing address, preferred currency) is appended
// to the household's notes column so nothing is lost. The founder can
// invite parents via the existing invite flow later, and the records will
// link up by email.

const PLAN_CAPS: Record<string, { perImport: number }> = {
  solo: { perImport: 50 },
  team: { perImport: 500 },
  growth: { perImport: 500 },
};
const ABSOLUTE_ROW_HARD_CAP = 5000;
const BATCH_SIZE = 100;

type HouseholdRowInput = {
  household_name?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string | null;
  billing_address?: string | null;
  preferred_currency?: string | null;
};

type RowOutcome = { row: number; reason: string; status: 'failed' | 'skipped' };

type StagedRow = {
  row: number;
  household_name: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  billing_address: string | null;
  preferred_currency: string | null;
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
    return res.status(403).json({ error: 'Only the organisation owner can bulk-import households.' });
  }

  const billing = await isOrgBillingOk(userClient, membership.organization_id);
  if (!billing.ok) return res.status(402).json({ error: 'subscription_required', reason: billing.reason });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: org } = await admin
    .from('organizations')
    .select('plan_tier, currency, country_code')
    .eq('id', membership.organization_id)
    .maybeSingle();
  const planTier = (org?.plan_tier ?? 'solo') as string;
  const orgCurrency = (org?.currency ?? null) as string | null;
  const orgCountry = (org?.country_code ?? null) as string | null;
  const perImportCap = PLAN_CAPS[planTier]?.perImport ?? 50;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.rows) ? (body.rows as HouseholdRowInput[]) : null;
  if (!rows) return res.status(400).json({ error: 'Body must include rows: array.' });
  if (rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
  if (rows.length > ABSOLUTE_ROW_HARD_CAP) {
    return res.status(413).json({ error: `Too many rows (${rows.length}); the absolute limit is ${ABSOLUTE_ROW_HARD_CAP}.` });
  }
  if (rows.length > perImportCap) {
    return res.status(413).json({
      error: `Your ${planTier} plan can import up to ${perImportCap} households at once. This file has ${rows.length}. Split it or upgrade.`,
      cap: perImportCap,
      plan: planTier,
    });
  }

  const orgId = membership.organization_id;

  const { data: existing } = await admin
    .from('households')
    .select('id, display_name, billing_email')
    .eq('organization_id', orgId)
    .is('archived_at', null);

  const existingByDisplayName = new Map<string, string>();
  const existingByBillingEmail = new Map<string, string>();
  for (const h of (existing ?? []) as Array<{ id: string; display_name: string; billing_email: string | null }>) {
    existingByDisplayName.set(h.display_name.trim().toLowerCase(), h.id);
    if (h.billing_email) existingByBillingEmail.set(h.billing_email.trim().toLowerCase(), h.id);
  }

  // ---------------------------------------------------------------------------
  // Validate + stage
  // ---------------------------------------------------------------------------
  const seenInFileByEmail = new Set<string>();
  const seenInFileByName = new Set<string>();
  const outcomes: RowOutcome[] = [];
  const staged: StagedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? {};
    const rowNum = i + 1;

    const householdName = (r.household_name ?? '').toString().trim();
    const parentName = (r.parent_name ?? '').toString().trim();
    const parentEmailRaw = (r.parent_email ?? '').toString().trim().toLowerCase();

    if (!householdName) { outcomes.push({ row: rowNum, reason: 'Household name is required.', status: 'failed' }); continue; }
    if (!parentName) { outcomes.push({ row: rowNum, reason: 'Parent name is required.', status: 'failed' }); continue; }
    if (!parentEmailRaw) { outcomes.push({ row: rowNum, reason: 'Parent email is required.', status: 'failed' }); continue; }
    if (!EMAIL_RE.test(parentEmailRaw)) {
      outcomes.push({ row: rowNum, reason: `Invalid parent email: "${parentEmailRaw}".`, status: 'failed' });
      continue;
    }

    let parentPhone: string | null = null;
    const phoneRaw = trimOrNull(r.parent_phone);
    if (phoneRaw) {
      const result = normalisePhone(
        phoneRaw,
        (orgCountry as never) ?? undefined,
      );
      if (!result.ok) {
        outcomes.push({ row: rowNum, reason: result.reason, status: 'failed' });
        continue;
      }
      parentPhone = result.e164;
    }

    const billingAddress = trimOrNull(r.billing_address);
    const preferredCurrency = trimOrNull(r.preferred_currency)?.toUpperCase() ?? null;
    if (preferredCurrency && !/^[A-Z]{3}$/.test(preferredCurrency)) {
      outcomes.push({ row: rowNum, reason: `Invalid currency code: "${preferredCurrency}".`, status: 'failed' });
      continue;
    }

    const fileEmailKey = parentEmailRaw;
    if (seenInFileByEmail.has(fileEmailKey)) {
      outcomes.push({ row: rowNum, reason: 'Duplicate within file (same parent email).', status: 'skipped' });
      continue;
    }
    const fileNameKey = householdName.toLowerCase();
    if (seenInFileByName.has(fileNameKey)) {
      outcomes.push({ row: rowNum, reason: 'Duplicate within file (same household name).', status: 'skipped' });
      continue;
    }
    seenInFileByEmail.add(fileEmailKey);
    seenInFileByName.add(fileNameKey);

    if (existingByBillingEmail.has(parentEmailRaw)) {
      outcomes.push({ row: rowNum, reason: 'A household with this parent email already exists.', status: 'skipped' });
      continue;
    }
    if (existingByDisplayName.has(fileNameKey)) {
      outcomes.push({ row: rowNum, reason: 'A household with this name already exists.', status: 'skipped' });
      continue;
    }

    staged.push({
      row: rowNum,
      household_name: householdName,
      parent_name: parentName,
      parent_email: parentEmailRaw,
      parent_phone: parentPhone,
      billing_address: billingAddress,
      preferred_currency: preferredCurrency ?? orgCurrency,
    });
  }

  if (staged.length === 0) {
    return res.status(200).json({
      imported: 0,
      skipped: outcomes.length,
      outcomes,
      note: 'parent_records_not_created',
    });
  }

  // ---------------------------------------------------------------------------
  // Insert in batches of 100 — partial success is acceptable. parents.auth_user_id
  // is NOT NULL (FK -> auth.users), so we deliberately do NOT insert into
  // parents here; the parent_name / phone / address / currency get folded
  // into households.notes for now. The founder can invite parents through
  // the existing flow later — that path creates the auth.users row, the
  // parents row, and links them via email.
  // ---------------------------------------------------------------------------

  let importedCount = 0;
  for (let i = 0; i < staged.length; i += BATCH_SIZE) {
    const slice = staged.slice(i, i + BATCH_SIZE);
    const payload = slice.map((s) => ({
      organization_id: orgId,
      display_name: s.household_name,
      billing_email: s.parent_email,
      notes: composeNotes(s),
    }));
    const { data: inserted, error: insertErr } = await admin
      .from('households')
      .insert(payload)
      .select('id');
    if (!insertErr) {
      importedCount += inserted?.length ?? 0;
      continue;
    }
    console.warn('[import/households] batch failed, falling back to per-row', insertErr.message);
    importedCount += await fallbackPerRowInsert(admin, orgId, slice, outcomes);
  }

  return res.status(200).json({
    imported: importedCount,
    skipped: outcomes.length,
    outcomes,
    note: 'parent_records_not_created',
  });
}

function composeNotes(s: StagedRow): string {
  const lines: string[] = [];
  lines.push(`Primary contact: ${s.parent_name}`);
  if (s.parent_phone) lines.push(`Phone: ${s.parent_phone}`);
  if (s.billing_address) lines.push(`Billing address: ${s.billing_address}`);
  if (s.preferred_currency) lines.push(`Preferred currency: ${s.preferred_currency}`);
  return lines.join('\n');
}

async function fallbackPerRowInsert(
  admin: SupabaseClient,
  orgId: string,
  slice: StagedRow[],
  outcomes: RowOutcome[],
): Promise<number> {
  let imported = 0;
  for (const s of slice) {
    const { error } = await admin
      .from('households')
      .insert({
        organization_id: orgId,
        display_name: s.household_name,
        billing_email: s.parent_email,
        notes: composeNotes(s),
      })
      .select('id')
      .single();
    if (error) {
      outcomes.push({
        row: s.row,
        reason: `Database error: ${error.message}`,
        status: 'failed',
      });
    } else {
      imported++;
    }
  }
  return imported;
}
