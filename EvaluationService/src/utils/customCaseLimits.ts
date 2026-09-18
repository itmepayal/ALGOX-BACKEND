/**
 * Custom test-case limits on the RUN path only.
 * Free: custom cases blocked. Premium (premium.code_analysis): capped hourly.
 * Does not change Docker sandbox / submit path (official suite only).
 */
import redis from "../config/redis.config";
import {
  resolveEntitlements,
  hasFeature,
} from "./entitlementClient";
import { ForbiddenError, TooManyRequestsError } from "./errors/app.error";
import logger from "../config/logger.config";

const FEATURE = "premium.code_analysis";
/** Max custom-case RUN executions per UTC hour for premium users */
export const PREMIUM_CUSTOM_RUNS_PER_HOUR = 40;

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

export async function enforceCustomCaseRunAccess(params: {
  authorization?: string | null;
  isCustomCase: boolean;
  userId: string;
}): Promise<{ premium: boolean; customAllowed: boolean }> {
  if (!params.isCustomCase) {
    return { premium: false, customAllowed: true };
  }

  const snap = await resolveEntitlements(params.authorization);
  const premium = hasFeature(snap, FEATURE);
  if (!premium) {
    throw new ForbiddenError(
      "Custom test cases require premium.code_analysis",
      { feature: FEATURE, code: "PREMIUM_REQUIRED" }
    );
  }

  const key = `sublimit:customrun:${params.userId}:${hourBucket()}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, secondsUntilNextUtcHour());
    }
    if (count > PREMIUM_CUSTOM_RUNS_PER_HOUR) {
      try {
        await redis.decr(key);
      } catch {
        /* ignore */
      }
      throw new TooManyRequestsError("Custom test-case run limit exceeded", {
        limit: PREMIUM_CUSTOM_RUNS_PER_HOUR,
        window: "hour",
        source: "custom_run",
      });
    }
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof TooManyRequestsError) {
      throw err;
    }
    logger.warn("[CustomRunLimits] Redis check failed; allowing premium custom run", {
      error: (err as Error)?.message,
      userId: params.userId,
    });
  }

  return { premium: true, customAllowed: true };
}
