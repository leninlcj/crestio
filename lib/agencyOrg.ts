import type { SupabaseClient } from '@supabase/supabase-js';
import { OWNER_EMAIL } from './owner';

// The agency runs inside one organization: the one owned by the platform
// owner. Public forms (enquiries, tutor applications) attach to it so the
// existing org-scoped RLS, households, students and tutors all just work.

let cached: { id: string; name: string; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function getAgencyOrganization(admin: SupabaseClient): Promise<{ id: string; name: string } | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return { id: cached.id, name: cached.name };

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', OWNER_EMAIL)
    .maybeSingle();
  if (!profile?.id) return null;

  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name, is_test_organization, created_at')
    .eq('owner_user_id', profile.id)
    .order('created_at', { ascending: true });
  const org = (orgs ?? []).find((o: any) => !o.is_test_organization) ?? (orgs ?? [])[0];
  if (!org) return null;

  cached = { id: org.id, name: org.name ?? 'Crestio Tutoring', at: Date.now() };
  return { id: cached.id, name: cached.name };
}
