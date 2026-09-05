import type { SupabaseClient } from '@supabase/supabase-js';

// Weekly data snapshot: every table that matters, as one JSON file in a
// private Storage bucket. This guards against the likeliest loss at this
// stage (a bad edit or an accidental delete), not against losing the whole
// Supabase project; that needs the Pro plan's daily backups (November).

export const SNAPSHOT_BUCKET = 'snapshots';
export const SNAPSHOT_KEEP = 8;

// Tables copied in full. A table that does not exist yet is skipped and
// listed under `skipped` so the owner email says so.
export const SNAPSHOT_TABLES = [
  'organizations', 'organization_members', 'profiles',
  'tutors', 'tutor_invitations', 'parents', 'parent_invitations', 'parent_student_links',
  'households', 'household_parents', 'students', 'sessions', 'session_templates',
  'invoices', 'invoice_sessions', 'payments', 'payouts',
  'enquiries', 'tutor_applications', 'incidents', 'audit_log', 'files',
] as const;

type Admin = SupabaseClient<any, any, any>;

export type SnapshotResult = {
  path: string;
  bytes: number;
  counts: Record<string, number>;
  skipped: string[];
  removed: string[];
};

async function ensureBucket(admin: Admin): Promise<void> {
  const { data } = await admin.storage.getBucket(SNAPSHOT_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(SNAPSHOT_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create bucket: ${error.message}`);
}

async function dumpTable(admin: Admin, table: string): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await admin.from(table).select('*').range(from, from + page - 1);
    if (error) {
      // Missing table: PostgREST reports it in the message or with PGRST205 / 42P01.
      if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) return null;
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

export async function takeSnapshot(admin: Admin, now: Date = new Date()): Promise<SnapshotResult> {
  await ensureBucket(admin);

  const tables: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  for (const t of SNAPSHOT_TABLES) {
    const rows = await dumpTable(admin, t);
    if (rows === null) { skipped.push(t); continue; }
    tables[t] = rows;
    counts[t] = rows.length;
  }

  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const path = `${now.getUTCFullYear()}/${stamp}.json`;
  const body = JSON.stringify({ taken_at: now.toISOString(), tables }, null, 0);
  const bytes = Buffer.byteLength(body, 'utf8');
  const { error: upErr } = await admin.storage.from(SNAPSHOT_BUCKET).upload(path, Buffer.from(body, 'utf8'), { contentType: 'application/json', upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  // Keep the newest SNAPSHOT_KEEP files.
  const removed: string[] = [];
  const { data: list } = await admin.storage.from(SNAPSHOT_BUCKET).list(String(now.getUTCFullYear()), { limit: 200, sortBy: { column: 'name', order: 'desc' } });
  const files = (list ?? []).filter((f) => f.name.endsWith('.json')).map((f) => `${now.getUTCFullYear()}/${f.name}`);
  const stale = files.slice(SNAPSHOT_KEEP);
  if (stale.length > 0) {
    const { error: rmErr } = await admin.storage.from(SNAPSHOT_BUCKET).remove(stale);
    if (!rmErr) removed.push(...stale);
  }

  return { path, bytes, counts, skipped, removed };
}
