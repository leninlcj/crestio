import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('accept-invitation: server env missing');
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (req.method === 'GET') {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      return res.status(400).json({ valid: false, reason: 'missing', error: 'Missing token.' });
    }
    const { data: invitation } = await admin
      .from('parent_invitations')
      .select('email, student_id, tutor_user_id, accepted_at, expires_at')
      .eq('token', token)
      .single();
    if (!invitation) {
      // Token doesn't match any invitation row.
      return res.status(404).json({ valid: false, reason: 'not_found', error: 'Invitation not found.' });
    }
    if (invitation.accepted_at) {
      return res.status(400).json({ valid: false, reason: 'used', error: 'This invitation has already been used.' });
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ valid: false, reason: 'expired', error: 'This invitation has expired.' });
    }
    const { data: student } = await admin
      .from('students')
      .select('name')
      .eq('id', invitation.student_id)
      .single();
    const { data: tutorOrg } = await admin
      .from('organizations')
      .select('name')
      .eq('owner_user_id', invitation.tutor_user_id)
      .maybeSingle();
    const { data: tutorProfile } = await admin
      .from('profiles')
      .select('owner_name')
      .eq('id', invitation.tutor_user_id)
      .maybeSingle();
    return res.status(200).json({
      valid: true,
      email: invitation.email,
      studentName: student?.name ?? 'your child',
      tutorBusinessName: tutorOrg?.name ?? tutorProfile?.owner_name ?? 'Your tutor',
    });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const { data: invitation, error: invErr } = await admin
      .from('parent_invitations')
      .select('id, email, student_id, tutor_user_id, accepted_at, expires_at')
      .eq('token', token)
      .single();
    if (invErr || !invitation) {
      return res.status(404).json({ error: 'Invitation not found.' });
    }
    if (invitation.accepted_at) {
      return res.status(400).json({ error: 'This invitation has already been used.' });
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This invitation has expired.' });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      console.error('accept-invitation: createUser failed', createErr);
      const msg = createErr?.message ?? 'Could not create account.';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        return res.status(409).json({
          error: 'An account with this email already exists. Sign in at /parent/signin and it will be linked automatically, or contact your tutor.',
        });
      }
      return res.status(500).json({ error: msg });
    }
    const authUserId = created.user.id;

    const { data: parentRow, error: parentErr } = await admin
      .from('parents')
      .insert({
        auth_user_id: authUserId,
        email: invitation.email,
        name: name || null,
      })
      .select('id')
      .single();
    if (parentErr || !parentRow) {
      console.error('accept-invitation: parents insert failed', parentErr);
      // Try to clean up the auth user we just created so the email can retry.
      try { await admin.auth.admin.deleteUser(authUserId); } catch {}
      return res.status(500).json({ error: parentErr?.message ?? 'Could not create parent record.' });
    }

    // Resolve the organization that owns this invitation, so the new link
    // gets the same organization_id.
    const { data: inviterOrg } = await admin
      .from('organizations')
      .select('id')
      .eq('owner_user_id', invitation.tutor_user_id)
      .single();
    if (!inviterOrg) {
      console.error('accept-invitation: could not resolve organization for inviter', invitation.tutor_user_id);
      try { await admin.from('parents').delete().eq('id', parentRow.id); } catch {}
      try { await admin.auth.admin.deleteUser(authUserId); } catch {}
      return res.status(500).json({ error: 'Could not resolve tutor organization.' });
    }

    const { error: linkErr } = await admin
      .from('parent_student_links')
      .insert({
        parent_id: parentRow.id,
        student_id: invitation.student_id,
        tutor_user_id: invitation.tutor_user_id,
        organization_id: inviterOrg.id,
      });
    if (linkErr) {
      console.error('accept-invitation: link insert failed', linkErr);
      try { await admin.from('parents').delete().eq('id', parentRow.id); } catch {}
      try { await admin.auth.admin.deleteUser(authUserId); } catch {}
      return res.status(500).json({ error: linkErr.message });
    }

    await admin
      .from('parent_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
