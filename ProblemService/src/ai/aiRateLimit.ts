/**
 * AI burst rate limit (process-local fixed window).
 * Daily quota is enforced separately via atomic Mongo increments.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export async function checkAiRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec: number; remaining: number }> {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  b.count += 1;
  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    remaining: Math.max(0, max - b.count),
  };
}

/** Sync wrapper for unit selftests that expect immediate results. */
export function checkAiRateLimitSync(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  b.count += 1;
  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    remaining: Math.max(0, max - b.count),
  };
}

/** Test helper */
export function _resetAiRateLimitForTests() {
  buckets.clear();
}
