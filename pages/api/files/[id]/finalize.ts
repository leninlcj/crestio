// POST /api/files/[id]/finalize — flip an uploading file to ready.
//
// Called after the client successfully PUTs the file body to the signed upload
// URL returned by /api/files/upload. Verifies the storage object actually
// exists and then sets status='ready'. If the storage object is missing the
// row is hard-deleted (the AFTER DELETE trigger rolls back storage_used_bytes).
//
// We trust the client-reported file_size_bytes from init for quota accounting.
// Tiny discrepancies between claimed and actual bytes are acceptable; the
// bucket-level 50 MB cap stops abuse, and the org-level cap is enforced before
// the upload URL is issued.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const fileId = String(req.query.id ?? '');
  if (!fileId) return res.status(400).json({ error: 'file id required.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: file } = await admin
    .from('files')
    .select('id, uploaded_by_user_id, storage_path, status')
    .eq('id', fileId)
    .maybeSingle();
  if (!file) return res.status(404).json({ error: 'File not found.' });
  if (file.uploaded_by_user_id !== userId) {
    return res.status(403).json({ error: 'Only the uploader can finalize.' });
  }
  if (file.status === 'ready') return res.status(200).json({ ok: true, status: 'ready' });
  if (file.status !== 'uploading') {
    return res.status(409).json({ error: `Cannot finalize file in status ${file.status}.` });
  }

  // Verify the storage object exists.
  const folder = file.storage_path.replace(/\/[^/]+$/, '');
  const fileName = file.storage_path.split('/').pop() ?? '';
  const { data: list, error: listErr } = await admin.storage
    .from('files')
    .list(folder, { search: fileName, limit: 1 });
  if (listErr) {
    console.error('[files/finalize] list failed', listErr);
    return res.status(500).json({ error: 'Storage check failed.' });
  }
  const found = (list ?? []).some((o: any) => o.name === fileName);
  if (!found) {
    await admin.from('files').delete().eq('id', fileId);
    return res.status(409).json({ error: 'Upload did not complete. Try again.' });
  }

  const { error: updateErr } = await admin
    .from('files')
    .update({ status: 'ready' })
    .eq('id', fileId);
  if (updateErr) {
    console.error('[files/finalize] status update failed', updateErr);
    return res.status(500).json({ error: 'Could not finalize.' });
  }

  return res.status(200).json({ ok: true, status: 'ready' });
}
