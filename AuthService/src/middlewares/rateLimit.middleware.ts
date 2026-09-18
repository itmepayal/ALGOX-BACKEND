/**
 * HTTP rate limit for admin mutation routes and sensitive auth routes.
 * Sensitive auth limits use Redis (shared across AuthService instances)
 * with a process-local Map fallback if Redis is unreachable.
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.middleware";
import redis from "../config/redis.config";
import { COOKIE_NAME } from "../utils/constants";

export interface RateLimitOptions {
  /** Max requests in the window */
  max: number;
  /** Window length in ms */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (best-effort). */
  retryAfterSec: number;
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

/** Stricter defaults for login / signup / 2fa / reset-password (vs admin 60/min). */
const AUTH_SENSITIVE_DEFAULTS: RateLimitOptions = {
  max: Number(process.env.AUTH_SENSITIVE_RATE_MAX) || 10,
  windowMs: Number(process.env.AUTH_SENSITIVE_RATE_WINDOW_MS) || 60_000,
};

/** Optional refresh-specific overrides (falls back to AUTH_SENSITIVE_*). */
const AUTH_REFRESH_DEFAULTS: RateLimitOptions = {
  max:
    Number(process.env.AUTH_REFRESH_RATE_MAX) ||
    Number(process.env.AUTH_SENSITIVE_RATE_MAX) ||
    30,
  windowMs:
    Number(process.env.AUTH_REFRESH_RATE_WINDOW_MS) ||
    Number(process.env.AUTH_SENSITIVE_RATE_WINDOW_MS) ||
    60_000,
};

/**
 * Fixed-window counter (process-local). Returns true if allowed; false if limited.
 * Used as Redis fallback and by sync unit checks.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions = DEFAULTS
): boolean {
  return checkRateLimitLocal(key, opts).allowed;
}

function checkRateLimitLocal(
  key: string,
  opts: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
    return {
      allowed: true,
      retryAfterSec: Math.max(1, Math.ceil(opts.windowMs / 1000)),
    };
  }

  if (bucket.count >= opts.max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000)
      ),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/**
 * Atomic fixed-window: INCR + PEXPIRE only on first hit (Lua).
 * Keys expire so Redis state stays bounded.
 */
const INCR_WITH_PEXPIRE_LUA = `
local c = redis.call("INCR", KEYS[1])
if c == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { c, ttl }
`;

function redisRateLimitKey(logicalKey: string): string {
  // Stable, namespaced key — avoids collisions with OTP / feature-flag keys.
  return `auth:rl:v1:${logicalKey}`;
}

/**
 * Distributed rate limit via existing Auth Redis (Upstash).
 * Falls back to process-local Map only if Redis errors.
 */
export async function checkRateLimitAsync(
  key: string,
  opts: RateLimitOptions = DEFAULTS
): Promise<RateLimitResult> {
  const redisKey = redisRateLimitKey(key);
  try {
    const raw = (await redis.eval(
      INCR_WITH_PEXPIRE_LUA,
      [redisKey],
      [String(opts.windowMs)]
    )) as [number | string, number | string] | number;

    let count: number;
    let pttl: number;
    if (Array.isArray(raw)) {
      count = Number(raw[0]);
      pttl = Number(raw[1]);
    } else {
      // Defensive: older eval shapes
      count = Number(raw);
      pttl = await redis.pttl(redisKey);
    }

    if (!Number.isFinite(count) || count < 1) {
      return checkRateLimitLocal(key, opts);
    }

    // If TTL missing (should not happen after Lua), re-apply expire.
    if (!Number.isFinite(pttl) || pttl < 0) {
      await redis.pexpire(redisKey, opts.windowMs);
      pttl = opts.windowMs;
    }

    const retryAfterSec = Math.max(1, Math.ceil(pttl / 1000));
    return {
      allowed: count <= opts.max,
      retryAfterSec,
    };
  } catch {
    return checkRateLimitLocal(key, opts);
  }
}

/** Test helper — clears process-local buckets only. */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}

function sendRateLimited(
  res: Response,
  result: RateLimitResult,
  message: string
): void {
  res.setHeader("Retry-After", String(result.retryAfterSec));
  res.status(429).json({
    success: false,
    message,
  });
}

