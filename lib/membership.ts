import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'owner' | 'tutor';

export type Membership = {
  organization_id: string;
  user_id: string;
  role: Role;
  tutor_id: string | null;
};

export async function getCurrentMembership(): Promise<Membership | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const userId = session.user.id;

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) return null;

  let tutor_id: string | null = null;
  if (membership.role === 'tutor') {
    const { data: tutor } = await supabase
      .from('tutors')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();
    tutor_id = tutor?.id ?? null;
  }

  return {
    organization_id: membership.organization_id,
    user_id: userId,
    role: membership.role as Role,
    tutor_id,
  };
}

export async function getMembershipForUser(
  client: SupabaseClient,
  userId: string
): Promise<Membership | null> {
  const { data: membership } = await client
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) return null;

  let tutor_id: string | null = null;
  if (membership.role === 'tutor') {
    const { data: tutor } = await client
      .from('tutors')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();
    tutor_id = tutor?.id ?? null;
  }

  return {
    organization_id: membership.organization_id,
    user_id: userId,
    role: membership.role as Role,
    tutor_id,
  };
}
