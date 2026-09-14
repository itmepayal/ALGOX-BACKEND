/**
 * HTTP rate limit for admin mutation routes.
 * Reuses the fixed-window bucket pattern from RealtimeService socket rateLimit.
 */
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.middleware";

export interface RateLimitOptions {
  /** Max requests in the window */
  max: number;
  /** Window length in ms */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const DEFAULTS: RateLimitOptions = {
  max: Number(process.env.ADMIN_MUTATION_RATE_MAX) || 60,
  windowMs: Number(process.env.ADMIN_MUTATION_RATE_WINDOW_MS) || 60_000,
};

/**
 * Fixed-window counter. Returns true if allowed; false if limited.
 * Same algorithm as RealtimeService `checkSocketRateLimit`.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions = DEFAULTS
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
    return true;
  }

  if (bucket.count >= opts.max) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/** Test helper */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Rate-limit admin mutating methods (POST/PUT/PATCH/DELETE).
 * Keyed by authenticated userId (falls back to IP).
 */
export function adminMutationRateLimit(opts: RateLimitOptions = DEFAULTS) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!MUTATING.has(req.method)) {
      next();
      return;
    }

    const userId = (req as AuthenticatedRequest).user?.userId;
    const key = `admin-mut:${userId || req.ip || "anon"}`;

    if (!checkRateLimit(key, opts)) {
      const bucket = buckets.get(key);
      const retryAfterSec = bucket
        ? Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000))
        : Math.ceil(opts.windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        success: false,
        message: "Too many admin mutations; slow down",
      });
      return;
    }

    next();
  };
}
