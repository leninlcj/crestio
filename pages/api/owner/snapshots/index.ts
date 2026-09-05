import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../../lib/ownerAuth';
import { SNAPSHOT_BUCKET, takeSnapshot } from '../../../../lib/snapshot';

// GET  /api/owner/snapshots  lists the weekly snapshots with one-hour download links.
// POST /api/owner/snapshots  takes a snapshot now.
// Platform owner only.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  if (req.method === 'POST') {
    try {
      const r = await takeSnapshot(admin);
      return res.status(200).json({ ok: true, ...r });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? 'Snapshot failed.' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data: bucket } = await admin.storage.getBucket(SNAPSHOT_BUCKET);
  if (!bucket) return res.status(200).json({ snapshots: [] });

  const years: string[] = [];
  const { data: top } = await admin.storage.from(SNAPSHOT_BUCKET).list('', { limit: 50 });
  for (const f of top ?? []) if (/^\d{4}$/.test(f.name)) years.push(f.name);

  const snapshots: Array<{ path: string; bytes: number | null; created_at: string | null; url: string | null }> = [];
  for (const y of years.sort().reverse()) {
    const { data: files } = await admin.storage.from(SNAPSHOT_BUCKET).list(y, { limit: 100, sortBy: { column: 'name', order: 'desc' } });
    for (const f of files ?? []) {
      if (!f.name.endsWith('.json')) continue;
      const path = `${y}/${f.name}`;
      const { data: signed } = await admin.storage.from(SNAPSHOT_BUCKET).createSignedUrl(path, 3600);
      snapshots.push({ path, bytes: (f.metadata as any)?.size ?? null, created_at: f.created_at ?? null, url: signed?.signedUrl ?? null });
    }
  }
  return res.status(200).json({ snapshots });
}
