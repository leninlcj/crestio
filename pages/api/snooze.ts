import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../lib/membership';
import { ENTITY_SPECS, EntityType, isValidEntityType } from '../../lib/entitySchema';

// POST /api/snooze
// Body: { entity_type, entity_id, until: ISO string | null }
//
// Sets snoozed_until on supported entities (students, sessions, invoices,
// session_templates).  Other entities snooze via localStorage on the client.

const SUPPORTED: EntityType[] = ['student', 'session', 'invoice', 'session_template'];

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
  const { data: userData } = await userClient.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const body = (req.body ?? {}) as { entity_type?: string; entity_id?: string; until?: string | null };
  if (!body.entity_type || !isValidEntityType(body.entity_type) || !body.entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id required.' });
  }
  const entityType = body.entity_type as EntityType;
  if (!SUPPORTED.includes(entityType)) {
    return res.status(400).json({ error: 'This entity type does not support server-side snooze.' });
  }

  const spec = ENTITY_SPECS[entityType];
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: row } = await admin
    .from(spec.table)
    .select(`id, ${spec.orgColumn}`)
    .eq('id', body.entity_id)
    .maybeSingle();
  if (!row || (row as any)[spec.orgColumn] !== membership.organization_id) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const until = body.until && /^\d{4}-\d{2}-\d{2}T/.test(body.until) ? body.until : null;
  const { error } = await admin
    .from(spec.table)
    .update({ snoozed_until: until })
    .eq('id', body.entity_id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, snoozed_until: until });
}
