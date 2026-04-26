import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveOwnerRequest } from '../../../lib/ownerAuth';

// GET /api/owner/ai-costs?weeks=4
// Returns weekly AI spend rolled up by user, by task type, plus escalation
// rate. Owner-only.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await resolveOwnerRequest(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const weeksRaw = Number(req.query.weeks ?? 4);
  const weeks = Number.isFinite(weeksRaw) && weeksRaw >= 1 && weeksRaw <= 12 ? Math.floor(weeksRaw) : 4;
  const sinceMs = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  const { data: rows, error } = await admin
    .from('ai_call_logs')
    .select('user_id, task_type, model, input_tokens, output_tokens, cost_usd, escalated, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(20000);
  if (error) return res.status(500).json({ error: error.message });

  const list = (rows ?? []) as Array<{
    user_id: string | null;
    task_type: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
    escalated: boolean;
    created_at: string;
  }>;

  // Roll-ups
  const byUser: Record<string, { calls: number; cost: number; escalations: number }> = {};
  const byTask: Record<string, { calls: number; cost: number; escalations: number }> = {};
  const byModel: Record<string, { calls: number; cost: number }> = {};
  let total = { calls: 0, cost: 0, escalations: 0 };

  for (const r of list) {
    const cost = Number(r.cost_usd ?? 0);
    const u = r.user_id ?? 'unknown';
    if (!byUser[u]) byUser[u] = { calls: 0, cost: 0, escalations: 0 };
    byUser[u].calls++;
    byUser[u].cost += cost;
    if (r.escalated) byUser[u].escalations++;

    if (!byTask[r.task_type]) byTask[r.task_type] = { calls: 0, cost: 0, escalations: 0 };
    byTask[r.task_type].calls++;
    byTask[r.task_type].cost += cost;
    if (r.escalated) byTask[r.task_type].escalations++;

    if (!byModel[r.model]) byModel[r.model] = { calls: 0, cost: 0 };
    byModel[r.model].calls++;
    byModel[r.model].cost += cost;

    total.calls++;
    total.cost += cost;
    if (r.escalated) total.escalations++;
  }

  // Resolve user emails for the top users.
  const userIds = Object.keys(byUser).slice(0, 50);
  const userEmails: Record<string, string> = {};
  if (userIds.length) {
    const { data: profileRows } = await admin
      .from('profiles').select('id, email').in('id', userIds);
    for (const p of (profileRows ?? []) as Array<{ id: string; email: string | null }>) {
      if (p.email) userEmails[p.id] = p.email;
    }
  }

  return res.status(200).json({
    window_weeks: weeks,
    since_iso: sinceIso,
    total,
    by_user: Object.entries(byUser)
      .map(([id, v]) => ({ user_id: id, email: userEmails[id] ?? null, ...v }))
      .sort((a, b) => b.cost - a.cost),
    by_task: Object.entries(byTask)
      .map(([k, v]) => ({ task_type: k, ...v }))
      .sort((a, b) => b.cost - a.cost),
    by_model: Object.entries(byModel)
      .map(([k, v]) => ({ model: k, ...v }))
      .sort((a, b) => b.cost - a.cost),
  });
}
