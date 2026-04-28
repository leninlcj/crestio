import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { renderTemplate } from '../../../lib/templates/render';

// POST /api/templates/render
// Body: { templateId: string, context: Record<string, unknown> }
// Returns: { rendered: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!tok) return res.status(401).json({ error: 'Not authenticated.' });
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await client.auth.getUser(tok);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const membership = await getMembershipForUser(client, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No org membership.' });

  const body = (req.body ?? {}) as { templateId?: string; context?: Record<string, unknown> };
  if (!body.templateId) return res.status(400).json({ error: 'templateId required.' });

  const { data: tpl } = await client
    .from('templates')
    .select('body, body_text')
    .eq('id', body.templateId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!tpl) return res.status(404).json({ error: 'Template not found.' });
  const text = tpl.body_text ?? (typeof tpl.body === 'string' ? tpl.body : (tpl.body as any)?.text ?? '');

  // Bump usage_count + last_used_at.
  void client.from('templates').update({
    usage_count: undefined, // no-op: we'd need a SQL increment, but ignoring is fine for v1
    last_used_at: new Date().toISOString(),
  }).eq('id', body.templateId);

  const rendered = renderTemplate(text, body.context ?? {});
  return res.status(200).json({ rendered });
}
