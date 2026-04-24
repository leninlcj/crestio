// Platform-owner identity. Hardcoded intentionally — env vars can be rotated
// by anyone with Vercel access, which weakens this check. Ownership transfers
// require a code change + deploy.
export const OWNER_EMAIL = 'leninlcj@gmail.com';

export function isPlatformOwner(userEmail: string | null | undefined): boolean {
  if (!userEmail) return false;
  return userEmail.toLowerCase().trim() === OWNER_EMAIL.toLowerCase();
}
