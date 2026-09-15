/**
 * Platform submission ceilings from Auth System Settings + Redis hourly counters.
 * Falls back to MongoDB rolling 1h counts when Redis is unavailable.
 */
import axios from "axios";
import redis from "../config/redis.config";
import { serverConfig } from "../config";
import {
  BadRequestError,
  ForbiddenError,
  TooManyRequestsError,
} from "./errors/app.error";
import { SUBMISSION_MESSAGES } from "./constants";
import logger from "../config/logger.config";

export type SubmissionLimitSource = "run" | "submit";

export type PlatformSubmissionLimits = {
  maxSubmissionsPerHour: number;
  maxRunPerHour: number;
  maxCodeLength: number;
  concurrentSubmissionCap: number;
  allowAdminBypass: boolean;
  requireEmailVerification: boolean;
};

const DEFAULT_LIMITS: PlatformSubmissionLimits = {
  maxSubmissionsPerHour: 60,
  maxRunPerHour: 120,
  maxCodeLength: 64_000,
  concurrentSubmissionCap: 3,
  allowAdminBypass: true,
  requireEmailVerification: false,
};

let cache: { limits: PlatformSubmissionLimits; fetchedAt: number } | null =
  null;
const TTL_MS = 15_000;

function asPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function normalize(data: any): PlatformSubmissionLimits {
  return {
    maxSubmissionsPerHour: asPositiveInt(
      data?.maxSubmissionsPerHour,
      DEFAULT_LIMITS.maxSubmissionsPerHour
    ),
    maxRunPerHour: asPositiveInt(
      data?.maxRunPerHour,
      DEFAULT_LIMITS.maxRunPerHour
    ),
    maxCodeLength: asPositiveInt(
      data?.maxCodeLength,
      DEFAULT_LIMITS.maxCodeLength
    ),
    concurrentSubmissionCap: asPositiveInt(
      data?.concurrentSubmissionCap,
      DEFAULT_LIMITS.concurrentSubmissionCap
    ),
    allowAdminBypass: Boolean(
      data?.allowAdminBypass ?? DEFAULT_LIMITS.allowAdminBypass
    ),
    requireEmailVerification: Boolean(data?.requireEmailVerification),
  };
}

export async function getPlatformSubmissionLimits(
  authServiceUrl = serverConfig.AUTH_SERVICE_URL
): Promise<PlatformSubmissionLimits> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.limits;
  }
  try {
    const base = authServiceUrl.replace(/\/$/, "");
    const res = await axios.get(`${base}/api/v1/auth/public/settings`, {
      timeout: 4000,
    });
    const data = res.data?.data ?? res.data;
    const limits = normalize(data);
    cache = { limits, fetchedAt: now };
    return limits;
  } catch {
    if (cache) return cache.limits;
    return { ...DEFAULT_LIMITS };
  }
}

/** Test helper — clears in-memory settings cache. */
export function clearPlatformLimitsCache(): void {
  cache = null;
}

function hourBucket(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}${m}${day}${h}`;
}

function secondsUntilNextUtcHour(ts = Date.now()): number {
  const d = new Date(ts);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours() + 1,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((next - ts) / 1000));
}

function rateLimitError(source: SubmissionLimitSource, limit: number) {
  return new TooManyRequestsError(
    source === "run"
      ? SUBMISSION_MESSAGES.RUN_RATE_LIMIT
      : SUBMISSION_MESSAGES.SUBMIT_RATE_LIMIT,
    { limit, window: "hour", source }
  );
}

/**
 * Fixed UTC-hour window counter via Upstash Redis.
 * Returns false if Redis could not be used (caller should use DB fallback).
 */
export async function consumeHourlyQuota(params: {
  userId: string;
  source: SubmissionLimitSource;
  limit: number;
}): Promise<"ok" | "limited" | "unavailable"> {
  const { userId, source, limit } = params;
  if (limit < 1) return "ok";

  const key = `sublimit:${source}:${userId}:${hourBucket()}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, secondsUntilNextUtcHour());
    }
    if (count > limit) {
      try {
        await redis.decr(key);
      } catch {
        /* ignore */
      }
      return "limited";
    }
    return "ok";
  } catch (err) {
    logger.warn("[SubmissionLimits] Redis quota check failed; using DB fallback", {
      error: (err as Error)?.message,
      userId,
      source,
    });
    return "unavailable";
  }
}

export function assertCodeLength(code: string, maxCodeLength: number): void {
  if (code.length > maxCodeLength) {
    throw new BadRequestError(SUBMISSION_MESSAGES.CODE_TOO_LONG, {
      maxCodeLength,
      length: code.length,
    });
  }
}

export function isStaffRole(role?: string): boolean {
  return (
    role === "admin" ||
    role === "super_admin" ||
    role === "moderator" ||
    role === "content_manager"
  );
}

export async function enforceSubmissionLimits(params: {
  userId: string;
  code: string;
  source: SubmissionLimitSource;
  role?: string;
  concurrentActive: number;
  /** Rolling 1h count from DB (used when Redis unavailable, or always as secondary). */
  hourlyCount: number;
  isEmailVerified?: boolean;
}): Promise<void> {
  const limits = await getPlatformSubmissionLimits();

  if (
    limits.requireEmailVerification &&
    !(limits.allowAdminBypass && isStaffRole(params.role)) &&
    params.isEmailVerified !== true
  ) {
    throw new ForbiddenError(
      "Email verification is required before submitting code."
    );
  }

  if (limits.allowAdminBypass && isStaffRole(params.role)) {
    assertCodeLength(params.code, limits.maxCodeLength);
    return;
  }

  assertCodeLength(params.code, limits.maxCodeLength);

  const hourlyLimit =
    params.source === "submit"
      ? limits.maxSubmissionsPerHour
      : limits.maxRunPerHour;

  if (params.source === "submit") {
    if (params.concurrentActive >= limits.concurrentSubmissionCap) {
      throw new TooManyRequestsError(SUBMISSION_MESSAGES.CONCURRENT_CAP, {
        limit: limits.concurrentSubmissionCap,
        active: params.concurrentActive,
      });
    }
  }

  // Mongo rolling hour is authoritative when already at/over the ceiling.
  if (params.hourlyCount >= hourlyLimit) {
    throw rateLimitError(params.source, hourlyLimit);
  }

  // Redis adds atomic protection against concurrent requests in the same window.
  const redisResult = await consumeHourlyQuota({
    userId: params.userId,
    source: params.source,
    limit: hourlyLimit,
  });

  if (redisResult === "limited") {
    throw rateLimitError(params.source, hourlyLimit);
  }
}
