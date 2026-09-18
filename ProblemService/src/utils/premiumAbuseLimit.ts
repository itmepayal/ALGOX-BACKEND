/**
 * Lightweight process-local rate limit for premium contest / revision endpoints.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkPremiumAbuseLimit(
  key: string,
  max = 20,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 1, resetAt: now + windowMs };
    buckets.set(key, b);
    return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }
  if (b.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

export function _resetPremiumAbuseLimitForTests() {
  buckets.clear();
}
