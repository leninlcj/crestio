import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Client-side: fetch the current authenticated user's organization id.
// Looks up organization_members (covers owners AND tutors).
// Returns null if the user isn't signed in or has no membership (unexpected —
// signup trigger always creates one for owners, invitation flow for tutors).
export async function getCurrentOrganizationId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', session.user.id)
    .maybeSingle();
  return data?.organization_id ?? null;
}

// Server-side: same lookup via an auth-scoped client.
export async function getOrganizationIdForUser(
  client: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await client
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.organization_id ?? null;
}
