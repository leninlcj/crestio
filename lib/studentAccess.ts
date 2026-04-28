import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
export { ageInYears } from './ageInYears';

// Helpers shared by the student-portal access API routes.
//
// Token TTL — invitations expire 14 days after issue.  Parent consent tokens
// don't expire (they sit waiting until the parent acts), but if the tutor
// re-sends the consent request a fresh token is generated.

export const INVITATION_TTL_DAYS = 14;
export const STUDENT_ROLE_CLAIM = 'student';

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export type StudentSummary = {
  id: string;
  organization_id: string;
  name: string;
  date_of_birth: string | null;
  household_id: string | null;
};

export async function loadStudentForOrg(
  admin: SupabaseClient,
  studentId: string,
  organizationId: string,
): Promise<StudentSummary | null> {
  const { data } = await admin
    .from('students')
    .select('id, organization_id, name, date_of_birth, household_id')
    .eq('id', studentId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  return (data as StudentSummary) ?? null;
}

export async function loadFirstParent(
  admin: SupabaseClient,
  studentId: string,
): Promise<{ id: string; name: string | null; email: string | null; auth_user_id: string | null } | null> {
  // Prefer parents linked via parent_student_links.
  const { data: links } = await admin
    .from('parent_student_links')
    .select('parent:parents(id, name, email, auth_user_id)')
    .eq('student_id', studentId)
    .is('revoked_at', null)
    .limit(1);
  const linked = (links?.[0] as any)?.parent;
  if (linked) return linked;

  // Fall back: legacy parent_email field on the student.
  const { data: stu } = await admin
    .from('students')
    .select('parent_name, parent_email')
    .eq('id', studentId)
    .maybeSingle();
  if (stu?.parent_email) {
    return { id: '', name: stu.parent_name ?? null, email: stu.parent_email, auth_user_id: null };
  }
  return null;
}

export async function loadOrgBranding(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ name: string; brandColor: string | null; ownerEmail: string | null }> {
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, brand_color, owner_user_id')
    .eq('id', organizationId)
    .maybeSingle();

  let ownerEmail: string | null = null;
  if (org?.owner_user_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('email')
      .eq('id', org.owner_user_id)
      .maybeSingle();
    ownerEmail = profile?.email ?? null;
  }

  return {
    name: org?.name ?? 'Your tutor',
    brandColor: org?.brand_color ?? null,
    ownerEmail,
  };
}

export function originFor(req: { headers: { host?: string; 'x-forwarded-host'?: string; 'x-forwarded-proto'?: string } }): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'crestio.ai';
  return `${proto}://${host}`;
}

export function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  return full.trim().split(/\s+/)[0] || 'there';
}