function clientIp(req: Request): string {
  return String(req.ip || req.socket?.remoteAddress || "anon");
}

/**
 * Opaque fingerprint of a presented refresh token (cookie or body).
 * Returns null when absent — never reveals validity; never stores raw token.
 */
function refreshTokenFingerprint(req: Request): string | null {
  const fromCookie =
    typeof req.cookies?.[COOKIE_NAME] === "string"
      ? req.cookies[COOKIE_NAME]
      : "";
  const fromBody =
    typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
  const token = String(fromCookie || fromBody || "").trim();
  if (!token) return null;
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Rate-limit admin mutating methods (POST/PUT/PATCH/DELETE).
 * Keyed by authenticated userId (falls back to IP).
 */
export function adminMutationRateLimit(opts: RateLimitOptions = DEFAULTS) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!MUTATING.has(req.method)) {
      next();
      return;
    }

    const userId = (req as AuthenticatedRequest).user?.userId;
    const key = `admin-mut:${userId || req.ip || "anon"}`;

    const result = await checkRateLimitAsync(key, opts);
    if (!result.allowed) {
      sendRateLimited(res, result, "Too many admin mutations; slow down");
      return;
    }

    next();
  };
}

export type AuthSensitiveAction =
  | "login"
  | "signup"
  | "forgot-password"
  | "login-2fa"
  | "reset-password"
  | "refresh";

/** Billing / subscription mutation limits (authenticated). */
const BILLING_MUTATION_DEFAULTS: RateLimitOptions = {
  max: Number(process.env.BILLING_MUTATION_RATE_MAX) || 8,
  windowMs: Number(process.env.BILLING_MUTATION_RATE_WINDOW_MS) || 60_000,
};

const ENTITLEMENT_READ_DEFAULTS: RateLimitOptions = {
  max: Number(process.env.ENTITLEMENT_READ_RATE_MAX) || 60,
  windowMs: Number(process.env.ENTITLEMENT_READ_RATE_WINDOW_MS) || 60_000,
};

export type BillingMutationAction =
  | "checkout"
  | "cancel"
  | "resume"
  | "subscription-read";

/**
 * Rate-limit Premium billing mutations (checkout / cancel / resume).
 * Keyed by authenticated userId + IP to slow brute-force and session sharing spam.
 */
export function billingMutationRateLimit(
  action: BillingMutationAction,
  opts?: RateLimitOptions
) {
  const resolved =
    opts ||
    (action === "subscription-read"
      ? ENTITLEMENT_READ_DEFAULTS
      : BILLING_MUTATION_DEFAULTS);

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = (req as AuthenticatedRequest).user?.userId;
    const ip = clientIp(req);
    const keys = [
      `billing:${action}:u:${userId || "anon"}`,
      `billing:${action}:ip:${ip}`,
    ];

    for (const key of keys) {
      const result = await checkRateLimitAsync(key, resolved);
      if (!result.allowed) {
        sendRateLimited(
          res,
          result,
          "Too many subscription requests; slow down"
        );
        return;
      }
    }

    next();
  };
}

/**
 * Stricter IP-keyed limit for sensitive unauthenticated auth routes.
 * Shared across AuthService instances via Redis.
 *
 * For `refresh`: always limit by IP; when a token string is presented,
 * also limit by SHA-256 fingerprint (does not imply the token is valid).
 */
export function authSensitiveRateLimit(
  action: AuthSensitiveAction,
  opts?: RateLimitOptions
) {
  const resolved =
    opts ||
    (action === "refresh" ? AUTH_REFRESH_DEFAULTS : AUTH_SENSITIVE_DEFAULTS);

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const ip = clientIp(req);
    const keys = [`auth:${action}:${ip}`];

    if (action === "refresh") {
      const fp = refreshTokenFingerprint(req);
      if (fp) {
        keys.push(`auth:refresh:tok:${fp}`);
      }
    }

    for (const key of keys) {
      const result = await checkRateLimitAsync(key, resolved);
      if (!result.allowed) {
        sendRateLimited(res, result, "Too many requests; slow down");
        return;
      }
    }

    next();
  };
}
