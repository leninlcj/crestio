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

// Convenience wrapper for rate-limited endpoints.
export const LIMITS = {
  polish: { limit: 30, windowMs: 60 * 60 * 1000 },
  lessonPlan: { limit: 20, windowMs: 60 * 60 * 1000 },
  assistant: { limit: 60, windowMs: 60 * 60 * 1000 },
  support_submit: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  owner_admin: { limit: 30, windowMs: 60 * 1000 },
} as const;
