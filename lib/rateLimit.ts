// Simple per-user per-endpoint in-memory rate limiter.
// Not distributed — resets per Vercel function cold start. Good enough for
// soft-capping Anthropic-backed routes until usage grows enough to warrant
// Upstash Redis.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retry_after_seconds: number };

export function checkRateLimit(opts: {
  key: string;        // e.g. `${endpoint}:${userId}`
  limit: number;      // max calls per window
  windowMs: number;   // window length in ms
}): RateLimitResult {
  const { key, limit, windowMs } = opts;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retry_after_seconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

// Shared limiter for the public forms. Counts in Postgres through the
// rate_limit_hit() function (supabase/migrations/20260906_agency_chunk5.sql),
// so every Vercel instance sees the same count. Falls back to the in-memory
// limiter above when the function is missing or the database call fails, so
// a form is never blocked by the limiter's own outage.
export type SharedRateLimitClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function checkRateLimitShared(
  client: SharedRateLimitClient | null,
  opts: { key: string; limit: number; windowMs: number },
): Promise<RateLimitResult & { shared: boolean }> {
  if (client) {
    try {
      const { data, error } = await client.rpc('rate_limit_hit', {
        p_key: opts.key,
        p_limit: opts.limit,
        p_window_seconds: Math.max(1, Math.round(opts.windowMs / 1000)),
      });
      if (!error && data && typeof data === 'object') {
        const d = data as { allowed?: boolean; retry_after_seconds?: number; remaining?: number; reset_at?: string };
        if (d.allowed === false) {
          return { allowed: false, retry_after_seconds: Math.max(1, Number(d.retry_after_seconds ?? 60)), shared: true };
        }
        if (d.allowed === true) {
          return { allowed: true, remaining: Number(d.remaining ?? 0), resetAt: d.reset_at ? new Date(d.reset_at).getTime() : Date.now() + opts.windowMs, shared: true };
        }
      }
      if (error && !/rate_limit_hit|function|schema cache|does not exist/i.test(error.message)) {
        console.warn('[rateLimit] shared limiter error, using memory:', error.message);
      }
    } catch (e: any) {
      console.warn('[rateLimit] shared limiter threw, using memory:', e?.message ?? e);
    }
  }
  return { ...checkRateLimit(opts), shared: false };
}

// Convenience wrapper for rate-limited endpoints.
export const LIMITS = {
  polish: { limit: 30, windowMs: 60 * 60 * 1000 },
  lessonPlan: { limit: 20, windowMs: 60 * 60 * 1000 },
  assistant: { limit: 60, windowMs: 60 * 60 * 1000 },
  support_submit: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  owner_admin: { limit: 30, windowMs: 60 * 1000 },
  files_upload: { limit: 30, windowMs: 60 * 60 * 1000 },
  files_view_url: { limit: 600, windowMs: 60 * 60 * 1000 },
  // Public agency forms, keyed by IP.
  enquiry:           { limit: 5,  windowMs: 60 * 60 * 1000 },
  tutor_application: { limit: 3,  windowMs: 60 * 60 * 1000 },
} as const;
