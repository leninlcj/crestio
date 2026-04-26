import { supabase } from './supabase';

// Returns the right signin path for the current page. Parents land back on the
// parent signin (P1-4.4); everyone else gets the tutor signin.
function signinPathForCurrentLocation(): string {
  if (typeof window === 'undefined') return '/auth/signin?reason=session_expired';
  return window.location.pathname.startsWith('/parent')
    ? '/parent/signin?reason=session_expired'
    : '/auth/signin?reason=session_expired';
}

function alreadyOnSigninPage(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.startsWith('/auth/signin') ||
    window.location.pathname.startsWith('/parent/signin')
  );
}

/**
 * Fetch wrapper that:
 *   - Attaches the current Supabase access token as Bearer auth.
 *   - Detects 401 responses from /api/* routes and redirects the user to the
 *     appropriate signin page (parent vs tutor) with reason=session_expired.
 *
 * Use for any authenticated API call from the client. Server-to-server calls
 * (never from browser) don't need this.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers ?? {});
  if (session?.access_token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && typeof window !== 'undefined') {
    const pathname = typeof input === 'string' ? input : (input as URL).pathname || '';
    if (pathname.startsWith('/api/')) {
      if (!alreadyOnSigninPage()) {
        window.location.href = signinPathForCurrentLocation();
      }
    }
  }
  return res;
}

/**
 * Translate a Supabase-js error into a session-expiry redirect if appropriate.
 * Call this in a catch after a direct `supabase.from('...').select/insert(...)`
 * call. Returns true if it redirected; the caller should return early.
 */
export function isJwtExpiryError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as any;
  const code = anyErr.code ?? '';
  const message = (anyErr.message ?? '').toLowerCase();
  if (code === 'PGRST301') return true;
  if (code === '401') return true;
  if (typeof message === 'string' && (message.includes('jwt expired') || message.includes('invalid jwt'))) {
    return true;
  }
  return false;
}

export function redirectToSignin(): void {
  if (typeof window === 'undefined') return;
  if (alreadyOnSigninPage()) return;
  window.location.href = signinPathForCurrentLocation();
}
