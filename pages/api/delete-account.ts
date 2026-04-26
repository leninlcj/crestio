import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    console.error('delete-account: Supabase env vars missing', {
      hasUrl: !!url,
      hasAnon: !!anonKey,
      hasServiceRole: !!serviceKey,
    });
    return res.status(500).json({
      error: 'Server misconfigured: Supabase env vars are missing. Contact support@crestio.ai.',
    });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) {
    console.error('delete-account: auth verification failed', authErr);
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const steps: Array<{ name: string; table: 'lesson_plans' | 'invoices' | 'sessions' | 'students' | 'tutors' | 'profiles' | 'organizations'; column: 'owner_id' | 'id' | 'owner_user_id' }> = [
    { name: 'lesson_plans',  table: 'lesson_plans',  column: 'owner_id' },
    { name: 'invoices',      table: 'invoices',      column: 'owner_id' },
    { name: 'sessions',      table: 'sessions',      column: 'owner_id' },
    { name: 'students',      table: 'students',      column: 'owner_id' },
    { name: 'tutors',        table: 'tutors',        column: 'owner_id' },
    { name: 'profiles',      table: 'profiles',      column: 'id' },
    { name: 'organizations', table: 'organizations', column: 'owner_user_id' },
  ];

  for (const step of steps) {
    const { error } = await admin.from(step.table).delete().eq(step.column, userId);
    if (error) {
      console.error(`delete-account: failed at step ${step.name}`, error);
      return res.status(500).json({
        error: `Account partially deleted. Failed while removing ${step.name}: ${error.message ?? 'unknown error'}. Contact support@crestio.ai to finish deletion.`,
      });
    }
  }

  const { error: authDeleteErr } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteErr) {
    console.error('delete-account: failed to delete auth user', authDeleteErr);
    return res.status(500).json({
      error: `Your data was removed but the login record could not be deleted: ${authDeleteErr.message}. Contact support@crestio.ai.`,
    });
  }

  return res.status(200).json({ ok: true });
}
