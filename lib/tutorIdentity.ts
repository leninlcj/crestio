import type { SupabaseClient } from '@supabase/supabase-js';

// Find the tutors row for a signed-in tutor. Prefers auth_user_id; falls back
// to the profile email within the org and links the row when found, because
// the production signup trigger does not always set auth_user_id.
export async function findOrLinkTutorRow(admin: SupabaseClient, args: { userId: string; email: string | null; organizationId: string }) {
  const { userId, email, organizationId } = args;
  const { data: byUser } = await admin
    .from('tutors').select('*').eq('organization_id', organizationId).eq('auth_user_id', userId).maybeSingle();
  if (byUser) return { tutor: byUser, linked: false };
  if (!email) return { tutor: null, linked: false };
  const { data: byEmail } = await admin
    .from('tutors').select('*').eq('organization_id', organizationId).ilike('email', email).is('auth_user_id', null)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!byEmail) return { tutor: null, linked: false };
  const { data: updated } = await admin
    .from('tutors').update({ auth_user_id: userId }).eq('id', byEmail.id).select('*').maybeSingle();
  return { tutor: updated ?? { ...byEmail, auth_user_id: userId }, linked: true };
}
