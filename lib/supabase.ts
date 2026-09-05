import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Fallback values let `createClient` succeed during `next build` even if the
// deployment platform hasn't injected real env vars yet. At runtime with real
// env vars set, everything works; without them, calls fail at request time
// with a clear Supabase error rather than crashing the build.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (typeof window !== 'undefined') {
    // Browser only; build-time logging adds noise.
    console.warn('[crestio] Supabase env vars missing, auth and data will fail until set.');
  }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export const supabase = getSupabase();
