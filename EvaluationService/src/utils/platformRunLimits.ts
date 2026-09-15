/**
 * Run-path ceilings from Auth public settings + Redis hourly counters.
 * Mirrors SubmissionService keys (`sublimit:run:`) so quotas stay consistent.
 */
import axios from "axios";
import redis from "../config/redis.config";
import { serverConfig } from "../config";
import { BadRequestError, TooManyRequestsError } from "./errors/app.error";
import logger from "../config/logger.config";

type PlatformRunLimits = {
  maxRunPerHour: number;
  maxCodeLength: number;
  allowAdminBypass: boolean;
};

const DEFAULT_LIMITS: PlatformRunLimits = {
  maxRunPerHour: 120,
  maxCodeLength: 64_000,
  allowAdminBypass: true,
};

let cache: { limits: PlatformRunLimits; fetchedAt: number } | null = null;
const TTL_MS = 15_000;

function asPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

async function getPlatformRunLimits(): Promise<PlatformRunLimits> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.limits;
  try {
    const base = String(serverConfig.AUTH_SERVICE_URL || "http://localhost:3001").replace(
      /\/$/,
      ""
    );
    const res = await axios.get(`${base}/api/v1/auth/public/settings`, {
      timeout: 4000,
    });
    const data = res.data?.data ?? res.data;
    const limits: PlatformRunLimits = {
      maxRunPerHour: asPositiveInt(data?.maxRunPerHour, DEFAULT_LIMITS.maxRunPerHour),
      maxCodeLength: asPositiveInt(data?.maxCodeLength, DEFAULT_LIMITS.maxCodeLength),
      allowAdminBypass: Boolean(
        data?.allowAdminBypass ?? DEFAULT_LIMITS.allowAdminBypass
      ),
    };
    cache = { limits, fetchedAt: now };
    return limits;
  } catch {
    if (cache) return cache.limits;
    return { ...DEFAULT_LIMITS };
  }
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

function isStaffRole(role?: string): boolean {
  return (
    role === "admin" ||
    role === "super_admin" ||
    role === "moderator" ||
    role === "content_manager"
  );
}

export async function enforceRunLimits(params: {
  userId: string;
  code: string;
  role?: string;
}): Promise<void> {
  const limits = await getPlatformRunLimits();

  if (params.code.length > limits.maxCodeLength) {
    throw new BadRequestError("Code exceeds maximum allowed length", {
      maxCodeLength: limits.maxCodeLength,
      length: params.code.length,
    });
  }

  if (limits.allowAdminBypass && isStaffRole(params.role)) return;

  const key = `sublimit:run:${params.userId}:${hourBucket()}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, secondsUntilNextUtcHour());
    }
    if (count > limits.maxRunPerHour) {
      try {
        await redis.decr(key);
      } catch {
        /* ignore */
      }
      throw new TooManyRequestsError("Run rate limit exceeded", {
        limit: limits.maxRunPerHour,
        window: "hour",
        source: "run",
      });
    }
  } catch (err) {
    if (err instanceof TooManyRequestsError || err instanceof BadRequestError) {
      throw err;
    }
    logger.warn("[RunLimits] Redis quota check failed; allowing request", {
      error: (err as Error)?.message,
      userId: params.userId,
    });
  }
}
