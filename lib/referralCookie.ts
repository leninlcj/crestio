// Thin wrapper around document.cookie for the referral capture flow. Cookie
// is read+written on the client (httpOnly=false) so the signup page can pick
// it up. SameSite=Lax so it survives the signup redirect but doesn't leak
// cross-site.

export const REFERRAL_COOKIE_NAME = 'crestio_ref';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function readReferralCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${REFERRAL_COOKIE_NAME}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeReferralCookie(code: string): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(code)}` +
    `; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearReferralCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${REFERRAL_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
