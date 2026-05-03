import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { isOrgBillingOk } from '../../../lib/billing';
import { EMAIL_RE, normalisePhone, trimOrNull } from '../../../lib/csvImport';

// Households + parents CSV import. Creates a household row plus a real
// parents row (with auth_user_id IS NULL until the parent signs up) and a
// household_parents link between them. Parents are deduped by
// (organization_id, lower(email)) — if a parent with that email already
// exists in the org, we link to them instead of creating a duplicate.

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

type RowOutcome = {
  row: number;
  reason: string;
  status: 'failed' | 'skipped' | 'linked';
};

type StagedRow = {
  row: number;
  household_name: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  billing_address: string | null;
  preferred_currency: string | null;
  /** When set, the row reuses an existing household instead of creating one. */
  existing_household_id: string | null;
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

  // Pre-load existing households + parents in this org so dedupe is one
  // round-trip rather than per-row queries.
  const { data: existingHouseholds } = await admin
    .from('households')
    .select('id, display_name, billing_email, billing_address, preferred_currency')
    .eq('organization_id', orgId)
    .is('archived_at', null);

  type ExistingHouseholdRow = {
    id: string;
    display_name: string;
    billing_email: string | null;
    billing_address: string | null;
    preferred_currency: string | null;
  };
  const existingHouseholdByName = new Map<string, ExistingHouseholdRow>();
  for (const h of (existingHouseholds ?? []) as ExistingHouseholdRow[]) {
    existingHouseholdByName.set(h.display_name.trim().toLowerCase(), h);
  }

  const { data: existingParents } = await admin
    .from('parents')
    .select('id, email')
    .eq('organization_id', orgId);

  const parentIdByEmail = new Map<string, string>();
  for (const p of (existingParents ?? []) as Array<{ id: string; email: string | null }>) {
    if (p.email) parentIdByEmail.set(p.email.trim().toLowerCase(), p.id);
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

    // Reuse path: case-insensitive, trimmed display_name match within the
    // same org. We attach the parent (creating the parents row if needed)
    // and only fill billing_address / preferred_currency if currently NULL.
    const existing = existingHouseholdByName.get(fileNameKey);
    staged.push({
      row: rowNum,
      household_name: householdName,
      parent_name: parentName,
      parent_email: parentEmailRaw,
      parent_phone: parentPhone,
      billing_address: billingAddress,
      preferred_currency: preferredCurrency ?? orgCurrency,
      existing_household_id: existing?.id ?? null,
    });
  }

  if (staged.length === 0) {
    return res.status(200).json({ imported: 0, skipped: outcomes.length, outcomes });
  }

  // ---------------------------------------------------------------------------
  // Resolve parents up-front: any new emails get a fresh parents row
  // (auth_user_id NULL); known emails reuse the existing row. Done in one
  // batch so each unique email yields exactly one parent record.
  // ---------------------------------------------------------------------------
  const newParentRows: Array<{ email: string; name: string; phone: string | null }> = [];
  const stagedEmailsNeedingParent = new Set<string>();
  for (const s of staged) {
    if (parentIdByEmail.has(s.parent_email)) continue;
    if (stagedEmailsNeedingParent.has(s.parent_email)) continue;
    stagedEmailsNeedingParent.add(s.parent_email);
    newParentRows.push({
      email: s.parent_email,
      name: s.parent_name,
      phone: s.parent_phone,
    });
  }

  if (newParentRows.length > 0) {
    const payload = newParentRows.map((p) => ({
      organization_id: orgId,
      auth_user_id: null,
      email: p.email,
      name: p.name,
      phone: p.phone,
    }));
    const { data: created, error: pErr } = await admin
      .from('parents')
      .insert(payload)
      .select('id, email');
    if (pErr) {
      console.error('[import/households] parent create failed', pErr);
      return res.status(500).json({ error: pErr.message });
    }
    for (const p of (created ?? []) as Array<{ id: string; email: string | null }>) {
      if (p.email) parentIdByEmail.set(p.email.trim().toLowerCase(), p.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Split staged into two paths:
  //   • newRows  — household doesn't exist yet → batch-insert + link parent.
  //   • reuseRows — household exists by display_name → link this parent to
  //     the existing household (deduped via household_parents PK), and
  //     backfill billing_address / preferred_currency only if currently NULL.
  // ---------------------------------------------------------------------------
  const newRows = staged.filter((s) => s.existing_household_id === null);
  const reuseRows = staged.filter((s) => s.existing_household_id !== null);

  let importedCount = 0;
  let linkedCount = 0;

  // ---- create-new path ---------------------------------------------------
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const slice = newRows.slice(i, i + BATCH_SIZE);
    const householdPayload = slice.map((s) => ({
      organization_id: orgId,
      display_name: s.household_name,
      billing_email: s.parent_email,
      billing_address: s.billing_address,
      preferred_currency: s.preferred_currency,
    }));
    const { data: insertedHouseholds, error: insertErr } = await admin
      .from('households')
      .insert(householdPayload)
      .select('id, display_name, billing_email');

    if (insertErr) {
      console.warn('[import/households] batch failed, falling back to per-row', insertErr.message);
      importedCount += await fallbackPerRowInsert(admin, orgId, slice, parentIdByEmail, outcomes);
      continue;
    }

    const links: Array<{ household_id: string; parent_id: string; is_primary: boolean }> = [];
    for (const h of (insertedHouseholds ?? []) as Array<{ id: string; display_name: string; billing_email: string | null }>) {
      const email = (h.billing_email ?? '').trim().toLowerCase();
      const parentId = email ? parentIdByEmail.get(email) : null;
      if (!parentId) continue;
      links.push({ household_id: h.id, parent_id: parentId, is_primary: true });
    }
    if (links.length > 0) {
      const { error: linkErr } = await admin
        .from('household_parents')
        .insert(links);
      if (linkErr) {
        console.error('[import/households] household_parents link insert failed', linkErr);
        for (const s of slice) {
          outcomes.push({
            row: s.row,
            reason: `Household created but parent link failed: ${linkErr.message}`,
            status: 'failed',
          });
        }
        continue;
      }
    }
    importedCount += insertedHouseholds?.length ?? 0;
  }

  // ---- reuse-existing path ----------------------------------------------
  // Per-row because each row may need to (a) backfill the household billing
  // fields, (b) link a parent, and (c) tolerate the case where the
  // household_parents pair already exists. Batching gains nothing here.
  for (const s of reuseRows) {
    const householdId = s.existing_household_id!;
    const existing = Array.from(existingHouseholdByName.values()).find((h) => h.id === householdId);

    // Backfill only-if-NULL columns. Skip the round-trip when there's
    // nothing to backfill.
    const update: Record<string, unknown> = {};
    if (existing && !existing.billing_address && s.billing_address) {
      update.billing_address = s.billing_address;
    }
    if (existing && !existing.preferred_currency && s.preferred_currency) {
      update.preferred_currency = s.preferred_currency;
    }
    if (Object.keys(update).length > 0) {
      const { error: updErr } = await admin
        .from('households')
        .update(update)
        .eq('id', householdId);
      if (updErr) {
        console.warn('[import/households] reuse backfill update failed', updErr.message);
        // Non-fatal — continue to the parent link.
      }
    }

    const parentId = parentIdByEmail.get(s.parent_email);
    if (!parentId) {
      outcomes.push({ row: s.row, reason: 'Parent record could not be resolved.', status: 'failed' });
      continue;
    }

    // Idempotent link insert. The unique (household_id, parent_id) constraint
    // protects us from duplicates if the row is re-imported. is_primary stays
    // FALSE so we don't accidentally demote whoever the user already chose.
    const { error: linkErr } = await admin
      .from('household_parents')
      .upsert(
        { household_id: householdId, parent_id: parentId, is_primary: false },
        { onConflict: 'household_id,parent_id', ignoreDuplicates: true },
      );
    if (linkErr) {
      outcomes.push({ row: s.row, reason: `Could not link parent: ${linkErr.message}`, status: 'failed' });
      continue;
    }

    outcomes.push({ row: s.row, reason: 'Linked to existing household.', status: 'linked' });
    linkedCount++;
  }

  return res.status(200).json({
    imported: importedCount,
    linked: linkedCount,
    skipped: outcomes.filter((o) => o.status !== 'linked').length,
    outcomes,
  });
}

async function fallbackPerRowInsert(
  admin: SupabaseClient,
  orgId: string,
  slice: StagedRow[],
  parentIdByEmail: Map<string, string>,
  outcomes: RowOutcome[],
): Promise<number> {
  let imported = 0;
  for (const s of slice) {
    const { data: household, error } = await admin
      .from('households')
      .insert({
        organization_id: orgId,
        display_name: s.household_name,
        billing_email: s.parent_email,
        billing_address: s.billing_address,
        preferred_currency: s.preferred_currency,
      })
      .select('id')
      .single();
    if (error || !household) {
      outcomes.push({
        row: s.row,
        reason: `Database error: ${error?.message ?? 'unknown'}`,
        status: 'failed',
      });
      continue;
    }
    const parentId = parentIdByEmail.get(s.parent_email);
    if (parentId) {
      const { error: linkErr } = await admin
        .from('household_parents')
        .insert({ household_id: household.id, parent_id: parentId, is_primary: true });
      if (linkErr) {
        outcomes.push({
          row: s.row,
          reason: `Household created but parent link failed: ${linkErr.message}`,
          status: 'failed',
        });
        continue;
      }
    }
    imported++;
  }
  return imported;
}
