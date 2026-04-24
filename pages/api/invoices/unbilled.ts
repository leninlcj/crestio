import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { getUnbilledSessions } from '../../../lib/billing/unbilledSessions';
import { groupSessionsByHousehold } from '../../../lib/billing/groupSessionsByHousehold';

// GET /api/invoices/unbilled?period_start=ISO&period_end=ISO&tutor_user_id=UUID?
// Returns household-grouped unbilled sessions for the caller's org.
// Tutors are scoped to their own teaching; owners can optionally filter by tutor.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const periodStart = typeof req.query.period_start === 'string' ? req.query.period_start : '';
  const periodEnd = typeof req.query.period_end === 'string' ? req.query.period_end : '';
  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: 'period_start and period_end required.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Tutors are always scoped to themselves. Owners can pass tutor_user_id to
  // slice the view; otherwise they see every tutor's unbilled work.
  const tutorFilterRaw = typeof req.query.tutor_user_id === 'string' ? req.query.tutor_user_id : '';
  const tutorUserId = membership.role === 'tutor'
    ? userData.user.id
    : (tutorFilterRaw || null);

  try {
    const sessions = await getUnbilledSessions(admin, {
      organizationId: membership.organization_id,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      tutorUserId,
    });
    const groups = await groupSessionsByHousehold(admin, sessions);
    return res.status(200).json({
      groups,
      totals: {
        households: groups.filter((g) => !g.is_ungrouped).length,
        sessions: groups.reduce((a, g) => a + g.session_count, 0),
        total_cents: groups.reduce((a, g) => a + g.total_cents, 0),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Failed to compute unbilled sessions.' });
  }
}
